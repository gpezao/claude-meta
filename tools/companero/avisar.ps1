# Muestra un aviso nativo de Windows. Lo llama vigia.mjs; no necesita módulos.
#
# -Datos: JSON en base64 (UTF-8) con titulo, texto, sonido (bool) y accion
# (URI companero:attach/<id> que se abre al hacer clic, o null).

param([Parameter(Mandatory)][string]$Datos)

$ErrorActionPreference = 'Stop'
$aviso = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($Datos)) | ConvertFrom-Json

[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
[Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime] | Out-Null

# instalar.ps1 registra el nombre "Compañero"; sin instalar, el aviso sale a
# nombre de Windows PowerShell.
$aumid = 'ClaudeMeta.Companero'
if (-not (Test-Path "HKCU:\Software\Classes\AppUserModelId\$aumid")) {
    $aumid = '{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\WindowsPowerShell\v1.0\powershell.exe'
}

# El XML se arma con System.Xml para que los textos queden escapados.
$xml = New-Object System.Xml.XmlDocument
$toast = $xml.CreateElement('toast')
[void]$xml.AppendChild($toast)
if ($aviso.accion) {
    $toast.SetAttribute('activationType', 'protocol')
    $toast.SetAttribute('launch', $aviso.accion)
}
$visual = $xml.CreateElement('visual')
$binding = $xml.CreateElement('binding')
$binding.SetAttribute('template', 'ToastGeneric')
foreach ($linea in @($aviso.titulo, $aviso.texto)) {
    if ($linea) {
        $texto = $xml.CreateElement('text')
        $texto.InnerText = $linea
        [void]$binding.AppendChild($texto)
    }
}
[void]$visual.AppendChild($binding)
[void]$toast.AppendChild($visual)
$audio = $xml.CreateElement('audio')
if ($aviso.sonido) { $audio.SetAttribute('src', 'ms-winsoundevent:Notification.Default') }
else { $audio.SetAttribute('silent', 'true') }
[void]$toast.AppendChild($audio)

$documento = New-Object Windows.Data.Xml.Dom.XmlDocument
$documento.LoadXml($xml.OuterXml)
$notificacion = [Windows.UI.Notifications.ToastNotification]::new($documento)
[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($aumid).Show($notificacion)
