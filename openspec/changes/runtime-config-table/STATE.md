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
