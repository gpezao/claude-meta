# Revierte instalar.ps1: detiene el vigía y borra el protocolo, el nombre de
# los avisos, el acceso directo de arranque y la carpeta de datos (log y estado).

$datos = Join-Path $env:LOCALAPPDATA 'companero'
$latido = Join-Path $datos 'vigia.pid'
if (Test-Path $latido) {
    $vigiaPid = (Get-Content $latido -Raw | ConvertFrom-Json).pid
    $proceso = Get-Process -Id $vigiaPid -ErrorAction SilentlyContinue
    if ($proceso -and $proceso.ProcessName -eq 'node') { Stop-Process -Id $vigiaPid -Confirm:$false }
}

Remove-Item -Path 'HKCU:\Software\Classes\companero' -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item -Path 'HKCU:\Software\Classes\AppUserModelId\ClaudeMeta.Companero' -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item -Path (Join-Path ([Environment]::GetFolderPath('Startup')) 'Compañero (vigía).lnk') -Force -ErrorAction SilentlyContinue
Remove-Item -Path $datos -Recurse -Force -ErrorAction SilentlyContinue

Write-Output 'Compañero desinstalado.'
