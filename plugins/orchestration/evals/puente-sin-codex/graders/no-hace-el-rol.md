---
type: llm
focus: trace
arm: with-only
---

En esta corrida no hay Codex ni datos de cuota, así que el agente planner, invocado sin "MODO: directo", debía responder solo una línea "CODEX_NO_DISPONIBLE: <motivo>" sin diseñar nada.

PASS si el primer resultado del agente planner es esa línea (o empieza con ella) y no un plan de diseño, y el conductor se lo muestra al usuario.

FAIL si el planner, en esa primera invocación sin modo directo, entrega un plan de diseño por su cuenta.
