# Trae al frente la ventana de Git Bash que acaba de abrir abrir-sesion.ps1.
# Se carga con ". .\ventana.ps1".
#
# Windows solo deja tomar el foco al proceso que recibió la última entrada del
# usuario; si no, la ventana nueva queda detrás. Para levantar ese bloqueo se
# une un momento la entrada de este hilo con la de la ventana activa.

Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;

namespace Companero {
    public static class Ventana {
        [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
        [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr hWnd, IntPtr pid);
        [DllImport("kernel32.dll")] static extern uint GetCurrentThreadId();
        [DllImport("user32.dll")] static extern bool AttachThreadInput(uint idAttach, uint idAttachTo, bool attach);
        [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr hWnd);
        [DllImport("user32.dll")] static extern bool BringWindowToTop(IntPtr hWnd);
        [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
        [DllImport("user32.dll")] static extern bool IsIconic(IntPtr hWnd);

        public static bool EsLaActiva(IntPtr hWnd) { return GetForegroundWindow() == hWnd; }

        public static bool AlFrente(IntPtr hWnd) {
            if (IsIconic(hWnd)) ShowWindow(hWnd, 9); // SW_RESTORE
            uint hiloActivo = GetWindowThreadProcessId(GetForegroundWindow(), IntPtr.Zero);
            uint yo = GetCurrentThreadId();
            bool unido = hiloActivo != 0 && hiloActivo != yo && AttachThreadInput(yo, hiloActivo, true);
            try {
                BringWindowToTop(hWnd);
                return SetForegroundWindow(hWnd);
            } finally {
                if (unido) AttachThreadInput(yo, hiloActivo, false);
            }
        }
    }
}
'@

# Espera la primera ventana de Git Bash (mintty) abierta desde $Desde y la trae
# al frente. Devuelve $true si quedó como la ventana activa.
function Traer-GitBashAlFrente([datetime]$Desde, [int]$PlazoSegundos = 8) {
    $fin = (Get-Date).AddSeconds($PlazoSegundos)
    while ((Get-Date) -lt $fin) {
        $mintty = Get-Process mintty -ErrorAction SilentlyContinue |
            Where-Object { $_.StartTime -ge $Desde.AddSeconds(-1) -and $_.MainWindowHandle -ne [IntPtr]::Zero } |
            Sort-Object StartTime -Descending | Select-Object -First 1
        if ($mintty) {
            [void][Companero.Ventana]::AlFrente($mintty.MainWindowHandle)
            Start-Sleep -Milliseconds 200
            return [Companero.Ventana]::EsLaActiva($mintty.MainWindowHandle)
        }
        Start-Sleep -Milliseconds 150
    }
    return $false
}
