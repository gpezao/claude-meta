# Notas de sesión

> Aplica a toda sesión de Claude Code: se carga desde `~/.claude/CLAUDE.md`.
> La compactación automática resume la conversación cerca de los 300k tokens.
> Lo que quedó solo dicho en la conversación puede perder detalle en ese
> resumen; lo que está en un archivo, no.

## La regla

Desde la primera corrección, preferencia o decisión del humano en la sesión,
el agente lleva un archivo de notas y lo actualiza **en el momento**, no al
final. Una corrección que solo quedó dicha se puede perder al compactar.

No hace falta para una pregunta suelta que se responde en un par de turnos.

## Dónde

```
<proyecto>-meta/handoffs/notas-<YYYY-MM-DD>-<tema>.md
```

El `*-meta` es el mismo que define `CHECKPOINTS.md` para `revision/`: el de la
sesión, o el que declara el repo de código en su `CLAUDE.md`. Si no hay
ninguno, se pregunta una vez dónde dejarlo. Un archivo por tema de trabajo; si
la sesión cambia de tema, empieza otro.

## Qué lleva

```
# Notas · <tema> · <fecha>

## Objetivo
<qué se está haciendo, en una o dos líneas>

## Correcciones y preferencias del humano
- <lo que dijo, lo más literal posible>

## Decisiones
- D1 · <pregunta> → <respuesta del humano>

## Estado y pendiente
- <qué está hecho, qué falta, en qué rama o archivo>
```

- **Correcciones y preferencias**: lo más literal posible. Es lo que más se
  pierde al resumir.
- Lo que vale para otras sesiones también va a la memoria, como siempre. Las
  notas son de este trabajo.
- Es material interno: no se copia a un entregable (ver
  `REDACCION-DE-ENTREGABLES.md`).

## Cuándo se usan

- **Aviso de contexto.** Desde 250k tokens, un hook del plugin
  `orchestration` le avisa al agente. El agente completa las notas, termina o
  delega lo que tiene en curso, no empieza nada grande y, al llegar a un punto
  de corte, se lo dice al humano en una línea.
- **Después de compactar.** Otro hook le devuelve al agente el contenido de
  sus notas. Son la fuente de verdad sobre lo que el humano corrigió y decidió.
- **Sesión nueva.** Las notas sirven de handoff para retomar el trabajo.
