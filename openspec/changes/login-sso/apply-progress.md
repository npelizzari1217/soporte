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

## Unidad 4 (WU-2b) - rama `feat/login-sso-wu02b`

Modo: estandar. **size:exception aceptado**: ~435 lineas de codigo (estimacion 360); el spec no se entrega sin el adaptador y el IdP falso, y no hay costura limpia.

- [x] 4.1 `src/testing/idp-falso.ts` (servidor `node:http`, `/token` y `/jwks`, firma RS256, clave ajena, HS256 y `none`, contador de llamadas)
- [x] 4.2 `jose-proveedor-oidc.spec.ts` (17 tests)
- [x] 4.3 `jose-proveedor-oidc.ts`
- [x] 4.4 baja de `jose-humo.ts` y su spec
- [x] 4.5 verificacion

Commit de codigo: `893c6065` (`feat(auth): adaptador OIDC con jose, IdP falso y baja del spike`).

Verificacion observada (backend/ salvo la ultima):
- `pnpm lint`: 0 errores.
- `pnpm typecheck`: 0 errores.
- `pnpm vitest run src/auth/infrastructure/sso`: 6 archivos, 79 tests en verde (17 del spec nuevo).
- `pnpm build` y `node -e "require('./dist/auth/infrastructure/sso/jose-proveedor-oidc.js')"`: `require ok`, sin `ERR_REQUIRE_ESM`; `dist/testing` no contiene `idp-falso`.
- `rg "from 'jose'" src`: solo el adaptador y `src/testing/idp-falso.ts`.
- `rg "jose-humo" src`: vacio.
- `node scripts/check-casts-en-specs.mjs` (raiz): 617 en 114 archivos (base 617), sin subir.

Rojo observado antes del verde: la primera corrida fallo en "vencido" porque `JWTExpired` no extiende `JWTClaimValidationFailed` en jose 6; se agrego a la lista de rechazos.

Desviaciones del diseno:
- `tsconfig.build.json` no necesito cambios: ya excluye `src/testing/**`.
- `jwtVerify` corre sin la opcion `issuer`; el emisor lo comparan los validadores en ambos proveedores.
- El adaptador recibe `IConfiguracionSso` en el constructor.
- Una respuesta 200 del `/token` sin `id_token` lanza un error comun (500), no un rechazo.
- El IdP falso firma las variantes HS256 y `alg: none`, porque el spec no puede importar `jose`.

Notas para unidades siguientes:
- La WU-5a registra `new JoseProveedorOidc(configuracionSso)` bajo el token `PROVEEDOR_OIDC`.
- Queda pendiente en la WU-5a el arranque con `pnpm start` (criterio 5 de ADR-2).

| Evidencia | Valor |
|---|---|
| Comando focalizado | `pnpm vitest run src/auth/infrastructure/sso`: 6 archivos, 79 tests en verde |
| Harness de runtime | IdP falso `node:http` en `127.0.0.1:0` (JWKS, `/token`, caida de red) |
| Frontera de rollback | revertir `893c6065`; el spike `jose-humo` vuelve y no hay consumidores |

## Unidad 5 (WU-3) - rama `feat/login-sso-wu03`

Modo: estandar (refactor sin cambio de conducta).

- [x] 5.1 `evaluar-segundo-paso.service.spec.ts` (7 tests, mocks completos, sin casts)
- [x] 5.2 `evaluar-segundo-paso.service.ts` (lineas 176-203 de `login.use-case.ts`, confirmadas antes de mover)
- [x] 5.3 `LoginUseCase` construye el servicio; sigue con 11 parametros
- [x] 5.4 Provider en `auth.module.ts`: **se queda** (`auth.module.spec.ts` pasa sin editarse)
- [x] 5.5 Prueba de no cambio: `git diff --stat feat/login-sso-wu02b..HEAD` sobre los 10 specs protegidos, vacio
- [x] 5.6 verificacion

Commit de codigo: `ce968600` (`refactor(auth): extrae EvaluarSegundoPasoService del login`).

Verificacion observada (backend/ salvo la ultima):
- `pnpm lint`: 0 errores.
- `pnpm typecheck`: 0 errores.
- `pnpm vitest run src/auth/application`: 28 archivos, 285 tests en verde.
- Los seis e2e + `auth.module.spec.ts` + `auth.controller.spec.ts`: 8 archivos, 98 tests en verde.
- `node scripts/check-casts-en-specs.mjs` (raiz): 617 en 114 archivos (base 617), sin subir.

Desviaciones del diseno: ninguna.

Notas para unidades siguientes:
- `LoginUseCase` conserva `tfaRepo`, `desafios` y `dispositivos` como propiedades solo por el constructor de 11 parametros; el servicio ya no se obtiene de ellas.
- `CompletarSsoUseCase` (WU-4b) inyecta `EvaluarSegundoPasoService` desde el provider ya registrado.

## Unidad 6 (WU-4a) - rama `feat/login-sso-wu04a`

Modo: estandar (feature).

- [x] 6.1 y 6.2 `pkce.spec.ts` (4 tests, vector de la RFC 7636) y `pkce.ts`
- [x] 6.3 y 6.4 `iniciar-sso.use-case.spec.ts` (6 tests) e `iniciar-sso.use-case.ts`
- [x] 6.5 y 6.6 `listar-proveedores-sso.use-case.spec.ts` (3 tests) y `listar-proveedores-sso.use-case.ts`
- [x] 6.7 verificacion

Commits: `2c4ee54c` (`refactor(auth): mueve la configuracion SSO a un puerto de dominio`), `757a66fd` (`feat(auth): pkce, IniciarSso y ListarProveedoresSso`).

Verificacion observada (backend/ salvo las dos ultimas):
- `pnpm lint`: 0 errores.
- `pnpm typecheck`: 0 errores.
- `pnpm vitest run src/auth/application/sso src/auth/infrastructure/sso src/auth/domain/sso`: 10 archivos, 97 tests en verde.
- `rg "infrastructure" src/auth/application/sso`: vacio.
- `node scripts/check-casts-en-specs.mjs` (raiz): 617 en 114 archivos (base 617), sin subir.

Adicion (arrastre de la WU-2a): la interfaz `IConfiguracionSso`, `ConfigProveedorSso` y el token `CONFIGURACION_SSO` pasaron de `infrastructure/sso/configuracion-sso.ts` a `domain/ports/configuracion-sso.port.ts`, para que application no importe de infraestructura. `ConfiguracionSsoDesdeEntorno` queda en infraestructura e implementa el puerto. Importadores actualizados: `jose-proveedor-oidc.ts` y su spec. Sin cambio de conducta.

Desviaciones del diseno:
- `IniciarSsoUseCase` no re-sanea `siguiente`: la lista permitida vive solo en el BFF (`destinoPosLogin`) y el backend no tiene una; se guarda tal como llega (ya saneado) o `null`. La WU-5a debe acotar el DTO a 300 caracteres (`VARCHAR(300)`).
- El spec del caso de uso no valida los parametros de la URL (`scope`, `response_mode`, `prompt`, `client_id`, `redirect_uri`): `rg infrastructure` sobre application debe quedar vacio y esos parametros ya los prueba `jose-proveedor-oidc.spec.ts`. Aca se prueba lo que se le entrega al puerto y lo que se persiste.
- `ListarProveedoresSsoUseCase.execute()` es sincrono (la configuracion es sincrona) y devuelve `SlugSso[]`.
- `SsoNoDisponibleError` se lanza (no se devuelve como `Result`), igual que el puerto OIDC.

Notas para unidades siguientes:
- `pkce.ts` exporta `generarAleatorioUrl`, `generarCodeVerifier`, `calcularCodeChallenge` y `sha256Hex`; la WU-4b usa `sha256Hex` para el `navegadorHash` y el `stateHash` del CAS.
- `SSO_ESTADO_TTL_MS` se exporta desde `iniciar-sso.use-case.ts`.
- La WU-5a registra `IniciarSsoUseCase`, `ListarProveedoresSsoUseCase` y `ConfiguracionSsoDesdeEntorno` bajo `CONFIGURACION_SSO` importado ahora del puerto de dominio.

| Evidencia | Valor |
|---|---|
| Comando focalizado | `pnpm vitest run src/auth/application/sso src/auth/infrastructure/sso src/auth/domain/sso`: 10 archivos, 97 tests en verde |
| Harness de runtime | N/A: casos de uso inertes, sin cableado hasta la WU-5a |
| Frontera de rollback | revertir `757a66fd` (casos de uso) y, por separado, `2c4ee54c` (puerto) |

## Unidad 7 (WU-4b) - rama `feat/login-sso-wu04b`

Modo: estandar (feature). Tareas 7.1 a 7.4 hechas. Commit: `2ba51686` (`feat(auth): CompletarSsoUseCase hasta la resolucion del usuario`).

Mutacion 7.3: sin el chequeo `isGlobalAdmin`, `vitest run src/auth/application/sso/completar` dio 2 rojos de 18 (`ROOT se rechaza resuelto por email`, `ROOT se rechaza tambien si ya estaba vinculado (promovido despues)`); revertida, 31 tests en verde.

Verificacion observada (backend/ salvo las dos ultimas): `pnpm lint` 0 errores; `pnpm typecheck` 0 errores; `pnpm vitest run src/auth/application/sso` 4 archivos, 31 tests en verde; `rg infrastructure src/auth/application/sso` vacio; `check-casts-en-specs.mjs` 617 (base 617).

Desviaciones del diseno: ninguna. `execute` devuelve `CompletarSsoResolucion` (usuario, membresias, identidad, resueltoPorEmail, siguiente) y todo rechazo lanza `SsoRechazadoError` tras loguear `SSO_RECHAZADO` con el `ILogger` del dominio.

Notas para la WU-4c: el paso 3 va en el comentario marcado antes de resolver al usuario; el limitador debe cubrir los pasos 4 a 7 como falla. `vincular` solo si `resueltoPorEmail`. Constructor actual: estados, oidc, vinculos, usuarios, membresias, logger.

## Unidad 8 (WU-4c) - rama `feat/login-sso-wu04c`

Modo: estandar (feature). Tareas 8.1 a 8.4 hechas. Commits: `facb7bb3` (`feat(auth): CompletarSsoUseCase con limitador, vinculo, segundo paso y ticket`). size:exception: 404 lineas con docs y 375 sin ellas, sin costura que mantenga la unidad junta.

Mutaciones 8.3 (`vitest run src/auth/application/sso/completar`, 45 tests en verde de base; todas revertidas, 45 en verde):
- (a) sin `liberar`: 1 rojo, `libera la clave solo despues de vincular (paso 8) y antes del segundo paso`.
- (b) `reservar` despues del rechazo (tras el paso 7): 7 rojos, `agotado: BLOQUEADO con token valido...`, `reserva entre el canje y la resolucion del usuario, no antes` y los `rechazo SIN_USUARIO/AMBIGUO/INACTIVO/ROOT/SIN_MEMBRESIA` de "la reserva queda como falla".
- (c) pasos 5 a 7 despues de `vincular`: 4 rojos, `usuario ROOT / borrado / inactivo / sin membresias resuelto por email: vincular no se llama`.

Verificacion observada (backend/ salvo las dos ultimas): `pnpm lint` 0 errores; `pnpm typecheck` 0 errores; `pnpm vitest run src/auth/application` 32 archivos, 343 tests en verde; `rg infrastructure src/auth/application/sso` vacio; `git diff --stat feat/login-sso-wu04b..HEAD -- src/auth/application/tfa src/auth/application/use-cases` vacio; `check-casts-en-specs.mjs` 617 (base 617).

Diseno: el IP llega como `CompletarSsoInput.ip?` (ausente = `sin-ip`, como `pwd:`) y el token `td` como `dispositivoConfiable?`. El resultado es `CompletarSsoResultado` (`needs2fa` | `needsEnrolamiento2fa` | `ticket`, mas `siguiente`); reemplaza a `CompletarSsoResolucion`, sin otros usuarios. Con una o varias membresias el SSO entrega el mismo ticket `SELECCIONAR`. Desviaciones: ninguna.

Notas para la WU-5a: constructor = `SSO_ESTADO_REPOSITORY`, `PROVEEDOR_OIDC`, `IDENTIDAD_SSO_REPOSITORY`, `USUARIO_REPOSITORY`, `MEMBRESIA_REPOSITORY`, `LIMITADOR_INTENTOS`, la clase `EvaluarSegundoPasoService` (ya provista en auth.module) y `DESAFIO_LOGIN_REPOSITORY`, `LOGGER`. El controlador pasa `ip` desde `x-soporte-ip-navegador` y `dispositivoConfiable` desde la cookie `td`.

| Evidencia | Valor |
|---|---|
| Comando focalizado | `pnpm vitest run src/auth/application`: 32 archivos, 343 tests en verde |
| Harness de runtime | N/A: caso de uso inerte, sin cableado hasta la WU-5a |
| Frontera de rollback | revertir el commit de `completar-sso.use-case.ts` y su spec |

## Unidad 9 (WU-5a) - rama `feat/login-sso-wu05a`

Modo: estandar (feature). Tareas 9.1 a 9.6 hechas. Commit: `f4e9367c` (`feat(auth): SsoController, cableado del login SSO y e2e basico`), 377 lineas de codigo y spec (tope duro 380).

- Casos movidos a la unidad 10 (tarea 10.5) por el tope: "estado vencido" y "proveedor cruzado", mas el `siguiente` de 301 caracteres (400) y la comprobacion de que solo hashes quedan en `state_hash` y `navegador_hash`. Se reescribieron antes de commitear; no hay codigo sin probar: el DTO tiene `MaxLength(300)`.
- Cableado: `PrismaSsoEstadoRepository` va por `useFactory` porque su segundo parametro (`ahora`, un reloj) no es resoluble por Nest. Los tres casos de uso se registran como clase (ya llevan `@Inject`). `ConfiguracionSsoDesdeEntorno` recibe `entorno.APP_BASE_URL`; `JoseProveedorOidc` se construye con `CONFIGURACION_SSO`, asi `overrideProvider(CONFIGURACION_SSO)` tambien cambia el adaptador.
- Contrato HTTP: `POST /auth/sso/:proveedor/callback` recibe `{code, state, binding, dispositivoConfiable?}` y devuelve el `CompletarSsoResultado` tal cual (`kind`, `desafio` o `ticket`, `siguiente`, `dispositivoConfiable?`). La IP sale de `ipDelNavegador(req)`. Un callback de un proveedor deshabilitado cae en el CAS (no hay estado) y responde el 401 generico; el 404 solo aplica a slug desconocido y a `iniciar` de un proveedor deshabilitado. Un body mal formado sigue siendo 400 del `ValidationPipe`.

Mutaciones 9.4 (`vitest run test/sso.e2e.spec.ts`, 5 tests en verde de base; ambas revertidas con `git checkout`):
- sin `AND usado_at IS NULL` en el CAS: 1 rojo, `el callback valido entrega ticket y el replay del mismo state es 401 ...`.
- sin `AND navegador_hash = ...` en el CAS: 1 rojo, `sso_st de otro flujo es 401 y el flujo propio sigue consumible`.

Arranque 9.5 (`pnpm build` y `pnpm start` con `DATABASE_URL_MASTER`, `APP_BASE_URL`, `JWT_SECRET`, `EMAIL_CRYPTO_KEY` y `PORT=3987`; proceso detenido despues):
- sin variables `SSO_*`: arranca, `GET /api/auth/sso/proveedores` → 200 `{"proveedores":[]}`.
- con `SSO_GOOGLE_CLIENT_ID` y `SSO_GOOGLE_CLIENT_SECRET`: arranca, 200 `{"proveedores":["google"]}`.

Verificacion observada (backend/ salvo la ultima): `pnpm lint` 0 errores; `pnpm typecheck` 0 errores; `pnpm vitest run test/sso.e2e.spec.ts src/auth` 97 archivos, 1141 tests en verde; `check-casts-en-specs.mjs` 617 (base 617).

Desviaciones del diseno: ninguna. Ayuda: sin deuda (el login SSO no tiene UI hasta la WU-7).

| Evidencia | Valor |
|---|---|
| Comando focalizado | `pnpm vitest run test/sso.e2e.spec.ts src/auth`: 97 archivos, 1141 tests en verde |
| Harness de runtime | IdP falso `node:http` + `soporte_master_test`, listener real; `pnpm start` con y sin `SSO_*` |
| Frontera de rollback | revertir `f4e9367c`; los casos de uso vuelven a quedar inertes |
