# ============================================================
#  Empaquetado del Compliance Portal portable
#  Genera compliance-portal-portable.zip en la raiz del repo.
#  Ejecutar SOLO en la maquina del desarrollador, que debe tener los
#  binarios de PostgreSQL portable. Indica la carpeta con la variable
#  de entorno PG_BINARIOS, por ejemplo:
#     $env:PG_BINARIES = "C:\ruta\pg\pgsql"
#  Si no se define, se usa la ruta local de abajo como valor por defecto.
# ============================================================

$ErrorActionPreference = "Stop"

$RepoRoot   = $PSScriptRoot
$PgBinaries = if ($env:PG_BINARIES) { $env:PG_BINARIES } else { "C:\Users\luism\Apps\pg\pgsql" }
$BackendJar = Join-Path $RepoRoot "backend\target\compliance-backend-0.1.0.jar"
$ZipName    = "compliance-portal-portable.zip"
$ZipPath    = Join-Path $RepoRoot $ZipName
$PkgName    = "compliance-portal-portable"
$StageDir   = Join-Path $env:TEMP "compliance-portal-pack-staging"
$PkgRoot    = Join-Path $StageDir $PkgName

function Assert-RobocopyOk {
    if ($LASTEXITCODE -ge 8) {
        Write-Host "ERROR (robocopy, codigo $LASTEXITCODE): $($args[0])" -ForegroundColor Red
        exit 1
    }
}

Write-Host "==> Limpiando area temporal..." -ForegroundColor Cyan
if (Test-Path $StageDir) { Remove-Item -LiteralPath $StageDir -Recurse -Force }
New-Item -ItemType Directory -Path $PkgRoot -Force | Out-Null

# 1. Binarios de PostgreSQL portable
Write-Host "==> Copiando PostgreSQL portable ($PgBinaries)..." -ForegroundColor Cyan
if (-not (Test-Path (Join-Path $PgBinaries "bin\postgres.exe"))) {
    Write-Host "ERROR: no se encontraron los binarios en '$PgBinaries'." -ForegroundColor Red
    exit 1
}
$destPg = Join-Path $PkgRoot "pg\pgsql"
robocopy $PgBinaries $destPg /E /NFL /NDL /NJH /NJS /NP
Assert-RobocopyOk "copiando PostgreSQL"

# 2. Backend (debe estar recompilado con: mvn -f backend/pom.xml clean package)
Write-Host "==> Copiando backend..." -ForegroundColor Cyan
if (-not (Test-Path $BackendJar)) {
    Write-Host "ERROR: no se encontro '$BackendJar'. Compilalo antes con: mvn -f backend/pom.xml clean package" -ForegroundColor Red
    exit 1
}
New-Item -ItemType Directory -Path (Join-Path $PkgRoot "backend") -Force | Out-Null
Copy-Item -LiteralPath $BackendJar -Destination (Join-Path $PkgRoot "backend")

# 3. Frontend (copia del codigo fuente, sin artefactos pesados)
Write-Host "==> Copiando frontend..." -ForegroundColor Cyan
$destFe = Join-Path $PkgRoot "frontend"
robocopy $RepoRoot $destFe /E `
    /XD node_modules dist .git .angular .github .vscode backend launcher coverage `
    /XF *.jar *.zip *.log start.ps1 stop.ps1 package-portable.ps1 DEVELOPMENT.md `
    /NFL /NDL /NJH /NJS /NP
Assert-RobocopyOk "copiando frontend"

# 4. Scripts + README
Write-Host "==> Copiando scripts y README..." -ForegroundColor Cyan
Copy-Item -LiteralPath (Join-Path $RepoRoot "start.ps1") -Destination $PkgRoot
Copy-Item -LiteralPath (Join-Path $RepoRoot "stop.ps1")  -Destination $PkgRoot
Copy-Item -LiteralPath (Join-Path $RepoRoot "README.md")  -Destination $PkgRoot
# Se incluye tambien para que el enlace del README no quede roto, aunque su
# contenido corresponde al repositorio de codigo fuente, no al paquete extraido.
if (Test-Path (Join-Path $RepoRoot "DEVELOPMENT.md")) {
    Copy-Item -LiteralPath (Join-Path $RepoRoot "DEVELOPMENT.md") -Destination $PkgRoot
}

# 5. Comprimir (tar de Windows: rapido y maneja bien archivos grandes)
Write-Host "==> Comprimiendo $ZipName (esto puede tardar un par de minutos)..." -ForegroundColor Cyan
if (Test-Path $ZipPath) { Remove-Item -LiteralPath $ZipPath -Force }
tar -a -c -f $ZipPath -C $StageDir $PkgName
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: fallo la compresion." -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "Listo: $ZipPath" -ForegroundColor Green
$size = [math]::Round((Get-Item $ZipPath).Length / 1MB, 1)
Write-Host "Tamano: $size MB" -ForegroundColor Green
Write-Host ""
Write-Host "Siguiente paso: sube este archivo como asset de un Release en tu repositorio de GitHub." -ForegroundColor Yellow