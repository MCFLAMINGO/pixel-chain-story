# Pixel — join ONLY the crowned tip (20553 / f1d193…) as a verifying mirror.
# Never init. Never tip:host. Never PIXEL_GENESIS_CEREMONY.
$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$PinPath = Join-Path $Root "CROWNED.json"
$WantPrefix = "f1d193f62d54e982"
$WantNet = 20553
$RepoUrl = "https://github.com/MCFLAMINGO/pixel-chain-story.git"
$Work = if ($env:PIXEL_MIRROR_WORK) { $env:PIXEL_MIRROR_WORK } else { Join-Path $HOME "pixel-crowned-mirror" }
$Datadir = if ($env:PIXEL_DATADIR) { $env:PIXEL_DATADIR } else { Join-Path $Work "data\crowned-mirror" }
$RpcPort = if ($env:PORT) { $env:PORT } elseif ($env:PIXEL_RPC_PORT) { $env:PIXEL_RPC_PORT } else { "8545" }
$GossipPort = if ($env:PIXEL_GOSSIP_PORT) { $env:PIXEL_GOSSIP_PORT } else { "9001" }

Write-Host "=== PIXEL crowned mirror (one Earth only) ==="
Write-Host "Genesis pin: $WantPrefix… · network $WantNet"
Write-Host ""

if (Test-Path $PinPath) {
  $pin = Get-Content $PinPath -Raw | ConvertFrom-Json
  $WantPrefix = $pin.genesisPrefix
  $WantNet = [int]$pin.networkId
}

if (-not (Get-Command bun -ErrorAction SilentlyContinue)) {
  Write-Host "Bun is required. Install from https://bun.sh then re-run."
  Write-Host "  powershell -c `"irm bun.sh/install.ps1 | iex`""
  exit 1
}
if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
  Write-Host "git is required to clone the Pixel repo."
  exit 1
}

New-Item -ItemType Directory -Force -Path (Split-Path $Work) | Out-Null
if (-not (Test-Path (Join-Path $Work ".git"))) {
  Write-Host "Cloning Pixel Ledger (main)…"
  git clone --depth 1 --branch main $RepoUrl $Work
} else {
  Write-Host "Updating clone…"
  git -C $Work fetch origin main
  git -C $Work checkout main
  git -C $Work pull --ff-only origin main
}

Set-Location $Work
bun install
New-Item -ItemType Directory -Force -Path $Datadir | Out-Null

Write-Host ""
Write-Host "Joining crowned tip (--public-tip --require-crowned)…"
Remove-Item Env:PIXEL_GENESIS_CEREMONY -ErrorAction SilentlyContinue
Remove-Item Env:PIXEL_TIP_HOST -ErrorAction SilentlyContinue
bun run pixel -- join --public-tip --require-crowned --datadir $Datadir

$ChainJson = Join-Path $Datadir "chain.json"
if (-not (Test-Path $ChainJson)) {
  Write-Host "REFUSED — no chain.json after join."
  exit 2
}
$chain = Get-Content $ChainJson -Raw | ConvertFrom-Json
$genesis = [string]$chain.pixels[0].hash
$net = [int]$chain.networkId
if (-not $genesis.StartsWith($WantPrefix)) {
  Write-Host "REFUSED — wrong Earth (want $WantPrefix…, got $($genesis.Substring(0,16))…). Delete $Datadir and re-run."
  exit 3
}
if ($net -ne $WantNet) {
  Write-Host "REFUSED — wrong networkId (want $WantNet, got $net). Delete $Datadir and re-run."
  exit 3
}
Write-Host "Local fold matches crowned Earth · genesis $WantPrefix… · network $net"

$Advertise = $env:PIXEL_ADVERTISE_HOST
if (-not $Advertise) {
  Write-Host ""
  Write-Host "No PIXEL_ADVERTISE_HOST set — starting for local verify."
  Write-Host "For a listed public mirror: Cloudflare Tunnel → HTTPS, then set PIXEL_ADVERTISE_HOST."
  Write-Host ""
}

Write-Host "Starting verifying node on :$RpcPort …"
Write-Host "Confirm genesis out loud: $WantPrefix…"
$args = @(
  "run", "pixel", "--", "node",
  "--datadir", $Datadir,
  "--rpc", $RpcPort,
  "--gossip", $GossipPort
)
if ($Advertise) { $args += @("--advertise", $Advertise) }
bun @args
