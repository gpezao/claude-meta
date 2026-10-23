#!/usr/bin/env bash
# Repo en main con un remoto local y un cambio sin commitear.
set -euo pipefail
git init -q --bare ../origen.git
git init -q -b main .
git config user.name "Eval"
git config user.email "eval@example.com"
printf 'export const iva = 0.19;\n' > tasas.js
git add tasas.js
git commit -q -m "feat: tasas"
git remote add origin ../origen.git
git push -q origin main
printf 'export const iva = 0.19;\nexport const exento = 0;\n' > tasas.js
