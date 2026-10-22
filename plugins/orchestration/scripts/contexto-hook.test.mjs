// node --test plugins/orchestration/scripts/contexto-hook.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  contextoActual, nivelDeAviso, notasDeLaSesion, textoTrasCompactar, aviso, compactacion,
} from "./contexto-hook.mjs";

const DIR = fs.mkdtempSync(path.join(os.tmpdir(), "contexto-hook-"));
const SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), "contexto-hook.mjs");
let n = 0;

function asistente(contexto, extra = {}) {
  return {
    type: "assistant",
    isSidechain: false,
    message: {
      model: "claude-opus-5-5",
      content: [{ type: "text", text: "ok" }],
      usage: { input_tokens: 5, cache_creation_input_tokens: 1000, cache_read_input_tokens: contexto - 1005, output_tokens: 50 },
    },
    ...extra,
  };
}

function escribe(c, ruta) {
  return { type: "assistant", message: { model: "claude-opus-5-5", content: [{ type: "tool_use", name: c, input: { file_path: ruta, content: "x" } }] } };
}

function transcript(...lineas) {
  const ruta = path.join(DIR, `t${n++}.jsonl`);
  fs.writeFileSync(ruta, lineas.map((l) => JSON.stringify(l)).join("\n") + "\n");
  return ruta;
}

test("el contexto sale del usage del último mensaje del agente principal", () => {
  const t = transcript(asistente(100_000), { type: "user", message: { content: "hola" } }, asistente(260_000));
  assert.equal(contextoActual(t), 260_000);
});

test("ignora mensajes de subagentes y sintéticos", () => {
  const sintetico = asistente(999_000);
  sintetico.message.model = "<synthetic>";
  const t = transcript(asistente(120_000), asistente(900_000, { isSidechain: true }), sintetico);
  assert.equal(contextoActual(t), 120_000);
});

test("sin transcript legible no hay contexto", () => {
  assert.equal(contextoActual(path.join(DIR, "no-existe.jsonl")), null);
});

test("niveles: 0 bajo 250k, 1 desde 250k y uno más cada 25k", () => {
  assert.equal(nivelDeAviso(null), 0);
  assert.equal(nivelDeAviso(249_999), 0);
  assert.equal(nivelDeAviso(250_000), 1);
  assert.equal(nivelDeAviso(274_999), 1);
  assert.equal(nivelDeAviso(275_000), 2);
  assert.equal(nivelDeAviso(310_000), 3);
});

test("el aviso sale una vez por nivel y se reinicia al bajar de 250k", () => {
  const estado = path.join(DIR, "estado-a.json");
  const alto = { session_id: "s", transcript_path: transcript(asistente(255_000)) };
  assert.match(aviso(alto, estado), /lleva 255k tokens/);
  assert.equal(aviso(alto, estado), null);
  const mas = { session_id: "s", transcript_path: transcript(asistente(280_000)) };
  assert.match(aviso(mas, estado), /280k/);
  const bajo = { session_id: "s", transcript_path: transcript(asistente(80_000)) };
  assert.equal(aviso(bajo, estado), null);
  assert.equal(fs.existsSync(estado), false);
  assert.match(aviso(alto, estado), /255k/);
});

test("el aviso no corre para herramientas de subagentes", () => {
  const e = { session_id: "s", agent_id: "a1", transcript_path: transcript(asistente(400_000)) };
  assert.equal(aviso(e, path.join(DIR, "estado-b.json")), null);
});

test("las notas son el último archivo handoffs/notas-*.md que la sesión escribió o editó", () => {
  const t = transcript(
    escribe("Write", "C:\\meta\\handoffs\\notas-2026-10-22-a.md"),
    escribe("Read", "C:\\meta\\handoffs\\notas-2026-10-21-otra.md"),
    escribe("Edit", "C:/meta/handoffs/notas-2026-10-22-b.md"),
    escribe("Write", "C:\\meta\\revision\\notas-no.md"),
  );
  assert.equal(notasDeLaSesion(t), "C:/meta/handoffs/notas-2026-10-22-b.md");
});

test("ignora notas escritas por subagentes", () => {
  const sub = escribe("Write", "C:\\meta\\handoffs\\notas-sub.md");
  sub.isSidechain = true;
  assert.equal(notasDeLaSesion(transcript(sub)), null);
});

test("tras compactar devuelve el contenido de las notas", () => {
  const notas = path.join(DIR, "handoffs", "notas-2026-10-22-x.md");
  fs.mkdirSync(path.dirname(notas), { recursive: true });
  fs.writeFileSync(notas, "## Correcciones\n- Español neutro.");
  const texto = compactacion({ transcript_path: transcript(escribe("Write", notas)) });
  assert.match(texto, /se acaba de compactar/);
  assert.match(texto, /Español neutro/);
});

test("tras compactar sin notas, indica dónde buscarlas", () => {
  assert.match(compactacion({ transcript_path: transcript(asistente(50_000)) }), /no tiene notas de sesión registradas/);
});

test("las notas largas se recortan bajo el límite de additionalContext", () => {
  const texto = textoTrasCompactar("x.md", "a".repeat(20_000));
  assert.ok(texto.length < 10_000);
  assert.match(texto, /notas recortadas/);
});

test("de punta a punta: imprime el JSON de hookSpecificOutput", () => {
  const entrada = JSON.stringify({
    hook_event_name: "PostToolUse",
    session_id: `e2e-${Date.now()}`,
    transcript_path: transcript(asistente(260_000)),
  });
  const out = execFileSync(process.execPath, [SCRIPT, "aviso"], { input: entrada, env: { ...process.env, HOME: DIR, USERPROFILE: DIR } }).toString();
  const j = JSON.parse(out);
  assert.equal(j.hookSpecificOutput.hookEventName, "PostToolUse");
  assert.match(j.hookSpecificOutput.additionalContext, /260k/);
});

test("de punta a punta: con una entrada inválida no imprime nada ni falla", () => {
  const out = execFileSync(process.execPath, [SCRIPT, "aviso"], { input: "no es json" }).toString();
  assert.equal(out, "");
});
