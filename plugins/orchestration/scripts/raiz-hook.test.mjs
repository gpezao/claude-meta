// node --test plugins/orchestration/scripts/raiz-hook.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { RAIZ, anotarRaiz } from "./raiz-hook.mjs";

const SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), "raiz-hook.mjs");
const nuevo = () => fs.mkdtempSync(path.join(os.tmpdir(), "raiz-hook-"));
const leer = (cache) => fs.readFileSync(path.join(cache, "orchestration-raiz"), "utf8");

test("la raíz por defecto es la carpeta del plugin", () => {
  assert.ok(fs.existsSync(path.join(RAIZ, "scripts", "equilibrio-cuota.mjs")));
  assert.ok(fs.existsSync(path.join(RAIZ, "agents", "planner.md")));
});

test("anota la raíz con barras / y sin salto de línea", () => {
  const cache = path.join(nuevo(), "cache");
  const valor = anotarRaiz({ cache });
  assert.equal(valor, RAIZ.replace(/\\/g, "/"));
  assert.equal(leer(cache), valor);
  assert.ok(!valor.includes("\\"));
  assert.ok(fs.existsSync(path.join(valor, "scripts", "equilibrio-cuota.mjs")));
});

test("reemplaza una raíz vieja y no deja temporales", () => {
  const cache = nuevo();
  fs.writeFileSync(path.join(cache, "orchestration-raiz"), "/ruta/que/ya/no/existe");
  anotarRaiz({ cache });
  assert.equal(leer(cache), RAIZ.replace(/\\/g, "/"));
  assert.deepEqual(fs.readdirSync(cache), ["orchestration-raiz"]);
});

test("no anota una carpeta que no es el plugin", () => {
  const cache = nuevo();
  assert.equal(anotarRaiz({ raiz: nuevo(), cache }), null);
  assert.deepEqual(fs.readdirSync(cache), []);
});

test("como hook sale con 0, sin salida, y escribe en el HOME del proceso", () => {
  const home = nuevo();
  const out = execFileSync(process.execPath, [SCRIPT], {
    input: JSON.stringify({ hook_event_name: "SessionStart", source: "startup" }),
    env: { ...process.env, HOME: home, USERPROFILE: home },
  }).toString();
  assert.equal(out, "");
  assert.equal(leer(path.join(home, ".claude", "cache")), RAIZ.replace(/\\/g, "/"));
});

test("como hook falla abierto si no puede escribir", () => {
  const home = nuevo();
  // Un archivo donde debería ir la carpeta .claude hace fallar el mkdir.
  fs.writeFileSync(path.join(home, ".claude"), "");
  const out = execFileSync(process.execPath, [SCRIPT], {
    input: "{}",
    env: { ...process.env, HOME: home, USERPROFILE: home },
  }).toString();
  assert.equal(out, "");
});
