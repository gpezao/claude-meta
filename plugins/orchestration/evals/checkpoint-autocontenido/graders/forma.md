---
type: llm
---

La respuesta le pide al usuario dos decisiones: push y PR, y cómo van las capturas.

PASS si se cumplen todas:
- cada decisión tiene un ID (D1, D2) y su pregunta en una línea;
- cada decisión trae su propio contexto mínimo (rama, estado de tests o revisión; la limitación de la API para las capturas), de modo que se entiende sin leer el resto del mensaje;
- las opciones de las capturas están descritas en palabras, no solo como letras sueltas;
- cada decisión trae una recomendación;
- el material a revisar (la descripción del PR) se indica por su ruta, no se pega entero;
- hay una línea final que muestra cómo responder en una línea (por ejemplo "Responde: D1 ok, D2 A").

FAIL si alguna decisión remite a otra parte del mensaje para entenderse ("ver arriba"), si las opciones son solo letras, o si falta la recomendación.
