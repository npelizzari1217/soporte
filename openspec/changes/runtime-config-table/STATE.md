# STATE — runtime-config-table

## Apply Progress — PR1 (Fundaciones: migraciones + cifrado + boot fail-fast F1)

Branch: `runtime-config-table-pr1` (desde `master`). Sin push, sin PR — gateado por el usuario.

### Tasks (12/12 — PR1 completo)

- [x] 1.1 Migración master `20260701000000_add_configuracion_runtime_audit`
- [x] 1.2 Migración tenant espejo `20260701000000_add_configuracion_runtime_audit`
- [x] 1.3 Migración seed `20260701010000_seed_rbac_configuracion_gestionar` (permiso `configuracion:gestionar`, UUID `b0..020`)
- [x] 1.4 `prisma_master/schema.prisma` + `prisma_tenant/schema.prisma`: modelos `ConfiguracionRuntime`/`AuditEntry`
- [x] 1.5 RED/GREEN: integración — seed idempotente
- [x] 1.6 RED/GREEN: `AesGcmSecretCipher` round-trip
- [x] 1.7 RED/GREEN: `authTag` alterado ⇒ `Result.fail`, sin throw
- [x] 1.8 GREEN: `ISecretCipher`, `CifradoError`, `AesGcmSecretCipher`
- [x] 1.9 RED/GREEN: boot fail-fast de `CONFIG_ENCRYPTION_KEY` (F1)
- [x] 1.10 GREEN: `validateConfigEncryptionKey()` wireado en `SECRET_CIPHER` useFactory de `shared.module.ts`
- [x] 1.11 `CONFIG_ENCRYPTION_KEY` dummy en `backend/test/setup-env.ts`
- [x] 1.12 Verify: ver evidencia real abajo

### Archivos nuevos

| Archivo | Qué hace |
|---|---|
| `backend/src/shared/domain/ports/i-secret-cipher.ts` | Puerto `ISecretCipher` + `CipherPayload` + token `SECRET_CIPHER` |
| `backend/src/shared/domain/errors/cifrado.errors.ts` | `CifradoError extends DomainError` (`code='CONFIG_CIFRADO_INVALIDO'`) |
| `backend/src/shared/infrastructure/crypto/aes-gcm-secret-cipher.adapter.ts` | `AesGcmSecretCipher` — AES-256-GCM via `node:crypto`, clave lazy (nunca throw en encrypt/decrypt) |
| `backend/src/shared/infrastructure/crypto/aes-gcm-secret-cipher.adapter.spec.ts` | Round-trip, authTag tampering, clave ausente — unit |
| `backend/src/shared/infrastructure/crypto/config-encryption-key.ts` | `validateConfigEncryptionKey()` + `ConfigEncryptionKeyError` — boot-time fail-fast (F1), espejo de `email-config.ts`/`SmtpConfigError` |
| `backend/src/shared/infrastructure/crypto/config-encryption-key.spec.ts` | Unit — presencia/longitud/no-interpola-la-clave |
| `backend/src/shared/shared.module.spec.ts` | Nest bootstrap — SECRET_CIPHER resuelve OK; rechaza boot sin clave o con longitud inválida (regression-guard, espejo de `tickets.module.wiring.spec.ts`) |
| `backend/prisma_master/migrations/20260701000000_add_configuracion_runtime_audit/migration.sql` | `CREATE TABLE IF NOT EXISTS configuracion_runtime` + `audit_entries` + partial unique index |
| `backend/prisma_tenant/migrations/20260701000000_add_configuracion_runtime_audit/migration.sql` | Espejo tenant (aplicado vía `MigrateTenantsRunner`, no en boot) |
| `backend/prisma_master/migrations/20260701010000_seed_rbac_configuracion_gestionar/migration.sql` | Permiso `configuracion:gestionar` (`b0..020`) + asignación a `ADMINISTRADOR` |
| `backend/src/auth/infrastructure/persistence/prisma/seed-rbac-configuracion-gestionar.integration.spec.ts` | Integración — permiso sembrado, asignado a `ADMINISTRADOR`, migración NO referencia `ADMIN`, idempotencia scoped |

### Archivos modificados

| Archivo | Qué cambió |
|---|---|
| `backend/prisma_master/schema.prisma` | + modelos `ConfiguracionRuntime`/`AuditEntry` |
| `backend/prisma_tenant/schema.prisma` | + modelos `ConfiguracionRuntime`/`AuditEntry` |
| `backend/src/shared/shared.module.ts` | + provider/export `SECRET_CIPHER` (`useFactory` fail-fast) |
| `backend/test/setup-env.ts` | + `CONFIG_ENCRYPTION_KEY` dummy (base64, 32 bytes fijo) |
| `backend/src/auth/infrastructure/persistence/prisma/rbac-4-roles-seed.integration.spec.ts` | T1.6: `ADMINISTRADOR` ahora 20 permisos (19 + `configuracion:gestionar`); `beforeAll` aplica también la migración seed de PR1 como postrequisite (determinismo cross-file) |

### Desviaciones documentadas (críticas — leer antes de PR2+)

1. **`ADMIN` → `ADMINISTRADOR` en el seed del permiso (task 1.3).** `tasks.md`/`design.md` dicen literalmente "asignación rol ADMIN". Verificado contra el código real: la migración `20260629110000_remap_usuarios_roles` (change `tickets-rbac-4-roles`, POSTERIOR a la redacción del design de este change) remapeó TODOS los usuarios del rol legacy `ADMIN` al rol `ADMINISTRADOR` y soft-eliminó `ADMIN` (`deleted_at` seteado). Asignar el permiso nuevo a `ADMIN` habría insertado una fila `roles_permisos` "viva" pero inútil — ningún usuario activo tiene ese rol. Se asignó a `ADMINISTRADOR` (el rol admin REALMENTE activo) para que el permiso surta efecto de verdad. Documentado en el propio archivo de migración y en el nuevo spec de integración.
2. **Efecto colateral descubierto en tests preexistentes (no-regresión, corregido):** `rbac-seed.integration.spec.ts` (preexistente, fuera de este change) re-ejecuta como parte de SU PROPIO test de idempotencia la SQL LITERAL de la migración base `20260623010000_seed_rbac_base`, que asigna a `ADMIN` **todos** los permisos existentes en la tabla `permisos` vía `CROSS JOIN` sin filtro de código. Una vez que `configuracion:gestionar` existe en el catálogo, esa re-ejecución (ajena a este PR) inserta una fila `ADMIN`+`configuracion:gestionar` en la DB compartida de test — un efecto de orden de ejecución entre archivos de spec independientes, mismo patrón de flakiness ya documentado en `openspec/changes/notif-email-estado-ticket/STATE.md`. Se corrigió `seed-rbac-configuracion-gestionar.integration.spec.ts` para NO depender de un `SELECT` en vivo contra `ADMIN` (chequeo estático del texto de la migración en su lugar) y para que el test de idempotencia sea *scoped* a `ADMINISTRADOR` en vez de un `COUNT` global por `permiso_id`. No se tocó `rbac-seed.integration.spec.ts` (fuera de scope de PR1; su comportamiento es correcto para SU propia migración histórica).
3. **`.env.example` — NO se pudo actualizar.** El sandbox de este agente deniega TODO acceso (Read/Write/Bash/Glob) a archivos `.env*`, incluyendo `.env.example`. Pendiente: agregar manualmente `CONFIG_ENCRYPTION_KEY=<base64 de 32 bytes, ej. "openssl rand -base64 32">` a `backend/.env.example`. El dummy de test SÍ quedó resuelto (`backend/test/setup-env.ts`).

### Notas de diseño

- `AesGcmSecretCipher` mantiene su propia validación LAZY de la clave (`loadKey()` interna, nunca throw — usada por `encrypt`/`decrypt`) SEPARADA de la validación de boot-time (`validateConfigEncryptionKey()`, throw). Esto es intencional: F1 (autoritativo) pide fail-fast de la CLAVE al bootstrap; el spec R2/R6 pide que el descifrado de una FILA de datos nunca lance. Ambos contratos coexisten sin conflicto.
- Formato de clave: base64 de 32 bytes exactos (`Buffer.from(raw,'base64').length === 32`), igual que design §6.
- Prisma clients regenerados (`pnpm generate:master` / `generate:tenant`) para que los modelos `ConfiguracionRuntime`/`AuditEntry` estén disponibles a partir de PR2.
- Ambas migraciones (master + tenant) verificadas manualmente contra las DBs reales de test (`soporte_master_test`, `soporte_tenant_test`): aplican limpio, son idempotentes (re-corridas), y el partial unique index rechaza duplicados activos pero permite un nuevo activo tras soft-delete.

### Evidencia real (backend/, corrida serial FOREGROUND, 2026-07-30)

**`corepack pnpm test`** (2 corridas consecutivas, mismo resultado):
```
Test Files  164 passed | 1 skipped (165)
     Tests  2162 passed | 2 skipped (2164)
  Duration  ~173s
```
(vs. baseline previo — notif-email-estado-ticket STATE.md — 2145 passed; +17 tests netos de PR1, sin ninguna regresión: los 2 fallos intermedios detectados durante el desarrollo — ver desviación #2 — fueron corregidos, no ignorados.)

**`corepack pnpm lint`**: 4 errores `prettier/prettier` (indentación) detectados en la primera corrida, corregidos con `eslint --fix`. Corrida final:
```
$ eslint "src/**/*.ts"
EXIT_CODE=0
```
(sin output, exit 0).

**`corepack pnpm exec tsc --noEmit -p tsconfig.json`**: exit 0, sin output.

### Cómo retomar

PR1 cerrado y verde. Decidir con el usuario (Review Workload Guard, `ask-on-risk`): siguiente work unit es **PR2 — Resolver cross-DB + `SmtpConfig` VO** (depende de `ISecretCipher`, ya disponible). Antes de arrancar PR2, considerar resolver la desviación #3 (`.env.example`) manualmente fuera del sandbox de este agente.

## Judgment Day — PR1 — fixes Ronda 1

Fix-agent quirúrgico sobre la capa de cifrado (branch `runtime-config-table-pr1`, sin push). 6 hallazgos de la ronda de revisión — 4 reales confirmados, 1 teórico, 1 suggestion. Todos resueltos.

### Arreglos aplicados

1. **[WARNING real] Validación base64 laxa de la clave.** `Buffer.from(raw,'base64')` ignora silenciosamente caracteres inválidos — una clave malformada con ≥43 chars base64 válidos decodificaba igual a 32 bytes y pasaba el chequeo de solo-longitud. RED: test con clave con basura (`$$$` intercalado) que decodifica a 32 bytes mediante `Buffer.from` pero es formato inválido. GREEN: `STRICT_BASE64_32_BYTES = /^[A-Za-z0-9+/]{43}=$/` en `config-encryption-key.ts`, chequeado en `validateConfigEncryptionKey()` (después del chequeo de longitud, para preservar el mensaje `/longitud/i` de los tests preexistentes) y en `loadKey()` del adapter (antes del chequeo de longitud). Mensaje de error nunca interpola la clave.
   - `backend/src/shared/infrastructure/crypto/config-encryption-key.ts`
   - `backend/src/shared/infrastructure/crypto/aes-gcm-secret-cipher.adapter.ts`
   - Specs: `config-encryption-key.spec.ts` (+2 tests), `aes-gcm-secret-cipher.adapter.spec.ts` (+1 test)

2. **[WARNING real] Faltaba test de IV único (invariante GCM crítica).** Agregado test que cifra el mismo plaintext dos veces y asserta `iv1 !== iv2`, `ciphertext1 !== ciphertext2`, IV de 12 bytes, y que ambos payloads siguen descifrando al plaintext original. `randomBytes(IV_BYTES)` ya garantizaba la invariante — este test la deja cubierta.
   - `backend/src/shared/infrastructure/crypto/aes-gcm-secret-cipher.adapter.spec.ts` (+1 test)

3. **[WARNING real] CHECK constraint es_secreto→iv/auth_tag NOT NULL.** Agregado `CHECK ((es_secreto = false) OR (iv IS NOT NULL AND auth_tag IS NOT NULL))` a `configuracion_runtime` en ambas migraciones (master + tenant), como parte de la propia `CREATE TABLE IF NOT EXISTS` (idempotente). Verificado con INSERT real: fila `es_secreto=true` con `iv`/`auth_tag` NULL es rechazada por Postgres en ambas DBs; fila `es_secreto=false` con NULL sigue permitida.
   - `backend/prisma_master/migrations/20260701000000_add_configuracion_runtime_audit/migration.sql`
   - `backend/prisma_tenant/migrations/20260701000000_add_configuracion_runtime_audit/migration.sql`
   - **Test DB**: en esta sesión, `soporte_master` NO tenía la migración `20260701000000_add_configuracion_runtime_audit` aplicada ni registrada en `_prisma_migrations` (tablas `configuracion_runtime`/`audit_entries` no existían) — se aplicó formalmente (junto con `20260630000000_set_global_admin_nestor` y `20260701010000_seed_rbac_configuracion_gestionar`, también pendientes) vía `prisma migrate deploy --schema=prisma_master/schema.prisma`. `soporte_tenant_test` SÍ tenía las tablas creadas pero **sin** registro en `_prisma_migrations` (aplicación manual/raw previa, no trackeada) y vacías (0 filas) — se dropearon (`DROP TABLE IF EXISTS ... CASCADE`, sin pérdida de datos) y se re-aplicaron formalmente vía `prisma migrate deploy --schema=prisma_tenant/schema.prisma --config prisma.tenant.config.ts` con `DATABASE_URL_TENANT` apuntando a `soporte_tenant_test`. `prisma migrate status` confirma "Database schema is up to date!" sin drift en ambas DBs tras el fix.

4. **[WARNING teórico] decrypt() catch-all perdía señal.** El catch de `decrypt()` mapeaba toda excepción a `CifradoError` sin loguear la causa cruda (tampering esperado vs. bug real como `payload.iv` undefined eran indistinguibles). GREEN: loguea `err.message`/tipo + stack vía `new Logger(AesGcmSecretCipher.name)` de `@nestjs/common` (infra puede importar el framework directo — mismo precedente que `TenantGuard`/`NotificarCambioEstadoListener`, ver `i-logger.port.ts`) ANTES de mapear a `CifradoError`. Nunca loguea `payload.valor` ni la clave. Contrato `decrypt()` nunca throw / `Result.fail` intacto — verificado en la corrida real (el log de `ERROR [AesGcmSecretCipher] decrypt() falló: Error: Unsupported state or unable to authenticate data` aparece durante el test de tampering, sin abortar la suite).
   - `backend/src/shared/infrastructure/crypto/aes-gcm-secret-cipher.adapter.ts`

5. **[SUGGESTION] KEY_BYTES duplicado.** Exportado desde `config-encryption-key.ts` (fuente única), importado en el adapter — eliminado el `const KEY_BYTES = 32` duplicado.

6. **[SUGGESTION] Documentar no-FK en audit master.** Comentario agregado en la migración master documentando que `audit_entries.actor_id` sacrifica deliberadamente la FK a `usuarios` (que en master sí existe) para mantener el shape idéntico entre master y tenant (donde la FK cross-DB es imposible).
   - `backend/prisma_master/migrations/20260701000000_add_configuracion_runtime_audit/migration.sql`

### Diferido a PRs posteriores (NO implementado en esta ronda — fuera de scope)

- **Enmascarado de secretos en el audit `valor_anterior`/`valor_nuevo`**: pertenece al write use case (PR3), que todavía no existe.
- **`CHECK (tipo IN (...))`**: pendiente de que se defina el catálogo cerrado de tipos (PR2/PR4).

### Evidencia real (backend/, corrida serial FOREGROUND, 2026-07-30)

**`corepack pnpm test`** (corrida final, contra el estado exacto commiteado):
```
Test Files  164 passed | 1 skipped (165)
     Tests  2166 passed | 2 skipped (2168)
  Duration  172.59s
```
(vs. baseline 2162 passed de la sección anterior de este STATE.md — +4 tests netos de esta ronda: 2 de validación de formato base64, 1 de IV único, 1 de encrypt() con clave malformada. Sin regresiones.)

**`corepack pnpm lint`**: 1 error `prettier/prettier` detectado en la primera corrida (line-wrap del `logger.error(...)` en el catch de `decrypt()`), corregido a una sola línea. Corrida final:
```
$ eslint "src/**/*.ts"
EXIT_CODE=0
```

**`corepack pnpm exec tsc --noEmit -p tsconfig.json`**: exit 0, sin output.

### Commits

- `fix(configuracion): CHECK es_secreto->iv/auth_tag + doc no-FK audit_entries` (migraciones)
- `fix(crypto): validacion base64 estricta, log crudo en decrypt(), IV unico` (config-encryption-key.ts + adapter.ts + specs)

Sin push, sin PR — branch `runtime-config-table-pr1` gateado por el usuario, igual que Apply Progress PR1.

## Judgment Day — PR1 — fixes Ronda 2

Fix-agent quirúrgico sobre la capa de cifrado + migraciones (branch `runtime-config-table-pr1`, sin push). 6 hallazgos de la ronda de revisión — 5 reales/confirmados (1 REGRESIÓN prioritaria), 1 forward-risk documentado (sin implementar writer, es PR3). Todos resueltos.

### Arreglos aplicados

1. **[MEDIUM real — REGRESIÓN, prioridad] La regex base64 rechazaba una clave válida con whitespace final.** El recipe documentado `openssl rand -base64 32 > key.txt` agrega un `\n` final — una clave VÁLIDA leída de archivo (ej. K8s `secretKeyRef`) era rechazada al bootstrap (boot failure evitable). FIX: `.trim()` sobre el valor crudo de `CONFIG_ENCRYPTION_KEY` ANTES de la regex y del decode, en `checkConfigEncryptionKeyFormat()` (fuente única, ver fix #2) — usado por `validateConfigEncryptionKey()` y `loadKey()` del adapter. Solo recorta whitespace de BORDE: basura intercalada en el medio sigue rechazada.
   - `backend/src/shared/infrastructure/crypto/config-encryption-key.ts`
   - `backend/src/shared/infrastructure/crypto/aes-gcm-secret-cipher.adapter.ts`
   - Specs (+5 tests): `config-encryption-key.spec.ts` (acepta `\n` final, acepta espacios de borde, rechaza basura intercalada), `aes-gcm-secret-cipher.adapter.spec.ts` (encrypt/decrypt con clave `\n` final, encrypt con espacios de borde)

2. **[confirmado A+B] Orden de validación divergente entre los dos validators.** `config-encryption-key.ts` validaba longitud→formato; el adapter validaba formato→longitud — el MISMO input inválido daba dos mensajes/diagnósticos distintos. FIX: extraído `checkConfigEncryptionKeyFormat(raw): {ok:true;key:Buffer} | {ok:false;reason:'missing'|'formato'|'longitud'}` en `config-encryption-key.ts` — predicado ÚNICO con orden FIJO trim→formato→longitud (formato primero). `validateConfigEncryptionKey()` y `loadKey()` del adapter SOLO mapean el resultado a su propio tipo de error (`ConfigEncryptionKeyError` throw / `CifradoError` Result.fail) — ninguno reimplementa el orden. Nota: como `STRICT_BASE64_32_BYTES` ancla el string a 44 caracteres exactos, una clave de 16 u 48 bytes ya falla el chequeo de FORMATO (no llega al chequeo de longitud) — el branch `'longitud'` queda como defensa adicional. Se ajustó el test preexistente de "16 bytes ⇒ /longitud/i" a "⇒ /formato/i" (documentado inline por qué cambió).
   - `backend/src/shared/infrastructure/crypto/config-encryption-key.ts`
   - `backend/src/shared/infrastructure/crypto/aes-gcm-secret-cipher.adapter.ts`
   - Specs (+5 tests): `config-encryption-key.spec.ts` (predicado da `reason='formato'` para 16 y 48 bytes, mismo reason entre ambos, `validateConfigEncryptionKey()` da `/formato/i` para ambos), `aes-gcm-secret-cipher.adapter.spec.ts` (validator y `encrypt()` coinciden en `/formato/i` para 16 y 48 bytes)

3. **[LOW] Test de no-filtrado de secreto en el log de decrypt().** Agregado test que espía `Logger.prototype.error` (`vi.spyOn`, mismo patrón que `notificar-cambio-estado.listener.spec.ts`) en el path de tampering (authTag alterado) y asserta que el string logueado NUNCA contiene el plaintext ni `payload.valor`, y SÍ contiene contenido real de `err.message` (verificado por el prefijo `"decrypt() falló: "` seguido de texto no vacío — el texto exacto de `err.message` lo define node:crypto/OpenSSL y no se hardcodea).
   - `backend/src/shared/infrastructure/crypto/aes-gcm-secret-cipher.adapter.spec.ts` (+1 test)

4. **[LOW] Comentario del CHECK en schema.prisma.** Agregada una línea junto al comentario existente del partial unique index en el modelo `ConfiguracionRuntime` (ambos schemas), documentando que el `CHECK (es_secreto=false OR iv/auth_tag NOT NULL)` vive como raw SQL en la migración — para que un futuro `prisma migrate dev` no lo pierda silenciosamente.
   - `backend/prisma_master/schema.prisma`
   - `backend/prisma_tenant/schema.prisma`

5. **[LOW] Nota de idempotencia del CHECK en las migraciones.** Aclarado en ambas migraciones `add_configuracion_runtime_audit` que `CREATE TABLE IF NOT EXISTS` es un no-op si la tabla YA existe — NO agrega el CHECK a una DB que corrió la migración ANTES de que el guard se agregara (Ronda 1). Esas DBs deben verificarse a mano (`pg_constraint`) y, si falta, recrear la tabla o agregar el CHECK vía `ALTER TABLE ... ADD CONSTRAINT` manual — el archivo de migración por sí solo no lo corrige retroactivamente.
   - `backend/prisma_master/migrations/20260701000000_add_configuracion_runtime_audit/migration.sql`
   - `backend/prisma_tenant/migrations/20260701000000_add_configuracion_runtime_audit/migration.sql`

6. **[MEDIUM forward-risk] Contrato de secretos en `audit_entries` — REQUISITO DURO para PR3.** `audit_entries` no tiene `iv`/`auth_tag` (a diferencia de `configuracion_runtime`) y hoy (PR1) no existe writer (es PR3). Documentado EXPLÍCITAMENTE en el `CREATE TABLE audit_entries` de ambas migraciones: para filas `es_secreto=true`, `valor_anterior`/`valor_nuevo` DEBEN guardar el valor ENMASCARADO (ej. `"***"`), NUNCA el secreto en claro NI cifrado — el audit no es un vault, es un log (design Dz7). Deliberadamente SIN CHECK de DB: el valor enmascarado válido ES un string NOT NULL, así que un guard `es_secreto ⇒ NULL` rompería el masking en vez de exigirlo; no hay forma barata de expresar "enmascarado, no plaintext" como CHECK de Postgres sin acoplarlo al formato exacto del masking. Solo doc + este requisito en STATE — NO se implementó el writer (fuera de scope, PR3).
   - `backend/prisma_master/migrations/20260701000000_add_configuracion_runtime_audit/migration.sql`
   - `backend/prisma_tenant/migrations/20260701000000_add_configuracion_runtime_audit/migration.sql`

   **REQUISITO DURO PARA PR3** (leer antes de implementar el writer de audit):
   - El writer de `audit_entries` DEBE enmascarar `valor_anterior`/`valor_nuevo` para toda fila con `es_secreto=true`. Cero excepciones — ni siquiera para debugging.
   - El Judgment Day de PR3 DEBE incluir una verificación explícita de "cero plaintext de secreto en el audit" (grep/assert sobre el valor persistido, no solo sobre la ruta de código).
   - Esto es contrato de diseño (Dz7), no una sugerencia — un writer que persista el secreto en claro en `audit_entries` es una vulnerabilidad de exfiltración de datos, no un bug cosmético.

### Diferido a PRs posteriores (NO implementado en esta ronda — fuera de scope)

- **Writer de `audit_entries` con masking real**: pertenece a PR3 (fix #6 documenta el contrato duro que ese writer debe cumplir).
- **`CHECK (tipo IN (...))`**: pendiente de que se defina el catálogo cerrado de tipos (PR2/PR4) — sin cambios en esta ronda.

### Evidencia real (backend/, corrida serial FOREGROUND, 2026-07-30)

**`corepack pnpm test`** (corrida final, contra el estado exacto commiteado):
```
Test Files  164 passed | 1 skipped (165)
     Tests  2178 passed | 2 skipped (2180)
  Duration  171.36s
```
(vs. baseline 2166 passed de Ronda 1 — +12 tests netos de esta ronda: 3 de trim en `config-encryption-key.spec.ts`, 4 de diagnóstico compartido en `config-encryption-key.spec.ts`, 2 de trim + 2 de diagnóstico compartido + 1 de no-filtrado de log en `aes-gcm-secret-cipher.adapter.spec.ts`. Sin regresiones. Una corrida intermedia falló por un typo de test (`jest.spyOn` en vez de `vi.spyOn` — este proyecto usa Vitest, no Jest); corregido antes de la corrida final reportada acá.)

**`corepack pnpm lint`**:
```
$ eslint "src/**/*.ts"
EXIT_CODE=0
```
(sin output, exit 0, sin correcciones necesarias esta ronda).

**`corepack pnpm exec tsc --noEmit -p tsconfig.json`**: exit 0, sin output.

**Test DB — drift**: ningún cambio de esta ronda modifica DDL (solo comentarios SQL/Prisma) — matemáticamente no puede introducir drift de schema. `prisma migrate status --schema=prisma_master/schema.prisma` contra la DB alcanzable desde este shell (`soporte_master`) confirma `Database schema is up to date!` sin warnings de checksum/drift. La verificación equivalente contra `soporte_tenant_test` no pudo correrse por CLI directo en este shell (`DATABASE_URL_TENANT` se resuelve dentro del proceso de Vitest vía `test/setup-env.ts`, no está exportada al shell) — la evidencia indirecta es la suite completa de integración (`prisma-*.integration.spec.ts`, `tenant-schema.integration.spec.ts`, etc.) corriendo en verde contra `soporte_master_test`/`soporte_tenant_test` reales.

### Commits

- `fix(crypto): unificar validacion de CONFIG_ENCRYPTION_KEY con trim y predicado compartido` (config-encryption-key.ts + adapter.ts + specs)
- `docs(configuracion): documentar CHECK, idempotencia de migracion y contrato de masking en audit` (schema.prisma + migraciones + STATE.md)

Sin push, sin PR — branch `runtime-config-table-pr1` gateado por el usuario, igual que Apply Progress PR1 y Ronda 1.

## Apply Progress — PR2 (Resolver cross-DB + `SmtpConfig` VO — R1, R9)

Branch: `runtime-config-table-pr2` (encadenada sobre `runtime-config-table-pr1`, ya aprobado). Sin push, sin PR — gateado por el usuario.

### Tasks (12/12 — PR2 completo)

- [x] 2.1 RED: `SmtpConfig.create()` — completa ⇒ ok; falta campo/`port` no numérico ⇒ `ConfigIncompletaError`
- [x] 2.2 GREEN: `shared/domain/value-objects/smtp-config.vo.ts`
- [x] 2.3 `configuracion/domain/errors/config.errors.ts` (`ConfigIncompletaError` re-exportada, `NoConfigError`, `ResolveConfigError`) — ver desviación #1
- [x] 2.4 `configuracion/domain/ports/i-config-resolver.ts` (`IConfigResolver`, `CONFIG_RESOLVER`, `resolveSmtp`)
- [x] 2.5 RED: tenant completa + global distinta ⇒ usa TENANT (R1 escenario 1)
- [x] 2.6 RED: tenant sin fila, global completa ⇒ usa GLOBAL (R1 escenario 2)
- [x] 2.7 RED: ni tenant ni global ⇒ `Result.fail(NoConfigError)`, sin throw (R1 escenario 3)
- [x] 2.8 RED: merge por campo — ok con merge parcial; incompleta ⇒ `ConfigIncompletaError` (R1 escenario 4, Dz4)
- [x] 2.9 RED: aislamiento cross-DB — resuelve `dbName` de A por `clienteId`, nunca consulta la DB de B (R1 escenario 5, R9)
- [x] 2.10 RED: `pass` esSecreto se descifra vía `ISecretCipher.decrypt()`; falla ⇒ `Result.fail(CifradoError)` propagado (R2)
- [x] 2.11 GREEN: `configuracion/infrastructure/persistence/prisma/config-resolver.adapter.ts` (`PrismaConfigResolver`)
- [x] 2.12 Verify: ver evidencia real abajo

### Archivos nuevos

| Archivo | Qué hace |
|---|---|
| `backend/src/shared/domain/errors/config-incompleta.error.ts` | `ConfigIncompletaError extends DomainError` (`code='CONFIG_INCOMPLETA'`) — ver desviación #1 |
| `backend/src/shared/domain/value-objects/smtp-config.vo.ts` | VO `SmtpConfig` self-validating: `create()` valida completitud + castea `port`/`secure` desde string (valores crudos de `ConfiguracionRuntime.valor`); `toSafeLog()`/`toJSON()`/`[inspect.custom]` enmascaran `pass` SIEMPRE (defensa en profundidad, mismo patrón que `Email` VO); `#props` es private field REAL de ECMAScript. Exporta `SMTP_CONFIG_CAMPOS_REQUERIDOS` (reusado por el resolver). |
| `backend/src/shared/domain/value-objects/smtp-config.vo.spec.ts` | Unit — completa/incompleta/port no numérico/secure inválido, + 3 tests de masking (`toSafeLog`, `JSON.stringify`, `util.inspect`) |
| `backend/src/configuracion/domain/errors/config.errors.ts` | Re-exporta `ConfigIncompletaError` (físicamente en `shared/`) + define `NoConfigError` + `ResolveConfigError` (unión) |
| `backend/src/configuracion/domain/ports/i-config-resolver.ts` | Puerto `IConfigResolver` + token `CONFIG_RESOLVER` + método `resolveSmtp(clienteId)` |
| `backend/src/configuracion/infrastructure/persistence/prisma/config-resolver.adapter.ts` | `PrismaConfigResolver` — merge por campo tenant→global (Dz4), resuelve `dbName` desde `master.clientes` (precedente `TenantGuard`/`SolicitanteEmailResolver`), descifra `esSecreto` vía `ISecretCipher`, arma `SmtpConfig` |
| `backend/src/configuracion/infrastructure/persistence/prisma/config-resolver.adapter.spec.ts` | Unit — 7 tests cubriendo R1 escenarios 1-5, R9 aislamiento, R2 fallo de descifrado |

### Desviaciones documentadas

1. **`ConfigIncompletaError` NO vive físicamente en `configuracion/domain/errors/config.errors.ts` como dice `design.md` §5 literal.** Vive en `shared/domain/errors/config-incompleta.error.ts` y se re-exporta desde `configuracion/domain/errors/config.errors.ts` para conservar la superficie pública de la tarea 2.3. Motivo: `SmtpConfig.create()` (VO de `shared/domain/value-objects`, Dz1) la consume directamente. Si viviera en `configuracion/domain`, el VO de `shared/` importaría de un dominio específico (`configuracion/`), invirtiendo la regla de dependencias de clean-arch (`shared` no puede depender de un dominio hoja) — exactamente el mismo razonamiento que ya aplicó Dz2 para `CifradoError`/`ISecretCipher` (ambos viven en `shared/` porque los consume un componente cross-dominio). El import público `from '.../configuracion/domain/errors/config.errors'` sigue funcionando idéntico para cualquier consumidor futuro (PR3/PR4) gracias al re-export — cero impacto downstream.
2. **`SmtpConfig.toSafeLog()` no usa `SECRET_MASK` de `configuracion/domain/mask-secret.ts`** (ese archivo es tarea 3.1, PR3 — no existe todavía). Se usa el literal `'********'` directamente en el VO, igual al valor que `design.md` §5.1 documenta para `SECRET_MASK`. Cuando PR3 cree `mask-secret.ts`, considerar si vale la pena que el VO importe la constante compartida (haría que `shared/` dependa de `configuracion/` de nuevo — mismo problema que desviación #1; probablemente mejor dejar el VO con su propio literal local, ya que es un valor estable y trivial).
3. **Endurecimiento de seguridad no pedido explícitamente por las tareas 2.1/2.2, pero consistente con el patrón `Email` VO y CLAUDE.md §7:** `SmtpConfig` implementa `toJSON()` y `[Symbol.for('nodejs.util.inspect.custom')]` (además del `toSafeLog()` que sí pide `design.md`) para que `JSON.stringify()` y `console.log()`/`util.inspect()` NUNCA expongan `pass` en claro por accidente — mismo razonamiento que llevó a los Judgment Day de `notif-email-estado-ticket` a agregar esas mismas defensas al VO `Email`. Cubierto por tests dedicados en `smtp-config.vo.spec.ts`.

### Notas de diseño

- El merge por campo (Dz4) itera `SMTP_CONFIG_CAMPOS_REQUERIDOS` (exportado por el VO, no duplicado en el resolver): por cada campo, `tenantByClave.get(campo) ?? globalByClave.get(campo)`; si ninguno tiene el campo, se omite (queda faltante para que `SmtpConfig.create()` lo detecte al final).
- Descifrado: si una fila tiene `esSecreto=true` pero `iv`/`authTag` son `null` (dato corrupto — no debería pasar nunca gracias al `CHECK` de PR1, pero el tipo Prisma es `string | null` y hay que manejarlo), se devuelve `ConfigIncompletaError` en vez de intentar `decrypt()` con valores `null`.
- Resolución de `dbName`: `master.clientes.findFirst({ id: clienteId, activo: true, deletedAt: null }, select: { dbName: true })` — mismo criterio de "cliente activo" que usa `TenantGuard` (`tenant.guard.ts`). Si el cliente no existe/está inactivo, el resolver NO lanza — simplemente no hay filas de tenant, y cae a la lógica de global/`NO_CONFIG` (comportamiento no cubierto por un escenario específico del spec de PR2, pero consistente con "nunca lanza").
- Aislamiento (R9, tarea 2.9): el resolver NUNCA usa `TenantContext` — resuelve `dbName` explícito por `clienteId` en cada llamada, mismo patrón que `SolicitanteEmailResolver`/`UsuarioMasterChecker` (precedente de PR2 de `notif-email-estado-ticket`). Test dedicado verifica que `getTenantClient` se invoca SOLO con el `dbName` del cliente resuelto, nunca con el de otro tenant.
- No se creó `ConfiguracionModule` en este PR (wiring NestJS es tarea 4.12, PR4) — `PrismaConfigResolver` se instancia/testea directamente por constructor, igual que `SolicitanteEmailResolver`/`UsuarioMasterChecker`.

### Evidencia real (backend/, corrida serial FOREGROUND, 2026-07-30, contra el estado exacto commiteado)

**`corepack pnpm test`**:
```
Test Files  166 passed | 1 skipped (167)
     Tests  2199 passed | 2 skipped (2201)
  Duration  174.42s
```
(vs. baseline PR1 Ronda 2 — 2178 passed — +21 tests netos de PR2: 9 de `smtp-config.vo.spec.ts`, 7 de `config-resolver.adapter.spec.ts`, resto de variaciones `it.each`. Sin regresiones. El log `ERROR [AesGcmSecretCipher] decrypt() falló: ...` que aparece en la corrida es esperado — pertenece a un test de PR1 que fuerza tampering del `authTag` y verifica el log, no un fallo real.)

**`corepack pnpm lint`**: primera corrida detectó 10 errores `prettier/prettier` (formato) en los 2 archivos del resolver — corregidos con `eslint --fix` (solo reformateo, sin cambios de lógica). Corrida final:
```
$ eslint "src/**/*.ts"
EXIT_CODE=0
```
(sin output, exit 0).

**`corepack pnpm exec tsc --noEmit -p tsconfig.json`**: exit 0, sin output.

### Commits

- `feat(configuracion): SmtpConfig VO y errores de resolucion de config` (VO + errores + puerto)
- `feat(configuracion): resolver cross-DB de config SMTP con merge por campo` (adapter + specs)

Sin push, sin PR — branch `runtime-config-table-pr2` gateado por el usuario, encadenada sobre `runtime-config-table-pr1`.

### Cómo retomar

PR2 cerrado y verde. Próximo work unit (Review Workload Guard, `ask-on-risk`): **PR3 — Audit inmutable** (depende del esquema DB de PR1, ya disponible). Antes de arrancar PR3, leer el **REQUISITO DURO** documentado en "Judgment Day — PR1 — fixes Ronda 2" fix #6: el writer de `audit_entries` DEBE enmascarar `valorAnterior`/`valorNuevo` para toda fila `esSecreto=true` — cero excepciones.

## Judgment Day — PR2 — fixes Ronda 1

Fix-agent quirúrgico sobre el resolver cross-DB + `SmtpConfig` VO (branch `runtime-config-table-pr2`, sin push). 6 hallazgos de la ronda de revisión — 2 WARNING reales (prioridad), 2 confirmados A+B, 1 desviación a documentar, 1 test faltante, 3 arreglos "baratos" agrupados. Todos resueltos.

### Arreglos aplicados

1. **[WARNING real, prioridad] `resolveSmtp` podía hacer THROW con `clienteId` inválido.** `masterClient.cliente.findFirst({where:{id: clienteId}})` con un `clienteId` no-UUID lanza `PrismaClientValidationError` — sin manejo, el reject se propagaba fuera de `resolveSmtp()`, violando el contrato "NUNCA lanza" (el resolver corre en un listener async sin boundary HTTP, mismo contexto que `SolicitanteEmailResolver`). FIX: nuevo error `InfraConfigError` (`code='CONFIG_INFRA_ERROR'`) en `config.errors.ts`, agregado a la unión `ResolveConfigError`. `findTenantRows()` y `findGlobalRows()` envuelven CADA llamada Prisma (master + tenant) en try/catch propio (mismo patrón que `SolicitanteEmailResolver`: catch-all sin interpolar el error crudo del driver, que puede contener detalles de conexión sensibles) y mapean a `Result.fail(InfraConfigError)`.
   - `backend/src/configuracion/domain/errors/config.errors.ts` (+`InfraConfigError`)
   - `backend/src/configuracion/infrastructure/persistence/prisma/config-resolver.adapter.ts`
   - Tests (+3): `clienteId` no-UUID con `findFirst` rechazado, tenant `findMany` rechazado, global `findMany` rechazado — los 3 verifican `resolves.not.toThrow()` y `Result.fail(InfraConfigError)`.

2. **[real, confirmado A+B] El merge caía a global por AUSENCIA de fila, no por valor vacío.** `tenantByClave.get(campo) ?? globalByClave.get(campo)` solo caía a global si el tenant NO tenía fila — una fila de tenant con `valor` vacío/blanco (no-secreto) se tomaba igual y NUNCA caía a una global válida, produciendo `ConfigIncompletaError` cuando debía funcionar (contradice design §3.1: el fallback es sobre el VALOR). FIX: extraído `resolverFilaParaCampo()` — una fila de tenant NO-secreta con `valor.trim().length === 0` se trata como "campo NO cubierto" y cae a la fila global. Las filas secretas (`esSecreto=true`, `valor`=ciphertext) NO aplican esta regla — su corrupción se detecta por separado vía `iv`/`authTag` (fix #6). Los 3 casos ya cubiertos (tenant completo gana, ausencia total cae a global, ni-ni ⇒ `NoConfigError`) siguen verdes sin cambios.
   - `backend/src/configuracion/infrastructure/persistence/prisma/config-resolver.adapter.ts`
   - Tests (+3): tenant `host=''` + global completa ⇒ usa global; tenant `host='   '` (solo whitespace) + global completa ⇒ usa global; tenant `host=''` + global también sin `host` ⇒ `ConfigIncompletaError` (no rompe el caso ni-ni).

3. **[LOW, confirmado A+B] `SmtpConfig` VO sin `equals()`/`toString()`.** Faltaba el contrato completo de value-objects (precedente `Email` VO). FIX: `equals(other: SmtpConfig)` compara los 6 campos por valor (incluido `pass` en claro — comparación interna en memoria, no expone nada); `toString()` delega en `toSafeLog()` (mismo patrón que `Email#toString()` → `mask()`) para que la interpolación implícita (template literals, `String(config)`) NUNCA filtre `pass` en claro.
   - `backend/src/shared/domain/value-objects/smtp-config.vo.ts`
   - Tests (+8): `equals()` true con los 6 campos iguales, false por cada campo distinto (`it.each`); `toString()`/interpolación implícita/`String(config)` nunca contienen el `pass` en claro y sí el resto de campos + máscara.

4. **[WARNING real, Juez A] Desviación de D5 documentada (solo doc, sin refactor).** El design/proposal D5 dice que la resolución (merge/fallback/descifrado) vive en `application`, pero está en el adapter de infra (`PrismaConfigResolver`). Verificado: sigue EXACTAMENTE el precedente `IConfigResolver` (puerto `domain/ports`) + `PrismaConfigResolver` (adapter `infrastructure/persistence/prisma`), espejo de `ISolicitanteEmailResolver`/`SolicitanteEmailResolver` (aceptado en `notif-email-estado-ticket`, sin capa `application/` propia). Decisión deliberada — NO se refactorizó a `application/` (sería over-engineering contra el precedente ya aceptado en un change hermano). Documentado acá como desviación de D5, sin tocar código.

5. **[test, Juez B] Faltaba el branch cliente inactivo/inexistente.** No había test donde `cliente.findFirst` resuelve `null`. FIX: agregados 2 tests — `findFirst → null` + global completa ⇒ NO se llama `getTenantClient()`, cae a solo-global (`Result.ok`); `findFirst → null` + sin global ⇒ `Result.fail(NoConfigError)`, tampoco se llama `getTenantClient()`. El comportamiento de producción YA era correcto (`if (!cliente) return Result.ok([])`, sin cambios de código) — Aislamiento R9 ahora con cobertura explícita.
   - `backend/src/configuracion/infrastructure/persistence/prisma/config-resolver.adapter.spec.ts` (+2 tests, sin cambio de código de producción)

6. **[baratos, agrupados] `Promise.all`, fila corrupta con error distinto, rango de puerto.**
   - **`Promise.all`**: `findTenantRows()` y `findGlobalRows()` son independientes (master + tenant en paralelo) — `resolveSmtp()` ahora hace `const [tenantRowsResult, globalRowsResult] = await Promise.all([...])` en vez de dos `await` secuenciales (hot path de envío de mail).
   - **Fila corrupta ≠ config incompleta**: una fila `esSecreto=true` con `iv`/`authTag` en `null` mapeaba a `ConfigIncompletaError` (mismo código que "falta campo"), confundiendo corrupción de datos con config de negocio faltante en monitoreo. Nuevo error `ConfigFilaCorruptaError` (`code='CONFIG_FILA_CORRUPTA'`) en `config.errors.ts`, agregado a `ResolveConfigError`. Test dedicado verifica el código distinto y que `decrypt()` NUNCA se llama con datos corruptos.
   - **Rango de puerto**: `SmtpConfig.readPort()` solo validaba `Number.isFinite` — aceptaba `port=0`, negativos, `1.5` y valores > 65535. FIX: `isValidPort()` exige entero en `1-65535`. Tests con `it.each` para los bordes inválidos (`0`, `-1`, `-25`, `65536`, `100000`, `1.5`) y válidos (`1`, `587`, `65535`).
   - `backend/src/configuracion/domain/errors/config.errors.ts` (+`ConfigFilaCorruptaError`)
   - `backend/src/configuracion/infrastructure/persistence/prisma/config-resolver.adapter.ts`
   - `backend/src/shared/domain/value-objects/smtp-config.vo.ts`
   - Tests (+7): 1 fila corrupta con código distinguible, 6 de rango de puerto (`it.each` inválidos + válidos).

### Diferido a PRs posteriores (NO implementado en esta ronda — fuera de scope)

- Ninguno — los 6 hallazgos de esta ronda se resolvieron íntegramente dentro de PR2 (no requieren wiring NestJS ni cambios de schema).

### Evidencia real (backend/, corrida serial FOREGROUND, 2026-07-30, contra el estado exacto commiteado)

**`corepack pnpm test`**:
```
Test Files  166 passed | 1 skipped (167)
     Tests  2226 passed | 2 skipped (2228)
  Duration  172.86s
```
(vs. baseline PR2 — 2199 passed — +27 tests netos de esta ronda: 3 de `InfraConfigError` en el resolver, 3 de merge por valor no por presencia de fila, 8 de `equals()`/`toString()` en el VO, 4 de cliente inactivo/inexistente [2 tests reales + variantes], 7 de fila corrupta + rango de puerto. Sin regresiones. El log `ERROR [AesGcmSecretCipher] decrypt() falló: ...` es esperado — pertenece a un test de PR1 que fuerza tampering del `authTag`, no un fallo real.)

**`corepack pnpm lint`**: primera corrida detectó 3 errores `prettier/prettier` (formato) en `config-resolver.adapter.ts` — corregidos con `eslint --fix` (solo reformateo, sin cambios de lógica). Corrida final:
```
$ eslint "src/**/*.ts"
EXIT_CODE=0
```
(sin output, exit 0).

**`corepack pnpm exec tsc --noEmit -p tsconfig.json`**: exit 0, sin output.

### Commits

- `fix(configuracion): resolver nunca lanza ante fallo de infra Prisma` (`InfraConfigError` + try/catch en `findTenantRows`/`findGlobalRows`)
- `fix(configuracion): merge tenant->global por valor, no por presencia de fila` (`resolverFilaParaCampo`)
- `feat(shared): equals() y toString() enmascarado en SmtpConfig VO`
- `fix(configuracion): fila corrupta con error distinto de config incompleta + rango de puerto + Promise.all` (`ConfigFilaCorruptaError`, `isValidPort`, resolución paralela)
- `test(configuracion): cobertura de cliente inactivo/inexistente en el resolver`
- `docs(configuracion): documentar desviacion D5 y fixes Judgment Day PR2 Ronda 1` (STATE.md)

Sin push, sin PR — branch `runtime-config-table-pr2` gateado por el usuario, igual que Apply Progress PR2.

## Apply Progress — PR3 (Audit inmutable — R5)

Branch: `runtime-config-table-pr3` (encadenada sobre `runtime-config-table-pr2`, ya aprobado). Sin push, sin PR — gateado por el usuario.

### Tasks (13/13 — PR3 completo)

- [x] 3.1 `configuracion/domain/mask-secret.ts` (`maskIfSecret`, `SECRET_MASK`)
- [x] 3.2 RED/GREEN: `AuditEntry.create()` — entidad plana, `id`+`createdAt`, SIN `updatedAt`/`deletedAt` (Dz8)
- [x] 3.3 GREEN: `configuracion/domain/entities/audit-entry.entity.ts`
- [x] 3.4 `configuracion/domain/events/configuracion-cambiada.event.ts` (`ConfiguracionCambiada`, `ConfigScope`, `CONFIGURACION_CAMBIADA`)
- [x] 3.5 `configuracion/domain/ports/i-audit-log.port.ts` (`AuditLogPort`, `AUDIT_LOG`, `AuditError`)
- [x] 3.6 RED: `AuditConfiguracionHandler` persiste `AuditEntry` vía `AuditLogPort.record()`
- [x] 3.7 RED: `AuditLogPort.record()` falla ⇒ outcome `failed` tipado, NO propaga ni revierte
- [x] 3.8 GREEN: `configuracion/application/event-handlers/audit-configuracion.handler.ts`
- [x] 3.9 RED: `AuditConfiguracionListener` (`@OnEvent`) delega, try/catch de última red
- [x] 3.10 GREEN: `configuracion/infrastructure/events/audit-configuracion.listener.ts`
- [x] 3.11 RED: `PrismaAuditLog.record()` — scope dual (tenant/global)
- [x] 3.12 GREEN: `configuracion/infrastructure/persistence/prisma/audit-log.adapter.ts`
- [x] 3.13 Verify: ver evidencia real abajo

### Archivos nuevos

| Archivo | Qué hace |
|---|---|
| `backend/src/configuracion/domain/mask-secret.ts` | `maskIfSecret(valor, esSecreto)` + `SECRET_MASK='********'` — única fuente de verdad del enmascarado dentro de `configuracion/` (design §5.1). Usado por el write use case (PR4, aún no implementado) al construir el evento y por `AuditConfiguracionHandler` de forma indirecta (recibe el valor ya enmascarado). |
| `backend/src/configuracion/domain/mask-secret.spec.ts` | Unit — enmascara si `esSecreto`, preserva `null`, nunca retorna/contiene el plaintext, pasa igual si no-secreto. |
| `backend/src/configuracion/domain/entities/audit-entry.entity.ts` | `AuditEntry` — entidad plana inmutable (Dz8, NO extiende `BaseEntity`): `id`(uuidv7)+`props`+`createdAt`, sin `updatedAt`/`deletedAt`. `create(props, id?)` genera id nuevo o acepta uno explícito (reconstitución). |
| `backend/src/configuracion/domain/entities/audit-entry.entity.spec.ts` | Unit — construcción, id generado vs explícito, `createdAt=now()`, `valorAnterior` null, ausencia de `updatedAt`/`deletedAt` (verificado por `Object.keys`, sin casts). |
| `backend/src/configuracion/domain/events/configuracion-cambiada.event.ts` | `ConfiguracionCambiada` (`DomainEvent`) + `ConfigScope` (`tenant`\|`global`) + token `CONFIGURACION_CAMBIADA='configuracion.cambiada'`. Transporta `valorAnterior`/`valorNuevo` YA enmascarados si `esSecreto` (Dz7) — la clase NO enmascara, solo transporta. |
| `backend/src/configuracion/domain/events/configuracion-cambiada.event.spec.ts` | Unit — forma del evento, scope tenant/global, `esSecreto=true` con valores enmascarados, `valorAnterior` null. |
| `backend/src/configuracion/domain/ports/i-audit-log.port.ts` | Puerto `AuditLogPort.record(entry, scope)` + token `AUDIT_LOG` + `AuditError` (`code='AUDIT_WRITE_FAILED'`). |
| `backend/src/configuracion/application/event-handlers/audit-configuracion.handler.ts` | `AuditConfiguracionHandler` (application, PURO — sin decorators NestJS, mismo patrón que `NotificarCambioEstadoHandler`): construye `AuditEntry` desde el evento y llama `AuditLogPort.record()`. NUNCA lanza — retorna `AuditConfiguracionOutcome` (`recorded`\|`failed`). Exporta `ACCION_CONFIG_ACTUALIZADA='config.actualizada'`. |
| `backend/src/configuracion/application/event-handlers/audit-configuracion.handler.spec.ts` | Unit — persiste con los datos del evento, valores ya enmascarados pasan intactos, fallo de `record()` ⇒ outcome `failed` con `codigo`/`categoria`/`clave`, nunca lanza. |
| `backend/src/configuracion/infrastructure/events/audit-configuracion.listener.ts` | `AuditConfiguracionListener` (`@Injectable()` `@OnEvent(CONFIGURACION_CAMBIADA)`) — delega en el handler, decide el nivel de log según el outcome (`recorded`⇒silencio, `failed`⇒`logger.error` con categoria/clave/codigo/motivo, NUNCA con `valorAnterior`/`valorNuevo`), try/catch de última red (mismo patrón que `notificar-cambio-estado.listener.ts`). |
| `backend/src/configuracion/infrastructure/events/audit-configuracion.listener.spec.ts` | Unit — delega con el evento, silencio en `recorded`, `logger.error` en `failed` sin exponer valores, nunca propaga (ni en fallo del handler ni en outcome `failed`), última red ante rechazo inesperado de `handle()`. |
| `backend/src/configuracion/infrastructure/persistence/prisma/audit-log.adapter.ts` | `PrismaAuditLog implements AuditLogPort` — `scope.kind==='tenant'` ⇒ `getTenantClient(dbName).auditEntry.create`; `'global'` ⇒ `getMasterClient().auditEntry.create`. Persiste `entry.props` TAL CUAL (nunca transforma/enmascara — esa garantía es aguas arriba). Try/catch de infra ⇒ `Result.fail(AuditError)`, nunca lanza. |
| `backend/src/configuracion/infrastructure/persistence/prisma/audit-log.adapter.spec.ts` | Unit — scope tenant/global cada uno con su cliente correcto y sin tocar el otro, fila secreta persiste el valor enmascarado tal cual llega, fallo de infra en ambos scopes ⇒ `Result.fail(AuditError)`. |

### Archivos modificados

| Archivo | Qué cambió |
|---|---|
| `openspec/changes/runtime-config-table/tasks.md` | Tasks 3.1-3.13 marcadas `[x]`. |

### Cumplimiento del REQUISITO DURO (Judgment Day PR1 Ronda 2, fix #6)

El writer de `audit_entries` (PrismaAuditLog) **nunca enmascara ni descifra** — persiste `entry.props` exactamente como llega. La garantía de que `valorAnterior`/`valorNuevo` jamás contienen el plaintext de un secreto es responsabilidad de la capa que CONSTRUYE el evento (`ActualizarConfigUseCase`, PR4, vía `maskIfSecret()`) — en PR3 esa capa todavía no existe, así que **no hay ningún camino de producción real que escriba en `audit_entries` todavía**. Lo que sí queda construido y verificado en PR3:

1. `maskIfSecret()` — el helper de masking, con tests que verifican que el output NUNCA contiene ni es igual al plaintext de entrada.
2. `AuditEntry`/`AuditConfiguracionHandler`/`AuditConfiguracionListener`/`PrismaAuditLog` — toda la cadena transporta y persiste los valores tal cual los recibe, sin loggear `valorAnterior`/`valorNuevo` en ningún punto (verificado explícitamente en `audit-configuracion.listener.spec.ts`: el mensaje de ERROR de fallo de audit NUNCA contiene `********` ni ningún valor).
3. Cuando PR4 implemente `ActualizarConfigUseCase`, DEBE llamar `maskIfSecret()` antes de construir `ConfiguracionCambiada` — ese es el único punto de la cadena donde el plaintext podría filtrarse, y es EXTERNO al scope de PR3. El Judgment Day de PR4 debe verificar ese punto específico (spy sobre el evento publicado, assert que `esSecreto=true` ⇒ valores `=== '********'`).

### Notas de diseño

- `AuditConfiguracionHandler`/`AuditConfiguracionListener` replican EXACTAMENTE el split D2/D3 de `NotificarCambioEstadoHandler`/`.listener.ts` (change `notif-email-estado-ticket`): el handler es una clase plana de `application/` sin decorators que retorna un outcome tipado y NUNCA lanza; el listener (`infrastructure/`, `@Injectable()`/`@OnEvent`) es el único lugar con `Logger` de `@nestjs/common` y decide qué loguear según el outcome, con try/catch de última red por si el contrato "nunca throw" se rompiera en el futuro.
- `AuditEntry` NO se testea con casts (`as any`/`as unknown as` prohibidos, DoD §9): la verificación de que NO expone `updatedAt`/`deletedAt` usa `Object.keys(entry)` en vez de castear a `Record<string, unknown>`.
- No se creó `ConfiguracionModule` en este PR (wiring NestJS es tarea 4.12, PR4) — mismo criterio que PR2: `AuditConfiguracionHandler`/`AuditConfiguracionListener`/`PrismaAuditLog` se testean directamente por constructor, sin bootstrap de Nest.
- `PrismaAuditLog` pasa `createdAt: entry.createdAt` explícito en el `create()` (en vez de dejar que el `@default(now())` de Postgres lo setee) — mismo criterio que otros mappers cuando el dominio ya calculó el timestamp (consistencia entre el `AuditEntry` en memoria y la fila persistida, sin drift de milisegundos entre `AuditEntry.create()` y el INSERT real).
- `id: entry.id` se pasa explícito en el `create()` (generado por `uuidv7()` en `AuditEntry.create()`) — mismo patrón que `UsuarioMapper.toPersistence()`/`PrismaUsuarioRepository` (el id se genera en el backend antes del INSERT, no se delega al `dbgenerated("gen_random_uuid()")` del schema).

### Evidencia real (backend/, corrida serial FOREGROUND, 2026-07-30, contra el estado exacto commiteado)

**`corepack pnpm test`**:
```
Test Files  172 passed | 1 skipped (173)
     Tests  2256 passed | 2 skipped (2258)
  Duration  176.51s
```
(vs. baseline PR2 Ronda 1 — 2226 passed — +30 tests netos de PR3: 6 de `mask-secret.spec.ts`, 7 de `audit-entry.entity.spec.ts`, 3 de `configuracion-cambiada.event.spec.ts`, 4 de `audit-configuracion.handler.spec.ts`, 5 de `audit-configuracion.listener.spec.ts`, 5 de `audit-log.adapter.spec.ts`. Sin regresiones. El log `ERROR [AesGcmSecretCipher] decrypt() falló: ...` es esperado — pertenece a un test de PR1 que fuerza tampering del `authTag`, no un fallo real.)

**`corepack pnpm lint`**: primera corrida detectó 1 error `@typescript-eslint/no-unused-vars` (`Result` importado sin usar en `audit-configuracion.listener.spec.ts`) — corregido eliminando el import. Corrida final:
```
$ eslint "src/**/*.ts"
EXIT_CODE=0
```
(sin output, exit 0).

**`corepack pnpm exec tsc --noEmit -p tsconfig.json`**: exit 0, sin output.

### Commits

- `feat(configuracion): masking helper y entidad AuditEntry inmutable` (mask-secret.ts + audit-entry.entity.ts + specs)
- `feat(configuracion): evento ConfiguracionCambiada y puerto AuditLogPort` (event + port)
- `feat(configuracion): handler y listener async de auditoria de config` (handler + listener + specs)
- `feat(configuracion): adapter Prisma de audit log con scope dual` (audit-log.adapter.ts + spec)
- `docs(configuracion): marcar tasks PR3 y documentar Apply Progress` (tasks.md + STATE.md)

Sin push, sin PR — branch `runtime-config-table-pr3` gateado por el usuario, encadenada sobre `runtime-config-table-pr2`.

### Cómo retomar

PR3 cerrado y verde. Próximo work unit (Review Workload Guard, `ask-on-risk`): **PR4 — CRUD config: use cases + repos + scope global (F2)** — depende de PR2 (cipher/resolver) y PR3 (evento audit, ya disponible). Al implementar `ActualizarConfigUseCase` en PR4, aplicar `maskIfSecret()` (de `configuracion/domain/mask-secret.ts`, ya disponible desde PR3) ANTES de construir `ConfiguracionCambiada` — es el único punto de la cadena completa donde el plaintext de un secreto podría filtrarse hacia el audit.

## Judgment Day — PR3 — fixes Ronda 1

Fix-agent quirúrgico sobre la capa de audit (branch `runtime-config-table-pr3`, sin push). 6 hallazgos de la ronda de revisión — 1 MEDIUM real (Juez A, el más importante), 2 reales confirmados A+B, 1 MEDIUM (Juez B), 2 LOW (Juez B). Todos resueltos.

### Arreglos aplicados

1. **[MEDIUM real, Juez A — el más importante] Defense-in-depth del masking ausente en el handler.** `AuditConfiguracionHandler.handle()` confiaba ciegamente en que `event.valorAnterior`/`valorNuevo` YA venían enmascarados (garantía del write use case, PR4) — pero `maskIfSecret()` (el guard central, pure e idempotente) no se llamaba en ningún punto de PR3. Un olvido futuro en PR4 habría filtrado el secreto en claro directo a `audit_entries`, sin ninguna red de contención en esta capa. FIX: `handle()` aplica `maskIfSecret(event.valorAnterior, event.esSecreto)` y `maskIfSecret(event.valorNuevo, event.esSecreto)` DEFENSIVAMENTE al construir el `AuditEntryProps` — idempotente, re-enmascarar un valor ya enmascarado es un no-op verificado por `mask-secret.spec.ts`.
   - `backend/src/configuracion/application/event-handlers/audit-configuracion.handler.ts`
   - Tests (+2): evento `esSecreto=true` con plaintext crudo en los valores ⇒ el `AuditEntry` persistido lleva los valores ENMASCARADOS, nunca el plaintext; idempotencia cuando el evento ya viene enmascarado.

2. **[real, confirmado A+B] `AuditEntry` no era realmente inmutable.** `AuditEntryProps` no tenía campos `readonly` y `create()` guardaba el objeto `props` sin clonar — `entry.props.valorNuevo = 'x'` mutaba la entidad en runtime (contradice Dz8 + la regla dura de inmutabilidad del audit-log skill). FIX: todos los campos de `AuditEntryProps` marcados `readonly` (defensa compile-time); `create()` clona (`{ ...props }`) y aplica `Object.freeze()` ANTES de construir la entidad (defensa runtime real) — mutar el objeto original pasado a `create()` ya no afecta la entidad, y mutar `entry.props` (bypaseando `readonly` vía `Object.assign`, sin casts) lanza `TypeError` porque ESM corre siempre en strict mode.
   - `backend/src/configuracion/domain/entities/audit-entry.entity.ts`
   - Tests (+2): `Object.assign(entry.props, {...})` lanza `TypeError` y no muta una re-lectura; mutar el objeto original pasado a `create()` no afecta la entidad ya construida.

3. **[real, confirmado A+B] Dual-scope confiaba en `dbName` crudo del caller.** `ConfigScope` llevaba `dbName` crudo para el scope tenant, y `PrismaAuditLog.record()` lo pasaba directo a `getTenantClient(scope.dbName)` sin validar ni re-resolver — a diferencia del patrón R9 ya establecido en `PrismaConfigResolver` (que re-resuelve `dbName` desde `master.clientes` por `clienteId`). Un evento construido con datos incorrectos podía apuntar a la DB de OTRO tenant. FIX: `ConfigScope` (variante tenant) ahora lleva `clienteId` en vez de `dbName`. `PrismaAuditLog.record()` re-resuelve el `dbName` real desde `master.clientes` (`activo=true`, `deletedAt=null`) por `clienteId` — mismo patrón exacto que `PrismaConfigResolver.findTenantRows()` (`resolveTenantDbName()`, con su propio try/catch para no violar "nunca lanza" ante un `clienteId` no-UUID). `clienteId` inexistente/inactivo/malformado ⇒ `Result.fail(AuditError)` ANTES de tocar `getTenantClient()` — sin cross-DB posible. Como PR4 todavía no emite el evento, cambiar el shape ahora no rompe ningún camino de producción real.
   - `backend/src/configuracion/domain/events/configuracion-cambiada.event.ts` (`ConfigScope.tenant.clienteId`)
   - `backend/src/configuracion/infrastructure/persistence/prisma/audit-log.adapter.ts` (`resolveTenantDbName()`)
   - `backend/src/configuracion/domain/ports/i-audit-log.port.ts` (doc actualizado)
   - Specs actualizados a `clienteId` (dejaron de usar `dbName` crudo en el `ConfigScope` de test): `configuracion-cambiada.event.spec.ts`, `audit-configuracion.handler.spec.ts`, `audit-configuracion.listener.spec.ts`, `audit-log.adapter.spec.ts`.
   - Tests nuevos (+2) en `audit-log.adapter.spec.ts`: scope tenant con `clienteId` válido resuelve `dbName` vía `master.clientes.findFirst` y escribe en la DB correcta; `clienteId` inexistente/inactivo ⇒ `Result.fail`, nunca llama `getTenantClient`; `clienteId` malformado (findFirst rechaza) ⇒ `Result.fail`, nunca lanza.

4. **[MEDIUM, Juez B] `createdAt` no se preservaba al reconstituir.** `AuditEntry.create()` siempre estampaba `new Date()`, sin parámetro para un `createdAt` ya persistido — un futuro mapper de lectura habría reportado "ahora" en vez del timestamp real de la fila. FIX: `create(props, id?, createdAt?)` acepta un `createdAt` OPCIONAL (espejo del `id` opcional) — si no se provee, sigue estampando `new Date()` (alta nueva); si se provee, lo preserva tal cual (reconstitución desde persistencia).
   - `backend/src/configuracion/domain/entities/audit-entry.entity.ts`
   - Test (+1): `create(props, id, createdAt)` preserva el `createdAt` dado, sin pisarlo.

5. **[LOW, Juez B] Tests de borde del masking.** Faltaban casos explícitos de borde en `mask-secret.spec.ts`.
   - `backend/src/configuracion/domain/mask-secret.spec.ts`
   - Tests (+2): `maskIfSecret('', true)` ⇒ enmascarado (un secreto vacío sigue siendo secreto); `maskIfSecret(SECRET_MASK, true)` ⇒ `SECRET_MASK` (idempotencia).

6. **[LOW, Juez B] Documentar la decisión de inmutabilidad a nivel DB.** La inmutabilidad de `audit_entries` es hoy solo convención de aplicación (readonly + `Object.freeze()` del fix #2, más la disciplina de NO llamar `.update()`/`.delete()` sobre `auditEntry` en ningún adapter) — no hay trigger ni regla WORM en Postgres que la haga cumplir a nivel de motor. Documentado acá como decisión explícita: un guard WORM de DB (regla/trigger que rechace `UPDATE`/`DELETE` sobre `audit_entries`) queda como consideración futura, NO bloqueante — implementarlo ahora sería scope/migración fan-out fuera de esta ronda quirúrgica. Sin cambios de código/migración en este fix.

### Obligación forward para PR4 (actualizada)

El **REQUISITO DURO** de "Judgment Day — PR1 — fixes Ronda 2" fix #6 sigue en pie sin cambios: el write use case (`ActualizarConfigUseCase`, PR4) DEBE aplicar `maskIfSecret()` en el ORIGEN antes de construir `ConfiguracionCambiada` — cero excepciones. El fix #1 de esta ronda agrega una red de contención en `AuditConfiguracionHandler` (defense-in-depth, idempotente), pero eso NO reemplaza ni relaja esa obligación: el masking en el origen sigue siendo el contrato primario (evita que el plaintext viaje siquiera por el evento/bus de eventos, no solo que llegue a `audit_entries`). El Judgment Day de PR4 debe seguir verificando explícitamente ese punto (spy sobre el evento publicado, assert `esSecreto=true` ⇒ valores `=== SECRET_MASK`), independientemente de que el handler de PR3 ahora tenga su propia red de seguridad.

También relevante para PR4: `ConfigScope` (variante tenant) ahora requiere `clienteId`, no `dbName` — el write use case debe construir el evento con `{ kind: 'tenant', clienteId }` (el `clienteId` que ya tiene disponible del contexto de request), no con un `dbName` resuelto a mano.

### Diferido a PRs posteriores (NO implementado en esta ronda — fuera de scope)

- **Guard WORM de DB** (trigger/regla que rechace `UPDATE`/`DELETE` sobre `audit_entries`): consideración futura no bloqueante, ver fix #6. Requeriría nueva migración — fan-out fuera del scope quirúrgico de esta ronda.

### Evidencia real (backend/, corrida serial FOREGROUND, 2026-07-30, contra el estado exacto commiteado)

**`corepack pnpm test`**:
```
Test Files  172 passed | 1 skipped (173)
     Tests  2265 passed | 2 skipped (2267)
  Duration  155.89s
```
(vs. baseline Apply Progress PR3 — 2256 passed — +9 tests netos de esta ronda: 2 de defense-in-depth masking en el handler [fix #1], 2 de inmutabilidad real de `AuditEntry` [fix #2], 2 de resolución `clienteId`→`dbName` inválido/malformado en el adapter [fix #3], 1 de `createdAt` preservado al reconstituir [fix #4], 2 de bordes de `maskIfSecret` [fix #5]. Sin regresiones — corrida única, sin necesidad de una segunda pasada. El log `ERROR [AesGcmSecretCipher] decrypt() falló: ...` es esperado — pertenece a un test de PR1 que fuerza tampering del `authTag`, no un fallo real.)

**`corepack pnpm lint`**:
```
$ eslint "src/**/*.ts"
EXIT_CODE=0
```
(sin output, exit 0, sin correcciones necesarias esta ronda).

**`corepack pnpm exec tsc --noEmit -p tsconfig.json`**: exit 0, sin output.

**Revisión fresca (adversarial, sub-agente sin contexto previo)**: 0 CRITICAL, 0 WARNING, 0 SUGGESTION. Verificó explícitamente: `getTenantClient()` nunca se alcanza antes de resolver `clienteId` con éxito (los 3 caminos — válido, inexistente, malformado — trazados); el filtro `activo=true, deletedAt=null` es idéntico byte a byte al de `PrismaConfigResolver.findTenantRows()`; `Object.freeze` se aplica al clon, nunca al objeto original; cero referencias residuales a `dbName` crudo en `ConfigScope` en todo `backend/src`; cero `as any`/`as unknown as`; cero interpolación de errores crudos de driver o de secretos en logs; capa `domain/` sigue libre de imports de NestJS/Prisma.

### Commits

- `test(configuracion): bordes de maskIfSecret — secreto vacio e idempotencia` (mask-secret.spec.ts — fix #5)
- `fix(configuracion): AuditEntry inmutable con readonly+freeze y createdAt opcional en reconstitucion` (audit-entry.entity.ts + spec — fixes #2 y #4, mismo archivo)
- `fix(configuracion): ConfigScope tenant lleva clienteId, PrismaAuditLog re-resuelve dbName (R9), defense-in-depth de maskIfSecret en el handler` (configuracion-cambiada.event.ts + spec, i-audit-log.port.ts, audit-log.adapter.ts + spec, audit-configuracion.listener.spec.ts, audit-configuracion.handler.ts + spec — fixes #1 y #3, agrupados porque el rename de `ConfigScope` obliga a tocar el fixture de `handler.spec.ts` en el mismo commit para que compile)
- `docs(configuracion): documentar decision de inmutabilidad a nivel app y fixes Judgment Day PR3 Ronda 1` (STATE.md — fix #6)

Sin push, sin PR — branch `runtime-config-table-pr3` gateado por el usuario, igual que Apply Progress PR3.

## Apply Progress — PR4 (CRUD config: use cases + repos + scope global F2 — R3, R5, R8)

Branch: `runtime-config-table-pr4` (encadenada sobre `runtime-config-table-pr3`, ya aprobado). Sin push, sin PR — gateado por el usuario. Cablea la cadena COMPLETA de PR1-PR4 por primera vez vía `ConfiguracionModule`.

### Tasks (13/13 — PR4 completo)

- [x] 4.1 `configuracion/domain/ports/i-configuracion-repository.ts` (`IConfiguracionRepository`, `ConfiguracionRow`, `UpsertConfiguracionInput`, `CONFIGURACION_REPOSITORY`)
- [x] 4.2/4.3 RED: `LeerConfigUseCase` — esSecreto ⇒ `'********'`; no-secreta ⇒ real; NUNCA descifra (auditoría estructural de imports)
- [x] 4.4 GREEN: `configuracion/application/use-cases/leer-config.use-case.ts`
- [x] 4.5/4.6 RED: `ActualizarConfigUseCase` — update no-secreto ⇒ evento real; update secreto ⇒ cifra + evento enmascarado (Dz7)
- [x] 4.7 RED: `categoria !== 'smtp'` rechazada (R8)
- [x] 4.8 RED: F2 — `scope=global` sin `is_global_admin` rechazado ANTES de persistir; `scope=tenant` con permiso permitido
- [x] 4.9 GREEN: `configuracion/application/use-cases/actualizar-config.use-case.ts`
- [x] 4.10 GREEN: `configuracion/infrastructure/persistence/prisma/configuracion-repository.adapter.ts` (scope dual R9, `findFirst` NUNCA `findUnique` Dz9)
- [x] 4.11 RED integración: 2 filas activas misma `(categoria,clave)` ⇒ conflicto DB (P2002, partial unique index)
- [x] 4.12 `configuracion/configuracion.module.ts` — NO `@Global()` (Dz12), activa la cadena PR1-PR4 por primera vez
- [x] 4.13 Verify: ver evidencia real abajo

### Archivos nuevos

| Archivo | Qué hace |
|---|---|
| `backend/src/configuracion/domain/ports/i-configuracion-repository.ts` | Puerto `IConfiguracionRepository` (`findAll`/`findByClave`/`upsert`) + `ConfiguracionRow`/`UpsertConfiguracionInput` + token `CONFIGURACION_REPOSITORY`. Reusa `ConfigScope` de `configuracion-cambiada.event.ts` (mismo shape que `AuditLogPort` — R9, `clienteId` no `dbName` crudo). |
| `backend/src/configuracion/application/use-cases/leer-config.use-case.ts` | `LeerConfigUseCase` — NO importa `ISecretCipher` en absoluto (garantía estructural R3: nunca puede descifrar). Enmascara vía `maskIfSecret()`. |
| `backend/src/configuracion/application/use-cases/leer-config.use-case.spec.ts` | Unit — R3 escenarios 1-2, múltiples filas mixtas, propagación de `categoria`/fallo de infra, auditoría estructural de imports (filtra comentarios para no auto-matchear la prosa que documenta la garantía). |
| `backend/src/configuracion/application/use-cases/actualizar-config.use-case.ts` | `ActualizarConfigUseCase` — orden de validación: R8 (categoria) → F2 (scope global) → lee fila previa (enmascarada si esSecreto, nunca descifrada) → cifra si esSecreto → `repo.upsert()` → publica `ConfiguracionCambiada` YA enmascarado (Dz7/REQUISITO DURO) → `publish()` post-commit en try/catch log-and-swallow (mismo patrón que `TransicionarEstadoUseCase`). |
| `backend/src/configuracion/application/use-cases/actualizar-config.use-case.spec.ts` | Unit — R5 escenarios 1-2 (incl. assert `JSON.stringify(event)` sin el cleartext), R8, F2 (3 variantes), `valorAnterior=null` sin fila previa, fallos de `encrypt`/`findByClave`/`upsert`, `publish()` que lanza (log-and-swallow). |
| `backend/src/configuracion/infrastructure/persistence/prisma/configuracion-repository.adapter.ts` | `PrismaConfiguracionRepository` — scope dual (tenant re-resuelve `dbName` por `clienteId` vía `master.clientes`, igual que `PrismaConfigResolver`/`PrismaAuditLog`; global vía `getMasterClient()`). `findFirst` NUNCA `findUnique` (Dz9) — `upsert()` NO usa `.upsert()` nativo de Prisma (no hay `where` unique para el partial index) sino `findFirst`+`create`/`update` manual. |
| `backend/src/configuracion/infrastructure/persistence/prisma/configuracion-repository.adapter.spec.ts` | Unit — routing tenant/global, `findFirst` (nunca `findUnique`), create-vs-update en `upsert`, fallos de infra ⇒ `Result.fail`, `clienteId` inexistente/inactivo. |
| `backend/src/configuracion/infrastructure/persistence/prisma/configuracion-repository.adapter.integration.spec.ts` | Integración (4.11) — inserta 2 filas activas misma `(categoria,clave)` directo vía Prisma (bypass del repo) ⇒ P2002; soft-delete + nueva fila activa coexisten (índice parcial); categorías distintas con misma clave sin conflicto. DB real `soporte_master_test`. |
| `backend/src/configuracion/configuracion.module.ts` | `ConfiguracionModule` — NO `@Global()` (Dz12). Wirea `CONFIG_RESOLVER` (PrismaConfigResolver, PR2), `CONFIGURACION_REPOSITORY` (PrismaConfiguracionRepository), `AUDIT_LOG` (PrismaAuditLog, PR3) + `AuditConfiguracionHandler`/`Listener`, y los 2 use cases de PR4. `exports: [CONFIG_RESOLVER]` únicamente. |
| `backend/src/configuracion/configuracion.module.spec.ts` | Bootstrap/wiring regression guard (mismo patrón que `tickets.module.wiring.spec.ts`) — resuelve toda la cadena PR1-PR4 por DI real; confirma que NO es `@Global()` (un módulo que no lo importa no puede resolver `CONFIG_RESOLVER`). |

### Archivos modificados

| Archivo | Qué cambió |
|---|---|
| `backend/src/configuracion/domain/errors/config.errors.ts` | + `CategoriaNoSoportadaError` (`CONFIG_CATEGORIA_NO_SOPORTADA`, R8), `ScopeGlobalNoAutorizadoError` (`CONFIG_SCOPE_GLOBAL_NO_AUTORIZADO`, F2) |
| `openspec/changes/runtime-config-table/tasks.md` | Tasks 4.1-4.13 marcadas `[x]` |

### Cumplimiento de las OBLIGACIONES FORWARD (Judgment Day PR3)

1. **Enmascarado en ORIGEN**: `ActualizarConfigUseCase` llama `maskIfSecret()` (de `configuracion/domain/mask-secret.ts`, PR3) ANTES de construir `ConfiguracionCambiada` para AMBOS `valorAnterior` y `valorNuevo` — el cleartext del secreto nunca entra al evento. Verificado explícitamente en el spec: `expect(JSON.stringify(event)).not.toContain('super-secreto-en-claro')`. `AuditConfiguracionHandler` (PR3) sigue re-aplicando el guard como defense-in-depth idempotente — ambas redes activas.
2. **`ConfigScope` con `clienteId`, no `dbName`**: `ActualizarConfigUseCase` construye el evento con el `scope: ConfigScope` recibido del DTO (que para tenant lleva `clienteId`, tipado por el propio `ConfigScope` de PR3 — imposible pasar `dbName` por construcción, TypeScript lo rechaza). `PrismaConfiguracionRepository`/`PrismaAuditLog` re-resuelven el `dbName` real independientemente (R9).

### Decisión de diseño: F2 resuelto en el use case, no en un guard

`ActualizarConfigDto` incluye `actorEsGlobalAdmin: boolean` — **desviación documentada** respecto a la firma literal de `design.md` §3.2 (que no lista este campo). PR4 no cablea el controller (eso es PR5) y el use case debe poder enforzar F2 de forma autónoma y testeable ANTES de que exista ningún guard HTTP. Sigue el precedente `auth-access/SKILL.md` ("Pass UserIdentity to use cases as a parameter — never trust the token alone dentro de application/"): el use case NO decodifica JWT ni consulta DB — recibe el claim `is_global_admin` ya resuelto del caller. Cuando PR5 cablee `ConfiguracionController`, deberá resolver `actorEsGlobalAdmin` desde `@CurrentUser() user: JwtPayload` (`user.is_global_admin`, mismo campo que lee `AdminOrGlobalGuard`) y pasarlo al DTO — el enforcement real YA existe y está testeado en PR4; PR5 solo necesita conectar el JWT al parámetro.

### Notas de diseño

- `IConfiguracionRepository.upsert()` NO usa `.upsert()` nativo de Prisma: la unicidad `(categoria, clave)` es un partial unique index raw SQL (Dz9, PR1) sin `@@unique` en el schema — no hay `where` unique disponible. El adapter resuelve existencia vía `findFirst` (nunca `findUnique`) y decide `create`/`update` manualmente, igual en ambos scopes.
- `LeerConfigUseCase` no depende de `ISecretCipher` en absoluto (ni el constructor lo acepta) — la garantía de "nunca descifra para leer" es estructural (imposible de romper por accidente), no solo conductual. El test de auditoría de imports filtra líneas de comentario (`*`/`//`) antes de aplicar los regex, para no auto-matchear la prosa que documenta esa misma garantía.
- `ActualizarConfigUseCase` NO recibe `ILogger`/`IDomainEventPublisher` como opcionales — el `publish()` post-commit sigue el mismo patrón log-and-swallow que `TransicionarEstadoUseCase`/`CrearObservacionUseCase` (Judgment Day de `notif-email-estado-ticket`): la fila ya está persistida antes de publicar, así que un fallo del publisher NUNCA debe tumbar una respuesta que ya debería ser éxito.
- `ConfiguracionModule.exports` solo incluye `CONFIG_RESOLVER` — `SECRET_CIPHER` NO se re-exporta porque ya es `@Global()` desde `SharedModule` (mismo criterio que `TicketsModule`, que tampoco re-exporta `PrismaService`/`LOGGER`/`DOMAIN_EVENT_PUBLISHER` pese a consumirlos). Documentado como desviación de la letra literal de Dz12 en el docblock del propio módulo.
- El test de wiring (`configuracion.module.spec.ts`) confirma la ausencia de `@Global()` de forma POSITIVA: bootstrapea un módulo vacío que NO importa `ConfiguracionModule` y verifica que `moduleRef.get(CONFIG_RESOLVER)` lanza — sin este test, un `@Global()` agregado por error no lo atraparía ningún otro test existente.

### Evidencia real (backend/, corrida serial FOREGROUND, 2026-07-31, contra el estado exacto commiteado)

**`corepack pnpm test`** (corrida final, tras corregir 1 falla propia — ver nota abajo):
```
Test Files  177 passed | 1 skipped (178)
     Tests  2304 passed | 2 skipped (2306)
  Duration  157.74s
```
(vs. baseline PR3 Ronda 1 — 2265 passed — +39 tests netos de PR4: 5 `leer-config.use-case.spec.ts`, 11 `actualizar-config.use-case.spec.ts`, 14 `configuracion-repository.adapter.spec.ts`, 3 `configuracion-repository.adapter.integration.spec.ts`, 2 `configuracion.module.spec.ts`, resto de variaciones. Sin regresiones. El log `ERROR [AesGcmSecretCipher] decrypt() falló: ...` es esperado — pertenece a un test de PR1 que fuerza tampering del `authTag`, no un fallo real.)

**Nota honesta**: la primera corrida de `pnpm test` tuvo 1 falla propia — el test estructural de `leer-config.use-case.spec.ts` (tarea 4.3) usaba un regex ingenuo (`/ISecretCipher/`) que matcheaba la propia prosa del docblock del archivo fuente (que EXPLICA la garantía de "nunca importa ISecretCipher" usando esas palabras). Corregido filtrando líneas de comentario antes de aplicar los regex — la auditoría ahora es sobre CÓDIGO real (imports/llamadas), no sobre texto libre. Re-corrida limpia, evidencia de arriba.

**`corepack pnpm lint`**: primera corrida detectó 15 errores (14 `prettier/prettier` + 1 `@typescript-eslint/no-unused-vars`: `IConfigResolver` importado sin usar en `configuracion.module.ts`, quedó solo el token `CONFIG_RESOLVER`). Corregidos con `eslint --fix` (formato) + edición manual (import no usado). Corrida final:
```
$ eslint "src/**/*.ts"
EXIT_CODE=0
```

**`corepack pnpm exec tsc --noEmit -p tsconfig.json`**: exit 0, sin output.

### Commits

- `feat(configuracion): errores y puerto del repositorio CRUD (R8, F2)` (config.errors.ts + i-configuracion-repository.ts)
- `feat(configuracion): use cases de lectura y actualizacion de config (R3, R5, R8, F2)` (leer-config/actualizar-config use cases + specs)
- `feat(configuracion): adapter Prisma del repositorio CRUD con scope dual (Dz9, R9)` (configuracion-repository.adapter.ts + specs unit/integration)
- `feat(configuracion): ConfiguracionModule cablea la cadena PR1-PR4 (Dz12)` (configuracion.module.ts + spec de wiring)
- `docs(configuracion): marcar tasks PR4 y documentar Apply Progress` (tasks.md + STATE.md)

Sin push, sin PR — branch `runtime-config-table-pr4` gateado por el usuario, encadenada sobre `runtime-config-table-pr3`.

### Cómo retomar

PR4 cerrado y verde — la cadena completa PR1-PR4 está cableada y activa por primera vez vía `ConfiguracionModule` (bootstrap real verificado). Próximo work unit (Review Workload Guard, `ask-on-risk`): **PR5 — API de gestión** (`ConfiguracionController` + DTOs + RBAC + wiring en `app.module.ts`). Al implementar el controller, resolver `actorEsGlobalAdmin` desde `@CurrentUser() user: JwtPayload` (`user.is_global_admin`) y pasarlo al DTO de `ActualizarConfigUseCase` — el enforcement de F2 YA existe y está testeado, PR5 solo conecta el JWT. Recordar también wirear `ConfiguracionModule` en `app.module.ts` (no lo hace este PR4, solo lo define).

## Judgment Day — PR4 — fixes Ronda 1

Fix-agent quirúrgico sobre la capa CRUD de config (branch `runtime-config-table-pr4`, sin push). 5 hallazgos de la ronda de revisión — 2 CRITICAL (confirmado A+B / Juez A), 1 HIGH (Juez A), 1 MEDIUM (A+B), 1 LOW agrupado. Todos resueltos. Auditoría de seguridad/aislamiento de tenant — máximo cuidado, sin atajos.

### Diseño del fix: identidad del actor

Grep confirmado sobre `backend/src/auth/domain` (2026-07-31): NO existe un VO `UserIdentity`/actor reusable — las entidades ahí (`usuario.entity.ts`, `role.entity.ts`, `permiso.entity.ts`) modelan persistencia RBAC, no un contrato de identidad para cruzar el boundary de un use case. Se definió `ActorContext { clienteId: string | null; esGlobalAdmin: boolean }` nuevo en `configuracion/domain/actor-context.ts` (auth-access skill regla 4: "Pass UserIdentity to use cases as a parameter", nunca un boolean suelto). Reemplaza el `actorEsGlobalAdmin: boolean` que tenía `ActualizarConfigDto` desde Apply Progress PR4, y se agrega (nuevo) al DTO de `LeerConfigUseCase`, que antes no recibía ninguna identidad de actor.

**REQUISITO DURO para PR5 (documentado en el propio `ActorContext` y acá)**: `actor.clienteId`/`actor.esGlobalAdmin` DEBEN resolverse EXCLUSIVAMENTE del JWT verificado (`req.user`/`@CurrentUser()`, claim `is_global_admin`) — NUNCA del body/query de la request. Un actor que pudiera setear su propio `ActorContext` desde el payload podría impersonar a un global-admin o reclamar el tenant de otro cliente.

### Arreglos aplicados

1. **[CRITICAL, confirmado A+B] Ownership de tenant ausente (write + read).** Antes de esta ronda, los use cases delegaban TODO el límite de tenant a un controller (PR5) inexistente — el único gate era F2 (`scope=global` sin `is_global_admin`). Un actor de scope `tenant` podía pasar `scope.clienteId` de OTRO tenant y el use case lo aceptaba sin más: leía/escribía la config de cualquier tenant ajeno. FIX: en AMBOS use cases, ANTES de tocar el repositorio — `scope.kind==='global'` requiere `actor.esGlobalAdmin` (`ScopeGlobalNoAutorizadoError`, ya existía); `scope.kind==='tenant'` requiere `actor.esGlobalAdmin` **O** `scope.clienteId === actor.clienteId` (nuevo `ScopeTenantNoAutorizadoError`, `code='CONFIG_SCOPE_TENANT_NO_AUTORIZADO'`). Vale para LEER y ACTUALIZAR por igual.
   - `backend/src/configuracion/domain/errors/config.errors.ts` (+`ScopeTenantNoAutorizadoError`)
   - `backend/src/configuracion/domain/actor-context.ts` (nuevo)
   - `backend/src/configuracion/application/use-cases/leer-config.use-case.ts` (+`actor: ActorContext` en el DTO, +gate de autorización)
   - `backend/src/configuracion/application/use-cases/actualizar-config.use-case.ts` (`actorEsGlobalAdmin` → `actor: ActorContext`, +gate de ownership)
   - Tests (+10 entre ambos specs): (a) actor de tenant leyendo/escribiendo su propio tenant ⇒ ok; (b) actor de tenant con `scope.clienteId` de OTRO tenant ⇒ rechazado ANTES de persistir/leer (`findAll`/`findByClave`/`upsert` NUNCA llamados); (c) global-admin ⇒ puede cualquier tenant + global, en lectura y escritura.

2. **[CRITICAL, Juez A] Fail-open a global por `scope.kind` no validado.** Los adapters (`configuracion-repository.adapter.ts` Y `audit-log.adapter.ts`, confirmado en ambos) usaban `if (kind==='tenant') {...} else {...master/global...}` — CUALQUIER `kind` no-`'tenant'` (malformado, tampereado, o un valor futuro no contemplado) caía en la rama `else` y operaba sobre MASTER/GLOBAL por default. El gate del use case (antes de esta ronda) solo chequeaba `===  'global'` explícito, sin rechazar otros valores. FIX: nuevo `InvalidScopeError` (`code='CONFIG_SCOPE_INVALIDO'`) + guard runtime `esScopeKindValido()` (`configuracion/domain/validar-scope.ts`) invocado en AMBOS use cases ANTES de autorizar/tocar el repositorio (fail-closed). En los DOS adapters, el `if/else` se reemplazó por un `switch (scope.kind)` EXHAUSTIVO (`'tenant'`/`'global'`) con rama `default` que rechaza explícitamente (`Result.fail`, nunca opera sobre master/global) — defensa en profundidad, por si algún caller futuro invoca el adapter sin pasar por el use case.
   - `backend/src/configuracion/domain/errors/config.errors.ts` (+`InvalidScopeError`)
   - `backend/src/configuracion/domain/validar-scope.ts` (nuevo, `esScopeKindValido()`)
   - `backend/src/configuracion/application/use-cases/leer-config.use-case.ts` / `actualizar-config.use-case.ts` (guard de scope.kind como paso 1)
   - `backend/src/configuracion/infrastructure/persistence/prisma/configuracion-repository.adapter.ts` (`findAll`/`findByClave`/`upsert` → `switch`/`default`)
   - `backend/src/configuracion/infrastructure/persistence/prisma/audit-log.adapter.ts` (`record()` → `switch`/`default`)
   - Tests (+9): un `scope.kind` inválido/malformado (construido vía `JSON.parse` — sin `as any`/`as unknown as`, prohibidos en este proyecto — para simular el cruce de boundary en runtime) es rechazado en ambos use cases y en los 4 métodos de adapter (`findAll`, `findByClave`, `upsert`, `record`) — jamás escribe/lee en global/master.

3. **[HIGH, Juez A] Round-trip del placeholder enmascarado corrompía el secreto.** `LeerConfigUseCase` SIEMPRE devuelve `SECRET_MASK` (`'********'`) para filas `esSecreto=true` (R3) — un frontend que lea, muestre y reenvíe el formulario sin tocar ese campo reenviaría literalmente el placeholder. `ActualizarConfigUseCase` lo cifraba y persistía como si fuera el secreto real, sobrescribiendo silenciosamente el password/API-key legítimo con un valor irrecuperable (la fila vieja ya está pisada). FIX: nuevo `ValorEnmascaradoNoPermitidoError` (`code='CONFIG_VALOR_ENMASCARADO_NO_PERMITIDO'`) — se rechaza cuando `dto.esSecreto && dto.valor === SECRET_MASK`, ANTES de leer la fila existente, cifrar o persistir.
   - `backend/src/configuracion/domain/errors/config.errors.ts` (+`ValorEnmascaradoNoPermitidoError`)
   - `backend/src/configuracion/application/use-cases/actualizar-config.use-case.ts`
   - Tests (+2): update de secreto con valor `'********'` ⇒ rechazado, `encrypt()`/`findByClave()`/`upsert()` NUNCA llamados; update NO-secreto con el mismo literal ⇒ permitido (el guard es específico de `esSecreto`, no del string en sí).

4. **[MEDIUM, A+B] TOCTOU en `upsert()`.** La ventana entre `findFirst` (resolución de existencia) y `create`/`update` no es atómica (Dz9 — no hay `.upsert()` nativo posible sobre el partial unique index) — una escritura concurrente para la misma `(categoria, clave)` del mismo scope podía violar el índice y Prisma lo reportaba `P2002`, mapeado al mismo `InfraConfigError` genérico que cualquier otro fallo de infra (timeout, conexión caída) — un caller no podía distinguir "reintentá, fue una carrera" de "la infra está caída". FIX: nuevo `ConfigConflictoConcurrenteError` (`code='CONFIG_CONFLICTO_CONCURRENTE'`), `IConfiguracionRepository.upsert()` ampliado a `Result<ConfiguracionRow, InfraConfigError | ConfigConflictoConcurrenteError>`. El adapter detecta `P2002` vía duck-typing sobre `err.code` (mismo patrón `isPrismaUniqueConstraintError` que `equipos/application/use-cases/crear-equipo.use-case.ts`) y lo mapea al error distinguible, en ambos scopes (tenant y global). No se envolvió en `$transaction` (la ventana sigue existiendo entre `findFirst` y `create`/`update` — el fix es la DETECCIÓN correcta del conflicto vía el índice de DB, no su eliminación; envolver en transacción no cierra la ventana porque el conflicto lo detecta el índice, no un lock explícito, y forzar un lock pesimista sobre esta tabla de config sería over-engineering fuera del scope quirúrgico de esta ronda).
   - `backend/src/configuracion/domain/errors/config.errors.ts` (+`ConfigConflictoConcurrenteError`)
   - `backend/src/configuracion/domain/ports/i-configuracion-repository.ts` (`upsert()` error union ampliado)
   - `backend/src/configuracion/infrastructure/persistence/prisma/configuracion-repository.adapter.ts`
   - Tests (+3): `P2002` en scope global y en scope tenant ⇒ `ConfigConflictoConcurrenteError`; un error de infra SIN `code='P2002'` sigue mapeando a `InfraConfigError` genérico (no se mezclan).

5. **[LOW] Orden de validación + module spec.**
   - Orden final en AMBOS use cases (patrón authenticate→authorize→business del auth-access skill): validar `scope.kind` → autorizar (global→`isGlobalAdmin`; tenant→ownership) → R8 whitelist (solo en `ActualizarConfigUseCase`) → guard del placeholder (solo update) → cifrar/persistir → publicar evento. Sin cambio de comportamiento observable (ninguna de las validaciones tenía efectos secundarios), solo consistencia con el patrón del skill.
   - `configuracion.module.spec.ts`: el test Dz12 ("NO es `@Global()`") ahora asserta también que `CONFIGURACION_REPOSITORY`, `AUDIT_LOG`, `LeerConfigUseCase` y `ActualizarConfigUseCase` NO están disponibles en un árbol que no importa el módulo — antes de esta ronda solo se verificaba `CONFIG_RESOLVER`; un `@Global()` agregado por error, o un provider agregado sin pasar por `exports`, no lo habría atrapado ningún otro test para los 4 providers restantes.
   - `backend/src/configuracion/application/use-cases/leer-config.use-case.ts` / `actualizar-config.use-case.ts` (reorden + docblocks actualizados)
   - `backend/src/configuracion/configuracion.module.spec.ts` (+4 asserts en el test Dz12 existente, sin test nuevo)

### Archivos nuevos

| Archivo | Qué hace |
|---|---|
| `backend/src/configuracion/domain/actor-context.ts` | `ActorContext { clienteId: string \| null; esGlobalAdmin: boolean }` — identidad de autorización mínima que ambos use cases reciben en su DTO. Documenta el REQUISITO DURO para PR5 (resolver EXCLUSIVAMENTE del JWT verificado). |
| `backend/src/configuracion/domain/validar-scope.ts` | `esScopeKindValido(kind): kind is ConfigScope['kind']` — guard runtime que cierra el hueco de `scope.kind` malformado cruzando el boundary de use case (arreglo 2). |

### Archivos modificados

| Archivo | Qué cambió |
|---|---|
| `backend/src/configuracion/domain/errors/config.errors.ts` | +`ScopeTenantNoAutorizadoError`, +`InvalidScopeError`, +`ValorEnmascaradoNoPermitidoError`, +`ConfigConflictoConcurrenteError` |
| `backend/src/configuracion/domain/ports/i-configuracion-repository.ts` | `upsert()` error union: `InfraConfigError` → `InfraConfigError \| ConfigConflictoConcurrenteError` |
| `backend/src/configuracion/application/use-cases/leer-config.use-case.ts` | +`actor: ActorContext` en `LeerConfigDto`, +gate de `scope.kind` + ownership de tenant/F2, `LeerConfigError` ampliado |
| `backend/src/configuracion/application/use-cases/actualizar-config.use-case.ts` | `actorEsGlobalAdmin: boolean` → `actor: ActorContext`, +gate de `scope.kind` + ownership de tenant, +guard del placeholder enmascarado, reorden de validaciones, `ActualizarConfigError` ampliado |
| `backend/src/configuracion/infrastructure/persistence/prisma/configuracion-repository.adapter.ts` | `findAll`/`findByClave`/`upsert`: `if/else` → `switch`/`default` fail-closed; `upsert` detecta `P2002` → `ConfigConflictoConcurrenteError` |
| `backend/src/configuracion/infrastructure/persistence/prisma/audit-log.adapter.ts` | `record()`: `if/else` → `switch`/`default` fail-closed |
| `backend/src/configuracion/configuracion.module.spec.ts` | Test Dz12 ampliado con 4 asserts adicionales |
| `backend/src/configuracion/application/use-cases/leer-config.use-case.spec.ts` | Actor en todos los DTOs de test, +7 tests (ownership + scope inválido) |
| `backend/src/configuracion/application/use-cases/actualizar-config.use-case.spec.ts` | Actor en todos los DTOs de test, +8 tests (ownership + scope inválido + placeholder) |
| `backend/src/configuracion/infrastructure/persistence/prisma/configuracion-repository.adapter.spec.ts` | +6 tests (P2002 en ambos scopes + no-P2002 sigue genérico + scope inválido en 3 métodos) |
| `backend/src/configuracion/infrastructure/persistence/prisma/audit-log.adapter.spec.ts` | +1 test (scope inválido) |

### Evidencia real (backend/, corrida serial FOREGROUND, 2026-07-31)

**`corepack pnpm test`**:
```
Test Files  177 passed | 1 skipped (178)
     Tests  2324 passed | 2 skipped (2326)
  Duration  157.25s
```
(vs. baseline Apply Progress PR4 — 2304 passed — +20 tests netos de esta ronda. Sin regresiones. El log `ERROR [AesGcmSecretCipher] decrypt() falló: ...` es esperado — pertenece a un test de PR1 que fuerza tampering del `authTag`, no un fallo real.)

**`corepack pnpm lint`**: primera corrida detectó 9 errores `prettier/prettier` (formato, imports multilínea) en 5 archivos — corregidos con `eslint --fix` (solo reformateo, sin cambios de lógica). Corrida final:
```
$ eslint "src/**/*.ts"
EXIT_CODE=0
```

**`corepack pnpm exec tsc --noEmit -p tsconfig.json`**: exit 0, sin output.

### Diferido a PRs posteriores (NO implementado en esta ronda — fuera de scope)

- **Lock explícito / `$transaction` para cerrar la ventana TOCTOU del arreglo 4**: se documentó por qué no se implementó (el fix es la detección correcta del conflicto, no su eliminación) — considerarlo solo si el volumen de escrituras concurrentes reales sobre la misma `(categoria, clave)` lo justifica.
- **PR5 — Controller**: sigue pendiente, ahora con un REQUISITO DURO adicional documentado en `ActorContext` (resolver `clienteId`/`esGlobalAdmin` EXCLUSIVAMENTE del JWT verificado).

### Commits

- `feat(configuracion): ActorContext, validar-scope y nuevos errores de dominio` (`actor-context.ts`, `validar-scope.ts`, `config.errors.ts` +4 errores, `i-configuracion-repository.ts` — soporte de dominio para los 4 arreglos)
- `fix(configuracion): ownership de tenant, scope.kind invalido y placeholder enmascarado en ambos use cases` (`leer-config.use-case.ts`/`actualizar-config.use-case.ts` + specs — arreglos 1, 2 y 3)
- `fix(configuracion): switch exhaustivo fail-closed de scope.kind y deteccion de P2002 en los adapters` (`configuracion-repository.adapter.ts`/`audit-log.adapter.ts` + specs — arreglos 2 y 4)
- `test(configuracion): asserts adicionales de no-exportacion en el wiring guard Dz12` (`configuracion.module.spec.ts` — arreglo 5)
- `docs(configuracion): documentar fixes Judgment Day PR4 Ronda 1` (STATE.md)

Sin push, sin PR — branch `runtime-config-table-pr4` gateado por el usuario, igual que Apply Progress PR4.

## Judgment Day — PR4 — fixes Ronda 2

Fix-agent quirúrgico sobre la capa CRUD de config (branch `runtime-config-table-pr4`, sin push). 2 hallazgos de la ronda de revisión — 1 CRITICAL (Juez B) + 1 MEDIUM (authz duplicada, mismo hallazgo) y 1 LOW (Juez A). Ambos resueltos.

### Arreglos aplicados

1. **[CRITICAL, Juez B] Bypass de ownership por `null === null` + [MEDIUM] authz duplicada.** AMBOS use cases (`leer-config.use-case.ts`/`actualizar-config.use-case.ts`) tenían el MISMO bloque copy-pasteado: `const esPropioTenant = dto.scope.clienteId === dto.actor.clienteId; if (!dto.actor.esGlobalAdmin && !esPropioTenant) return Result.fail(...)`. Con `actor.clienteId === null` (ej. un actor sin tenant propio) y un `scope.clienteId === null` malformado (cruza el boundary vía JSON.parse, mismo vector que el `scope.kind` inválido de Ronda 1) la comparación `null === null` evaluaba `true` — `esPropioTenant` quedaba `true` y el gate NO disparaba. Lo único que salvaba el caso en producción era que Prisma lanza al recibir `clienteId: null` en el `where` — coincidencia del ORM, no autorización real. FIX: nuevo `autorizarScope(actor, scope)` en `configuracion/domain/validar-scope.ts` (auth-access skill regla 5: "Role/permission logic lives in DOMAIN") — ÚNICA fuente de verdad de esta autorización, reemplaza el bloque duplicado en AMBOS use cases. Fail-closed: `scope.kind==='tenant'` solo autoriza si `actor.esGlobalAdmin` O (`actor.clienteId !== null && typeof scope.clienteId === 'string' && scope.clienteId.length > 0 && scope.clienteId === actor.clienteId`) — `null` NUNCA satisface ownership, y un `clienteId` string vacío tampoco.
   - `backend/src/configuracion/domain/validar-scope.ts` (+`autorizarScope()`)
   - `backend/src/configuracion/application/use-cases/leer-config.use-case.ts` (bloque copy-paste → `autorizarScope(dto.actor, dto.scope)`)
   - `backend/src/configuracion/application/use-cases/actualizar-config.use-case.ts` (ídem)
   - Tests (+7 domain, +4 entre ambos use case specs): `validar-scope.spec.ts` (nuevo) cubre (a) el bypass exacto `actor.clienteId:null` + `scope.clienteId:null` malformado ⇒ rechazado, (b) `scope.clienteId` string vacío ⇒ rechazado (incluso "coincidiendo" con un `actor.clienteId` también vacío), (c) tenant propio ⇒ ok, (d) tenant ajeno ⇒ rechazado, (e) global-admin ⇒ cualquier tenant + global ok, + scope global sin admin ⇒ rechazado. Ambos use case specs replican el bypass (a) y el caso (b) contra el flujo completo (`repo.findAll`/`findByClave`/`upsert` NUNCA llamados).

2. **[LOW, Juez A] Placeholder sin trim.** `ActualizarConfigUseCase` comparaba `dto.valor === SECRET_MASK` — no cubría `' ******** '` (con espacios, ej. copy-paste desde un input HTML) que cifraría y corrompería el secreto real. FIX: `dto.esSecreto && dto.valor.trim() === SECRET_MASK`.
   - `backend/src/configuracion/application/use-cases/actualizar-config.use-case.ts`
   - Test (+1): valor `' ******** '` (esSecreto=true) ⇒ `ValorEnmascaradoNoPermitidoError`, `encrypt()` NUNCA llamado.

### Archivos modificados

| Archivo | Qué cambió |
|---|---|
| `backend/src/configuracion/domain/validar-scope.ts` | +`autorizarScope(actor, scope)` — única fuente de verdad de authz de scope, fail-closed ante `null`/string vacío |
| `backend/src/configuracion/domain/validar-scope.spec.ts` | Nuevo — 7 tests de `autorizarScope` |
| `backend/src/configuracion/application/use-cases/leer-config.use-case.ts` | Bloque copy-paste de authz → `autorizarScope()` |
| `backend/src/configuracion/application/use-cases/actualizar-config.use-case.ts` | Bloque copy-paste de authz → `autorizarScope()`; `dto.valor === SECRET_MASK` → `dto.valor.trim() === SECRET_MASK` |
| `backend/src/configuracion/application/use-cases/leer-config.use-case.spec.ts` | +2 tests (bypass `null===null` + `clienteId` vacío) |
| `backend/src/configuracion/application/use-cases/actualizar-config.use-case.spec.ts` | +3 tests (bypass `null===null` + `clienteId` vacío + placeholder con espacios) |

### Evidencia real (backend/, corrida serial FOREGROUND, 2026-07-31)

**`corepack pnpm test`**:
```
Test Files  178 passed | 1 skipped (179)
      Tests  2336 passed | 2 skipped (2338)
   Duration  157.66s
```
(vs. baseline Ronda 1 — 2324 passed — +12 tests netos de esta ronda: 7 `validar-scope.spec.ts` (nuevo) + 2 `leer-config.use-case.spec.ts` + 3 `actualizar-config.use-case.spec.ts`. Sin regresiones. El log `ERROR [AesGcmSecretCipher] decrypt() falló: ...` es esperado, mismo test de tampering de PR1 que en rondas anteriores.)

**`corepack pnpm lint`**: primera corrida detectó 1 error `prettier/prettier` (formato de objeto multilínea) en `validar-scope.spec.ts` — corregido con `eslint --fix` (solo reformateo, sin cambio de lógica). Corrida final:
```
$ eslint "src/**/*.ts"
EXIT_CODE=0
```

**`corepack pnpm exec tsc --noEmit -p tsconfig.json`**: exit 0, sin output.

### Commits

- `fix(configuracion): centralizar autorizacion de scope en dominio, cerrar bypass null===null y trim del placeholder` (`validar-scope.ts` +`autorizarScope()`, ambos use cases, specs — arreglos 1 y 2, mismos archivos)
- `docs(configuracion): documentar fixes Judgment Day PR4 Ronda 2` (STATE.md)

Sin push, sin PR — branch `runtime-config-table-pr4` gateado por el usuario, igual que rondas anteriores.

## Apply Progress — PR5 (API de gestión — R3, R4)

Branch: `runtime-config-table-pr5` (encadenada sobre `runtime-config-table-pr4`, ya aprobado). Sin push, sin PR — gateado por el usuario. Hace la feature alcanzable por HTTP por primera vez (`ConfiguracionController` wireado en `AppModule`).

### Tasks (7/7 — PR5 completo)

- [x] 5.1 DTOs `configuracion/interface/dtos/{actualizar-config-http,config-response}.dto.ts`
- [x] 5.2 RED: `PermissionsGuard` real sobre los handlers reales del controller — JWT con `configuracion:gestionar` autoriza GET/PUT; sin el permiso ⇒ 403 antes del caso de uso
- [x] 5.3 RED: D9 — JWT emitido ANTES de otorgar el permiso sigue 403 (mismo código de rechazo que "sin permiso": el guard nunca consulta DB)
- [x] 5.4 GREEN: `configuracion/interface/controllers/configuracion.controller.ts` — guard chain `JwtAuthGuard, RolesGuard, PermissionsGuard, TenantGuard` + `@RequirePermissions('configuracion:gestionar')` en GET/PUT
- [x] 5.5 RED: integración F2 — `PUT scope=global` por ADMIN-de-tenant (sin `is_global_admin`) rechazado con el use case REAL (no mockeado), antes de tocar el repositorio
- [x] 5.6 Wire `ConfiguracionController` + `ConfiguracionModule` (`imports: [AuthModule]`) en `app.module.ts`
- [x] 5.7 Verify: ver evidencia real abajo

### Cumplimiento de la OBLIGACIÓN DURA (Judgment Day PR4 Ronda 1 — `ActorContext`)

El controller resuelve la identidad del actor **exclusivamente del JWT verificado** (`@CurrentUser() user: JwtPayload`): `buildActorContext(user)` lee `user.cliente_id`/`user.is_global_admin` — dos funciones puras (`buildActorContext`/`buildScope`) son los ÚNICOS puntos del controller que construyen `ActorContext`/`ConfigScope`, y ninguna de las dos lee del body/query salvo el `kind` público (`'tenant'|'global'`, no una identidad). El `clienteId` de un scope `tenant` SIEMPRE es `user.cliente_id` — el DTO de PUT (`ActualizarConfigHttpDto`) deliberadamente NO tiene un campo `clienteId`, así que no hay forma de que un actor reclame el tenant de otro cliente desde el body. Verificado explícitamente en `configuracion.controller.spec.ts` ("construye ConfigScope/actorId EXCLUSIVAMENTE del JWT...") y en la integración F2 (`configuracion.controller.f2.integration.spec.ts`).

### Archivos nuevos

| Archivo | Qué hace |
|---|---|
| `backend/src/configuracion/interface/dtos/actualizar-config-http.dto.ts` | Body de `PUT /configuracion` — `class-validator` (`@IsIn(['tenant','global'])`, etc.). Sin campo `clienteId` (obligación dura). |
| `backend/src/configuracion/interface/dtos/config-response.dto.ts` | Response de GET/PUT — `fromRow(ConfigLecturaRow)`, mismo patrón `fromEntity` que `ClienteResponseDto`. `valor` ya viene enmascarado del use case si `esSecreto`. |
| `backend/src/configuracion/interface/controllers/configuracion.controller.ts` | `ConfiguracionController` — `GET`/`PUT /configuracion`, guard chain + `@RequirePermissions`, `buildActorContext`/`buildScope` (identidad SOLO del JWT), `mapConfigError` (errores de dominio → HttpException: 400/403/409/500). |
| `backend/src/configuracion/interface/controllers/configuracion.controller.spec.ts` | Unit — guard chain (metadata), RBAC real sobre handlers reales (R4 + D9), construcción de scope/actor y mapeo de errores usando los use cases REALES de PR4 con el repositorio (interfaz) mockeado. |
| `backend/src/configuracion/interface/controllers/configuracion.controller.f2.integration.spec.ts` | Integración (5.5) — `ActualizarConfigUseCase` REAL (no mockeado) wireado en el controller; PUT scope=global de un ADMIN-de-tenant sin `is_global_admin` rechazado con 403 antes de tocar `repo.findByClave`/`repo.upsert`/`secretCipher.encrypt`/`publisher.publish`. |

### Archivos modificados

| Archivo | Qué cambió |
|---|---|
| `backend/src/configuracion/configuracion.module.ts` | `+imports: [AuthModule]` (para que `JwtAuthGuard` resuelva `TOKEN_SERVICE`, mismo patrón que `TicketsModule`), `+controllers: [ConfiguracionController]` |
| `backend/src/configuracion/configuracion.module.spec.ts` | +1 assert: `moduleRef.get(ConfiguracionController)` resuelve por DI (wiring regression guard ampliado a PR5) |
| `backend/src/app.module.ts` | `+ConfiguracionModule` en `imports` (feature alcanzable por HTTP por primera vez) |
| `openspec/changes/runtime-config-table/tasks.md` | Tasks 5.1-5.7 marcadas `[x]` |

### Decisiones de diseño (PR5)

- **GET sin DTO de query** (design §10 literal): `@Query('scope') scope: unknown, @Query('categoria') categoria: string | undefined` — validación manual con `esScopeKindValido()` (dominio, ya existía desde PR4) en vez de una DTO/pipe adicional. Evita duplicar la validación de `scope.kind` que ya vive en dominio.
- **`ActualizarConfigHttpDto` sin `clienteId`**: el `scope` HTTP solo lleva el `kind`; el `clienteId` de un scope tenant es SIEMPRE `user.cliente_id` (obligación dura). Distinto del `ConfigScope` de dominio (que sí lleva `clienteId` para scope tenant) — el controller es quien completa ese campo, nunca el cliente HTTP.
- **`mapConfigError` — mapeo HTTP**: `InvalidScopeError`/`CategoriaNoSoportadaError`/`ValorEnmascaradoNoPermitidoError` ⇒ 400; `ScopeGlobalNoAutorizadoError`/`ScopeTenantNoAutorizadoError` ⇒ 403; `ConfigConflictoConcurrenteError` ⇒ 409; `CifradoError`/`InfraConfigError` ⇒ 500 genérico (mensaje NUNCA expone detalle interno de infra/driver — error-handling skill).
- **Tests del controller usan los use cases REALES de PR4** (repositorio/cipher/publisher/logger mockeados, que son interfaces sin campos privados) en vez de mockear `LeerConfigUseCase`/`ActualizarConfigUseCase` directamente — esas clases SÍ tienen campos privados y no son duck-typeables sin `as any` (prohibido, DoD §9 CLAUDE.md). Precedente existente (`presupuestos.controller.spec.ts`/`tickets.controller.spec.ts`) usa `as any` para esto — PR5 evita esa deuda mockeando en la capa de puertos en su lugar.
- **`ExecutionContext` mockeado con `as unknown as ExecutionContext`** en los tests de RBAC — única excepción deliberada a la prohibición de `as unknown as`: mismo patrón EXACTO ya establecido y aceptado en `auth/infrastructure/guards/guards.spec.ts`/`transicion-estado-permisos.guard.spec.ts` (interfaz de framework con ~8 métodos, implementar todos sin cast sería desproporcionado para un test que no evade tipado de negocio real).
- **`scope` inválido simulado vía `JSON.parse`** (no `as any`/`as unknown as`) para cruzar el boundary de tipos en runtime — mismo patrón que `validar-scope.spec.ts` (PR4 Judgment Day Ronda 2).

### Evidencia real (backend/, corrida serial FOREGROUND, 2026-07-31)

**`corepack pnpm exec tsc --noEmit -p tsconfig.json`**: exit 0, sin output.

**`corepack pnpm lint`**: primera corrida detectó 9 errores `prettier/prettier` (formato) en `configuracion.controller.ts`/`configuracion.controller.spec.ts` — corregidos con `eslint --fix` (solo reformateo, sin cambios de lógica). Corrida final:
```
$ eslint "src/**/*.ts"
EXIT_CODE=0
```
(sin output, exit 0).

**`corepack pnpm test`**:
```
Test Files  180 passed | 1 skipped (181)
     Tests  2361 passed | 2 skipped (2363)
  Duration  161.47s
```
(vs. baseline PR4 Ronda 2 — 2336 passed — +25 tests netos de PR5: guard chain metadata (3), RBAC real R4/D9 (5), handlers GET/PUT scope+actor+mapeo de errores (17, entre `configuracion.controller.spec.ts` y `configuracion.controller.f2.integration.spec.ts`). Sin regresiones. El log `ERROR [AesGcmSecretCipher] decrypt() falló: ...` es esperado — mismo test de tampering de PR1, no un fallo real.)

### Commits

- `feat(configuracion): DTOs HTTP de gestion de config` (`actualizar-config-http.dto.ts`, `config-response.dto.ts`)
- `feat(configuracion): ConfiguracionController con RBAC y resolucion de identidad exclusivamente del JWT` (`configuracion.controller.ts` + specs unit/integracion F2)
- `feat(configuracion): wire ConfiguracionController y ConfiguracionModule en AppModule` (`configuracion.module.ts` + spec, `app.module.ts`)
- `docs(configuracion): marcar tasks PR5 y documentar Apply Progress` (tasks.md + STATE.md)

Sin push, sin PR — branch `runtime-config-table-pr5` gateado por el usuario, encadenada sobre `runtime-config-table-pr4`.

### Cómo retomar

PR5 cerrado y verde — la API de gestión de config es alcanzable por HTTP por primera vez. Próximo work unit (Review Workload Guard, `ask-on-risk`): **PR6 — Swap `tickets/`** (contrato `send(email,config)`, adapter por-envío, elimina `email-config.ts`, `NotificarCambioEstadoHandler` resuelve config vía `IConfigResolver`, wiring + anti-regresión + verify final). Depende de PR2 (resolver, ya disponible) y PR1 (cipher, ya disponible). Mayor riesgo de regresión sobre `notif-email-estado-ticket` — extremar cuidado con la suite de ese change al final de PR6.

## Apply Progress — PR6 (Swap email + fail-fast a send-time + anti-regresión — R6, R7, R8) — ÚLTIMO PR

Branch: `runtime-config-table-pr6` (encadenada sobre `runtime-config-table-pr5`, ya aprobado). Sin push, sin PR — gateado por el usuario. **Cierra el change `runtime-config-table` (6/6 PRs completos)**: activa el flujo end-to-end (resolución de config runtime en DB → cifrado → envío de email) por primera vez.

### Tasks (17/17 — PR6 completo)

- [x] 6.1/6.2 GREEN: `EmailSenderPort.send(email, config: SmtpConfig)` — nueva firma (Dz6/R7)
- [x] 6.3/6.4/6.5 GREEN: `NodemailerEmailSender` refactorizado — adapter PURO, arma transporter POR-ENVÍO desde `config` (sin `process.env`, sin `fromEnv()`, sin `(transporter, from)` en el constructor); `sanitizeCausa(causa, pass)` redacta `config.pass`
- [x] 6.6 Eliminados `email-config.ts` + `email-config.spec.ts` (`EmailConfig`/`SmtpConfigError` — R6)
- [x] 6.7 RED: auditoría estructural de imports del adapter — sin `ISecretCipher`/`PrismaService`/`getMasterClient`/`getTenantClient`
- [x] 6.8-6.10 GREEN: `NotificarCambioEstadoHandler` inyecta `IConfigResolver`, nuevo paso `b` (resolución de config) ANTES del resolver de email, nuevo outcome `no-config`
- [x] 6.11 GREEN: `notificar-cambio-estado.listener.ts` — `case 'no-config'` ⇒ `logger.warn(codigo, ticketId)`, nunca el secreto
- [x] 6.12 RED: bootstrap de `TicketsModule`/`ConfiguracionModule` sin fila `ConfiguracionRuntime` categoría `smtp` ⇒ arranca sin throw (R6)
- [x] 6.13 GREEN: wire `tickets.module.ts` — `EMAIL_SENDER: useClass NodemailerEmailSender` (Dz11), `imports += [ConfiguracionModule]`, inject `CONFIG_RESOLVER` en el handler
- [x] 6.14 RED: hot-reload — test dedicado, 2 `handle()` consecutivos con config distinta ⇒ 2° envío usa la config NUEVA sin reiniciar el proceso
- [x] 6.15 Eliminado dummy `SMTP_*` de `backend/test/setup-env.ts` — confirmado que ninguna spec de wiring dependía de esos valores (toda la suite corrió verde sin ellos)
- [x] 6.16 Anti-regresión: suite `notif-email-estado-ticket` (adapter/handler/listener/wiring) — 35/35 verde (2 skip = integración gated `SMTP_TEST`), ver evidencia abajo
- [x] 6.17 Verify final: ver evidencia real abajo. Sin migraciones nuevas en PR6 (solo código de aplicación) — el chequeo de "conteo de tenants migrados vs `clientes` activos" (§11 design) no aplica a este PR, ya cubierto en el cierre de PR1.

### Archivos modificados

| Archivo | Qué cambió |
|---|---|
| `backend/src/tickets/domain/ports/i-email-sender.port.ts` | `EmailSenderPort.send(email, config: SmtpConfig)` — nueva firma (Dz6) |
| `backend/src/tickets/infrastructure/email/nodemailer-email-sender.adapter.ts` | Refactor completo: `transportFactory: TransportFactory` inyectable (default `nodemailer.createTransport`) reemplaza `(transporter, from)`; `send(email, config)` arma el transporter por-envío; eliminado `fromEnv()`/import de `email-config`; `sanitizeCausa(causa, pass)` redacta el secreto |
| `backend/src/tickets/infrastructure/email/nodemailer-email-sender.adapter.spec.ts` | Reescrito — todas las specs adaptadas a `transportFactory` + `send(email, config)`; +tests: 2 envíos sin cache (6.4), redacción de `pass` en la causa, auditoría estructural de imports (6.7) |
| `backend/src/tickets/infrastructure/email/nodemailer-email-sender.integration.spec.ts` | Adaptado al nuevo contrato — arma `SmtpConfig` explícita en vez de `fromEnv(testEnv)` |
| `backend/src/tickets/application/event-handlers/notificar-cambio-estado.handler.ts` | `+IConfigResolver` en el constructor; paso `b` (resolución de config) antes del resolver de email; nuevo outcome `no-config`; `send()` recibe `(email, config)` |
| `backend/src/tickets/application/event-handlers/notificar-cambio-estado.handler.spec.ts` | `+configResolver` mock en `beforeEach`; +tests: 6.8 (no-config), 6.9 (send recibe la config correcta), 6.14 (hot-reload) |
| `backend/src/tickets/infrastructure/events/notificar-cambio-estado.listener.ts` | `+case 'no-config'` ⇒ `logger.warn` con código+ticketId |
| `backend/src/tickets/infrastructure/events/notificar-cambio-estado.listener.spec.ts` | `handler` instanciado con `configResolver` stub; +test outcome `no-config` |
| `backend/src/tickets/tickets.module.ts` | `+imports: [ConfiguracionModule]`; `EMAIL_SENDER: useClass NodemailerEmailSender` (reemplaza `useFactory: fromEnv()`); `NotificarCambioEstadoHandler` useFactory `+inject CONFIG_RESOLVER` (primer parámetro) |
| `backend/src/tickets/tickets.module.wiring.spec.ts` | Reemplazado el test "rechaza el bootstrap si falta SMTP_HOST" (obsoleto — el fail-fast de boot ya no existe) por "arranca sin throw sin fila `ConfiguracionRuntime` smtp ni env SMTP_*" (R6); +assert de wiring posicional de `CONFIG_RESOLVER` en el handler (mismo patrón que `resolverCicloActivo`) |
| `backend/test/setup-env.ts` | Eliminado el dummy `SMTP_*` (ya no se lee `process.env` en ningún punto del flujo de email) |
| `openspec/changes/runtime-config-table/tasks.md` | Tasks 6.1-6.17 marcadas `[x]` |

### Archivos eliminados

| Archivo | Motivo |
|---|---|
| `backend/src/tickets/infrastructure/email/email-config.ts` | `EmailConfig`/`SmtpConfigError`/`loadEmailConfig()` — el fail-fast de boot por config SMTP se eliminó (R6); reemplazado por la resolución en send-time vía `IConfigResolver` |
| `backend/src/tickets/infrastructure/email/email-config.spec.ts` | Specs del archivo anterior |

### Decisiones de diseño (PR6)

- **`transportFactory` con default sin decorador `@Injectable()`** (Dz11): `NodemailerEmailSender` se cablea con `useClass` en `tickets.module.ts` — NestJS no tiene metadata `design:paramtypes` para esta clase (sin decorador propio), así que resuelve el constructor con CERO argumentos inyectados, y el parámetro `transportFactory` cae en su valor por default (`nodemailer.createTransport` real). Verificado en runtime: `tickets.module.wiring.spec.ts` confirma `EMAIL_SENDER` resuelve a una instancia real de `NodemailerEmailSender` vía DI.
- **`typeof nodemailer.createTransport` vs firma propia `TransportFactory`**: se definió `TransportFactory = (options: SmtpTransportOptions) => EmailTransporter` (tipo propio, NO el tipo exacto sobrecargado de nodemailer) — más simple para inyectar un stub en tests sin lidiar con las 6 sobrecargas de `createTransport`. `defaultTransportFactory()` (función interna, no exportada) hace de puente: llama a `nodemailer.createTransport(options)` (resolución de overload normal, no assignment-de-tipo-función) y el resultado se tipa como `EmailTransporter` por el tipo de retorno declarado de la función — cero `as any`/`as unknown as` (verificado por `tsc --noEmit` limpio).
- **`sanitizeCausa(causa, pass)` — guard de `pass.length === 0`**: aunque `SmtpConfig.create()` garantiza que `pass` nunca es un string vacío (Dz5, ya validado en PR2), se agregó el guard explícito porque `''.split('').join(x)` insertaría el separador entre cada carácter del string — defensivo ante un futuro cambio de esa invariante, no evasión de tipado.
- **`useClass: NodemailerEmailSender` (Dz11 literal) en vez de `useFactory`**: siguiendo design.md §7.4 al pie de la letra — el adapter ya no tiene ningún colaborador que requiera injection real (a diferencia de `fromEnv()`, que antes necesitaba el objeto `env`), así que `useClass` es la forma más simple y explícita.
- **Test de wiring posicional para `CONFIG_RESOLVER`** (mismo criterio que el arreglo de `ResolverCicloActivoParaCreacion` en Fase 4): dado que `NotificarCambioEstadoHandler.useFactory` ahora tiene 3 parámetros posicionales (`configResolver, resolver, emailSender`), se agregó una verificación explícita del campo real de la instancia (`as unknown as` — mismo patrón YA establecido y aceptado en este archivo para `resolverCicloActivo`/`cicloClienteRepo`, ver comentario original del archivo) para blindar contra un futuro desalineamiento silencioso entre `inject` y los parámetros del factory.
- **6.17 "conteo de tenants migrados"**: PR6 no agrega ninguna migración (solo refactor de código de aplicación/infra en `tickets/`) — ese chequeo (design §11) se hizo y cerró en PR1, que sí trajo el schema nuevo. No aplica repetirlo acá.

### Evidencia real (backend/, corrida serial FOREGROUND, 2026-07-31, contra el estado exacto commiteado)

**`corepack pnpm exec tsc --noEmit -p tsconfig.json`**: exit 0, sin output (limpio en el primer intento).

**`corepack pnpm lint`**: primera corrida detectó 2 errores `prettier/prettier` (formato) en `nodemailer-email-sender.adapter.spec.ts` — corregidos con `eslint --fix` (solo reformateo, sin cambios de lógica). Corrida final:
```
$ eslint "src/**/*.ts"
EXIT_CODE=0
```
(sin output, exit 0).

**`corepack pnpm test`** (suite completa backend, foreground, una sola corrida real):
```
Test Files  179 passed | 1 skipped (180)
     Tests  2363 passed | 2 skipped (2365)
  Duration  160.79s
```
(vs. baseline PR5 — 180 archivos/2361 passed — ahora 179 archivos porque se ELIMINÓ `email-config.spec.ts` [-1 archivo]; neto +2 tests pese a remover las ~5 specs de `email-config.spec.ts`, por las specs nuevas agregadas en el swap [handler 6.8/6.9/6.14, listener no-config, adapter sin-cache/redacción-pass/auditoría-imports]. Sin regresiones — 0 tests fallidos, 0 archivos fallidos. El log `ERROR [AesGcmSecretCipher] decrypt() falló: ...` es esperado — mismo test de tampering de PR1, no un fallo real.)

**Anti-regresión explícita — task 6.16 — suite `notif-email-estado-ticket` (corrida targeted, verbose, tras el swap)**:
```
✓ tickets.module.wiring.spec.ts (3 tests) — incluye "arranca sin throw sin fila ConfiguracionRuntime smtp ni env SMTP_*" (R6) + wiring posicional CONFIG_RESOLVER
✓ email-templates-build.spec.ts (2 tests)
✓ nodemailer-email-sender.adapter.spec.ts (19 tests) — incluye auditoría estructural de imports (R7 escenario 2), sin cache (R9), redacción de pass (R2)
✓ notificar-cambio-estado.listener.spec.ts (8 tests) — incluye outcome "no-config"
✓ notificar-cambio-estado.handler.spec.ts (7 tests) — incluye no-config (6.8), config correcta en send (6.9), hot-reload (6.14)
↓ nodemailer-email-sender.integration.spec.ts (2 tests, skip — gated SMTP_TEST=1, comportamiento esperado)

Test Files  5 passed | 1 skipped (6)
     Tests  35 passed | 2 skipped (37)
  Duration  6.16s
```
100% verde — el contrato del handler cambió (ahora resuelve config antes de enviar) pero la semántica de notificación (outcomes `skipped`/`no-email`/`send-failed`/`sent`, logging sin secretos, nunca-throw) se preservó íntegra.

### Commits

- `refactor(tickets): EmailSenderPort.send(email, config) — adapter de email puro, sin fromEnv` (i-email-sender.port.ts + nodemailer-email-sender.adapter.ts + specs; elimina email-config.ts/spec)
- `feat(tickets): NotificarCambioEstadoHandler resuelve SmtpConfig via IConfigResolver antes de enviar` (handler.ts + listener.ts + specs — outcome no-config)
- `feat(tickets): wire EMAIL_SENDER puro + CONFIG_RESOLVER en TicketsModule` (tickets.module.ts + wiring.spec.ts + setup-env.ts sin dummy SMTP)
- `docs(runtime-config-table): marcar tasks PR6 y cerrar el change (6/6 PRs)` (tasks.md + STATE.md)

Sin push, sin PR — branch `runtime-config-table-pr6` gateado por el usuario, encadenada sobre `runtime-config-table-pr5`.

### Estado final del change

**`runtime-config-table` — COMPLETO (6/6 PRs, 76/76 tasks totales).** Flujo end-to-end activo: config SMTP runtime en DB (tenant + global, merge por campo) → cifrado AES-256-GCM at-rest → resolución cross-DB fail-fast-a-send-time → envío de email con adapter puro → audit inmutable de cada cambio → API HTTP con RBAC (`configuracion:gestionar`) + F2 (scope global solo `is_global_admin`). Pendiente fuera de este change (documentado, no bloqueante): `.env.example` con `CONFIG_ENCRYPTION_KEY` de ejemplo (desviación #3, PR1 — el sandbox del agente deniega acceso a `.env*`); rotación de clave de cifrado (deuda D6 aceptada); cache de transporter (deuda R9 aceptada).
