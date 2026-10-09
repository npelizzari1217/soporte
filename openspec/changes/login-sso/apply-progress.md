# Apply progress: login-sso

## Unidad 1 (WU-1a) - lotes 1 y 2 (ramas `feat/login-sso-wu01a` y `feat/login-sso-wu01a2`)

Partida por la contingencia de tasks.md (el diff real de la WU superaba el tope duro de 380 lineas):
- `feat/login-sso-wu01a` (base `feat/login-sso`): tareas 1.1 a 1.7.
- `feat/login-sso-wu01a2` (base `feat/login-sso-wu01a`): tareas 1.8 a 1.11 (repositorio de estados, su integracion y las mutaciones).

Modo: estandar (feature, sin TDD estricto).

### Tareas

- [x] 1.1 a 1.4 spike `jose` (gate PASADO)
- [x] 1.5 migracion M1 y rollback
- [x] 1.6 esquema Prisma y cliente
- [x] 1.7 `PROVEEDORES_SSO` y puerto `ISsoEstadoRepository`
- [x] 1.8 a 1.9 repositorio de estados e integracion (rama `wu01a2`)
- [x] 1.10 mutaciones (rama `wu01a2`)
- [x] 1.11 verificacion (rama `wu01a2`)

### Resultado del gate del spike (1.4), Node v24.20.0

| Criterio | Resultado |
|---|---|
| 1. `pnpm typecheck` sin shim | 0 errores. No hizo falta `src/types/jose.d.ts` |
| 2. `pnpm build` + `node -e "require('./dist/auth/infrastructure/sso/jose-humo.js').humo().then(console.log)"` | build exit 0; imprime `ok`; sin `ERR_REQUIRE_ESM`, sin `ERR_REQUIRE_ASYNC_MODULE` y sin `ExperimentalWarning` |
| 3. `pnpm vitest run src/auth/infrastructure/sso/jose-humo.spec.ts` | 1 test en verde |
| 4. `pnpm lint` | exit 0, 0 errores |
| 5. `pnpm start` | arranca (`Nest application successfully started`) con `DATABASE_URL_MASTER` de test, `JWT_SECRET` y `APP_BASE_URL` por entorno; se repite en 9.5 con `AuthModule` importando el adaptador |

Solo se probo Node 24 (el de esta maquina). El VPS usa Node 22.12 o superior segun el diseno: se confirma en el runbook (WU-9).

### Notas

- `pnpm add jose@^6.2.8` resolvio `jose 6.2.12`; `package.json` quedo con `^6.2.12` (cumple el mayor del diseno).
- Migracion `20261010120000_login_sso` aplicada a `soporte_master_test` con `prisma migrate deploy`; `rollback.sql` ejecutado una vez y la migracion reaplicada. Las tablas deben quedar con duenio `soporte` (el rol de los tests): la reaplicacion se hizo con ese rol, no con `$POSTGRES_USER`, porque si no el repositorio falla con `permission denied`.
- La URL de la base de test sale del default de `src/testing/lock-master-test.ts` (`URL_MASTER_TEST_POR_DEFECTO`); no se leyo ni se creo ningun `.env`.
- El puerto recibe los hashes ya calculados (el caso de uso de la WU-4a los calcula con `pkce.sha256`).

### Work Unit Evidence (lote 1)

| Evidencia | Valor |
|---|---|
| Comando focalizado | `pnpm vitest run src/auth/infrastructure/sso/jose-humo.spec.ts`: 1 passed |
| Harness de runtime | criterios 2 y 5 del spike (arriba) |
| Frontera de rollback | `git revert` del commit; `rollback.sql` de M1; sin consumidores |

### Lote 2 (rama `feat/login-sso-wu01a2`)

Mutaciones (1.10), cada una revertida:
- Quitar `usado_at IS NULL` del CAS: en rojo "consumir devuelve ... una sola vez" y "dos consumos concurrentes".
- Quitar `navegador_hash` del CAS: en rojo "navegador ajeno devuelve null y la fila sigue consumible".

Verificacion (1.11), desde `backend/`: `pnpm lint` exit 0; `pnpm typecheck` exit 0; `pnpm vitest run src/auth/infrastructure/sso/jose-humo.spec.ts src/auth/infrastructure/sso/prisma-sso-estado.repository.integration.spec.ts` 2 archivos, 12 tests en verde. Raiz: `node scripts/check-casts-en-specs.mjs` 617 en 114 archivos (base 617), sin subir. Migracion M1 aplicada a `soporte_master_test`, rollback ejecutado una vez y reaplicada (`prisma migrate status`: al dia).

| Evidencia | Valor |
|---|---|
| Comando focalizado | `pnpm vitest run src/auth/infrastructure/sso/jose-humo.spec.ts src/auth/infrastructure/sso/prisma-sso-estado.repository.integration.spec.ts`: 12 passed |
| Harness de runtime | integracion sobre `soporte_master_test` (CAS, concurrencia, purga) |
| Frontera de rollback | `prisma-sso-estado.repository.ts` y su spec; sin consumidores |

## Unidad 2 (WU-1b) - rama `feat/login-sso-wu01b` (base `feat/login-sso-wu01a2`)

Sin partir: el diff de la WU contra su base es de 323 lineas de codigo y specs (tope duro 380). Dos commits en la misma rama: vinculos (2.1-2.2) y busqueda por email con los 10 mocks (2.3-2.5).

- [x] 2.1 a 2.2 puerto `IIdentidadSsoRepository` + `PrismaIdentidadSsoRepository` e integracion (8 tests)
- [x] 2.3 a 2.5 `findManyByEmailInsensitive` (`$queryRaw`, `lower(email) = lower($1) LIMIT 2`), integracion (5 tests) y una linea en cada uno de los 10 specs
- [x] 2.6 verificacion

Notas:
- Los mocks que ya usaban `unstubbed('...')` recibieron `unstubbed('findManyByEmailInsensitive')` (misma forma que sus vecinos); el resto `vi.fn()`. Una linea por spec, sin casts.
- El spec del repositorio de usuarios se llama `prisma-usuario.repository.email-insensitive.integration.spec.ts` (no existia un spec propio del repositorio).
- El mapeo de la fila cruda (snake_case) a `PrismaUsuario` se hace en el repositorio y delega en `UsuarioMapper.toDomain`.

| Evidencia | Valor |
|---|---|
| Comando focalizado | `pnpm vitest run src/auth`: 87 archivos, 1007 tests en verde; `crear-cliente.use-case.spec.ts`: 7 en verde |
| Harness de runtime | integracion sobre `soporte_master_test` (unicos, carrera de `vincular`, cascada, LIMIT 2, `_` no comodin) |
| Casts | 617 en 114 archivos (base 617), sin subir |
| Frontera de rollback | revertir los dos commits de codigo; sin consumidores |

## Unidad 3 (WU-2a) - ramas `feat/login-sso-wu02a` y `feat/login-sso-wu02a2`

Partida: el diff completo contra `feat/login-sso-wu01b` era de 498 lineas (tope duro 380). Costura limpia, cada mitad lleva sus tests:
- `feat/login-sso-wu02a` (base `feat/login-sso-wu01b`, 267 lineas): tareas 3.1 a 3.3.
- `feat/login-sso-wu02a2` (base `feat/login-sso-wu02a`, ~240 lineas de codigo y specs): tareas 3.4 a 3.9.

Modo: estandar (feature, sin TDD estricto).

- [x] 3.1 dominio `proveedor-slug`, `identidad-sso-verificada`, `sso.errors.ts` y puerto `IProveedorOidc` (`wu02a`)
- [x] 3.2 a 3.3 `ConfiguracionSsoDesdeEntorno` y su spec (`wu02a`)
- [x] 3.4 a 3.5 validador de Google (`wu02a2`)
- [x] 3.6 a 3.7 validador de Microsoft (`wu02a2`)
- [x] 3.8 mutaciones (`wu02a2`)
- [x] 3.9 verificacion (`wu02a2`)

Notas:
- El diseno no fija la forma del puerto `IProveedorOidc`; queda `construirUrlAutorizacion(proveedor, {state, nonce, codeChallenge})` y `verificarCodigo(proveedor, {code, codeVerifier, nonce})`. La WU-2b lo implementa.
- `ConfiguracionSsoDesdeEntorno` recibe `appBaseUrl` (la WU-5a le pasa `entorno.APP_BASE_URL`) y el `env` (por defecto `process.env`, leido en cada llamada). Los valores se devuelven con `trim()`.
- Los validadores reciben el nonce esperado y la configuracion del emisor (`emisores` en Google, `plantillaEmisor` en Microsoft) y lanzan `SsoRechazadoError` (motivos `TOKEN_INVALIDO` o `EMAIL_NO_VERIFICADO`). Google tambien comprueba `iss` contra `emisores` (defensa en profundidad sobre `jwtVerify`).
- Rechazan tambien un `email` vacio o solo espacios (`EMAIL_NO_VERIFICADO`).

Mutaciones (3.8), cada una revertida:
- Microsoft: reemplazar `claims.xms_edov !== true` por `false` -> 4 tests en rojo (`xms_edov` ausente, `false`, la cadena `"true"`, `1`).
- Google (extra): reemplazar `claims.email_verified !== true` por `false` -> 4 tests en rojo (ausente, `false`, la cadena `"true"`, `1`).

| Evidencia | Valor |
|---|---|
| Comando focalizado | `pnpm vitest run src/auth/domain/sso src/auth/infrastructure/sso` (ver verificacion final del reporte) |
| Harness de runtime | N/A: funciones puras sobre payloads y lectura de un `env` inyectado |
| Casts | 617 en 114 archivos (base 617), sin subir |
| Frontera de rollback | `wu02a`: dominio, errores, puerto y configuracion; `wu02a2`: los dos validadores y sus specs; sin consumidores |
