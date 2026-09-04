# start-dev.ps1 — one-click start for the ReachInbox demo
# Usage: right-click -> "Run with PowerShell", or:
#        powershell -ExecutionPolicy Bypass -File .\start-dev.ps1

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot

Write-Host "Starting infrastructure (PostgreSQL, Redis, Elasticsearch)..."
docker compose up -d

if (Test-Path "$root\backend\package.json") {
    Write-Host "Starting backend on http://localhost:4000 ..."
    Start-Process cmd -ArgumentList "/k", "cd /d `"$root\backend`" && npm run dev"
} else {
    Write-Host "backend folder not found at $root\backend" -ForegroundColor Red
}

if (Test-Path "$root\frontend\package.json") {
    Write-Host "Starting frontend on http://localhost:5173 ..."
    Start-Process cmd -ArgumentList "/k", "cd /d `"$root\frontend`" && npm run dev"
} else {
    Write-Host "frontend folder not found at $root\frontend" -ForegroundColor Red
}

Write-Host ""
Write-Host "All services launching. Press Enter to close this window (servers keep running)."
Write-Host "When done, close the two windows titled 'backend' and 'frontend'."
Read-Host