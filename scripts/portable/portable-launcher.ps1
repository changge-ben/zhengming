param(
  [switch]$NoBrowser,
  [switch]$Stop,
  [switch]$Diagnose,
  [switch]$Force,
  [ValidateRange(1024, 65535)][int]$Port = 5173,
  [string]$DataDirectory
)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding
$packageRoot = $PSScriptRoot
$runtime = Join-Path $packageRoot 'runtime\node.exe'
$entry = Join-Path $packageRoot 'app\server.mjs'
$manifestPath = Join-Path $packageRoot 'manifest.json'
if (-not $DataDirectory) { $DataDirectory = Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'Zhengming' }
$DataDirectory = [IO.Path]::GetFullPath($DataDirectory)
$arenaUrl = "http://127.0.0.1:$Port"
$sessionPath = Join-Path $DataDirectory "session-$Port.json"
$stdoutPath = Join-Path $DataDirectory "service-$Port.stdout.log"
$stderrPath = Join-Path $DataDirectory "service-$Port.stderr.log"

function Get-ArenaHealth {
  try {
    $health = Invoke-RestMethod -Uri "$arenaUrl/api/health" -TimeoutSec 2
    if ($health.ok -and $health.appId -eq 'zhengming-debate-arena') { return $health }
  } catch { }
  return $null
}

function Test-Package {
  if (-not (Test-Path -LiteralPath $manifestPath)) { throw '缺少 manifest.json，请完整解压便携包后再启动。' }
  $manifest = Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
  if (-not $manifest.version -or -not $manifest.files) { throw '发布清单不完整，请重新下载便携包。' }
  foreach ($property in $manifest.files.PSObject.Properties) {
    $target = [IO.Path]::GetFullPath((Join-Path $packageRoot $property.Name))
    if (-not $target.StartsWith($packageRoot.TrimEnd('\') + '\', [StringComparison]::OrdinalIgnoreCase)) { throw '发布清单包含无效路径。' }
    if (-not (Test-Path -LiteralPath $target -PathType Leaf)) { throw "缺少程序文件 $($property.Name)，请重新完整解压。" }
    $stream = [IO.File]::OpenRead($target)
    $algorithm = [Security.Cryptography.SHA256]::Create()
    try { $actual = [BitConverter]::ToString($algorithm.ComputeHash($stream)).Replace('-', '') } finally { $stream.Dispose(); $algorithm.Dispose() }
    if ($actual -ne $property.Value) { throw "程序文件校验失败 $($property.Name)，请重新下载并解压。" }
  }
  return $manifest
}

function Stop-OwnedService {
  if (-not (Test-Path -LiteralPath $sessionPath)) {
    if (Get-ArenaHealth) { throw '当前服务由其他启动方式运行，请从对应的启动目录结束服务。' }
    Write-Host '当前没有由便携版启动的服务。'
    return
  }
  $session = Get-Content -LiteralPath $sessionPath -Raw -Encoding UTF8 | ConvertFrom-Json
  $process = Get-Process -Id $session.pid -ErrorAction SilentlyContinue
  if (-not $process) { Remove-Item -LiteralPath $sessionPath; Write-Host '服务已经停止。'; return }
  $health = Get-ArenaHealth
  $sameExecutable = [string]::Equals($process.MainModule.FileName, $session.executable, [StringComparison]::OrdinalIgnoreCase)
  $sameStart = (Get-Process -Id $session.pid).StartTime.ToUniversalTime().ToString('o') -eq $session.startedAt
  if (-not $sameExecutable -or -not $sameStart -or ($health -and $health.pid -ne $session.pid)) { throw '进程身份已变化，为避免关闭其他程序，本次未停止服务。' }
  if (-not $Force) {
    $answer = Read-Host '请先在网页中结束正在进行的比赛。确认停止本地服务请输入 Y'
    if ($answer -notmatch '^[Yy]$') { Write-Host '已取消停止。'; return }
  }
  Stop-Process -Id $session.pid
  Remove-Item -LiteralPath $sessionPath
  Write-Host '争鸣服务已停止，配置保存在本机数据目录。'
}

function Write-Diagnostics {
  New-Item -ItemType Directory -Path $DataDirectory -Force | Out-Null
  $packageStatus = '通过'
  $version = '未知'
  try { $manifest = Test-Package; $version = $manifest.version } catch { $packageStatus = $_.Exception.Message }
  $health = Get-ArenaHealth
  $serviceStatus = if ($health) { "已连接，版本 $($health.version)，模式 $($health.mode)" } else { '尚未运行或无法连接' }
  $lines = @(
    '争鸣 · AI 辩论场 — 环境诊断',
    "生成时间 $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')",
    "程序版本 $version",
    "Windows 版本 $([Environment]::OSVersion.Version)",
    "64 位系统 $([Environment]::Is64BitOperatingSystem)",
    "文件校验 $packageStatus",
    "本地服务 $serviceStatus",
    "访问地址 $arenaUrl",
    "数据目录 $DataDirectory",
    "服务日志 $stdoutPath",
    "错误日志 $stderrPath",
    '',
    '诊断仅记录版本与运行状态，不读取模型配置、密钥或比赛正文。',
    '若文件校验失败，请重新下载并完整解压。端口被占用时，请先停止旧服务。'
  )
  $report = Join-Path $DataDirectory "diagnostics-$(Get-Date -Format 'yyyyMMdd-HHmmss').txt"
  [IO.File]::WriteAllLines($report, $lines, (New-Object System.Text.UTF8Encoding($true)))
  Write-Host ($lines -join [Environment]::NewLine)
  Write-Host "诊断报告已保存 $report"
  if (-not $NoBrowser) { Start-Process -FilePath 'notepad.exe' -ArgumentList @('"' + $report + '"') }
}

$mutex = $null
$ownsMutex = $false
try {
  if ($Diagnose) { Write-Diagnostics; exit 0 }
  $mutex = New-Object System.Threading.Mutex($false, "Local\Zhengming-Portable-$Port")
  try { $ownsMutex = $mutex.WaitOne(30000) } catch [System.Threading.AbandonedMutexException] { $ownsMutex = $true }
  if (-not $ownsMutex) { throw '另一个启动操作尚未完成，请稍后再试。' }
  if ($Stop) { Stop-OwnedService; exit 0 }
  if (-not [Environment]::Is64BitOperatingSystem) { throw '此便携版需要 64 位 Windows。' }
  $manifest = Test-Package
  $health = Get-ArenaHealth
  if ($health -and $health.version -ne $manifest.version) { throw "另一个版本 $($health.version) 正在运行。请先停止旧服务，再启动此版本。" }
  if (-not $health) {
    $listener = [Net.NetworkInformation.IPGlobalProperties]::GetIPGlobalProperties().GetActiveTcpListeners() | Where-Object { $_.Port -eq $Port }
    if ($listener) { throw "端口 $Port 已被其他程序占用。请关闭冲突程序后再启动，环境诊断可查看访问地址。" }
    New-Item -ItemType Directory -Path $DataDirectory -Force | Out-Null
    $savedEnvironment = @{}
    foreach ($key in @('PORT', 'ZHENGMING_DATA_DIR', 'ZHENGMING_STATIC_DIR', 'ZHENGMING_MODE')) { $savedEnvironment[$key] = [Environment]::GetEnvironmentVariable($key, 'Process') }
    try {
      $env:PORT = [string]$Port
      $env:ZHENGMING_DATA_DIR = $DataDirectory
      $env:ZHENGMING_STATIC_DIR = Join-Path $packageRoot 'app\dist'
      $env:ZHENGMING_MODE = 'portable'
      $service = Start-Process -FilePath $runtime -ArgumentList @('"' + $entry + '"') -WorkingDirectory (Join-Path $packageRoot 'app') -WindowStyle Hidden -RedirectStandardOutput $stdoutPath -RedirectStandardError $stderrPath -PassThru
      $startedAt = $service.StartTime.ToUniversalTime().ToString('o')
      $session = @{ pid = $service.Id; executable = $runtime; entry = $entry; startedAt = $startedAt }
      [IO.File]::WriteAllText($sessionPath, ($session | ConvertTo-Json), (New-Object System.Text.UTF8Encoding($true)))
      $deadline = (Get-Date).AddSeconds(35)
      do {
        Start-Sleep -Milliseconds 300
        $service.Refresh()
        if ($service.HasExited) { throw '服务启动失败，请运行「环境诊断.cmd」并查看错误日志。' }
        $health = Get-ArenaHealth
      } until (($health -and $health.pid -eq $service.Id) -or (Get-Date) -gt $deadline)
      if (-not $health -or $health.pid -ne $service.Id) { throw '服务未在预期时间内就绪，请运行「环境诊断.cmd」。' }
    } catch {
      if ($service -and -not $service.HasExited) { $service.Kill() }
      if (Test-Path -LiteralPath $sessionPath) { Remove-Item -LiteralPath $sessionPath }
      throw
    } finally {
      foreach ($key in $savedEnvironment.Keys) { [Environment]::SetEnvironmentVariable($key, $savedEnvironment[$key], 'Process') }
    }
  }
  Write-Host "争鸣 · AI 辩论场 $($manifest.version) 已就绪"
  Write-Host $arenaUrl
  Write-Host '关闭浏览器后服务仍在本机运行，可双击「停止争鸣.cmd」结束。'
  if (-not $NoBrowser) { Start-Process $arenaUrl }
} catch {
  Write-Host "启动或管理未完成 $($_.Exception.Message)" -ForegroundColor Red
  exit 1
} finally {
  if ($ownsMutex -and $mutex) { $mutex.ReleaseMutex() }
  if ($mutex) { $mutex.Dispose() }
}
