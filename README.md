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

## Variables de entorno

### Backend (`backend/.env`, ver `backend/.env.example`)

| Variable | Descripción |
|---|---|
| `DATABASE_URL_MASTER` | Conexión Postgres a la DB master (clientes/usuarios/membresías/RBAC/ciclos). Las URLs de cada tenant se derivan de esta en runtime. |
| `DATABASE_URL_TENANT` | Conexión a UNA DB tenant (dev/test) — usada solo por `prisma.tenant.config.ts` para correr migraciones del schema tenant. |
| `JWT_SECRET` | Secreto de firma de los JWT (access + refresh). |
| `JWT_ACCESS_EXPIRES_IN` / `JWT_REFRESH_EXPIRES_IN` | TTL de los tokens. |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASSWORD` / `SMTP_FROM` / `SMTP_SECURE` | Envío de notificaciones por email (módulo `notificaciones/`, PR-N). Si `SMTP_HOST`/`SMTP_USER`/`SMTP_PASSWORD` faltan o están incompletas, el binding degrada a un adapter no-op que solo loguea (enmascarado) — **nunca** falla el arranque de la app. `SMTP_SECURE="true"` usa SMTPS directo (típico puerto 465); default `false` (STARTTLS, puerto 587). |
| `ROOT_ADMIN_EMAIL` / `ROOT_ADMIN_PASSWORD` / `ROOT_ADMIN_NOMBRE` / `ROOT_ADMIN_APELLIDO` | Bootstrap idempotente del primer usuario **ROOT** (`is_global_admin = true`). |
| `SLA_SWEEP_CRON` | Expresión cron del barrido periódico de vencimiento de SLA (`SlaSweepScheduler`, módulo `sla/`). Default: cada 5 min (`CronExpression.EVERY_5_MINUTES`) si no está seteada. |
| `APP_BASE_URL` | URL base pública de la app, usada para armar links en emails de notificación (ej. `${APP_BASE_URL}/tickets/:id`). Usada por las plantillas de email del módulo `notificaciones/` (PR-N). |
| `PORT` / `NODE_ENV` | Configuración de la app. |

### Dependencias nuevas (módulo SLA, Fase 4)

- **`@nestjs/schedule`** — habilita `@Cron` para `SlaSweepScheduler` (barrido periódico
  multi-tenant de vencimiento de SLA). Registrado vía `ScheduleModule.forRoot()` en
  `sla/sla.module.ts`.

### Notificaciones por email (módulo `notificaciones/`, Fase 4 PR-N)

Escucha eventos de dominio ya emitidos (`ticket.estado_cambiado`, `ticket.comentado` público,
`sla.vencido`) y envía email al destinatario correspondiente (solicitante; o asignado +
administradores del tenant en el caso de `sla.vencido`). Sin preferencias de usuario en beta
(notificación fija por defecto). Plantillas en TS puro (sin Handlebars).

- **Degradación sin config SMTP (crítico para beta local)**: si `SMTP_HOST`/`SMTP_USER`/
  `SMTP_PASSWORD` no están completos, `EMAIL_SENDER` resuelve a `NoOpEmailSender` — loguea
  (enmascarado, nunca el email en claro ni el cuerpo del mensaje) el envío que se habría hecho,
  en vez de fallar el arranque de la app.
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
# Backend
cd backend
pnpm test

# Frontend
cd frontend
pnpm test        # unit/component (Vitest + Testing Library + MSW, sin backend real)
pnpm test:e2e     # Playwright — ver prerequisitos abajo
```

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
