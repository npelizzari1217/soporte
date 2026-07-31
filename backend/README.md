# Soporte — Backend

Backend NestJS (TypeScript) del sistema de gestión de tickets, compras y
reparaciones edilicias. Arquitectura Clean/Screaming, aislamiento
database-per-tenant (Prisma master + Prisma tenant).

## Setup local

```bash
corepack pnpm install
cp .env.example .env   # completar DATABASE_URL_MASTER y ROOT_ADMIN_*
corepack pnpm run generate:master
corepack pnpm run generate:tenant
```

## Runbook de deploy — DB master

Orden obligatorio tras cada deploy (o al provisionar un entorno nuevo):

```bash
corepack pnpm run migrate:master   # aplica migraciones pendientes de la DB master
corepack pnpm run seed:root        # bootstrap idempotente del primer usuario root
```

`seed:root` garantiza que exista al menos un usuario con `isGlobalAdmin=true`
("root"), leyendo las credenciales de las variables `ROOT_ADMIN_*` (ver
`.env.example`). Es **idempotente**: correrlo varias veces (redeploys) no
duplica la fila ni pisa la contraseña ya establecida — solo garantiza que el
flag `isGlobalAdmin` quede en `true` (y reactiva la cuenta si estaba
suspendida o soft-deleted). Si falta cualquiera de las 5 variables
`ROOT_ADMIN_*`, el script falla ruidosamente (nunca hardcodea credenciales ni
hace no-op silencioso).

> **Rotar `ROOT_ADMIN_PASSWORD` NO rota el password de un root ya existente.**
> Si la fila ya existe, `seed:root` solo actualiza `isGlobalAdmin`/`activo`/
> `deletedAt` — nunca toca `passwordHash`, sin importar qué valor tenga
> `ROOT_ADMIN_PASSWORD` en ese momento. Para cambiar el password de un root
> existente usá el flujo normal de cambio de password de la aplicación, no
> este seed.

Variables requeridas por `seed:root`:

| Variable | Descripción |
|---|---|
| `ROOT_ADMIN_EMAIL` | Email de login del root de bootstrap |
| `ROOT_ADMIN_PASSWORD` | Password en texto plano (se hashea argon2id antes de persistir) |
| `ROOT_ADMIN_NOMBRE` | Nombre |
| `ROOT_ADMIN_APELLIDO` | Apellido |
| `ROOT_ADMIN_CLIENTE_ID` | UUID del cliente (tenant) de origen — `usuarios.cliente_id` es NOT NULL |

## Otros seeds

- `seed:tenant` — catálogos operativos base (estados, prioridades, tipos de
  ticket, etc.) para una DB tenant nueva (`DATABASE_URL_TENANT`).

## Testing

```bash
corepack pnpm test          # vitest run — incluye integration specs contra Postgres real
corepack pnpm run lint
corepack pnpm exec tsc --noEmit -p tsconfig.json
```
