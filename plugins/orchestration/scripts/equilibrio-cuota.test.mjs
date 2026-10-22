// node --test plugins/orchestration/scripts/equilibrio-cuota.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { leerProveedor, calcularDesvio, decidir } from "./equilibrio-cuota.mjs";

const AHORA = 1_800_000_000;
const SEMANA = 7 * 24 * 3600;

// Semana transcurrida al `pct`% con `usado`% de uso.
function claude(usado, pct, h5 = 0) {
  return leerProveedor("claude", {
    rate_limits: {
      seven_day: { used_percentage: usado, resets_at: AHORA + SEMANA * (1 - pct / 100) },
      five_hour: { used_percentage: h5, resets_at: AHORA + 3600 },
    },
  }, AHORA);
}

function codex(usado, pct, h5 = 0, reached = null) {
  return leerProveedor("codex", {
    ok: true,
    primary: { usedPercent: h5, windowDurationMins: 300, resetsAt: AHORA + 3600 },
    secondary: { usedPercent: usado, windowDurationMins: 10080, resetsAt: AHORA + SEMANA * (1 - pct / 100) },
    reached,
  }, AHORA);
}

test("ritmo = % usado / % transcurrido, con piso de 25% transcurrido", () => {
  assert.equal(claude(50, 50).ritmo.toFixed(2), "1.00");
  assert.equal(codex(5, 2).ritmo.toFixed(2), "0.20");
});

test("semana de Codex recién reiniciada: el piso evita que su ritmo parezca alto", () => {
  // Lectura del 22-10-2026: Claude 67% con 81% transcurrido, Codex 7% con 10%.
  const r = decidir({ claude: claude(67, 81), codex: codex(7, 10) });
  assert.equal(r.desvio, "claude");
  assert.equal(r.roles.explorer.proveedor, "codex");
  assert.equal(r.conductorDelega, true);
});

test("una ventana ya reiniciada cuenta desde cero", () => {
  const p = leerProveedor("claude", {
    rate_limits: {
      seven_day: { used_percentage: 95, resets_at: AHORA - 10 },
      five_hour: { used_percentage: 99, resets_at: AHORA - 10 },
    },
  }, AHORA);
  assert.equal(p.ritmo, 0);
  assert.equal(p.agotado, false);
});

test("Codex sin datos (ok false): se conserva el desvío anterior", () => {
  const c = leerProveedor("codex", { ok: false, error: "timeout" }, AHORA);
  assert.equal(c.conocido, false);
  assert.equal(calcularDesvio(claude(90, 50), c, null), null);
  assert.equal(calcularDesvio(claude(90, 50), c, "claude"), "claude");
});

test("una lectura fallida no borra la histéresis", () => {
  const fallida = leerProveedor("codex", { ok: false }, AHORA);
  const previo = calcularDesvio(claude(60, 50), fallida, "claude");
  // Diferencia de 0,20 en la lectura siguiente: sigue el desvío.
  assert.equal(calcularDesvio(claude(60, 50), codex(50, 50), previo), "claude");
});

test("sin ventana semanal igual se leen las señales de agotamiento", () => {
  const c = leerProveedor("claude", { rate_limits: { five_hour: { used_percentage: 100, resets_at: AHORA + 60 } } }, AHORA);
  assert.equal(c.conocido, false);
  assert.equal(c.agotado, true);
  const x = leerProveedor("codex", { ok: true, primary: { usedPercent: 10, resetsAt: AHORA + 60 }, reached: "rate_limit" }, AHORA);
  assert.equal(x.agotado, true);
});

test("un límite informado deja de valer tras el reinicio de una ventana", () => {
  const x = leerProveedor("codex", {
    ok: true,
    primary: { usedPercent: 100, windowDurationMins: 300, resetsAt: AHORA - 5 },
    secondary: { usedPercent: 40, windowDurationMins: 10080, resetsAt: AHORA + 3600 },
    reached: "rate_limit",
  }, AHORA);
  assert.equal(x.agotado, false);
});

test("sin la ventana semanal, el reinicio de la de 5 h no borra el límite informado", () => {
  const x = leerProveedor("codex", {
    ok: true,
    primary: { usedPercent: 0, windowDurationMins: 300, resetsAt: AHORA - 5 },
    reached: "rate_limit",
  }, AHORA);
  assert.equal(x.agotado, true);
});

test("ritmos parejos: rige la asignación medida", () => {
  const r = decidir({ claude: claude(50, 50), codex: codex(45, 50) });
  assert.equal(r.desvio, null);
  assert.equal(r.roles.explorer.proveedor, "claude");
  assert.equal(r.roles.planner.proveedor, "codex");
  assert.equal(r.roles.implementer.proveedor, "codex");
  assert.equal(r.roles.reviewer.proveedor, "claude");
  assert.equal(r.conductorDelega, false);
});

test("Claude más rápido por más de 0,25: los roles de Claude pasan a Codex y el conductor delega", () => {
  const r = decidir({ claude: claude(84, 74), codex: codex(1, 17) });
  assert.equal(r.desvio, "claude");
  assert.equal(r.roles.explorer.proveedor, "codex");
  assert.equal(r.conductorDelega, true);
  // La revisión sigue en otro proveedor que el implementer (Codex).
  assert.equal(r.roles.reviewer.proveedor, "claude");
  assert.equal(r.roles["security-reviewer"].proveedor, "claude");
  assert.equal(r.roles.tester.proveedor, "claude");
});

test("Codex más rápido: planner, implementer y debugger pasan a Claude y la revisión a Codex", () => {
  const r = decidir({ claude: claude(20, 50), codex: codex(60, 50) });
  assert.equal(r.desvio, "codex");
  assert.equal(r.roles.planner.proveedor, "claude");
  assert.equal(r.roles.implementer.proveedor, "claude");
  assert.equal(r.roles.debugger.proveedor, "claude");
  assert.equal(r.roles.reviewer.proveedor, "codex");
});

test("histéresis: entre 0,10 y 0,25 se mantiene el estado anterior", () => {
  const a = claude(60, 50); // 1,20
  const b = codex(50, 50); //  1,00 → diferencia 0,20
  assert.equal(calcularDesvio(a, b, null), null);
  assert.equal(calcularDesvio(a, b, "claude"), "claude");
  assert.equal(calcularDesvio(claude(54, 50), b, "claude"), null); // 0,08
});

test("--implementer fija el proveedor de la revisión", () => {
  const base = { claude: claude(50, 50), codex: codex(50, 50) };
  assert.equal(decidir({ ...base, implementer: "claude" }).roles.reviewer.proveedor, "codex");
  assert.equal(decidir({ ...base, implementer: "codex" }).roles.reviewer.proveedor, "claude");
  assert.equal(decidir({ ...base, implementer: "ninguno" }).roles.reviewer.proveedor, "claude");
});

test("ventana de 5 h en 90% o más: los roles flexibles van al otro proveedor", () => {
  const r = decidir({ claude: claude(50, 50), codex: codex(50, 50, 92) });
  for (const rol of ["planner", "implementer", "debugger"]) {
    assert.equal(r.roles[rol].proveedor, "claude", rol);
    assert.match(r.roles[rol].motivo, /ventana de 5 h en 92%/);
  }
});

test("Claude sobre el tope de 5 h: tester y release siguen con aviso y el conductor delega", () => {
  const r = decidir({ claude: claude(50, 50, 95), codex: codex(50, 50) });
  assert.equal(r.roles.tester.proveedor, "claude");
  assert.equal(r.roles.tester.aviso, true);
  assert.equal(r.roles.explorer.proveedor, "codex");
  assert.equal(r.conductorDelega, true);
});

test("Claude agotado: tester y release quedan sin proveedor y el conductor delega", () => {
  const r = decidir({ claude: claude(100, 80), codex: codex(20, 50) });
  assert.equal(r.roles.tester.proveedor, "ninguno");
  assert.equal(r.roles.release.proveedor, "ninguno");
  assert.equal(r.conductorDelega, true);
});

test("la revisión cruzada pesa más que el tope de 5 h", () => {
  const r = decidir({ claude: claude(50, 50, 92), codex: codex(50, 50), implementer: "codex" });
  assert.equal(r.roles.reviewer.proveedor, "claude");
  assert.equal(r.roles.reviewer.aviso, true);
});

test("la revisión cruzada solo cede si el otro proveedor está agotado", () => {
  const r = decidir({ claude: claude(100, 80), codex: codex(20, 50), implementer: "codex" });
  assert.equal(r.roles.reviewer.proveedor, "codex");
  assert.match(r.roles.reviewer.motivo, /mismo proveedor/);
});

test("los dos agotados: ningún proveedor", () => {
  const r = decidir({ claude: claude(100, 80), codex: codex(100, 80) });
  for (const rol of Object.keys(r.roles)) assert.equal(r.roles[rol].proveedor, "ninguno", rol);
});

test("los dos sobre el tope de 5 h: sigue el que tiene más margen", () => {
  const r = decidir({ claude: claude(50, 50, 97), codex: codex(50, 50, 91) });
  assert.equal(r.roles.explorer.proveedor, "codex");
  assert.equal(r.roles.planner.proveedor, "codex");
  assert.equal(r.roles.planner.aviso, true);
});

test("Codex agotado: sigue Claude solo, incluida la revisión", () => {
  const r = decidir({ claude: claude(90, 50), codex: codex(100, 80) });
  for (const rol of ["explorer", "planner", "implementer", "debugger", "reviewer"]) {
    assert.equal(r.roles[rol].proveedor, "claude", rol);
  }
  assert.equal(r.conductorDelega, false);
});

test("reached informado cuenta como agotado", () => {
  assert.equal(codex(30, 50, 40, "rate_limit").agotado, true);
});

test("Codex agotado y Claude sobre el tope de 5 h: va a Claude igual", () => {
  const r = decidir({ claude: claude(50, 50, 95), codex: codex(100, 80) });
  assert.equal(r.roles.planner.proveedor, "claude");
});

test("Claude con la ventana de 5 h en 60% o más: sus roles flexibles pasan a Codex y el conductor delega", () => {
  const r = decidir({ claude: claude(50, 50, 65), codex: codex(50, 50, 20), implementer: "ninguno" });
  assert.equal(r.desvio, null);
  assert.equal(r.roles.explorer.proveedor, "codex");
  assert.match(r.roles.explorer.motivo, /claude con la ventana de 5 h en 65%/);
  assert.equal(r.roles.reviewer.proveedor, "codex");
  assert.equal(r.roles.implementer.proveedor, "codex");
  assert.equal(r.conductorDelega, true);
});

test("Claude bajo 60% en la ventana de 5 h: rige la asignación medida", () => {
  const r = decidir({ claude: claude(50, 50, 59), codex: codex(50, 50, 20) });
  assert.equal(r.roles.explorer.proveedor, "claude");
  assert.equal(r.conductorDelega, false);
});

test("presión de 5 h con desvío contra Codex: los roles flexibles vuelven a Codex", () => {
  const r = decidir({ claude: claude(20, 50, 70), codex: codex(60, 50, 10) });
  assert.equal(r.desvio, "codex");
  assert.equal(r.roles.implementer.proveedor, "codex");
  assert.match(r.roles.implementer.motivo, /claude con la ventana de 5 h/);
});

test("los dos con la ventana de 5 h en 60% o más: no hay cambio por presión", () => {
  const r = decidir({ claude: claude(50, 50, 70), codex: codex(50, 50, 65) });
  assert.equal(r.roles.explorer.proveedor, "claude");
  assert.equal(r.roles.implementer.proveedor, "codex");
});

test("la revisión cruzada pesa más que la presión de 5 h", () => {
  const r = decidir({ claude: claude(50, 50, 70), codex: codex(50, 50, 10), implementer: "codex" });
  assert.equal(r.roles.reviewer.proveedor, "claude");
});

test("Codex con la ventana de 5 h en 60% o más y Claude libre: los puentes pasan a Claude", () => {
  const r = decidir({ claude: claude(50, 50, 10), codex: codex(50, 50, 75) });
  assert.equal(r.roles.planner.proveedor, "claude");
  assert.equal(r.roles.implementer.proveedor, "claude");
});
