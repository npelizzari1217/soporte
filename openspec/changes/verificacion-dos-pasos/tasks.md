# Tasks: Verificación en dos pasos (2FA)

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~6.250 (19 WU, cada una ≤ 400; las más cargadas son WU-10 ~395 y WU-3, WU-8, WU-9 y WU-12 ~390) |
| 400-line budget risk | High (total); Medium en WU-3, WU-8, WU-9, WU-10 y WU-12; Low en las demás |
| Chained PRs recommended | Yes |
| Suggested split | PR1 (WU-1) → PR2 → ... → PR19 (WU-13), un PR por WU, en el orden 1, 2, 3, 4a, 4b, 4c, 5a, 5b, 5c, 6a, 6b, 7, 8, 9, 10, 11a, 11b, 12, 13 |
| Delivery strategy | auto-chain |
| Chain strategy | feature-branch-chain |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: feature-branch-chain
400-line budget risk: High

Modo estándar (feature, sin TDD estricto): los tests viajan en el mismo commit que el código. Los tests de la tabla "Invariantes que DEBEN tener test" del diseño son tareas explícitas, con su mutación donde el diseño la pide. No hay Threat Matrix aplicable (el diseño la declara N/A).

Rama tracker: `feat/verificacion-dos-pasos` (ya existe con los commits de planificación; solo ella mergea a `main`). El PR de la WU-1 apunta al tracker; el PR de cada WU apunta a la rama de la WU anterior de la cadena. Cada PR lleva diagrama de dependencia con 📍, inicio/fin, dependencias previas y fuera de alcance. El tracker PR queda en draft/no-merge hasta integrar toda la cadena.

Ramas por WU (base entre paréntesis):
- WU-1 `feat/verificacion-dos-pasos-wu01` (tracker)
- WU-2 `...-wu02` (wu01)
- WU-3 `...-wu03` (wu02)
- WU-4a `...-wu04a` (wu03)
- WU-4b `...-wu04b` (wu04a)
- WU-4c `...-wu04c` (wu04b)
- WU-5a `...-wu05a` (wu04c)
- WU-5b `...-wu05b` (wu05a)
- WU-5c `...-wu05c` (wu05b)
- WU-6a `...-wu06a` (wu05c)
- WU-6b `...-wu06b` (wu06a)
- WU-7 `...-wu07` (wu06b)
- WU-8 `...-wu08` (wu07)
- WU-9 `...-wu09` (wu08)
- WU-10 `...-wu10` (wu09)
- WU-11a `...-wu11a` (wu10)
- WU-11b `...-wu11b` (wu11a)
- WU-12 `...-wu12` (wu11b)
- WU-13 `...-wu13` (wu12)

Nota: las dependencias lógicas del diseño (p. ej. WU-7 solo depende de WU-1) son un subconjunto del orden lineal; la cadena es lineal por la regla de `feature-branch-chain`.

Verificación común por WU (lo que aplique): backend `pnpm lint`, `pnpm typecheck`, `pnpm vitest run <rutas>`; frontend `JWT_SECRET=dummy pnpm lint`, `pnpm type-check`, `pnpm test`; raíz `node scripts/check-casts-en-specs.mjs` (el ratchet no debe subir). Specs de integración sobre bases de test compartidas: buscar-o-crear las filas de catálogo y borrar solo lo que el spec creó; todo spec que trunca `soporte_master_test` llama `usarLockMasterTest()` (`src/testing/lock-master-test.ts`) antes de su `describe`. Tenant efímero: limpiar filas → `app.close()` → `dropDatabase`. El `pnpm test` completo del backend corre al menos en la última WU de backend (WU-9) y el del frontend en la WU-13.

Deuda de Ayuda (escritura suspendida desde 2026-09-07): anotar en el commit y en el cuerpo del PR de las WU 11a, 11b, 12 y 13 (desafío y enrolamiento, ajustes de 2FA en el perfil, política y reseteo). La WU-5c cambia el contrato del login: anotarla también (el login ahora puede pedir un segundo paso). Corregir solo un artículo existente que el cambio vuelva falso.

Despliegue: solo la cadena completa. Entre la WU-5c y la WU-11a el backend ya exige el desafío y el frontend viejo no sabe presentarlo; si la cadena llega parcial a producción, los ROOT quedan sin poder entrar.

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | Migración master M1 (5 tablas, `requiere_2fa`) y schema | PR 1 (base tracker) | `pnpm vitest run src/auth/infrastructure/tfa/migracion-m1.integration.spec.ts` | Integración sobre `soporte_master_test` (CHECKs, defaults, cascada) | `rollback.sql` de M1; sin consumidores |
| 2 | TOTP nativo, formatos, constantes, `esObligado2fa` | PR 2 (base PR1) | `pnpm vitest run src/auth/domain/tfa src/auth/infrastructure/tfa` | N/A: dominio puro y vectores RFC | Archivos nuevos sin consumidores |
| 3 | Limitador persistido, `ipDelNavegador`, aplicación en `LoginUseCase` | PR 3 (base PR2) | `pnpm vitest run src/auth` | Integración: 10 reservas concurrentes → 5 | `LoginUseCase` y adaptador del limitador |
| 4a | `ITfaRepository` Prisma con CAS | PR 4 (base PR3) | `pnpm vitest run src/auth/infrastructure/tfa` | Integración: concurrencia de `ultimo_paso`, códigos, `eliminarTodo` con fallo forzado | Repo nuevo sin consumidores |
| 4b | `SecretoTotpCifrado`, `VerificadorCodigoTfa`, `ConfirmadorSecretoPendiente` | PR 5 (base PR4) | `pnpm vitest run src/auth/application/tfa` | N/A: unit con puertos mockeados | Servicios nuevos sin rutas |
| 4c | Autogestión de 2FA (`/auth/2fa/**`) | PR 6 (base PR5) | `pnpm vitest run src/auth` | e2e de autogestión con guards reales | Controller y use cases nuevos |
| 5a | Repo de desafíos, `EmitirSesionService`, verificar y enrolamiento | PR 7 (base PR6) | `pnpm vitest run src/auth` | Integración: CAS y rotación del token | Extracción sin cambio de conducta; use cases sin ruta |
| 5b | Continuar, seleccionar y `TfaLoginController` | PR 8 (base PR7) | `pnpm vitest run src/auth` | e2e de rutas públicas aún sin enganchar | Controller nuevo |
| 5c | `LoginUseCase` con decisión de segundo paso | PR 9 (base PR8) | `pnpm vitest run src/auth test` | e2e del flujo completo de login | `LoginUseCase`, mapper y helper de test |
| 6a | Dispositivo confiable | PR 10 (base PR9) | `pnpm vitest run src/auth` | e2e: dispositivo omite el desafío | Repo, emisión y uso en el login |
| 6b | Fail-closed al cambiar contraseña | PR 11 (base PR10) | `pnpm vitest run src/auth src/usuarios` | Unit: revocación lanza → `save` no se llama | Orden de operaciones en 4 caminos |
| 7 | Política de 2FA por cliente | PR 12 (base PR11) | `pnpm vitest run src/clientes` | Integración: `save` viejo no apaga la política | Controller, use case y métodos del repo |
| 8 | Reseteo de 2FA (API y script) | PR 13 (base PR12) | `pnpm vitest run src/usuarios src/auth scripts` | e2e ROOT/ADMIN/TECNICO; spec del script | Use case, ruta y script |
| 9 | Rotación con destinos TOTP, seed del ROOT, runbook | PR 14 (base PR13) | `pnpm vitest run scripts src/auth` | Integración: rotación sobre Postgres real | Script de rotación y seed |
| 10 | BFF: cookie `td`, IP, rutas y `RUTAS_SIN_REFRESH` | PR 15 (base PR14) | frontend `pnpm vitest run src/app/api src/shared` | N/A: Vitest + msw | Rutas BFF y helper |
| 11a | Máquina `use-login`, `DesafioTfaForm`, selector con ticket | PR 16 (base PR15) | frontend `pnpm vitest run src/features/auth` | N/A: Testing Library + msw | Componentes y hook de login |
| 11b | `EnrolamientoTfa`, `CodigosRecuperacion`, enrolamiento forzado | PR 17 (base PR16) | frontend `pnpm vitest run src/features/auth` | N/A: Testing Library + msw | Componentes nuevos |
| 12 | `ConfigurarTfaDialog` | PR 18 (base PR17) | frontend `pnpm vitest run src/features` | N/A: Testing Library + msw | Dialog y su enganche en el header |
| 13 | `PoliticaTfaCard` y botón "Resetear 2FA" | PR 19 (base PR18) | frontend `pnpm vitest run src/features/usuarios` | N/A: Testing Library + msw | Componentes de administración |

## WU-1 — Migración M1 y schema (~260 líneas)

- [x] 1.1 Migración master `backend/prisma_master/migrations/20261008120000_verificacion_dos_pasos/migration.sql` con las tablas `usuarios_tfa`, `tfa_codigos_recuperacion`, `tfa_dispositivos_confiables`, `auth_desafios`, `auth_intentos_fallidos` (columnas, FK `ON DELETE CASCADE`, índices, CHECK de par nulo y de `proposito`, `token_hash UNIQUE`) y `clientes.requiere_2fa boolean NOT NULL DEFAULT false`, sin backfill; y `rollback.sql` (`DROP TABLE` de las 5 y `ALTER TABLE clientes DROP COLUMN requiere_2fa`). (T3, D7, L2, I8, C2)
- [x] 1.2 Actualizar `backend/prisma_master/schema.prisma` con los modelos y el default de Prisma de `requiere_2fa` y de `ultimo_paso`; regenerar el cliente. (T3, C2)
- [x] 1.3 Test de integración `backend/src/auth/infrastructure/tfa/migracion-m1.integration.spec.ts`: los CHECK rechazan `secreto_cifrado` sin `confirmado_at` (y a la inversa), pendiente sin fecha y `proposito` inválido; `requiere_2fa` es `false` en los clientes existentes; los defaults de Prisma y del DDL coinciden; borrar el usuario cascadea las 4 tablas con FK; `auth_intentos_fallidos` no tiene FK. Buscar-o-crear filas de catálogo y borrar solo lo creado; `usarLockMasterTest()` si trunca. (T3, C2, D7, I8)
- [x] 1.4 Verificación: backend `pnpm lint`, `pnpm typecheck`, `pnpm vitest run src/auth/infrastructure/tfa`; raíz `node scripts/check-casts-en-specs.mjs`. Avisar en el PR que M1 no se despliega sin la cadena completa.

## WU-2 — TOTP nativo, formatos y regla de obligación (~330 líneas)

- [x] 2.1 Test unit de `TotpNativoService` (`backend/src/auth/infrastructure/tfa/totp-nativo.service.spec.ts`): vectores SHA-1 del RFC 6238 apéndice B (secreto `12345678901234567890`, T = 59, 1111111109, 1111111111, 1234567890, 2000000000, truncados a 6 dígitos); ventana ±1 acepta y ±2 rechaza; códigos mal formados; devuelve el paso aceptado; `generarSecreto` de 20 bytes en base32 sin padding; `uri` con `issuer=Soporte&algorithm=SHA1&digits=6&period=30`. (T1)
- [x] 2.2 Crear `auth/domain/ports/totp-service.port.ts` (`ITotpService`) y `auth/infrastructure/tfa/totp-nativo.service.ts` con `crypto.createHmac('sha1')`, base32 propio y `timingSafeEqual`. (T1)
- [x] 2.3 Test unit de `formato-codigo.ts`: `clasificarCodigo` distingue 6 dígitos de recuperación; `normalizarCodigoRecuperacion` pasa a mayúsculas, quita guiones y espacios, `O→0`, `I/L→1`; rechaza longitud errónea; `normalizarEmail`. (T5, I3)
- [x] 2.4 Crear `auth/domain/tfa/formato-codigo.ts` y `auth/domain/tfa/tfa.constants.ts` (duraciones de desafío 5/15 min, ticket 5 min, dispositivo 30 días, ventana 15 min, máximo 5). (T1, T5, I1)
- [x] 2.5 Test unit de `esObligado2fa` con mutación: ROOT obligado; usuario con una membresía activa que exige 2FA obligado; dos clientes sin política no obligado; `some` → `every` pone un caso en rojo; membresías inactivas no cuentan. (L3)
- [x] 2.6 Crear `auth/domain/tfa/es-obligado-2fa.ts`. (L3)
- [x] 2.7 Verificación: backend `pnpm lint`, `pnpm typecheck`, `pnpm vitest run src/auth/domain/tfa src/auth/infrastructure/tfa`; raíz `node scripts/check-casts-en-specs.mjs`.

## WU-3 — Limitador de intentos, IP y aplicación en el login (~390 líneas)

- [x] 3.1 Test de integración del adaptador SQL (`prisma-limitador-intentos.integration.spec.ts`): 10 reservas concurrentes con la clave en 0 → exactamente 5 devuelven reserva; reservar bloqueado deja `fallos = 5` y devuelve `null` (no incrementa); ventana vencida reinicia en 1; `liberar` borra la fila; `devolver` resta solo con `ventana_inicio` igual a la reservada y no cambia nada en una ventana renovada; purga de filas con más de un día como máximo una vez por hora. (I1, I2, I7, I8)
- [x] 3.2 Crear `auth/domain/ports/limitador-intentos.port.ts` (`ILimitadorIntentos`, `ReservaIntento`) y `auth/infrastructure/tfa/prisma-limitador-intentos.ts` con el `INSERT … ON CONFLICT … WHERE` de ADR-6, `liberar`, `devolver` y la purga horaria. (I1, I2, I7, I8)
- [x] 3.3 Test unit de `ipDelNavegador` del backend (`auth/interface/ip-del-navegador.spec.ts`): honra la cabecera `x-soporte-ip-navegador` solo desde par loopback (`127.0.0.1`, `::1`, `::ffff:127.0.0.1`) y con `net.isIP` válida; par `203.0.113.9` ignora la cabecera y usa el socket; sin cabecera válida desde loopback devuelve `sin-ip`; IPv4 e IPv6, con y sin puerto (la forma con puerto no es IP válida). (I4)
- [x] 3.4 Crear `auth/interface/ip-del-navegador.ts`. (I4)
- [x] 3.5 Test unit de `LoginUseCase` con limitador mockeado: el quinto fallo de contraseña bloquea; bloqueado ejecuta igual `verify(password, DUMMY_HASH)` y devuelve `CredencialesInvalidasError` sin pista del bloqueo; un éxito llama a `liberar`; la clave es `pwd:{sha256(normalizarEmail)}:{ip}` sin email en claro; email inexistente cuenta igual. (I1, I2, I3, I5)
- [x] 3.6 `LoginUseCase`: reservar antes de verificar, liberar en éxito, recibir la IP desde `AuthController.login` vía `ipDelNavegador`; registrar el adaptador en `AuthModule` y en `shared`/`auth.module.ts`. (I1, I2, I3, I4, I5)
- [x] 3.7 `backend/test/barrido-huerfanas.global-setup.mjs`: agregar `TRUNCATE auth_intentos_fallidos` en `soporte_master_test` una vez por corrida; test del `globalSetup` si ya existe uno, y documentar en el spec nuevo que usa emails aleatorios (`randomBytes`) y su propia `x-soporte-ip-navegador`. (I8)
- [x] 3.8 Test e2e del bloqueo en `auth` (email aleatorio e IP propia): 5 contraseñas incorrectas, la sexta con la contraseña correcta devuelve 401 genérico; el estado sobrevive a reconstruir el módulo (reinicio simulado). (I1, I5, I8)
- [x] 3.9 Verificación: backend `pnpm lint`, `pnpm typecheck`, `pnpm vitest run src/auth`; raíz `node scripts/check-casts-en-specs.mjs`. Nota de riesgo de presupuesto: ~390 líneas; si pasa de 400, partir el adaptador SQL con su spec (3.1-3.2) de `ipDelNavegador` y la aplicación en el login (3.3-3.8), cada mitad con sus tests.

## WU-4a — Repositorio de 2FA con CAS (~340 líneas)

- [x] 4a.1 Test de integración del CAS de `ultimo_paso` (`prisma-tfa.repository.integration.spec.ts`): dos `registrarPaso` concurrentes del mismo paso → exactamente una acepta; mutación `<` → `<=` en el CAS pone el test en rojo; `registrarPaso` con `secreto_cifrado` distinto del leído devuelve 0 filas. (T2)
- [x] 4a.2 Test de integración de la promoción del pendiente: un único CAS fija `secreto_cifrado`, `confirmado_at`, `ultimo_paso = paso de la confirmación` y limpia el pendiente; con otro pendiente leído no promueve; confirmar y repetir el mismo código en el login es rechazo. (T2, T4, T10)
- [x] 4a.3 Test de integración de códigos de recuperación: guardar 10 hasheados; consumir uno con `UPDATE … WHERE usado_at IS NULL`, dos consumos concurrentes del mismo código → uno gana; regenerar borra el juego anterior e inserta 10 en una transacción (con fallo forzado queda el juego previo intacto). (T5, T9)
- [x] 4a.4 Test de integración de `eliminarTodo`: en una transacción borra `usuarios_tfa` y códigos, revoca dispositivos e invalida desafíos abiertos; con fallo forzado a mitad no queda nada a medias. (D6, S3)
- [x] 4a.5 Crear `auth/domain/ports/tfa-repository.port.ts` (`ITfaRepository`) y `auth/infrastructure/tfa/prisma-tfa.repository.ts`: `obtener`, `guardarPendiente`, `promoverPendiente`, `registrarPaso`, `reemplazarCodigos`, `consumirCodigo`, `contarCodigosRestantes`, `eliminarTodo`; registrar en `AuthModule`. Spec con `usarLockMasterTest()` si trunca. (T2, T4, T5, T9, T10, D6)
- [x] 4a.6 Verificación: backend `pnpm lint`, `pnpm typecheck`, `pnpm vitest run src/auth/infrastructure/tfa`; raíz `node scripts/check-casts-en-specs.mjs`.

## WU-4b — Verificador común y confirmador de pendiente (~330 líneas)

- [x] 4b.1 Test unit de `SecretoTotpCifrado`: cifra con AAD `tfa:{usuarioId}`; un ciphertext SMTP (AAD = id de cliente) no descifra como TOTP y uno movido entre usuarios falla; el fallo de descifrado devuelve `Result.fail`, nunca lanza. (T3, T12, K1)
- [x] 4b.2 Crear `auth/application/tfa/secreto-totp-cifrado.ts` sobre `ISecretCipher`. (T3, T12)
- [x] 4b.3 Test unit de `VerificadorCodigoTfa` con puertos mockeados: acepta TOTP del secreto activo y código de recuperación; reserva `cod:{usuarioId}` antes de verificar; bloqueado no verifica nada ni acepta el código correcto; éxito llama a `liberar`; fallo no libera; secreto indescifrable → `SegundoPasoRechazadoError`, loguea `TFA_SECRETO_INDESCIFRABLE | usuarioId=…` sin código ni clave, llama a `devolver` (mutación `devolver` → `liberar` pone en rojo el caso "3 fallos y luego indescifrable deja fallos = 3"); un recuperación sigue funcionando con secreto indescifrable; un `devolver` que falla se loguea y no se propaga. (T2, T5, T12, I6, I7, K4)
- [x] 4b.4 Test de integración del limitador con el verificador: 3 fallos y un intento con secreto indescifrable dejan `fallos = 3`. (T12, I1, I6)
- [x] 4b.5 Crear `auth/application/tfa/verificador-codigo-tfa.ts` y `SegundoPasoRechazadoError` (401, mensaje genérico) en `auth/domain/errors`. (T2, T5, T12, I6, I7)
- [x] 4b.6 Test unit de `ConfirmadorSecretoPendiente`: acepta solo un TOTP del secreto pendiente; rechaza un código de recuperación y uno del secreto activo; comparte el limitador `cod:{usuarioId}`; promueve con el CAS y fija `ultimo_paso`; no hereda un paso ajeno. (T4, T10, T2, I6)
- [x] 4b.7 Crear `auth/application/tfa/confirmador-secreto-pendiente.ts`. (T4, T10)
- [x] 4b.8 Verificación: backend `pnpm lint`, `pnpm typecheck`, `pnpm vitest run src/auth/application/tfa`; raíz `node scripts/check-casts-en-specs.mjs`.

## WU-4c — Autogestión de 2FA (~380 líneas)

- [x] 4c.1 Test unit de los use cases de cuenta: `GET /auth/2fa` devuelve `{activo, obligado, codigosRestantes, pendiente}` con `obligado` por `esObligado2fa` y nunca el secreto; iniciar la activación voluntaria guarda un pendiente cifrado y devuelve `otpauthUri` y `claveManual`; confirmar activa y devuelve 10 códigos solo en la primera activación; con 2FA activo, iniciar cambio de celular exige `codigo` del secreto activo o recuperación (T10) y el activo sigue valiendo hasta confirmar; regenerar con código válido invalida el juego anterior; sin código válido, 422. (T3, T4, T6, T7, T9, T10)
- [x] 4c.2 Test unit: ninguna acción de autogestión envía mail ni ofrece otro canal. (T11)
- [x] 4c.3 Crear use cases `ObtenerEstadoTfa`, `IniciarSecretoTfa`, `ConfirmarSecretoTfa`, `RegenerarCodigosTfa` en `auth/application/tfa/` y DTOs en `auth/interface/dto/`. Con `isAvailable() === false` el enrolamiento responde 503 controlado. (T4, T7, T9, T10)
- [x] 4c.4 Crear `auth/interface/controllers/tfa-cuenta.controller.ts` (`GET /auth/2fa`, `POST /auth/2fa/secreto/iniciar|confirmar`, `POST /auth/2fa/codigos`) con `JwtAuthGuard`, `usuarioId = user.sub`; los errores de código responden **422**, no 401. (T6, T7)
- [x] 4c.5 Test e2e `tfa-cuenta.e2e.spec.ts` con guards reales: usuario ROOT y usuario normal activan su 2FA por separado (T6); un usuario no ve el 2FA de otro; sin JWT 401; regenerar invalida el juego anterior; 422 por código inválido. (T6, T7, T9)
- [x] 4c.6 Verificación: backend `pnpm lint`, `pnpm typecheck`, `pnpm vitest run src/auth`; raíz `node scripts/check-casts-en-specs.mjs`.

## WU-5a — Repo de desafíos, EmitirSesion, verificar y enrolamiento (~360 líneas)

- [x] 5a.1 Test unit de no regresión de `EmitirSesionService` extraído de los pasos 5-6 de `LoginUseCase` (`login.use-case.ts:153-206`): los tests actuales de `LoginUseCase` pasan sin cambios. (L1)
- [x] 5a.2 Extraer `auth/application/emitir-sesion.service.ts` sin cambio de conducta y usarlo desde `LoginUseCase`. (L1)
- [x] 5a.3 Test de integración de `PrismaDesafioLoginRepository`: CAS con `token_hash`, `usado_at IS NULL`, `expira_at > now()`; al verificar el token se reemplaza por el del ticket y el string del desafío deja de servir; un desafío vencido o usado no sirve; de otro usuario no sirve. (L2)
- [x] 5a.4 Crear `auth/domain/ports/desafio-login-repository.port.ts` y `auth/infrastructure/tfa/prisma-desafio-login.repository.ts`: crear (token opaco de 32 bytes, SHA-256), `verificar` con rotación, `consumir`, `iniciarEnrolamiento`. (L2, L5)
- [x] 5a.5 Test unit de `VerificarDesafioUseCase`: acepta TOTP o recuperación vía `VerificadorCodigoTfa`; desafío inválido se valida antes de reservar y no consume cupo; desafío, ticket, código erróneo y bloqueo dan el mismo `SegundoPasoRechazadoError`; un `ENROLAR` no sirve en `verificar`. (L2, L5, L6, L11)
- [x] 5a.6 Test unit de enrolamiento iniciar/confirmar: un `ENROLAR` sin `verificado_at` sirve solo para iniciar y confirmar; confirmar acepta solo TOTP del pendiente; genera 10 códigos y devuelve ticket; reintento con el mismo código rechazado. (L5, T4, T5)
- [x] 5a.7 Implementar `VerificarDesafioUseCase`, `IniciarEnrolamientoLoginUseCase` y `ConfirmarEnrolamientoLoginUseCase`. (L5, L6, T4, T5)
- [x] 5a.8 Verificación: backend `pnpm lint`, `pnpm typecheck`, `pnpm vitest run src/auth`; raíz `node scripts/check-casts-en-specs.mjs`.

## WU-5b — Continuar, seleccionar y rutas públicas (~280 líneas)

- [x] 5b.1 Test unit de `ContinuarLoginUseCase`: exige `verificado_at`; ROOT o una membresía consume el ticket y emite sesión; con más de una devuelve las membresías y el mismo ticket sin consumirlo; un `ENROLAR` sin verificar es rechazado. (L2, L5, L7)
- [x] 5b.2 Test unit de `SeleccionarClienteLoginUseCase`: valida `findActivaByUsuarioYCliente` antes de consumir; membresía inexistente o inactiva da el mismo error que un ticket inválido y el ticket sigue vigente; no pide ni reenvía contraseña ni código. (L7)
- [x] 5b.3 Test unit: el refresh y el cambio de cliente existentes no piden el código. (L8) — Nota de apply: lo cubre el e2e `tfa-login.e2e.spec.ts` para el refresh; el cambio de cliente queda para el e2e de 5c.7.
- [x] 5b.4 Implementar ambos use cases y `auth/interface/controllers/tfa-login.controller.ts` con las 5 rutas públicas (`/auth/2fa/verificar`, `/auth/2fa/enrolamiento/iniciar|confirmar`, `/auth/login/continuar`, `/auth/login/seleccionar`) y sus DTOs, todavía sin enganchar a `LoginUseCase`. (L2, L5, L7)
- [x] 5b.5 Test e2e del controller con desafíos sembrados por el repo: verificar → continuar → sesión; ticket reutilizado 401; seleccionar con cliente ajeno 401 y ticket vivo. (L2, L7)
- [x] 5b.6 Verificación: backend `pnpm lint`, `pnpm typecheck`, `pnpm vitest run src/auth`; raíz `node scripts/check-casts-en-specs.mjs`.

## WU-5c — LoginUseCase con la decisión de segundo paso (~380 líneas)

- [x] 5c.1 Test unit de `LoginUseCase` con la decisión: 2FA activo → desafío `VERIFICAR` y `{needs2fa, desafio, recordarDisponible}`; obligado sin 2FA → `ENROLAR` y `{needsEnrolamiento2fa, desafio}`; sin 2FA y más de una membresía → `SELECCIONAR` con `ticket`; ROOT o una membresía → sesión; la contraseña inválida no revela si hay 2FA; el desafío `ENROLAR` nunca es un access token. (L1, L3, L4, L5, L7)
- [x] 5c.2 Test unit: `clienteId` opcional conserva la compatibilidad (`{email, password, clienteId}` sin segundo paso emite sesión); si hay segundo paso, `clienteId` se ignora. (L1, L7)
- [x] 5c.3 `MembresiaResuelta.clienteRequiere2fa` desde el mapper de `prisma-membresia.repository.ts` (`include: { cliente: true }`); `ClienteMapper.toPersistence` no la incluye. Test de mapper. (L3, C3)
- [x] 5c.4 `LoginUseCase`: tras la contraseña válida, calcular `esObligado2fa` con `findActivasByUsuario`, decidir entre sesión, desafío o enrolamiento, y cumplir L1 (la contraseña se verifica antes del segundo paso; solo emite sesión al final). (L1, L3, L4, L5, L11)
- [x] 5c.5 Crear `backend/src/auth/test-helpers/tfa-de-test.ts` con `SECRETO_TOTP_DE_TEST`, `activarTfaDeTest(prisma, usuarioId)`, `codigoDeTest(usuarioId)` (usa `TotpNativoService` real y avanza al paso +1 si el actual ya se usó) y `reiniciarAntireplay`. (L10, T2)
- [x] 5c.6 Actualizar los casos ROOT de `backend/src/auth/auth.e2e.spec.ts` (el ROOT ahora pasa por enrolamiento o `activarTfaDeTest`); los demás e2e de usuarios normales no cambian porque `requiere_2fa = false`. (L3, L10)
- [x] 5c.7 Test e2e del flujo completo: sin 2FA y 1 o 2 clientes; con 2FA y 1 o 2 clientes; forzado por política de cliente (un usuario en dos clientes, uno con política, queda obligado: C3, mutación `some` → `every`); `ENROLAR` en `continuar` o `seleccionar` rechazado (L5); desafío no reutilizable tras verificar (L2); refresh y cambio de cliente sin código (L8); un refresh token robado sigue válido, consecuencia declarada (L9); secreto indescifrable (AAD manipulado) → 401 con log sin código (L11, T12, K4). (L1-L9, L11, C3)
- [x] 5c.8 Verificación: backend `pnpm lint`, `pnpm typecheck`, `pnpm vitest run src/auth` y los e2e de `src/usuarios`, `src/tickets` que usan `/auth/login`; raíz `node scripts/check-casts-en-specs.mjs`. Anotar en PR y commit el cambio de contrato del login y la deuda de Ayuda; advertir la exposición de la cadena (ver Despliegue).

## WU-6a — Dispositivo confiable (~330 líneas)

- [x] 6a.1 Test de integración de `PrismaDispositivoConfiableRepository`: `crear` guarda solo el SHA-256 del token; `esValido` falso si el usuario no coincide, está revocado o vencido; `revocarTodosDe` revoca todos y lanza ante fallo (fail-closed); vigencia exacta de 30 días. (D2, D3, D7)
- [x] 6a.2 Crear `IDispositivoConfiableRepository` en `auth/domain/ports` y su adaptador Prisma; registrar en `AuthModule`. (D2, D7)
- [ ] 6a.3 Test unit de `VerificarDesafioUseCase` con `recordar: true`: emite `dispositivoConfiable` para un usuario normal; ROOT no recibe dispositivo aunque envíe `recordar` (D4); `recordarDisponible` falso para ROOT. (D1, D4)
- [ ] 6a.4 Test unit de `LoginUseCase` con dispositivo: un token válido del usuario con 2FA activo omite el desafío pero no la contraseña; de otro usuario, revocado, vencido o de un ROOT se ignora y sigue el desafío. (D3, D4)
- [ ] 6a.5 Implementar emisión en `VerificarDesafioUseCase` y uso en `LoginUseCase` (`dispositivoConfiable` en el body de `POST /auth/login`). (D1, D3, D4)
- [ ] 6a.6 Test unit de desactivación propia: `POST /auth/2fa/desactivar` con código válido y `!esObligado2fa` borra todo vía `eliminarTodo` (revoca dispositivos e invalida desafíos, D6); obligado → `Tfa2faObligatorioError` 409 (mismo `esObligado2fa` que el login); código inválido 422. (T8, D6)
- [ ] 6a.7 Implementar `DesactivarTfaUseCase` y la ruta `POST /auth/2fa/desactivar` en `TfaCuentaController`; luego revocar refresh tokens con log-and-swallow. (T8, D6)
- [ ] 6a.8 Test e2e: verificar con `recordar` → login siguiente con el token omite el desafío; desactivar el 2FA revoca el dispositivo. (D1, D3, D6)
- [ ] 6a.9 Verificación: backend `pnpm lint`, `pnpm typecheck`, `pnpm vitest run src/auth`; raíz `node scripts/check-casts-en-specs.mjs`.

## WU-6b — Fail-closed al cambiar la contraseña (~300 líneas)

- [ ] 6b.1 Test unit de `CambiarPasswordUseCase`: el puerto `revocarTodosDe` lanza → `save` nunca se llama y la excepción se propaga; orden verificar actual → hash en memoria → revocar dispositivos → `save` → revocar refresh (log-and-swallow); el cambio no desactiva el 2FA. (D5, U2)
- [ ] 6b.2 Test unit de `ResetearPasswordUsuarioTenantUseCase`: mismo contrato; revoca dispositivos del destino antes del `save`; no desactiva el 2FA del destino. (D5, U1, U2)
- [ ] 6b.3 Test unit de `ConfirmarResetPasswordUseCase`: hash en memoria → revocar dispositivos → CAS del token → `save`; si la revocación lanza, `save` y `consumirSiVigente` nunca se llaman y el token sigue vigente; no desactiva el 2FA. (D5, O1, O2)
- [ ] 6b.4 Aplicar el orden nuevo en `cambiar-password.use-case.ts`, `resetear-password-usuario-tenant.use-case.ts` y `confirmar-reset-password.use-case.ts`; inyectar `IDispositivoConfiableRepository`. (D5, U1, O1)
- [ ] 6b.5 Test de integración de `backend/scripts/reset-password.ts`: `$transaction([updateMany dispositivos, update usuario])` revoca los dispositivos y cambia la contraseña de forma atómica; un fallo no deja contraseña nueva con dispositivos vivos. Respeta las reglas de scripts del repo (`eslint .` cubre `scripts/**`). (D5)
- [ ] 6b.6 Actualizar `reset-password.ts` según 6b.5. (D5)
- [ ] 6b.7 Verificación: backend `pnpm lint`, `pnpm typecheck`, `pnpm vitest run src/auth src/usuarios`; raíz `node scripts/check-casts-en-specs.mjs`.

## WU-7 — Política de 2FA por cliente (~280 líneas)

- [ ] 7.1 Test de integración (invariante "`requiere_2fa` entra en `toPersistence`"): cargar el cliente, fijar la política, `save` con la lectura vieja → sigue `true`; `fijarRequiere2fa` y `obtenerRequiere2fa` leen y escriben solo esa columna; default `false` en clientes nuevos. (C1, C2)
- [ ] 7.2 Agregar `fijarRequiere2fa` y `obtenerRequiere2fa` a `IClienteRepository` y a `prisma-cliente.repository.ts`; `ClienteMapper.toPersistence` y `ClienteEntity` no la llevan. (C1, C2)
- [ ] 7.3 Test unit de `ConfigurarPoliticaTfaUseCase`: usa `actor.cliente_id`, nunca un id del body; no revoca sesiones (C4); desactivar la política no borra el 2FA de nadie (C5). (C1, C4, C5)
- [ ] 7.4 Implementar `ConfigurarPoliticaTfaUseCase`, `clientes/interface/controllers/politica-tfa.controller.ts` (`GET`/`PUT /politica-2fa`, `JwtAuthGuard, TenantGuard` por clase y `AdminClienteGuard` por método, molde `HorarioLaboralController`) y DTO `{requiere2fa: boolean}`. (C1, C2)
- [ ] 7.5 Test e2e `politica-tfa.e2e.spec.ts`: ADMINISTRADOR cambia la de su cliente; TECNICO recibe 403; un cliente no ve ni cambia la de otro; el efecto alcanza al usuario también en otros clientes en su próximo login; las sesiones abiertas siguen hasta vencer; al desactivar, quien ya tiene 2FA sigue con 2FA. (C1, C2, C3, C4, C5)
- [ ] 7.6 Verificación: backend `pnpm lint`, `pnpm typecheck`, `pnpm vitest run src/clientes src/auth`; raíz `node scripts/check-casts-en-specs.mjs`.

## WU-8 — Reseteo de 2FA por API y por script (~390 líneas)

- [ ] 8.1 Test de integración de `findClientesDeTodasByUsuario(usuarioId): Promise<string[]>`: sin filtro de `activo`, `deletedAt` ni estado del cliente (cuentan inactivas, de clientes suspendidos y soft-deleted). (S2)
- [ ] 8.2 Agregar `findClientesDeTodasByUsuario` a `IMembresiaRepository` y a `prisma-membresia.repository.ts`. (S2)
- [ ] 8.3 Test unit de `ResetearTfaUsuarioUseCase`: ROOT resetea a cualquiera, incluido otro ROOT; ADMINISTRADOR solo con membresía activa del destino en su cliente, todas las membresías en su cliente y destino no ROOT, también a sí mismo; cualquier incumplimiento (otras membresías, membresía soft-deleted en otro cliente, destino ROOT, otro cliente) → `MembresiaNoEncontradaError` 404 idéntico al de un id inexistente; TECNICO/rol sin administración 403. (S1, S2, S4, S8)
- [ ] 8.4 Implementar `ResetearTfaUsuarioUseCase` (efectos de S3 con `eliminarTodo`, refresh con log-and-swallow) y `DELETE /usuarios/:id/2fa` en `UsuariosController` con `AdminClienteGuard`. (S1, S2, S3, S4, S8, D6)
- [ ] 8.5 Test e2e: ROOT, ADMINISTRADOR y TECNICO contra cada caso de 8.3; tras el reseteo el próximo login exige o no el 2FA según `esObligado2fa` (obligado → `needsEnrolamiento2fa`; no obligado → sesión). (S3, S5)
- [ ] 8.6 Test de integración del script `backend/scripts/resetear-2fa-root.ts` (`scripts/resetear-2fa-root.spec.ts`): exige que el usuario exista y sea `isGlobalAdmin` (si no, exit 1 sin tocar nada); aplica los efectos de S3 en una transacción; imprime solo `OK`; nunca imprime secretos ni códigos; carga `.env` con `process.loadEnvFile()`; lee `RESET_EMAIL`. (S3, S6, S7)
- [ ] 8.7 Crear `backend/scripts/resetear-2fa-root.ts` (molde `reset-password.ts`, sin `.ps1`, invocación `corepack pnpm exec ts-node scripts/resetear-2fa-root.ts`). (S6, S7)
- [ ] 8.8 Verificación: backend `pnpm lint`, `pnpm typecheck`, `pnpm vitest run src/usuarios src/auth scripts`; raíz `node scripts/check-casts-en-specs.mjs`. Nota de riesgo de presupuesto: ~390 líneas; si pasa de 400, partir API (8.1-8.5) de script (8.6-8.7), cada mitad con sus tests.

## WU-9 — Rotación de clave con destinos TOTP, seed del ROOT y runbook (~390 líneas)

- [ ] 9.1 Test de integración de la rotación (`rotar-email-crypto-key` con destinos): los secretos TOTP activos y pendientes y la contraseña SMTP se re-cifran con la clave nueva y siguen descifrando (AAD `tfa:{usuario_id}` e `id`); rotación idempotente (`migradas=N ya_migradas=M` totales). (K1, K2)
- [ ] 9.2 Test de integración de atomicidad: un fallo en un destino revierte toda la transacción (mismo `FOR UPDATE`, relectura round-trip, mismos exit codes). (K2)
- [ ] 9.3 Test de integración de `--verificar`: recorre todos los destinos y falla con un secreto que no descifra. (K3)
- [ ] 9.4 Generalizar `backend/scripts/rotar-email-crypto-key.mjs` de una columna a una lista de destinos (`clientes.smtp_password_cifrada` con AAD `id`; `usuarios_tfa.secreto_cifrado` y `usuarios_tfa.secreto_pendiente_cifrado` con AAD `tfa:{usuario_id}`); actualizar solo el comentario de cabecera de `rotate-email-crypto-key.ps1` (100 % ASCII, sin BOM; no se agrega ningún `.ps1`). (K1, K2, K3)
- [ ] 9.5 Test e2e: tras una rotación con un secreto manipulado el login responde 401 (no 500) y loguea `TFA_SECRETO_INDESCIFRABLE`. (K4, T12)
- [ ] 9.6 Test unit del seed `root-bootstrap.seed.ts`: con `ROOT_ADMIN_TOTP_SECRET` presente, `NODE_ENV` ausente, `production`, `staging` → termina con error sin crear ni tocar el ROOT; `development` y `test` → activa el 2FA con ese secreto; sin la variable, el ROOT pasa por la configuración forzada. (L10)
- [ ] 9.7 Implementar la lista positiva (fail-closed) en `root-bootstrap.seed.ts`; documentar el valor de desarrollo en `.env.example` y en el README. (L10)
- [ ] 9.8 Runbook `DEPLOY-VPS-runbook.md`: §5 (rotación) menciona los secretos TOTP; sección nueva para `resetear-2fa-root.ts`; paso de verificación de IP posterior al deploy y comprobación de `EMAIL_CRYPTO_KEY` previa al deploy. (K1, S6, I4)
- [ ] 9.9 Verificación: backend `pnpm lint`, `pnpm typecheck`, `pnpm vitest run scripts src/auth` y **`pnpm test` completo** (última WU de backend); raíz `node scripts/check-casts-en-specs.mjs`. Nota de riesgo de presupuesto: ~390 líneas; si pasa de 400, partir rotación (9.1-9.5, 9.8) de seed (9.6-9.7).

## WU-10 — BFF: cookie `td`, IP y rutas de login (~395 líneas)

- [ ] 10.1 Test de `ipDelNavegador` del BFF (`frontend/src/shared/auth/sesion-bff.test.ts`): toma la entrada más a la derecha de `x-forwarded-for` (la que agrega IIS/ARR) y descarta lo que el navegador mande a la izquierda; quita el puerto (`1.2.3.4:56789` → `1.2.3.4`, `[2001:db8::1]:56789` → `2001:db8::1`); una IP sin puerto pasa igual; lo que no es IP válida no se reenvía. IPv4 e IPv6, con y sin puerto. (I4)
- [ ] 10.2 Crear `frontend/src/shared/auth/sesion-bff.ts` (`responderConSesion`, `ipDelNavegador`) y agregar la cookie `td` en `shared/auth/cookies.ts` (httpOnly, `sameSite lax`, `__Host-` en prod, `TRUSTED_DEVICE_MAX_AGE` de 30 días). (I4, D1, D2)
- [ ] 10.3 Test de las rutas BFF con msw: `login` envía `x-soporte-ip-navegador` y la cookie `td` como `dispositivoConfiable`, y quita `dispositivoConfiable` del body antes de responder; `2fa/verificar` guarda `td` si viene; `login/continuar` y `login/seleccionar` fijan las cookies de sesión; ninguna respuesta filtra el token del dispositivo ni contraseñas. (D1, D3, L7, L2)
- [ ] 10.4 Modificar `frontend/src/app/api/auth/login/route.ts` y crear `.../2fa/verificar/route.ts`, `.../login/continuar/route.ts`, `.../login/seleccionar/route.ts`. Enrolamiento y autogestión van por el proxy genérico `[...path]`. (D1, L7)
- [ ] 10.5 Test de `apiFetch`: un 401 de las rutas del flujo de login no dispara refresh ni re-postea la contraseña; las rutas fuera del set sí refrescan. (L7, I1)
- [ ] 10.6 Cambiar el chequeo `path !== "auth/refresh"` de `frontend/src/shared/api/client.ts:74` por un set `RUTAS_SIN_REFRESH` con las rutas del flujo de login. (L7, I1)
- [ ] 10.7 Verificación: frontend `JWT_SECRET=dummy pnpm lint`, `pnpm type-check`, `pnpm test`; raíz `node scripts/check-casts-en-specs.mjs`. Nota de riesgo de presupuesto: ~395 líneas, sin corte más limpio (BFF y su helper viajan con sus tests).

## WU-11a — Máquina de login y desafío (~380 líneas)

- [ ] 11a.1 Test de `use-login.ts`: estados `credenciales → codigo | enrolamiento | seleccion`; guarda `desafio`/`ticket` solo en memoria y nunca la contraseña; el selector usa el ticket sin re-enviar contraseña ni código; error genérico ante 401; `recordar` solo si `recordarDisponible !== false`. (L1, L2, L6, L7, D1)
- [ ] 11a.2 Refactor de `frontend/src/features/auth/hooks/use-login.ts` (hoy `:88-99` guarda la contraseña) y espejo Zod de los formatos de código en `features/auth/schemas.ts` (6 dígitos o recuperación `XXXX-XXXX-XXXX`). (L6, L7, T5)
- [ ] 11a.3 Test del componente `DesafioTfaForm`: acepta código o recuperación, "Recordar este dispositivo" oculto con `recordarDisponible === false`, mensaje genérico en error, estado deshabilitado mientras envía. (L6, D1, D4)
- [ ] 11a.4 Crear `features/auth/components/desafio-tfa-form.tsx` y adaptar el selector de cliente a usar el ticket; conectar la página de login. Anotar deuda de Ayuda (desafío) en commit y PR. (L6, L7, D1)
- [ ] 11a.5 Verificación: frontend `JWT_SECRET=dummy pnpm lint`, `pnpm type-check`, `pnpm test`; raíz `node scripts/check-casts-en-specs.mjs`.

## WU-11b — Enrolamiento forzado y códigos de recuperación (~360 líneas)

- [ ] 11b.1 Test de `EnrolamientoTfa`: muestra el QR (`encode` de `uqr`, como `features/equipos/qr-equipo.ts:6`) y la clave manual; confirma con un código de 6 dígitos del pendiente; error de código no avanza. (T4, L5)
- [ ] 11b.2 Test de `CodigosRecuperacion`: lista los 10 códigos, copiar, casilla "Los guardé" y botón Continuar deshabilitado hasta marcarla; Continuar llama a `login/continuar` con el ticket. (T5, L5)
- [ ] 11b.3 Crear `features/auth/components/enrolamiento-tfa.tsx` y `codigos-recuperacion.tsx`; estados `enrolamiento` y `codigos` en `use-login.ts`. (T4, T5, L5)
- [ ] 11b.4 Test del flujo forzado en `use-login`: `needsEnrolamiento2fa` → iniciar → confirmar → códigos → continuar → sesión o selector. (L5, L7)
- [ ] 11b.5 Verificación: frontend `JWT_SECRET=dummy pnpm lint`, `pnpm type-check`, `pnpm test`; raíz `node scripts/check-casts-en-specs.mjs`. Anotar deuda de Ayuda (enrolamiento forzado) en commit y PR.

## WU-12 — Ajustes de 2FA en el perfil (~390 líneas)

- [ ] 12.1 Test de `ConfigurarTfaDialog`: sin 2FA muestra activar (QR, confirmar código, mostrar los 10 códigos una sola vez); con 2FA muestra cambiar celular (pide código antes del QR), regenerar (pide código) y desactivar (pide código); desactivar deshabilitado y con explicación si `obligado`; errores 422 sin disparar refresh; nunca muestra el secreto actual. (T3, T7, T8, T9, T10)
- [ ] 12.2 Crear `features/auth/components/configurar-tfa-dialog.tsx` y su hook de cuenta; enganchar junto a `CambiarPasswordDialog` en `dashboard-header.tsx:41`. (T7, T8, T9, T10)
- [ ] 12.3 Espejo Zod de los DTOs de `/auth/2fa/**` en `features/auth/schemas.ts`. (T4, T8, T9)
- [ ] 12.4 Verificación: frontend `JWT_SECRET=dummy pnpm lint`, `pnpm type-check`, `pnpm test`; raíz `node scripts/check-casts-en-specs.mjs`. Anotar deuda de Ayuda (ajustes de 2FA del perfil) en commit y PR. Nota de riesgo de presupuesto: ~390 líneas; si pasa de 400, partir activar/cambiar de regenerar/desactivar.

## WU-13 — Política y reseteo en administración (~280 líneas)

- [ ] 13.1 Test de `PoliticaTfaCard`: muestra y cambia `requiere2fa` con confirmación; visible solo para quien administra; error no deja el interruptor inconsistente. (C1, C2)
- [ ] 13.2 Crear `PoliticaTfaCard` en `usuarios-admin-view.tsx` (hooks y tipos en `features/usuarios/`). (C1)
- [ ] 13.3 Test del botón "Resetear 2FA" en `editar-usuario-dialog.tsx`: pide confirmación, llama a `DELETE /usuarios/:id/2fa`, muestra el 404 genérico sin revelar por qué. (S1, S2, S4)
- [ ] 13.4 Agregar el botón y su confirmación a `editar-usuario-dialog.tsx`. Anotar deuda de Ayuda (política y reseteo) en commit y PR. (S1, S2)
- [ ] 13.5 Verificación: frontend `JWT_SECRET=dummy pnpm lint`, `pnpm type-check`, `pnpm test` completo; raíz `node scripts/check-casts-en-specs.mjs`.
- [ ] 13.6 Notas de deploy en el PR del tracker: M1 master con `rollback.sql`; comprobar `EMAIL_CRYPTO_KEY` válida en `backend/.env` antes del deploy; primer login de cada ROOT con enrolamiento forzado (tener el celular a mano); despliegue solo de la cadena completa; después del deploy, dos contraseñas incorrectas desde fuera con un email de prueba y `SELECT clave FROM auth_intentos_fallidos` en master: la clave debe terminar en una IP pública, nunca `sin-ip` ni `127.0.0.1`; borrar esa fila; smoke de login sin 2FA y del ROOT completo; el lockfile no se espera que cambie.

> **13.7 — cierre posterior al deploy (paso de entrega, fuera de la lista de tareas de implementación):** DESPUÉS del deploy de la cadena completa y de la verificación de IP: en `docs/roadmap-comercial.md` marcar el punto 5 de la segunda etapa como Entregado y declarar **Cumplida** o **Desviación** (con motivo) en la viñeta de su decisión de producto ("Decisiones de producto ya cerradas", incluidas las "Precisiones del 2026-10-07"); correr `node scripts/check-roadmap-fresco.mjs`. Diferencia con el diseño: el diseño ubica la viñeta en la WU-13; aquí va después del deploy para no declarar Cumplida algo no entregado. La pregunta abierta "ROOT→ROOT sin UI" queda declarada como fuera de alcance (se cumple por API y script).

## Cobertura de requerimientos (para verify)

- `auth-2fa-totp`: T1 (2.1-2.2, 2.4), T2 (4a.1-4a.2, 4b.3, 4b.5-4b.6, 5c.5), T3 (1.1-1.3, 4b.1-4b.2, 4c.1, 12.1), T4 (4a.2, 4b.6-4b.7, 4c.1, 4c.3, 5a.6, 11b.1), T5 (2.3-2.4, 4a.3, 4b.3, 5a.6, 11b.2), T6 (4c.1, 4c.4-4c.5), T7 (4c.1, 4c.3-4c.5, 12.1-12.2), T8 (2.5-2.6, 6a.6-6a.7, 12.1), T9 (4a.3, 4c.1, 4c.5, 12.1), T10 (4a.2, 4b.6-4b.7, 4c.1, 12.1), T11 (4c.2), T12 (4b.1-4b.5, 5c.7, 9.5).
- `auth-2fa-login`: L1 (5a.1-5a.2, 5c.1-5c.4, 11a.1), L2 (5a.3-5a.5, 5b.1, 5c.7, 10.3, 11a.1), L3 (2.5-2.6, 5c.1, 5c.3-5c.4), L4 (5c.1, 5c.4), L5 (5a.4-5a.7, 5b.1, 5c.1, 5c.4, 5c.7, 11b.1-11b.4), L6 (5a.5, 5a.7, 11a.1-11a.3), L7 (5b.1-5b.2, 5b.4-5b.5, 5c.1-5c.2, 10.3-10.6, 11a.1, 11a.4), L8 (5b.3, 5c.7), L9 (5c.7), L10 (5c.5-5c.6, 9.6-9.7), L11 (5a.5, 5c.4, 5c.7).
- `auth-2fa-dispositivo-confiable`: D1 (6a.3, 6a.5, 6a.8, 10.2-10.4, 11a.1, 11a.3), D2 (1.1, 2.4, 6a.1-6a.2, 10.2), D3 (6a.1, 6a.4-6a.5, 6a.8, 10.3), D4 (6a.3-6a.5, 11a.3), D5 (6b.1-6b.6), D6 (4a.4, 6a.6-6a.8, 8.4), D7 (1.1, 1.3, 6a.1-6a.2).
- `auth-limite-intentos`: I1 (3.1-3.2, 3.5-3.6, 3.8, 4b.4), I2 (3.1-3.2, 3.5-3.6), I3 (2.3, 3.5-3.6), I4 (3.3-3.4, 3.6, 9.8, 10.1-10.2), I5 (3.5-3.6, 3.8), I6 (4b.3-4b.4, 4b.5-4b.7), I7 (3.1-3.2, 4b.3, 4b.5), I8 (1.1, 1.3, 3.1-3.2, 3.7-3.8).
- `auth-2fa-politica-cliente`: C1 (7.1-7.4, 7.5, 13.1-13.2), C2 (1.1-1.3, 7.1-7.5, 13.1), C3 (5c.3, 5c.7, 7.5), C4 (7.3, 7.5), C5 (7.3, 7.5).
- `auth-2fa-reseteo`: S1 (8.3-8.5, 13.3-13.4), S2 (8.1-8.3, 13.3-13.4), S3 (4a.4, 8.4-8.6), S4 (8.3-8.4, 13.3), S5 (8.5), S6 (8.6-8.8), S7 (8.6-8.7), S8 (8.3-8.4).
- `usuarios-reset-password`: U1 (6b.2, 6b.4), U2 (6b.1-6b.2).
- `auth-reseteo-por-olvido`: O1 (6b.3-6b.4), O2 (6b.3).
- `email-crypto-key-rotacion`: K1 (4b.1, 9.1, 9.4, 9.8), K2 (9.1-9.2, 9.4), K3 (9.3-9.4), K4 (4b.3, 5c.7, 9.5).

## Review Workload Forecast (resumen por WU)

| WU | Líneas estimadas | Riesgo | Rama |
|----|------------------|--------|------|
| 1 | ~260 | Low | `feat/verificacion-dos-pasos-wu01` |
| 2 | ~330 | Low | `feat/verificacion-dos-pasos-wu02` |
| 3 | ~390 | Medium | `feat/verificacion-dos-pasos-wu03` |
| 4a | ~340 | Low | `feat/verificacion-dos-pasos-wu04a` |
| 4b | ~330 | Low | `feat/verificacion-dos-pasos-wu04b` |
| 4c | ~380 | Medium | `feat/verificacion-dos-pasos-wu04c` |
| 5a | ~360 | Low | `feat/verificacion-dos-pasos-wu05a` |
| 5b | ~280 | Low | `feat/verificacion-dos-pasos-wu05b` |
| 5c | ~380 | Medium | `feat/verificacion-dos-pasos-wu05c` |
| 6a | ~330 | Low | `feat/verificacion-dos-pasos-wu06a` |
| 6b | ~300 | Low | `feat/verificacion-dos-pasos-wu06b` |
| 7 | ~280 | Low | `feat/verificacion-dos-pasos-wu07` |
| 8 | ~390 | Medium | `feat/verificacion-dos-pasos-wu08` |
| 9 | ~390 | Medium | `feat/verificacion-dos-pasos-wu09` |
| 10 | ~395 | Medium | `feat/verificacion-dos-pasos-wu10` |
| 11a | ~380 | Medium | `feat/verificacion-dos-pasos-wu11a` |
| 11b | ~360 | Low | `feat/verificacion-dos-pasos-wu11b` |
| 12 | ~390 | Medium | `feat/verificacion-dos-pasos-wu12` |
| 13 | ~280 | Low | `feat/verificacion-dos-pasos-wu13` |
| Total | ~6.250 | High | tracker `feat/verificacion-dos-pasos` |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: feature-branch-chain
400-line budget risk: High

Delivery: `auto-chain`, un PR por WU, cada uno ≤ 400 líneas. Ninguna WU requiere `size:exception` según el pronóstico: ninguna necesita separar código de los tests que lo prueban. Las WU de riesgo Medio están a 5-30 líneas del tope; cada una declara su corte limpio en su tarea de verificación (WU-3, WU-8, WU-9, WU-12). `size:exception` solo si partir separaría código de su test, informándolo en el PR (owner policy). Cada WU compila y queda en verde sola; se revierte con `git revert` en orden inverso, más `rollback.sql` de M1 para el revert total.
