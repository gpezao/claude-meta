// node --test plugins/orchestration/scripts/equilibrio-hook.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { rolDe, esFlexible, modoDe, familiaDe, forzada, revisar } from "./equilibrio-hook.mjs";
import { ROLES, evaluar } from "./equilibrio-cuota.mjs";

const SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), "equilibrio-hook.mjs");
const SEMANA = 7 * 24 * 3600;

// revisar con las definiciones reales de ROLES.
const rev = (toolInput, roles) => revisar(toolInput, roles, ROLES);

// Cachés con ritmos parejos (ambos al 50% de uso con 50% de la semana): sin
// desvío, la asignación medida manda el implementer a Codex.
function cachesParejas() {
  const ahora = Date.now() / 1000;
  return {
    "claude-usage.json": JSON.stringify({
      rate_limits: {
        seven_day: { used_percentage: 50, resets_at: ahora + SEMANA * 0.5 },
        five_hour: { used_percentage: 0, resets_at: ahora + 3600 },
      },
    }),
    "codex-usage.json": JSON.stringify({
      ok: true,
      primary: { usedPercent: 0, windowDurationMins: 300, resetsAt: ahora + 3600 },
      secondary: { usedPercent: 50, windowDurationMins: 10080, resetsAt: ahora + SEMANA * 0.5 },
    }),
  };
}

// Directorio temporal usado como HOME, con las cachés escritas en .claude/cache.
function hogarConCaches(caches = {}) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "equilibrio-hook-"));
  const cache = path.join(home, ".claude", "cache");
  fs.mkdirSync(cache, { recursive: true });
  for (const [nombre, contenido] of Object.entries(caches)) fs.writeFileSync(path.join(cache, nombre), contenido);
  return home;
}

// Ejecuta el hook como proceso real con HOME/USERPROFILE en un directorio temporal.
function correr({ entrada, crudo, caches = {}, env = {} }) {
  const home = hogarConCaches(caches);
  return execFileSync(process.execPath, [SCRIPT], {
    input: crudo ?? JSON.stringify(entrada),
    env: { ...process.env, HOME: home, USERPROFILE: home, EQUILIBRIO_HOOK_SONDA: "", ...env },
    encoding: "utf8",
  });
}

// Entrada de una llamada Agent con implementer en Codex (cachés parejas).
const IMPL_DIRECTO = {
  hook_event_name: "PreToolUse",
  tool_name: "Agent",
  tool_input: { subagent_type: "orchestration:implementer", prompt: "MODO: directo\nhaz X", model: "sonnet" },
};

function rol(proveedor, nombre) {
  return { proveedor, motivo: "prueba", como: ROLES[nombre][proveedor] };
}

test("rolDe: con o sin prefijo del plugin; vacío o no texto → null", () => {
  assert.equal(rolDe("orchestration:planner"), "planner");
  assert.equal(rolDe("implementer"), "implementer");
  assert.equal(rolDe("general-purpose"), "general-purpose");
  assert.equal(rolDe(""), null);
  assert.equal(rolDe(undefined), null);
});

test("esFlexible: solo los roles flexibles de ROLES", () => {
  for (const r of ["planner", "implementer", "debugger", "explorer"]) assert.equal(esFlexible(r, ROLES), true);
  for (const r of ["reviewer", "security-reviewer", "tester", "release", "general-purpose", "constructor", null]) {
    assert.equal(esFlexible(r, ROLES), false);
  }
  assert.equal(esFlexible("planner", undefined), false);
});

test("modoDe: primera línea no vacía, con sangría, \\r y líneas vacías previas", () => {
  assert.equal(modoDe("MODO: directo\nhola"), "directo");
  assert.equal(modoDe("\n\n  MODO: codex\r\nhola"), "codex");
  assert.equal(modoDe("\t MODO: directo"), "directo");
  assert.equal(modoDe("hola\nMODO: directo"), null);
  assert.equal(modoDe(""), null);
  assert.equal(modoDe(undefined), null);
});

test("modoDe: estricto con el comienzo de la línea", () => {
  assert.equal(modoDe("modo: directo"), null);
  assert.equal(modoDe("MODO: Directo"), null);
  assert.equal(modoDe("MODO:directo"), null);
  assert.equal(modoDe("MODO:  directo"), null);
  assert.equal(modoDe("MODO: directox"), null);
  assert.equal(modoDe("MODO: directo extra"), "directo");
  assert.equal(modoDe("MODO: directo \nhola"), "directo");
});

test("familiaDe: alias e ids completos", () => {
  assert.equal(familiaDe("opus"), "opus");
  assert.equal(familiaDe("claude-opus-5-5"), "opus");
  assert.equal(familiaDe("sonnet"), "sonnet");
  assert.equal(familiaDe("haiku"), "haiku");
  assert.equal(familiaDe("gpt-6"), "otro");
  assert.equal(familiaDe(""), null);
  assert.equal(familiaDe(undefined), null);
});

test("forzada: una línea RUTA: forzada, con sangría y \\r tolerados", () => {
  assert.equal(forzada("hola\nRUTA: forzada CODEX_NO_DISPONIBLE"), true);
  assert.equal(forzada("hola\r\n  RUTA: forzada X\r\n"), true);
  assert.equal(forzada("hola\nno es RUTA: forzada"), false);
  assert.equal(forzada("RUTA:forzada X"), false);
  assert.equal(forzada("ruta: forzada X"), false);
  assert.equal(forzada("hola"), false);
});

test("revisar: planner y debugger en Codex (puente) y en Claude (directo, opus)", () => {
  for (const nombre of ["planner", "debugger"]) {
    const roles = { [nombre]: rol("codex", nombre) };
    const st = (prompt, model) => ({ subagent_type: `orchestration:${nombre}`, prompt, model });
    assert.equal(rev(st("hola"), roles), null);
    assert.equal(rev(st("hola", "haiku"), roles), null);
    assert.ok(rev(st("MODO: directo\nx", "opus"), roles).includes(ROLES[nombre].codex));
    assert.ok(rev(st("hola", "sonnet"), roles).includes(ROLES[nombre].codex));

    const rolesClaude = { [nombre]: rol("claude", nombre) };
    assert.equal(rev(st("MODO: directo\nx", "opus"), rolesClaude), null);
    assert.ok(rev(st("hola", "opus"), rolesClaude).includes(ROLES[nombre].claude));
    assert.ok(rev(st("MODO: directo\nx", "sonnet"), rolesClaude).includes(ROLES[nombre].claude));
  }
});

test("revisar: implementer en Codex (puente) y en Claude (directo, sonnet u opus)", () => {
  const st = (prompt, model) => ({ subagent_type: "orchestration:implementer", prompt, model });
  const enCodex = { implementer: rol("codex", "implementer") };
  assert.equal(rev(st("hola"), enCodex), null);
  assert.ok(rev(st("MODO: directo", "sonnet"), enCodex).includes(ROLES.implementer.codex));

  const enClaude = { implementer: rol("claude", "implementer") };
  assert.equal(rev(st("MODO: directo", "sonnet"), enClaude), null);
  assert.equal(rev(st("MODO: directo", "opus"), enClaude), null);
  assert.ok(rev(st("hola", "sonnet"), enClaude).includes(ROLES.implementer.claude));
});

test("revisar: explorer con MODO: codex en Codex y sin él en Claude; model se ignora", () => {
  const st = (prompt, model) => ({ subagent_type: "orchestration:explorer", prompt, model });
  const enCodex = { explorer: rol("codex", "explorer") };
  assert.equal(rev(st("MODO: codex\nx"), enCodex), null);
  assert.equal(rev(st("MODO: codex\nx", "haiku"), enCodex), null);
  assert.ok(rev(st("hola"), enCodex).includes(ROLES.explorer.codex));
  assert.ok(rev(st("hola", "opus"), enCodex).includes(ROLES.explorer.codex));

  const enClaude = { explorer: rol("claude", "explorer") };
  assert.equal(rev(st("hola"), enClaude), null);
  assert.equal(rev(st("hola", "opus"), enClaude), null);
  assert.ok(rev(st("MODO: codex\nx"), enClaude).includes(ROLES.explorer.claude));
  assert.ok(rev(st("MODO: codex\nx", "opus"), enClaude).includes(ROLES.explorer.claude));
});

test("revisar: el motivo dice qué se recibió y cómo invocarlo", () => {
  const roles = { implementer: rol("codex", "implementer") };
  const motivo = rev({ subagent_type: "orchestration:implementer", prompt: "MODO: directo", model: "sonnet" }, roles);
  assert.match(motivo, /Recibido: modo=directo, model=sonnet\./);
  assert.match(motivo, /debajo de la línea MODO/);
  const sinNada = rev({ subagent_type: "orchestration:implementer", prompt: "hola" }, { implementer: rol("claude", "implementer") });
  assert.match(sinNada, /Recibido: modo=ninguno, model=ninguno\./);
});

test("revisar: ninguno, rol ausente y roles no flexibles no se revisan", () => {
  const st = { subagent_type: "orchestration:implementer", prompt: "MODO: directo", model: "sonnet" };
  assert.equal(rev(st, { implementer: { proveedor: "ninguno", motivo: "", como: "—" } }), null);
  assert.equal(rev(st, {}), null);
  assert.equal(rev(st, undefined), null);
  assert.equal(revisar(st, { implementer: rol("codex", "implementer") }, undefined), null);
  const roles = { reviewer: rol("claude", "reviewer"), tester: rol("claude", "tester") };
  assert.equal(rev({ subagent_type: "orchestration:reviewer", prompt: "hola" }, roles), null);
  assert.equal(rev({ subagent_type: "orchestration:tester", prompt: "hola" }, roles), null);
  assert.equal(rev({ subagent_type: "general-purpose", prompt: "hola" }, roles), null);
});

test("revisar: RUTA: forzada anula el rechazo, en cualquier línea y con \\r\\n o sangría", () => {
  const roles = { implementer: rol("codex", "implementer") };
  const st = (prompt) => ({ subagent_type: "orchestration:implementer", prompt, model: "sonnet" });
  assert.equal(rev(st("MODO: directo\nRUTA: forzada CODEX_NO_DISPONIBLE"), roles), null);
  assert.equal(rev(st("MODO: directo\r\n  RUTA: forzada X\r\nhola"), roles), null);
  assert.equal(rev(st("hola\nRUTA: forzada X"), roles), null);
  assert.ok(rev(st("MODO: directo\nRUTA:forzada X"), roles).includes(ROLES.implementer.codex));
});

test("evaluar lee las cachés de un directorio dado y devuelve los roles", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "equilibrio-evaluar-"));
  for (const [nombre, contenido] of Object.entries(cachesParejas())) fs.writeFileSync(path.join(dir, nombre), contenido);
  const r = evaluar({ cache: dir, ahora: Date.now() / 1000 });
  assert.equal(r.roles.implementer.proveedor, "codex");
  assert.equal(r.claude.conocido, true);
  assert.equal(r.codex.conocido, true);
});

test("evaluar anota cada corrida en equilibrio-historial.jsonl", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "equilibrio-historial-"));
  for (const [nombre, contenido] of Object.entries(cachesParejas())) fs.writeFileSync(path.join(dir, nombre), contenido);
  evaluar({ cache: dir, origen: "hook", rol: "implementer" });
  evaluar({ cache: dir });
  const lineas = fs.readFileSync(path.join(dir, "equilibrio-historial.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
  assert.equal(lineas.length, 2);
  assert.equal(lineas[0].origen, "hook");
  assert.equal(lineas[0].rol, "implementer");
  assert.equal(lineas[0].proveedores.implementer, "codex");
  assert.equal(lineas[1].origen, "cli");
  assert.equal(lineas[1].rol, null);
  assert.ok(!Number.isNaN(Date.parse(lineas[0].ts)));
  fs.rmSync(dir, { recursive: true, force: true });
});

test("proceso: MODO: directo sobre el implementer en Codex se rechaza", () => {
  const salida = correr({ entrada: IMPL_DIRECTO, caches: cachesParejas() });
  const json = JSON.parse(salida);
  assert.equal(json.hookSpecificOutput.hookEventName, "PreToolUse");
  assert.equal(json.hookSpecificOutput.permissionDecision, "deny");
  assert.match(json.hookSpecificOutput.permissionDecisionReason, /implementer va en codex/);
  assert.match(json.hookSpecificOutput.permissionDecisionReason, /RUTA: forzada/);
  assert.match(json.hookSpecificOutput.permissionDecisionReason, /Recibido: modo=directo, model=sonnet\./);
});

test("proceso: la misma llamada sin MODO no imprime nada", () => {
  const entrada = { ...IMPL_DIRECTO, tool_input: { subagent_type: "orchestration:implementer", prompt: "hola" } };
  assert.equal(correr({ entrada, caches: cachesParejas() }), "");
});

test("proceso: Task se revisa igual que Agent", () => {
  const entrada = { ...IMPL_DIRECTO, tool_name: "Task" };
  assert.equal(JSON.parse(correr({ entrada, caches: cachesParejas() })).hookSpecificOutput.permissionDecision, "deny");
});

test("proceso: RUTA forzada (con \\r\\n y sangría), agent_id, otra herramienta y tipo que no es rol salen vacíos", () => {
  const caches = cachesParejas();
  const forzado = { ...IMPL_DIRECTO, tool_input: { subagent_type: "orchestration:implementer", prompt: "MODO: directo\r\n  RUTA: forzada X\r\n", model: "sonnet" } };
  assert.equal(correr({ entrada: forzado, caches }), "");
  assert.equal(correr({ entrada: { ...IMPL_DIRECTO, agent_id: "a1" }, caches }), "");
  assert.equal(correr({ entrada: { ...IMPL_DIRECTO, tool_name: "Read" }, caches }), "");
  const gp = { ...IMPL_DIRECTO, tool_input: { subagent_type: "general-purpose", prompt: "MODO: directo" } };
  assert.equal(correr({ entrada: gp, caches }), "");
});

test("proceso: explorer con model puesto se revisa solo por MODO: codex", () => {
  const caches = cachesParejas();
  const conModelo = (prompt) => ({ ...IMPL_DIRECTO, tool_input: { subagent_type: "orchestration:explorer", prompt, model: "opus" } });
  // Con cachés parejas el explorer va en Claude: el rechazo es para MODO: codex.
  assert.equal(correr({ entrada: conModelo("hola"), caches }), "");
  const salida = JSON.parse(correr({ entrada: conModelo("MODO: codex\nx"), caches }));
  assert.match(salida.hookSpecificOutput.permissionDecisionReason, /explorer va en claude/);
});

test("proceso: con un solo proveedor sin datos semanales el hook calla", () => {
  const caches = cachesParejas();
  const ahora = Date.now() / 1000;
  caches["codex-usage.json"] = JSON.stringify({
    ok: true,
    primary: { usedPercent: 0, windowDurationMins: 300, resetsAt: ahora + 3600 },
  });
  assert.equal(correr({ entrada: IMPL_DIRECTO, caches }), "");
});

test("proceso: sin equilibrio-cuota.mjs al lado, o con ese archivo roto, falla abierto (sin stdout ni stderr)", () => {
  for (const contenidoCuota of [null, "export const ROLES = ;\n"]) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "equilibrio-solo-"));
    fs.copyFileSync(SCRIPT, path.join(dir, "equilibrio-hook.mjs"));
    if (contenidoCuota !== null) fs.writeFileSync(path.join(dir, "equilibrio-cuota.mjs"), contenidoCuota);
    const home = hogarConCaches(cachesParejas());
    const r = spawnSync(process.execPath, [path.join(dir, "equilibrio-hook.mjs")], {
      input: JSON.stringify(IMPL_DIRECTO),
      env: { ...process.env, HOME: home, USERPROFILE: home, EQUILIBRIO_HOOK_SONDA: "" },
      encoding: "utf8",
    });
    assert.equal(r.status, 0);
    assert.equal(r.stdout, "");
    assert.equal(r.stderr, "");
  }
});

test("proceso: con la variable de sonda, cada llamada se anota en el jsonl", () => {
  const home = hogarConCaches(cachesParejas());
  execFileSync(process.execPath, [SCRIPT], {
    input: JSON.stringify(IMPL_DIRECTO),
    env: { ...process.env, HOME: home, USERPROFILE: home, EQUILIBRIO_HOOK_SONDA: "1" },
    encoding: "utf8",
  });
  const lineas = fs.readFileSync(path.join(home, ".claude", "cache", "equilibrio-hook-sonda.jsonl"), "utf8").trim().split("\n");
  assert.equal(lineas.length, 1);
  assert.equal(JSON.parse(lineas[0]).tool_input.subagent_type, "orchestration:implementer");
});

test("proceso: falla abierto ante entrada vacía, no JSON, tool_input ausente, caché corrupta o ausente", () => {
  assert.equal(correr({ crudo: "", caches: cachesParejas() }), "");
  assert.equal(correr({ crudo: "esto no es json", caches: cachesParejas() }), "");
  assert.equal(correr({ crudo: "null", caches: cachesParejas() }), "");
  assert.equal(correr({ entrada: { tool_name: "Agent" }, caches: cachesParejas() }), "");
  assert.equal(correr({ entrada: IMPL_DIRECTO, caches: { "claude-usage.json": "{nope", "codex-usage.json": "{nope" } }), "");
  assert.equal(correr({ entrada: IMPL_DIRECTO, caches: {} }), "");
});
