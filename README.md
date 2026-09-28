# Soporte

SaaS multi-tenant de gestión de tickets (soporte IT, compras y reparaciones edilicias),
con aislamiento físico **database-per-tenant**.

> Estado: **andamiaje inicial**. No hay lógica de negocio implementada todavía —
> solo estructura de carpetas (arquitectura hexagonal), configuración de build/lint/test,
> y los dos esquemas de datos (`prisma_master` / `prisma_tenant`). Ninguna base de datos
> fue creada ni migrada por este scaffold.

## Stack

### Backend (`backend/`)

- **NestJS 11** + TypeScript, Node 22+, gestor **pnpm**.
- **Prisma 7** con `@prisma/adapter-pg` (patrón `new Pool()` + `PrismaPg`, sin `datasourceUrl`
  en runtime). Dos schemas físicamente separados:
  - `prisma_master/schema.prisma` — clientes (tenants), usuarios (identidad global),
    membresías (usuario↔cliente↔rol, N:N), roles/permisos, refresh tokens, ciclos vigentes.
  - `prisma_tenant/schema.prisma` — una base de datos por cliente: tickets, timeline de
    operaciones, compras, reparaciones edilicias, equipos informáticos, base de conocimiento.
    - **`equipos_informaticos`** (inventario IT): `nombre`, `numero_serie` (único parcial
      cuando no es null), `marca`, `modelo`, `fecha_adquisicion`, `ubicacion` (texto libre,
      siempre en MAYÚSCULA), `importe` + `fecha_valoracion` (valoración del equipo),
      `observaciones` (texto libre del técnico), `valor_residual` + `fecha_valor_residual`
      (depreciación), `activo` (baja lógica). El **% de depreciación NO se persiste**: es una
      ayuda de cálculo en la UI que deriva `valor_residual = importe × (1 − %/100)` y setea la
      fecha en el día actual (editable). La ubicación es texto libre — ya no referencia el
      catálogo de `ubicaciones` (que sigue en uso para reparaciones edilicias).
- **Auth**: `@nestjs/jwt` + `passport-jwt` + `@node-rs/argon2` (hashing de passwords).
- **Validación**: `class-validator` / `class-transformer` con `ValidationPipe` global
  (`whitelist: true, transform: true`).
- **Testing**: Vitest.
- **Arquitectura**: hexagonal por módulo — `domain/` (entidades, puertos, errores) →
  `application/` (use cases) → `infrastructure/` (adaptadores: Prisma, guards, storage) →
  `interface/` (controllers, DTOs). Regla de fitness de ESLint: **ningún archivo fuera de
  `infrastructure/` puede importar `@prisma/client`**.

### Frontend (`frontend/`)

- **Next.js 15** (App Router) + **React 19**.
- **shadcn/ui** + **Tailwind 4** (tokens CSS-first, `@theme` / `@theme inline`).
- Tema día/noche por **clase `.dark` en `<html>`, persistida en `localStorage`** —
  `prefers-color-scheme` solo se usa como fallback inicial cuando no hay preferencia
  guardada, nunca como fuente de verdad en runtime. Script FOUC inline evita el flash.
- **TanStack Query 5** para estado de servidor.
- **react-hook-form** + **zod** para formularios (a implementar junto con cada feature).
- **jose** para verificar JWT en el middleware Edge (a implementar junto con auth).
- **sonner** para toasts (`<Toaster />` global en el root layout).
- **Testing**: Vitest + Testing Library (unit/component) + Playwright (e2e).

### Estructura del monorepo

```
soporte/
├── backend/    # proyecto pnpm independiente (NestJS)
├── frontend/   # proyecto pnpm independiente (Next.js)
└── docs/
```

`backend/` y `frontend/` son dos proyectos pnpm **independientes**: cada uno tiene su propio
`pnpm-workspace.yaml` y lockfile. No hay un `pnpm-workspace.yaml` raíz — se instalan y corren
por separado.

## Instalación

Requiere Node 22+ y pnpm.

```powershell
# Backend
cd backend
pnpm install
Copy-Item .env.example .env   # completar con tus valores (ver abajo)

# Frontend
cd ../frontend
pnpm install
Copy-Item .env.example .env.local   # completar con tus valores
```

### Generar los clientes Prisma (requerido para que el backend compile)

El backend importa los tipos generados de Prisma (`.prisma/master`, `.prisma/tenant`).
Sin este paso, `tsc` falla al resolver esos módulos:

```powershell
cd backend
pnpm run generate:master
pnpm run generate:tenant
```

Esto **no requiere una base de datos activa** — `prisma generate` solo lee el `schema.prisma`
y emite el client TypeScript.

### Validar los schemas sin conectar a una base de datos

```powershell
cd backend
pnpm run validate:master
pnpm run validate:tenant
```

### Migraciones (fuera de alcance de este scaffold)

Este andamiaje **no crea bases de datos ni corre migraciones**. Cuando haya una instancia de
Postgres disponible:

```powershell
pnpm run migrate:master
pnpm run migrate:tenant   # apunta a UNA db tenant (DATABASE_URL_TENANT), no a todas
pnpm run seed:root        # crea el primer usuario ROOT (is_global_admin = true)
pnpm run seed:demo        # opcional — tenant demo con datos de ejemplo, ver "Datos demo" abajo
```

### Backfill de la configuración de correo por cliente

Al pasar el envío a per-tenant, un cliente sin config deja de recibir notificaciones. Los
clientes que YA existían no eligieron eso, así que el backfill les siembra la config SMTP
global actual (las env vars `SMTP_*`), **cifrada**. Es de una sola vez y vuelve explícito lo
que antes pasaba de forma implícita.

```powershell
node scripts/backfill-correo-clientes.mjs
```

Es **idempotente** (`WHERE smtp_password_cifrada IS NULL`): correrlo dos veces no cambia nada
y **nunca pisa una config que ROOT ya cargó a mano**. Si falta alguna env var `SMTP_*` aborta
en vez de escribir una config parcial.

**EL ORDEN IMPORTA — no es el mismo que el orden de los commits:**

1. Provisionar `EMAIL_CRYPTO_KEY` en el entorno (sin ella el backfill no puede cifrar).
2. `pnpm run migrate:master` — crea las columnas.
3. `pnpm run generate:master` — regenerar el cliente Prisma. **Sin esto el cliente generado
   sigue con las columnas viejas** y las cosas fallan raro, no de frente.
4. Correr el backfill.
5. Recién ahí desplegar el código.

Desplegar antes del paso 4 reproduce exactamente la ventana sin notificaciones que el
backfill existe para evitar.

## Variables de entorno

### Backend (`backend/.env`, ver `backend/.env.example`)

Las variables marcadas **Requerida** se validan al arrancar (`backend/src/config/entorno.ts`): si alguna falta o está vacía, el proceso **aborta nombrándola** y la app no levanta. Las demás tienen default y no bloquean el arranque.

| Variable | Descripción |
|---|---|
| `DATABASE_URL_MASTER` | **Requerida — sin default.** Conexión Postgres a la DB master (clientes/usuarios/membresías/RBAC/ciclos). Las URLs de cada tenant se derivan de esta en runtime. |
| `DATABASE_URL_TENANT` | Conexión a UNA DB tenant (dev/test) — usada solo por `prisma.tenant.config.ts` para correr migraciones del schema tenant. |
| `JWT_SECRET` | **Requerida — sin default.** Secreto de firma de los JWT (access + refresh). Antes tenía un default de desarrollo publicado en el repo; se eliminó. |
| `JWT_ACCESS_EXPIRES_IN` / `JWT_REFRESH_EXPIRES_IN` | TTL de los tokens. |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASSWORD` / `SMTP_FROM` / `SMTP_SECURE` | **Solo para el backfill inicial** — desde `configuracion-correo-por-cliente`, el envío usa la config SMTP **de cada cliente**, no estas variables (ver abajo). `SMTP_SECURE="true"` usa SMTPS directo (típico puerto 465); default `false` (STARTTLS, puerto 587). |
| `EMAIL_CRYPTO_KEY` | Clave maestra AES-256-GCM que cifra en reposo la contraseña SMTP de cada cliente. **64 caracteres hex** (32 bytes). Si falta, la app **no** falla al arrancar: el guardado de config responde 503 y el envío degrada explícito con razón `EMAIL_CRYPTO_KEY_AUSENTE`. Generarla con `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. **NO se puede rotar reemplazando el valor**: cada credencial guardada quedaría indescifrable. Rotarla de verdad usa `rotate-email-crypto-key.ps1` (VPS, ver `DEPLOY-VPS-runbook.md` Sección 5), que re-cifra cada fila preservando el prefijo de versión `v1:`. |
| `ROOT_ADMIN_EMAIL` / `ROOT_ADMIN_PASSWORD` / `ROOT_ADMIN_NOMBRE` / `ROOT_ADMIN_APELLIDO` | Bootstrap idempotente del primer usuario **ROOT** (`is_global_admin = true`). |
| `SLA_SWEEP_CRON` | Expresión cron del barrido periódico de vencimiento de SLA (`SlaSweepScheduler`, módulo `sla/`). Default: cada 5 min (`CronExpression.EVERY_5_MINUTES`) si no está seteada. |
| `PREVENTIVO_SWEEP_CRON` | Expresión cron del barrido de generación de mantenimiento preventivo (`PreventivoSweepScheduler`, módulo `preventivo/`). Default: todos los días a la 1am (`CronExpression.EVERY_DAY_AT_1AM`) si no está seteada. |
| `APP_BASE_URL` | **Requerida — sin default.** URL base pública de la app, usada para armar links en emails de notificación (ej. `${APP_BASE_URL}/tickets/:id`). Usada por las plantillas de email del módulo `notificaciones/` (PR-N). |
| `PORT` / `NODE_ENV` | Configuración de la app. |

### Dependencias nuevas (módulo SLA, Fase 4)

- **`@nestjs/schedule`** — habilita `@Cron` para `SlaSweepScheduler` (barrido periódico
  multi-tenant de vencimiento de SLA). Registrado vía `ScheduleModule.forRoot()` en
  `sla/sla.module.ts`.

### Dependencias nuevas (módulo CSAT, sdd/csat WU7)

- **`@nestjs/throttler`** — rate limiting del endpoint público de encuesta
  (`GET`/`POST /publico/encuesta/:token`). `CsatThrottlerGuard` (`csat/infrastructure/guards/`)
  sobreescribe `getTracker()` para que la clave sea `${x-forwarded-for}:${token}` — el TOKEN
  es el componente primario, no la IP: todo el frontend habla con el backend a través del
  proxy BFF (`fetch()` server-side), así que el backend ve una sola IP para todos los
  usuarios. Registrado vía `ThrottlerModule.forRoot()` DENTRO de `csat.module.ts` (storage
  en memoria de un solo proceso, deuda anotada para cuando se escale horizontal), y el guard
  se aplica SOLO en `EncuestaPublicaController` — nunca global.

### Notificaciones por email (módulo `notificaciones/`, Fase 4 PR-N)

Escucha eventos de dominio ya emitidos (`ticket.estado_cambiado`, `ticket.comentado` público,
`sla.vencido`) y envía email al destinatario correspondiente (solicitante; o asignado +
administradores del tenant en el caso de `sla.vencido`). Sin preferencias de usuario en beta
(notificación fija por defecto). Plantillas en TS puro (sin Handlebars).

- **El envío es POR CLIENTE, no global** (`configuracion-correo-por-cliente`): cada cliente
  configura su propia cuenta SMTP desde la pantalla ROOT, y los mails salen con su identidad.
  `EMAIL_SENDER` resuelve el transporter en tiempo de envío usando `TenantContext.clienteId`,
  con caché keyeado por `${clienteId}:${configRevision}` — cambiar la config invalida la
  entrada vieja de forma estructural, sin TTL ni invalidación explícita.
- **Un cliente sin configurar NO recibe notificaciones**, y el estado se muestra como
  "correo no configurado" en el listado de clientes y en su ficha. Es deliberado: un
  respaldo silencioso al SMTP global haría que los mails salieran de una dirección genérica
  sin que el cliente lo sepa.
- **Tres razones de degradación distinguibles en logs**, que no colisionan a propósito:
  `EMAIL_SIN_TENANT_CONTEXT` (**bug nuestro**, hay que investigarlo), `EMAIL_CRYPTO_KEY_AUSENTE`
  (no se pudo descifrar la config) y `EMAIL_CLIENTE_SIN_CONFIG` (**esperado y benigno**).
  Si el bug y el caso esperado compartieran línea, el bug sería invisible.
- Resolución de contacto (email/nombre del destinatario) cross-DB contra `master.usuarios`/
  `master.membresias` — los eventos de dominio nunca llevan PII (ADR-6).
- Un fallo de envío a un destinatario aísla ese envío (log-and-swallow); no afecta a los demás
  destinatarios ni al flujo que disparó el evento (transición de estado, comentario, barrido SLA).

### Frontend (`frontend/.env.local`, ver `frontend/.env.example`)

| Variable | Descripción |
|---|---|
| `BACKEND_URL` | URL base del backend (route handlers / middleware, server-side). |
| `JWT_SECRET` | Debe coincidir con el del backend — verificación de JWT en el middleware Edge vía `jose`, sin llamar al backend en cada request. |

## Datos demo (Fase 5 Beta)

`backend/prisma_master/seeds/demo-seed.ts` provisiona un tenant demo completo
para explorar el frontend sin armar datos a mano — reusa `CrearClienteUseCase`
(mismo camino que un alta real de cliente vía ROOT: crea la DB física del
tenant, migra, siembra catálogos) y es **idempotente** (correrlo de nuevo no
duplica nada — reutiliza el cliente/usuarios/ciclo si ya existen, y solo
siembra tickets/compras/etc. si el tenant todavía no tiene ninguno).

```powershell
cd backend
pnpm run seed:demo
```

Requiere `DATABASE_URL_MASTER` apuntando a la DB master real (**nunca** una
`*_test`) y las migraciones ya aplicadas (`pnpm run migrate:master`).

Provisiona:
- 1 cliente demo ("Demo Soporte") con su tenant físico migrado y sembrado.
- 1 usuario por rol, todos con membresía activa en el tenant demo:

  | Rol | Email | Password |
  |---|---|---|
  | ADMINISTRADOR | `admin.demo@soporte-demo.local` | `Demo1234$` (o `DEMO_SEED_PASSWORD`) |
  | TECNICO | `tecnico.demo@soporte-demo.local` | ídem |
  | COLABORADOR | `colaborador.demo@soporte-demo.local` | ídem |
  | USUARIO | `usuario.demo@soporte-demo.local` | ídem |

- 1 ciclo del catálogo master, adoptado y activado en el tenant.
- ~8 tickets variados (SOPORTE/MANTENIMIENTO, distintos estados/prioridades),
  2 compras con items/presupuestos, 1 ticket edilicio con 2 subtareas, 2
  equipos con componentes + 1 ticket de soporte vinculado, 2 artículos de KB
  (1 público, 1 interno).

Password parametrizable por env `DEMO_SEED_PASSWORD` (default `Demo1234$`).

## ROOT vs ADMINISTRADOR

Son dos figuras **distintas**, modeladas en capas distintas (ver comentarios en
`backend/prisma_master/schema.prisma`):

- **ROOT** = super-admin **global** de la plataforma (cross-tenant). Se modela con
  `usuarios.is_global_admin = true`. Es el único autorizado a crear `clientes` y `ciclos`,
  y el único que puede acceder a cualquier tenant (header `X-Tenant-Id`) sin ser miembro.
  Puede no tener ninguna membresía.
- **ADMINISTRADOR** = un rol más dentro de `membresias` (junto a los demás roles del
  catálogo). Gestiona usuarios/roles/catálogos **solo de su cliente**; no crea clientes ni
  ciclos.

La regla "solo ROOT crea clientes/ciclos" se enforcea en la capa de **aplicación** (guards y
use cases, Fase 1) — el schema solo modela el flag que esa autorización necesita.

## Testing

```powershell
# Frontend — no necesita nada, corre solo
cd frontend
pnpm test        # unit/component (Vitest + Testing Library + MSW, sin backend real)
pnpm test:e2e     # Playwright — ver prerequisitos abajo
```

### Backend: preparar el entorno (camino primario)

**`pnpm test` a secas en `backend/` falla con cientos de tests en rojo.** No es el
código: los specs de integración y los e2e necesitan **dos bases de test propias**
que no están en `.env`. El camino primario, de punta a punta, es un solo comando:

```powershell
# 1. Contenedor Postgres (una sola vez — el comando de abajo NO lo crea, solo lo usa)
docker run -d --name soporte-postgres-master -p 5432:5432 `
  -e POSTGRES_USER=soporte -e POSTGRES_PASSWORD=soporte `
  --restart unless-stopped postgres:16

# 2. Completar backend/.env a partir de backend/.env.example (a mano, una sola vez)

# 3. Diagnóstico opcional — reporta qué falta sin tocar nada
cd backend
pnpm entorno:verificar

# 4. Crea las bases de test si faltan, migra las tres (master + master_test +
#    tenant_test) y siembra (seed:root, seed:demo, sync:ayuda) — idempotente,
#    correrlo dos veces seguidas no duplica ni falla
pnpm entorno:regenerar --confirmar
```

`pnpm entorno:regenerar` **sin** `--confirmar` es dry-run: imprime el plan completo
(host y origen de cada `DATABASE_URL_*`, contenedor, bases, migraciones pendientes,
seeds, claves faltantes en `.env`) sin mutar nada. Correlo así primero si querés ver
qué haría antes de aplicar.

#### Si tu contenedor no se llama `soporte-postgres-master`

`entorno:verificar` y `entorno:regenerar` inspeccionan el contenedor por nombre, y
ese nombre es `soporte-postgres-master` salvo que declares otro:

| Variable | Default | Para qué |
|---|---|---|
| `SOPORTE_PG_CONTAINER` | `soporte-postgres-master` | Nombre del contenedor Docker a inspeccionar. Vacía o solo espacios se trata igual que ausente: se usa el default. |

No hace falta ponerla en `.env`: es un override puntual, no parte del contrato de
`backend/src/config/validar-entorno.ts`. Se usa en dos casos.

- **Tu contenedor local se llama distinto.** `SOPORTE_PG_CONTAINER=mi-pg pnpm entorno:verificar`.
- **CI.** En GitHub Actions el Postgres corre como *service container* con un nombre
  que genera el runner, no el fijo de desarrollo. `.github/workflows/gates.yml` lo
  descubre por imagen y exporta la variable antes de correr la suite; sin eso,
  `regenerar-entorno.integration.spec.ts` ve el contenedor como ausente y falla
  aunque Postgres esté corriendo.

Si `soporte_master_test` o `soporte_tenant_test` quedaron en un estado inconsistente
(migración a medias, datos corruptos de una corrida anterior), **`pnpm entorno:regenerar
--recrear-test --confirmar`** las dropea y recrea vacías — es la única operación
destructiva del comando y solo toca esas dos bases, nunca `soporte_master` ni un
tenant real, y nunca fuera de `localhost`. Después de recrearlas hace falta correr
`pnpm entorno:regenerar --confirmar` de nuevo para migrarlas y sembrarlas.

Los e2e tienen además un guardarraíl deliberado — `expect(MASTER_URL).toMatch(/_test$/)` —
que los hace fallar si `DATABASE_URL_MASTER` no apunta a una base `*_test`. Es una
segunda capa, independiente del comando de arriba, que impide que la suite arrase
tu base de desarrollo. Si ves ese test en rojo, no está roto: te está avisando que
falta el paso 4.

Las bases `soporte_prov_*_test` las provisiona y descarta cada spec: **no hay que
crearlas**, y `entorno:regenerar` no las toca.

#### Apéndice: preparar el entorno a mano (si el comando falla)

Fallback y referencia de qué hace `entorno:regenerar --confirmar` por dentro —
no es un segundo camino a elegir, es lo que corrés a mano si el comando de
arriba no puede correr (por ejemplo, `node`/`pnpm` fuera de esta máquina, o un
bug en el script).

```powershell
# Las dos bases de test (una sola vez)
docker exec soporte-postgres-master psql -U soporte -d postgres -c "CREATE DATABASE soporte_master_test OWNER soporte;"
docker exec soporte-postgres-master psql -U soporte -d postgres -c "CREATE DATABASE soporte_tenant_test OWNER soporte;"

# Migrarlas
cd backend
$env:DATABASE_URL_MASTER="postgresql://soporte:soporte@localhost:5432/soporte_master_test"; pnpm migrate:master
$env:DATABASE_URL_TENANT="postgresql://soporte:soporte@localhost:5432/soporte_tenant_test"; pnpm migrate:tenant

# Sembrar (mismo orden que el comando: root -> demo -> ayuda)
pnpm run seed:root
pnpm run seed:demo
node scripts/sync-ayuda.js
```

### Backend: correr la suite

```powershell
cd backend

# Solo unitarios — no necesita base, es lo que conviene en el loop de desarrollo
pnpm vitest run --exclude '**/node_modules/**' --exclude '**/*.integration.spec.ts' --exclude '**/*.e2e.spec.ts'

# Suite COMPLETA (integración + e2e) — con las dos variables, siempre
$env:DATABASE_URL_MASTER="postgresql://soporte:soporte@localhost:5432/soporte_master_test"
$env:DATABASE_URL_TENANT="postgresql://soporte:soporte@localhost:5432/soporte_tenant_test"
pnpm test
```

**Dos cosas que confunden al leer la salida y no son fallas:**

- Un `249 skipped` (o cualquier número alto de saltados) **no** significa que haya
  tests deshabilitados: varios specs de aislamiento se saltan solos cuando falta
  `DATABASE_URL_TENANT`. Es señal de entorno incompleto.
- `crear-cliente.e2e.spec.ts` imprime un error de Nest que parece grave y es a
  propósito: `[e2e-forced-failure] membresiaRepo.create() falló a propósito (T8.5)`.

> Si los `*.integration.spec.ts` fallan en masa con `PrismaClientKnownRequestError`,
> primero revisá el entorno: `pnpm prisma migrate status --schema prisma_master/schema.prisma`.
> Un `P1001` es la base caída y un `P1000` es la contraseña, no el código.

### Smoke e2e (Playwright, `frontend/e2e/caminos-criticos.spec.ts`)

A diferencia de `pnpm test` (Vitest + MSW, no necesita nada externo),
`pnpm test:e2e` corre contra un **backend real** y requiere el **tenant demo
ya sembrado**:

```powershell
# 1) Backend levantado, apuntando a una DB real migrada (nunca *_test)
cd backend
pnpm run migrate:master
pnpm run migrate:tenant
pnpm run seed:root
pnpm run seed:demo
pnpm run start:dev        # deja corriendo en :3000

# 2) Frontend — Playwright levanta `pnpm run dev` automáticamente
#    (`webServer` en playwright.config.ts) si no hay uno corriendo en :3001
cd frontend
pnpm run test:e2e
```

Cubre: login (ADMINISTRADOR) → lista de tickets + dashboard; crear ticket →
aparece en la lista; comentar; transicionar como TECNICO; gating de USUARIO
(sin Dashboard en el nav, sin control de transicionar). Usa las credenciales
del seed demo (ver "Datos demo" arriba) — overrideables por env
(`DEMO_ADMIN_EMAIL`/`DEMO_TECNICO_EMAIL`/`DEMO_USUARIO_EMAIL`/`DEMO_SEED_PASSWORD`)
si se corrió el seed con identificadores custom.

## Estado de este scaffold

- [x] Estructura hexagonal de módulos backend (vacíos, compilables).
- [x] Estructura App Router frontend + shadcn/ui + Tailwind 4 + tema día/noche.
- [x] `prisma_master/schema.prisma` y `prisma_tenant/schema.prisma`.
- [ ] Lógica de negocio (use cases, controllers, guards de auth/tenant reales).
- [ ] Migraciones aplicadas contra una base de datos real.
