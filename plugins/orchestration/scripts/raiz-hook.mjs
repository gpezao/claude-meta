#!/usr/bin/env node
// Hook SessionStart: anota la carpeta de este plugin en
// ~/.claude/cache/orchestration-raiz.
//
// Los puentes a Codex y la skill cuota la leen para encontrar
// equilibrio-cuota.mjs y las instrucciones de cada rol aunque el plugin no esté
// en el cache del marketplace (--plugin-dir, evals, otro marketplace). Si el
// archivo falta o apunta a una carpeta que ya no existe, usan la búsqueda en el
// cache.
//
// La ruta va con barras "/", que entienden Git Bash, node y Linux. Falla
// abierto: ante cualquier error no imprime nada y sale con 0.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export function anotarRaiz({ raiz = RAIZ, cache = path.join(os.homedir(), ".claude", "cache") } = {}) {
  if (!fs.existsSync(path.join(raiz, "scripts", "equilibrio-cuota.mjs"))) return null;
  const valor = raiz.replace(/\\/g, "/");
  const destino = path.join(cache, "orchestration-raiz");
  try {
    if (fs.readFileSync(destino, "utf8") === valor) return valor;
  } catch { /* no existe todavía */ }
  fs.mkdirSync(cache, { recursive: true });
  const tmp = `${destino}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, valor);
  fs.renameSync(tmp, destino);
  return valor;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  setTimeout(() => process.exit(0), 4000).unref();
  try { anotarRaiz(); } catch { /* falla abierto */ }
  process.exit(0);
}
