# Tasks: Login con Google o Microsoft (SSO)

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~4.780 (16 WU, cada una ≤ 400; las más cargadas son WU-5a ~400, WU-6 ~390, WU-2a ~390, WU-8a ~390, WU-5b ~380) |
| 400-line budget risk | Medium (total y por WU: WU-5a, WU-2a, WU-6 y WU-8a rozan el tope); Low en las demás |
| Chained PRs recommended | Yes |
| Suggested split | PR1 (WU-1a) → PR2 (WU-1b) → ... → PR16 (WU-9), un PR por WU, en el orden del diseño |
| Delivery strategy | auto-chain |
| Chain strategy | feature-branch-chain |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: feature-branch-chain
400-line budget risk: Medium

Modo estándar (feature, sin TDD estricto): los tests viajan en el mismo commit que el código; en cada par, la tarea de test va primero. Las filas de la tabla "Invariantes que DEBEN tener test" del diseño son tareas explícitas, con su mutación. No hay Threat Matrix aplicable (el diseño la declara N/A); las amenazas HTTP/OIDC (login CSRF, replay, mix-up, nOAuth, open redirect) quedan cubiertas por las tareas de ADR-1, ADR-3, ADR-7 y ADR-9 y por las mutaciones.

Numeración: el prefijo de cada tarea es el ordinal de la unidad, no el nombre de la WU. Correspondencia: 1 = WU-1a, 2 = WU-1b, 3 = WU-2a, 4 = WU-2b, 5 = WU-3, 6 = WU-4a, 7 = WU-4b, 8 = WU-4c, 9 = WU-5a, 10 = WU-5b, 11 = WU-6, 12 = WU-7a, 13 = WU-7b, 14 = WU-8a, 15 = WU-8b, 16 = WU-9.

Partición adicional respecto del diseño (costuras limpias, cada mitad lleva su código con sus tests):
- WU-4b (~420 en el diseño) se parte ya en 4b (pipeline del caso de uso: pasos 1, 2 y 4 a 7 de ADR-7, con un punto de inserción para el limitador) y 4c (paso 3 limitador, pasos 8 a 10: `vincular`, `liberar`, segundo paso y ticket). Con 4b sola el caso de uso es inerte (no está cableado hasta la WU-5a).
- WU-5b es **solo tests**: es aceptable porque todo el código que prueba ya quedó mergeado en el PR anterior (WU-5a) y en las unidades 6 a 8; el PR lo declara en su cuerpo.
- Contingencia WU-5a: si el diff real supera 400 líneas, los casos "expirado" y "proveedor cruzado" del e2e básico pasan a la WU-5b (que es solo tests).
- Contingencia WU-8a (los tests de vista corrieron ~1,5x el pronóstico en el ciclo anterior): si el diff real supera 400, se parte en 8a-i (esquemas, hook de proveedores, `BotonesSso`, `AvisoMotivo`, `RUTAS_SIN_REFRESH` con sus tests) y 8a-ii (efecto `?sso=1` en `use-login.ts` con sus tests).
- Contingencia WU-1a / WU-2a: si superan 400, el repositorio de estados (1.8 y 1.9) y el validador de Microsoft (3.6 y 3.7) pasan a una media unidad propia, con la rama sufijada.
La partición se anota en el PR y en este archivo; el orden de la cadena se conserva.

Rama tracker: `feat/login-sso` (ya existe con los commits de planificación; solo ella mergea a `main`). El PR de la WU-1a apunta al tracker; el PR de cada WU apunta a la rama de la WU anterior de la cadena. Cada PR lleva diagrama de dependencia con 📍, inicio/fin, dependencias previas y fuera de alcance. El tracker PR queda en draft/no-merge hasta integrar toda la cadena. Issue del ciclo: #507.

Ramas por WU (base entre paréntesis):
- WU-1a `feat/login-sso-wu01a` (tracker)
- WU-1b `feat/login-sso-wu01b` (wu01a)
- WU-2a `feat/login-sso-wu02a` (wu01b)
- WU-2b `feat/login-sso-wu02b` (wu02a)
- WU-3 `feat/login-sso-wu03` (wu02b)
- WU-4a `feat/login-sso-wu04a` (wu03)
- WU-4b `feat/login-sso-wu04b` (wu04a)
- WU-4c `feat/login-sso-wu04c` (wu04b)
- WU-5a `feat/login-sso-wu05a` (wu04c)
- WU-5b `feat/login-sso-wu05b` (wu05a)
- WU-6 `feat/login-sso-wu06` (wu05b)
- WU-7a `feat/login-sso-wu07a` (wu06)
- WU-7b `feat/login-sso-wu07b` (wu07a)
- WU-8a `feat/login-sso-wu08a` (wu07b)
- WU-8b `feat/login-sso-wu08b` (wu08a)
- WU-9 `feat/login-sso-wu09` (wu08b)

Verificación común por WU (lo que aplique): backend `pnpm lint`, `pnpm typecheck`, `pnpm vitest run <rutas>`; frontend `JWT_SECRET=dummy pnpm lint`, `pnpm type-check`, `pnpm test`; raíz `node scripts/check-casts-en-specs.mjs` (el ratchet no debe subir: los mocks completos de repositorios llevan la línea nueva, sin casts). Specs de integración y e2e sobre bases de test compartidas: aplicar antes la migración master `20261010120000_login_sso` a `soporte_master_test` (una vez, desde la WU-1a); todo spec que trunca `soporte_master_test` llama `usarLockMasterTest()` (`src/testing/lock-master-test.ts`) antes de su `describe`; borrar solo lo que el spec creó. Tenant efímero: limpiar filas → `app.close()` → `dropDatabase`. Si la suite tira `PrismaClientKnownRequestError` masivo, comprobar primero la base (`pnpm prisma migrate status --schema prisma_tenant/schema.prisma`). El `pnpm test` completo del backend corre **solo** (sin otros procesos sobre la base) en la última WU de backend (WU-6) y el del frontend en la WU-9. Specs que no cambian: se prueba con `git diff --stat <rama base>..HEAD -- <rutas>` vacío.

Deuda de Ayuda (escritura suspendida desde 2026-09-07): anotar en el commit y en el cuerpo del PR de cada WU que cambie lo que el usuario ve o hace: WU-8a (botones "Continuar con Google/Microsoft", mensaje genérico de falla SSO, aterrizaje en `/login?sso=1`), WU-6 (la API de reseteo; la pantalla va en WU-8b) y WU-8b ("Resetear vínculo SSO"). Corregir solo un artículo existente que el cambio vuelva falso (p. ej. si alguno afirma que la única forma de entrar es email y contraseña).

Despliegue: solo la cadena completa. Sin las variables `SSO_*` no aparece ningún botón y el login con contraseña queda exactamente igual que hoy.

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 (WU-1a) | Spike de `jose` (gate), migración master M1, esquema Prisma, puerto y repo de `sso_estados` | PR 1 (base tracker) | `pnpm vitest run src/auth/infrastructure/sso/jose-humo.spec.ts src/auth/infrastructure/sso/prisma-sso-estado.repository.integration.spec.ts` | Criterios 1 a 5 del spike (`pnpm build` + `node -e "require(...)"`, `pnpm start`) e integración sobre `soporte_master_test` | `rollback.sql` de M1; sin consumidores |
| 2 (WU-1b) | Puerto y repo de vínculos, `findManyByEmailInsensitive`, 10 mocks | PR 2 (base PR1) | `pnpm vitest run src/auth/infrastructure/sso src/auth/infrastructure/persistence` | Integración sobre `soporte_master_test` (únicos, concurrencia, cascada, comodín `_`) | Repo y método nuevos; las 10 líneas de mock |
| 3 (WU-2a) | Dominio SSO, `CONFIGURACION_SSO`, validadores de Google y Microsoft | PR 3 (base PR2) | `pnpm vitest run src/auth/domain/sso src/auth/infrastructure/sso` | N/A: funciones puras sobre payloads | Archivos nuevos sin consumidores |
| 4 (WU-2b) | `JoseProveedorOidc`, `idp-falso`, borrar `jose-humo` | PR 4 (base PR3) | `pnpm vitest run src/auth/infrastructure/sso/jose-proveedor-oidc.spec.ts` | IdP falso en `node:http` `127.0.0.1:0` (`/token`, `/jwks`) y `node -e "require('./dist/...')"` tras `pnpm build` | Adaptador y su spec; el spike se restaura desde git |
| 5 (WU-3) | Extracción de `EvaluarSegundoPasoService` sin tocar specs existentes | PR 5 (base PR4) | `pnpm vitest run src/auth/application` y los e2e del login/2FA | e2e existentes verdes con diff vacío | `git revert` del commit de extracción |
| 6 (WU-4a) | `pkce`, `IniciarSsoUseCase`, `ListarProveedoresSsoUseCase` | PR 6 (base PR5) | `pnpm vitest run src/auth/application/sso` | N/A: unit con puertos mockeados | Casos de uso nuevos sin cableado |
| 7 (WU-4b) | `CompletarSsoUseCase`, pasos 1, 2 y 4 a 7 | PR 7 (base PR6) | `pnpm vitest run src/auth/application/sso/completar-sso.use-case.spec.ts` | N/A: unit con puertos mockeados | Caso de uso nuevo, inerte |
| 8 (WU-4c) | `CompletarSsoUseCase`, limitador, vínculo, segundo paso y ticket | PR 8 (base PR7) | `pnpm vitest run src/auth/application/sso/completar-sso.use-case.spec.ts` | N/A: unit con puertos mockeados | Los pasos 3 y 8 a 10, sin cableado |
| 9 (WU-5a) | `SsoController`, DTOs, cableado, `proveedores`, e2e básico, `pnpm start` | PR 9 (base PR8) | `pnpm vitest run test/sso.e2e.spec.ts` | e2e con `AuthModule` real e IdP falso; `GET /api/auth/sso/proveedores` → 200 | Controller y proveedores en `AuthModule` |
| 10 (WU-5b) | Matriz e2e del login SSO (solo tests) | PR 10 (base PR9) | `pnpm vitest run test/sso.e2e.spec.ts` | e2e completo con IdP falso | Solo el spec |
| 11 (WU-6) | `puedeResetearAUsuario`, `ResetearVinculoSso`, `DELETE /usuarios/:id/sso` | PR 11 (base PR10) | `pnpm vitest run src/auth/application test/usuarios-reseteo-sso.e2e.spec.ts test/usuarios-reseteo-tfa.e2e.spec.ts` | e2e con guards reales (204, 404 indistinguibles) | Caso de uso, ruta y política extraída |
| 12 (WU-7a) | BFF: cookies y ruta `iniciar` | PR 12 (base PR11) | frontend `pnpm vitest run src/app/api/auth/sso src/shared/auth` | N/A: Vitest con `fetch` simulado | Constantes y una ruta nueva |
| 13 (WU-7b) | BFF: rutas `callback` y `paso` | PR 13 (base PR12) | frontend `pnpm vitest run src/app/api/auth/sso` | N/A: Vitest con `fetch` simulado | Dos rutas nuevas |
| 14 (WU-8a) | Botones, hook de proveedores, efecto `?sso=1`, `AvisoMotivo`, `RUTAS_SIN_REFRESH` | PR 14 (base PR13) | frontend `pnpm vitest run src/features/auth src/shared/api` | N/A: Vitest + Testing Library + msw | Componentes y hook nuevos; cambios acotados en `use-login.ts` |
| 15 (WU-8b) | Botón admin "Resetear vínculo SSO" | PR 15 (base PR14) | frontend `pnpm vitest run src/features/usuarios` | N/A: Vitest + Testing Library + msw | Botón y mutación nuevos |
| 16 (WU-9) | README, runbook y notas de deploy | PR 16 (base PR15) | `node scripts/check-casts-en-specs.mjs` y `JWT_SECRET=dummy pnpm test` (frontend) | N/A: documentación | Archivos de documentación |

## Unidad 1 (WU-1a) — Spike `jose` (gate), migración M1 y repo de estados (~360 líneas)

Rama `feat/login-sso-wu01a` → target `feat/login-sso` (tracker). Requerimientos: SL9 (estado de un solo uso, atado al navegador), SL15 (solo dos tablas), SV1 (tabla de vínculos en M1). **Las tareas 1.1 a 1.4 son el gate del ciclo: ninguna tarea posterior arranca hasta que 1.4 pase.**

- [x] 1.1 Test `backend/src/auth/infrastructure/sso/jose-humo.spec.ts`: `humo()` firma y verifica un token RS256 con un par de claves generado y resuelve `'ok'`. (criterio 3 del spike)
- [x] 1.2 Agregar `jose@^6.2.8` a `backend/package.json` y `backend/pnpm-lock.yaml` (`pnpm add jose` en `backend/`; el lockfile solo cambia por esa dependencia). (ADR-2)
- [x] 1.3 Crear `backend/src/auth/infrastructure/sso/jose-humo.ts` con solo imports nombrados (`import { SignJWT, jwtVerify, generateKeyPair } from 'jose'`), nunca un import por defecto. (ADR-2)
- [x] 1.4 GATE del spike, los cinco criterios obligatorios: (1) `pnpm typecheck` con 0 errores **sin** shim; (2) `pnpm build` y `node -e "require('./dist/auth/infrastructure/sso/jose-humo.js').humo().then(console.log)"` imprime `ok`, sin `ERR_REQUIRE_ESM` ni `ERR_REQUIRE_ASYNC_MODULE` (un `ExperimentalWarning` se anota en `openspec/changes/login-sso/apply-progress.md` y no falla el spike); (3) `pnpm vitest run src/auth/infrastructure/sso/jose-humo.spec.ts` en verde; (4) `pnpm lint` con 0 errores; (5) `pnpm start` arranca (se repite en 9.5 con `AuthModule` importando el adaptador). Si falla el criterio 1 con TS7016: agregar el shim `backend/src/types/jose.d.ts` (`declare module 'jose' { export * from 'jose/dist/types/index'; }`), nunca `tsconfig paths` para jose. **Si falla el criterio 2: DETENERSE e informar al orquestador, sin intentar otro arreglo ni avanzar** (la opción siguiente, `module/moduleResolution: node16` para todo el backend, es una decisión aparte). Registrar el resultado de cada criterio en `apply-progress.md`. (ADR-2)
- [x] 1.5 Migración master `backend/prisma_master/migrations/20261010120000_login_sso/migration.sql` con `sso_estados` (PK `state_hash`, CHECK de `proveedor`, índice de `expira_at`), `usuarios_identidades_sso` (FK a `usuarios` con `ON DELETE CASCADE`, CHECK de `proveedor`, `UNIQUE (usuario_id, proveedor)`, `UNIQUE (proveedor, subject)`) y `usuarios_email_lower_idx ON usuarios (lower(email))` no único; y `rollback.sql` (`DROP INDEX IF EXISTS usuarios_email_lower_idx; DROP TABLE IF EXISTS usuarios_identidades_sso; DROP TABLE IF EXISTS sso_estados;`). Cabecera y nombres como `20261008120000_verificacion_dos_pasos`; sin seed, sin tabla de auditoría. Aplicarla a `soporte_master_test`, ejecutar el `rollback.sql` una vez y volver a aplicar la migración. (SV1, SL15)
- [x] 1.6 Actualizar `backend/prisma_master/schema.prisma` (`SsoEstado`, `UsuarioIdentidadSso`, back-relation `identidadesSso` en `Usuario`) y regenerar el cliente; `prisma migrate status` limpio sobre la base de test.
- [x] 1.7 Crear `backend/src/auth/domain/sso/proveedores-sso.ts` (`PROVEEDORES_SSO = ['GOOGLE','MICROSOFT'] as const`, tipo `ProveedorSso`) y el puerto `backend/src/auth/domain/ports/sso-estado-repository.port.ts` (`crear`, `consumir` con el CAS de ADR-1, token `SSO_ESTADO_REPOSITORY`). (ADR-1)
- [x] 1.8 Test de integración `prisma-sso-estado.repository.integration.spec.ts` (con `usarLockMasterTest()`): solo se persisten hashes (`state_hash`, `navegador_hash`); `consumir` devuelve `nonce`/`code_verifier`/`siguiente` una vez; segundo consumo → `null`; expirado → `null`; proveedor cruzado y navegador ajeno → `null` y la fila sigue consumible; `Promise.all` de dos consumos → exactamente una fila; la purga horaria borra lo vencido hace más de una hora y un fallo de purga no falla `crear`. (SL9)
- [x] 1.9 Implementar `backend/src/auth/infrastructure/sso/prisma-sso-estado.repository.ts` (único lugar con `@prisma/client` para esta tabla; `UPDATE ... RETURNING` de ADR-1 en una sentencia; `purgarSiCorresponde()` copiado de `prisma-limitador-intentos.ts`). (SL9)
- [x] 1.10 Mutaciones (documentar el rojo y revertir): quitar `usado_at IS NULL` del CAS → el consumo concurrente y el replay se ponen en rojo; quitar `navegador_hash` del CAS → el caso de navegador ajeno se pone en rojo. (invariantes del diseño)
- [x] 1.11 Verificación: backend `pnpm lint`, `pnpm typecheck`, `pnpm vitest run` de las rutas de la WU; raíz `node scripts/check-casts-en-specs.mjs`; confirmar M1 aplicada a `soporte_master_test` y la ejecución del rollback registrada.

## Unidad 2 (WU-1b) — Repo de vínculos, `findManyByEmailInsensitive` y 10 mocks (~300 líneas)

Rama `feat/login-sso-wu01b` → target `feat/login-sso-wu01a`. Requerimientos: SV1, SV2, SV5, SV6, SL2 (búsqueda sin distinguir mayúsculas).

- [x] 2.1 Test de integración `prisma-identidad-sso.repository.integration.spec.ts` (con `usarLockMasterTest()`): ambos únicos; `vincular` mismo sujeto → `VINCULADO` (idempotente); otro sujeto para el mismo usuario y proveedor → `OTRA_CUENTA`; el mismo sujeto de otro usuario → `OTRA_CUENTA`; `Promise.all` de dos `vincular` del mismo sujeto a usuarios distintos → un solo ganador; borrar el usuario borra sus vínculos (cascada); `eliminarTodasDeUsuario` devuelve la cantidad; `buscarUsuarioPorSujeto` sin fila → `null`. (SV1, SV5, SV6)
- [x] 2.2 Puerto `backend/src/auth/domain/ports/identidad-sso-repository.port.ts` (contrato del diseño ADR-4, token `IDENTIDAD_SSO_REPOSITORY`) e implementación `backend/src/auth/infrastructure/sso/prisma-identidad-sso.repository.ts` (`INSERT ... ON CONFLICT DO NOTHING` sin objetivo y relectura de `(usuario_id, proveedor)`). (SV1, SV2)
- [x] 2.3 Test de integración de `findManyByEmailInsensitive` (con `usarLockMasterTest()`): variante de mayúsculas encuentra la fila; `_` no es comodín (`juan_perez@x.com` no devuelve `juanXperez@x.com`); `LIMIT 2` con tres variantes devuelve dos; sin coincidencias → `[]`; `findByEmail` queda sin cambios (sigue exacto). (SL2)
- [x] 2.4 Agregar `findManyByEmailInsensitive(email)` a `backend/src/auth/domain/ports/i-usuario.repository.ts` e implementarlo en `backend/src/auth/infrastructure/persistence/prisma/prisma-usuario.repository.ts` con `$queryRaw` (`WHERE lower(email) = lower($1) LIMIT 2`), sin `mode: 'insensitive'`; `findByEmail` queda byte a byte igual. (ADR-5)
- [x] 2.5 Sumar una línea `findManyByEmailInsensitive: vi.fn()` a los 10 specs con mock completo de `IUsuarioRepository`, sin casts: `login`, `solicitar-reset-password`, `resetear-password-usuario-tenant`, `refresh-token`, `confirmar-reset-password` y `cambiar-password` `.use-case.spec.ts`; `desafio-login.use-cases.spec.ts`, `continuar-login.use-cases.spec.ts` y `desactivar-tfa.use-case.spec.ts` (con `satisfies`); `crear-cliente.use-case.spec.ts`. `git diff --stat` de la WU muestra una sola línea agregada en cada uno; `node scripts/check-casts-en-specs.mjs` no sube. (ADR-5)
- [x] 2.6 Verificación: backend `pnpm lint`, `pnpm typecheck`, `pnpm vitest run src/auth` (cubre las 10 specs editadas); raíz `node scripts/check-casts-en-specs.mjs`; si algún otro mock completo de `IUsuarioRepository` rompe el typecheck, sumarle la misma línea y anotarlo.

## Unidad 3 (WU-2a) — Dominio SSO, configuración y validadores (~390 líneas)

Rama `feat/login-sso-wu02a` → target `feat/login-sso-wu01b`. Requerimientos: SC1, SC2, SL3, SL4, SL5.

- [x] 3.1 Crear `backend/src/auth/domain/sso/` (slug ↔ proveedor, `IdentidadSsoVerificada`), `backend/src/auth/domain/errors/sso.errors.ts` (`SsoRechazadoError` con `motivo`, `SsoNoDisponibleError`) y el puerto `backend/src/auth/domain/ports/proveedor-oidc.port.ts` (`IProveedorOidc` + token), sin Prisma ni `jose`. (ADR-3)
- [x] 3.2 Test `configuracion-sso.spec.ts`: `obtener` devuelve `null` si `SSO_<P>_CLIENT_ID` o `SSO_<P>_CLIENT_SECRET` falta, está vacío o es solo espacios; con ambos devuelve las URLs fijadas del diseño y `redirectUri = ${APP_BASE_URL}/api/auth/sso/<slug>/callback`; lee el entorno en cada llamada (cambiarlo entre dos llamadas cambia el resultado); no depende de `Host`. (SC1, SC2)
- [x] 3.3 Implementar `backend/src/auth/infrastructure/sso/configuracion-sso.ts` (`ConfiguracionSsoDesdeEntorno` + token `CONFIGURACION_SSO`) con `const v = process.env.X; if (v === undefined || v.trim() === '') return null;`, nunca `?? ''`; no agregar las variables a `VARIABLES_REQUERIDAS`. `regla-env-vacio.lint.spec.ts` sigue verde. (ADR-10)
- [x] 3.4 Test `validar-claims-google.spec.ts`: `nonce` distinto; `email_verified` ausente, `false` y la cadena `"true"` → rechazo; `email` ausente o no string; `sub` vacío; `hd` presente acepta; devuelve `{ subject: sub, email }`. (SL3, SL5)
- [x] 3.5 Implementar `backend/src/auth/infrastructure/sso/validar-claims-google.ts`. (SL3, SL5)
- [x] 3.6 Test `validar-claims-microsoft.spec.ts`: `iss` ≠ plantilla con `tid`; `tid` no string; `ver` ≠ `'2.0'`; `nonce` distinto; falta `oid` o `tid`; `xms_edov` ausente, `false` y la cadena `"true"` → rechazo; `email` ausente con solo `preferred_username`/`upn`/`unique_name` → rechazo; subject = `tid:oid`. (SL4, SL5)
- [x] 3.7 Implementar `backend/src/auth/infrastructure/sso/validar-claims-microsoft.ts` (el emisor se compara después de la firma contra `plantillaEmisor`). (SL4, SL5)
- [x] 3.8 Mutación: quitar `xms_edov === true` del validador de Microsoft → el test de 3.6 se pone en rojo (documentar y revertir). (invariante del diseño)
- [x] 3.9 Verificación: backend `pnpm lint`, `pnpm typecheck`, `pnpm vitest run src/auth/domain/sso src/auth/infrastructure/sso`; raíz `node scripts/check-casts-en-specs.mjs`.

## Unidad 4 (WU-2b) — `JoseProveedorOidc`, IdP falso y baja del spike (~360 líneas)

Rama `feat/login-sso-wu02b` → target `feat/login-sso-wu02a`. Requerimientos: SL3, SL4, SL9 (PKCE y nonce), SL5.

- [x] 4.1 Crear `backend/src/testing/idp-falso.ts`: servidor `node:http` en `127.0.0.1:0` con `/token` y `/jwks`, claves con `generateKeyPair`/`exportJWK`, firma con `SignJWT`, claims configurables por caso, contador de llamadas al `/token`. Queda fuera del build (`tsconfig.build.json` excluye `src/testing/**`). (ADR-2)
- [x] 4.2 Test `jose-proveedor-oidc.spec.ts` contra el IdP falso: firma inválida; `aud` distinto; `iss` distinto en Google; vencido y `nbf` futuro; `nonce` distinto; alg `none` y HS256 → rechazo; Microsoft con `iss` ≠ `tid` y `ver` ≠ `2.0`; el body del `/token` usa `client_secret_post` con `code_verifier` y `redirect_uri`; respuesta no 2xx del `/token` y caída de red lanzan (500), no son rechazo; el rechazo lleva `motivo` `TOKEN_INVALIDO` o `EMAIL_NO_VERIFICADO`. (SL3, SL4, SL5, SL9)
- [x] 4.3 Implementar `backend/src/auth/infrastructure/sso/jose-proveedor-oidc.ts` (`createRemoteJWKSet` memoizado por URL, `algorithms: ['RS256']`, `clockTolerance: 30`, `AbortSignal.timeout(10_000)`, URL de autorización con los parámetros de ADR-2). Es el único importador de `jose` en producción. (ADR-2)
- [x] 4.4 Borrar `backend/src/auth/infrastructure/sso/jose-humo.ts` y su spec; `rg "jose-humo" backend/src` no devuelve nada. (ADR-2)
- [x] 4.5 Verificación: backend `pnpm lint`, `pnpm typecheck`, `pnpm vitest run src/auth/infrastructure/sso`; `pnpm build` y `node -e "require('./dist/auth/infrastructure/sso/jose-proveedor-oidc.js')"` sin `ERR_REQUIRE_ESM`; `rg "from 'jose'" backend/src` solo en el adaptador y en `src/testing`; raíz `node scripts/check-casts-en-specs.mjs`.

## Unidad 5 (WU-3) — Extracción de `EvaluarSegundoPasoService` (~200 líneas)

Rama `feat/login-sso-wu03` → target `feat/login-sso-wu02b`. Requerimientos: L1, D3, SL11, SL8 (el login con contraseña no cambia). Prueba de que no cambia: los specs existentes pasan **sin ninguna edición**.

- [x] 5.1 Test `backend/src/auth/application/evaluar-segundo-paso.service.spec.ts` con las ramas de hoy: obligado sin 2FA → `needsEnrolamiento2fa`; con 2FA y sin dispositivo → `needs2fa`; con dispositivo válido → `continuar` con `dispositivoRenovado` renovado por `DISPOSITIVO_CONFIABLE_DURACION_MS`; ROOT excluido del dispositivo; no obligado → `continuar`. Mocks completos, sin casts. (D3, SL11, L1)
- [x] 5.2 Crear `backend/src/auth/application/evaluar-segundo-paso.service.ts` moviendo textualmente `login.use-case.ts:176-203` (`tfaRepo.obtener`, exclusión ROOT, `renovar`, `esObligado2fa`). (ADR-6)
- [x] 5.3 Modificar `backend/src/auth/application/use-cases/login.use-case.ts`: construye el servicio internamente, igual que `EmitirSesionService`; conserva su constructor de 11 parámetros; `dispositivoRenovado` sigue alimentando `selection` y `tokens`. (ADR-6, SL8)
- [x] 5.4 Registrar el servicio como provider en `backend/src/auth/auth.module.ts`. Si `auth.module.spec.ts` se rompe sin editarlo, mover este registro a 9.3 y anotarlo. (ADR-6)
- [x] 5.5 Prueba de no cambio: `git diff --stat feat/login-sso-wu02b..HEAD` sobre `login.use-case.spec.ts`, `continuar-login.use-cases.spec.ts`, `auth.controller.spec.ts`, `auth.module.spec.ts` y los e2e `login-2fa`, `dispositivo-confiable`, `limite-intentos`, `auth`, `tfa-login`, `tfa-secreto-indescifrable` devuelve vacío, y todos corren en verde. (ADR-6, L1, D3)
- [x] 5.6 Verificación: backend `pnpm lint`, `pnpm typecheck`, `pnpm vitest run src/auth/application` y los seis e2e anteriores; raíz `node scripts/check-casts-en-specs.mjs`.

## Unidad 6 (WU-4a) — `pkce`, `IniciarSso` y `ListarProveedoresSso` (~240 líneas)

Rama `feat/login-sso-wu04a` → target `feat/login-sso-wu03`. Requerimientos: SL9, SL10, SC2, SC3.

- [x] 6.1 Test `pkce.spec.ts`: el desafío S256 coincide con el vector de la RFC 7636; el verifier cumple longitud y alfabeto; dos generaciones difieren; `sha256` hex estable. (SL9)
- [x] 6.2 Crear `backend/src/auth/application/sso/pkce.ts` (`node:crypto`). (SL9)
- [x] 6.3 Test `iniciar-sso.use-case.spec.ts`: la URL lleva `response_type=code`, `scope=openid email profile`, `state`, `nonce`, `code_challenge` S256, `response_mode=query`, `prompt=select_account`, `redirect_uri` y `client_id`; solo se persisten `state_hash` y `navegador_hash` (el `state` y el `bindingToken` crudos no); `expira_at` = ahora + 10 minutos; `siguiente` se guarda ya saneado; proveedor sin configuración → `SsoNoDisponibleError`; devuelve `authorizeUrl` y `bindingToken`. (SL9, SL10, SC2)
- [x] 6.4 Implementar `backend/src/auth/application/sso/iniciar-sso.use-case.ts`. (SL9, SL10)
- [x] 6.5 Test `listar-proveedores-sso.use-case.spec.ts`: devuelve solo slugs de proveedores con configuración válida, en minúsculas; ninguno configurado → lista vacía. (SC2, SC3)
- [x] 6.6 Implementar `backend/src/auth/application/sso/listar-proveedores-sso.use-case.ts`. (SC3)
- [x] 6.7 Verificación: backend `pnpm lint`, `pnpm typecheck`, `pnpm vitest run src/auth/application/sso`; raíz `node scripts/check-casts-en-specs.mjs`.

## Unidad 7 (WU-4b) — `CompletarSsoUseCase`: pasos 1, 2 y 4 a 7 (~230 líneas)

Rama `feat/login-sso-wu04b` → target `feat/login-sso-wu04a`. Requerimientos: SL1, SL2, SL3, SL4, SL5, SL6, SL7, SL13, SV2, SV3, SV4, SV6, SL15. El caso de uso queda inerte (no está cableado); deja un punto de inserción para el limitador de la unidad 8.

- [x] 7.1 Test `completar-sso.use-case.spec.ts` (filas 1, 2 y 4 a 7 de ADR-7): CAS en cero filas → `ESTADO_INVALIDO` **sin llamar al IdP**; token inválido y email no verificado propagan su `motivo`; error de red se propaga sin convertirse en rechazo; resolución primero por vínculo (un cambio de email igual entra) y después por `findManyByEmailInsensitive`; cero filas → `SIN_USUARIO`; dos filas → `AMBIGUO`; usuario inactivo, borrado o sin `activo` → `INACTIVO`; `isGlobalAdmin` → `ROOT` también para un usuario ya vinculado; sin membresías activas → `SIN_MEMBRESIA`; ningún camino crea usuario, membresía ni cliente; el log `SSO_RECHAZADO` lleva proveedor, motivo y `usuarioId` pero nunca email, sujeto crudo ni token. (SL1, SL2, SL3, SL4, SL5, SL6, SL7, SL13, SV3, SV4, SL15)
- [x] 7.2 Implementar `backend/src/auth/application/sso/completar-sso.use-case.ts` hasta el paso 7, con el orden de ADR-7 y un punto de inserción documentado para el paso 3. (SL1, SL2, SL6, SL7, SV2, SV6)
- [x] 7.3 Mutación: quitar el chequeo `isGlobalAdmin` (paso 6) → el test de ROOT de 7.1 se pone en rojo (documentar y revertir; el e2e equivalente va en 10.5). (invariante del diseño)
- [x] 7.4 Verificación: backend `pnpm lint`, `pnpm typecheck`, `pnpm vitest run src/auth/application/sso`; raíz `node scripts/check-casts-en-specs.mjs`.

## Unidad 8 (WU-4c) — `CompletarSsoUseCase`: limitador, vínculo, segundo paso y ticket (~210 líneas)

size:exception: 404 líneas con docs y 375 sin ellas; no hay costura que mantenga la unidad junta.

Rama `feat/login-sso-wu04c` → target `feat/login-sso-wu04b`. Requerimientos: I9, SL11, SL12, L1, L7, SV2, SV4, SV6, SL13.

- [x] 8.1 Ampliar `completar-sso.use-case.spec.ts` (pasos 3 y 8 a 10): `reservar` con la clave exacta `sso:<PROVEEDOR>:<sha256(subject)>:<ip>` entre el paso 2 y el 4; `BLOQUEADO` si el límite se agotó; los pasos 4 a 8 que fallan dejan la reserva como falla; `liberar` solo después del paso 8; **`vincular` no se llama** si el usuario es inactivo, ROOT o sin membresías; solo se vincula cuando se resolvió por email; `OTRA_CUENTA` → rechazo; resultado `needs2fa`, `needsEnrolamiento2fa` o, para `continuar`, `desafios.crear(id,'SELECCIONAR')` con el ticket y el `dispositivoConfiable` renovado; `siguiente` pasa tal cual; el SSO no cuenta como segundo paso. (I9, SL11, SL12, L1, L7, SV2, SV4, SV6, SL13)
- [x] 8.2 Completar `completar-sso.use-case.ts`: insertar el limitador antes del paso 4 y agregar `vincular`, `liberar`, `EvaluarSegundoPasoService.evaluar` y la emisión del ticket; `ContinuarLoginUseCase` y `SeleccionarClienteLoginUseCase` quedan sin cambios y siguen siendo los únicos emisores. (ADR-7)
- [x] 8.3 Mutaciones: quitar `liberar` o mover `reservar` después del rechazo → rojo en el test de la clave y del orden; mover los pasos 5 a 7 después de `vincular` → rojo en "vincular no se llama" (documentar y revertir). (invariantes del diseño)
- [x] 8.4 Verificación: backend `pnpm lint`, `pnpm typecheck`, `pnpm vitest run src/auth/application`; raíz `node scripts/check-casts-en-specs.mjs`.

## Unidad 9 (WU-5a) — `SsoController`, cableado y e2e básico (~400 líneas)

Rama `feat/login-sso-wu05a` → target `feat/login-sso-wu04c`. Requerimientos: SC2, SC3, SL9, SL13. Si el diff real supera 400, los casos "expirado" y "proveedor cruzado" pasan a la unidad 10.

- [ ] 9.1 e2e `backend/test/sso.e2e.spec.ts` básico (`Test.createTestingModule({ imports: [SharedModule, AuthModule] })`, listener real, IdP falso inyectado con `.overrideProvider(CONFIGURACION_SSO)`, `usarLockMasterTest()`): `GET /auth/sso/proveedores` lista solo los configurados; proveedor deshabilitado → 404; slug desconocido → 404; `iniciar` devuelve `authorizeUrl` y `bindingToken` y persiste solo hashes; replay del mismo `state` → 401 y el `/token` del IdP falso se llamó una vez; `sso_st` de otro flujo → 401 con la fila aún consumible; estado vencido → 401; proveedor cruzado → 401; las respuestas de rechazo son idénticas entre sí. (SC2, SC3, SL9, SL13)
- [ ] 9.2 Crear `backend/src/auth/interface/controllers/sso.controller.ts` (`GET /auth/sso/proveedores`, `POST /auth/sso/:proveedor/iniciar`, `POST /auth/sso/:proveedor/callback`; slug validado contra `PROVEEDORES_SSO`; sin lógica) y `backend/src/auth/interface/dtos/sso.dto.ts`. Todo rechazo responde el mismo 401. (SL13)
- [ ] 9.3 Cablear en `backend/src/auth/auth.module.ts`: repositorios, `ConfiguracionSsoDesdeEntorno`, `JoseProveedorOidc`, los tres casos de uso y `SsoController`. (ADR-1, ADR-7)
- [ ] 9.4 Mutaciones: quitar `usado_at IS NULL` y quitar `navegador_hash` del CAS → el e2e de replay y el de binding ajeno se ponen en rojo (documentar y revertir). (invariantes del diseño)
- [ ] 9.5 Criterio 5 del spike: `pnpm start` arranca con `AuthModule` importando el adaptador y `GET /api/auth/sso/proveedores` responde 200 (con y sin variables `SSO_*`); registrar en `apply-progress.md`. (ADR-2)
- [ ] 9.6 Verificación: backend `pnpm lint`, `pnpm typecheck`, `pnpm vitest run test/sso.e2e.spec.ts src/auth`; raíz `node scripts/check-casts-en-specs.mjs`.

## Unidad 10 (WU-5b) — Matriz e2e del login SSO (solo tests, ~380 líneas)

Rama `feat/login-sso-wu05b` → target `feat/login-sso-wu05a`. **PR de solo tests, aceptable porque todo el código que prueba ya está mergeado en el PR anterior (WU-5a) y en las unidades 6 a 8.** Requerimientos: SL1, SL2, SL3, SL5, SL6, SL7, SL11, SL12, SL13, SL15, SV2 a SV6, L1, L7, D3, I9.

- [ ] 10.1 Agregar a `backend/test/sso.e2e.spec.ts`: primer ingreso por email vincula; segundo ingreso por sujeto con el email cambiado entra; otro sujeto con el mismo email → 401 y sin vínculo nuevo; variante de mayúsculas del email entra; cuenta ya vinculada a U1 con email de U2 entra como U1. (SL1, SL2, SV2, SV3, SV4, SV6)
- [ ] 10.2 Agregar los rechazos: email ambiguo (dos filas), usuario inactivo, usuario borrado, sin membresías, email no verificado de Google, token de Microsoft con `iss` ≠ `tid`; todas las respuestas idénticas y el motivo solo en el log. (SL3, SL5, SL7, SL13)
- [ ] 10.3 Agregar el segundo paso y el selector: usuario con 2FA → `needs2fa`; obligado sin 2FA → `needsEnrolamiento2fa`; dispositivo confiable vigente omite el desafío y se renueva; una membresía → `continuar` entrega tokens; dos membresías → selector con ticket canjeable una sola vez; el 2FA propio se pide aunque el proveedor haya verificado en dos pasos. (SL11, SL12, L1, L7, D3)
- [ ] 10.4 Agregar concurrencia y límites: dos primeros ingresos concurrentes del mismo sujeto → un ganador; el límite por proveedor, sujeto e IP bloquea tras agotarse y `liberar` limpia tras un éxito; ningún flujo crea filas en `usuarios`, membresías ni clientes. (SV5, I9, SL15)
- [ ] 10.5 Mutaciones e2e: quitar el chequeo de ROOT → ROOT con email verificado deja de dar 401 y aparece fila en `usuarios_identidades_sso`/`auth_desafios` (rojo); quitar `xms_edov === true` → el token de Microsoft sin `xms_edov` deja de dar 401 (rojo); documentar y revertir. (SL6, SL5, invariantes del diseño)
- [ ] 10.6 Verificación: backend `pnpm lint`, `pnpm typecheck`, `pnpm vitest run test/sso.e2e.spec.ts`; raíz `node scripts/check-casts-en-specs.mjs`.

## Unidad 11 (WU-6) — Reseteo del vínculo SSO y política compartida (~390 líneas)

Rama `feat/login-sso-wu06` → target `feat/login-sso-wu05b`. Requerimientos: SV7, SV8, SC5. Última WU de backend: corre el `pnpm test` completo.

- [ ] 11.1 Test `politica-reseteo-usuario.spec.ts` con las cinco reglas de ADR-8: objetivo inexistente → `false`; actor ROOT → `true` (incluso objetivo ROOT, inactivo o borrado); objetivo ROOT → `false`; sin membresía activa en el cliente del actor → `false`; membresías (incluidas inactivas, borradas y de clientes suspendidos) todas en el cliente del actor. (SV8)
- [ ] 11.2 Crear `backend/src/auth/application/politica-reseteo-usuario.ts` moviendo textualmente `resetear-tfa-usuario.use-case.ts:62-74` y modificar `backend/src/auth/application/tfa/resetear-tfa-usuario.use-case.ts` para usarla; su spec y `usuarios-reseteo-tfa.e2e.spec.ts` quedan sin editar (`git diff --stat` vacío). (SV8, ADR-8)
- [ ] 11.3 Test `resetear-vinculo-sso.use-case.spec.ts`: denegado → `MembresiaNoEncontradaError` (mismo 404 para toda denegación); autorizado → `eliminarTodasDeUsuario` y luego `revokeAllByUsuarioId`; la revocación que lanza se loguea y no deshace el borrado; sin vínculos → 204; no toca contraseña, 2FA ni membresías; los dispositivos de confianza se conservan. (SV7, SV8)
- [ ] 11.4 Implementar `backend/src/auth/application/sso/resetear-vinculo-sso.use-case.ts` y agregar `DELETE :id/sso` a `backend/src/auth/interface/controllers/usuarios.controller.ts` (`JwtAuthGuard, TenantGuard` por clase y `AdminClienteGuard` por método; `clienteId = actor.cliente_id`; JSDoc de rutas actualizado); no existe ruta de autoservicio para el propio usuario. (SV7, SV8, SC5)
- [ ] 11.5 e2e `backend/test/usuarios-reseteo-sso.e2e.spec.ts` (tenant efímero, `usarLockMasterTest()`): ROOT resetea a cualquiera; ADMINISTRADOR de un solo cliente → 204; ADMINISTRADOR con usuario multicliente → 404; membresía inactiva en otro cliente → 404; objetivo ROOT → 404; inexistente y de otro cliente con respuestas idénticas; ROOT sobre ROOT → 204 sin efecto; refresh tokens revocados; revinculación posterior; un usuario sin permiso de administración no puede resetear ni a sí mismo (403/404). (SV7, SV8, SC5)
- [ ] 11.6 Verificación: backend `pnpm lint`, `pnpm typecheck`, `pnpm vitest run src/auth test/usuarios-reseteo-sso.e2e.spec.ts test/usuarios-reseteo-tfa.e2e.spec.ts`, y luego `pnpm test` completo **corrido solo**; raíz `node scripts/check-casts-en-specs.mjs`. Deuda de Ayuda anotada (la pantalla llega en la unidad 15).

## Unidad 12 (WU-7a) — BFF: cookies y ruta `iniciar` (~250 líneas)

Rama `feat/login-sso-wu07a` → target `feat/login-sso-wu06`. Requerimientos: SL9, SL10, SL14.

- [ ] 12.1 Test `frontend/src/app/api/auth/sso/[proveedor]/iniciar/route.test.ts` (patrón `route.test.ts` con `fetch` simulado): slug fuera de `google|microsoft` → `sso-error`; `siguiente` pasa por `destinoPosLogin` (un destino externo se descarta); cookie `sso_st` httpOnly, `sameSite: lax`, `Path=/`, 600 s, con `__Host-` en producción; redirige 302 a `authorizeUrl`; cualquier falla del backend → 302 `/login?motivo=sso-error`. (SL9, SL10, SL14)
- [ ] 12.2 Agregar a `frontend/src/shared/auth/cookies.ts` `COOKIE_SSO_ESTADO="sso_st"`, `COOKIE_SSO_PASO="sso_paso"`, `SSO_ESTADO_MAX_AGE=600`, `SSO_PASO_MAX_AGE=120` con los helpers `cookieAttrs`/`clearCookieAttrs` existentes. (SL14)
- [ ] 12.3 Crear `frontend/src/app/api/auth/sso/[proveedor]/iniciar/route.ts`. (SL9, SL10)
- [ ] 12.4 Verificación: frontend `JWT_SECRET=dummy pnpm lint`, `pnpm type-check`, `pnpm vitest run src/app/api/auth/sso src/shared/auth`; raíz `node scripts/check-casts-en-specs.mjs`.

## Unidad 13 (WU-7b) — BFF: rutas `callback` y `paso` (~360 líneas)

Rama `feat/login-sso-wu07b` → target `feat/login-sso-wu07a`. Requerimientos: SL13, SL14, SL10.

- [ ] 13.1 Test `frontend/src/app/api/auth/sso/[proveedor]/callback/route.test.ts`: siempre borra `sso_st`; `error=access_denied` → 302 `/login` sin mensaje; cualquier otro `error`, falta de `code`, `state` o cookie, y respuesta no 2xx o error de red → `motivo=sso-error`; el `dispositivoConfiable` de la URL se ignora y se usa solo el de la cookie `td`; reenvía `x-soporte-ip-navegador`; éxito deja `sso_paso` httpOnly de 120 s con `{k,t}` (nunca un JWT), vuelve a fijar `td` si el backend lo renueva, y redirige a `/login?sso=1` con `destinoPosLogin` aplicado a `siguiente`, `Cache-Control: no-store` y `Referrer-Policy: no-referrer`. (SL13, SL14, SL10)
- [ ] 13.2 Crear `frontend/src/app/api/auth/sso/[proveedor]/callback/route.ts`. (SL13, SL14)
- [ ] 13.3 Test `frontend/src/app/api/auth/sso/paso/route.test.ts`: POST lee, borra y valida la forma de `sso_paso`; devuelve `{needs2fa,desafio}`, `{needsEnrolamiento2fa,desafio}` o `{ticket}`; segunda lectura → 404; cookie ausente o con forma inválida → 404; un GET no consume la cookie. (SL14)
- [ ] 13.4 Crear `frontend/src/app/api/auth/sso/paso/route.ts`. (SL14)
- [ ] 13.5 Verificación: frontend `JWT_SECRET=dummy pnpm lint`, `pnpm type-check`, `pnpm vitest run src/app/api/auth/sso`; raíz `node scripts/check-casts-en-specs.mjs`.

## Unidad 14 (WU-8a) — Botones, efecto `?sso=1`, `AvisoMotivo` y `RUTAS_SIN_REFRESH` (~390 líneas)

Rama `feat/login-sso-wu08a` → target `feat/login-sso-wu07b`. Requerimientos: SC3, SC4, SC5, SL12, SL13, SL14. Los tests de vista corrieron ~1,5x el pronóstico en el ciclo anterior: si el diff supera 400, aplicar la partición 8a-i / 8a-ii del encabezado.

- [ ] 14.1 Test de `useProveedoresSso` y `BotonesSso` (msw): `GET auth/sso/proveedores` valida con el schema espejo; un botón por proveedor listado y ninguno si la lista está vacía; el enlace es `<a href="/api/auth/sso/<slug>/iniciar?siguiente=…">` (navegación completa); visibles solo con `paso === 'credenciales'`; ningún control de vincular o desvincular en la pantalla del propio usuario. (SC3, SC4, SC5)
- [ ] 14.2 Crear `frontend/src/features/auth/hooks/use-proveedores-sso.ts`, `frontend/src/features/auth/components/botones-sso.tsx` (presentacional), el schema en `frontend/src/features/auth/schemas.ts` y montarlo en `frontend/src/app/(auth)/login/page.tsx`. (SC3, SC4)
- [ ] 14.3 Test del efecto `?sso=1` en `use-login`: cada clase (`2fa`, `enrol`, `ticket`) continúa el flujo existente (`alResponder` / `continuarMutation`); bajo StrictMode llama a `paso` una sola vez (guarda con `useRef`); 404 → toast con el mensaje genérico; `history.replaceState` quita `sso` y conserva `siguiente`; `alResponder` reinicia `soporte:idle:last-activity`. (SL12, SL14)
- [ ] 14.4 Modificar `frontend/src/features/auth/hooks/use-login.ts` con el efecto de montaje de ADR-9. (SL12, SL14)
- [ ] 14.5 Test de `AvisoMotivo` (`motivo=sso-error` → `role="alert"` con el texto genérico único de la spec, el mismo para todo motivo) y de `RUTAS_SIN_REFRESH` (contiene `"auth/sso/paso"`). (SL13)
- [ ] 14.6 Modificar `frontend/src/features/auth/components/AvisoMotivo.tsx` y `frontend/src/shared/api/client.ts` (`RUTAS_SIN_REFRESH`). (SL13)
- [ ] 14.7 Verificación: frontend `JWT_SECRET=dummy pnpm lint`, `pnpm type-check`, `pnpm vitest run src/features/auth src/shared/api src/app`; raíz `node scripts/check-casts-en-specs.mjs`. Deuda de Ayuda anotada (botones SSO, mensaje genérico de falla).

## Unidad 15 (WU-8b) — Botón admin "Resetear vínculo SSO" (~180 líneas)

Rama `feat/login-sso-wu08b` → target `feat/login-sso-wu08a`. Requerimientos: SV7, SV8.

- [ ] 15.1 Test del botón y de `useResetearVinculoSsoUsuarioTenant`: el botón "Resetear vínculo SSO" aparece junto a "Resetear 2FA" y abre `ConfirmDialog`; confirmar llama `DELETE usuarios/:id/sso` e invalida la query; un 404 muestra el mismo mensaje neutro que el reseteo de 2FA; éxito → toast. (SV7, SV8)
- [ ] 15.2 Agregar `useResetearVinculoSsoUsuarioTenant` en `frontend/src/features/usuarios/hooks/use-usuarios-tenant-mutations.ts`. (SV7)
- [ ] 15.3 Agregar el botón con `ConfirmDialog` en `frontend/src/features/usuarios/components/editar-usuario-dialog.tsx`. (SV7, SV8)
- [ ] 15.4 Verificación: frontend `JWT_SECRET=dummy pnpm lint`, `pnpm type-check`, `pnpm vitest run src/features/usuarios`; raíz `node scripts/check-casts-en-specs.mjs`. Deuda de Ayuda anotada ("Resetear vínculo SSO").

## Unidad 16 (WU-9) — README, runbook y notas de deploy (~140 líneas)

Rama `feat/login-sso-wu09` → target `feat/login-sso-wu08b`. Requerimientos: SC1, SC2 (documentación operativa), SL8.

- [ ] 16.1 `README.md`: sumar a la tabla de variables de entorno (alrededor de las líneas 148 a 161) las cuatro `SSO_GOOGLE_CLIENT_ID`, `SSO_GOOGLE_CLIENT_SECRET`, `SSO_MICROSOFT_CLIENT_ID`, `SSO_MICROSOFT_CLIENT_SECRET`, todas opcionales; un proveedor se habilita solo con su par completo. (SC1, SC2)
- [ ] 16.2 `DEPLOY-VPS-runbook.md`, Google Cloud Console: cliente OAuth de tipo Web, pantalla de consentimiento publicada, URIs de redirección `https://soporte.sesitec.net/api/auth/sso/google/callback` y `http://localhost:<puerto>/…` para desarrollo. (SC1)
- [ ] 16.3 `DEPLOY-VPS-runbook.md`, registro de la app en Entra: `signInAudience = AzureADandPersonalMicrosoftAccount`; URI web `…/api/auth/sso/microsoft/callback`; claims opcionales `email` y `xms_edov` en el ID token (procedimiento del manifiesto **por confirmar en staging**, resultado a registrar); `PATCH /applications/{id}/authenticationBehaviors {"removeUnverifiedEmailClaim": true}` a registrar; el secreto vence en 24 meses como máximo: recordatorio de calendario y procedimiento de rotación (editar `backend/.env` y reiniciar el servicio). (SL5, SC1)
- [ ] 16.4 `DEPLOY-VPS-runbook.md`, smoke y mitigación: `GET /api/auth/sso/proveedores`; seguir `iniciar` y comprobar que IIS/ARR conserva el `Host` original (`request.url` arma `https://soporte.sesitec.net/login?...`); `/api/auth/sso/*` llega a Next sin cambios; registrar `nssm get soporte-backend Application` (binario de Node en uso, Node 22.12 o superior); confirmar que no hay variable MACHINE `SSO_*` obsoleta; mitigación rápida sin revert: quitar las `SSO_*` y reiniciar (desaparecen los botones y el login con contraseña queda como hoy). (SL8)
- [ ] 16.5 Notas de deploy en el cuerpo del PR del tracker: migración master `20261010120000_login_sso` con `rollback.sql` por `migrate:master` dentro de la ventana de `soporte/predeploy-dump.ps1` (aditiva; el rollback es destructivo: los vínculos se pierden y se revinculan en el siguiente SSO, y se revierte primero el código); sin cambio en `deploy.ps1`; dependencia nueva `jose` (el lockfile cambia); variables `SSO_*` opcionales; despliegue solo de la cadena completa; qué falta hacer antes de activar (crear las apps en las consolas, cargar las variables, smoke); deuda de Ayuda consolidada (botones SSO, mensaje genérico de falla, "Resetear vínculo SSO"). (SC1, SL8)
- [ ] 16.6 Verificación final: frontend `JWT_SECRET=dummy pnpm lint`, `pnpm type-check`, `pnpm test` completo; backend `pnpm lint` y `pnpm typecheck`; raíz `node scripts/check-casts-en-specs.mjs`; `node scripts/check-roadmap-fresco.mjs` si aplica a esta rama; `rg "todo\|TODO\|FIXME" openspec/changes/login-sso` sin pendientes de implementación.

> **V.1 — chequeo manual en staging (ítem de la fase verify, a cargo del dueño; no es tarea de apply ni bloquea la cadena):** una vez creadas las app registrations de Google y de Microsoft y cargadas las variables en staging, probar con una cuenta real de Google, una cuenta de trabajo de Microsoft y una cuenta **personal** de Microsoft: que lleguen `email`, `xms_edov` y `oid`; que se cree el vínculo; que el segundo ingreso reconozca por sujeto; el 2FA propio; y el selector con dos membresías. Registrar el resultado y el procedimiento confirmado del manifiesto de Entra (16.3) en `verify-report.md`. Si las cuentas personales de Microsoft no emiten `email` + `xms_edov` + `oid`, quedan rechazadas por diseño y se declaran como Desviación ("cuentas personales") al cierre; no es un cambio de código.

> **V.2 — cierre posterior al deploy (paso de entrega, fuera de la lista de tareas de implementación; no bloquea el archive):** DESPUÉS del deploy de la cadena completa, de la activación de los proveedores y del smoke: en `docs/roadmap-comercial.md` marcar el punto 7 de la segunda etapa como Entregado y declarar **Cumplida** o **Desviación** (con motivo) en la viñeta "Segunda etapa, punto 7 — login con Google o Microsoft (SSO)" de "Decisiones de producto de la segunda etapa", incluidas las "Precisiones del 2026-10-09, al explorar"; correr `node scripts/check-roadmap-fresco.mjs`. Desviaciones a declarar si se confirman: cuentas personales de Microsoft rechazadas (V.1), y el diseño ubica la viñeta del roadmap en la WU-9 mientras aquí va después del deploy para no declarar Cumplida algo no entregado.

## Cobertura de requerimientos (para verify)

| Spec | Requerimiento | Unidad / tareas |
|------|---------------|-----------------|
| `auth-sso-login` | SL1 Solo usuarios existentes, sin alta automática | U7 (7.1), U10 (10.1, 10.4) |
| `auth-sso-login` | SL2 Orden de resolución del usuario | U2 (2.3-2.4), U7 (7.1-7.2), U10 (10.1) |
| `auth-sso-login` | SL3 Validación del token de Google | U3 (3.4-3.5), U4 (4.2-4.3), U10 (10.2) |
| `auth-sso-login` | SL4 Validación del token de Microsoft | U3 (3.6-3.8), U4 (4.2-4.3), U10 (10.5) |
| `auth-sso-login` | SL5 Cualquier cuenta, solo con email verificado (nOAuth) | U3 (3.4-3.8), U4 (4.2), U10 (10.2, 10.5), U16 (16.3) |
| `auth-sso-login` | SL6 ROOT no entra por SSO | U7 (7.1-7.3), U10 (10.5) |
| `auth-sso-login` | SL7 Inactivo, eliminado o sin membresías se rechaza | U7 (7.1-7.2), U10 (10.2) |
| `auth-sso-login` | SL8 Convive con la contraseña | U5 (5.3, 5.5), U9 (9.5), U16 (16.4) |
| `auth-sso-login` | SL9 Defensa contra login CSRF y reutilización | U1 (1.7-1.10), U4 (4.2-4.3), U6 (6.1-6.4), U9 (9.1, 9.4), U12 (12.1, 12.3) |
| `auth-sso-login` | SL10 Redirección posterior por la lista permitida | U6 (6.3-6.4), U12 (12.1, 12.3), U13 (13.1-13.2) |
| `auth-sso-login` | SL11 El 2FA propio se pide después del SSO | U5 (5.1-5.5), U8 (8.1-8.2), U10 (10.3) |
| `auth-sso-login` | SL12 El selector de cliente no cambia | U8 (8.1-8.2), U10 (10.3), U14 (14.3-14.4) |
| `auth-sso-login` | SL13 Mensaje de falla único; motivo solo en logs | U7 (7.1), U8 (8.1), U9 (9.1-9.2), U10 (10.2), U13 (13.1-13.2), U14 (14.5-14.6) |
| `auth-sso-login` | SL14 Entrega al navegador sin tokens ni datos sensibles | U12 (12.1-12.3), U13 (13.1-13.4), U14 (14.3-14.4) |
| `auth-sso-login` | SL15 Lo que queda fuera de esta entrega no existe | U1 (1.5), U7 (7.1), U10 (10.4) |
| `auth-sso-vinculo` | SV1 Un vínculo por proveedor y usuario; una cuenta, un usuario | U1 (1.5), U2 (2.1-2.2) |
| `auth-sso-vinculo` | SV2 El primer ingreso vincula por el identificador inmutable | U2 (2.1-2.2), U7 (7.2), U8 (8.1-8.2), U10 (10.1) |
| `auth-sso-vinculo` | SV3 Los ingresos siguientes se reconocen por el vínculo | U7 (7.1), U10 (10.1) |
| `auth-sso-vinculo` | SV4 Otra cuenta con el mismo email no entra | U7 (7.1), U8 (8.1), U10 (10.1) |
| `auth-sso-vinculo` | SV5 Primeros ingresos concurrentes: gana el primero | U2 (2.1-2.2), U10 (10.4) |
| `auth-sso-vinculo` | SV6 Una cuenta del proveedor no sirve para dos usuarios | U2 (2.1-2.2), U7 (7.2), U8 (8.1), U10 (10.1) |
| `auth-sso-vinculo` | SV7 Un solo reseteo borra vínculos y cierra sesiones | U11 (11.3-11.5), U15 (15.1-15.3) |
| `auth-sso-vinculo` | SV8 Quién puede resetear: el criterio del 2FA | U11 (11.1-11.2, 11.5), U15 (15.1, 15.3) |
| `auth-sso-configuracion` | SC1 Una app por proveedor, configurada en el servidor | U3 (3.2-3.3), U16 (16.1-16.3, 16.5) |
| `auth-sso-configuracion` | SC2 Proveedor sin su par queda deshabilitado | U3 (3.2-3.3), U6 (6.3, 6.5), U9 (9.1), U16 (16.1) |
| `auth-sso-configuracion` | SC3 Lista pública de proveedores habilitados | U6 (6.5-6.6), U9 (9.1-9.2), U14 (14.1-14.2) |
| `auth-sso-configuracion` | SC4 Botones solo en el login y solo para habilitados | U14 (14.1-14.2) |
| `auth-sso-configuracion` | SC5 El usuario no ve ni desvincula su cuenta | U11 (11.4-11.5), U14 (14.1) |
| `auth-2fa-login` | L1 Orden del login (modificado) | U5 (5.1-5.5), U8 (8.1), U10 (10.3) |
| `auth-2fa-login` | L7 El selector usa un ticket (modificado) | U8 (8.1-8.2), U10 (10.3) |
| `auth-2fa-dispositivo-confiable` | D3 Un dispositivo válido omite el desafío, no el primer factor (modificado y renombrado) | U5 (5.1, 5.5), U10 (10.3) |
| `auth-limite-intentos` | I9 El ingreso por SSO se limita por proveedor, sujeto e IP | U8 (8.1-8.3), U10 (10.4) |

Decisión de producto citada: `docs/roadmap-comercial.md`, "Decisiones de producto de la segunda etapa", viñeta "Segunda etapa, punto 7 — login con Google o Microsoft (SSO)" y "Precisiones del 2026-10-09, al explorar". Cada viñeta ya está convertida en requerimiento (SL*, SV*, SC*, L1, L7, D3, I9); lo no implementado se declara en la sección SL15 y en la trazabilidad de `auth-sso-login`.
