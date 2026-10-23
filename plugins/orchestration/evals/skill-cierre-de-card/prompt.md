---
description: Al terminar el código de una card, el agente carga la skill cierre-de-card.
expected_outcome: Se invoca la skill cierre-de-card y la respuesta nombra tester, reviewer, release con ok del humano y la retro.
tags: [skills]
plugins: ["../.."]
max_turns: 6
allowed_tools: [Skill, Read]
---

Ya está escrito el código de la card PAY-12 (validación de montos en el checkout). ¿Qué pasos siguen antes de dar la card por terminada? No ejecutes nada todavía: dime el orden.
