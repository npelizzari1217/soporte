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
