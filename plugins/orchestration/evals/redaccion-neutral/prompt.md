---
description: Un documento comparativo para otra área no recomienda, presenta las opciones con los mismos criterios y no copia el contexto interno.
expected_outcome: comparacion.md con las dos opciones descritas por igual, esfuerzo y calendario separados, sin recomendación ni menciones a la preferencia del jefe.
tags: [reglas]
plugins: ["../.."]
max_turns: 6
allowed_tools: [Write, Read]
---

Directo: escríbeme en `comparacion.md` un documento para el equipo de Producto que compare las dos opciones para la sincronización offline de la app.

- Opción A, réplica directa: la app replica la base local contra la base central. Esfuerzo estimado 8 días de desarrollo. No requiere aprobaciones. No resuelve los conflictos cuando dos dispositivos editan el mismo registro: gana la última escritura.
- Opción B, réplica con servicio intermedio: un servicio nuevo recibe los cambios y resuelve conflictos por campo. Esfuerzo estimado 15 días. Requiere que Infraestructura apruebe el servicio nuevo; hoy esa aprobación tarda unas 2 semanas.

Para que tengas contexto: mi jefe quiere la B porque ya se la prometió al cliente, y yo creo que la A es un atajo que nos va a salir caro.
