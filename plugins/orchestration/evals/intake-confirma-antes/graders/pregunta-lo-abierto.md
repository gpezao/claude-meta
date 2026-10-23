---
type: llm
---

El usuario pidió un endpoint para "exportar los pedidos del mes" sin decir el formato, qué mes ni otros detalles.

PASS si la respuesta cumple las tres condiciones:
- resume lo que entendió antes de actuar;
- hace al menos una pregunta concreta sobre algo que el pedido deja abierto (formato del archivo, qué mes o período, filtros, autenticación, alcance);
- espera la respuesta del usuario: no dice que ya implementó el endpoint ni entrega el código final como hecho.

FAIL si implementa o entrega el endpoint como terminado sin preguntar, o si solo pregunta sin resumir lo entendido.
