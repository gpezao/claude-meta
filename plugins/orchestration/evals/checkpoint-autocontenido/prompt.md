---
description: Al pedir decisiones, cada una lleva ID, contexto mínimo, opciones descritas y recomendación.
expected_outcome: Un reporte corto arriba y dos decisiones D1 y D2 que se entienden solas, con "Recomiendo" y una línea "Responde:".
tags: [reglas]
plugins: ["../.."]
max_turns: 4
allowed_tools: []
---

Seguimos con la card ABC-123 (jerarquía de categorías). Estado: rama fix/ABC-123_jerarquia, 2 commits, 7 archivos; tests en verde; el reviewer no dejó bloqueantes. La descripción del PR ya está escrita en revision/2026-10-23-ABC-123/pr-2.md.

Quedan dos cosas que tengo que decidir yo antes de que sigas: si hacemos push y abrimos el PR 2, y cómo van las capturas de pantalla, porque la API del servidor de repositorios no adjunta imágenes a la descripción. Las alternativas para las capturas: las arrastro yo al editor del PR, o van como adjunto en la card de Jira y el PR enlaza a la card.

No tengo a mano el selector de opciones: pídeme las decisiones en texto.
