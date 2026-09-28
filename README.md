# Compliance Portal — Paquete Portable

> **¿Estás en el repositorio de código fuente?** Este documento describe el
> *paquete portable* ya extraído (`pg\`, `pgdata\`, `frontend\`, `backend\*.jar`),
> que no es la disposición de este checkout. Para ejecutar el proyecto desde el
> código fuente, ver **[DEVELOPMENT.md](DEVELOPMENT.md)**.
>
> **¿Recibes este repositorio como ZIP y necesitas ponerlo en marcha?**
> Empieza por **[HANDOFF.md](HANDOFF.md)**: requisitos, creación de la base de
> datos, líneas de comando, referencia de la API y el esquema SQL.

Paquete autónomo con **PostgreSQL portable**, el **backend Spring Boot** y el **frontend Angular**, para probar el proyecto sin instalar ni configurar nada.

## Requisitos en tu PC

- **Java 17 o superior** (para el backend).
- **Node.js 22 o superior** (para el frontend; incluye `npm`).
- Conexión a internet **solo la primera vez** (para `npm install`).

## Inicio rápido

1. Descarga el archivo `compliance-portal-portable.zip`.
2. Extráelo en cualquier carpeta (por ejemplo `C:\Cumplimiento`). El paquete funciona desde cualquier ubicación sin permisos de administrador.
3. Dentro de la carpeta extraída, ejecuta:

   ```powershell
   .\start.ps1
   ```

4. Espera a que se abra el navegador en **http://localhost:4200** y usa el portal.

> Nota: si Windows bloquea el script (política de ejecución), ejecuta una vez en PowerShell:
>
> ```powershell
> Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
> ```

## Qué hace `start.ps1` (automático)

1. **Primera ejecución:** inicializa el directorio de datos de PostgreSQL (`pgdata\`) con el usuario `compliance`.
2. Arranca PostgreSQL portable en el puerto **5432** (o el indicado con `PORTABLE_PG_PORT`, ver abajo).
3. Crea la base de datos `compliance` si no existe.
4. Arranca el backend (API en **http://127.0.0.1:8080**) y espera a que responda.
5. Instala las dependencias del frontend la primera vez (`npm install`) y arranca `ng serve` en el puerto **4200**.

Las tablas de la base de datos se crean solas (Flyway) en el primer arranque del backend.

## El puerto 5432 está ocupado (tienes otro PostgreSQL/Docker)

Si `start.ps1` termina con un error de PostgreSQL que dice algo como
`could not bind IPv4 address "127.0.0.1": Permission denied`, significa que el puerto **5432** ya lo usa otro programa en tu PC (por ejemplo otra instalación de PostgreSQL o Docker).

La forma más sencilla de resolverlo **sin tocar tu otro PostgreSQL** es indicar otro puerto con la variable `PORTABLE_PG_PORT`. El backend se conecta solo al mismo puerto:

```powershell
$env:PORTABLE_PG_PORT = "5433"
.\start.ps1
```

Solo hay que definirlo **antes de la primera ejecución** (o si cambias de puerto). Puedes comprobar quién ocupa el puerto con:

```powershell
Get-NetTCPConnection -LocalPort 5432 -State Listen | ForEach-Object { Get-Process -Id $_.OwningProcess }
```

El script además **comprueba el puerto antes de arrancar** y te avisa si está ocupado, con las mismas instrucciones.

## Detener el proyecto

- El frontend se detiene presionando **Ctrl+C** en la ventana donde corre `npm start`.
- Para detener el backend y PostgreSQL:

  ```powershell
  .\stop.ps1
  ```

## Estructura del paquete

```
compliance-portal-portable/
├── pg\pgsql\               Binarios de PostgreSQL 16.4 (portable)
├── backend\
│   └── compliance-backend-0.1.0.jar   API Spring Boot
├── frontend\               Aplicación Angular (código fuente)
├── start.ps1               Arranca todo
├── stop.ps1                Detiene backend y PostgreSQL
└── README.md
```

## Datos y registros generados al ejecutar

| Elemento            | Ubicación                        |
|---------------------|----------------------------------|
| Base de datos       | `pgdata\` (se crea la primera vez) |
| Log de PostgreSQL   | `pg.log`                         |
| Log del backend     | `backend.log` y `backend.log.err` |

- La base de datos se guarda en `pgdata\`; para reiniciar desde cero, detén el proyecto y borra esa carpeta.
- El portal no tiene inicio de sesión: `/admin` muestra todos los clientes y `/solicitud/<id>` abre cualquier solicitud cuyo UUID se conozca. Es una demo local, no un sistema expuesto.

## Problemas frecuentes

| Problema | Solución |
|----------|----------|
| `El término 'node' no se reconoce...` | Instala Node.js 22+ y abre una nueva ventana de PowerShell. |
| `No se encontro Java...` | Instala Java 17+ y abre una nueva ventana de PowerShell. |
| El puerto 5432 está ocupado (error `could not bind ... Permission denied`) | Usa otro puerto: `$env:PORTABLE_PG_PORT = "5433"` y luego `.\start.ps1`. O cierra el programa/servicio que ocupa 5432. |
| El navegador abre pero no carga datos | Espera a que el backend termine de arrancar (mensaje "Backend listo") y recarga la página. Si aún falla, revisa `backend.log`. |
| Windows bloquea el script | Ejecuta el comando de `Set-ExecutionPolicy` indicado arriba. |
| Después de `npm install` falla algo | Revisa la conexión a internet y vuelve a ejecutar `start.ps1`. |