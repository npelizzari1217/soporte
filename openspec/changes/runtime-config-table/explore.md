# Explore — runtime-config-table

> Mover config operativa (arrancando por SMTP) de env a una tabla en DB, editable por usuarios con permisos. Alcance por-tenant con fallback a global. Secretos cifrados+enmascarados+auditados+RBAC. Fail-fast se corre de boot-time a send-time.

## 1. Topología master vs tenant DB
- `shared/infrastructure/persistence/prisma.service.ts:22-114` — `PrismaService`: `masterClient` singleton + `Map<dbName, TenantPrismaClient>` lazy. `buildTenantUrl()` (76-83) reemplaza el pathname de la URL master por el nombre de DB del tenant. Mismo patrón en `tenant-migration-runner.adapter.ts:84-88` y `scripts/migrate-tenants.runner.ts:127-131`.
- `shared/shared.module.ts:56-59` — `PrismaService` via `useFactory` con `process.env.DATABASE_URL_MASTER`.
- Dos schemas separados: `prisma_master/schema.prisma` (Cliente, Usuario, RBAC…) y `prisma_tenant/schema.prisma` (Ticket, Estado…). **RBAC vive 100% en master.**
- Fan-out de migraciones: `scripts/migrate-tenants.runner.ts:57-132` — `SELECT db_name FROM clientes WHERE activo AND deleted_at IS NULL`, loop `prisma migrate deploy` por tenant, non-aborting, `pool.end()` en finally. Manual/CI, NO en boot. Provisioning de tenant nuevo: `clientes/infrastructure/tenant-migration-runner.adapter.ts:43-89`.
- **Implicación:** tabla config tenant-scoped ⇒ correr `MigrateTenantsRunner` sobre TODAS las DBs activas (dependencia dura).

## 2. Cifrado de secretos — GREENFIELD
- No hay ningún util de cifrado reversible (`crypto/createCipheriv/bcrypt/argon2` → nada). Único precedente: `auth/infrastructure/argon2-hash.provider.ts` (`IHashProvider`) — pero es hashing ONE-WAY, inútil para `SMTP_PASS` que necesita recuperarse en claro para nodemailer.
- Sin KMS/vault. Es infra nueva: espejar el patrón port/adapter (`IHashProvider`→`Argon2HashProvider`) como `ISecretCipher`/`ICryptoProvider` en infra. Clave de cifrado desde env (precedente `JWT_SECRET`/`DATABASE_URL_MASTER` = secretos bootstrap que se quedan en env).

## 3. RBAC / permisos
- `auth/domain/entities/permiso.entity.ts:59-65` — código `"recurso:accion"`. Nuevo permiso `configuracion:gestionar` encaja directo.
- `auth/infrastructure/guards/permissions.guard.ts:8,25-51` — el guard NO consulta DB; evalúa `user.permisos` (array del JWT).
- `auth/application/use-cases/login.use-case.ts:105-116` — permisos se calculan al LOGIN y se hornean en el JWT. **Otorgar/revocar `configuracion:gestionar` NO es instantáneo — recién en el próximo login/refresh.** (flag para proposal)
- Seeding idempotente: `rbac-seed.integration.spec.ts:57-82` — `INSERT INTO permisos ... ON CONFLICT (codigo) DO NOTHING` + asignación a rol ADMIN. Nuevo permiso sigue este patrón (migración en `prisma_master`).

## 4. Patrón cross-DB tenant→global (precedente)
- `usuario-master.checker.ts:22-32` y `solicitante-email.resolver.ts:21-94` — evitan `TenantContext`, van directo a `getMasterClient()` filtrando por `clienteId` en el WHERE. Razón: el listener async corre fuera del ciclo request/response.
- `solicitante-email.resolver.ts:50-62` — nunca lanza; envuelve fallos de infra en `Result.fail` tipado sin filtrar detalles crudos.
- **El ConfigResolver va un paso más allá:** leer PRIMERO el tenant (`getTenantClient(dbName)`, dbName resuelto desde `master.clientes` por clienteId) y si no hay fila, caer a `getMasterClient()`. No hay precedente que combine ambos clientes — se construye desde cero siguiendo el estilo (Result tipado, sin TenantContext, scoping explícito).

## 5. Punto de swap: email-config.ts y el fail-fast
- `tickets/infrastructure/email/email-config.ts:1-75` — `loadEmailConfig()` lee `process.env.SMTP_*`, lanza `SmtpConfigError`. Se invoca al CONSTRUIR el adapter, nunca en `send()`.
- `tickets/tickets.module.ts:495-509` — `EMAIL_SENDER` via `useFactory: () => NodemailerEmailSender.fromEnv()`, construido UNA VEZ al bootstrap.
- `nodemailer-email-sender.adapter.ts:128-148` — `fromEnv()` arma el transporter una sola vez (`private readonly transporter`).
- `i-email-sender.port.ts:31-53` — `EmailMessage` = `{ to, subject, body }`, **sin clienteId/tenant**. `send()` ya retorna `Promise<Result<void, EmailError>>`.
- **Consecuencia del fail-fast a send-time:** el adapter YA NO puede construirse una sola vez. Debe resolver config POR ENVÍO (tenant→global). Dos caminos:
  - (a) agregar `clienteId` a `EmailMessage` y resolver config + armar transporter dentro de `send()`;
  - (b) resolver config en el caller (`NotificarCambioEstadoHandler`) vía un `EmailConfigResolver` (espejo de `ISolicitanteEmailResolver`) y pasar la config resuelta.
  `SmtpConfigError` como excepción de bootstrap deja de tener sentido — `email-config.ts` se reemplaza, no se edita.
- Masking ya existe: `nodemailer-email-sender.adapter.ts:120-126` (`sanitizeCausa`/`maskEmailsInText`) — extender para que `SMTP_PASS` jamás se interpole en un error.

## 6. Audit log — GREENFIELD (no hay nada reusable)
- Grep `audit|auditoria|AuditLog` → nada. Solo `Logger.log(...)` en `tenant.guard.ts:88-91` (log de proceso, no auditoría persistida).
- `skills/audit-log/SKILL.md` define el patrón target (AuditEntry, AuditLogPort, wiring por evento de dominio, inmutable, masking) pero NADA está implementado. Es el mayor bloque de infra nueva.
- Scope dual: cambio de config tenant se audita en la DB del tenant, global en master.

## 7. Forma de tabla — para el proposal
- **Opción A** key-value genérica (`ConfiguracionRuntime`: clave, valor, tipo, categoria, esSecreto, columnas de cifrado, actualizadoPor soft-ref UUID, actualizadoEn).
- **Opción B** tabla tipada (`ConfiguracionSmtp`: host/port/user/passCifrado/iv/authTag/secure/from).
- Tradeoff: A = extensible a nivel C sin migración nueva, cifrado uniforme, type-safety baja (accesor tipado en app lo compensa). B = type-safety fuerte, pero duplica tabla en master+tenant por cada categoría futura.
- **Inclinación del explore:** Opción A + accesor tipado en application (`ConfigResolver.getSmtp(): Result<SmtpConfig>`), porque el fork #1 ya obliga a la misma tabla en ambos schemas.

## 8. Riesgos
- Fan-out de migraciones sobre todas las tenant DBs (dependencia dura para que el feature funcione).
- Clave de cifrado mal configurada/rotada ⇒ todas las lecturas de secreto fallan en send-time ⇒ necesita outcome tipado propio (`CONFIG_CIFRADO_INVALIDO`).
- Hot-reload GRATIS al resolver en send-time (beneficio explícito).
- Exposición de secretos: ningún camino (logs, Result.fail, audit) interpola el secreto en claro.
- RBAC stale: permisos en JWT no reflejan cambios hasta el próximo login.
- Cifrado y audit son greenfield: trabajo real, no wiring.

## Preguntas abiertas para el proposal
1. ¿Clave de cifrado: env var vs KMS? ¿Rotación?
2. ¿Tabla key-value genérica vs tipada?
3. ¿`EmailMessage` gana `clienteId`, o la config se resuelve en el handler antes de `send()`?
4. ¿Audit log como infra reusable (siguiendo la skill) o angosto solo-config?
5. ¿Toggle notif por-tenant y `esEstadoNotificable` (hoy hardcodeado) entran en ESTE change o son fast-follow?
