# Checkpoints con el humano

> Aplica a toda sesión de Claude Code: se carga desde `~/.claude/CLAUDE.md`.
> Un checkpoint es cualquier mensaje en que el agente necesita que el humano
> valide, apruebe o decida algo antes de seguir: preguntas del intake,
> bifurcaciones a mitad del trabajo y aprobaciones (push, PR, deploy).

## La regla: cada decisión se entiende sola

El humano trabaja con varios agentes a la vez. Una pregunta que lo obliga a
scrollear para saber a qué se refiere le cuesta una vuelta, y esa vuelta la
pagan todos los agentes que esperan su respuesta. Por eso cada decisión lleva,
en el mismo bloque:

- **Un ID estable** (`D1`, `D2`…) y la pregunta en una línea.
- **El contexto mínimo**: dos o tres líneas, lo justo para decidir sin leer
  nada más.
- **Las opciones descritas**, no solo sus letras. Nunca "¿(a) o (b)?" si (a)
  y (b) se explicaron más arriba o en otro mensaje.
- **La recomendación** y, si aplica, el default ("si no dices nada, sigo con
  A").
- **Qué pasa después** de responder, cuando no es obvio.
- **El material a revisar** (descripción de PR, capturas, copy largo) no se
  pega en el mensaje: va a un archivo de `revision/` (ver abajo) y se da la
  ruta absoluta con un comando para abrirlo, porque las rutas no son
  clickeables en su terminal: `! notepad "C:\…\pr-2.md"` o
  `! start "" "C:\…\capturas"`. No se pide aprobar algo que no se mostró.

Si una decisión sigue abierta desde un checkpoint anterior, se vuelve a
escribir entera; no se referencia.

## Forma del mensaje

```
Hecho: <3 a 5 líneas como máximo: qué cambió desde el último checkpoint>

━━ 2 decisiones · IDS-3812 ━━━━━━━━━━━━━━━━━━━━

D1 · ¿Push y PR del PR 2?
  Rama fix/IDS-3812_jerarquia, 2 commits, 7 archivos. Reviewer sin
  bloqueantes, tests en verde.
  Título y descripción: ! notepad "C:\…\revision\2026-09-24-IDS-3812\pr-2.md"
  → ok | cambios            Recomiendo: ok

D2 · ¿Cómo van las capturas en el PR?
  La API de Bitbucket no adjunta imágenes a la descripción.
  A · tú las arrastras al editor del PR (quedan en Bitbucket)
  B · van como adjunto en Jira y el PR enlaza a la card
  → A | B                   Recomiendo: A

Responde: D1 ok, D2 A
```

- **El reporte va arriba y corto.** En la terminal lo último visible es el
  final del mensaje: ahí van las decisiones, y como se entienden solas no hace
  falta subir.
- **Lo que no hace falta para decidir no va en el checkpoint**: errores
  propios ya resueltos, detalles de la mecánica, hallazgos fuera de alcance.
  Eso va a la síntesis final o al archivo de revisión.
- **Nada se decide en silencio a mitad del texto.** Si tomaste un default que
  el humano podría querer cambiar, preséntalo como decisión con ese default.
- **En sesiones en segundo plano**, la línea `needs input:` resume las
  decisiones en una línea, con sus opciones:
  `needs input: D1 push del PR 2 (ok/cambios) · D2 capturas (A tú las arrastras / B adjunto en Jira)`.

Un checkpoint chico (una decisión, sin material que revisar) no necesita
archivo: basta con la terminal.

## Cómo responde el humano: mixto

- **Hasta 4 decisiones con opciones cerradas** → `AskUserQuestion`. El texto
  de cada pregunta lleva su propio contexto, y se usa `preview` cuando
  comparar se ve mejor (mockups, fragmentos de código, textos antes y
  después). El mensaje previo al widget es solo el reporte corto: no repite
  las decisiones.
- **Material largo, más de 4 decisiones o preguntas abiertas** → decisiones
  en texto con la forma de arriba, y el humano responde en una línea
  (`D1 ok, D2 B`).

## Dónde van los archivos para revisar: `revision/`

Todo lo que se deja para que el humano revise va en el directorio de trabajo
del proyecto al que pertenece:

```
<proyecto>-meta/revision/<YYYY-MM-DD>-<card o tema>/
  checkpoint.md      ← decisiones de la ronda en curso y lo ya resuelto
  pr-2.md            ← material: borradores, capturas/, alternativas/…
```

- **Una carpeta por card o tema**, con la fecha en que se abrió. Cada ronda
  nueva **actualiza** `checkpoint.md` en vez de crear `para-revisar-2`,
  `para-revisar-3`: las decisiones ya respondidas bajan a una sección
  `## Resuelto`, con la respuesta del humano.
- `checkpoint.md` abre con este encabezado, pensado para que un visor lo lea:

  ```
  ---
  proyecto: cognus
  tema: IDS-3812
  estado: pendiente        # pendiente | resuelto
  actualizado: 2026-09-24 16:11
  ---
  ```

  y sigue con las decisiones en la misma forma de la terminal
  (`## D1 · ¿…?`). Cuando todo está respondido pasa a `estado: resuelto`. No
  se borra: queda como traza de lo decidido.
- **Qué proyecto:** el del `*-meta` donde corre la sesión. Si la sesión corre
  directo en un repo de código, usa el `*-meta` que declara ese repo en su
  `CLAUDE.md` (por ejemplo, `cognus-meta` para `app-mobile-flutter`). Si no
  hay ninguno, pregunta una vez dónde dejarlo. Si `revision/` no existe, se
  crea.
- **Nunca** en una carpeta compartida que mezcle proyectos (como la antigua
  `claude-meta/Claude outputs/`) ni dentro del repo de código.
- `revision/` no se versiona: está en el `.gitignore` del meta. Es material
  pasajero; lo durable va a `decisions/`. `handoffs/` sigue siendo para la
  próxima sesión; `revision/` es para el humano.
