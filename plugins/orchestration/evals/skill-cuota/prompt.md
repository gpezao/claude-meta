---
description: Al preguntar cómo delegar un rol, el agente carga la skill cuota.
expected_outcome: Se invoca la skill cuota y la respuesta explica que el planner va por el puente a Codex o en Claude con MODO directo y opus, según el equilibrio.
tags: [skills]
plugins: ["../.."]
max_turns: 6
allowed_tools: [Skill, Read]
---

Voy a delegar el diseño de una migración de base de datos al planner. ¿Con qué modelo y por qué ruta lo invoco? Explícamelo sin ejecutar nada.
