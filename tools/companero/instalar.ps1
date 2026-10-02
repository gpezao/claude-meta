# Instala el compañero (etapa 0) para el usuario actual. No necesita
# administrador y se revierte con desinstalar.ps1.
#
# 1. Registra el protocolo companero: para que el clic en un aviso abra la sesión.
# 2. Registra el nombre "Compañero" con el que aparecen los avisos.
# 3. Crea el acceso directo de arranque en la carpeta Inicio.
# 4. Lanza el vigía.

$ErrorActionPreference = 'Stop'
$null = Get-Command node -ErrorAction Stop

$protocolo = 'HKCU:\Software\Classes\companero'
$abrir = Join-Path $PSScriptRoot 'abrir-sesion.ps1'
New-Item -Path "$protocolo\shell\open\command" -Force | Out-Null
Set-ItemProperty -Path $protocolo -Name '(default)' -Value 'URL:Compañero (Claude Code)'
Set-ItemProperty -Path $protocolo -Name 'URL Protocol' -Value ''
Set-ItemProperty -Path "$protocolo\shell\open\command" -Name '(default)' `
    -Value "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$abrir`" `"%1`""

$aumid = 'HKCU:\Software\Classes\AppUserModelId\ClaudeMeta.Companero'
New-Item -Path $aumid -Force | Out-Null
Set-ItemProperty -Path $aumid -Name 'DisplayName' -Value 'Compañero'

$acceso = Join-Path ([Environment]::GetFolderPath('Startup')) 'Compañero (vigía).lnk'
$shell = New-Object -ComObject WScript.Shell
$atajo = $shell.CreateShortcut($acceso)
$atajo.TargetPath = 'powershell.exe'
$atajo.Arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$(Join-Path $PSScriptRoot 'iniciar-vigia.ps1')`""
$atajo.WorkingDirectory = $PSScriptRoot
$atajo.Description = 'Vigía del compañero: avisa cuando una sesión de Claude Code te necesita.'
$atajo.Save()

& (Join-Path $PSScriptRoot 'iniciar-vigia.ps1')

Write-Output 'Compañero instalado:'
Write-Output "  · protocolo companero: → $abrir"
Write-Output "  · arranque automático → $acceso"
Write-Output "  · log del vigía → $env:LOCALAPPDATA\companero\vigia.log"
