[CmdletBinding()]
param(
  [switch]$SkipDevTools,
  [switch]$KeepApi
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$workspace = $PSScriptRoot
$backendDir = Join-Path $workspace 'backend'
$miniappDir = Join-Path $workspace 'miniapp'
$runtimeDir = Join-Path $workspace '.runtime'
$npmCacheDir = Join-Path $workspace '.npm-cache'
$healthUrl = 'http://127.0.0.1:8000/health'
$apiPidPath = Join-Path $runtimeDir 'api.pid'

New-Item -ItemType Directory -Path $runtimeDir -Force | Out-Null

function Test-ApiHealth {
  try {
    $response = Invoke-RestMethod -Uri $healthUrl -TimeoutSec 2
    return $response.status -eq 'ok'
  } catch {
    return $false
  }
}

Write-Host '[1/5] Starting PostgreSQL...'
Push-Location $workspace
try {
  docker compose up -d db
} finally {
  Pop-Location
}

Write-Host '[2/5] Applying migrations and ensuring seed data...'
Push-Location $backendDir
try {
  python -m alembic upgrade head
  python -m app.seed
} finally {
  Pop-Location
}

Write-Host '[3/5] Starting FastAPI when needed...'
if (-not $KeepApi -and (Test-Path -LiteralPath $apiPidPath)) {
  $recordedPid = [int](Get-Content -LiteralPath $apiPidPath -ErrorAction SilentlyContinue)
  $recordedProcess = Get-CimInstance Win32_Process -Filter "ProcessId = $recordedPid" -ErrorAction SilentlyContinue
  if ($recordedProcess -and $recordedProcess.Name -eq 'python.exe' -and $recordedProcess.CommandLine -match 'uvicorn\s+app\.main:app') {
    # Uvicorn's Windows file watcher can occasionally leave an old worker
    # serving after a source change. Restart the process tree on each launcher
    # run so the simulator always receives the current backend code.
    & taskkill.exe /PID $recordedPid /T /F | Out-Null
    for ($attempt = 0; $attempt -lt 20 -and (Test-ApiHealth); $attempt++) {
      Start-Sleep -Milliseconds 250
    }
  }
  Remove-Item -LiteralPath $apiPidPath -Force -ErrorAction SilentlyContinue
}
if (-not (Test-ApiHealth)) {
  $pythonPath = (Get-Command python -ErrorAction Stop).Source
  $apiProcess = Start-Process `
    -FilePath $pythonPath `
    -ArgumentList @('-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', '8000', '--reload') `
    -WorkingDirectory $backendDir `
    -WindowStyle Hidden `
    -RedirectStandardOutput (Join-Path $runtimeDir 'api.stdout.log') `
    -RedirectStandardError (Join-Path $runtimeDir 'api.stderr.log') `
    -PassThru
  Set-Content -LiteralPath $apiPidPath -Value $apiProcess.Id

  $apiReady = $false
  for ($attempt = 0; $attempt -lt 30; $attempt++) {
    Start-Sleep -Seconds 1
    if (Test-ApiHealth) {
      $apiReady = $true
      break
    }
  }
  if (-not $apiReady) {
    throw "FastAPI did not become healthy. Check $runtimeDir\api.stderr.log"
  }
}

Write-Host '[4/5] Starting Taro watch build when needed...'
$escapedWorkspace = [regex]::Escape($workspace)
$watcher = Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction SilentlyContinue |
  Where-Object { $_.CommandLine -match $escapedWorkspace -and $_.CommandLine -match 'taro' -and $_.CommandLine -match '--watch' } |
  Select-Object -First 1

if (-not $watcher) {
  $npxPath = (Get-Command npx.cmd -ErrorAction Stop).Source
  Start-Process `
    -FilePath $npxPath `
    -ArgumentList @('--cache', $npmCacheDir, 'taro', 'build', '--type', 'weapp', '--watch') `
    -WorkingDirectory $miniappDir `
    -WindowStyle Hidden `
    -RedirectStandardOutput (Join-Path $runtimeDir 'taro-watch.stdout.log') `
    -RedirectStandardError (Join-Path $runtimeDir 'taro-watch.stderr.log')
}

$appJson = Join-Path $miniappDir 'dist\app.json'
for ($attempt = 0; $attempt -lt 120 -and -not (Test-Path -LiteralPath $appJson); $attempt++) {
  Start-Sleep -Seconds 1
}
if (-not (Test-Path -LiteralPath $appJson)) {
  throw "The WeChat build was not generated. Check $runtimeDir\taro-watch.stderr.log"
}

if (-not $SkipDevTools) {
  Write-Host '[5/5] Opening WeChat DevTools...'
  $devToolsPath = $null
  if (-not [string]::IsNullOrWhiteSpace($env:WECHAT_DEVTOOLS_PATH) -and (Test-Path -LiteralPath $env:WECHAT_DEVTOOLS_PATH)) {
    $devToolsPath = $env:WECHAT_DEVTOOLS_PATH
  } else {
    # Keep the script ASCII-only around path discovery: Windows PowerShell 5.1
    # can misread UTF-8 scripts without a BOM, while the installation folder
    # and executable names contain Chinese characters. The Electron executable
    # is the large top-level binary beneath a Tencent installation directory.
    $devToolsRoots = @(
      'D:\Program Files (x86)\Tencent'
      (Join-Path ${env:ProgramFiles(x86)} 'Tencent')
      $env:LOCALAPPDATA
    ) | Where-Object { $_ -and (Test-Path -LiteralPath $_) }
    foreach ($root in $devToolsRoots) {
      $candidate = Get-ChildItem -LiteralPath $root -Filter '*.exe' -File -Recurse -ErrorAction SilentlyContinue |
        Where-Object { $_.Length -gt 50MB -and $_.FullName -notmatch '[\\/]resources[\\/]' } |
        Sort-Object Length -Descending |
        Select-Object -First 1
      if ($candidate) {
        $devToolsPath = $candidate.FullName
        break
      }
    }
  }
  if ($devToolsPath) {
    $electronRunAsNode = $env:ELECTRON_RUN_AS_NODE
    try {
      $env:ELECTRON_RUN_AS_NODE = $null
      Start-Process -FilePath $devToolsPath -ArgumentList @('--project', $workspace)
    } finally {
      $env:ELECTRON_RUN_AS_NODE = $electronRunAsNode
    }
  } else {
    Write-Warning 'WeChat DevTools was not found. Open the workspace root manually.'
  }
} else {
  Write-Host '[5/5] Skipping WeChat DevTools launch.'
}

Write-Host ''
Write-Host 'Phase 2 preview is ready.' -ForegroundColor Green
Write-Host 'API:     http://127.0.0.1:8000'
Write-Host 'Swagger: http://127.0.0.1:8000/docs'
Write-Host 'Project: open this workspace root in WeChat DevTools'
