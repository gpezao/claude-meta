#!/usr/bin/env node
// Equilibrio de cuota entre Claude y Codex (decisión 0003).
//
// Lee el uso que deja el statusline en ~/.claude/cache y decide en qué
// proveedor corre cada rol del modelo operativo:
//   - La base es la asignación medida de la decisión 0002.
//   - Si el ritmo semanal de un proveedor supera al del otro en más de 0,25,
//     sus roles flexibles pasan a la alternativa hasta que la diferencia baje
//     de 0,10. Ritmo = % usado de la semana / % transcurrido de la semana.
//   - La revisión la hace siempre un proveedor distinto al del implementer.
//   - Un proveedor con la ventana de 5 h en 60% o más cede sus roles
//     flexibles al otro si el otro está bajo 60% (decisión 0004).
//   - Un proveedor con la ventana de 5 h en 90% o más no recibe tareas nuevas
//     si el otro puede recibirlas; sin alternativa, sigue con aviso.
//   - Un proveedor agotado no recibe tareas: el otro sigue solo.
//
// Uso:
//   node equilibrio-cuota.mjs [--implementer claude|codex|ninguno]
//   node equilibrio-cuota.mjs --rol <rol> [--implementer ...]   (una línea: "codex", o "claude|ninguno · <motivo>")
//   node equilibrio-cuota.mjs --json

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const UMBRAL_DESVIO = 0.25;
export const UMBRAL_REGRESO = 0.1;
export const TOPE_5H = 90;
// Desde este % de la ventana de 5 h, los roles flexibles pasan al otro
// proveedor si ese está bajo el mismo umbral (decisión 0004).
export const PRESION_5H = 60;
// Piso del % transcurrido al calcular el ritmo, para que las primeras horas
// de la semana no den ritmos extremos (25% de 7 días son 42 h). Con 10%, el
// uso de las primeras horas tras un reinicio inflaba el ritmo (decisión 0004).
export const PISO_TRANSCURRIDO = 25;

const SEMANA = 7 * 24 * 3600;
const OTRO = { claude: "codex", codex: "claude" };

// Asignación de la decisión 0002, con la forma de invocar cada combinación.
export const ROLES = {
  explorer: {
    base: "claude", flexible: true,
    claude: "agente explorer (Haiku 5.5 · medium)",
    codex: "agente explorer con `MODO: codex` (GPT-6-Luna · medium)",
  },
  planner: {
    base: "codex", flexible: true,
    codex: "agente planner (puente a GPT-6.1-Sol · high)",
    claude: "agente planner con `MODO: directo` y model opus (Opus 5.5 · high)",
  },
  implementer: {
    base: "codex", flexible: true,
    codex: "agente implementer (puente a GPT-6.1-Sol · high)",
    claude: "agente implementer con `MODO: directo` y model sonnet (Sonnet 5 · high), u opus si el PR es complejo",
  },
  debugger: {
    base: "codex", flexible: true,
    codex: "agente debugger (puente a GPT-6.1-Sol · high)",
    claude: "agente debugger con `MODO: directo` y model opus (Opus 5.5 · high)",
  },
  reviewer: {
    base: "claude", revision: true,
    claude: "agente reviewer (Opus 5.5 · high)",
    codex: "`review --wait --model gpt-6.1-sol` del plugin codex",
  },
  "security-reviewer": {
    base: "claude", revision: true,
    claude: "agente security-reviewer (Opus 5.5 · high)",
    codex: "`adversarial-review --wait --model gpt-6.1-sol` del plugin codex",
  },
  tester: { base: "claude", claude: "agente tester (Sonnet 5.5 · high)" },
  release: { base: "claude", claude: "agente release (Haiku 5.5 · medium)" },
};

function ventana(used, resetsAt, duracion, ahora) {
  if (typeof used !== "number" || typeof resetsAt !== "number") return null;
  // Si la ventana ya se reinició desde la última lectura, arranca de cero.
  if (resetsAt <= ahora) return { usado: 0, transcurrido: 0 };
  const transcurrido = Math.max(0, Math.min(100, ((duracion - (resetsAt - ahora)) / duracion) * 100));
  return { usado: used, transcurrido };
}

// Normaliza las dos cachés a { conocido, semana, h5, ritmo, agotado }.
// `conocido` indica si hay ventana semanal para calcular el ritmo; las señales
// de agotamiento se leen aunque falte.
export function leerProveedor(nombre, datos, ahora) {
  const vacio = { nombre, conocido: false, semana: null, h5: null, ritmo: null, agotado: false };
  if (!datos) return vacio;
  let semana, h5, reached = null;
  if (nombre === "claude") {
    const rl = datos.rate_limits;
    if (!rl) return vacio;
    semana = ventana(rl.seven_day?.used_percentage, rl.seven_day?.resets_at, SEMANA, ahora);
    h5 = ventana(rl.five_hour?.used_percentage, rl.five_hour?.resets_at, 5 * 3600, ahora);
  } else {
    if (!datos.ok) return vacio;
    const s = datos.secondary, p = datos.primary;
    semana = ventana(s?.usedPercent, s?.resetsAt, (s?.windowDurationMins ?? 10080) * 60, ahora);
    h5 = ventana(p?.usedPercent, p?.resetsAt, (p?.windowDurationMins ?? 300) * 60, ahora);
    // Un límite informado deja de valer si alguna ventana se reinició después,
    // pero solo con las dos ventanas a la vista: entonces el uso de la que no
    // se reinició ya muestra si sigue agotada. Si falta una, se conserva.
    const ambas = typeof s?.resetsAt === "number" && typeof p?.resetsAt === "number";
    const reinicio = ambas && (s.resetsAt <= ahora || p.resetsAt <= ahora);
    if (!reinicio) reached = datos.reached ?? null;
  }
  const agotado = (semana?.usado ?? 0) >= 100 || (h5?.usado ?? 0) >= 100 || reached != null;
  const ritmo = semana ? semana.usado / Math.max(semana.transcurrido, PISO_TRANSCURRIDO) : null;
  return { nombre, conocido: !!semana, semana, h5, ritmo, agotado };
}

// Desvío con histéresis: entra sobre 0,25 de diferencia y sale bajo 0,10.
// Sin datos de alguno de los dos, se mantiene el estado anterior.
export function calcularDesvio(claude, codex, previo) {
  if (!claude.conocido || !codex.conocido) return previo ?? null;
  const diferencia = claude.ritmo - codex.ritmo;
  const cargado = diferencia > 0 ? "claude" : "codex";
  const abs = Math.abs(diferencia);
  if (abs > UMBRAL_DESVIO) return cargado;
  if (previo === cargado && abs >= UMBRAL_REGRESO) return cargado;
  return null;
}

function bloqueo(p) {
  if (p.agotado) return "agotado";
  if ((p.h5?.usado ?? 0) >= TOPE_5H) return "tope de 5 h";
  return null;
}

// El tope de 5 h manda el rol al otro proveedor si ese puede recibirlo. Si no
// hay alternativa, sigue el mismo con aviso. Solo "agotado" detiene el trabajo.
function aplicarBloqueos(elegido, motivo, prov) {
  const b = bloqueo(prov[elegido]);
  if (!b) return { proveedor: elegido, motivo };
  const otro = OTRO[elegido];
  const bo = bloqueo(prov[otro]);
  if (!bo) return { proveedor: otro, motivo: `${elegido} con ${b}` };
  if (b === "agotado" && bo === "agotado") return { proveedor: "ninguno", motivo: "los dos agotados: avisar al humano", aviso: true };
  if (b === "agotado") return { proveedor: otro, motivo: `${elegido} agotado; sigue ${otro} aunque está sobre el tope de 5 h`, aviso: true };
  if (bo === "agotado") return { proveedor: elegido, motivo: `${otro} agotado; sigue ${elegido} aunque está sobre el tope de 5 h`, aviso: true };
  const masMargen = (prov.claude.h5?.usado ?? 0) <= (prov.codex.h5?.usado ?? 0) ? "claude" : "codex";
  return { proveedor: masMargen, motivo: "los dos sobre el tope de 5 h: sigue el que tiene más margen", aviso: true };
}

function presionado(p) {
  return (p.h5?.usado ?? 0) >= PRESION_5H;
}

// La presión de la ventana de 5 h pesa más que el ritmo semanal: es la que
// corta el trabajo en el día.
function porRitmo(def, desvio, prov) {
  let elegido = def.base, motivo = "asignación medida";
  if (desvio === def.base) { elegido = OTRO[def.base]; motivo = `desvío: ${def.base} va más rápido`; }
  const otro = OTRO[elegido];
  if (presionado(prov[elegido]) && !presionado(prov[otro]) && !bloqueo(prov[otro])) {
    motivo = `${elegido} con la ventana de 5 h en ${Math.round(prov[elegido].h5.usado)}%`;
    elegido = otro;
  }
  return aplicarBloqueos(elegido, motivo, prov);
}

// La revisión cruzada pesa más que el ritmo y que el tope de 5 h; solo cede
// si el otro proveedor está agotado.
function revisionCruzada(impl, prov) {
  const revisor = OTRO[impl];
  if (!prov[revisor].agotado) {
    const tope = bloqueo(prov[revisor]) === "tope de 5 h";
    return { proveedor: revisor, motivo: `revisa otro proveedor que el implementer (${impl})${tope ? ", aunque está sobre el tope de 5 h" : ""}`, aviso: tope || undefined };
  }
  if (!prov[impl].agotado) return { proveedor: impl, motivo: `${revisor} agotado: revisa el mismo proveedor que el implementer`, aviso: true };
  return { proveedor: "ninguno", motivo: "los dos agotados: avisar al humano", aviso: true };
}

export function decidir({ claude, codex, previo = null, implementer }) {
  const prov = { claude, codex };
  const desvio = calcularDesvio(claude, codex, previo);
  const roles = {};

  for (const [rol, def] of Object.entries(ROLES)) {
    if (def.flexible) roles[rol] = porRitmo(def, desvio, prov);
  }

  // Sin --implementer se asume que la card usa el implementer recién decidido.
  // Con --implementer ninguno, la revisión sigue el ritmo como un rol flexible.
  const impl = implementer === "ninguno" ? null : OTRO[implementer] ? implementer : roles.implementer.proveedor;
  for (const [rol, def] of Object.entries(ROLES)) {
    if (!def.revision) continue;
    roles[rol] = impl && OTRO[impl] ? revisionCruzada(impl, prov) : porRitmo(def, desvio, prov);
  }

  for (const [rol, def] of Object.entries(ROLES)) {
    if (def.flexible || def.revision) continue;
    const b = bloqueo(claude);
    roles[rol] = b === "agotado"
      ? { proveedor: "ninguno", motivo: "fijo en Claude, que está agotado: avisar al humano", aviso: true }
      : { proveedor: "claude", motivo: b ? "fijo en Claude, sin alternativa aunque está sobre el tope de 5 h" : "fijo en Claude", aviso: b ? true : undefined };
  }

  for (const [rol, r] of Object.entries(roles)) r.como = ROLES[rol][r.proveedor] ?? "—";

  const conductorDelega = !bloqueo(codex) && (desvio === "claude" || bloqueo(claude) != null || (presionado(claude) && !presionado(codex)));
  return { desvio, roles, conductorDelega };
}

function leerJson(ruta) {
  try { return JSON.parse(fs.readFileSync(ruta, "utf8")); } catch { return null; }
}

function fmt(p) {
  const semana = p.conocido ? `semana ${Math.round(p.semana.usado)}% · ritmo ${p.ritmo.toFixed(2)}` : "semana sin datos";
  const h5 = p.h5 ? `${Math.round(p.h5.usado)}%` : "?";
  return `${p.nombre.padEnd(6)} ${semana} · 5 h ${h5}${p.agotado ? " · AGOTADO" : ""}`;
}

// Anota la corrida en el historial que lee la medición semanal. Pasado el
// tope, el archivo se renombra a .1 y se empieza otro.
const TOPE_HISTORIAL = 2 * 1024 * 1024;

function anotarHistorial(cache, linea) {
  const ruta = path.join(cache, "equilibrio-historial.jsonl");
  try {
    try { if (fs.statSync(ruta).size > TOPE_HISTORIAL) fs.renameSync(ruta, `${ruta}.1`); } catch {}
    fs.appendFileSync(ruta, `${JSON.stringify(linea)}\n`);
  } catch {}
}

// Lee las cachés, decide y guarda el estado de la histéresis.
// Devuelve { claude, codex, desvio, roles, conductorDelega }.
export function evaluar({ cache = path.join(os.homedir(), ".claude", "cache"), ahora = Date.now() / 1000, implementer, origen = "cli", rol = null } = {}) {
  const estadoRuta = path.join(cache, "equilibrio-cuota.json");
  const claude = leerProveedor("claude", leerJson(path.join(cache, "claude-usage.json")), ahora);
  const codex = leerProveedor("codex", leerJson(path.join(cache, "codex-usage.json")), ahora);
  const previo = leerJson(estadoRuta)?.desvio ?? null;
  const r = decidir({ claude, codex, previo, implementer });

  // Escritura atómica: los hooks leen este archivo en paralelo.
  const tmp = `${estadoRuta}.${process.pid}.tmp`;
  try {
    fs.writeFileSync(tmp, JSON.stringify({ desvio: r.desvio, actualizado: new Date().toISOString(), ritmoClaude: claude.ritmo ?? null, ritmoCodex: codex.ritmo ?? null }, null, 2));
    fs.renameSync(tmp, estadoRuta);
  } catch {
    try { fs.rmSync(tmp, { force: true }); } catch {}
  }
  anotarHistorial(cache, {
    ts: new Date(ahora * 1000).toISOString(),
    origen,
    rol,
    ritmoClaude: claude.ritmo ?? null,
    ritmoCodex: codex.ritmo ?? null,
    desvio: r.desvio,
    proveedores: Object.fromEntries(Object.entries(r.roles).map(([n, x]) => [n, x.proveedor])),
  });
  return { claude, codex, ...r };
}

function main(argv) {
  const arg = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : undefined; };
  const { claude, codex, ...r } = evaluar({ implementer: arg("--implementer"), rol: arg("--rol") ?? null });

  const rol = arg("--rol");
  if (rol) {
    const x = r.roles[rol];
    if (!x) { console.log(`rol desconocido: ${rol}`); process.exit(2); }
    console.log(x.proveedor === "codex" ? "codex" : `${x.proveedor} · ${x.motivo}`);
    return;
  }
  if (argv.includes("--json")) {
    console.log(JSON.stringify({ claude, codex, ...r }, null, 2));
    return;
  }
  console.log(fmt(claude));
  console.log(fmt(codex));
  console.log(r.desvio ? `Desvío activo: ${r.desvio} va más rápido` : "Sin desvío: rige la asignación medida");
  console.log("");
  for (const [n, x] of Object.entries(r.roles)) console.log(`${x.aviso ? "AVISO " : "      "}${n.padEnd(18)} ${x.proveedor.padEnd(7)} ${x.como} · ${x.motivo}`);
  console.log("");
  console.log(r.conductorDelega
    ? "Conductor: delega a Codex las investigaciones y los barridos de código pesados"
    : "Conductor: trabaja como siempre");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main(process.argv.slice(2));
