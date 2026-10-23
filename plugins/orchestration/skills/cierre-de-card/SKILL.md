---
name: cierre-de-card
description: Cómo se cierra una card o un PR en el modelo orquestado. Pasa por tester, reviewer y security-reviewer si aplica, después release con el ok del humano, y termina con la retro de cinco líneas y las restricciones de plataforma. Usar cuando el implementer (o el conductor) terminó de escribir el código de una card, antes de declarar algo terminado, hacer commit, push o abrir un PR, y al cerrar la card.
---

# Cierre de card

Regla dura: **el conductor no declara algo terminado con su sola opinión.**
Terminado = `tester` en verde + `reviewer` sin hallazgos abiertos (y
`security-reviewer` cuando aplica). Antes de eso es "supuestamente listo".

## 1. Tester

- Corre siempre que la card tiene criterios Given/When/Then (los del
  entendimiento del intake). Devuelve la prueba ejecutada y PASS/FAIL por
  criterio.
- Las pruebas las corre el agente, no el humano: el tester corre todo, y lo
  que falle vuelve al implementer con la evidencia. Al humano llegan solo las
  decisiones que son suyas.
- Un FAIL que admite dos lecturas es una bifurcación: se pregunta con la
  forma de `CHECKPOINTS.md` en vez de elegir en silencio.

## 2. Reviewer y security-reviewer

- `reviewer` lee el diff real antes de commitear: calidad, riesgos, código
  muerto, scope creep, convenciones.
- `security-reviewer` es **gate obligatorio** si el cambio toca SQL dinámico,
  credenciales, auth, PII, uploads, endpoints públicos o llamadas externas con
  secretos. Opcional si es lógica interna pura.
- La revisión corre en un proveedor distinto al del implementer (revisión
  cruzada, skill `cuota`): con `--implementer <claude|codex>` el equilibrio
  dice dónde.
- Los hallazgos se corrigen y se vuelve a pasar por tester y reviewer hasta
  que no quedan abiertos. Un hallazgo discutible es una decisión del humano.

## 3. Fuera de alcance

Lo que aparece fuera del alcance de la card no se arregla en caliente ni
abre una card por hallazgo. Se anota en el handoff de la épica, en una sección
dedicada, con archivo y línea, qué está mal y qué consecuencia tiene. Al
terminar las cards de la épica, esa lista es una última card.

## 4. Release

La red de seguridad (rama para cambios no triviales, verify antes de un
deploy, dump antes de algo destructivo en la BD) está en "Autoridad total"
de `MODELO-OPERATIVO.md`, que es la fuente. Al cerrar una card:

- `release` publica solo lo que pasó `tester` y `reviewer`.
- Push, PR y deploy son acciones hacia afuera: van a un checkpoint con la
  descripción del PR en `revision/` y esperan el ok del humano, salvo que haya
  una autorización durable para ese proyecto.

## 5. Retro de cinco líneas

Al cerrar la card (mergeada, o descartada), el conductor escribe
`META_DIR/retrospectives/<YYYY-MM-DD>-<card>.md`:

```
# Retro · <card> · <fecha>
- Salió: <qué se entregó, en una línea; PR o commit>
- Costó: <rondas con el humano, vueltas de tester/reviewer, roles y proveedores usados, sorpresas de cuota>
- Lección: <lo que conviene hacer distinto la próxima vez>
- Plataforma: <restricción nueva de una plataforma destino, o "ninguna">
```

Son cinco líneas, el título y cuatro campos, no un informe. Si no hubo
lección, se escribe "ninguna": el registro de que no la hubo también sirve.

## 6. Restricciones de plataforma

Si la retro trae una restricción de plataforma (un límite de UI, el
comportamiento de un cliente, un contrato de renderizado, algo del sandbox o
de la herramienta), sube a la sección "Restricciones de plataforma
acumuladas" de `MODELO-OPERATIVO.md` para no redescubrirla.

Se edita en el checkout del repo `claude-meta`, en una rama, nunca en la
copia del plugin instalado (se pisa al actualizarlo) ni en el steering de
Kiro. El commit pasa por un checkpoint, como cualquier publicación, y el
espejo a Kiro corre después.

`MODELO-OPERATIVO.md` vive en un repo público: la restricción se escribe de
forma genérica, sin nombres de clientes, proyectos, cards ni rutas
personales. El detalle con nombres queda en la retro, que es local.
