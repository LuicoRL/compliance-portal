# ============================================================
#  Compliance Portal - detencion del backend y PostgreSQL
# ============================================================

$ErrorActionPreference = "Stop"

$Root   = $PSScriptRoot
$PgBin  = Join-Path $Root "pg\pgsql\bin"
$PgData = Join-Path $Root "pgdata"

Write-Host "==> Deteniendo el backend (API en 8080)..." -ForegroundColor Cyan
Get-CimInstance Win32_Process -Filter "Name = 'java.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -match 'compliance-backend' } |
    ForEach-Object {
        Write-Host "- Deteniendo proceso PID $($_.ProcessId)"
        Stop-Process -Id $_.ProcessId -Force
    }

Write-Host "==> Deteniendo PostgreSQL..." -ForegroundColor Cyan
if (Test-Path (Join-Path $PgBin "pg_ctl.exe")) {
    & (Join-Path $PgBin "pg_ctl.exe") -D $PgData stop -m fast
    if ($LASTEXITCODE -eq 0) {
        Write-Host "- PostgreSQL detenido correctamente."
    }
} else {
    Write-Host "- No se encontraron binarios de PostgreSQL; nada que detener."
}

Write-Host ""
Write-Host "Listo. Para volver a arrancar usa: .\start.ps1" -ForegroundColor Green