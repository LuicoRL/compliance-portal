# Compliance Portal — Guía de traspaso y puesta en marcha

Guía completa de incorporación, referencia de arquitectura y esquema de base de
datos del **Compliance Portal** (incorporación de clientes KYC/AML). Está
escrita para un desarrollador o miembro del equipo que acaba de descargar este
repositorio y necesita ponerlo en marcha y entenderlo.

- **Frontend:** Angular 22, componentes *standalone* (sin NgModules)
- **Backend:** Spring Boot 3.4.1 (Java 17+), JDBC mediante `JdbcTemplate`
- **Base de datos:** PostgreSQL, esquema gestionado con migraciones de Flyway
- **Pruebas:** Vitest (44 pruebas)

---

## 0. Inicio rápido

Si PostgreSQL ya está corriendo y existe la base de datos `compliance`, esto es
todo — dos terminales, desde la raíz del repositorio:

```powershell
# Terminal 1 — backend  (compilar una vez, luego ejecutar)
mvn -f backend/pom.xml clean package
java -jar backend\target\compliance-backend-0.1.0.jar

# Terminal 2 — frontend
npm install
npm start
```

Luego abre **<http://localhost:4200>**.

> Si la base de datos todavía no existe, haz primero la
> [sección 3](#db-setup): es el paso que más se pasa por alto, y el backend
> **no** crea la base de datos por ti.

---

## 1. Qué hace la aplicación

Una **empresa (cliente)** envía un expediente de cumplimiento KYC/AML:
documentos de identidad y de registro, más los datos del formulario. Un
**revisor interno** inspecciona el expediente en la vista de administración y
luego lo **aprueba** o lo **rechaza** indicando exactamente qué campos debe
corregir la empresa. Según el nivel de riesgo, el revisor puede habilitar dos
niveles adicionales de cuestionarios (*Intermedio* = cliente estándar/regional,
*Reforzado* = alto riesgo / EDD). El revisor también puede generar un informe PDF
por empresa.

Hay dos vistas separadas, cada una en su propia URL, y ambas hablando con el
mismo backend:

| Vista | URL | Destinatario |
|---|---|---|
| Formulario del cliente | `/solicitud` y `/solicitud/:id` | la empresa |
| Administración interna | `/admin` | el revisor (pestañas: *Bandeja* / *Histórico*) |

---

## 2. Requisitos previos

| Herramienta | Mínimo | Verificado con |
|---|---|---|
| Java | **17+** | 23.0.1 |
| Maven | 3.6+ (**debe instalarse** — no hay wrapper `mvnw`) | 3.9.9 |
| Node.js | 22+ | 24.19.0 |
| PostgreSQL | 14+ | 18.6 |

Puertos utilizados — asegúrate de que estén libres:

| Puerto | Lo usa |
|---|---|
| `5432` | PostgreSQL |
| `8080` | API de Spring Boot |
| `4200` | Servidor de desarrollo de Angular |

---

## 3. Configuración de la base de datos <a id="db-setup"></a>

Las migraciones crean las **tablas**, pero no pueden crear la **base de datos ni
el rol de inicio de sesión** — eso alguien tiene que hacerlo antes, usando un
superusuario de PostgreSQL (normalmente el usuario `postgres`).

### 3.1 Crear el rol y la base de datos

Ejecuta esto como superusuario de PostgreSQL. Nota el marcador `<VERSION>`:
ajústalo a tu instalación, o usa `psql` directamente si está en tu `PATH`:

```powershell
# La contraseña es la que TÚ elegiste para el superusuario postgres.
$env:PGPASSWORD = 'tu-password-de-admin-postgres'

# 1. Rol de inicio de sesión de la aplicación
& "C:\Program Files\PostgreSQL\18\bin\psql.exe" -U postgres -c "CREATE ROLE compliance LOGIN PASSWORD 'compliance';"

# 2. Base de datos de la aplicación, propiedad de ese rol
& "C:\Program Files\PostgreSQL\18\bin\psql.exe" -U postgres -c "CREATE DATABASE compliance OWNER compliance;"
```

`CREATE DATABASE` no puede ejecutarse dentro de un bloque de transacción, por
eso es una llamada `-c` aparte. Si el rol o la base de datos ya existen verás el
error "already exists" — es seguro ignorarlo.

> **Importante:** el rol `compliance` **no** tiene el privilegio `CREATEDB`, a
> propósito. Por eso la base de datos debe crearla un superusuario, y también
> por eso la aplicación nunca puede crear ni eliminar bases de datos por su
> cuenta.

### 3.2 Las tablas se crean solas

No hay nada más que ejecutar. En el primer arranque del backend, Flyway detecta
un esquema vacío y aplica `V1` automáticamente. Deberías ver esto en el log del
backend:

```
INFO  Flyway: Migrating schema "public" to version "1 - init"
INFO  Flyway: Successfully applied 1 migration to schema "public", now at version v1
```

Confírmalo:

```powershell
$env:PGPASSWORD = 'compliance'
& "C:\Program Files\PostgreSQL\18\bin\psql.exe" -h 127.0.0.1 -p 5432 -U compliance -d compliance `
  -c "SELECT installed_rank, version, description, success FROM flyway_schema_history ORDER BY installed_rank;"
```

### 3.3 Usar una base de datos distinta

Los valores por defecto están en `backend/src/main/resources/application.yml` y
se pueden sobrescribir con variables de entorno, así que no tienes que editar
ningún archivo:

```powershell
$env:DB_URL       = "jdbc:postgresql://127.0.0.1:5432/compliance"
$env:DB_USER      = "compliance"
$env:DB_PASSWORD  = "compliance"
$env:CORS_ORIGINS = "http://localhost:4200,http://127.0.0.1:4200"
java -jar backend\target\compliance-backend-0.1.0.jar
```

La aplicación Angular llama a `http://127.0.0.1:8080/api`, configurado en
`src/environments/environment.ts`. Si mueves la API, cámbialo también ahí.

---

## 4. Compilar el backend

El repositorio **no** contiene un JAR precompilado — `backend/target/` está en
el `.gitignore`, así que un zip descargado del repositorio contiene **solo
código fuente**. Debes compilar una vez:

```powershell
mvn -f backend/pom.xml clean package
```

Esto produce el JAR ejecutable de Spring Boot en:

```
backend\target\compliance-backend-0.1.0.jar     (~24 MB)
```

**Recompila cada vez que cambies código Java o añadas una migración.** Detén
primero el backend que esté corriendo, o `clean` fallará con:

```
Failed to delete ...\backend\target\compliance-backend-0.1.0.jar
```

Ese mensaje solo significa que la JVM que está corriendo todavía tiene el
archivo abierto — cierra la terminal del backend e inténtalo de nuevo.

---

## 5. Ejecutar el backend

```powershell
java -jar backend\target\compliance-backend-0.1.0.jar
```

Espera a que aparezcan estas dos líneas:

```
Tomcat started on port 8080 (http) with context path '/'
Started ComplianceBackendApplication in 10.2 seconds
```

Deja esa terminal abierta. Para detener el backend, presiona `Ctrl+C`.

---

## 6. Ejecutar el frontend

En una **segunda** terminal, desde la raíz del repositorio:

```powershell
npm install     # solo la primera vez; ~1-2 minutos
npm start
```

`npm start` ejecuta `ng serve -o`, que levanta el servidor de desarrollo en
<http://localhost:4200> y abre tu navegador.

### Las rutas

| URL | Vista |
|---|---|
| `/` | redirige a `/solicitud` |
| `/solicitud` | formulario del cliente, en blanco |
| `/solicitud/:id` | una solicitud concreta, cargada por UUID |
| `/admin` | revisión interna (pestañas: *Bandeja* / *Histórico*) |
| `/master-view` | redirección antigua a `/solicitud` |
| cualquier otra | página de no encontrado |

---

## 7. Verificar que funciona

```powershell
Invoke-RestMethod http://127.0.0.1:8080/api/applications
```

Un arreglo vacío `[]` es un **éxito** — significa que la API está arriba y la
base de datos es accesible. (Esta copia del repositorio ya trae 5 solicitudes de
demostración; una instalación limpia devuelve `[]`.) Para cargar una solicitud
concreta con sus documentos:

```powershell
$id = (Invoke-RestMethod http://127.0.0.1:8080/api/applications)[0].id
Invoke-RestMethod "http://127.0.0.1:8080/api/applications/$id"
```

Para enviar una solicitud de prueba de principio a fin: abre `/solicitud`,
completa los seis campos obligatorios, adjunta un **PDF** por campo y envía.
Después abre `/admin`: la solicitud debería aparecer en *Bandeja* con estado
*Pendiente*.

---

## 8. Pruebas y linting

```powershell
npm test         # Vitest: 44 pruebas en 4 archivos
npm run lint     # ESLint, TypeScript + plantillas
npm run build    # build de producción en dist/
```

Para una sola suite:

```powershell
npx ng test --watch=false --include='src/app/admin-view/admin-view.component.spec.ts'
```

Los specs no deben usar el `ComplianceRepositoryService` real (es un wrapper de
`HttpClient`). Usa el doble de prueba en su lugar:

```ts
import { createRepositoryFake } from '../testing/compliance-repository.fake';
```

---

## 9. Estructura del proyecto

```
compliance-portal/
│
├── src/                                  ← Frontend Angular (raíz del repo)
│   ├── main.ts                           bootstrap
│   ├── styles.scss                       entrada global
│   ├── styles/
│   │   └── _shared.scss                  estilos compartidos: shell / tipografía / formularios
│   ├── environments/
│   │   └── environment.ts                apiUrl
│   └── app/
│       ├── app.routes.ts                 ← MAPA DE RUTAS (empieza a leer aquí)
│       ├── app.config.ts                 providers
│       │
│       ├── client-view/                  ← VISTA 1: formulario del cliente
│       │   ├── client-view.component.ts      lógica
│       │   ├── client-view.component.html    plantilla
│       │   ├── client-view.component.scss    estilos
│       │   └── client-view.component.spec.ts
│       │
│       ├── admin-view/                   ← VISTA 2: revisor interno
│       │   ├── admin-view.component.ts
│       │   ├── admin-view.component.html    (incluye el modal de rechazo)
│       │   ├── admin-view.component.scss
│       │   └── admin-view.component.spec.ts
│       │
│       ├── shared/
│       │   └── compliance-fields.ts      ← CATÁLOGO DE CAMPOS (fuente única de verdad)
│       │
│       ├── compliance.models.ts          tipos + 4 estados
│       ├── compliance-repository.service.ts   wrapper HTTP (único que llama a la API)
│       ├── testing/                      dobles de prueba
│       └── error-routing/                404 + manejador global de errores
│
├── backend/                              ← API Spring Boot
│   ├── pom.xml
│   └── src/main/
│       ├── java/com/compliance/
│       │   ├── ComplianceBackendApplication.java
│       │   ├── api/                      ClientController + DTOs + CORS
│       │   ├── client/ClientRepository.java   SQL con JdbcTemplate
│       │   └── pdf/PdfService.java             generación de PDF en el servidor
│       └── resources/
│           ├── application.yml           puerto, CORS, configuración de BD
│           └── db/migration/             ← SQL de Flyway (ver sección 12)
│               └── V1__init.sql
│
├── README.md                             documentación del paquete portable
├── DEVELOPMENT.md                        notas de desarrollo del día a día
└── HANDOFF.md                            este archivo
```

> `start.ps1` / `stop.ps1` / `package-portable.ps1` pertenecen al **paquete
> distribuible portable** (disposición `pg\`, `pgdata\`, `frontend\`,
> `backend\*.jar`). No se usan en este repositorio — `start.ps1` se abortará
> aquí porque espera que esos directorios existan. Usa los comandos manuales de
> este documento.

---

## 10. Cómo funciona la aplicación

### 10.1 Los 18 campos, en tres niveles

Definidos una sola vez en `src/app/shared/compliance-fields.ts`; **ambas vistas
los importan**, y eso es lo que mantiene las dos interfaces coherentes entre
sí. Si añades un campo, añádelo ahí.

**Nivel 1 — Base (6 campos, todos obligatorios)**

| Clave | Etiqueta (en español, tal como aparece en la interfaz) |
|---|---|
| `constitutionRecord` | Testimonio de constitución o CI |
| `nit` | NIT / TAX ID |
| `commercialRegistration` | Registro de Comercio |
| `representativeDocument` | Documento de identidad del Representante Legal |
| `representativePower` | Poder del Representante Legal |
| `bankCertification` | Certificación bancaria |

**Nivel 2 — Intermedio (4 campos, todos obligatorios)** — solo se muestra cuando
el revisor habilita los formularios adicionales.

| Clave | Etiqueta |
|---|---|
| `operatingLicense` | Licencia de Funcionamiento |
| `uboIdentities` | Documento de identidad de accionistas / UBOs |
| `orgChart` | Organigrama societario |
| `commercialEvidence` | Evidencia comercial |

**Nivel 3 — Reforzado (7 campos, 2 obligatorios)** — alto riesgo / EDD.

| Clave | Etiqueta | Obligatorio |
|---|---|---|
| `financialStatements` | Estados financieros | opcional |
| `operatingFlow` | Flujo operativo / modelo de negocio | **sí** |
| `commercialContracts` | Contratos comerciales relevantes | opcional |
| `amlManual` | Manual AML/CFT | opcional |
| `regulatoryLicenses` | Licencias regulatorias del rubro | opcional |
| `submerchants` | Información de subcomercios | opcional |
| `pepDeclaration` | Declaración de PEP | **sí** |

Además, el formulario base tiene un campo `website` ("Página web / Redes
sociales"), que es el único opcional del Nivel 1.

### 10.1.1 Convención del asterisco

`*` significa **obligatorio** y la leyenda `* (campo obligatorio)` aparece al
inicio de cada formulario. Los campos opcionales no llevan asterisco. Los 13
campos obligatorios son `clientName`, los 6 del Nivel 1, los 4 del Nivel 2 y
`operatingFlow` + `pepDeclaration`. Los 6 opcionales son `website` y los cinco
restantes del Nivel 3.

El asterisco es **solo visual**: la validación real de los formularios de
seguimiento la hace `submitFollowUpForms()` en
`src/app/client-view/client-view.component.ts`, que exige los 4 campos
intermedios más los 2 reforzados marcados como `required`. No se añada el
atributo HTML `required` a esos campos, porque el navegador bloquearía el
envío y el usuario vería una validación en inglés.

Las claves de formulario son `camelCase` en TypeScript y se corresponden con
columnas `snake_case` (`representativeDocument` → `representative_document`). El
`form_key` de un documento registra a qué campo pertenece.

### 10.2 Máquina de estados

Cuatro estados, definidos en `src/app/compliance.models.ts`:

```
NOT_APPROVED ──envía──▶ PENDING ──aprueba──▶ APPROVED
     ▲                     │                      (terminal)
     │                     └──rechaza──▶ REJECTED
     └─────── reenvía ────────────────┘
```

- El **cliente** solo escribe `PENDING`. Sus dos caminos de guardado pasan por
  `saveAndComplete()` (`client-view.component.ts`), que fija la marca de tiempo,
  fuerza `status = 'PENDING'`, **borra** `rejectedAt` y `rejectionFields`, guarda
  y luego navega a `/solicitud/<id>`.
- El **admin** escribe `APPROVED` y `REJECTED`.
- El cliente solo puede editar mientras el estado sea `NOT_APPROVED` o
  `REJECTED`.
- Cuando el estado es `REJECTED`, **solo los campos señalados** son editables
  (`isFieldEditable()`), así que la empresa únicamente puede tocar lo que se le
  indicó corregir.

### 10.3 La regla de aprobación — la regla más importante que hay que portar

De `admin-view.component.ts`:

```ts
canApprove(application) =
     application.status !== 'APPROVED'
  && application.baseDocumentationReviewed
  && ( !application.followUpFormsEnabled
       || Boolean(application.followUpFormsSubmittedAt) )
```

En palabras: el revisor solo puede aprobar cuando la **documentación base ha
sido marcada como revisada** Y, además, el nivel de formularios adicionales
**nunca fue habilitado** o la empresa **ya lo envió**.

### 10.4 Flujo de datos

```
Componente Angular
  └─ ComplianceRepositoryService      (el único lugar que conoce la URL de la API)
       └─ HttpClient  →  http://127.0.0.1:8080/api
            └─ ClientController.java
                 └─ ClientRepository.java   (JdbcTemplate)
                      └─ PostgreSQL:  clients / documents / pdfs
```

Los archivos adjuntos se envían a la API como **base64 dentro del cuerpo JSON**
(`fileToBase64()`), y se recuperan mediante una URL GET que se abre en una
pestaña nueva (`documentViewUrl()`). Los PDF se generan **en el servidor**, en
`PdfService`; el frontend solo hace el POST para generarlo y luego abre la URL
de descarga.

### 10.5 Ojo: el endpoint de lista pierde información

`GET /api/applications` devuelve **solo filas de lista** — sin documentos, y con
los campos de texto del detalle vacíos. Por eso `rowToApplication()` los rellena
con cadenas vacías. Consecuencias que hay que preservar si refactorizas:

- La vista de administración **debe** llamar a `getById()` cuando el revisor
  hace clic en una fila.
- Como esa es una segunda llamada asíncrona, ambos componentes guardan un token
  de petición (`detailRequestId`, o comparando `requestedId`) para que una
  respuesta lenta de la fila A no pueda sobrescribir el panel que muestra la
  fila B.
- La vista de administración refresca la lista por separado y nunca reemplaza el
  panel de revisión abierto.

### 10.6 Guardar es un upsert completo

No existe un `PATCH` por campo para el contenido del formulario. Tanto el
cliente como el admin llaman al mismo `POST /api/applications`, que hace un
upsert de la solicitud completa (documentos incluidos). Los endpoints `PATCH`
existen únicamente para las banderas del flujo interno (estado, documentación
base revisada, elegibilidad y envío de formularios adicionales).

---

## 11. Referencia de la API

Ruta base `/api/applications`.

| Método | Ruta | Para qué sirve |
|---|---|---|
| `GET` | `/api/applications` | Filas de lista (admin *Bandeja* e *Histórico*) |
| `GET` | `/api/applications/{id}` | Detalle completo, incluidos los documentos |
| `POST` | `/api/applications` | Crear o actualizar (upsert) |
| `DELETE` | `/api/applications/{id}` | Eliminar una solicitud |
| `PATCH` | `/api/applications/{id}/status` | Fijar el estado |
| `PATCH` | `/api/applications/{id}/base-reviewed` | Marcar la documentación base como revisada |
| `PATCH` | `/api/applications/{id}/follow-up-eligibility` | Habilitar/deshabilitar los niveles adicionales |
| `PATCH` | `/api/applications/{id}/follow-up-submit` | Marcar los formularios adicionales como enviados |
| `POST` | `/api/applications/{id}/pdf` | Generar y guardar el informe PDF |
| `GET` | `/api/applications/{id}/pdf` | Descargar el último PDF guardado |
| `GET` | `/api/applications/{id}/pdfs` | Listar los metadatos de los PDF guardados |
| `GET` | `/api/applications/{id}/documents/{docId}?inline=true` | Ver un documento cargado |

Por defecto CORS permite cuatro orígenes: `http://localhost:4200`,
`http://127.0.0.1:4200`, `http://localhost:8080` y `http://127.0.0.1:8080`. La
lista se cambia con la variable de entorno `CORS_ORIGINS` (lista separada por
comas), declarada en `app.cors.allowed-origins` de `application.yml`.

---

## 12. Esquema de la base de datos (migraciones de Flyway)

Ubicación: `backend/src/main/resources/db/migration/`. Flyway las aplica en
orden de nombre de archivo al arrancar y registra cada una en
`flyway_schema_history`.

Hay **una sola migración**. `V1__init.sql` crea las tres tablas y declara todas
las columnas de texto ya como `varchar(n)`, con un ancho por columna según el
contenido que realmente guardan. No queda ningún `text` sin acotar ni ningún
`ALTER TABLE` que convierta tipos después.

> **Nunca edites una migración que ya haya sido aplicada.** Flyway valida los
> checksums y el backend se negará a arrancar. Siempre añade un archivo nuevo
> `V<n>__nombre.sql` en su lugar.
>
> `V1__init.sql` es la excepción histórica: el proyecto aún no tenía datos ni
> despliegues cuando se reescribió para declarar los `varchar` desde el inicio
> (antes eran `text` y los convertía un `V3` con `ALTER TABLE`). Desde el primer
> despliegue, **`V1` también queda congelada**: cualquier cambio de esquema
> posterior va en un `V2__nombre.sql` nuevo.

### `V1__init.sql`

```sql
-- Compliance Portal: base schema.
--
-- Every string column is a bounded `varchar` from the start, sized to the real
-- content it carries rather than to one arbitrary number. `status`, `nit`,
-- `form_key` and the `content_type` columns hold short codes, while company
-- names, URLs, free-text document references and file names need much more
-- room.
--
-- Two widths deserve a note:
--   * `documents.file_name` (255) stores the document's display label, e.g.
--     "Documento de identidad del Representante Legal" (46 chars), so it can
--     never be as short as 25.
--   * `documents.form_key` (25) is the tightest constraint in the schema: the
--     longest key in the app is `representativeDocument` at 23 characters, so
--     only 2 characters of headroom remain. Raise it before adding a longer
--     field key.
--   * `clients.rejection_fields` (500) holds a JSON array of flagged form keys;
--     with all 18 selected it serialises to 329 chars. It is a string, not a
--     real JSON column.

CREATE TABLE clients (
    id                            UUID PRIMARY KEY,
    client_name                   VARCHAR(180) NOT NULL,
    nit                           VARCHAR(25) NOT NULL,
    constitution_record           VARCHAR(120),
    commercial_registration       VARCHAR(120),
    representative_document       VARCHAR(120),
    representative_power          VARCHAR(120),
    bank_certification            VARCHAR(120),
    website                       VARCHAR(255),
    status                        VARCHAR(25) NOT NULL DEFAULT 'NOT_APPROVED',
    base_documentation_reviewed   BOOLEAN NOT NULL DEFAULT FALSE,
    base_documentation_reviewed_at TIMESTAMPTZ,
    follow_up_forms_enabled       BOOLEAN NOT NULL DEFAULT FALSE,
    follow_up_forms_enabled_at    TIMESTAMPTZ,
    follow_up_forms_submitted_at  TIMESTAMPTZ,
    operating_license             VARCHAR(500),
    ubo_identities                VARCHAR(500),
    org_chart                     VARCHAR(500),
    commercial_evidence           VARCHAR(500),
    financial_statements          VARCHAR(500),
    operating_flow                VARCHAR(500),
    commercial_contracts          VARCHAR(500),
    aml_manual                    VARCHAR(500),
    regulatory_licenses           VARCHAR(500),
    submerchants                  VARCHAR(500),
    pep_declaration               VARCHAR(500),
    rejected_at                   TIMESTAMPTZ,
    rejection_fields              VARCHAR(500),
    created_at                    TIMESTAMPTZ NOT NULL DEFAULT now(),
    submitted_at                  TIMESTAMPTZ,
    reviewed_at                   TIMESTAMPTZ
);

CREATE TABLE documents (
    id           UUID PRIMARY KEY,
    client_id    UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    form_key     VARCHAR(25) NOT NULL,
    file_name    VARCHAR(255) NOT NULL,
    content_type VARCHAR(25),
    size         BIGINT,
    content      BYTEA NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_documents_client ON documents(client_id);

CREATE TABLE pdfs (
    id           UUID PRIMARY KEY,
    client_id    UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    file_name    VARCHAR(255) NOT NULL,
    content_type VARCHAR(25) NOT NULL DEFAULT 'application/pdf',
    content      BYTEA NOT NULL,
    generated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_pdfs_client ON pdfs(client_id);
```

### Referencia del esquema final

| Tabla | Columnas | Notas |
|---|---|---|
| `clients` | 31 | la solicitud; ancha por diseño, una columna por campo del formulario |
| `documents` | 8 | PDF cargados, `BYTEA`, `ON DELETE CASCADE` desde `clients` |
| `pdfs` | 6 | informes generados, `BYTEA`, `ON DELETE CASCADE` desde `clients` |

Las columnas se nombran en `snake_case`; la API y TypeScript usan `camelCase`.
La correspondencia se resuelve en `ClientRepository` / `ClientDetail`.

---

## 13. ⚠️ Limitaciones conocidas — léelas antes de producción

**Son vacíos reales, no olvidos. Por favor, abórdalos en el proyecto
principal.**

### 13.1 No hay autenticación

Esta es la más importante. Cualquiera que alcance la aplicación puede:

- abrir `/admin` y ver **todos** los clientes y todos los documentos cargados;
- abrir `/solicitud/<uuid>` y cargar **cualquier** solicitud cuyo id consiga.

Los UUID son lo único que se interpone entre un desconocido y los documentos de
identidad y la certificación bancaria de un cliente. Añade autenticación y
autorización reales antes de que esto se acerque a datos de producción.

### 13.2 No hay registro de auditoría

Existen marcas de tiempo (`submitted_at`, `reviewed_at`, `rejected_at`,
`base_documentation_reviewed_at`, …) pero **nada registra quién hizo qué**. Para
un producto de cumplimiento, un log de auditoría inmutable suele ser una
exigencia legal — añádelo.

### 13.3 Los anchos de `varchar` son provisionales

Los anchos declarados en `V1__init.sql` son coherentes entre sí y seguros frente a los datos que ha
visto esta demo, pero esos datos son **de usar y tirar** — los NIT son
literalmente `2`, `23`, `321`. Así que varios límites nunca se han puesto a
prueba:

| Columna | Ancho | Precaución |
|---|---|---|
| `documents.form_key` | **25** | **La restricción más ajustada del esquema.** La clave más larga es `representativeDocument` (23 caracteres) — solo sobran 2. Añadir una clave de campo de 26 caracteres empezará a fallar en los inserts. Súbelo a 40 antes de ampliar la lista de campos. |
| `documents.content_type` | 25 | `application/pdf` ocupa 15, bien — pero cualquier tipo MIME más largo se rompe. |
| las 11 columnas de formularios adicionales | 500 | Descripciones en texto libre; 500 es una suposición. Una entrada demasiado larga falla **en la base de datos**, no con un mensaje de validación amable. |
| `clients.client_name` | 180 | No se probó ningún nombre realmente largo. |
| `clients.rejection_fields` | 500 | Guarda un arreglo JSON de claves señaladas; con las 18 seleccionadas son 329 caracteres. Es seguro, pero el arreglo es una **cadena**, no una columna JSON — ver más abajo. |

Además: `rejection_fields` guarda un arreglo JSON dentro de un `varchar`. Si el
proyecto principal necesita consultar los campos señalados, usa una columna
`jsonb` de verdad, o una tabla de unión.

**Recomendación:** carga un conjunto de datos con forma de producción a través de
la aplicación antes de confiar en estos anchos, o amplía generosamente los de
texto libre. Relajar una restricción ahora es barato; depurarla después de salir
a producción es caro.

### 13.4 Las cargas aceptan PDF por extensión o por tipo MIME

`onDocumentSelected()` comprueba el tipo MIME *o* un nombre de archivo `.pdf`,
no la firma real del archivo. Si usuarios no confiables suben archivos, valida
los bytes mágicos (la firma) en el servidor y considera un límite de tamaño: el
esquema actual guarda el archivo completo en una columna `BYTEA` sin ningún
límite de longitud.

---

## 14. Solución de problemas

| Síntoma | Causa / solución |
|---|---|
| El navegador abre pero no cargan datos | El backend no está corriendo, o todavía arrancando. Espera a `Tomcat started on port 8080` y recarga. |
| `Port 8080 was already in use` | Hay otro backend corriendo. Encuéntralo con: `Get-NetTCPConnection -LocalPort 8080 -State Listen` |
| `Failed to delete ...\compliance-backend-0.1.0.jar` | El backend sigue corriendo. `Ctrl+C` y recompila. |
| El backend sale: `password authentication failed` | Rol/base de datos no creados como en la sección 3, o `DB_USER`/`DB_PASSWORD` están mal. |
| El backend sale: `database "compliance" does not exist` | La base de datos nunca se creó. Sección 3.1. |
| `Flyway ... checksum mismatch` | Alguien editó una migración ya aplicada. Revierte eso y añade un `V<n>` nuevo. |
| `Flyway ... applied migration not resolved locally` | Se está ejecutando un JAR viejo contra una base ya migrada. Recompila y reinicia. |
| `mvn` no se reconoce | Maven no está instalado — en este repositorio no hay wrapper `mvnw`. |
| `npm start` falla / página en blanco | Ejecuta `npm install` primero. `node_modules` está en el `.gitignore` y no viene en el zip. |
| Error de CORS en la consola del navegador | La API no está en `http://127.0.0.1:8080`, o `CORS_ORIGINS` debe incluir el origen que estás usando. |
| Adjuntar no hace nada | Solo se aceptan PDF. Verifica que el archivo sea realmente un PDF. |

---

## 15. Lista de verificación antes de compartir o bifurcar este repositorio

El zip que genera GitHub contiene **solo archivos versionados en git**. Eso
significa:

- **Sin `node_modules`** — quien lo recibe debe ejecutar `npm install`.
- **Sin `backend/target/*.jar`** — quien lo recibe debe ejecutar
  `mvn -f backend/pom.xml clean package`.
- **Sin base de datos** — quien lo recibe debe crear el rol y la base de datos
  (sección 3).

Comprueba que el árbol de trabajo esté limpio y que todo esté commiteado:

```powershell
git status        # debe salir limpio antes de hacer push
git log --oneline -3
```

El antiguo `src/app/master-view/` está eliminado en esta rama — ese componente
contenía ambas vistas detrás de un conmutador de modo, y queda sustituido por
`client-view/` y `admin-view/`.
