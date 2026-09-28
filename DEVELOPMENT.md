# Desarrollo local

Guía para ejecutar el proyecto **desde el código fuente**. Si lo que tienes es la
carpeta ya extraída del `compliance-portal-portable.zip`, usa el
[README.md](README.md) en su lugar: ese describe el paquete autónomo y sus
propios scripts.

Si recibiste el repositorio como ZIP y lo que quieres es **entender el proyecto
o montarlo desde cero**, el documento completo está en
[HANDOFF.md](HANDOFF.md) (prerrequisitos, base de datos, referencia de la API y
el esquema SQL). Esta página es la versión corta de uso diario.

## Cómo difiere este checkout del paquete portable

Este repositorio es el código fuente, con otra disposición:

| | Este repositorio | Paquete portable |
|---|---|---|
| Frontend | en la **raíz** (`package.json`) | en `frontend\` |
| JAR del backend | `backend\target\compliance-backend-0.1.0.jar` | `backend\compliance-backend-0.1.0.jar` |
| PostgreSQL | instalación normal del sistema, puerto 5432 | portable, en `pg\pgsql\` + `pgdata\` |
| Arranque | manual (este documento) | `.\start.ps1` |

`start.ps1` y `stop.ps1` **no funcionan aquí**: esperan `pg\pgsql\bin\initdb.exe`,
`pgdata\`, `frontend\` y `backend\compliance-backend-0.1.0.jar`, y además abortan
si el puerto 5432 ya está ocupado.

## Requisitos

- **Java 17+** (probado con JDK 23) — backend
- **Node.js 22+** — frontend
- **PostgreSQL** escuchando en `127.0.0.1:5432` con la base `compliance`
  (usuario y contraseña `compliance`)

Ese es el valor por defecto de `backend/src/main/resources/application.yml`.
Para otra instalación, define `DB_URL`, `DB_USER` y `DB_PASSWORD` antes de
arrancar el backend.

## Ejecutar

Son **dos procesos en dos ventanas separadas**. El backend va primero.

**1. Backend** (ventana 1, desde la raíz del repo):

```powershell
java -jar backend\target\compliance-backend-0.1.0.jar
```

Espera a ver `Started ComplianceBackendApplication` y `Tomcat started on port 8080`.
No necesita `mvn` si no cambiaste código Java: el JAR de `backend\target\` ya está
compilado.

**2. Frontend** (ventana 2, desde la raíz del repo):

```powershell
npm install    # solo la primera vez
npm start      # abre el navegador en http://localhost:4200
```

## Comprobar que todo responde

```powershell
Invoke-RestMethod http://127.0.0.1:8080/api/applications
```

Devuelve las filas de la lista (sin documentos ni campos de detalle). Para
verificar una solicitud completa, con sus documentos:

```powershell
$id = (Invoke-RestMethod http://127.0.0.1:8080/api/applications)[0].id
Invoke-RestMethod "http://127.0.0.1:8080/api/applications/$id"
```

## Rutas

| Ruta | Vista |
|---|---|
| `/solicitud` | formulario de cliente en blanco |
| `/solicitud/:id` | una solicitud existente |
| `/admin` | Bandeja / Histórico (pestañas internas) |

`/master-view` redirige a `/solicitud` por compatibilidad con marcadores viejos.

## Recompilar

**Backend** — necesario si tocaste Java o añadiste una migración:

```powershell
mvn -f backend/pom.xml clean package
```

Detén el backend antes: `clean` falla con *"Failed to delete ...jar"* mientras
el JVM tiene el archivo abierto. Luego vuelve a lanzar el `java -jar` de arriba.

**Frontend** — `npm start` recompila solo al guardar. Para un build de producción:

```powershell
npm run build     # salida en dist/
```

## Migraciones (Flyway)

Están en `backend/src/main/resources/db/migration/`. Se aplican **solas al
arrancar el backend**, así que una migración nueva solo surte efecto después de
recompilar y reiniciar.

- **Nunca edites una migración ya aplicada**: Flyway valida checksums y el
  backend se niega a arrancar. Añade un `V<n>__nombre.sql` nuevo.
- Estado actual: `V1__init.sql`, `V2__rejection.sql`, `V3__varchar_lengths.sql`.
  V3 convirtió todas las columnas `text` en `varchar` con anchos por columna.

Para ver qué se aplicó:

```powershell
$env:PGPASSWORD = 'compliance'
& "C:\Program Files\PostgreSQL\18\bin\psql.exe" -h 127.0.0.1 -p 5432 -U compliance -d compliance `
  -c "SELECT installed_rank, version, description, success FROM flyway_schema_history ORDER BY installed_rank;"
```

## Pruebas

```powershell
npm test         # Vitest: 44 pruebas en 4 archivos
npm run lint     # ESLint (TypeScript + plantillas)
```

Para una sola suite:

```powershell
npx ng test --watch=false --include='src/app/admin-view/admin-view.component.spec.ts'
```

Los specs usan el doble de prueba de `src/app/testing/compliance-repository.fake.ts`
en vez del `ComplianceRepositoryService` real, porque este es un wrapper de
`HttpClient`.

## Problemas frecuentes

| Síntoma | Causa / solución |
|---|---|
| El navegador abre pero no cargan datos | El backend no arrancó. Revisa la ventana 1 y espera a `Tomcat started on port 8080`. |
| `Port 8080 was already in use` | Ya hay un backend corriendo. Ciérralo, o comprueba con `Get-NetTCPConnection -LocalPort 8080 -State Listen`. |
| `Failed to delete ...compliance-backend-0.1.0.jar` | El backend sigue corriendo. Detén el JVM y repite `mvn clean package`. |
| `Flyway ... checksum mismatch` | Editaste una migración existente. Reviértela y crea un `V<n>` nuevo. |
| `Flyway ... applied migration not resolved locally` | Corres un JAR viejo contra una base ya migrada. Recompila y reinicia. |
| Error de conexión a la base | PostgreSQL no está en 5432, o faltan `DB_URL` / `DB_USER` / `DB_PASSWORD`. |
