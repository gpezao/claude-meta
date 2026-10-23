#!/usr/bin/env node
// Hook de equilibrio de cuota sobre la herramienta Agent (decisión 0003).
//
// Antes de cada llamada a un rol flexible (planner, implementer, debugger,
// explorer) revisa que la forma de invocarlo coincida con lo que decide
// equilibrio-cuota.mjs. Si no coincide, rechaza la llamada y le dice al
// conductor cómo invocarlo. Una línea "RUTA: forzada <motivo>" anula el rechazo.
//
// Falla abierto: ante cualquier error, entrada inesperada o dato faltante no
// imprime nada y sale con 0. Nunca pide confirmación ("ask").

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERRAMIENTAS = new Set(["Agent", "Task"]);

// Líneas del prompt sin sangría ni \r final; las vacías se descartan.
function lineas(texto) {
  return String(texto ?? "")
    .split("\n")
    .map((l) => l.replace(/^[ \t]+/, "").replace(/\r$/, ""))
    .filter((l) => l !== "");
}

// Nombre del rol: "orchestration:planner" o "planner" → "planner"; otro → null.
export function rolDe(subagentType) {
  if (typeof subagentType !== "string") return null;
  const rol = subagentType.startsWith("orchestration:") ? subagentType.slice("orchestration:".length) : subagentType;
  return rol || null;
}

// Verdadero si el rol está en las definiciones de ROLES de equilibrio-cuota.mjs y es flexible.
export function esFlexible(rol, definiciones) {
  return !!rol && Object.hasOwn(definiciones ?? {}, rol) && definiciones[rol].flexible === true;
}

// Modo con que empieza la primera línea no vacía del prompt, como lo leen los
// agentes: "directo" | "codex" | null.
export function modoDe(prompt) {
  const primera = lineas(prompt)[0];
  const m = primera?.match(/^MODO: (directo|codex)(?=\s|$)/);
  return m ? m[1] : null;
}

// Familia del modelo pedido: "opus" | "sonnet" | "haiku" | "otro" | null (sin model).
export function familiaDe(model) {
  if (typeof model !== "string" || model.trim() === "") return null;
  const m = model.toLowerCase();
  if (m.includes("opus")) return "opus";
  if (m.includes("sonnet")) return "sonnet";
  if (m.includes("haiku")) return "haiku";
  return "otro";
}

// Verdadero si alguna línea del prompt es "RUTA: forzada <motivo>".
export function forzada(prompt) {
  return lineas(prompt).some((l) => l === "RUTA: forzada" || l.startsWith("RUTA: forzada "));
}

// Reglas de cada rol según el proveedor que decidió el equilibrio.
function valida(rol, proveedor, modo, familia) {
  if (rol === "explorer") return proveedor === "codex" ? modo === "codex" : modo !== "codex";
  if (proveedor === "codex") return modo !== "directo" && (familia == null || familia === "haiku");
  if (rol === "implementer") return modo === "directo" && (familia === "sonnet" || familia === "opus");
  return modo === "directo" && familia === "opus";
}

// null si la invocación coincide con el equilibrio o no aplica; texto con el
// motivo del rechazo en otro caso. `definiciones` es ROLES de equilibrio-cuota.mjs.
export function revisar(toolInput, roles, definiciones) {
  const rol = rolDe(toolInput?.subagent_type);
  if (!esFlexible(rol, definiciones)) return null;
  const prompt = toolInput?.prompt;
  if (forzada(prompt)) return null;
  const r = roles?.[rol];
  if (!r || (r.proveedor !== "claude" && r.proveedor !== "codex")) return null;
  const modo = modoDe(prompt);
  const model = toolInput?.model;
  if (valida(rol, r.proveedor, modo, familiaDe(model))) return null;
  return [
    `Equilibrio de cuota: ${rol} va en ${r.proveedor} (${r.motivo}). Invócalo como ${r.como ?? "—"}.`,
    `Recibido: modo=${modo ?? "ninguno"}, model=${typeof model === "string" && model.trim() !== "" ? model : "ninguno"}.`,
    'Si hay una razón para otra ruta (p. ej. CODEX_NO_DISPONIBLE), agrega al prompt una línea "RUTA: forzada <motivo>" debajo de la línea MODO (o, si no hay MODO, en cualquier línea).',
  ].join("\n");
}

// Registro opcional para la sonda en vivo: solo si está definida la variable.
function sonda(toolInput) {
  if (!process.env.EQUILIBRIO_HOOK_SONDA) return;
  try {
    const ruta = path.join(os.homedir(), ".claude", "cache", "equilibrio-hook-sonda.jsonl");
    fs.mkdirSync(path.dirname(ruta), { recursive: true });
    fs.appendFileSync(ruta, JSON.stringify({ ts: new Date().toISOString(), tool_input: toolInput }) + "\n");
  } catch { /* la sonda nunca frena el hook */ }
}

async function main() {
  // Si stdin no se cierra, no esperar hasta el timeout del hook.
  setTimeout(() => process.exit(0), 4000).unref();
  process.stdin.setEncoding("utf8");
  let crudo = "";
  for await (const parte of process.stdin) crudo += parte;
  const entrada = JSON.parse(crudo || "{}");
  if (!HERRAMIENTAS.has(entrada.tool_name) || entrada.agent_id) return;
  const toolInput = entrada.tool_input;
  sonda(toolInput);

  // Import dinámico: si equilibrio-cuota.mjs falta o no compila, main lanza y el catch sale con 0.
  const { evaluar, ROLES } = await import("./equilibrio-cuota.mjs");
  if (!esFlexible(rolDe(toolInput?.subagent_type), ROLES)) return;

  const ev = evaluar({ origen: "hook", rol: rolDe(toolInput?.subagent_type) });
  // Sin datos de las dos cuotas no hay equilibrio que hacer valer.
  if (!ev.claude.conocido || !ev.codex.conocido) return;
  const motivo = revisar(toolInput, ev.roles, ROLES);
  if (!motivo) return;
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: motivo },
  }));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch(() => process.exit(0));
}
