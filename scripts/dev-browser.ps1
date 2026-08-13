# Local browser dev: frontend on :3000, API on :3001 (or proxy to Replit via .env.local).
# Usage (from repo root):
#   .\scripts\dev-browser.ps1
# Optional env before running:
#   $env:DATABASE_URL = "postgresql://..."
#   $env:BOT_TOKEN = "..."

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $Root

if (-not $env:DATABASE_URL) {
  Write-Host "WARNING: DATABASE_URL is not set. api-server needs PostgreSQL." -ForegroundColor Yellow
  Write-Host "Tip: copy artifacts/zoom-master/.env.local.example to .env.local and point VITE_API_PROXY_TARGET at your Replit deploy." -ForegroundColor Yellow
}

$env:PORT = "3001"
$env:TG_AUTH_MODE = "off"
$env:NODE_ENV = "development"

Write-Host "Starting API server on http://127.0.0.1:3001 ..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$Root'; `$env:PORT='3001'; `$env:TG_AUTH_MODE='off'; `$env:NODE_ENV='development'; pnpm --filter @workspace/api-server run dev"

Start-Sleep -Seconds 3

Write-Host "Starting frontend on http://localhost:3000 ..." -ForegroundColor Cyan
Write-Host "PC login: enter your Telegram numeric ID (admin: 8144744644)" -ForegroundColor Green
pnpm --filter @workspace/zoom-master run dev
