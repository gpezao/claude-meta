#!/usr/bin/env node
// Copia las cuatro reglas globales al append_system_prompt de los casos que
// lo declaran. En una sesión real esas reglas llegan desde ~/.claude/CLAUDE.md,
// que las corridas de `claude plugin eval` no cargan.
//
//   node evals/sincronizar-reglas.mjs            reescribe los case.yaml
//   node evals/sincronizar-reglas.mjs --revisar  sale con 1 si alguno quedó viejo
//
// En case.yaml, append_system_prompt va en una sola línea (escalar), nunca
// como bloque `|` o `>`: el script reemplaza solo esa línea.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const EVALS = path.dirname(fileURLToPath(import.meta.url));
const PLUGIN = path.dirname(EVALS);
const REGLAS = [
  "ANTES-DE-EJECUTAR.md",
  "CHECKPOINTS.md",
  "REDACCION-DE-ENTREGABLES.md",
  "NOTAS-DE-SESION.md",
];
const CLAVE = /^(\s*)append_system_prompt:.*$/m;

export function textoDeReglas(dir = PLUGIN) {
  const partes = REGLAS.map((r) => fs.readFileSync(path.join(dir, r), "utf8").replace(/\r\n/g, "\n").trim());
  return [
    "Instrucciones de usuario (todas las sesiones), cargadas desde ~/.claude/CLAUDE.md:",
    ...partes,
  ].join("\n\n");
}

// Casos con case.yaml que declaran append_system_prompt.
export function casosConReglas(dir = EVALS) {
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => path.join(dir, d.name, "case.yaml"))
    .filter((f) => fs.existsSync(f) && CLAVE.test(fs.readFileSync(f, "utf8")));
}

export function conReglas(yaml, texto) {
  // JSON es YAML válido: evita escapar a mano los bloques de código de las reglas.
  return yaml.replace(CLAVE, (_, sangria) => `${sangria}append_system_prompt: ${JSON.stringify(texto)}`);
}

function main() {
  const revisar = process.argv.includes("--revisar");
  const texto = textoDeReglas();
  let viejos = 0;
  for (const f of casosConReglas()) {
    const antes = fs.readFileSync(f, "utf8");
    if (/^\s*append_system_prompt:\s*[|>]/m.test(antes)) {
      console.error(`${path.relative(PLUGIN, f)}: append_system_prompt está como bloque; déjalo en una línea`);
      process.exit(1);
    }
    const despues = conReglas(antes, texto);
    if (antes === despues) continue;
    viejos++;
    if (revisar) console.log(`desactualizado: ${path.relative(PLUGIN, f)}`);
    else { fs.writeFileSync(f, despues); console.log(`actualizado: ${path.relative(PLUGIN, f)}`); }
  }
  if (revisar && viejos) process.exit(1);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
