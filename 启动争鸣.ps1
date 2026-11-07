param([switch]$NoBrowser)
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$arenaUrl = 'http://127.0.0.1:5173'
function Test-ArenaReady {
  try {
    $arenaHealth = Invoke-RestMethod -Uri "$arenaUrl/api/health" -TimeoutSec 2
    return ($arenaHealth.ok -eq $true -and $arenaHealth.name -eq '争鸣')
  } catch { return $false }
}
if (-not (Test-ArenaReady)) {
  if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw '请先安装 Node.js 22.12 或更新版本。' }
  if (-not (Test-Path -LiteralPath (Join-Path $PSScriptRoot 'node_modules'))) {
    Write-Host '首次启动，正在安装依赖…'
    & npm.cmd install
    if ($LASTEXITCODE -ne 0) { throw '依赖安装失败，请检查网络后重试。' }
  }
  New-Item -ItemType Directory -Path (Join-Path $PSScriptRoot '.local') -Force | Out-Null
  Write-Host '正在启动争鸣…'
  Start-Process -FilePath "$env:SystemRoot\System32\cmd.exe" -ArgumentList '/d /c npm run dev' -WorkingDirectory $PSScriptRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $PSScriptRoot '.local/dev.stdout.log') -RedirectStandardError (Join-Path $PSScriptRoot '.local/dev.stderr.log') | Out-Null
  $arenaDeadline = (Get-Date).AddSeconds(40)
  while (-not (Test-ArenaReady)) {
    if ((Get-Date) -gt $arenaDeadline) { throw '服务暂未就绪。请查看项目 .local 文件夹内的 dev.stderr.log，或在终端运行 npm run dev 查看错误。' }
    Start-Sleep -Milliseconds 600
  }
}
Write-Host "争鸣已就绪：$arenaUrl"
Write-Host '本地服务在后台运行，关闭此窗口或浏览器不影响服务。'
if (-not $NoBrowser) { Start-Process $arenaUrl }
