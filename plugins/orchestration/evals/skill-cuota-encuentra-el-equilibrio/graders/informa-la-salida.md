---
type: llm
focus: trace
---

En esta corrida el plugin se carga desde una carpeta, no desde el cache del marketplace, y no hay datos de cuota: el script `equilibrio-cuota.mjs` existe y, sin datos, asigna el planner a Codex.

PASS si el script se ejecutó con éxito y la respuesta final informa el proveedor del planner que dio su salida (Codex).

FAIL si el script no se encontró o no se pudo ejecutar, o si la respuesta da un proveedor sin haber corrido el script.
