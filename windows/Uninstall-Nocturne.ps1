[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$InstallDir = Join-Path $env:LOCALAPPDATA 'Programs\Nocturne'
$LegacyInstallDir = Join-Path $env:LOCALAPPDATA 'Nocturne'
$DataDir = Join-Path $env:LOCALAPPDATA 'Nocturne\data'

function Write-Step {
    param([string]$Message)
    Write-Host ''
    Write-Host ('==> ' + $Message) -ForegroundColor Cyan
}

function Stop-NocturneServer {
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
                (
                    $commandLine.IndexOf('index.js', [StringComparison]::OrdinalIgnoreCase) -ge 0 -or
                    $commandLine.IndexOf('control.js', [StringComparison]::OrdinalIgnoreCase) -ge 0
                )
            ) {
                Stop-Process -Id $process.ProcessId -Force -ErrorAction SilentlyContinue
                Write-Host ('    Stopped Nocturne server (PID ' + $process.ProcessId + ').')
            }
        }
    } catch {
        Write-Host '    Could not inspect running Node processes.' -ForegroundColor DarkYellow
    }
}

Write-Step 'Stopping Nocturne'
Stop-NocturneServer

Write-Step 'Removing shortcuts and login startup'
$programs = [Environment]::GetFolderPath('Programs')
$shortcuts = @(
    (Join-Path ([Environment]::GetFolderPath('Desktop')) 'Nocturne.lnk'),
    (Join-Path ([Environment]::GetFolderPath('Startup')) 'Nocturne.lnk')
)
if ($programs) {
    $shortcuts += (Join-Path $programs 'Nocturne.lnk')
    $shortcuts += (Join-Path $programs 'Nocturne\Nocturne.lnk')
    $shortcuts += (Join-Path $programs 'Nocturne\Stop Nocturne.lnk')
    $shortcuts += (Join-Path $programs 'Nocturne\Uninstall Nocturne.lnk')
}
foreach ($shortcut in $shortcuts) {
    if (Test-Path -LiteralPath $shortcut) {
        Remove-Item -LiteralPath $shortcut -Force -ErrorAction SilentlyContinue
        Write-Host ('    Removed ' + $shortcut)
    }
}
if ($programs) {
    $startMenuFolder = Join-Path $programs 'Nocturne'
    if (Test-Path -LiteralPath $startMenuFolder) {
        try {
            Remove-Item -LiteralPath $startMenuFolder -Force -ErrorAction Stop
        } catch {
            # Files may still be open; an empty folder is harmless.
        }
    }
}

if (-not (Test-Path -LiteralPath $InstallDir)) {
    Write-Host ''
    Write-Host 'Nocturne is not installed for this Windows account.' -ForegroundColor Green
    if (Test-Path -LiteralPath $DataDir) {
        Write-Host ('Your saved Nocturne settings are still at ' + $DataDir + '.')
    }
    exit 0
}

Write-Step 'Removing the Nocturne app'
try {
    Remove-Item -LiteralPath $InstallDir -Recurse -Force -ErrorAction Stop
    Write-Host '    App files removed.'
} catch {
    Write-Host ''
    Write-Host ('Some app files could not be removed. Close Nocturne windows, then delete this folder:' + $InstallDir) -ForegroundColor Yellow
}

if (Test-Path -LiteralPath $DataDir) {
    Write-Host ''
    Write-Host 'Your Plex sign-in is stored separately so reinstalling keeps it.'
    $answer = Read-Host ('Also delete the saved Plex connection in ' + $DataDir + '? [y/N]')
    if ($answer -match '^(?i)y') {
        try {
            Remove-Item -LiteralPath $DataDir -Recurse -Force -ErrorAction Stop
            Write-Host '    Saved Plex connection deleted.'
        } catch {
            Write-Host ('    Could not delete ' + $DataDir + '. Remove it manually if you want.') -ForegroundColor Yellow
        }
    } else {
        Write-Host ('    Kept ' + $DataDir + ' for your next install.') -ForegroundColor DarkGray
    }
}

Write-Host ''
Write-Host 'Nocturne has been uninstalled. Plex and your media are unchanged.' -ForegroundColor Green
