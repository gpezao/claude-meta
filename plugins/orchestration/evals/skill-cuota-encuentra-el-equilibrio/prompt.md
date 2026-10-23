---
description: El conductor corre el equilibrio de cuota con la ruta del plugin que anota el hook de inicio de sesión, aunque el plugin no esté en el cache del marketplace.
expected_outcome: Se corre equilibrio-cuota.mjs leyendo ~/.claude/cache/orchestration-raiz y la respuesta informa en qué proveedor va el planner según la salida del script.
tags: [shell]
plugins: ["../.."]
max_turns: 8
timeout_seconds: 300
allowed_tools: [Skill, Bash, Read]
---

Corre el equilibrio de cuota y dime en qué proveedor va hoy el planner. Solo eso: no delegues nada.
