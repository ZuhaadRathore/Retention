<#
Bootstraps Retention's Python + Node dependencies and launches the backend + frontend.
#>
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Definition
Set-Location $scriptRoot

$pythonCandidates = @(
    @{ Command = 'py'; Args = @('-3.11') },
    @{ Command = 'py'; Args = @('-3.10') },
    @{ Command = 'python'; Args = @() }
)

function Select-Python {
    param([array]$Candidates)

    foreach ($candidate in $Candidates) {
        $command = $candidate.Command
        $extraArgs = if ($candidate.Args) { @($candidate.Args) } else { @() }

        $versionArgs = @()
        $versionArgs += $extraArgs
        $versionArgs += '--version'

        try {
            $versionOutput = (& $command $versionArgs 2>&1).Trim()
        } catch {
            continue
        }

        if ($versionOutput -match 'Python\s+(\d+)\.(\d+)') {
            $version = [Version]("$($matches[1]).$($matches[2])")
            if ($version -lt [Version]'3.10') {
                continue
            }

            $execArgs = @()
            $execArgs += $extraArgs
            $execArgs += '-c'
            $execArgs += 'import sys;print(sys.executable)'

            try {
                $executablePath = (& $command $execArgs).Trim()
            } catch {
                continue
            }

            if ([string]::IsNullOrWhiteSpace($executablePath)) {
                continue
            }

            return [PSCustomObject]@{
                Command    = $command
                Args       = $extraArgs
                Version    = $version
                Executable = $executablePath
            }
        }
    }

    return $null
}

$pythonInfo = Select-Python $pythonCandidates
if (-not $pythonInfo) {
    Write-Error 'No Python 3.10+ interpreter found. Install one (for example Python 3.11) and rerun this script.'
    exit 1
}

Write-Host "Using Python $($pythonInfo.Version) at $($pythonInfo.Executable)"

$venvDir = Join-Path $scriptRoot '.venv'
Write-Host "Ensuring virtual environment at $venvDir"
& $pythonInfo.Executable -m venv $venvDir --upgrade

$venvPython = Join-Path $venvDir 'Scripts\\python.exe'
if (-not (Test-Path $venvPython)) {
    Write-Error "Virtual environment python not found at $venvPython"
    exit 1
}

Write-Host 'Upgrading pip inside the virtual environment'
& $venvPython -m pip install --upgrade pip

$requirementsFile = Join-Path $scriptRoot 'requirements.txt'
if (-not (Test-Path $requirementsFile)) {
    Write-Error "Missing requirements.txt at $requirementsFile"
    exit 1
}

Write-Host 'Installing Python dependencies'
& $venvPython -m pip install -r $requirementsFile

if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
    Write-Error 'pnpm is not installed. Install pnpm globally (https://pnpm.io/installation) and rerun this script.'
    exit 1
}

Write-Host 'Installing JavaScript dependencies'
& pnpm install

$pwshExe = (Get-Command pwsh).Source
$escapedRoot = $scriptRoot -replace "'", "''"
$sidecarCommand = "Set-Location -Path '$escapedRoot'; & '$venvPython' -m python_sidecar"

Write-Host 'Launching python_sidecar in a new PowerShell window'
Start-Process -FilePath $pwshExe -ArgumentList '-NoExit', '-Command', $sidecarCommand -WorkingDirectory $scriptRoot

Write-Host 'Sidecar window launched; this window now runs pnpm dev (Ctrl+C to quit)'
Write-Host 'Starting pnpm dev...'
& pnpm dev
