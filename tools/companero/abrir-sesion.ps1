# Manejador del protocolo companero: (lo registra instalar.ps1). Windows lo
# invoca al hacer clic en un aviso y abre esa sesión con `claude attach`: en
# Git Bash y, si no está instalado, en Windows Terminal.
#
# Cualquier página o programa puede invocar un protocolo registrado, así que
# solo se acepta companero:attach/<id> con un id de 8 caracteres hexadecimales.
# -SoloValidar imprime el id (o sale con código 1) sin abrir nada; lo usan las pruebas.

param([string]$Uri, [switch]$SoloValidar)

function Registrar([string]$mensaje) {
    if ($SoloValidar) { return }
    $dir = Join-Path $env:LOCALAPPDATA 'companero'
    New-Item -ItemType Directory -Path $dir -Force | Out-Null
    Add-Content -Path (Join-Path $dir 'clics.log') -Value "$((Get-Date).ToString('s')) $mensaje" -Encoding UTF8
}

if ($Uri -cnotmatch '^companero:(//)?attach/([0-9a-f]{8})/?$') {
    Registrar "rechazado: $Uri"
    exit 1
}
$id = $Matches[2]
if ($SoloValidar) { $id; exit 0 }
Registrar "abre la sesión $id"

$gitBash = Join-Path $env:ProgramFiles 'Git\git-bash.exe'
if (Test-Path $gitBash) {
    Start-Process -FilePath $gitBash -ArgumentList @('-c', "`"claude attach $id; exec bash -l`"")
}
elseif (Get-Command wt.exe -ErrorAction SilentlyContinue) {
    Start-Process -FilePath 'wt.exe' -ArgumentList @('new-tab', 'cmd', '/k', "claude attach $id")
}
