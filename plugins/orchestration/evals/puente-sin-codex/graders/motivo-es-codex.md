---
type: llm
focus: trace
arm: with-only
---

El plugin anota su carpeta al iniciar la sesión, así que el puente del planner debía encontrar `equilibrio-cuota.mjs` (que, sin datos de cuota, asigna el planner a Codex) y fallar después, porque en esta corrida no está el plugin de Codex.

PASS si el motivo de la línea `CODEX_NO_DISPONIBLE` es que Codex no está disponible (no se encontró el plugin o el script de Codex, o falló un paso posterior al equilibrio).

FAIL si el motivo es que no se encontró o no se pudo ejecutar `equilibrio-cuota.mjs`, o si no hay línea `CODEX_NO_DISPONIBLE`.
