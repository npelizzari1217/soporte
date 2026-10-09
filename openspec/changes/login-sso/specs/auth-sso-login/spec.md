# Auth SSO Login — Specification

## Purpose

Definir el ingreso con una cuenta de Google o de Microsoft: el flujo OIDC, la validación del token de cada proveedor, cómo se resuelve al usuario existente, qué se rechaza, cómo se entrega el resultado al 2FA y al selector de cliente existentes, y el mensaje de falla único.

> **Decisión de producto citada.** `docs/roadmap-comercial.md`, sección "Decisiones de producto de la segunda etapa", viñeta "Segunda etapa, punto 7 — login con Google o Microsoft (SSO)" (ciclo en #507), incluida su sub-viñeta "Precisiones del 2026-10-09, al explorar". Esta spec cubre D1, D2, D3, D5, D6, D8, D10, P2 y la defensa de seguridad del flujo. Complementan: `auth-sso-vinculo` (D7, P1) y `auth-sso-configuracion` (D4, D9). Trazabilidad consolidada al final.

## Definiciones

- **Proveedor**: `GOOGLE` o `MICROSOFT`.
- **Email verificado**: el que el proveedor garantiza. Google: claim `email_verified` igual a `true`. Microsoft: claim `xms_edov` igual a `true`.
- **Sujeto del proveedor**: identificador inmutable de la cuenta. Google: `sub`. Microsoft: `<tid>:<oid>`.
- **Usuario existente**: fila de `usuarios` creada por un administrador.
- **Falla genérica**: el resultado único que ve el usuario cuando el SSO no lo deja entrar, sea cual sea el motivo.
- **Segundo paso / ticket**: los del spec `auth-2fa-login` (desafío de verificación, desafío de enrolamiento, ticket de selección).

## Requirements

### Requirement: SL1 Solo entran usuarios existentes; no hay alta automática

El sistema DEBE permitir el ingreso por SSO únicamente a un usuario existente. Si el email verificado no corresponde a ningún usuario y el sujeto no tiene vínculo, el ingreso DEBE rechazarse con la falla genérica. El sistema NO DEBE crear ningún usuario, membresía ni vínculo como resultado de un ingreso por SSO rechazado.

#### Scenario: Email de un usuario existente

- GIVEN un usuario existente con membresía activa y un email verificado por el proveedor que coincide con el suyo
- WHEN completa el ingreso por SSO
- THEN el flujo continúa hacia el segundo paso o el selector

#### Scenario: Email que no está en el sistema

- GIVEN un email verificado por el proveedor que no pertenece a ningún usuario
- WHEN completa el ingreso por SSO
- THEN recibe la falla genérica y la cantidad de filas de `usuarios`, de membresías y de vínculos no cambia

### Requirement: SL2 Orden de resolución del usuario

Tras validar el token, el sistema DEBE resolver al usuario así: primero por el vínculo del par (proveedor, sujeto); si no existe, por el email verificado, comparado sin distinguir mayúsculas. Si el email coincide con más de un usuario (variantes de mayúsculas), el ingreso DEBE rechazarse como ambiguo con la falla genérica y DEBE registrarse el motivo en los logs. Si existe vínculo, el email del token NO DEBE usarse para identificar. Un token sin email NO DEBE resolver por email.

#### Scenario: Resolución por vínculo

- GIVEN un vínculo (proveedor, sujeto) de un usuario
- WHEN llega un token válido con ese sujeto
- THEN se resuelve a ese usuario aunque el email del token difiera del suyo

#### Scenario: Email con otras mayúsculas

- GIVEN un usuario registrado como `Juan@x.com` y un token con `juan@x.com` verificado, sin vínculo previo
- WHEN completa el ingreso
- THEN se resuelve a ese usuario

#### Scenario: Email ambiguo

- GIVEN dos usuarios cuyos emails difieren solo en mayúsculas
- WHEN un token verificado coincide con ambos
- THEN se rechaza con la falla genérica, no se crea vínculo y el log indica ambigüedad

#### Scenario: Token sin email y sin vínculo

- GIVEN un token válido sin claim `email` y un sujeto sin vínculo
- WHEN completa el ingreso
- THEN se rechaza con la falla genérica

### Requirement: SL3 Validación del token de Google

Para Google el sistema DEBE verificar la firma contra las claves del proveedor, `iss` igual a `https://accounts.google.com` o `accounts.google.com`, `aud` igual al client id configurado, vigencia (`exp`), `nonce` igual al del flujo y `email_verified` estrictamente `true`. NO DEBE filtrar por dominio del email (`hd`).

#### Scenario: Token válido

- GIVEN un id_token firmado, con `iss`, `aud` y `nonce` correctos y `email_verified` igual a `true`
- WHEN se valida
- THEN se acepta, con o sin `hd`

#### Scenario: Email sin verificar

- GIVEN un id_token con `email_verified` igual a `false`, ausente o no booleano
- WHEN se valida
- THEN se rechaza con la falla genérica

#### Scenario: Firma, audiencia, emisor, vigencia o nonce incorrectos

- GIVEN un id_token con firma inválida, o `aud` ajeno, o `iss` distinto, o vencido, o `nonce` distinto
- WHEN se valida
- THEN cada caso se rechaza con la falla genérica

### Requirement: SL4 Validación del token de Microsoft

Para Microsoft el sistema DEBE usar la autoridad `common`. DEBE verificar la firma y, recién con la firma verificada, construir el emisor esperado como `https://login.microsoftonline.com/<tid>/v2.0` con el `tid` del propio token y exigir que `iss` sea igual. DEBE exigir `aud` igual al client id, `nonce` del flujo, vigencia, presencia de `email` y `xms_edov` estrictamente `true`. NO DEBE usar nunca `preferred_username` ni `upn` para identificar ni para buscar al usuario.

#### Scenario: Token válido de organización

- GIVEN un id_token firmado cuyo `iss` coincide con su `tid`, con `aud` y `nonce` correctos, `email` presente y `xms_edov` igual a `true`
- WHEN se valida
- THEN se acepta y el sujeto es `<tid>:<oid>`

#### Scenario: Token de cuenta personal

- GIVEN un id_token válido con el `tid` de las cuentas personales de Microsoft y `xms_edov` igual a `true`
- WHEN se valida
- THEN se acepta con el mismo criterio

#### Scenario: Emisor que no coincide con el tid

- GIVEN un id_token con firma válida cuyo `iss` no es `https://login.microsoftonline.com/<tid>/v2.0` para su propio `tid`
- WHEN se valida
- THEN se rechaza con la falla genérica

#### Scenario: xms_edov ausente, falso o no booleano

- GIVEN un id_token con `xms_edov` ausente, `false`, o con un valor que no es el booleano `true` (por ejemplo la cadena `"true"`)
- WHEN se valida
- THEN se rechaza con la falla genérica

#### Scenario: preferred_username y upn no sirven

- GIVEN un id_token sin `email` pero con `preferred_username` o `upn` que coinciden con un usuario existente
- WHEN se valida
- THEN se rechaza y no se busca al usuario por esos claims

#### Scenario: Firma, audiencia, vigencia o nonce incorrectos

- GIVEN un id_token con firma inválida, o `aud` ajeno, o vencido, o `nonce` distinto
- WHEN se valida
- THEN cada caso se rechaza con la falla genérica

### Requirement: SL5 Cualquier cuenta del proveedor, solo con email verificado (cierra nOAuth)

El sistema DEBE aceptar cualquier cuenta de Google o de Microsoft, personal o de organización, siempre que el proveedor garantice el email verificado según SL3 y SL4. Un email sin verificar NO DEBE identificar a nadie, ni para resolver al usuario ni para vincular. En Microsoft, un email escrito a mano en otra organización de Entra (sin `xms_edov` verdadero) DEBE rechazarse.

#### Scenario: Cuenta de Google personal

- GIVEN una cuenta de Google personal (sin `hd`) con email verificado de un usuario existente
- WHEN completa el ingreso
- THEN se acepta

#### Scenario: Cuenta de Google de una organización

- GIVEN una cuenta de Google Workspace (con `hd`) con email verificado de un usuario existente
- WHEN completa el ingreso
- THEN se acepta

#### Scenario: Ataque nOAuth

- GIVEN un usuario existente `ana@colegio.edu` y un token de Microsoft de otra organización con `email` igual a `ana@colegio.edu` pero sin `xms_edov` verdadero
- WHEN completa el ingreso
- THEN se rechaza con la falla genérica y no se crea vínculo ni ticket

### Requirement: SL6 ROOT no entra por SSO

El sistema DEBE rechazar con la falla genérica todo ingreso por SSO cuyo usuario resuelto sea ROOT, en CADA ingreso, antes de crear vínculo, desafío o ticket alguno. Un usuario promovido a ROOT después de haberse vinculado DEBE rechazarse igual.

#### Scenario: ROOT por email

- GIVEN un ROOT existente y un token verificado con su email
- WHEN completa el ingreso
- THEN se rechaza y no existe vínculo, desafío ni ticket nuevo para ese usuario

#### Scenario: Usuario vinculado que luego fue promovido a ROOT

- GIVEN un usuario con vínculo que pasó a ser ROOT
- WHEN completa un ingreso por SSO
- THEN se rechaza y no se crea desafío ni ticket

#### Scenario: ROOT sigue entrando con contraseña

- GIVEN un ROOT
- WHEN ingresa con contraseña y app autenticadora
- THEN el ingreso funciona como antes

### Requirement: SL7 Usuario inactivo, eliminado o sin membresías activas se rechaza

El sistema DEBE rechazar con la falla genérica al usuario inactivo, al eliminado y al que no tiene ninguna membresía activa. La baja de un usuario sigue siendo desactivar su membresía: un usuario vinculado con todas sus membresías desactivadas NO DEBE poder entrar por SSO. Estos rechazos DEBEN ocurrir antes de crear desafío o ticket.

#### Scenario: Usuario inactivo

- GIVEN un usuario con `activo` falso y vínculo existente
- WHEN completa el ingreso
- THEN se rechaza y no se crea desafío ni ticket

#### Scenario: Usuario eliminado

- GIVEN un usuario eliminado (borrado lógico)
- WHEN completa el ingreso
- THEN se rechaza

#### Scenario: Sin membresías activas

- GIVEN un usuario vinculado cuya única membresía fue desactivada
- WHEN completa el ingreso
- THEN se rechaza con la falla genérica

### Requirement: SL8 Convive con la contraseña

El SSO NO DEBE modificar el ingreso con contraseña ni el olvido de contraseña. Un usuario con vínculo SSO DEBE poder seguir ingresando con su contraseña. El sistema NO DEBE ofrecer ninguna política "solo SSO", global ni por cliente.

#### Scenario: Usuario vinculado entra con contraseña

- GIVEN un usuario con vínculo SSO y contraseña vigente
- WHEN ingresa con email y contraseña
- THEN el login procede como hoy

#### Scenario: Olvido de contraseña

- GIVEN un usuario con vínculo SSO
- WHEN usa el olvido de contraseña
- THEN el flujo y sus efectos son los de hoy

### Requirement: SL9 Defensa contra login CSRF y reutilización

Al iniciar, el sistema DEBE generar `state` aleatorio de un solo uso, `nonce` y PKCE con método `S256`, y atar el flujo al navegador mediante una cookie de enlace. El `state` DEBE guardarse solo como derivado no reversible, vencer a los 10 minutos y consumirse con una operación atómica de un solo uso antes de cualquier llamada saliente al proveedor. El callback DEBE exigir: `state` vigente y no usado, cookie de enlace que coincida con el flujo, y que el proveedor del flujo sea el de la ruta. El flujo DEBE usar `response_mode=query` y NO DEBE usar `form_post`. Cualquier falla DEBE rechazarse con la falla genérica.

#### Scenario: Iniciar arma una solicitud correcta

- GIVEN un proveedor configurado
- WHEN se inicia el flujo
- THEN la URL de autorización lleva `state`, `nonce`, `code_challenge` con `code_challenge_method=S256` y `response_mode` igual a `query`, y la base solo guarda el derivado del `state`

#### Scenario: Reutilización del state

- GIVEN un `state` ya consumido por un callback
- WHEN llega otro callback con el mismo `state`
- THEN se rechaza y no hay llamada al proveedor

#### Scenario: Callbacks concurrentes con el mismo state

- GIVEN un `state` vigente
- WHEN llegan dos callbacks simultáneos con él
- THEN exactamente uno lo consume y el otro se rechaza

#### Scenario: Sin cookie de enlace o con otra

- GIVEN un `state` vigente iniciado en el navegador A
- WHEN el callback llega sin la cookie de enlace, o con la de otro flujo
- THEN se rechaza y no se crea vínculo, desafío ni ticket

#### Scenario: State vencido o inventado

- GIVEN un `state` vencido (más de 10 minutos) o desconocido
- WHEN llega el callback
- THEN se rechaza sin llamar al proveedor

#### Scenario: Proveedor cruzado

- GIVEN un flujo iniciado con Google
- WHEN el callback llega por la ruta de Microsoft con ese `state`
- THEN se rechaza

### Requirement: SL10 La redirección posterior pasa por la lista permitida

La ruta de destino posterior al ingreso (`siguiente`) DEBE pasar por la lista permitida existente al iniciar y de nuevo al navegar. Un destino fuera de la lista DEBE reemplazarse por el destino por defecto. El sistema NO DEBE construir la URL de autorización ni el `redirect_uri` a partir de datos del navegador.

#### Scenario: Destino permitido

- GIVEN `siguiente` con un destino de la lista permitida
- WHEN se completa el ingreso
- THEN se navega a ese destino

#### Scenario: Destino externo o no permitido

- GIVEN `siguiente` apuntando a un sitio externo o a una ruta no permitida
- WHEN se completa el ingreso
- THEN se navega al destino por defecto

### Requirement: SL11 El 2FA propio se pide después del SSO, con las reglas de hoy

Una vez resuelto un usuario aceptable, el callback DEBE terminar en el segundo paso o en el ticket de selección existentes, y NUNCA DEBE emitir tokens de sesión por sí mismo. La obligación de 2FA DEBE ser exactamente la de hoy (ROOT siempre; cualquier usuario con un cliente que lo exige; quien lo activó voluntariamente), evaluada por la misma regla que usa el login con contraseña. Entrar por SSO NO DEBE contar como segundo paso. Un dispositivo de confianza vigente del usuario DEBE omitir el desafío y renovarse 30 días, con las reglas de `auth-2fa-dispositivo-confiable`.

#### Scenario: Usuario obligado con 2FA activo

- GIVEN un usuario con 2FA activo, sin dispositivo de confianza
- WHEN completa el SSO
- THEN el resultado es un desafío de verificación y ningún token

#### Scenario: Usuario obligado sin 2FA

- GIVEN un usuario con un cliente que exige 2FA y sin 2FA activo
- WHEN completa el SSO
- THEN el resultado es un desafío de enrolamiento y ningún token

#### Scenario: Dispositivo de confianza vigente

- GIVEN un usuario con 2FA y un dispositivo de confianza vigente enviado por el navegador
- WHEN completa el SSO
- THEN no se pide código, el resultado es el ticket de selección y el dispositivo se renueva 30 días

#### Scenario: Usuario sin 2FA y no obligado

- GIVEN un usuario no obligado y sin 2FA activo
- WHEN completa el SSO
- THEN el resultado es el ticket de selección

#### Scenario: Nunca se emiten tokens en el callback

- GIVEN cualquier ingreso por SSO aceptado
- WHEN responde el callback
- THEN la respuesta no contiene token de acceso ni de refresco

### Requirement: SL12 El selector de cliente no cambia

Después del SSO y del 2FA, el usuario con varias membresías DEBE elegir cliente con el selector y el ticket de selección existentes; con una sola membresía DEBE entrar a ese cliente. El SSO NO DEBE introducir un camino de selección propio.

#### Scenario: Varias membresías

- GIVEN un usuario con dos membresías activas que completó SSO y 2FA
- WHEN continúa con su ticket
- THEN se le presenta el selector y al elegir recibe la sesión

#### Scenario: Una membresía

- GIVEN un usuario con una membresía activa que completó SSO (y 2FA si le corresponde)
- WHEN continúa con su ticket
- THEN recibe la sesión de ese cliente

### Requirement: SL13 Mensaje de falla único; el motivo real solo en logs

Cuando el SSO no deja entrar, por cualquier motivo, el usuario DEBE ver un único mensaje genérico, idéntico para: email inexistente o sin verificar, otra cuenta con el mismo email, ROOT, usuario inactivo o eliminado, sin membresías, state o enlace inválidos, token inválido, ambigüedad y bloqueo por intentos. El motivo real DEBE quedar solo en los logs del servidor y NO DEBE aparecer en la respuesta, en la URL de retorno ni en cookies. Si el usuario cancela en el proveedor, el sistema DEBE volver al login sin mensaje de error.

#### Scenario: Motivos distintos, misma respuesta

- GIVEN rechazos por email inexistente, vínculo de otra cuenta, ROOT, usuario inactivo y sin membresías
- WHEN se comparan las respuestas que recibe el navegador
- THEN son idénticas y la pantalla de login muestra el mismo mensaje

#### Scenario: El motivo queda en el log

- GIVEN un rechazo por ROOT
- WHEN se inspeccionan la respuesta y los logs
- THEN el log nombra el motivo y la respuesta no lo revela

#### Scenario: Cancelación en el proveedor

- GIVEN un usuario que cancela la autorización (`error=access_denied`)
- WHEN el proveedor vuelve al callback
- THEN se lo lleva al login sin mensaje de error

### Requirement: SL14 Entrega al navegador sin tokens ni datos sensibles

El BFF DEBE entregar el resultado del callback al navegador sin exponer tokens de sesión: la cookie de enlace del flujo DEBE ser httpOnly, de vida corta y borrarse al volver; el resultado (clase de paso y su identificador opaco, nunca un JWT) DEBE viajar en una cookie httpOnly que se lee y se borra una sola vez; las redirecciones DEBEN llevar `Cache-Control: no-store`. La pantalla de login DEBE continuar el flujo existente (desafío, enrolamiento o ticket) a partir de ese resultado, de modo que el control de inactividad quede consistente. El BFF NO DEBE aceptar del navegador el dispositivo de confianza en el cuerpo ni en la URL, solo desde su cookie.

#### Scenario: Cookie de resultado de un solo uso

- GIVEN un callback aceptado que dejó la cookie de resultado
- WHEN la pantalla de login la consume por primera vez y luego una segunda
- THEN la primera devuelve el resultado y borra la cookie; la segunda no devuelve nada

#### Scenario: Atributos de las cookies

- GIVEN el flujo iniciado y entregado
- WHEN se inspeccionan las cookies del flujo
- THEN son httpOnly, de vida corta, y no contienen token de sesión

#### Scenario: Dispositivo de confianza solo por cookie

- GIVEN una petición al callback con `dispositivoConfiable` en la URL
- WHEN el BFF llama al backend
- THEN usa solo el valor de la cookie de dispositivo

### Requirement: SL15 Lo que queda fuera de esta entrega no existe

El sistema NO DEBE incluir: (a) ningún camino de alta automática de usuarios, membresías o clientes desde un ingreso por SSO; (b) ninguna política o columna "solo SSO", global ni por cliente; (c) ninguna tabla de auditoría de logins. El registro de rechazos DEBE ser únicamente de logs del servidor.

#### Scenario: Sin alta automática

- GIVEN cualquier ingreso por SSO, aceptado o rechazado
- WHEN se comparan las filas de `usuarios` y de membresías antes y después
- THEN no hay filas nuevas creadas por el flujo

#### Scenario: Sin política solo-SSO

- GIVEN el esquema y la configuración de clientes
- WHEN se inspeccionan
- THEN no existe columna, ajuste ni endpoint que deshabilite el ingreso con contraseña por SSO

#### Scenario: Sin auditoría de logins

- GIVEN la migración de este cambio
- WHEN se listan las tablas que crea
- THEN solo crea la de vínculos y la de estados del flujo, y ninguna registra logins

## Trazabilidad (todas las specs del cambio)

| # | Viñeta de la decisión (resumen) | Requerimiento(s) |
|---|---|---|
| D1 | Solo usuarios existentes, reconocidos por email verificado; sin alta automática | `auth-sso-login`: SL1, SL2, SL15 |
| D2 | Convive con la contraseña; olvido igual; sin "solo SSO"; baja = desactivar membresía | `auth-sso-login`: SL7, SL8, SL15 |
| D3 | 2FA propio con reglas de hoy; dispositivo de 30 días; SSO no es segundo paso | `auth-sso-login`: SL11; `auth-2fa-login`: L1, L7; `auth-2fa-dispositivo-confiable`: D3 |
| D4 | Una app por proveedor, configurada en el servidor; nada por cliente | `auth-sso-configuracion`: SC1, SC2 |
| D5 | Cualquier cuenta, solo con email verificado por el proveedor; cierra nOAuth | `auth-sso-login`: SL3, SL4, SL5 |
| D6 | ROOT no entra por SSO | `auth-sso-login`: SL6 |
| D7 | Vínculo por identificador inmutable; otra cuenta con el mismo email no entra; reseteo por administrador | `auth-sso-vinculo`: SV1 a SV8 |
| D8 | El selector de cliente no cambia | `auth-sso-login`: SL12; `auth-2fa-login`: L7 |
| D9 | Botones solo en la pantalla de login; sin vista ni desvinculación propia | `auth-sso-configuracion`: SC4, SC5 |
| D10 | Fuera: auditoría de logins, alta automática, "solo SSO" | `auth-sso-login`: SL15 |
| P1 | Un solo botón que borra los vínculos de todos los proveedores y cierra sesiones | `auth-sso-vinculo`: SV7, SV8 |
| P2 | Un único mensaje genérico; motivo real solo en logs | `auth-sso-login`: SL13 |
| S1 | Seguridad: login CSRF (state, enlace, PKCE, nonce, query) y redirección permitida | `auth-sso-login`: SL9, SL10, SL14 |
| S2 | Límite de intentos con clave `sso:` | `auth-limite-intentos`: I9 |
