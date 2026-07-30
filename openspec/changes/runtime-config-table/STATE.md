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
