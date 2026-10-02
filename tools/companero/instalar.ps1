# Instala el compañero (etapa 0) para el usuario actual. No necesita
# administrador y se revierte con desinstalar.ps1.
#
# 1. Registra el protocolo companero: para que el clic en un aviso abra la sesión.
# 2. Registra el nombre "Compañero" con el que aparecen los avisos.
# 3. Crea el acceso directo de arranque en la carpeta Inicio.
# 4. Lanza el vigía.

$ErrorActionPreference = 'Stop'
$null = Get-Command node -ErrorAction Stop

# En Windows 11, conhost --headless corre PowerShell sin mostrar ninguna
# consola. En Windows 10 se usa -WindowStyle Hidden, que deja ver la consola un
# instante.
$sinVentana = [Environment]::OSVersion.Version.Build -ge 22000
function ComandoOculto([string]$script, [string]$argumentos = '') {
    $ps = "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$script`" $argumentos".TrimEnd()
    if ($sinVentana) { return @{ Programa = 'conhost.exe'; Argumentos = "--headless $ps" } }
    return @{ Programa = 'powershell.exe'; Argumentos = $ps.Substring('powershell.exe '.Length) }
}

$protocolo = 'HKCU:\Software\Classes\companero'
$abrir = Join-Path $PSScriptRoot 'abrir-sesion.ps1'
$alAbrir = ComandoOculto $abrir '"%1"'
New-Item -Path "$protocolo\shell\open\command" -Force | Out-Null
Set-ItemProperty -Path $protocolo -Name '(default)' -Value 'URL:Compañero (Claude Code)'
Set-ItemProperty -Path $protocolo -Name 'URL Protocol' -Value ''
Set-ItemProperty -Path "$protocolo\shell\open\command" -Name '(default)' `
    -Value "$($alAbrir.Programa) $($alAbrir.Argumentos)"

$aumid = 'HKCU:\Software\Classes\AppUserModelId\ClaudeMeta.Companero'
New-Item -Path $aumid -Force | Out-Null
Set-ItemProperty -Path $aumid -Name 'DisplayName' -Value 'Compañero'

$acceso = Join-Path ([Environment]::GetFolderPath('Startup')) 'Compañero (vigía).lnk'
$shell = New-Object -ComObject WScript.Shell
$atajo = $shell.CreateShortcut($acceso)
$alIniciar = ComandoOculto (Join-Path $PSScriptRoot 'iniciar-vigia.ps1')
$atajo.TargetPath = $alIniciar.Programa
$atajo.Arguments = $alIniciar.Argumentos
$atajo.WorkingDirectory = $PSScriptRoot
$atajo.Description = 'Vigía del compañero: avisa cuando una sesión de Claude Code te necesita.'
$atajo.Save()

& (Join-Path $PSScriptRoot 'iniciar-vigia.ps1')

Write-Output 'Compañero instalado:'
Write-Output "  · protocolo companero: → $abrir"
Write-Output "  · arranque automático → $acceso"
Write-Output "  · log del vigía → $env:LOCALAPPDATA\companero\vigia.log"
