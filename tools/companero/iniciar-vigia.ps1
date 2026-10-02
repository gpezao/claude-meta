# Lanza el vigía en segundo plano, sin ventana. Lo usa el acceso directo de la
# carpeta Inicio que crea instalar.ps1; también sirve para lanzarlo a mano.
# Si ya hay un vigía corriendo, el nuevo sale solo.

$node = (Get-Command node -ErrorAction Stop).Source
$vigia = Join-Path $PSScriptRoot 'vigia.mjs'
Start-Process -FilePath $node -ArgumentList "`"$vigia`"" -WindowStyle Hidden
