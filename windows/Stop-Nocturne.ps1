[CmdletBinding()]
param()

$InstallDir = Join-Path $env:LOCALAPPDATA 'Programs\Nocturne'
$LegacyInstallDir = Join-Path $env:LOCALAPPDATA 'Nocturne'
$stopped = 0

try {
    $processes = Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction SilentlyContinue
    foreach ($process in $processes) {
        $commandLine = [string]$process.CommandLine
        if (-not $commandLine) { continue }

        $insideApp = $commandLine.IndexOf('--nocturne-installed', [StringComparison]::OrdinalIgnoreCase) -ge 0
        if (-not $insideApp) {
            foreach ($folder in @($InstallDir, $LegacyInstallDir)) {
                if ($folder -and $commandLine.IndexOf($folder, [StringComparison]::OrdinalIgnoreCase) -ge 0) {
                    $insideApp = $true
                    break
                }
            }
        }

        if (
            $insideApp -and
            $commandLine.IndexOf('server', [StringComparison]::OrdinalIgnoreCase) -ge 0 -and
            $commandLine.IndexOf('index.js', [StringComparison]::OrdinalIgnoreCase) -ge 0
        ) {
            Stop-Process -Id $process.ProcessId -Force -ErrorAction SilentlyContinue
            Write-Host ('Stopped Nocturne server (PID ' + $process.ProcessId + ').')
            $stopped += 1
        }
    }
} catch {
    Write-Host 'Could not inspect running Node processes.' -ForegroundColor DarkYellow
    exit 1
}

if ($stopped -eq 0) {
    Write-Host 'No installed Nocturne server is running.'
} else {
    Write-Host 'Nocturne has stopped. Plex is not affected.'
}
