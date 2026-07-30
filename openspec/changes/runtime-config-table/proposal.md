# Proposal: Config operativa en runtime (tabla en DB, primer corte SMTP)

> Artefacto de `sdd-propose`. Store activo: **openspec** (se persiste en disco para continuidad y también en engram).
> Change: `runtime-config-table` · Proyecto: **soporte** (backend NestJS multi-tenant, Clean/Screaming Architecture, Prisma/PostgreSQL).
> Insumo: `explore.md` (mapa completo con archivo:línea) + decisiones de producto ya cerradas por el usuario + resoluciones del orquestador a las 5 preguntas abiertas.

---

## 1. Intent / Por qué

Hoy la config SMTP vive en `process.env.SMTP_*` y se valida al **bootstrap** (`email-config.ts:1-75` lanza `SmtpConfigError` al construir el adapter). Eso tiene tres problemas: (1) **no es editable sin redeploy** —cambiar un host o una password exige tocar env y reiniciar—, (2) **es global**: no hay forma de que cada tenant tenga su propio SMTP (branding/white-label), y (3) **es frágil en el arranque**: una config incompleta tira todo el proceso abajo aunque el 99% de la app no dependa del email.

Queremos mover la config operativa —**arrancando por SMTP**— a una **tabla en DB editable por usuarios con permiso**, resuelta **por-tenant con fallback a global**, con secretos **cifrados at-rest**, **enmascarados** en pantalla, **auditados** y protegidos por **RBAC**. El fail-fast se corre de **boot-time a send-time**: la app arranca SIEMPRE; un envío sin config válida devuelve un **outcome tipado**, no una excepción de arranque. Beneficio lateral gratis: al resolver la config en cada envío, los cambios tienen **hot-reload** sin redeploy.

Es un cambio **COMPLEJO y seguridad-sensible**: introduce cuatro bloques de infraestructura que hoy NO existen —cifrado reversible, audit log persistente, resolver de config cross-DB (tenant→global) y una migración fan-out sobre TODAS las tenant DBs—, sobre un dominio multi-tenant donde RBAC vive 100% en master. Por eso el primer corte entrega **solo nivel B (SMTP)** sobre infra genérica, diseñada para que el **nivel C** (ver §7) entre después SIN rework.

## 2. Scope

### In-scope (este change — Nivel B: SMTP)
- Tabla **`ConfiguracionRuntime`** (key-value genérica, **Opción A**) replicada en `prisma_master` (config global) y `prisma_tenant` (config por-tenant).
- **Cifrado at-rest** de secretos vía puerto `ISecretCipher` + adapter **AES-256-GCM** en infra (espejo de `IHashProvider`→`Argon2HashProvider`).
- **Resolver de config** `IConfigResolver`/`ResolveSmtpConfig` en application: lee tenant primero, cae a global, devuelve `Result<SmtpConfig, ...>` tipado.
- **Accesor tipado** `SmtpConfig` (value-object) que traduce las filas key-value genéricas a un objeto tipado en application.
- **Refactor del envío**: `NodemailerEmailSender` construye el transporter **por-envío** desde la config resuelta (ya no `fromEnv()` una vez); nuevo contrato de `EmailSenderPort.send()`.
- **Audit log** port-based (`AuditLogPort` + `AuditEntry` + evento `ConfiguracionCambiada` + handler async), acotado a cambios de config, inmutable, con **masking de secretos**.
- **RBAC**: permiso nuevo `configuracion:gestionar` (seed idempotente en master, asignado a ADMIN).
- **CRUD de config** (leer con secretos enmascarados / escribir con cifrado) para usuarios con el permiso.
- **Migración fan-out**: correr `MigrateTenantsRunner` sobre TODAS las tenant DBs activas + migración en master.

### Out-of-scope (ver §7 — Fase 2 / Nivel C, FAST-FOLLOW)
- **Toggle de notificaciones por-tenant** (activar/desactivar email por organización).
- **`esEstadoNotificable` DB-driven** (hoy hardcodeado; moverlo a config).
- **Reply-to / From configurable** por tenant y **branding**.
- **Otras categorías de config** (feature flags, límites, integraciones) — la tabla las soporta, pero no se cablean acá.
- **Rotación automatizada** de la clave de cifrado (queda documentada como deuda; ver D6).
- **API de consulta del audit log** (endpoint de historial) — el audit se escribe, exponerlo es fase 2.
- **KMS/Vault** para la clave de cifrado — se usa env var (ver D6).

## 3. Approach (arquitectura)

### 3.1 Tabla `ConfiguracionRuntime` — key-value genérica (Opción A)
El fork #1 (por-tenant con fallback a global) **obliga a la misma tabla en `prisma_master` y `prisma_tenant`**. Con una tabla tipada por categoría (Opción B) duplicaríamos schema en ambos lados por CADA categoría futura (nivel C). Con key-value genérica pagamos una vez el cifrado uniforme y la extensibilidad; la type-safety baja se compensa con un **accesor tipado en application** (`SmtpConfig`).

Columnas (a fijar en el spec): `clave` (string, único por scope), `valor` (string — cifrado si `esSecreto`), `tipo` (string|number|bool|json, para el cast del accesor), `categoria` (`smtp`, …), `esSecreto` (bool), `iv` (nullable), `authTag` (nullable), `actualizadoPor` (UUID soft-ref al usuario), `actualizadoEn` (timestamp). Misma definición en ambos schemas.

> **Regla clean-arch:** la tabla es detalle de infra. El dominio conoce `SmtpConfig` (VO tipado), NUNCA filas key-value ni columnas de cifrado.

### 3.2 Cifrado de secretos — `ISecretCipher` + AES-256-GCM
Greenfield: no hay cifrado reversible en el repo (el único precedente, `Argon2HashProvider`, es hashing one-way, inútil para `SMTP_PASS` que debe recuperarse en claro para nodemailer). Espejamos el patrón port/adapter:
- **Puerto** `ISecretCipher` en `domain/ports/` (o `shared/domain/ports/`): `encrypt(plaintext): { valor, iv, authTag }` / `decrypt({ valor, iv, authTag }): Result<string, CifradoError>`.
- **Adapter** en infra: **AES-256-GCM** vía `crypto` nativo de Node. Guarda `iv` + `authTag` junto al ciphertext (GCM los necesita para desencriptar y detectar tampering).
- **Clave**: env var `CONFIG_ENCRYPTION_KEY`, tier **bootstrap-secret** (mismo criterio que `JWT_SECRET`/`DATABASE_URL_MASTER`: secretos que se quedan en env, no en DB). Validada al bootstrap del adapter de cifrado (no del email).
- `decrypt` NUNCA lanza: envuelve fallos (clave mala, authTag inválido) en `Result.fail` con outcome tipado `CONFIG_CIFRADO_INVALIDO`, que fluye hasta el send-time.

### 3.3 Resolver de config cross-DB (tenant→global) — application
Precedente: `solicitante-email.resolver.ts` y `usuario-master.checker.ts` evitan `TenantContext` y van directo al cliente Prisma filtrando por `clienteId` (porque el handler async corre fuera del ciclo request/response). El `IConfigResolver`/`ResolveSmtpConfig` va **un paso más allá**: combina AMBOS clientes.
1. Resuelve `dbName` desde `master.clientes` por `clienteId`.
2. Lee `ConfiguracionRuntime` del tenant vía `getTenantClient(dbName)`.
3. Si no hay fila (o falta un campo requerido), **cae a `getMasterClient()`** (config global).
4. Descifra los secretos vía `ISecretCipher`, arma el VO `SmtpConfig`, devuelve `Result<SmtpConfig, ResolveConfigError>` (tipado: `NO_CONFIG`, `CONFIG_INCOMPLETA`, `CONFIG_CIFRADO_INVALIDO`). NUNCA lanza; nunca filtra el secreto en claro en el error.

### 3.4 Swap del envío: fail-fast de boot-time a send-time
Consecuencia dura del fork #3: el adapter YA NO puede construirse una sola vez (`fromEnv()` al bootstrap muere). Debe resolver config y armar transporter **por envío**. De los dos caminos del explore (agregar `clienteId` a `EmailMessage` vs. resolver en el handler), elegimos el **camino (b)** por ser el más limpio y respetar clean-arch:

- El **`NotificarCambioEstadoHandler`** (application) resuelve la `SmtpConfig` vía `ResolveSmtpConfig` ANTES de enviar. Si el `Result` es error, loguea con contexto y corta (email es side-effect, no rompe la transición del ticket — mismo principio del change `notif-email-estado-ticket`).
- El nuevo contrato de `EmailSenderPort.send()` recibe la config resuelta explícitamente:
  `send(email: EmailMessage, config: SmtpConfig): Promise<Result<void, EmailError>>`.
  **Por qué (b) y no (a):** meter `clienteId` en `EmailMessage` y resolver DENTRO de `send()` mete lógica cross-DB (resolución tenant→global + descifrado) en la capa de infra del adapter, acoplándolo al `PrismaService` y al cipher. Pasar `SmtpConfig` ya resuelta mantiene el adapter **tonto y puro**: recibe config tipada + descifrada, arma transporter, envía. La resolución (decisión de negocio: qué tenant, fallback, descifrado) queda en application, donde pertenece. `SmtpConfig` viaja ya descifrada en memoria; el secreto NUNCA toca logs ni el `EmailError` (se extiende el masking existente de `nodemailer-email-sender.adapter.ts:120-126`).
- `email-config.ts` se **reemplaza**, no se edita: `SmtpConfigError` como excepción de bootstrap deja de tener sentido.

### 3.5 Audit log — port-based, acotado a config
Greenfield total (grep `audit|auditoria` → nada). Seguimos `skills/audit-log/SKILL.md` pero **acotado** a los cambios de config de este change (no un framework genérico completo):
- **`AuditEntry`** (entidad de dominio, inmutable, con `actorId` siempre presente, `changes` estructurados `{field, oldValue, newValue}`).
- **`AuditLogPort`** en application (`record(entry): Result<void, AuditError>`).
- Evento de dominio **`ConfiguracionCambiada`** + **handler async** que llama a `AuditLogPort.record()`. Fallo de audit **NUNCA** bloquea el cambio de config (side-effect, se loguea y no propaga).
- **Masking obligatorio**: si `esSecreto`, el audit registra `oldValue`/`newValue` **enmascarados** (`***` o hash), NUNCA el secreto en claro. Esta es la regla de seguridad más crítica del change.
- **Scope dual**: cambio de config tenant se audita en la DB del tenant; global en master (misma tabla `AuditEntry` en ambos schemas).

### 3.6 RBAC — permiso `configuracion:gestionar`
El guard `permissions.guard.ts:8,25-51` evalúa `user.permisos` (array del JWT), NO consulta DB. El permiso `configuracion:gestionar` (formato `recurso:accion`, `permiso.entity.ts:59-65`) encaja directo. Seed idempotente en `prisma_master` (`INSERT ... ON CONFLICT (codigo) DO NOTHING` + asignación a rol ADMIN, patrón de `rbac-seed.integration.spec.ts:57-82`). **Limitación conocida (D9):** como los permisos se hornean al login (`login.use-case.ts:105-116`), otorgar/revocar `configuracion:gestionar` recién surte efecto en el **próximo login/refresh**, no instantáneamente.

### 3.7 Migración fan-out
La tabla tenant-scoped exige correr `MigrateTenantsRunner` (`scripts/migrate-tenants.runner.ts:57-132`) sobre TODAS las DBs activas (`SELECT db_name FROM clientes WHERE activo AND deleted_at IS NULL`), más la migración de master (tabla global + `AuditEntry` + permiso). Migraciones **idempotentes** (`IF EXISTS`/`DO $$`, sin drop+add), seguras de re-correr. Es **dependencia dura**: sin el fan-out completo, el feature no funciona en los tenants no migrados.

### 3.8 Placement (Screaming / Clean Architecture)
Rutas propuestas (a ratificar en el design). Convención del repo: ports en `domain/ports/` con prefijo `i-`; use cases en `application/use-cases/`; adapters en `infrastructure/`.

| Pieza | Capa | Ubicación propuesta |
|-------|------|---------------------|
| `SmtpConfig` (VO tipado) | domain | `backend/src/configuracion/domain/value-objects/smtp-config.vo.ts` |
| `ISecretCipher` (port) | domain/shared | `backend/src/shared/domain/ports/i-secret-cipher.ts` |
| Adapter AES-256-GCM | infrastructure | `backend/src/shared/infrastructure/crypto/aes-gcm-secret-cipher.adapter.ts` |
| `IConfigResolver` / `ResolveSmtpConfig` (port) | domain | `backend/src/configuracion/domain/ports/i-config-resolver.ts` |
| Adapter resolver cross-DB | infrastructure | `backend/src/configuracion/infrastructure/persistence/prisma/config-resolver.adapter.ts` |
| `AuditEntry` (entidad) | domain | `backend/src/configuracion/domain/entities/audit-entry.entity.ts` |
| `AuditLogPort` (port) | application/domain | `backend/src/configuracion/domain/ports/i-audit-log.port.ts` |
| Evento `ConfiguracionCambiada` | domain | `backend/src/configuracion/domain/events/configuracion-cambiada.event.ts` |
| Handler de audit (async) | application | `backend/src/configuracion/application/event-handlers/audit-configuracion.handler.ts` |
| Use cases CRUD config | application | `backend/src/configuracion/application/use-cases/{leer,actualizar}-config.use-case.ts` |
| Adapter audit (persistencia) | infrastructure | `backend/src/configuracion/infrastructure/persistence/prisma/audit-log.adapter.ts` |
| `EmailSenderPort` (contrato nuevo `send(msg, config)`) | domain | `backend/src/tickets/domain/ports/i-email-sender.port.ts` (editar) |
| `NodemailerEmailSender` (transporter por-envío) | infrastructure | `backend/src/tickets/infrastructure/email/nodemailer-email-sender.adapter.ts` (refactor) |
| `email-config.ts` | infrastructure | **eliminar/reemplazar** |
| Migración master | prisma | `prisma_master/migrations/*` (tabla global + `AuditEntry` + permiso) |
| Migración tenant | prisma | `prisma_tenant/migrations/*` (tabla config + `AuditEntry`) |
| Wiring | módulos | `configuracion.module.ts` (nuevo) + `tickets.module.ts` (swap del `EMAIL_SENDER`) |

> Nota de placement: la skill `audit-log` sugiere `application/ports/`; el repo centraliza ports en `domain/ports/`. Adoptamos la convención del repo por consistencia. El módulo nuevo `configuracion/` "grita" el dominio (Screaming Architecture, §2 CLAUDE.md). El design ratifica o mueve.

## 4. Affected areas (de explore.md)
- `backend/src/tickets/infrastructure/email/email-config.ts` — **se reemplaza** (fin del fail-fast de bootstrap).
- `backend/src/tickets/infrastructure/email/nodemailer-email-sender.adapter.ts:128-148` — refactor: transporter por-envío, no `fromEnv()`.
- `backend/src/tickets/domain/ports/i-email-sender.port.ts:31-53` — nuevo contrato `send(msg, config)`.
- `backend/src/tickets/tickets.module.ts:495-509` — swap del `EMAIL_SENDER` factory.
- `backend/src/tickets/**/notificar-cambio-estado.handler.ts` — resuelve `SmtpConfig` antes de enviar.
- `backend/src/shared/infrastructure/persistence/prisma.service.ts:22-114` — reusar `getMasterClient()`/`getTenantClient()` en el resolver.
- `backend/src/auth/domain/entities/permiso.entity.ts` + seed RBAC en master — permiso `configuracion:gestionar`.
- `scripts/migrate-tenants.runner.ts` — ejecutar el fan-out sobre todas las tenant DBs.
- `prisma_master/schema.prisma` + `prisma_tenant/schema.prisma` — tabla `ConfiguracionRuntime` + `AuditEntry`.
- `backend/package.json` — sin nueva dep de crypto (Node nativo); nodemailer ya existe.
- `.env` / config de bootstrap — nueva `CONFIG_ENCRYPTION_KEY`.

## 5. Decisiones resueltas

### Decisiones de producto YA CERRADAS por el usuario (NO re-abrir)
| # | Decisión | Rationale (1 línea) |
|---|----------|---------------------|
| D1 | **Alcance por-tenant con fallback a global** (tenant en su DB, global en master, resolución tenant→global al enviar) | White-label por org sin perder un default operativo. |
| D2 | **Secretos: cifrado at-rest + enmascarado en pantalla + audit log + RBAC** (permiso nuevo) | Seguridad por diseño (§7 CLAUDE.md); el secreto nunca viaja en claro fuera de memoria. |
| D3 | **Fail-fast de boot-time a send-time** (arranca siempre; envío sin config = outcome tipado) | La app no debe morir al arranque por config de un side-effect; hot-reload gratis. |

### Resoluciones del orquestador a las 5 preguntas abiertas del explore
| # | Pregunta | Resolución | Rationale (1 línea) |
|---|----------|------------|---------------------|
| D4 | Shape de tabla (KV genérica vs tipada) | **Opción A — key-value genérica** + accesor tipado `SmtpConfig` en application | El fork D1 obliga a la misma tabla en ambos schemas; A evita duplicar tablas tipadas por categoría futura. |
| D5 | Resolución de config (dónde) | En **application** vía `IConfigResolver`/`ResolveSmtpConfig` (espejo de `ISolicitanteEmailResolver`, Result tipado, tenant→global) | Decisión de negocio (qué tenant, fallback, descifrado) vive en application, no en el adapter. |
| D5b | Contrato de `send()` (camino a vs b) | **Camino (b)**: `send(email, config: SmtpConfig)` — config resuelta se pasa al adapter | Mantiene el adapter tonto/puro; no acopla infra de email al cross-DB ni al cipher. |
| D6 | Clave de cifrado (env vs KMS) + rotación | Env var **`CONFIG_ENCRYPTION_KEY`** (tier bootstrap-secret) + **AES-256-GCM** (`crypto` nativo, guarda iv+authTag) vía `ISecretCipher`. **Rotación manual/documentada como deuda** (no automatizada en MVP) | KMS/Vault es sobre-ingeniería sin infra de secrets manager; mismo criterio que `JWT_SECRET`. |
| D7 | Audit log (reusable vs angosto) | **Port-based y reusable** (`AuditLogPort` + `AuditEntry` + evento + handler async, siguiendo la skill) pero **acotado a cambios de config** en este change | Base sólida para reutilizar sin construir un framework genérico completo ahora. |
| D8 | Nivel C (toggle notif, `esEstadoNotificable` DB, reply-to, branding) | **FAST-FOLLOW — fuera de este change.** Primer corte SOLO nivel B (SMTP) sobre la infra genérica (Opción A), diseñada para que nivel C entre SIN rework | Acota un change ya grande y seguridad-sensible (crypto + audit + fan-out + RBAC + resolver cross-DB). |
| D9 | RBAC stale (permisos en JWT) | Aceptado como límite conocido: `configuracion:gestionar` surte efecto en el próximo login/refresh | El guard no consulta DB; los permisos se hornean al login. Refresco instantáneo excede el change. |

## 6. Riesgos y mitigaciones

| Riesgo | Impacto | Mitigación |
|--------|---------|------------|
| **Fan-out de migración incompleto** sobre tenant DBs | Feature no funciona en tenants no migrados (dependencia dura) | Correr `MigrateTenantsRunner` sobre TODAS las DBs activas; migraciones idempotentes; verificar conteo migrado vs `clientes` activos antes de dar el DONE. |
| **Clave de cifrado mal configurada/rotada** (`CONFIG_ENCRYPTION_KEY` ausente o cambiada) | TODAS las lecturas de secreto fallan en send-time | Outcome tipado propio **`CONFIG_CIFRADO_INVALIDO`** que fluye hasta el handler; `decrypt` nunca lanza; validación de presencia de la clave al bootstrap del cipher; rotación documentada como deuda (D6). |
| **Exposición de secretos** (logs, `Result.fail`, audit, error de nodemailer) | Fuga de credenciales SMTP | Regla dura: el secreto en claro SOLO existe en memoria entre `decrypt` y el transporter. NUNCA se interpola en logs/errores (extender masking `nodemailer:120-126`); audit enmascara valores `esSecreto`; pantalla muestra `***`. |
| **RBAC stale** (permiso no refleja cambios hasta próximo login) | Usuario recién autorizado no puede gestionar config aún; revocado sigue pudiendo hasta expirar el token | Documentado (D9). Aceptado en MVP; refresh de permisos es fase futura. Mitigación operativa: token de vida corta. |
| **Audit falla y bloquea el cambio** | Cambio de config revertido por un side-effect | Audit es side-effect no-bloqueante (skill): evento de dominio + handler async; fallo se loguea, NUNCA propaga ni revierte. |
| **Transporter por-envío degrada performance** | Reconstruir el transporter en cada envío añade latencia | Aceptado: el volumen de emails es bajo y el beneficio (hot-reload + por-tenant) lo justifica. Cache de transporter por `(clienteId, hash-config)` queda como optimización futura si el volumen crece. |
| **Cifrado y audit son greenfield** | Trabajo real de infra nueva, no wiring — mayor superficie de bug | TDD estricto (§4-5 CLAUDE.md): tests atómicos del cipher (round-trip encrypt/decrypt, authTag inválido → error tipado) y del resolver (tenant hit, fallback global, config incompleta) antes de implementar. |

## 7. Out of scope / Fase 2 (Nivel C — FAST-FOLLOW)

Todo lo siguiente se construye SOBRE la infra genérica de este change (Opción A + resolver + audit + cifrado), sin rework:
- **Toggle de notificaciones por-tenant**: fila de config `smtp.notif_habilitada` (bool) consultada por el handler antes de enviar.
- **`esEstadoNotificable` DB-driven**: mover el set hoy hardcodeado a filas de config por-tenant (categoría `notificaciones`).
- **Reply-to / From configurable + branding** por org.
- **Otras categorías** de config (feature flags, límites, integraciones) — la tabla KV ya las soporta.
- **Rotación automatizada** de `CONFIG_ENCRYPTION_KEY` (re-cifrado en batch de todos los secretos).
- **API de consulta del audit log** (endpoint de historial de cambios de config).
- **KMS/Vault** si el negocio exige gestión de secretos externa.
- **Cache de transporter** por `(clienteId, hash-config)` si el volumen de envíos lo justifica.

---

**Siguiente fase:** `sdd-spec` (columnas exactas de `ConfiguracionRuntime` y `AuditEntry`, escenarios Gherkin del resolver tenant→global incl. fallback y `CONFIG_CIFRADO_INVALIDO`, contrato exacto de `ISecretCipher`/`EmailSenderPort`/`AuditLogPort`, criterios de masking). `sdd-design` puede correr en paralelo (detalle de wiring del módulo `configuracion/`, estrategia de migración fan-out idempotente, formato de almacenamiento iv+authTag, refactor del adapter nodemailer).
