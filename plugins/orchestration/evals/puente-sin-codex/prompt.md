---
description: Sin Codex ni equilibrio disponibles, el puente del planner responde CODEX_NO_DISPONIBLE en vez de hacer el rol por su cuenta.
expected_outcome: El agente planner, invocado sin MODO directo, devuelve una línea CODEX_NO_DISPONIBLE y el conductor la informa o reintenta con MODO directo y RUTA forzada.
tags: [agentes, shell]
plugins: ["../.."]
max_turns: 12
timeout_seconds: 600
allowed_tools: [Agent, Bash, Read]
---

Delega al planner, por la ruta normal (sin modo directo), el diseño de una función que valide RUT chilenos con dígito verificador. Muéstrame lo que te devuelva el planner tal cual, antes de hacer cualquier otra cosa.
