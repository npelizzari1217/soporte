# Tasks: Config operativa en runtime — tabla en DB (primer corte SMTP, nivel B)

> Test-First estricto (RED→GREEN). Cada RED apunta a UN Scenario de `spec/runtime-config-table.spec.md`. Firmas exactas de `design.md` §5. Forks F1-F4 ya resueltos (AUTORITATIVO, 2026-07-30): F1=boot fail-fast de `CONFIG_ENCRYPTION_KEY`; F2=global solo `isGlobalAdmin` (claim JWT `is_global_admin`, precedente `reportes/infrastructure/guards/admin-or-global.guard.ts`); F3=`clave` bare; F4=UUID permiso `...020` confirmado próximo libre (último seed real es `...019` en `20260629100000_seed_rbac_4_roles`).

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~2100-2600 (código + tests, ~34 archivos nuevos + 6 modificados/eliminados) |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 → PR 2 → PR 3 → PR 4 → PR 5 → PR 6 |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: pending
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Migraciones (master+tenant, partial unique index, seed RBAC idempotente) + `ISecretCipher`/`AesGcmSecretCipher` + boot fail-fast de la clave (F1) | PR 1 | Base para todo lo demás. ~310 líneas. |
| 2 | `SmtpConfig` VO (shared) + errores de resolución + `IConfigResolver`/`PrismaConfigResolver` (merge por campo, cross-DB) | PR 2 | Depende de PR 1 (cipher). ~365 líneas. |
| 3 | Audit inmutable: `AuditEntry`, evento `ConfiguracionCambiada`, `AuditLogPort`/`PrismaAuditLog`, handler+listener async | PR 3 | Depende de PR 1 (esquema DB). ~350 líneas. |
| 4 | CRUD: repos config, `LeerConfigUseCase`/`ActualizarConfigUseCase` (cifra, audita, valida scope F2), `ConfiguracionModule` | PR 4 | Depende de PR 2 (cipher/resolver) y PR 3 (evento audit). ~460 líneas. |
| 5 | API: `ConfiguracionController` + DTOs + RBAC (`configuracion:gestionar`) + wiring en `app.module.ts` | PR 5 | Depende de PR 4. ~260 líneas. |
| 6 | Swap `tickets/`: contrato `send(email,config)`, adapter por-envío, elimina `email-config.ts`, handler resuelve config, wiring + anti-regresión + verify final | PR 6 | Depende de PR 2 (resolver) y PR 1 (cipher). Mayor riesgo de regresión sobre `notif-email-estado-ticket`. ~350-450 líneas. |

Cada PR: verificación propia (`pnpm test`/`lint`/`tsc --noEmit` en `backend/`), inicio/fin claros, rollback sin tocar unidades previas (`work-unit-commits`, `chained-pr`).

---

## PR 1 — Fundaciones: migraciones + cifrado + boot fail-fast (F1)

- [x] 1.1 Migración master `prisma_master/migrations/<ts>_add_configuracion_runtime_audit/migration.sql`: `CREATE TABLE IF NOT EXISTS configuracion_runtime` + `audit_entries` + `CREATE UNIQUE INDEX IF NOT EXISTS ... WHERE deleted_at IS NULL` (Dz9, idempotente §9 CLAUDE.md)
- [x] 1.2 Migración tenant espejo `prisma_tenant/migrations/<ts>_add_configuracion_runtime_audit/migration.sql` (mismo shape, para fan-out vía `MigrateTenantsRunner`)
- [x] 1.3 Migración seed `prisma_master/migrations/<ts>_seed_rbac_configuracion_gestionar/migration.sql`: permiso `configuracion:gestionar` UUID `b0000000-0000-4000-b000-000000000020` + asignación rol admin, `ON CONFLICT DO NOTHING` (F4, R4 seed idempotente) — **DESVIACIÓN**: asignado a `ADMINISTRADOR`, no a `ADMIN` (ver STATE.md)
- [x] 1.4 Actualizar `prisma_master/schema.prisma` y `prisma_tenant/schema.prisma` con modelos `ConfiguracionRuntime`/`AuditEntry` (design §4)
- [x] 1.5 RED: integración — re-correr la migración seed 2 veces no duplica permiso ni asignación (R4 escenario "seed idempotente")
- [x] 1.6 RED: `AesGcmSecretCipher.encrypt()`→`decrypt()` round-trip con `CONFIG_ENCRYPTION_KEY` válida devuelve el plaintext original (R2 escenario 1)
- [x] 1.7 RED: `decrypt()` con `authTag` alterado ⇒ `Result.fail(CifradoError code=CONFIG_CIFRADO_INVALIDO)`, sin throw (R2 escenario 2)
- [x] 1.8 GREEN: crear `shared/domain/ports/i-secret-cipher.ts` (`ISecretCipher`, `CipherPayload`, `SECRET_CIPHER`) + `shared/domain/errors/cifrado.errors.ts` (`CifradoError`) + `shared/infrastructure/crypto/aes-gcm-secret-cipher.adapter.ts`
- [x] 1.9 RED: bootstrap del provider/factory de `ISecretCipher` SIN `CONFIG_ENCRYPTION_KEY` (o longitud inválida) ⇒ throw al arrancar (F1, corrige Dz3 — tier bootstrap-secret como `JWT_SECRET`)
- [x] 1.10 GREEN: chequeo de presencia+forma de `CONFIG_ENCRYPTION_KEY` en el provider factory (o `shared.module.ts`) — boot-time; `decrypt()` en sí sigue nunca-throw en send-time (R2 escenario "clave ausente en send-time" sigue vigente para filas de datos, no para la clave)
- [x] 1.11 Agregar `CONFIG_ENCRYPTION_KEY` dummy válida (`openssl rand -base64 32`) a `backend/test/setup-env.ts` para que la suite completa bootstrapee (mismo patrón que el `SMTP_*` dummy actual)
- [x] 1.12 Verify: pegar salida real `pnpm test`/`pnpm lint`/`tsc --noEmit`

## PR 2 — Resolver cross-DB + `SmtpConfig` VO (R1, R9)

- [x] 2.1 RED: `SmtpConfig.create()` — completa ⇒ `Result.ok`; falta campo o `port` no numérico ⇒ `Result.fail(ConfigIncompletaError)` (Dz5)
- [x] 2.2 GREEN: crear `shared/domain/value-objects/smtp-config.vo.ts` (+ `toSafeLog()` enmascara `pass`)
- [x] 2.3 Crear `configuracion/domain/errors/config.errors.ts` (`ConfigIncompletaError`, `NoConfigError`, `ResolveConfigError`) — **DESVIACIÓN**: `ConfigIncompletaError` vive físicamente en `shared/domain/errors/config-incompleta.error.ts`, re-exportada acá (ver STATE.md)
- [x] 2.4 Crear `configuracion/domain/ports/i-config-resolver.ts` (`IConfigResolver`, `CONFIG_RESOLVER`, `resolveSmtp`)
- [x] 2.5 RED: tenant con `smtp.*` completa + global distinta ⇒ resultado usa valores del TENANT (R1 escenario 1)
- [x] 2.6 RED: tenant sin fila, global completa ⇒ resultado usa valores GLOBALES (R1 escenario 2)
- [x] 2.7 RED: ni tenant ni global ⇒ `Result.fail(NoConfigError)`, sin throw (R1 escenario 3)
- [x] 2.8 RED: merge por campo — tenant `{host}` + global `{port,user,pass,from}` ⇒ `ok`; tenant `{host}` + global `{host,port}` sin `user` ⇒ `Result.fail(ConfigIncompletaError)` (R1 escenario 4, Dz4)
- [x] 2.9 RED: resuelve `dbName` de A desde `master.clientes` por `clienteId` y consulta SOLO esa DB — nunca mezcla con B (R1 escenario 5, R9 aislamiento)
- [x] 2.10 RED: `pass` (esSecreto) se descifra vía `ISecretCipher.decrypt()`; falla ⇒ `Result.fail(CifradoError)` propagado (R2 "clave ausente/inválida en send-time")
- [x] 2.11 GREEN: crear `configuracion/infrastructure/persistence/prisma/config-resolver.adapter.ts` (`PrismaConfigResolver`) — mockea `getTenantClient`/`getMasterClient`/`ISecretCipher`
- [x] 2.12 Verify: pegar salida real tests/lint/tsc

## PR 3 — Audit inmutable (R5)

- [ ] 3.1 Crear `configuracion/domain/mask-secret.ts` (`maskIfSecret`, `SECRET_MASK`) (design §5.1)
- [ ] 3.2 RED: `AuditEntry.create()` — entidad plana, `id`+`createdAt`, SIN `updatedAt`/`deletedAt` (Dz8, §9 NFR spec)
- [ ] 3.3 GREEN: crear `configuracion/domain/entities/audit-entry.entity.ts`
- [ ] 3.4 Crear `configuracion/domain/events/configuracion-cambiada.event.ts` (`ConfiguracionCambiada`, `ConfigScope`, `CONFIGURACION_CAMBIADA`)
- [ ] 3.5 Crear `configuracion/domain/ports/i-audit-log.port.ts` (`AuditLogPort`, `AUDIT_LOG`, `AuditError`)
- [ ] 3.6 RED: `AuditConfiguracionHandler` persiste `AuditEntry` vía `AuditLogPort.record()` a partir del evento
- [ ] 3.7 RED: `AuditLogPort.record()` falla ⇒ se loguea ERROR, NO propaga ni revierte (R5 escenario "fallo de audit")
- [ ] 3.8 GREEN: crear `configuracion/application/event-handlers/audit-configuracion.handler.ts`
- [ ] 3.9 RED: `AuditConfiguracionListener` (`@OnEvent(CONFIGURACION_CAMBIADA)`) delega, try/catch de última red (patrón `notificar-cambio-estado.listener.ts`)
- [ ] 3.10 GREEN: crear `configuracion/infrastructure/events/audit-configuracion.listener.ts`
- [ ] 3.11 RED: `PrismaAuditLog.record()` — `scope.kind==='tenant'` ⇒ `getTenantClient(dbName).auditEntry.create`; `'global'` ⇒ `getMasterClient().auditEntry.create` (R5 escenario "scope dual")
- [ ] 3.12 GREEN: crear `configuracion/infrastructure/persistence/prisma/audit-log.adapter.ts`
- [ ] 3.13 Verify: pegar salida real tests/lint/tsc

## PR 4 — CRUD config: use cases + repos + scope global (F2) (R3, R5, R8)

- [ ] 4.1 Crear `configuracion/domain/ports/i-configuracion-repository.ts` — `findAll(scope, categoria?)`, `findByClave(scope, categoria, clave)`, `upsert(scope, row)` (repository-pattern)
- [ ] 4.2 RED: `LeerConfigUseCase` — fila `esSecreto` ⇒ `'********'`; no-secreta ⇒ valor real (R3 escenarios 1-2)
- [ ] 4.3 RED: `LeerConfigUseCase` NUNCA descifra para leer (spy `ISecretCipher.decrypt` no invocado)
- [ ] 4.4 GREEN: crear `configuracion/application/use-cases/leer-config.use-case.ts`
- [ ] 4.5 RED: `ActualizarConfigUseCase` update no-secreto ⇒ evento con `valorAnterior`/`valorNuevo` reales, `esSecreto:false` (R5 escenario 1)
- [ ] 4.6 RED: update secreto ⇒ cifra vía `ISecretCipher.encrypt()`, evento con valores ENMASCARADOS, cleartext ausente (R5 escenario 2, Dz7)
- [ ] 4.7 RED: `categoria !== 'smtp'` ⇒ rechazado (R8, whitelist nivel B)
- [ ] 4.8 RED: `scope==='global'` y `actorId` sin `is_global_admin` ⇒ rechazado ANTES de persistir; `scope==='tenant'` con permiso ⇒ permitido (F2 — claim JWT `is_global_admin`, precedente `AdminOrGlobalGuard`)
- [ ] 4.9 GREEN: crear `configuracion/application/use-cases/actualizar-config.use-case.ts`
- [ ] 4.10 GREEN: crear `configuracion/infrastructure/persistence/prisma/configuracion-repository.adapter.ts` (tenant vía `getTenantClient`, global vía `getMasterClient`, `findFirst` NUNCA `findUnique` — Dz9)
- [ ] 4.11 RED: integración — insertar 2 filas activas misma `(categoria,clave)` ⇒ falla por el partial unique index (riesgo §15 design)
- [ ] 4.12 Crear `configuracion/configuracion.module.ts` — exporta `CONFIG_RESOLVER`+`SECRET_CIPHER`, NO `@Global()` (Dz12)
- [ ] 4.13 Verify: pegar salida real tests/lint/tsc

## PR 5 — API de gestión (R3, R4)

- [ ] 5.1 Crear DTOs `configuracion/interface/dtos/{actualizar-config-http,config-response}.dto.ts`
- [ ] 5.2 RED: `PermissionsGuard` con JWT con `configuracion:gestionar` ⇒ autoriza `GET`/`PUT`; sin el permiso ⇒ `403` antes del caso de uso (R4 escenarios 1-2)
- [ ] 5.3 RED: JWT emitido ANTES de otorgar el permiso ⇒ sigue `403` aunque ya exista en DB (R4 escenario D9 stale)
- [ ] 5.4 GREEN: crear `configuracion/interface/controllers/configuracion.controller.ts` — `@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard, TenantGuard)`, `@RequirePermissions('configuracion:gestionar')` en `GET`/`PUT`
- [ ] 5.5 RED: `PUT scope=global` por ADMIN-de-tenant (sin `is_global_admin`) ⇒ rechazado (F2, integración controller→use case)
- [ ] 5.6 Wire `ConfiguracionController` + `ConfiguracionModule` en `app.module.ts`
- [ ] 5.7 Verify: pegar salida real tests/lint/tsc

## PR 6 — Swap email + fail-fast a send-time + anti-regresión (R6, R7, R8)

- [ ] 6.1 RED: `EmailSenderPort.send(email, config)` — nueva firma con `SmtpConfig` explícito (R7 escenario 1)
- [ ] 6.2 GREEN: editar `tickets/domain/ports/i-email-sender.port.ts`
- [ ] 6.3 RED: `NodemailerEmailSender.send()` arma transporter por-envío desde `config` (no `process.env`, no `fromEnv()`) — spy `transportFactory` (R7 escenario 1)
- [ ] 6.4 RED: 2 envíos consecutivos mismo tenant/config ⇒ 2 llamadas a `transportFactory` (R9 "sin cache", deuda aceptada)
- [ ] 6.5 GREEN: refactor `tickets/infrastructure/email/nodemailer-email-sender.adapter.ts` — sin `(transporter, from)` ni `fromEnv()`; `sanitizeCausa(causa, pass)` redacta `config.pass` (R2 "secreto nunca fuera de memoria")
- [ ] 6.6 Eliminar `tickets/infrastructure/email/email-config.ts` + `email-config.spec.ts` (`EmailConfig`/`SmtpConfigError` — R6)
- [ ] 6.7 RED: auditoría de imports de `nodemailer-email-sender.adapter.ts` — sin `ISecretCipher`/`PrismaService`/`getMasterClient`/`getTenantClient` (R7 escenario 2)
- [ ] 6.8 RED: `NotificarCambioEstadoHandler` — `configResolver` falla ⇒ outcome `no-config`, `send` NO llamado, sin throw (R6 escenario 2)
- [ ] 6.9 RED: camino feliz con config resuelta ⇒ `send(email, config)` recibe la `SmtpConfig` correcta
- [ ] 6.10 GREEN: editar `tickets/application/event-handlers/notificar-cambio-estado.handler.ts` — inyecta `IConfigResolver`, paso `b` (resolución) antes del resolver de email, nuevo outcome `no-config`
- [ ] 6.11 GREEN: editar `notificar-cambio-estado.listener.ts` — `case 'no-config'` ⇒ `logger.warn(codigo, ticketId)`, NUNCA el secreto
- [ ] 6.12 RED: bootstrap de `TicketsModule`/`ConfiguracionModule` SIN ninguna fila `ConfiguracionRuntime` categoría `smtp` ⇒ arranca sin throw (R6 escenario 1)
- [ ] 6.13 GREEN: wire `tickets.module.ts` — `EMAIL_SENDER: useClass NodemailerEmailSender` (Dz11), `imports += [ConfiguracionModule]`, inject `CONFIG_RESOLVER` en `NotificarCambioEstadoHandler`
- [ ] 6.14 RED: hot-reload — 2° envío usa la config ACTUALIZADA sin reinicio del proceso (R6 escenario 3)
- [ ] 6.15 Eliminar dummy `SMTP_*` de `backend/test/setup-env.ts` (ya no se lee env); confirmar que ninguna spec de wiring dependía de esos valores
- [ ] 6.16 Anti-regresión: re-correr suite completa de `notif-email-estado-ticket` (handler/listener/use-cases de tickets) — 100% verde tras el swap
- [ ] 6.17 Verify final: pegar salida real `pnpm test`/`pnpm lint`/`tsc --noEmit` completos (backend) + verificar conteo de tenants migrados vs `clientes` activos (fan-out §11 design)

---

## Definition of Done (CLAUDE.md §9 — recordatorio por PR)

- Pegar salida REAL de `pnpm test`, `pnpm lint`, `tsc --noEmit` en `backend/` antes de marcar cualquier PR como "done". Prohibido "tests pass" sin evidencia.
- Prohibido `as any` / `as unknown as`.
- Migraciones idempotentes (`IF NOT EXISTS`, `ON CONFLICT DO NOTHING`), corribles en todas las tenant DBs vía `MigrateTenantsRunner`.
- Conventional commits, SIN Co-Authored-By.
- Reporte honesto: si algo falla o se difiere, decirlo explícitamente.

## Trazabilidad (requirement → task)

R1→2.1-2.11 · R2→1.6-1.11,2.10,6.5 · R3→4.2-4.4,5.4 · R4→1.3,1.5,5.2-5.3 · R5→3.2-3.12,4.5-4.6 · R6→1.9-1.11,6.8-6.14 · R7→6.1-6.7 · R8→4.7,4.10 · R9(NFR)→2.9,3.11,6.4 · F1→1.9-1.10 · F2→4.8,5.5 · F3→4.10 (clave bare) · F4→1.3
