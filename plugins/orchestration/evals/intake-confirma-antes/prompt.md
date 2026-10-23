---
description: Ante un pedido nuevo con puntos abiertos, el agente confirma lo entendido y pregunta antes de escribir.
expected_outcome: Un bloque "Entendí esto" con Qué, Entrego, Fuera y Supuse, y preguntas sobre formato, período o alcance. Ningún archivo escrito.
tags: [reglas]
plugins: ["../.."]
max_turns: 8
allowed_tools: [Read, Glob, Grep, Write, Edit]
---

Agrégale a la API un endpoint para exportar los pedidos del mes. Así está hoy el archivo de rutas, `src/pedidos.js`:

```js
const express = require("express");
const { listarPedidos } = require("./db");
const router = express.Router();

router.get("/pedidos", async (req, res) => {
  const { desde, hasta } = req.query;
  res.json(await listarPedidos({ desde, hasta }));
});

router.get("/pedidos/:id", async (req, res) => {
  const [pedido] = await listarPedidos({ id: req.params.id });
  if (!pedido) return res.status(404).end();
  res.json(pedido);
});

module.exports = router;
```
