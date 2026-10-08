# Exploracion: verificacion en dos pasos (2FA)

Cambio: `verificacion-dos-pasos`. Fecha: 2026-10-07. Decisiones de producto (confirmadas, no se reabren): `docs/roadmap-comercial.md`, seccion "Decisiones de producto de la segunda etapa", bullet "Segunda etapa, punto 5". Cada una de sus vinetas pasa a requerimiento con escenario en la spec. Al cerrar el punto hay que declararlas "Cumplida" o "Desviacion" (`scripts/check-roadmap-fresco.mjs`).

> Persistido por el orquestador: el ejecutor de `sdd-explore` no tiene herramienta de escritura. Contenido tal como lo devolvio la fase, con la numeracion de subsecciones corregida.

## 1. Estado actual (verificado)

### 1.1 Login

- `LoginUseCase` (`backend/src/auth/application/use-cases/login.use-case.ts:104-207`): email+password con argon2id, hash dummy para no filtrar existencia (111-114). Con >1 membresia y sin `clienteId` devuelve `{kind:'selection'}` SIN tokens (141-150). Con `clienteId` pasa por `resolverScope` y emite JWT + refresh.
- Controller `auth.controller.ts:139-157`: `POST /auth/login` sin throttle ni guard. La respuesta es `TokensResponseDto | SelectionResponseDto`.
- JWT HS256 15 min (`auth.module.ts:104-107`); `JwtAuthGuard` rechaza con 401 todo token sin `payload.v === VERSION_PAYLOAD_JWT` (`jwt-auth.guard.ts:74`). Nunca consulta DB.
- Refresh (`refresh-token.use-case.ts:75-162`): rotacion, SHA-256, la fila lleva `usuarioId` y `clienteId`; NO evalua credenciales. `SwitchTenantUseCase` tampoco. Por eso refresh y switch no re-piden 2FA: basta con no tocarlos.
- Revocacion de sesiones: `revokeAllByUsuarioId` en `cambiar-password`, `confirmar-reset-password.use-case.ts:85-94` y `resetear-password-usuario-tenant.use-case.ts:98-105` (los tres con log-and-swallow si falla).

### 1.2 BFF y frontend

- `frontend/src/app/api/auth/login/route.ts:42-60`: si la respuesta trae `needsClienteSelection` la reenvia sin cookies; si no, setea `at`/`rt` con `cookieAttrs` (`shared/auth/cookies.ts:46-57`: httpOnly, lax, `__Host-` en prod).
- `use-login.ts:86-128`: el front guarda `email/password` en memoria y, tras elegir cliente, re-postea `{email,password,clienteId}`. Hoy el selector re-envia la contrasena.
- `LoginForm.tsx` es presentacional puro; `CambiarPasswordDialog.tsx` (abierto desde `dashboard-header.tsx`) es el precedente para "ajustes de perfil".
- `middleware.ts:44` define `RUTAS_PUBLICAS`; ya hay rutas publicas de auth (`/olvide-password`, `/restablecer-password`).
- Proxy generico `[...path]/route.ts:51-61`: inyecta `Authorization` desde la cookie `at`.

### 1.3 Almacenamiento

- Master: `Usuario` (`schema.prisma:189-214`), `Membresia` N:N con rol por membresia (233-252), `Cliente` (64-146) con precedentes de columnas por cliente (`csatHabilitado`, `formularioPublicoHabilitado`).
- Cifrado: `AesGcmSecretCipher` (`shared/infrastructure/crypto/aes-gcm-secret-cipher.ts:30-104`), AES-256-GCM, prefijo `v1:`, clave `EMAIL_CRYPTO_KEY` leida en cada llamada, AAD lo pasa el caller (para SMTP es el id del cliente). Puerto `ISecretCipher` en `shared/domain/ports/i-secret-cipher.port.ts`; hoy solo lo usan `clientes` y `tenant-aware-email-sender`.
- Tokens opacos con SHA-256 + `usedAt`/`revokedAt`: `refresh_tokens`, `password_reset_tokens`, `encuesta_tokens`, `pedido_publico_tokens`. Es el molde para dispositivos confiables y codigos de recuperacion.
- Throttler: `@nestjs/throttler` 6.5 en memoria, un solo proceso. Solo en reset de password, formulario publico y CSAT, con guards propios que fijan el tracker (`recuperacion-password-throttler.guard.ts:31-44`: email del body, sin `x-forwarded-for`).
- Dependencias: no hay otplib/speakeasy/qrcode en backend. Frontend ya tiene `uqr` ^0.1.3 (`frontend/package.json:43`). `AGENTS.md:118`: toda dependencia nueva va al README y al `.env.example` en el mismo commit.

### 1.4 Administracion

- `UsuariosController` (`usuarios.controller.ts`) usa `JwtAuthGuard`+`TenantGuard` a nivel de clase y `AdminClienteGuard` por metodo (ROOT o rol ADMINISTRADOR del JWT, sin DB). `clienteId` sale siempre de `actor.cliente_id`. `ResetearPasswordUsuarioTenantUseCase` es el molde del reseteo de 2FA: busca la membresia activa en ese cliente y responde el MISMO error si no existe o es de otro tenant (anti-enumeracion).
- `ClientesController` es solo ROOT (`@UseGuards(JwtAuthGuard, GlobalAdminGuard)`, l.182; csat en 417-433). La politica "exigir 2FA" la maneja el ADMINISTRADOR de SU cliente, asi que necesita una ruta propia con `AdminClienteGuard` + `TenantGuard`.

## 2. Analisis por tema

### 2.1 Donde encaja el segundo paso

| Opcion | Descripcion | Pros | Contras | Esfuerzo |
|---|---|---|---|---|
| A. Ticket de desafio firmado (JWT corto, claim propio `typ`) | Tras validar la contrasena, el backend devuelve `{needs2fa, desafio}`; `POST /auth/2fa/verificar {desafio, codigo}` devuelve un ticket "verificado" que se manda en el paso del selector | Sin tabla nueva, sin estado | No se puede invalidar ni contar intentos por desafio; hay que asegurar que `JwtAuthGuard` nunca lo acepte como access (hoy lo rechazaria por falta de `v`, pero es un resguardo implicito) | Medio |
| B. Desafio opaco en master (SHA-256, expira 5 min, contador de intentos) | Mismo flujo, pero el desafio es una fila | Molde ya usado 4 veces; revocable, uso unico, contador de fallos persistente | Una tabla mas | Medio |
| C. Re-postear email+password+codigo | Sin desafio intermedio | Cero estado | El selector ya re-envia la contrasena: habria que re-enviar el codigo, y un codigo TOTP vale una sola vez (replay), asi que el selector romperia. Descartada | n/a |

Recomendacion: B (o A si se prefiere sin tabla). Orden: contrasena, despues 2FA o enrolamiento forzado, despues selector, despues tokens. El ticket verificado debe servir en el paso de seleccion SIN volver a pedir el codigo; lo mas limpio es un endpoint de seleccion que recibe `{ticket, clienteId}` en lugar de re-enviar la contrasena (cambia `use-login.ts`, `LoginUseCase` y el controller). Refresh y switch no cambian.

Enrolamiento forzado: el mismo desafio con `proposito=enrolar` solo permite iniciar y confirmar el enrolamiento; confirmar devuelve los 10 codigos una unica vez y marca el desafio como verificado.

### 2.2 TOTP

RFC 6238 son unas decenas de lineas con `crypto.createHmac('sha1')` (truncado dinamico, 6 digitos, paso 30 s, ventana +-1) mas base32 y el URI `otpauth://`. El apendice B del RFC trae vectores oficiales para test. Es consistente con el precedente del repo (el cifrado de secretos uso `crypto` nativo, sin librerias nuevas). Alternativa otplib: menos codigo propio, pero dependencia nueva de seguridad (README, `.env.example`, auditoria de version; no se verificaron versiones vigentes). Recomendado: nativo detras de un puerto (`ITotpService`). Antireplay: guardar `ultimo_paso` (contador de 30 s del ultimo codigo aceptado) y aceptar solo pasos estrictamente mayores, con `UPDATE ... WHERE ultimo_paso < $paso` como CAS atomico. Comparar con `timingSafeEqual`.

### 2.3 Almacenamiento (todo en master)

- `usuarios_tfa` (1:1 con usuario): `usuario_id` PK/FK, `secreto_cifrado` (cipher, AAD = id del usuario), `confirmado_at` (null = enrolamiento pendiente), `ultimo_paso` bigint.
- `tfa_codigos_recuperacion`: `usuario_id`, `codigo_hash` unico, `usado_at` (CAS `WHERE usado_at IS NULL`).
- `tfa_dispositivos_confiables`: `usuario_id`, `token_hash` unico, `expira_at` (+30 d), `revocado_at`.
- `clientes.requiere_2fa Boolean default false`.
- Tablas aparte, no columnas en `usuarios`: `UsuarioEntity` se persiste con upsert de todas las props, y el schema ya documenta el mismo riesgo y la misma solucion para `slug` ("se escriben SOLO por CAS, nunca por el upsert de `save()`", `schema.prisma:125-134`). Lo mismo para `requiere_2fa` en `Cliente`: ruta y use case propios, como `ConfigurarCsatCliente`.
- Regla de obligatoriedad en login: `obligado = usuario.isGlobalAdmin || alguna membresia activa de cliente activo con requiere_2fa`. `MembresiaResuelta` (`i-membresia.repository.ts:19-23`) ya sale de un JOIN con cliente; sumar `requiere2fa` no agrega queries. `findActivasByUsuario` ya se llama siempre en login (l.124).
- Codigos de recuperacion: SHA-256 alcanza si el codigo tiene entropia suficiente; con codigos cortos (~50 bits) y fuga de la base, un SHA-256 plano es atacable offline. A decidir en diseno: codigo mas largo, HMAC con clave, o argon2.

### 2.4 Reseteo por ADMINISTRADOR

Molde: `ResetearPasswordUsuarioTenantUseCase` (misma estructura, mismo error anti-enumeracion). Falta una consulta nueva para contar las membresias del usuario (el puerto solo ofrece `findActivasByUsuario`). ADMINISTRADOR (no ROOT): permitido solo si la unica membresia del usuario es la de `actor.cliente_id` y el objetivo no es `isGlobalAdmin`. ROOT: siempre. Debe borrar el secreto, los codigos y los dispositivos confiables, y revocar refresh tokens.

### 2.5 Limite de intentos

El throttler NO sirve tal cual: cuenta todas las requests, no solo las fallidas. Con "5 cada 15 min por usuario", un usuario legitimo que inicia sesion 6 veces en 15 minutos (varios dispositivos, el selector que hace dos POST, los e2e) quedaria bloqueado. Ademas el storage es en memoria y se pierde en cada deploy o reinicio de NSSM.

| Opcion | Pros | Contras | Esfuerzo |
|---|---|---|---|
| Guard de throttler con tracker = email (molde `RecuperacionPasswordThrottlerGuard`) | Cero tablas | Cuenta exitos; se reinicia con el proceso; no cubre la verificacion del codigo | Bajo |
| Puerto `ILimitadorIntentos` + tabla master `tfa_intentos` (clave, ventana, fallos), cuenta solo fallos, se limpia al exito | Cumple "5 fallos / 15 min", sobrevive reinicios, testeable | Tabla y logica nuevas | Medio |
| Mapa en memoria propio, solo fallos | Simple | Se pierde al reiniciar | Bajo |

Recomendado: el puerto con tabla master. Aplica a `POST /auth/login` (hoy sin limite; clave = email normalizado) y a `POST /auth/2fa/verificar` (clave = usuario del desafio). El bloqueo en login debe responder igual que credenciales invalidas, para no filtrar existencia.

### 2.6 Dispositivo confiable

Token opaco de 32 bytes; el backend guarda SHA-256 y lo devuelve crudo UNA vez al verificar con "recordar". El BFF lo guarda en una cookie propia httpOnly `td` (30 dias, mismo `cookieAttrs`, prefijo `__Host-` en prod) y la reenvia al backend en cada `POST /api/auth/login`. Si el token es valido para ese usuario, no hay desafio. Invalidacion: `UPDATE ... SET revocado_at` por `usuario_id` en cambiar password, confirmar reset, reset por admin y reset de 2FA. Hoy esos puntos tragan los errores de `revokeAllByUsuarioId`; para dispositivos confiables un fallo silencioso deja un bypass, asi que conviene decidir si ahi se propaga el error.

### 2.7 Radio de impacto en tests y operacion

- Backend: `LoginUseCase` suma dependencias (puertos de 2FA y limitador). Afecta `login.use-case.spec.ts`, `auth.controller.spec.ts` y el factory de `auth.module.ts:133-162`. El contrato de `/auth/login` es compatible hacia atras para usuarios sin 2FA, asi que los ~20 e2e que loguean usuarios normales no se rompen.
- El riesgo real es ROOT: `isGlobalAdmin: true` aparece en `auth.e2e.spec.ts` (15 veces) y `prisma-auth.integration.spec.ts`; cualquier spec o seed que loguee como ROOT por HTTP quedaria con desafio obligatorio (`demo-seed`, `root-bootstrap.seed.ts`).
- Frontend: `use-login.test.tsx`, `login/route.test.ts` y `login/page.test.tsx` deben ampliarse, no reescribirse.
- Rotacion de `EMAIL_CRYPTO_KEY`: `backend/scripts/rotar-email-crypto-key.mjs` esta cableado SOLO a `clientes.smtp_password_cifrada` (AAD = id del cliente). Si el secreto TOTP se cifra con la misma clave y nadie extiende el script, la primera rotacion deja todos los secretos ilegibles (GCM falla en `final()`) y los usuarios con 2FA no pueden loguear. Opciones: (a) extender el script, su `.ps1`, su spec de integracion y el runbook para cubrir `usuarios_tfa` con AAD = id del usuario; (b) clave propia `TFA_CRYPTO_KEY` con su propia rotacion. A elegir en diseno. Un descifrado fallido en login no debe devolver 500.

## 3. Areas afectadas

- `backend/prisma_master/schema.prisma` + migracion nueva: tablas y columna.
- `backend/src/auth/domain/ports/*` y entidades: `ITotpService`, repos de 2FA, `ILimitadorIntentos`; `MembresiaResuelta.requiere2fa`.
- `login.use-case.ts` (+ factory en `auth.module.ts`): desafio, dispositivo confiable, obligatoriedad.
- Use cases nuevos: iniciar/confirmar enrolamiento, verificar desafio, usar codigo de recuperacion, desactivar, regenerar codigos, resetear 2FA (ROOT/ADMIN), configurar politica del cliente.
- `auth.controller.ts` + DTOs + ruta de politica y reseteo.
- `cambiar-password`, `confirmar-reset-password`, `resetear-password-usuario-tenant`: invalidar dispositivos confiables.
- `backend/src/clientes/{entity,mapper,dto,repo}`: `requiere2fa` (patron csat).
- `backend/scripts/rotar-email-crypto-key.*` o `regenerar-entorno.mjs`, segun la clave elegida.
- `frontend/src/app/api/auth/login/route.ts` + rutas BFF nuevas + `shared/auth/cookies.ts` (cookie `td`).
- `frontend/src/features/auth/`: maquina de estados de `use-login.ts` (credenciales, 2FA o enrolamiento, selector), componentes de desafio y de enrolamiento con QR (`uqr`) y codigos, ajustes de perfil, toggle de politica y reseteo en la vista de administracion.
- `middleware.ts`, si hay rutas publicas nuevas.
- Ayuda (`backend/ayuda/*.md`): suspendida desde 2026-09-07; anotar la deuda en el commit y el PR.

## 4. Enfoque recomendado

TOTP nativo (puerto `ITotpService`) + desafio opaco en master + tablas separadas de `usuarios`/`clientes` para el estado de 2FA + limitador de fallos propio + dispositivo confiable como token opaco gestionado por el BFF. Reutiliza patrones ya probados del repo (tokens SHA-256 con CAS, cipher AES-GCM, ruta de admin por tenant) con la menor superficie nueva.

## 5. Tamano estimado y plan de PRs (<400 lineas cada uno, con tests)

| # | PR | Lineas aprox. |
|---|---|---|
| 1 | Migracion master + schema + puertos/entidades + `ITotpService` nativo con vectores RFC | ~350 |
| 2 | Enrolamiento (iniciar/confirmar, codigos de recuperacion) + endpoints | ~400 |
| 3 | Limitador de intentos + aplicarlo a `/auth/login` | ~300 |
| 4 | Desafio en `LoginUseCase` + verificar + codigo de recuperacion + seleccion con ticket | ~450 (partir en 4a y 4b) |
| 5 | Dispositivos confiables + invalidacion en cambio/reset de password | ~300 |
| 6 | Politica por cliente + regla "cualquier cliente" + ROOT obligatorio | ~300 |
| 7 | Reseteo por ROOT/ADMIN + recuperacion de ROOT + rotacion de clave | ~350 |
| 8 | BFF + frontend login (desafio, enrolamiento forzado con QR, codigos) | ~450 (partir en 8a y 8b) |
| 9 | Frontend perfil + toggle de politica + boton de reseteo | ~350 |

Total ~3.0-3.4k lineas, 9-11 PRs. La estimacion del roadmap (3-5 dias) es optimista.

## 6. Riesgos

- Bloqueo de ROOT sin celular, sin codigos y sin otro ROOT.
- Rotacion de `EMAIL_CRYPTO_KEY` silenciosamente destructiva para los secretos TOTP si no se resuelve en el mismo cambio.
- El throttler existente cuenta exitos y se reinicia con el proceso.
- Bloqueo por usuario habilita un bloqueo dirigido de 15 min a cualquier cuenta.
- La regla se evalua solo en login: las sesiones abiertas no se enteran de una politica nueva.
- Invalidacion de dispositivos confiables con log-and-swallow deja un bypass si el UPDATE falla.
- Robo de refresh token evita el 2FA por diseno (no se re-pide en refresh/switch); conviene declararlo en la spec.
- `seed:root`, e2e de ROOT y demo piden 2FA al ser obligatorio.

## 7. Preguntas de producto abiertas (resolverlas antes de la propuesta)

- P1. Desactivar el 2FA propio (si no esta obligado), regenerar los codigos y re-enrolar (cambio de celular).
- P2. Recuperacion de ROOT sin celular ni codigos (script de operador); si un ROOT puede resetear a otro ROOT; si un ADMINISTRADOR puede resetear a un ROOT con solo la membresia de su cliente.
- P3. "Pertenece unicamente a su cliente": si cuentan membresias inactivas o de clientes suspendidos.
- P4. Dispositivo confiable para ROOT; si se invalida tambien con el reset por mail y el reset por administrador.
- P5. Sesiones abiertas cuando un usuario pasa a estar obligado: se aceptan hasta que venzan o se revocan.
- P6. Bloqueo por usuario y el costo de un bloqueo dirigido; el backend ve la IP del BFF, no la del cliente.
- P7. En el enrolamiento forzado, si el login se completa antes o despues de confirmar que se guardaron los codigos.
- P8. Relajar el 2FA obligatorio de ROOT fuera de produccion (desarrollo, demo, e2e).
- P9. Aviso por mail al activar o resetear el 2FA.
