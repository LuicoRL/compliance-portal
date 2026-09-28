# ============================================================
#  Compliance Portal - arranque portable (PostgreSQL 16.4)
#  No requiere permisos de administrador.
# ============================================================

$ErrorActionPreference = "Stop"

$Root       = $PSScriptRoot
$PgBin      = Join-Path $Root "pg\pgsql\bin"
$PgData     = Join-Path $Root "pgdata"
$PgLog      = Join-Path $Root "pg.log"
$BackendJar = Join-Path $Root "backend\compliance-backend-0.1.0.jar"
$BackendLog = Join-Path $Root "backend.log"
$Frontend   = Join-Path $Root "frontend"

# Credenciales por defecto (mismas de backend/src/main/resources/application.yml)
$DbName     = "compliance"
$DbUser     = "compliance"
$DbPassword = "compliance"
$DbHost     = "127.0.0.1"
# Puerto configurable: si no se define, usa 5432.
$DbPort     = if ($env:PORTABLE_PG_PORT -match '^\d{1,5}$') { [int]$env:PORTABLE_PG_PORT } else { 5432 }
$ApiUrl     = "http://127.0.0.1:8080/api/applications"

function Write-Step {
    param([string]$Message)
    Write-Host ""
    Write-Host "==> $Message" -ForegroundColor Cyan
}

function Set-PgPassword {
    $env:PGPASSWORD = $DbPassword
}

# ============================================================
# 0. Requisitos
# ============================================================
Write-Step "Comprobando requisitos"

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "ERROR: No se encontro Node.js. Instala Node 22 o superior desde https://nodejs.org y vuelve a ejecutar este script." -ForegroundColor Red
    exit 1
}
if (-not (Get-Command java -ErrorAction SilentlyContinue)) {
    Write-Host "ERROR: No se encontro Java (JRE 17 o superior). Instala Java y vuelve a ejecutar este script." -ForegroundColor Red
    exit 1
}
if (-not (Test-Path (Join-Path $PgBin "initdb.exe"))) {
    Write-Host "ERROR: No se encontraron los binarios de PostgreSQL en '$PgBin'. Verifica que la carpeta pg\pgsql del paquete este completa." -ForegroundColor Red
    exit 1
}

# 0.1 Verificar que el puerto elegido este libre
if ($DbPort -lt 1 -or $DbPort -gt 65535) {
    Write-Host "ERROR: PORTABLE_PG_PORT='$env:PORTABLE_PG_PORT' no es un puerto valido." -ForegroundColor Red
    exit 1
}
$portOwner = Get-NetTCPConnection -LocalPort $DbPort -State Listen -ErrorAction SilentlyContinue
if ($portOwner) {
    $who = $portOwner | ForEach-Object {
        $p = Get-Process -Id $_.OwningProcess -ErrorAction SilentlyContinue
        if ($p) { "{0} (PID {1})" -f $p.ProcessName, $p.Id } else { "PID {0}" -f $_.OwningProcess }
    }
    Write-Host "ERROR: el puerto $DbPort ya esta en uso por otro programa: $($who -join ', ')" -ForegroundColor Red
    Write-Host ""
    Write-Host "  Opcion 1: cierra ese programa o servicio y vuelve a ejecutar este script." -ForegroundColor Yellow
    Write-Host "  Opcion 2: usa otro puerto para el PostgreSQL portable (no afecta lo que ya tienes):" -ForegroundColor Yellow
    Write-Host ""
    Write-Host '     $env:PORTABLE_PG_PORT = "5433"' -ForegroundColor Green
    Write-Host '     .\start.ps1'
    Write-Host ""
    exit 1
}

# ============================================================
# 1. PostgreSQL: inicializar datos (solo la primera vez)
# ============================================================
Write-Step "PostgreSQL portable"

if (-not (Test-Path (Join-Path $PgData "postgresql.conf"))) {
    Write-Host "- Primera ejecucion: inicializando directorio de datos en $PgData"
    $pwFile = Join-Path $env:TEMP "compliance-pgpw.txt"
    Set-Content -Path $pwFile -Value $DbPassword -NoNewline
    try {
        & (Join-Path $PgBin "initdb.exe") -D $PgData -U $DbUser -A scram-sha-256 -E UTF8 --pwfile=$pwFile
        if ($LASTEXITCODE -ne 0) {
            Write-Host "ERROR: initdb fallo. Revisa los datos intente de nuevo." -ForegroundColor Red
            exit 1
        }
    } finally {
        Remove-Item -Path $pwFile -ErrorAction SilentlyContinue
    }
} else {
    Write-Host "- Directorio de datos ya inicializado."
}

# Asegurar que postgresql.conf usa el puerto configurado
$confPath = Join-Path $PgData "postgresql.conf"
if (Test-Path $confPath) {
    (Get-Content $confPath) -replace '^#?port\s*=.*', "port = $DbPort" | Set-Content $confPath
}

# ============================================================
# 2. Arrancar PostgreSQL (si no esta corriendo)
# ============================================================
& (Join-Path $PgBin "pg_ctl.exe") -D $PgData status *> $null
if ($LASTEXITCODE -ne 0) {
    if (Test-Path (Join-Path $PgData "postmaster.pid")) {
        Remove-Item (Join-Path $PgData "postmaster.pid") -ErrorAction SilentlyContinue
    }
    Write-Host "- Arrancando PostgreSQL en el puerto $DbPort..."
    & (Join-Path $PgBin "pg_ctl.exe") -D $PgData -l $PgLog start
    if ($LASTEXITCODE -ne 0) {
        Write-Host "ERROR: no se pudo arrancar PostgreSQL." -ForegroundColor Red
        if (Test-Path $PgLog) {
            Write-Host "--- Ultimas lineas de '$PgLog': ---" -ForegroundColor Yellow
            Get-Content $PgLog -Tail 15 | ForEach-Object { Write-Host "  $_" -ForegroundColor Gray }
        }
        Write-Host ""
        Write-Host "  Si el motivo es que el puerto $DbPort esta ocupado por otro programa:" -ForegroundColor Yellow
        Write-Host '    $env:PORTABLE_PG_PORT = "5433"' -ForegroundColor Green
        Write-Host '    .\start.ps1'
        Write-Host ""
        exit 1
    }
} else {
    Write-Host "- PostgreSQL ya estaba en ejecucion."
}

# 3. Esperar a que acepte conexiones
Write-Host "- Esperando a que PostgreSQL acepte conexiones..."
Set-PgPassword
$ready = $false
for ($i = 0; $i -lt 30; $i++) {
    & (Join-Path $PgBin "psql.exe") -U $DbUser -h $DbHost -p $DbPort -d postgres -tAc "SELECT 1" *> $null
    if ($LASTEXITCODE -eq 0) {
        $ready = $true
        break
    }
    Start-Sleep -Seconds 1
}
if (-not $ready) {
    Write-Host "ERROR: PostgreSQL no respondio a tiempo. Revisa '$PgLog'." -ForegroundColor Red
    exit 1
}

# 4. Crear la base de datos si no existe
$exists = & (Join-Path $PgBin "psql.exe") -U $DbUser -h $DbHost -p $DbPort -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname = '$DbName'"
if ($exists -ne "1") {
    Write-Host "- Creando base de datos '$DbName'..."
    & (Join-Path $PgBin "createdb.exe") -U $DbUser -h $DbHost -p $DbPort $DbName
    if ($LASTEXITCODE -ne 0) {
        Write-Host "ERROR: no se pudo crear la base de datos '$DbName'." -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host "- Base de datos '$DbName' ya existe."
}

# ============================================================
# 5. Backend (API Spring Boot en 8080)
# ============================================================
Write-Step "Backend (API en http://127.0.0.1:8080, PostgreSQL en puerto $DbPort)"

if (-not (Test-Path $BackendJar)) {
    Write-Host "ERROR: no se encontro '$BackendJar'. Verifica que el paquete este completo." -ForegroundColor Red
    exit 1
}
if (Test-Path "${BackendLog}.err") { Remove-Item "${BackendLog}.err" -ErrorAction SilentlyContinue }

$javaUp = Get-CimInstance Win32_Process -Filter "Name = 'java.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -match 'compliance-backend' }
if ($javaUp) {
    Write-Host "- El backend ya estaba en ejecucion."
} else {
    $env:DB_URL      = "jdbc:postgresql://${DbHost}:${DbPort}/${DbName}"
    $env:DB_USER     = $DbUser
    $env:DB_PASSWORD = $DbPassword
    Start-Process -FilePath "java.exe" `
        -ArgumentList @("-jar", "`"$BackendJar`"") `
        -RedirectStandardOutput $BackendLog `
        -RedirectStandardError "${BackendLog}.err" `
        -WindowStyle Hidden
    Write-Host "- Arrancando backend (registro en '$BackendLog', base de datos en puerto $DbPort)."
}

$backendReady = $false
for ($i = 0; $i -lt 60; $i++) {
    try {
        $resp = Invoke-WebRequest -Uri $ApiUrl -UseBasicParsing -TimeoutSec 2
        if ($resp.StatusCode -eq 200) {
            $backendReady = $true
            break
        }
    } catch {
        Start-Sleep -Seconds 2
    }
}
if (-not $backendReady) {
    Write-Host ""
    Write-Host "ADVERTENCIA: el backend no respondio en el puerto 8080 a tiempo." -ForegroundColor Yellow
    Write-Host "  Revisa 'backend.log' y 'backend.log.err' si la pagina no carga datos." -ForegroundColor Yellow
} else {
    Write-Host "- Backend listo y respondiendo."
}

# ============================================================
# 6. Frontend (Angular / ng serve en 4200)
# ============================================================
Write-Step "Frontend (http://localhost:4200)"

if (-not (Test-Path $Frontend)) {
    Write-Host "ERROR: no se encontro la carpeta '$Frontend'. Verifica que el paquete este completo." -ForegroundColor Red
    exit 1
}

Push-Location $Frontend
try {
    if (-not (Test-Path (Join-Path $Frontend "node_modules"))) {
        Write-Host "- Instalando dependencias (solo la primera vez, puede tardar unos minutos)..."
        npm install
        if ($LASTEXITCODE -ne 0) {
            Write-Host "ERROR: npm install fallo. Revisa la conexion a internet." -ForegroundColor Red
            exit 1
        }
    } else {
        Write-Host "- Dependencias ya instaladas."
    }
} finally {
    Pop-Location
}

Write-Host ""
Write-Host "Iniciando el servidor de desarrollo en http://localhost:4200 (se abrira el navegador)." -ForegroundColor Green
Write-Host "Para detener el frontend presiona Ctrl+C en esta ventana." -ForegroundColor Yellow
Write-Host "Para detener el backend y PostgreSQL usa: .\stop.ps1" -ForegroundColor Yellow
Write-Host ""

Push-Location $Frontend
try {
    npm start
} finally {
    Pop-Location
}