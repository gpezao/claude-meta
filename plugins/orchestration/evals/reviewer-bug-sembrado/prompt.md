---
description: El reviewer del plugin encuentra un error sembrado en un diff.
expected_outcome: Se delega al agente reviewer y el informe señala que el corte de la página pierde el último elemento.
tags: [agentes]
plugins: ["../.."]
max_turns: 10
timeout_seconds: 600
allowed_tools: [Agent, Read]
---

Pásale este diff al reviewer antes de commitear. Es la paginación del listado de pedidos; los tests de la card todavía no cubren el caso de páginas completas.

```diff
--- a/src/paginar.js
+++ b/src/paginar.js
@@ -1,9 +1,14 @@
-function paginar(todos, pagina) {
-  return todos.slice(pagina * 20, pagina * 20 + 20);
+// Devuelve la página pedida (desde 1) con su tamaño y el total de páginas.
+function paginar(todos, pagina, tam = 20) {
+  if (pagina < 1) throw new RangeError("la página empieza en 1");
+  const inicio = (pagina - 1) * tam;
+  return {
+    items: todos.slice(inicio, inicio + tam - 1),
+    paginas: Math.ceil(todos.length / tam),
+  };
 }

 module.exports = { paginar };
```
