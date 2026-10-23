#!/usr/bin/env node
// Hooks de contexto del plugin orchestration (decisión 0005).
//
//   aviso         UserPromptSubmit y PostToolUse. Desde 250k tokens de contexto
//                 en la sesión principal, le pide al agente que actualice sus
//                 notas de sesión y cierre o delegue lo que tiene en curso,
//                 antes de que la compactación automática (~300k) lo corte.
//                 Repite cada 25k adicionales.
//   compactacion  SessionStart con matcher "compact". Le devuelve al agente
//                 las notas de sesión que escribió antes de compactar.
//
// Claude Code no entrega el tamaño del contexto a estos hooks: se lee del
// `usage` del último mensaje del agente en el transcript. Si algo falla, el
// hook no dice nada y la sesión sigue igual.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const PRIMER_AVISO = 250_000;
export const PASO_AVISO = 25_000;
export const COMPACTACION = 300_000;
const LIMITE_TEXTO = 9_000; // additionalContext admite hasta 10.000 caracteres
const COLA = 2 * 1024 * 1024;

// Tokens de contexto del último mensaje del agente en la sesión principal.
export function contextoActual(rutaTranscript) {
  let texto;
  try {
    const fd = fs.openSync(rutaTranscript, "r");
    try {
      const { size } = fs.fstatSync(fd);
      const inicio = Math.max(0, size - COLA);
      const buf = Buffer.alloc(size - inicio);
      fs.readSync(fd, buf, 0, buf.length, inicio);
      texto = buf.toString("utf8");
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return null;
  }
  const lineas = texto.split("\n");
  for (let i = lineas.length - 1; i >= 0; i--) {
    const l = lineas[i];
    if (!l.includes('"usage"') || !l.includes('"assistant"')) continue;
    let j;
    try { j = JSON.parse(l); } catch { continue; }
    if (j.type !== "assistant" || j.isSidechain || !j.message?.usage) continue;
    if (j.message.model === "<synthetic>") continue;
    const u = j.message.usage;
    return (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0);
  }
  return null;
}

// Nivel de aviso: 0 bajo 250k, 1 desde 250k, 2 desde 275k, etc.
export function nivelDeAviso(tokens) {
  if (tokens == null || tokens < PRIMER_AVISO) return 0;
  return 1 + Math.floor((tokens - PRIMER_AVISO) / PASO_AVISO);
}

export function textoDeAviso(tokens) {
  const k = Math.round(tokens / 1000);
  return [
    `Aviso de contexto: la sesión lleva ${k}k tokens. La compactación automática ocurre cerca de ${COMPACTACION / 1000}k y resume la conversación.`,
    "Antes de seguir:",
    "1. Actualiza tus notas de sesión (NOTAS-DE-SESION.md): correcciones y preferencias del humano, decisiones, estado y pendiente. Si aún no existen, créalas ahora.",
    "2. Termina lo que tienes en curso o delega a un subagente lo que se pueda delegar. No empieces una tarea grande nueva.",
    "3. Cuando llegues a un punto de corte, díselo al humano en una línea.",
  ].join("\n");
}

// Ruta del último archivo de notas que esta sesión escribió o editó.
const ES_NOTAS = /[\\/]handoffs[\\/]notas-[^\\/]*\.md$/i;

export function notasDeLaSesion(rutaTranscript) {
  let texto;
  try { texto = fs.readFileSync(rutaTranscript, "utf8"); } catch { return null; }
  let ultima = null;
  for (const l of texto.split("\n")) {
    if (!l.includes("notas-") || !l.includes('"tool_use"')) continue;
    let j;
    try { j = JSON.parse(l); } catch { continue; }
    if (j.type !== "assistant" || j.isSidechain) continue;
    for (const c of j.message?.content ?? []) {
      if (c.type !== "tool_use" || !["Write", "Edit"].includes(c.name)) continue;
      const ruta = c.input?.file_path;
      if (typeof ruta === "string" && ES_NOTAS.test(ruta)) ultima = ruta;
    }
  }
  return ultima;
}

export function textoTrasCompactar(rutaNotas, contenido) {
  if (!rutaNotas) {
    return [
      "La conversación se acaba de compactar. Esta sesión no tiene notas de sesión registradas.",
      "Si en el handoffs/ del meta hay notas de este trabajo (notas-<fecha>-<tema>.md), reléelas antes de seguir. Revisa también git status y el checkpoint.md pendiente en revision/, si lo hay.",
    ].join("\n");
  }
  if (contenido == null) {
    return `La conversación se acaba de compactar. Tus notas de sesión están en ${rutaNotas}, pero no se pudieron leer: ábrelas antes de seguir.`;
  }
  const recorte = contenido.length > LIMITE_TEXTO
    ? `${contenido.slice(0, LIMITE_TEXTO)}\n[… notas recortadas: léelas completas en el archivo]`
    : contenido;
  return [
    `La conversación se acaba de compactar. Estas son tus notas de sesión (${rutaNotas}). Tómalas como fuente de verdad sobre lo que el humano corrigió y decidió, y revisa git status antes de seguir.`,
    "",
    recorte,
  ].join("\n");
}

function salida(evento, texto) {
  process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: evento, additionalContext: texto } }));
}

function rutaEstado(sesion) {
  return path.join(os.homedir(), ".claude", "cache", "aviso-contexto", `${sesion.replace(/[^\w-]/g, "")}.json`);
}

export function aviso(entrada, estadoRuta = rutaEstado(entrada.session_id || "sin-sesion")) {
  if (entrada.agent_id) return null; // solo la sesión principal
  const tokens = contextoActual(entrada.transcript_path);
  const nivel = nivelDeAviso(tokens);
  let previo = 0;
  try { previo = JSON.parse(fs.readFileSync(estadoRuta, "utf8")).nivel || 0; } catch { /* sin estado */ }
  if (nivel === 0) {
    if (previo) try { fs.unlinkSync(estadoRuta); } catch { /* ya no está */ }
    return null;
  }
  if (nivel <= previo) return null;
  fs.mkdirSync(path.dirname(estadoRuta), { recursive: true });
  fs.writeFileSync(estadoRuta, JSON.stringify({ nivel }));
  return textoDeAviso(tokens);
}

export function compactacion(entrada) {
  const ruta = notasDeLaSesion(entrada.transcript_path);
  let contenido = null;
  if (ruta) try { contenido = fs.readFileSync(ruta, "utf8"); } catch { /* no se pudo leer */ }
  return textoTrasCompactar(ruta, contenido);
}

async function main(modo) {
  let crudo = "";
  process.stdin.setEncoding("utf8");
  for await (const parte of process.stdin) crudo += parte;
  const entrada = JSON.parse(crudo || "{}");
  const evento = entrada.hook_event_name;
  const texto = modo === "aviso" ? aviso(entrada) : modo === "compactacion" ? compactacion(entrada) : null;
  if (texto) salida(evento, texto);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main(process.argv[2]).catch(() => process.exit(0));
}
