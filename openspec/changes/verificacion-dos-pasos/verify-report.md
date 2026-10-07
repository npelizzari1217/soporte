```yaml
schema: gentle-ai.verify-result/v1
evidence_revision: sha256:b1ac9364942a85e2cca3dd51302ac0c7de3f1d3912c639265204864e749566db
verdict: fail
blockers: 1
critical_findings: 1
requirements: 61/61
scenarios: 123/124
test_command: cd backend && pnpm test
test_exit_code: 0
test_output_hash: sha256:53813571f863e4a2f8408a9382e858740f7ac9887f1b3ac7ddb7f1bd7d4e58c2
build_command: cd backend && pnpm lint && pnpm typecheck
build_exit_code: 0
build_output_hash: sha256:529a7a73e31bc62668a1e8739951adb557876fbfa59e6fa24be8e3bae6ba4f3f
```

## Verification Report

**Change**: verificacion-dos-pasos
**Version**: N/A (new capabilities: auth-2fa-totp, auth-2fa-login, auth-2fa-dispositivo-confiable, auth-limite-intentos, auth-2fa-politica-cliente, auth-2fa-reseteo; deltas: usuarios-reset-password, auth-reseteo-por-olvido, email-crypto-key-rotacion)
**Mode**: Standard (feature; no Strict TDD injection)
**Candidate**: branch `feat/verificacion-dos-pasos-wu13` (tip of the feature-branch chain, every work unit included), HEAD `e0e24870`, diff `git diff main...HEAD` (merge base `009f8eb8` = `main`), 185 files, +12506/-431. `evidence_revision` is the sha256 of that diff.

### Completeness

| Metric | Value |
|--------|-------|
| Tasks total | 128 |
| Tasks complete | 128 |
| Tasks incomplete | 0 |

`gentle-ai sdd-status verificacion-dos-pasos --cwd . --json`: `taskProgress` 128/128, `allComplete: true`, `verifyReport: missing` (this report). 13.7 (roadmap closure) is not a checkbox: `tasks.md` declares it a post-deploy delivery step. Every work unit in `apply-progress.md` (WU-1 to WU-13, with the splits 3a/3b, 4b-i/4b-ii, 4c-i/4c-ii, 5a/5a2, 5b/5b2, 5c/5c2, 6a-i/ii/iii, 7/7b, 8/8b/8c, 9A/9B, 10/10b, 11a/11a2, 11b A/B, 11c) maps to the 35 implementation commits in `git log main..HEAD` (`b4213c32` to `e0e24870`), after the 7 planning commits. Task 9.7 is checked but only half done (W2).

### Build & Tests Execution

Every gate was run by this verification, in the foreground, on `e0e24870` (worktree clean except the pre-existing untracked `soporte.jpg`):

```text
backend  pnpm lint                                  exit 0  (eslint ., zero errors)
backend  pnpm typecheck                             exit 0  (tsc --noEmit -p tsconfig.typecheck.json)
backend  pnpm test                                  exit 0  656 files, 7954 tests passed (1170 s)
frontend JWT_SECRET=dummy pnpm lint                 exit 0  (No ESLint warnings or errors)
frontend pnpm type-check                            exit 0
frontend pnpm test                                  exit 0  254 files, 2064 tests passed (262 s)
root     node scripts/check-casts-en-specs.mjs      exit 0  (617 in 114 files, base 617/114; ratchet holds, see W1)
root     node scripts/check-roadmap-fresco.mjs      exit 0  ("El roadmap esta fresco"; 3 decisions declared on delivered points)
native   gentle-ai sdd-status ... --json            taskProgress 128/128, allComplete true
```

**Build**: Passed. `build_output_hash` is the sha256 of the two observed result lines (`backend pnpm lint: exit 0`, `backend pnpm typecheck: exit 0`).

**Tests**: Passed (0 failed, 0 skipped). `test_output_hash` is the sha256 of the full backend log. The three `FAIL orden-de-arranque.spec.ts` blocks are the child processes that the boot-order test launches on purpose; the outer suite reports 656/656 files. ERROR/WARN lines come from forced-failure tests and from controller fixtures outside the catalog.

Environment: `soporte-postgres-master` up. Note: while the backend suite was running, this verification started two one-file Vitest runs on a scratch copy whose config still had the orphan-sweep `globalSetup`; that setup takes the same advisory lock as `usarLockMasterTest()` and skips if it cannot get it, and the main run finished green, so the evidence above is unaffected.

**Coverage**: not measured (threshold 0 in `openspec/config.yaml`) -> Not available.

**Adversarial mutation** (on a scratch copy of `backend/` with `node_modules` linked and the orphan sweep removed; the worktree was never touched):

| Mutation | Result |
|---|---|
| Baseline `login.use-case.spec.ts` (unmutated copy) | GREEN, 41/41 |
| M1 `login.use-case.ts:169` `estadoTfa?.secretoCifrado != null` -> `estadoTfa != null` (a pending-only secret triggers the challenge) | GREEN: `login.use-case.spec.ts` 41/41, and `vitest run src/auth src/clientes/interface` 97 files, 1134 tests, all green. Survives: confirms C1 |

The apply phase already recorded mutations that turned red: `ultimo_paso <` -> `<=` (4 RED), `devolver` -> `liberar` (3 RED), `some` -> `every` in `esObligado2fa` (C3 and L5 RED).

### Spec Compliance Matrix

Totals counted from the nine spec files with the native heading rules (`### Requirement:` and `#### Scenario:`): 61 requirements, 124 scenarios. Every test named below passed in the runs above. Composite evidence is listed when one scenario is proven by more than one test.

**auth-2fa-totp** (T1-T12, 27 scenarios)

| Req | Scenario | Test | Result |
|---|---|---|---|
| T1 | Vector oficial del RFC | `totp-nativo.service.spec.ts` `it.each` over the RFC 6238 appendix B SHA-1 vectors (T = 59, 1111111109, 1111111111, 1234567890, 2000000000) | COMPLIANT |
| T1 | Tolerancia de un paso | `totp-nativo.service.spec.ts > ventana +-1 acepta el paso anterior y el siguiente y devuelve el paso aceptado` | COMPLIANT |
| T1 | Fuera de tolerancia o mal formado | `> ventana +-2 rechaza`; `it.each(['', '12345', '1234567', 'abcdef', ...])` malformed codes | COMPLIANT |
| T2 | Replay del mismo código | `prisma-tfa.repository.integration.spec.ts > un paso anterior o igual al ultimo es replay`; `verificador-codigo-tfa.spec.ts > un replay (CAS en falso) rechaza y no libera` | COMPLIANT |
| T2 | Dos envíos simultáneos | `prisma-tfa.repository.integration.spec.ts > dos registros concurrentes del mismo paso: exactamente uno acepta` (apply mutation `<` to `<=`: 4 RED) | COMPLIANT |
| T3 | La base no contiene el plaintext | `tfa-cuenta.use-cases.spec.ts > iniciar guarda un pendiente cifrado y devuelve uri y clave manual`; `secreto-totp-cifrado.spec.ts > cifra con AAD tfa:{usuarioId}` | COMPLIANT |
| T3 | Ninguna respuesta posterior lo devuelve | `tfa-cuenta.use-cases.spec.ts > estado: obligado por esObligado2fa y sin secreto en la respuesta (T3)`; FE `configurar-tfa-dialog.test.tsx` | COMPLIANT |
| T4 | Confirmación correcta | `tfa-cuenta.use-cases.spec.ts > confirmar activa y entrega 10 codigos solo la primera vez`; `confirmador-secreto-pendiente.spec.ts > acepta un TOTP del pendiente, promueve ...` | COMPLIANT |
| T4 | Confirmación con código incorrecto | same `tfa-cuenta` test ("uno erroneo no activa"); `desafio-login.use-cases.spec.ts > un codigo rechazado (o repetido) no rota el desafio` | COMPLIANT |
| T4 | Un secreto pendiente no se pide en el login | **none**: no test logs in a user whose `usuarios_tfa` row has only a pending secret (see C1) | UNTESTED |
| T4 | Reiniciar reemplaza el pendiente | `prisma-tfa.repository.integration.spec.ts > con otro pendiente leido no promueve`; `confirmador-secreto-pendiente.spec.ts > un CAS en falso (pendiente reemplazado) rechaza y no libera` | COMPLIANT |
| T5 | Diez códigos mostrados una vez | `tfa-cuenta.use-cases.spec.ts > confirmar activa y entrega 10 codigos solo la primera vez`; `login-2fa.e2e.spec.ts > ENROLAR ...` (`toHaveLength(10)`); FE `codigos-recuperacion.test.tsx > lista los 10 códigos` | COMPLIANT |
| T5 | Un código usado no vuelve a servir | `verificador-codigo-tfa.spec.ts > un codigo de recuperacion ya consumido por otro (CAS en falso) rechaza`; `prisma-tfa.repository.integration.spec.ts > guarda 10, consume uno y cuenta los restantes` | COMPLIANT |
| T5 | Uso concurrente | `prisma-tfa.repository.integration.spec.ts > dos consumos concurrentes del mismo codigo: uno gana` | COMPLIANT |
| T5 | La base no contiene los códigos | `prisma-tfa.repository.integration.spec.ts` (hashes only; argon2id via `IHashProvider`); `codigos-recuperacion.ts` hashes before `reemplazarCodigos` | COMPLIANT |
| T6 | Un usuario en dos clientes | `tfa-cuenta.e2e.spec.ts > ROOT y usuario normal activan su 2FA por separado y no ven el del otro`; `login-2fa.e2e.spec.ts > con 2FA y dos clientes ...` (one secret, any client) | COMPLIANT |
| T7 | Activación voluntaria | `tfa-cuenta.use-cases.spec.ts > iniciar ... (T4, T7)`; `tfa-cuenta.e2e.spec.ts`; `login.use-case.spec.ts > 2FA activo → desafio VERIFICAR` | COMPLIANT |
| T8 | No obligado desactiva | `desactivar-tfa.use-case.spec.ts > con codigo valido y sin obligacion borra todo ...`; `dispositivo-confiable.e2e.spec.ts` (204, device revoked, `usuarios_tfa` empty) | COMPLIANT |
| T8 | Obligado no puede desactivar | `desactivar-tfa.use-case.spec.ts > obligado (ROOT / cliente que exige 2FA): Tfa2faObligatorioError sin gastar cupo ni borrar nada` | COMPLIANT |
| T8 | Sin código válido | `desactivar-tfa.use-case.spec.ts > codigo invalido: rechazo y no borra` | COMPLIANT |
| T9 | Regeneración correcta | `tfa-cuenta.use-cases.spec.ts > regenerar con codigo valido invalida el juego anterior`; `tfa-cuenta.e2e.spec.ts > regenerar invalida el juego anterior ...`; `prisma-tfa.repository.integration.spec.ts > regenerar borra el juego anterior e inserta el nuevo` | COMPLIANT |
| T9 | Regeneración sin código válido | same unit ("sin codigo valido no cambia nada"); e2e 422 | COMPLIANT |
| T10 | Cambio correcto | `tfa-cuenta.use-cases.spec.ts > con 2FA activo, cambiar de celular exige codigo y el activo rige hasta confirmar`; `prisma-tfa.repository.integration.spec.ts > un unico CAS fija secreto, confirmado_at y paso` | COMPLIANT |
| T10 | Cambio abandonado | same unit ("el activo rige hasta confirmar"); `prisma-tfa.repository.integration.spec.ts > ... guardar no toca el secreto activo`; `confirmador-secreto-pendiente.spec.ts > rechaza un codigo valido solo para el secreto activo` | COMPLIANT |
| T10 | Sin código válido | `tfa-cuenta.use-cases.spec.ts` (cambio de celular sin codigo valido no guarda pendiente) | COMPLIANT |
| T11 | Activar y resetear no envían mail | `tfa-cuenta.use-cases.spec.ts > ninguna accion de autogestion envia mail ni ofrece otro canal (T11)`; `ResetearTfaUsuarioUseCase` has no mail port | COMPLIANT |
| T12 | Descifrado fallido en la verificación | `tfa-secreto-indescifrable.e2e.spec.ts` (`it.each` tampered / other-user AAD / garbage → 401, never 500, log `TFA_SECRETO_INDESCIFRABLE`); `verificador-codigo-tfa.spec.ts > rechaza, loguea sin codigo ni clave y devuelve la reserva` | COMPLIANT |

**auth-2fa-login** (L1-L11, 26 scenarios)

| Req | Scenario | Test | Result |
|---|---|---|---|
| L1 | Usuario con 2FA y un solo cliente | `login-2fa.e2e.spec.ts > con 2FA y un cliente: desafio sin tokens, verificar, continuar ...` | COMPLIANT |
| L1 | Usuario con 2FA y varios clientes | `login-2fa.e2e.spec.ts > con 2FA y dos clientes: selector tras el codigo ...` | COMPLIANT |
| L1 | Contraseña incorrecta no filtra el 2FA | `login.use-case.spec.ts > contrasena invalida: no consulta el 2FA ni revela si lo hay (L1)` | COMPLIANT |
| L2 | Desafío vencido | `prisma-desafio-login.repository.integration.spec.ts > el desafio vencido no sirve y el ticket vence 5 min despues de verificar` | COMPLIANT |
| L2 | Desafío reutilizado | `prisma-desafio-login.repository.integration.spec.ts > verificar rota el token ...`; `login-2fa.e2e.spec.ts` ("el desafio no se reusa") | COMPLIANT |
| L2 | Desafío de otro usuario o inventado | `prisma-desafio-login.repository.integration.spec.ts > el desafio de otro usuario o de otro proposito no sirve`, `> un token desconocido no sirve`; `desafio-login.use-cases.spec.ts` (same `SegundoPasoRechazadoError`) | COMPLIANT |
| L3 | ROOT siempre obligado | `es-obligado-2fa.spec.ts > ROOT siempre esta obligado`; `login.use-case.spec.ts > ROOT sin 2FA → desafio ENROLAR ...` | COMPLIANT |
| L3 | Un cliente exige y el usuario entra a otro | `login-2fa.e2e.spec.ts > C3: un cliente que exige 2FA obliga al usuario aunque entre al otro (some, no every)` (apply mutation `some`→`every` RED) | COMPLIANT |
| L3 | Membresía inactiva o cliente suspendido | `es-obligado-2fa.spec.ts > una membresia inactiva no cuenta ...`; `prisma-auth-repos.integration.spec.ts > findActivasByUsuario excluye membresías inactivas / de clientes inactivos` | COMPLIANT |
| L4 | No obligado con 2FA activo | `login.use-case.spec.ts > 2FA activo → desafio VERIFICAR y {needs2fa} sin emitir sesion (L4)` | COMPLIANT |
| L5 | Obligado sin 2FA | `login.use-case.spec.ts > ROOT sin 2FA → desafio ENROLAR ...`; `usuarios-reseteo-tfa.e2e.spec.ts > S5 ...` | COMPLIANT |
| L5 | Cierre solo con confirmación de guardado | `login-2fa.e2e.spec.ts > ENROLAR no abre sesion ni selector hasta confirmar el enrolamiento`; FE `page.test.tsx > 2FA obligatorio → QR, confirma, muestra los códigos y recién al marcar 'Los guardé' continúa`; `codigos-recuperacion.test.tsx > Continuar queda deshabilitado hasta marcar 'Los guardé'` | COMPLIANT |
| L5 | El desafío de configuración no sirve para otra cosa | `login-2fa.e2e.spec.ts` (ENROLAR desafío → `continuar` 401, `seleccionar` 401); `continuar-login.use-cases.spec.ts > un ticket desconocido o un ENROLAR sin verificar se rechaza`; the desafío is 64 hex chars, not a JWT, so `JwtAuthGuard` rejects it as any malformed token (`auth.e2e.spec.ts` guard tests) | COMPLIANT |
| L6 | Código TOTP correcto | `verificador-codigo-tfa.spec.ts > acepta el TOTP del secreto activo ...`; `login-2fa.e2e.spec.ts` | COMPLIANT |
| L6 | Código de recuperación | `verificador-codigo-tfa.spec.ts > acepta un codigo de recuperacion, lo consume y libera`; `tfa-login.e2e.spec.ts > verificar con codigo de recuperacion -> selector ...` | COMPLIANT |
| L6 | Código incorrecto | `desafio-login.use-cases.spec.ts > codigo erroneo o bloqueo dan el mismo rechazo y no rotan el desafio` | COMPLIANT |
| L7 | Selección con ticket | `tfa-login.e2e.spec.ts > ... seleccionar sin reenviar nada`; FE `use-login.test.tsx > selectCliente usa el ticket: manda { ticket, clienteId } sin contraseña ni código` | COMPLIANT |
| L7 | Ticket reutilizado o vencido | `prisma-desafio-login.repository.integration.spec.ts > un ticket es de un solo uso ...`, `> el desafio vencido no sirve y el ticket vence 5 min ...`; `tfa-login.e2e.spec.ts` (reused ticket 401) | COMPLIANT |
| L7 | Cliente ajeno | `continuar-login.use-cases.spec.ts > membresia inexistente o inactiva rechaza igual que un ticket invalido y no consume`; `tfa-login.e2e.spec.ts` (foreign client 401, ticket alive) | COMPLIANT |
| L7 | Usuario sin 2FA y con varios clientes | `login-2fa.e2e.spec.ts > sin 2FA y dos clientes: selector con ticket y seleccion sin reenviar la contrasena` | COMPLIANT |
| L8 | Refresh | `login-2fa.e2e.spec.ts > con 2FA y un cliente ... refresh sin codigo`; `tfa-login.e2e.spec.ts` | COMPLIANT |
| L8 | Cambio de cliente | `login-2fa.e2e.spec.ts > con 2FA y dos clientes: ... cambio de cliente sin codigo` | COMPLIANT |
| L9 | Refresh token sin segundo factor | `login-2fa.e2e.spec.ts > con 2FA y un cliente ... (L1, L2, L8, L9)` | COMPLIANT |
| L10 | ROOT en entorno de test | `login.use-case.spec.ts > ROOT con 2FA → VERIFICAR` / `ROOT sin 2FA → ENROLAR`; `auth.e2e.spec.ts` ROOT logins go through `codigoDeTest` (no bypass flag exists) | COMPLIANT |
| L10 | Seed de ROOT | `root-bootstrap.seed.integration.spec.ts > it.each(['development', 'test'])` (2FA active, secret decrypts); `it.each([undefined, 'production', 'staging', 'Production', ''])` (error, nothing touched) | COMPLIANT |
| L11 | Secreto ilegible | `login-2fa.e2e.spec.ts > secreto cifrado con el AAD de otro usuario: 401 sin 500 ni sesion`; `tfa-secreto-indescifrable.e2e.spec.ts` | COMPLIANT |

**auth-2fa-dispositivo-confiable** (D1-D7, 14 scenarios)

| Req | Scenario | Test | Result |
|---|---|---|---|
| D1 | Recordar tras el segundo paso | `desafio-login.use-cases.spec.ts > un usuario normal con recordar recibe el token crudo y se guarda solo su hash por 30 dias`; FE `2fa/verificar/route.test.ts > dispositivoConfiable → cookie td httpOnly de 30 días y NO sale en el body` | COMPLIANT |
| D1 | Sin marcar "recordar" | `desafio-login.use-cases.spec.ts > sin recordar no emite dispositivo`; FE `> sin dispositivoConfiable → devuelve el ticket y no setea cookies` | COMPLIANT |
| D2 | Dentro de la vigencia | `prisma-dispositivo-confiable.repository.integration.spec.ts > esValido: la vigencia es exacta, valido un instante antes y vencido en el limite` | COMPLIANT |
| D2 | Vencido | same test | COMPLIANT |
| D3 | Dispositivo válido | `dispositivo-confiable.e2e.spec.ts > verificar con recordar emite el token; el login siguiente lo usa`; `login.use-case.spec.ts > un token valido del usuario omite el desafio ...` | COMPLIANT |
| D3 | Token de otro usuario o revocado | same e2e (`'f'.repeat(64)` → `needs2fa`); `login.use-case.spec.ts > un token ajeno, revocado o vencido (esValido falso) sigue con el desafio` | COMPLIANT |
| D3 | Contraseña incorrecta con dispositivo válido | same e2e (`malaClave` 401); `login.use-case.spec.ts > no omite la contrasena` | COMPLIANT |
| D4 | ROOT no recibe token | `desafio-login.use-cases.spec.ts > ROOT no recibe dispositivo aunque envie recordar (D4)`; `login.use-case.spec.ts > ROOT con 2FA → VERIFICAR sin dispositivo confiable` | COMPLIANT |
| D4 | Usuario promovido a ROOT | `login.use-case.spec.ts > un token valido de quien hoy es ROOT se ignora (D4)` | COMPLIANT |
| D5 | Cambio propio | `cambiar-password.use-case.spec.ts > orden: verificar actual → hash → revocar dispositivos → save → revocar refresh`; `prisma-dispositivo-confiable.repository.integration.spec.ts > revocarTodosDe revoca todos los del usuario` | COMPLIANT |
| D5 | Fallo de invalidación | `cambiar-password.use-case.spec.ts > si revocarTodosDe lanza, la excepción se propaga y save nunca se llama` | COMPLIANT |
| D6 | Reseteo | `usuarios-reseteo-tfa.e2e.spec.ts > S1/S3 ... efectos completos`; `prisma-tfa.repository.integration.spec.ts > borra 2FA y codigos, revoca dispositivos e invalida desafios abiertos` | COMPLIANT |
| D6 | Fallo de invalidación en el reseteo | `prisma-tfa.repository.integration.spec.ts > con un fallo forzado a mitad no queda nada a medias` (`eliminarTodo` is one transaction; both reset and disable call it without catching); `desactivar-tfa.use-case.spec.ts > si eliminarTodo lanza, propaga ...` | COMPLIANT |
| D7 | Inspección de base y logs | `prisma-dispositivo-confiable.repository.integration.spec.ts > crear guarda solo el hash: el token crudo no esta en ninguna columna`; no logger receives the token (static: `rg` over `src/auth`) | COMPLIANT |

**auth-limite-intentos** (I1-I8, 15 scenarios)

| Req | Scenario | Test | Result |
|---|---|---|---|
| I1 | Quinto fallo | `prisma-limitador-intentos.integration.spec.ts > 10 reservas concurrentes con la clave en 0: exactamente 5 devuelven reserva`; `limite-intentos.e2e.spec.ts > 5 contrasenas incorrectas bloquean ...` | COMPLIANT |
| I1 | Logins exitosos no cuentan | `login.use-case.spec.ts > password correcto libera la clave`; `limite-intentos.e2e.spec.ts > un exito reinicia el contador (la fila desaparece)` | COMPLIANT |
| I1 | Fuera de la ventana | `prisma-limitador-intentos.integration.spec.ts > una ventana vencida reinicia en 1` | COMPLIANT |
| I2 | Reinicio | `prisma-limitador-intentos.integration.spec.ts > liberar borra la fila (I2)`; e2e "un exito reinicia el contador" | COMPLIANT |
| I3 | Normalización | `login.use-case.spec.ts > la clave es pwd:{sha256(email normalizado)}:{ip}, sin el email en claro` (`'  Juan@Test.COM '` → same key as `juan@test.com`) | COMPLIANT |
| I3 | Otra IP no se ve afectada | same unit (the IP is part of the key) + the limiter is keyed per `clave` (`prisma-limitador-intentos.integration.spec.ts`) | COMPLIANT |
| I3 | Email inexistente | `login.use-case.spec.ts > email inexistente cuenta igual: reserva y no libera` | COMPLIANT |
| I4 | Cabecera de IP falsificada por el navegador | `ip-del-navegador.spec.ts > desde un par no loopback ignora la cabecera y usa el socket`; FE `sesion-bff.test.ts > toma la entrada más a la derecha y descarta lo que mandó el navegador` | COMPLIANT |
| I4 | El BFF reenvía la IP | FE `login/route.test.ts > manda x-soporte-ip-navegador (derecha de XFF, sin puerto) ...`; `sesion-bff.test.ts` (IPv4/IPv6 with and without port) | COMPLIANT |
| I5 | Bloqueado con contraseña correcta | `limite-intentos.e2e.spec.ts > 5 contrasenas incorrectas bloquean: la sexta, con la correcta, da el mismo 401 generico`; `login.use-case.spec.ts > bloqueado y fallo normal son indistinguibles` | COMPLIANT |
| I6 | Cinco códigos incorrectos | `verificador-codigo-tfa.integration.spec.ts` (real limiter on `cod:{usuarioId}`); `verificador-codigo-tfa.spec.ts > bloqueado no verifica nada ni acepta el codigo correcto` | COMPLIANT |
| I6 | Autogestión comparte el contador | `verificador-codigo-tfa.spec.ts` and `confirmador-secreto-pendiente.spec.ts` both reserve `'cod:u1'`; `desactivar`, `regenerar` and `iniciar` cambio de celular go through `VerificadorCodigoTfa` | COMPLIANT |
| I7 | Código correcto durante el bloqueo | `verificador-codigo-tfa.spec.ts > bloqueado no verifica nada ni acepta el codigo correcto (I7)`; `prisma-limitador-intentos.integration.spec.ts > reservar bloqueado devuelve null y no incrementa` | COMPLIANT |
| I7 | Fin de la ventana | `prisma-limitador-intentos.integration.spec.ts > una ventana vencida reinicia en 1` | COMPLIANT |
| I8 | Reinicio del proceso | `limite-intentos.e2e.spec.ts > el bloqueo sobrevive a reconstruir el modulo (reinicio simulado)` | COMPLIANT |

**auth-2fa-politica-cliente** (C1-C5, 8 scenarios)

| Req | Scenario | Test | Result |
|---|---|---|---|
| C1 | Activar la política | `politica-tfa.e2e.spec.ts > ADMINISTRADOR cambia la de su cliente y el cliente B no se entera`; FE `politica-tfa-card.test.tsx` | COMPLIANT |
| C1 | No puede tocar otro cliente | `politica-tfa.e2e.spec.ts > un clienteId en el body se ignora: solo cuenta el del token` | COMPLIANT |
| C2 | Cliente existente | `migracion-m1.integration.spec.ts > requiere_2fa es NOT NULL DEFAULT false (sin backfill) ...`; `prisma-cliente.repository.integration.spec.ts > politica de 2FA: default false ...` | COMPLIANT |
| C2 | Actor no administrador | `politica-tfa.e2e.spec.ts > sin token 401; TECNICO 403 en GET y PUT sin cambiar nada` | COMPLIANT |
| C3 | Usuario en varios clientes | `login-2fa.e2e.spec.ts > C3: ...`; `tfa-cuenta.use-cases.spec.ts > estado: obligado cuando una membresia activa pertenece a un cliente con la politica` | COMPLIANT |
| C3 | Usuario sin 2FA configurado | `login.use-case.spec.ts > una membresia cuyo cliente exige 2FA obliga al enrolamiento (L3, C3)`; `login-2fa.e2e.spec.ts > ENROLAR ...` | COMPLIANT |
| C4 | Sesión abierta al activar | `politica-tfa.e2e.spec.ts > body invalido 400; activar y desactivar no invalidan una sesion abierta (C4)` | COMPLIANT |
| C5 | Se desactiva la política | `configurar-politica-tfa.use-case.spec.ts > desactivar escribe false y no hace nada mas: ni sesiones ni 2FA existentes (C4, C5)`; `desactivar-tfa.use-case.spec.ts` (a non-obligated user can disable) | COMPLIANT |

**auth-2fa-reseteo** (S1-S8, 15 scenarios)

| Req | Scenario | Test | Result |
|---|---|---|---|
| S1 | ROOT a un usuario común | `usuarios-reseteo-tfa.e2e.spec.ts > S1/S3: ROOT resetea a un usuario con otras membresias; efectos completos y sesion revocada` | COMPLIANT |
| S1 | ROOT a otro ROOT | `usuarios-reseteo-tfa.e2e.spec.ts > S1: ROOT resetea a otro ROOT` | COMPLIANT |
| S2 | Pertenece solo a su cliente | `usuarios-reseteo-tfa.e2e.spec.ts > S2/S3: ADMINISTRADOR resetea a un usuario solo de su cliente, y a si mismo` | COMPLIANT |
| S2 | Tiene otra membresía inactiva | `usuarios-reseteo-tfa.e2e.spec.ts > S2/S4: otras membresias, destino ROOT, otro cliente e inexistente dan el MISMO 404 ...`; `resetear-tfa-usuario.use-case.spec.ts` `it.each` | COMPLIANT |
| S2 | Otra membresía en un cliente suspendido | same e2e and unit `it.each`; `prisma-auth-repos.integration.spec.ts > findClientesDeTodasByUsuario cuenta TODAS: activas, inactivas, de cliente suspendido y soft-deleted` | COMPLIANT |
| S2 | Destino ROOT | same e2e (destino ROOT, same 404, nothing touched) | COMPLIANT |
| S3 | Reseteo completo | `usuarios-reseteo-tfa.e2e.spec.ts > S1/S3 ...` (no secret, no codes, device revoked, refresh rejected); `resetear-2fa-root.spec.ts > S3/S6 ...` | COMPLIANT |
| S4 | Usuario de otro cliente o inexistente | `usuarios-reseteo-tfa.e2e.spec.ts > S2/S4 ... dan el MISMO 404`; FE `editar-usuario-dialog.test.tsx > un 404 muestra un mensaje neutro sin revelar el motivo` | COMPLIANT |
| S5 | No obligado | `usuarios-reseteo-tfa.e2e.spec.ts > S5: tras el reseteo, no obligado entra sin codigo y obligado pasa por el enrolamiento` | COMPLIANT |
| S5 | Obligado | same e2e | COMPLIANT |
| S6 | ROOT bloqueado | `resetear-2fa-root.spec.ts > S3/S6: un ROOT queda sin 2FA, codigos, dispositivos vivos ni sesiones`; `> S7: el proceso real imprime solo OK, con exit 0` | COMPLIANT |
| S6 | Usuario que no es ROOT o no existe | `resetear-2fa-root.spec.ts > S6: un usuario que no es ROOT o no existe falla sin modificar nada`; `> S6/S7: el proceso real sale con 1 para un no ROOT ...` | COMPLIANT |
| S7 | Salida del script | `resetear-2fa-root.spec.ts > S7: el proceso real imprime solo OK ...` | COMPLIANT |
| S7 | Codificación del `.ps1` | No `.ps1` was added for the script (ADR-10). The only touched `.ps1` (`rotate-email-crypto-key.ps1`, header comment) was checked by this verification: no byte above 0x7F, first bytes `# r` (no BOM) | COMPLIANT (conditional scenario; manual byte check) |
| S8 | TECNICO | `usuarios-reseteo-tfa.e2e.spec.ts > S8: un TECNICO recibe 403 y nada cambia` | COMPLIANT |

**auth-reseteo-por-olvido** (O1, O2, MODIFIED; 7 scenarios)

| Req | Scenario | Test | Result |
|---|---|---|---|
| O1 | Confirmación exitosa | `confirmar-reset-password.use-case.spec.ts > orden: hash en memoria → revocar dispositivos → CAS del token → save` | COMPLIANT |
| O1 | La invalidación falla | `> si revocarTodosDe lanza: propaga, y ni el CAS ni save corren (el token sigue vigente)` | COMPLIANT |
| O2 | Login posterior al reset | `ConfirmarResetPasswordUseCase` has no 2FA port (cannot alter it); `login.use-case.spec.ts > 2FA activo → desafio VERIFICAR` | COMPLIANT |
| O2 | La confirmación no pide código | `confirmar-reset-password.use-case.spec.ts > Confirmación exitosa: hashea vía hashPassword(), consume el CAS, persiste ...` (no code input) | COMPLIANT |
| MOD | Reset exitoso revoca las sesiones activas | same success test (revoca) | COMPLIANT |
| MOD | Un fallo de revocación no deshace el reset | `> La revocación falla pero el reset persiste: retorna ok y logger.error ...` | COMPLIANT |
| MOD | La tolerancia no alcanza a los dispositivos confiables | `> si revocarTodosDe lanza: propaga ...` (devices are revoked before the CAS, so the refresh tolerance is never reached) | COMPLIANT |

**email-crypto-key-rotacion** (K1-K4, 7 scenarios)

| Req | Scenario | Test | Result |
|---|---|---|---|
| K1 | Rotación con secretos TOTP | `rotar-email-crypto-key.integration.spec.ts > re-cifra SMTP, secreto activo y pendiente; descifran con la clave nueva y AAD propio (K1, K2)`; `.proceso.spec.ts > rotación y --verificar cubren los secretos TOTP` | COMPLIANT |
| K1 | Vínculo con el usuario | `> un ciphertext TOTP movido a otro usuario no descifra (AAD tfa:{usuario_id})` | COMPLIANT |
| K2 | Un secreto indescifrable aborta todo | `> un secreto TOTP indescifrable revierte TODO, también el SMTP ya re-cifrado (K2)`; `.proceso.spec.ts > rotación con fila indescifrable: exit 3` | COMPLIANT |
| K2 | Re-corrida | `> idempotente: la segunda corrida cuenta ya_migradas y no toca nada` | COMPLIANT |
| K3 | Todo descifra | `> --verificar recorre los destinos TOTP: ok con la clave vigente ...` | COMPLIANT |
| K3 | Un secreto TOTP no descifra | same test ("falla con un secreto ajeno") | COMPLIANT |
| K4 | Login con clave equivocada | `tfa-secreto-indescifrable.e2e.spec.ts` (401, log without code or key) | COMPLIANT |

**usuarios-reset-password** (U1, U2, MODIFIED; 5 scenarios)

| Req | Scenario | Test | Result |
|---|---|---|---|
| U1 | Reset exitoso invalida dispositivos | `resetear-password-usuario-tenant.use-case.spec.ts > revoca los dispositivos del DESTINO antes del save y luego los refresh`; `scripts/reset-password.integration.spec.ts > revoca todos los dispositivos y cambia la contraseña` | COMPLIANT |
| U1 | La invalidación de dispositivos falla | `> si revocarTodosDe lanza, la excepción se propaga y save nunca se llama`; `reset-password.integration.spec.ts > [CRITICAL] atómico: si el UPDATE de la contraseña falla, los dispositivos siguen vivos` | COMPLIANT |
| U2 | El siguiente login pide código | the use case has no 2FA port; `login.use-case.spec.ts > 2FA activo → desafio VERIFICAR` | COMPLIANT |
| MOD | La revocación falla pero la operación igual reporta éxito | `> la revocación falla pero la operación igual reporta éxito`; `> el argumento de logger.error en la revocación fallida NO contiene el plaintext` | COMPLIANT |
| MOD | La tolerancia no alcanza a los dispositivos confiables | `> si revocarTodosDe lanza, la excepción se propaga y save nunca se llama` | COMPLIANT |

**Compliance summary**: 123/124 scenarios COMPLIANT, 0 PARTIAL, 0 FAILING, 1 UNTESTED (T4 "Un secreto pendiente no se pide en el login").

### Roadmap Decision Fidelity

Source: `docs/roadmap-comercial.md`, "Decisiones de producto de la segunda etapa", bullet "Segunda etapa, punto 5 — verificación en dos pasos (2FA)", including the sub-list "Precisiones del 2026-10-07, al explorar". Each sub-bullet was checked against the code, not against the spec. "Status" is what the post-deploy closure (task 13.7) can declare.

| # | Sub-bullet | Code evidence | Test evidence | Status |
|---|---|---|---|---|
| M1 | TOTP app; 10 single-use recovery codes shown once; no code by mail | `TotpNativoService` (RFC 6238, ±1 step); `codigos-recuperacion.ts` (10 Crockford codes, argon2id); no mail port in any 2FA use case | RFC vectors; `tfa-cuenta.use-cases.spec.ts` (10 codes, T11 no mail) | Cumplida |
| M2 | 2FA is per user, not per client | `usuarios_tfa` keyed by `usuario_id` (master, M1); no client column | `tfa-cuenta.e2e.spec.ts` (T6); `login-2fa.e2e.spec.ts` (one secret, two clients) | Cumplida |
| M3 | Self-activation; ADMINISTRADOR requires it for their client; any requiring client applies to every login; forced setup after the password | `IniciarSecretoTfa`/`ConfirmarSecretoTfa`; `PoliticaTfaController` (client from the JWT); `esObligado2fa` = ROOT or `some(clienteRequiere2fa)`; `LoginUseCase` returns `needsEnrolamiento2fa` | `politica-tfa.e2e.spec.ts`; `login-2fa.e2e.spec.ts > C3`; `ENROLAR no abre sesion ...` | Cumplida |
| M4 | Mandatory for ROOT | `esObligado2fa(isGlobalAdmin, ...)` returns true for ROOT; ROOT can never disable (`DesactivarTfaUseCase`) | `es-obligado-2fa.spec.ts`; `login.use-case.spec.ts > ROOT sin 2FA → ENROLAR`; `desactivar-tfa.use-case.spec.ts` (ROOT 409) | Cumplida |
| M5 | Once per login, after the password and before the client selector; switching client or refreshing does not ask again | 2FA branch in `LoginUseCase` runs before the `clienteId`/selector branch; the selector uses the ticket; `RefreshTokenUseCase` and `SwitchTenantUseCase` unchanged | `login-2fa.e2e.spec.ts` (L1, L7, L8, L9) | Cumplida |
| M6 | "Remember this device" for 30 days; invalidated on password change or 2FA reset | `tfa_dispositivos_confiables` (`expira_at` = +30 days, hash only); revocation in the 3 password use cases, `reset-password.ts` and `eliminarTodo` | `dispositivo-confiable.e2e.spec.ts`; D5/D6 tests | Cumplida |
| M7 | ROOT resets 2FA; ADMINISTRADOR only if the user belongs only to their client | `ResetearTfaUsuarioUseCase` (ROOT unrestricted; admin requires active membership in their client and every membership in it) | `usuarios-reseteo-tfa.e2e.spec.ts` | Cumplida |
| M8 | Password reset by mail does not disable 2FA | `ConfirmarResetPasswordUseCase` only revokes devices; it has no 2FA port | O2 tests | Cumplida |
| M9 | Attempt limit on login and on code verification (about 5 per 15 minutes per user) | `PrismaLimitadorIntentos` (atomic reservation, failures only, `LIMITADOR_MAX_INTENTOS = 5`, window 15 min); password key per email + IP (P6), code key per user | limiter integration (10 concurrent → 5); `limite-intentos.e2e.spec.ts` | Cumplida ("about 5" fixed at exactly 5, as the spec declares) |
| M10 | Out of scope: WebAuthn/passkeys, SMS, login audit log | none of them exists in the diff | `rg` over the diff: no WebAuthn, SMS or audit code | Cumplida (out of scope as decided) |
| P1 | Non-obligated user can disable, obligated cannot; anyone regenerates codes and changes phone; all three need a valid code | `DesactivarTfaUseCase` (obligation checked first, then `VerificadorCodigoTfa`); `RegenerarCodigosTfa`; `IniciarSecretoTfa` requires a code when 2FA is active | T8, T9, T10 tests; FE `configurar-tfa-dialog.test.tsx` | Cumplida |
| P2 | ROOT without phone or codes: operator script on the VPS; ROOT resets another ROOT; ADMINISTRADOR never resets a ROOT | `scripts/resetear-2fa-root.ts` (only `isGlobalAdmin`, one transaction, prints `OK`); `puedeResetear` returns true for a ROOT actor and false for a ROOT target of an admin | `resetear-2fa-root.spec.ts` (real `ts-node` process); e2e S1 and "destino ROOT" | Cumplida. Precision: ROOT to ROOT works through the API and the script; the admin UI lists only tenant users, so there is no button for it (open question declared out of scope in task 13.7) |
| P3 | "Belongs only to their client" counts every membership, inactive and of suspended clients | `findClientesDeTodasByUsuario` has no filter | `prisma-auth-repos.integration.spec.ts > ... cuenta TODAS ...`; e2e S2/S4 | Cumplida. Precision: soft-deleted memberships also count (stricter than the bullet, deliberate in design ADR-8) |
| P4 | "Remember this device" not available for ROOT; invalidated on any password change path (self, mail reset, admin reset) | `recordarDisponible = !isGlobalAdmin`; `emitirDispositivo` returns null for ROOT; `LoginUseCase` ignores a token if the user is ROOT now; fail-closed revocation in `CambiarPassword`, `ConfirmarResetPassword`, `ResetearPasswordUsuarioTenant` and `reset-password.ts` | D4 tests; D5, U1, O1 tests | Cumplida |
| P5 | When an administrator starts requiring 2FA, open sessions continue until they expire | `ConfigurarPoliticaTfaUseCase` depends only on `IClienteRepository` (cannot revoke sessions) | `politica-tfa.e2e.spec.ts > ... no invalidan una sesion abierta (C4)` | Cumplida |
| P6 | Password limit per user and IP, with the browser IP passed by the BFF; code limit per user | BFF `ipDelNavegador` (right-most XFF entry, port stripped, `isIP`); backend honors `x-soporte-ip-navegador` only from loopback; keys `pwd:{sha256(email)}:{ip}` and `cod:{usuarioId}` | `sesion-bff.test.ts`; `ip-del-navegador.spec.ts`; `login.use-case.spec.ts` key test | Cumplida. The post-deploy IP check (`SELECT clave FROM auth_intentos_fallidos`) is in the runbook and in `notas-deploy.md` |
| P7 | In forced setup, login ends only when the user confirms they saved the 10 codes | `ConfirmarEnrolamientoLoginUseCase` returns codes and a ticket, no session; the FE calls `login/continuar` only from `continuarTrasCodigos`, enabled by the "Los guardé" checkbox | `login-2fa.e2e.spec.ts > ENROLAR ...`; FE `page.test.tsx` and `codigos-recuperacion.test.tsx` | Cumplida |
| P8 | No way to relax 2FA outside production; tests use a known secret and generate the code | no flag or env var skips 2FA; `tfa-de-test.ts` (known secret, real `TotpNativoService`); seed accepts `ROOT_ADMIN_TOTP_SECRET` only with `NODE_ENV` exactly `development` or `test` | seed `it.each` (absent, `production`, `staging`, `Production`, empty → error, nothing touched) | Cumplida |
| P9 | Mail notice on activation or reset: out of scope | no mail in the 2FA use cases | T11 test | Cumplida (out of scope as decided) |

No undeclared deviation was found. The roadmap row for point 5 is still pending and the bullet has no Cumplida/Desviación line yet: that is task 13.7, a post-deploy step, and `check-roadmap-fresco.mjs` passes because the point is not marked delivered. The closure should carry the two precisions above (P2 no ROOT-to-ROOT button; P3 soft-deleted memberships also count).

### Correctness (Static Evidence)

| Requirement | Status | Notes |
|---|---|---|
| auth-2fa-totp T1-T12 | Implemented | T4 "pending secret not asked at login" is correct in code (`estadoTfa?.secretoCifrado != null`), but untested (C1) |
| auth-2fa-login L1-L11 | Implemented | only two session issuers in the 2FA flow (`ContinuarLoginUseCase`, `SeleccionarClienteLoginUseCase`); `LoginUseCase` issues only when no second step applies or a valid non-ROOT trusted device exists |
| auth-2fa-dispositivo-confiable D1-D7 | Implemented | revocation before persisting the password on every path; `eliminarTodo` in one transaction |
| auth-limite-intentos I1-I8 | Implemented | failures only; blocked path runs `verify(DUMMY_HASH)` and returns the same error |
| auth-2fa-politica-cliente C1-C5 | Implemented | `requiere_2fa` outside `ClienteMapper.toPersistence`; written only by `fijarRequiere2fa` |
| auth-2fa-reseteo S1-S8 | Implemented | neutral 404 for every refusal; operator script without `.ps1` |
| auth-reseteo-por-olvido O1-O2 | Implemented | an invalid or used token returns before any revocation |
| email-crypto-key-rotacion K1-K4 | Implemented | `DESTINOS` list; one transaction; `--verificar` walks every destination |
| usuarios-reset-password U1-U2 | Implemented | |

Checks requested by the orchestrator, confirmed in code:

1. **No session without the second step.** `EmitirSesionService.emitir` has three callers: `LoginUseCase` (only after the 2FA branch; it returns early with `needs2fa` or `needsEnrolamiento2fa`), `ContinuarLoginUseCase` and `SeleccionarClienteLoginUseCase`. Both of the latter require `buscarTicket` (a verified, unused, unexpired row) and win the `consumir` CAS before emitting. A `VERIFICAR` or `ENROLAR` row is not a ticket until `verificar` rotates it. `RefreshTokenUseCase` and `SwitchTenantUseCase` sign tokens from an existing session only (L8/L9 by decision). Confirmed.
2. **Fail-closed device revocation on the 4 password paths.** `CambiarPassword`, `ResetearPasswordUsuarioTenant` and `ConfirmarResetPassword` call `revocarTodosDe` before `save` (and before the CAS in the mail reset); `reset-password.ts` uses one `$transaction`. An invalid, used, revoked or expired reset token returns `ResetLinkInvalidoError` before any revocation (`> token inválido o cuenta no disponible: no revoca dispositivos`). Confirmed.
3. **Limiter.** Failures only (success calls `liberar`; an undecryptable secret calls `devolver`); 5 per 15 minutes via one `INSERT ... ON CONFLICT ... WHERE`; password key per email + IP (BFF takes the right-most XFF entry and strips the ARR port; backend trusts the header only from loopback); code key `cod:{usuarioId}` shared by login, enrollment and self-service; blocked password returns the same `CredencialesInvalidasError` after a dummy argon2 verify. Confirmed.
4. **ROOT.** Always obligated (`esObligado2fa`); never a trusted device (not issued, not honored); recoverable with `scripts/resetear-2fa-root.ts`; the seed secret is honored only when `NODE_ENV` is exactly `development` or `test`, checked before any database access. Confirmed.
5. **Key rotation and undecryptable secrets.** `rotar-email-crypto-key.mjs` rotates `secreto_cifrado` and `secreto_pendiente_cifrado` with AAD `tfa:{usuario_id}` in the same transaction as SMTP. An undecryptable secret yields `SegundoPasoRechazadoError` (401), logs `TFA_SECRETO_INDESCIFRABLE | usuarioId=...` and returns the limiter reservation. Confirmed by the e2e.
6. **Admin reset rule.** All memberships (inactive, of suspended clients and soft-deleted) through an unfiltered query; a ROOT target is refused; every refusal is the same `MembresiaNoEncontradaError` (404) as an unknown id; refusals happen before any write. Confirmed.
7. **Frontend.** `use-login.ts` keeps only `desafio`/`ticket` in its state machine, never the password. Forced enrollment calls `login/continuar` only from `continuarTrasCodigos`, reachable after the "Los guardé" checkbox. `RUTAS_SIN_REFRESH` covers `auth/login`, `auth/2fa/verificar`, `auth/2fa/enrolamiento/*`, `auth/login/continuar` and `auth/login/seleccionar`; self-service `auth/2fa`, `auth/2fa/secreto/*`, `auth/2fa/codigos` and `auth/2fa/desactivar` keep refresh-on-401 (`client.test.ts > 401 en una ruta fuera del set (auth/2fa) sí refresca`). Confirmed.
8. **Cast evasion.** Not clean: 24 `as unknown as` casts survive in 5 backend spec files (W1).
9. **Known residuals.** See the warnings and suggestions below; all are accepted except the `.env.example` gap, which stays open as W2.

### Coherence (Design)

| Decision | Followed? | Notes |
|---|---|---|
| ADR-1 opaque challenge in master, ticket rotation, single use | Yes, one recorded deviation | `POST /auth/2fa/verificar` returns only `{ticket, dispositivoConfiable?}` and the client always calls `login/continuar`; the design table said "session or selector". This keeps `continuar`/`seleccionar` as the only issuers (apply-progress WU-5a2) and is stricter |
| ADR-2 native TOTP behind `ITotpService`, step CAS, pending promotion by one CAS | Yes | |
| ADR-3 master tables, `requiere_2fa` outside the upsert | Yes | M1 `20261008120000_verificacion_dos_pasos` with `rollback.sql` |
| ADR-4 recovery codes with argon2id | Yes | `obtenerCodigosDisponibles` was added to the port (recorded in WU-4a) |
| ADR-5 shared `EMAIL_CRYPTO_KEY` with AAD `tfa:{usuarioId}` and extended rotation | Yes | |
| ADR-6 persisted limiter with atomic reservation, `devolver`, hourly purge, IP from the BFF | Yes | |
| ADR-7 trusted device, fail-closed by order | Yes | residual: the device row is created after the ticket rotation (S2) |
| ADR-8 obligation and the unfiltered membership query | Yes | |
| ADR-9 policy controller and reset route | Yes | |
| ADR-10 operator script without `.ps1` | Yes | |
| ADR-11 frontend | Yes | BFF routes only where cookies are set; enrollment and self-service through the generic proxy |
| Seed with positive list (`development`, `test`) and `.env.example` | Partially | README documents `ROOT_ADMIN_TOTP_SECRET`; `backend/.env.example` could not be read or edited (W2) |

### Issues Found

**CRITICAL**:
- **C1 (test-evidence gap, not a behavioral defect)** `auth-2fa-totp` T4, scenario "Un secreto pendiente no se pide en el login": no test logs in a user whose `usuarios_tfa` row holds only a pending secret and asserts that no challenge is issued. The code is correct (`login.use-case.ts:169`, `if (estadoTfa?.secretoCifrado != null)`), but nothing pins it. Mutation on a scratch copy (worktree untouched): replacing the condition with `estadoTfa != null` (a user with only a pending secret, for example one who started enrollment and never confirmed, would get a `VERIFICAR` challenge with no usable secret and could not log in) leaves `login.use-case.spec.ts` green (41/41) and every spec under `src/auth` and `src/clientes/interface` green (97 files, 1134 tests). Under the skill rule (a scenario is compliant only with a passing covering test) the scenario is UNTESTED and blocks archive. Remediation: one unit test in `login.use-case.spec.ts` (state `{secretoCifrado: null, secretoPendienteCifrado: 'x', ...}` and a non-obligated user → `kind: 'tokens'`, `desafios.crear` not called), or one e2e step in `tfa-cuenta.e2e.spec.ts` (start enrollment, do not confirm, log in → tokens).

**WARNING**:
- **W1** 24 `as unknown as` casts were added to backend specs (backend total 160 on `main`, 184 on HEAD), in `confirmador-secreto-pendiente.spec.ts`, `continuar-login.use-cases.spec.ts`, `desafio-login.use-cases.spec.ts`, `verificador-codigo-tfa.spec.ts` and `verificador-codigo-tfa.integration.spec.ts` (commits `bd2fe962`, `9272e264`, `f6245164`, `f70ce7d3`). `AGENTS.md:33` forbids unchecked casts; `check-casts-en-specs.mjs` only counts `as never`/`as any`, so the ratchet stays at 617 while the same debt grows through a form it does not count. The apply-progress line "sin `as unknown as` nuevos" (WU-6a) is true only for WU-6a. Not a blocker for behavior; fix by completing the mocks with `unstubbed()` (`src/testing/mocks.ts`), and consider extending the ratchet regex.
- **W2** Task 9.7 is checked, but its text ("documentar el valor de desarrollo en `.env.example` y en el README") is only half done: the README has the `ROOT_ADMIN_TOTP_SECRET` row, `backend/.env.example` was never edited (permission denied for the agents and for this verification). The note sits under 9.8, not 9.7. A person has to add the commented line before archive or the task text must say so.

**SUGGESTION**:
- **S1** The forced-enrollment ticket lives 5 minutes from confirmation (`TICKET_DURACION_MS`). A user who takes longer on the "Los guardé" screen gets "La verificación venció" and must log in again, now with an active 2FA. Behavior is safe (no session without the step), but a longer ticket for the `ENROLAR` rotation would match the 15-minute enrollment window.
- **S2** Accepted residuals from apply-progress, all checked in code: (a) the trusted-device row is created after the ticket rotation, so a failing `crear` returns 500 with the code already spent and the user logs in again; (b) self-disable and 2FA reset revoke refresh tokens with log-and-swallow, so on that failure open sessions live until expiry (S3 "refresh token rejected" holds in the normal path; T8 and D6 do not require it); (c) rare races in enrollment confirmation (the challenge expires between confirm and rotation: 2FA active without the user seeing the codes; recoverable by regenerating with a TOTP); (d) the client-side 5/15-minute heuristics that tell an expired challenge from a wrong code, needed because the backend returns the same 401 on purpose (anti-oracle). None breaks a spec scenario.
- **S3** Stale comments: `tfa-login.controller.ts:4` ("Todavia no esta enganchado a `LoginUseCase` (WU-5c)") and `login.use-case.ts:166` ("hasta WU-7 ... solo ROOT obliga"). Both describe intermediate chain states.
- **S4** When task 13.7 declares the bullet, include the precisions in "Roadmap Decision Fidelity" (P2 no ROOT-to-ROOT button; P3 soft-deleted memberships count).
- **S5** The BFF login route is the only one that sends `x-soporte-ip-navegador`. Next.js routes are case-sensitive and Express routing is case-insensitive by default, so a request such as `POST /api/Auth/Login` would fall into the generic `[...path]` proxy and reach `LoginUseCase` from loopback without the header, under the `sin-ip` key. The proxy does not forward that header, so the IP cannot be spoofed; the effect is one extra bucket of 5 attempts per email and window, and the response tokens would come back in the JSON body instead of cookies (a pre-existing property of the proxy for any `auth/*` path). Not exercised at runtime; consider rejecting `auth/*` paths in the generic proxy.

**Open follow-ups (not blockers)**:
- Ayuda debt recorded in commits and PRs (writing suspended since 2026-09-07): challenge and enrollment at login, profile 2FA settings, client policy toggle, admin 2FA reset, trusted devices forgotten on password change. No existing article became false: `mi-cuenta-contrasena.md` still describes the password flows correctly (it does not mention devices or codes).
- Post-deploy: the IP check in `auth_intentos_fallidos` and the first ROOT enrollment (runbook and `notas-deploy.md`).
- Post-deploy 13.7: mark point 5 delivered and declare Cumplida with the precisions above.

### Verdict

FAIL

All gates are green (backend 7954 tests, frontend 2064 tests, lint, types, casts ratchet, roadmap check), 61/61 requirements are implemented, and every roadmap sub-bullet and precision matches the code with no undeclared deviation. The checks requested by the orchestrator hold in code, except the cast evasion (W1). The verdict is FAIL only because of C1: one scenario (T4 "Un secreto pendiente no se pide en el login") has no covering test, and a mutation that breaks it survives the whole auth suite. Behavior is correct today. Remediation is one test; after it, a re-verification of C1 is expected to give PASS WITH WARNINGS (W1 casts, W2 `.env.example`).
