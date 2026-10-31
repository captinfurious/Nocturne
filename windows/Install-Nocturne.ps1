[CmdletBinding()]
param(
    [switch]$NoStartup,
    [switch]$NoLaunch
)

$ErrorActionPreference = 'Stop'
$AppName = 'Nocturne'
$SourceDir = Split-Path -Parent $PSScriptRoot
$InstallDir = Join-Path $env:LOCALAPPDATA 'Programs\Nocturne'
$DataDir = Join-Path $env:LOCALAPPDATA 'Nocturne\data'
$LegacyInstallDir = Join-Path $env:LOCALAPPDATA 'Nocturne'
$ExePath = Join-Path $InstallDir 'Nocturne.exe'
$ManifestPath = Join-Path $InstallDir 'install.json'
$PortableTempRoot = $null

function Write-Step {
    param([string]$Message)
    Write-Host ''
    Write-Host ('==> ' + $Message) -ForegroundColor Cyan
}

function Stop-WithError {
    param([string]$Message)
    Write-Host ''
    Write-Host ('ERROR: ' + $Message) -ForegroundColor Red
    exit 1
}

function Find-NodePath {
    $command = Get-Command node.exe -CommandType Application -ErrorAction SilentlyContinue
    if ($command -and $command.Source) { return $command.Source }

    $candidates = @()
    if ($env:ProgramFiles) {
        $candidates += (Join-Path $env:ProgramFiles 'nodejs\node.exe')
    }
    if (${env:ProgramFiles(x86)}) {
        $candidates += (Join-Path ${env:ProgramFiles(x86)} 'nodejs\node.exe')
    }

    foreach ($candidate in $candidates) {
        if (Test-Path -LiteralPath $candidate) { return $candidate }
    }
    return $null
}

function Get-NodeDetails {
    param([string]$Path)

    if (-not $Path -or -not (Test-Path -LiteralPath $Path)) { return $null }

    $version = [string](& $Path --version)
    $version = $version.Trim()
    if ($LASTEXITCODE -ne 0 -or $version -notmatch '^v(\d+)\.(\d+)\.') { return $null }

    return [pscustomobject]@{
        Path = $Path
        Version = $version
        Major = [int]$Matches[1]
        Minor = [int]$Matches[2]
    }
}

function Select-NocturnePort {
    param([string]$Sid)

    # Different Windows accounts get different loopback ports so one account's
    # running server can never be mistaken for another account's app.
    $hash = 0
    foreach ($character in $Sid.ToCharArray()) {
        $hash = (($hash * 31) + [int]$character) % 500
    }

    $canCheck = [bool](Get-Command Get-NetTCPConnection -ErrorAction SilentlyContinue)
    for ($offset = 0; $offset -lt 30; $offset++) {
        $candidate = 8800 + (($hash + $offset) % 500)
        if (-not $canCheck) { return $candidate }

        try {
            $listeners = Get-NetTCPConnection -LocalPort $candidate -State Listen -ErrorAction SilentlyContinue
            if (-not $listeners) { return $candidate }
        } catch {
            return $candidate
        }
    }

    return 8787
}

function Install-PortableNode {
    $tempRoot = Join-Path $env:TEMP ('nocturne-node-' + [Guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Force -Path $tempRoot | Out-Null
    $script:PortableTempRoot = $tempRoot

    [Net.ServicePointManager]::SecurityProtocol = (
        [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
    )

    Write-Host '    Looking up the current Node.js LTS release...'
    $releases = Invoke-RestMethod -Uri 'https://nodejs.org/dist/index.json' -UseBasicParsing -TimeoutSec 60
    $release = $releases | Where-Object {
        $_.lts -and ($_.files -contains 'win-x64-zip')
    } | Select-Object -First 1

    if (-not $release -or -not $release.version) {
        throw 'Could not find a Windows 64-bit Node.js LTS download.'
    }

    $version = [string]$release.version
    $zipName = 'node-' + $version + '-win-x64.zip'
    $baseUrl = 'https://nodejs.org/dist/' + $version + '/'
    $zipPath = Join-Path $tempRoot $zipName

    Write-Host ('    Downloading Node.js ' + $version + ' (about 40 MB)...')
    $previousProgress = $ProgressPreference
    $ProgressPreference = 'SilentlyContinue'
    try {
        Invoke-WebRequest -Uri ($baseUrl + $zipName) -OutFile $zipPath -UseBasicParsing -TimeoutSec 900 | Out-Null
    } finally {
        $ProgressPreference = $previousProgress
    }

    Write-Host '    Verifying the download...'
    $shaResponse = Invoke-WebRequest -Uri ($baseUrl + 'SHASUMS256.txt') -UseBasicParsing -TimeoutSec 60
    $shaLine = ($shaResponse.Content -split "`n") | Where-Object {
        $_ -match ('\s' + [regex]::Escape($zipName) + '\s*$')
    } | Select-Object -First 1
    if (-not $shaLine) {
        throw 'The Node.js checksum file did not list the downloaded archive.'
    }

    $expected = ($shaLine -split '\s+')[0].Trim().ToLowerInvariant()
    $actual = (Get-FileHash -LiteralPath $zipPath -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($expected -ne $actual) {
        throw 'The Node.js download did not match its published SHA-256 checksum.'
    }

    $extractRoot = Join-Path $tempRoot 'unpacked'
    Expand-Archive -LiteralPath $zipPath -DestinationPath $extractRoot -Force
    $nodeExe = Get-ChildItem -LiteralPath $extractRoot -Recurse -Filter 'node.exe' | Select-Object -First 1
    if (-not $nodeExe) {
        throw 'The downloaded Node.js archive did not contain node.exe.'
    }

    Write-Host ('    Node.js ' + $version + ' is ready.')
    return $nodeExe.Directory.FullName
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
                $commandLine.IndexOf('index.js', [StringComparison]::OrdinalIgnoreCase) -ge 0
            ) {
                Stop-Process -Id $process.ProcessId -Force -ErrorAction SilentlyContinue
                Write-Host ('    Stopped an older Nocturne server (PID ' + $process.ProcessId + ').')
            }
        }
    } catch {
        Write-Host '    Could not inspect running Node processes; continuing.' -ForegroundColor DarkYellow
    }
    Start-Sleep -Milliseconds 800
}

function New-NocturneShortcut {
    param(
        [string]$Path,
        [string]$Arguments
    )

    if (Test-Path -LiteralPath $Path) {
        Remove-Item -LiteralPath $Path -Force -ErrorAction SilentlyContinue
    }

    $shell = New-Object -ComObject WScript.Shell
    $shortcut = $shell.CreateShortcut($Path)
    $shortcut.TargetPath = $ExePath
    $shortcut.Arguments = $Arguments
    $shortcut.WorkingDirectory = $InstallDir
    $shortcut.IconLocation = ($ExePath + ',0')
    $shortcut.Description = 'Nocturne - your Plex library, redesigned'
    $shortcut.Save()
}

if (-not $env:LOCALAPPDATA) {
    Stop-WithError 'Windows did not provide a per-user application folder. Run this installer while signed in as yourself.'
}

$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object -TypeName Security.Principal.WindowsPrincipal -ArgumentList $identity
if ($principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Stop-WithError 'Close this Administrator window and double-click Install Nocturne.cmd normally. Nocturne installs for the signed-in user and must not register startup for an administrator account.'
}

if (-not (Test-Path -LiteralPath (Join-Path $SourceDir 'package.json'))) {
    Stop-WithError 'This installer must stay inside the Nocturne project folder. Download the whole project and run windows\Install Nocturne.cmd again.'
}

$packagePath = Join-Path $SourceDir 'package.json'
$package = Get-Content -LiteralPath $packagePath -Raw | ConvertFrom-Json
if (-not $package.dependencies.express -or -not $package.dependencies.dotenv) {
    Stop-WithError 'The project package.json is missing its server dependencies.'
}

Write-Step 'Checking Node.js'
$node = $null
$nodePath = Find-NodePath
if ($nodePath) {
    $node = Get-NodeDetails -Path $nodePath
}

if ($node -and ($node.Major -lt 22 -or ($node.Major -eq 22 -and $node.Minor -lt 12))) {
    Write-Host ('The installed Node.js ' + $node.Version + ' is too old for Nocturne.')
    $node = $null
} elseif (-not $node -and $nodePath) {
    Write-Host 'The Node.js found on this PC could not be started.'
} elseif (-not $nodePath) {
    Write-Host 'Nocturne did not find Node.js on this PC.'
}

if (-not $node) {
    Write-Host 'Nocturne can download a private Node.js runtime for itself, without changing Windows.'
    $downloadAnswer = Read-Host 'Download the Node.js runtime now? [Y/n]'
    if ($downloadAnswer -eq '' -or $downloadAnswer -match '^(?i)y') {
        try {
            $portableNode = Join-Path (Install-PortableNode) 'node.exe'
            $node = Get-NodeDetails -Path $portableNode
            if (-not $node) {
                throw 'The downloaded Node.js runtime could not be started.'
            }
        } catch {
            Write-Host ('    Could not download Node.js: ' + $_.Exception.Message) -ForegroundColor Yellow
            $node = $null
        }
    }
}

if (-not $node) {
    Write-Host 'Nocturne still needs a working Node.js runtime to build its local server.'
    $winget = Get-Command winget.exe -CommandType Application -ErrorAction SilentlyContinue

    if (-not $winget) {
        Stop-WithError 'Install Node.js LTS from https://nodejs.org, then run this installer again.'
    }

    $answer = Read-Host 'Install the current Node.js LTS with winget now? [Y/n]'
    if ($answer -ne '' -and $answer -notmatch '^(?i)y') {
        Stop-WithError 'Node.js is required. Install it from https://nodejs.org, then run this installer again.'
    }

    & winget install --id OpenJS.NodeJS.LTS -e --silent --accept-package-agreements --accept-source-agreements
    if ($LASTEXITCODE -ne 0) {
        Stop-WithError 'winget could not install Node.js. Install it from https://nodejs.org, then try again.'
    }

    $nodePath = Find-NodePath
    if ($nodePath) {
        $node = Get-NodeDetails -Path $nodePath
    }
    if (-not $node) {
        Stop-WithError 'Node.js was installed, but this window cannot see it yet. Close this window, open a new one, and run the installer again.'
    }
    if ($node.Major -lt 22 -or ($node.Major -eq 22 -and $node.Minor -lt 12)) {
        Stop-WithError ('Node.js ' + $node.Version + ' is too old. Install Node.js 22.12 or newer from https://nodejs.org.')
    }
}

$nodePath = $node.Path
$nodeVersion = $node.Version
Write-Host ('    Using Node.js ' + $nodeVersion + ' at ' + $nodePath)

$npmPath = Join-Path (Split-Path -Parent $nodePath) 'npm.cmd'
if (-not (Test-Path -LiteralPath $npmPath)) {
    $npmCommand = Get-Command npm.cmd -CommandType Application -ErrorAction SilentlyContinue
    if ($npmCommand -and $npmCommand.Source) { $npmPath = $npmCommand.Source }
}
if (-not (Test-Path -LiteralPath $npmPath)) {
    Stop-WithError 'npm was not found next to Node.js. Reinstall Node.js from https://nodejs.org, then try again.'
}

Write-Step 'Preparing the Nocturne interface (this can take a minute)'
$distIndex = Join-Path $SourceDir 'dist\index.html'
Push-Location $SourceDir
try {
    & $npmPath install --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) {
        Stop-WithError 'npm install failed. Check your internet connection, then run the installer again.'
    }
    & $npmPath run build
    if ($LASTEXITCODE -ne 0) {
        Stop-WithError 'The Nocturne interface build failed. Run "npm run build" in the project folder to see the error.'
    }
} finally {
    Pop-Location
}

if (-not (Test-Path -LiteralPath $distIndex)) {
    Stop-WithError 'The build finished without creating dist\index.html. Run "npm run build" to see the error.'
}

Write-Step 'Stopping an older Nocturne server'
Stop-NocturneServer

Write-Step ('Installing Nocturne to ' + $InstallDir)
New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null

$port = Select-NocturnePort -Sid $identity.User.Value
[System.IO.File]::WriteAllText(
    (Join-Path $InstallDir 'port.txt'),
    ($port.ToString() + [Environment]::NewLine),
    (New-Object System.Text.UTF8Encoding($false))
)
Write-Host ('    Using the private local port ' + $port + '.')

foreach ($folder in @('server', 'dist', 'public')) {
    $source = Join-Path $SourceDir $folder
    if (-not (Test-Path -LiteralPath $source)) {
        Stop-WithError ('The project is missing the "' + $folder + '" folder.')
    }
    $target = Join-Path $InstallDir $folder
    if (Test-Path -LiteralPath $target) {
        Remove-Item -LiteralPath $target -Recurse -Force
    }
    Copy-Item -LiteralPath $source -Destination $target -Recurse -Force
}

foreach ($script in @('Uninstall-Nocturne.ps1', 'Stop-Nocturne.ps1')) {
    $source = Join-Path $PSScriptRoot $script
    if (Test-Path -LiteralPath $source) {
        Copy-Item -LiteralPath $source -Destination (Join-Path $InstallDir $script) -Force
    }
}

$runtimePackage = [ordered]@{
    name = 'nocturne-runtime'
    private = $true
    version = [string]$package.version
    type = 'module'
    dependencies = [ordered]@{
        dotenv = [string]$package.dependencies.dotenv
        express = [string]$package.dependencies.express
    }
}
$runtimeJson = $runtimePackage | ConvertTo-Json -Depth 5
[System.IO.File]::WriteAllText(
    (Join-Path $InstallDir 'package.json'),
    $runtimeJson,
    (New-Object System.Text.UTF8Encoding($false))
)

Write-Step 'Preparing your local app data'
New-Item -ItemType Directory -Force -Path $DataDir | Out-Null
$sourceConfig = Join-Path $SourceDir 'data\config.json'
$installedConfig = Join-Path $DataDir 'config.json'
if ((Test-Path -LiteralPath $sourceConfig) -and -not (Test-Path -LiteralPath $installedConfig)) {
    Write-Host ''
    Write-Host 'A Plex connection was found in the project folder.'
    $copyAnswer = Read-Host 'Copy it into the installed app? Only say Yes if this is your own Plex account. [Y/n]'
    if ($copyAnswer -eq '' -or $copyAnswer -match '^(?i)y') {
        Copy-Item -LiteralPath $sourceConfig -Destination $installedConfig -Force
        Write-Host '    Existing Plex connection copied.'
    }
}

# Move a connection from an early development install without deleting the old folder.
$legacyConfig = Join-Path $LegacyInstallDir 'data\config.json'
if ((Test-Path -LiteralPath $legacyConfig) -and -not (Test-Path -LiteralPath $installedConfig)) {
    Copy-Item -LiteralPath $legacyConfig -Destination $installedConfig -Force
    Write-Host '    Existing Plex connection brought forward.'
}

Write-Step 'Installing the local server components'
Push-Location $InstallDir
try {
    & $npmPath install --omit=dev --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) {
        Stop-WithError 'Could not install Nocturne''s local server components. Check your internet connection, then try again.'
    }
} finally {
    Pop-Location
}

Write-Step 'Bundling the Nocturne runtime'
$runtimeDir = Join-Path $InstallDir 'runtime'
if (Test-Path -LiteralPath $runtimeDir) {
    Remove-Item -LiteralPath $runtimeDir -Recurse -Force
}
New-Item -ItemType Directory -Force -Path $runtimeDir | Out-Null

$runtimeNode = Join-Path $runtimeDir 'node.exe'
Copy-Item -LiteralPath $nodePath -Destination $runtimeNode -Force
if (-not (Test-Path -LiteralPath $runtimeNode)) {
    Stop-WithError 'Nocturne could not copy the Node.js runtime into the app folder.'
}

$bundledVersion = [string](& $runtimeNode --version)
if ($LASTEXITCODE -ne 0 -or $bundledVersion.Trim() -ne $nodeVersion) {
    Stop-WithError 'The bundled Node.js runtime could not run from the Nocturne app folder. Install Node.js from https://nodejs.org and run the installer again.'
}

# node.exe is redistributed with Nocturne, so keep Node's license beside it.
$licenseSource = Join-Path (Split-Path -Parent $nodePath) 'LICENSE'
$licenseTarget = Join-Path $runtimeDir 'NODE-LICENSE.txt'
if (Test-Path -LiteralPath $licenseSource) {
    Copy-Item -LiteralPath $licenseSource -Destination $licenseTarget -Force
} else {
    try {
        Invoke-WebRequest -Uri ('https://nodejs.org/dist/' + $nodeVersion + '/LICENSE') -OutFile $licenseTarget -UseBasicParsing -TimeoutSec 60 | Out-Null
    } catch {
        Write-Host '    Could not download the Node.js license file; the runtime itself is ready.' -ForegroundColor DarkYellow
    }
}
Write-Host ('    Bundled Node.js ' + $nodeVersion + ' with the app.')

Write-Step 'Building the Nocturne app launcher'
$cscPath = $null
foreach ($candidate in @(
    (Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'),
    (Join-Path $env:WINDIR 'Microsoft.NET\Framework\v4.0.30319\csc.exe')
)) {
    if (Test-Path -LiteralPath $candidate) {
        $cscPath = $candidate
        break
    }
}
if (-not $cscPath) {
    Stop-WithError 'Windows'' built-in .NET compiler was not found. Nocturne needs the standard .NET Framework 4 installation that ships with Windows 10 and 11.'
}

$launcherSource = Join-Path $PSScriptRoot 'NocturneLauncher.cs'
$iconPath = Join-Path $PSScriptRoot 'nocturne.ico'
if (-not (Test-Path -LiteralPath $launcherSource)) {
    Stop-WithError 'The installer is missing NocturneLauncher.cs. Download the complete project and try again.'
}
if (Test-Path -LiteralPath $ExePath) {
    Remove-Item -LiteralPath $ExePath -Force -ErrorAction SilentlyContinue
}

$compilerArgs = @(
    '/nologo',
    '/target:winexe',
    (    '/out:' + $ExePath),
    '/r:System.dll',
    '/r:System.Core.dll'
)
if (Test-Path -LiteralPath $iconPath) {
    $compilerArgs += ('/win32icon:' + $iconPath)
}
$compilerArgs += $launcherSource

& $cscPath $compilerArgs
if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $ExePath)) {
    Stop-WithError 'Windows could not build Nocturne.exe. Run the installer again; if it keeps failing, report the compiler output above.'
}

Write-Step 'Creating shortcuts'
$desktop = [Environment]::GetFolderPath('Desktop')
$programs = [Environment]::GetFolderPath('Programs')
$startup = [Environment]::GetFolderPath('Startup')
$startMenuFolder = if ($programs) { Join-Path $programs 'Nocturne' } else { $null }

# Remove the flat shortcut used by early builds so there is only one app entry.
$legacyStartMenuShortcut = if ($programs) { Join-Path $programs 'Nocturne.lnk' } else { $null }
if ($legacyStartMenuShortcut -and (Test-Path -LiteralPath $legacyStartMenuShortcut)) {
    Remove-Item -LiteralPath $legacyStartMenuShortcut -Force -ErrorAction SilentlyContinue
}

if ($desktop) {
    New-NocturneShortcut -Path (Join-Path $desktop 'Nocturne.lnk') -Arguments ''
    Write-Host '    Desktop shortcut created.'
}
if ($startMenuFolder) {
    New-Item -ItemType Directory -Force -Path $startMenuFolder | Out-Null
    New-NocturneShortcut -Path (Join-Path $startMenuFolder 'Nocturne.lnk') -Arguments ''

    $uninstallScript = Join-Path $InstallDir 'Uninstall-Nocturne.ps1'
    $stopScript = Join-Path $InstallDir 'Stop-Nocturne.ps1'
    if ((Test-Path -LiteralPath $uninstallScript) -and (Test-Path -LiteralPath $stopScript)) {
        $shell = New-Object -ComObject WScript.Shell

        $stopShortcut = $shell.CreateShortcut((Join-Path $startMenuFolder 'Stop Nocturne.lnk'))
        $stopShortcut.TargetPath = (Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe')
        $stopShortcut.Arguments = '-NoProfile -ExecutionPolicy Bypass -NoExit -File "' + $stopScript + '"'
        $stopShortcut.WorkingDirectory = $InstallDir
        $stopShortcut.IconLocation = ($ExePath + ',0')
        $stopShortcut.Description = 'Stop the Nocturne background server'
        $stopShortcut.Save()

        $uninstallShortcut = $shell.CreateShortcut((Join-Path $startMenuFolder 'Uninstall Nocturne.lnk'))
        $uninstallShortcut.TargetPath = (Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe')
        $uninstallShortcut.Arguments = '-NoProfile -ExecutionPolicy Bypass -NoExit -File "' + $uninstallScript + '"'
        $uninstallShortcut.WorkingDirectory = $InstallDir
        $uninstallShortcut.IconLocation = ($ExePath + ',0')
        $uninstallShortcut.Description = 'Remove Nocturne from this Windows account'
        $uninstallShortcut.Save()
    }
    Write-Host '    Start menu shortcuts created.'
}

$startWithWindows = $true
if ($NoStartup) {
    $startWithWindows = $false
} else {
    $startupAnswer = Read-Host 'Start Nocturne server automatically when you sign in to Windows? [Y/n]'
    if ($startupAnswer -ne '' -and $startupAnswer -notmatch '^(?i)y') {
        $startWithWindows = $false
    }
}

if ($startup) {
    $startupShortcut = Join-Path $startup 'Nocturne.lnk'
    if ($startWithWindows) {
        New-NocturneShortcut -Path $startupShortcut -Arguments '--background --delay 15'
        Write-Host '    Login startup enabled (waits 15 seconds for Plex).'
    } elseif (Test-Path -LiteralPath $startupShortcut) {
        Remove-Item -LiteralPath $startupShortcut -Force -ErrorAction SilentlyContinue
        Write-Host '    Login startup disabled.'
    }
}

$installedAt = (Get-Date).ToUniversalTime().ToString('o')
if (Test-Path -LiteralPath $ManifestPath) {
    try {
        $previous = Get-Content -LiteralPath $ManifestPath -Raw | ConvertFrom-Json
        if ($previous.installedAt) { $installedAt = [string]$previous.installedAt }
    } catch {
        # A damaged manifest is replaced below.
    }
}

$manifest = [ordered]@{
    version = [string]$package.version
    installDir = $InstallDir
    dataDir = $DataDir
    port = $port
    runAtLogin = $startWithWindows
    installedAt = $installedAt
    updatedAt = (Get-Date).ToUniversalTime().ToString('o')
}
[System.IO.File]::WriteAllText(
    $ManifestPath,
    ($manifest | ConvertTo-Json -Depth 4),
    (New-Object System.Text.UTF8Encoding($false))
)

Write-Host ''
if ($PortableTempRoot -and (Test-Path -LiteralPath $PortableTempRoot)) {
    Remove-Item -LiteralPath $PortableTempRoot -Recurse -Force -ErrorAction SilentlyContinue
}

Write-Host 'Nocturne is installed.' -ForegroundColor Green
Write-Host ('    App:        ' + $ExePath)
Write-Host ('    Data:       ' + $DataDir)
Write-Host ('    Server log: ' + (Join-Path $InstallDir 'logs\server.log'))
Write-Host '    Uninstall:  Start Menu > Nocturne > Uninstall Nocturne'

if (-not $NoLaunch) {
    Write-Step 'Opening Nocturne'
    Start-Process -FilePath $ExePath
}
