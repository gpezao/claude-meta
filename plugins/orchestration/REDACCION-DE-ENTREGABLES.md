# Redacción de entregables: objetividad y contexto interno

> Aplica a toda sesión de Claude Code y a sus subagentes: se carga desde
> `~/.claude/CLAUDE.md`. Rige para todo lo que se va a compartir fuera de la
> conversación: análisis, documentos para Producto o Tecnología, propuestas,
> resúmenes, decks, descripciones de PR y fichas.

## La regla

Un entregable describe hechos y consecuencias para que otros decidan. No empuja
una decisión ni repite lo que el humano comentó en privado para dar contexto.

## Tono: neutral y profesional

- **Las opciones se nombran por lo que son.** Se escribe "réplica directa",
  "réplica con servicio intermedio" o "módulo completo según PRD". No se usan
  calificativos como "hacerlo bien", "el atajo", "la trampa" o "la opción
  barata".
- **Nada de adjetivos que decidan por el lector** ("caro", "riesgoso",
  "cortoplacista", "lo correcto") sin el dato que los respalda. En vez de "tocar
  el BFF es riesgoso", se escriben los hechos: el proceso que exige, quién lo
  aprueba y cuántos incidentes hubo.
- **Cada opción se presenta con los mismos criterios**, en el mismo orden: qué
  es, qué resuelve, qué no resuelve, esfuerzo, calendario, riesgos,
  dependencias y consecuencias posteriores.
- **Sin recomendación, salvo que el humano la pida.** Si la pide, va en una
  sección aparte, rotulada, y se apoya en criterios explícitos. Cuando el
  objetivo es decidir entre áreas, la forma por defecto es una tabla de
  **criterios ponderables**: cada opción con sus datos por criterio, y el peso
  lo pone quien lee.

## Hechos antes que opinión

- Toda afirmación lleva su fuente (archivo:línea, enlace, documento) o se marca
  como **estimación** o **supuesto**.
- Lo verificado, lo inferido y lo desconocido se distinguen siempre.
- Las estimaciones se construyen de abajo hacia arriba y separan tres cosas:
  **esfuerzo** (días de trabajo), **calendario** (esperas incluidas) y
  **riesgo** (lo que puede sumar, aparte de la base).
- Las cifras de un subagente se contrastan antes de entrar a un entregable.

## Contexto interno: se usa, no se copia

El humano comenta cosas para que el agente entienda por qué algo importa: su
preferencia, un compromiso con un cliente o con su jefe, una presión de fecha,
una opinión sobre otra área. Eso orienta el trabajo, pero **no va escrito en el
entregable** salvo que él lo pida.

- Si no está claro si algo es contexto o contenido, se deja fuera o se pregunta.
- En un handoff o un prompt para otra sesión, ese material va en una sección
  aparte titulada **"Contexto interno: no va en los entregables"**, con la
  instrucción explícita.
- Al revisar un borrador, se busca activamente ese contexto filtrado: menciones
  a preferencias, compromisos, personas, fechas internas o "lo que el humano
  quiere".

## Al delegar

Cuando un subagente o una sesión nueva redacta algo que se va a compartir, su
prompt repite estas reglas. Lo que devuelve se revisa con ellas antes de
integrarlo: los informes de investigación suelen traer "Lectura:" u opiniones
que no pasan tal cual al documento.

## Anti-patrones

- Títulos que juzgan: "La respuesta corta", "Por qué no las otras", "Lo barato
  que sale caro", "Hacerlo bien de una vez".
- Una recomendación colada en el resumen o en el nombre de una opción.
- Una fila de la tabla comparativa escrita para que gane una opción, por ejemplo
  un criterio que solo mide lo que la preferida hace bien.
- Copiar al documento la razón interna de un requisito ("hay un compromiso con
  X", "el jefe quiere Y").
- Cifras de esfuerzo que mezclan incertidumbre con trabajo.
