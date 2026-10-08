# Auth 2FA TOTP — Specification

## Purpose

Definir el segundo factor TOTP por usuario: parámetros del código, secreto, anti-reutilización, enrolamiento, códigos de recuperación y autogestión (activar, desactivar, regenerar códigos, cambiar de celular). Esta spec también lleva la trazabilidad de TODAS las specs del cambio.

> **Decisión de producto citada.** `docs/roadmap-comercial.md`, "Decisiones de producto de la segunda etapa", viñeta "Segunda etapa, punto 5 — verificación en dos pasos (2FA)", incluida la sublista "Precisiones del 2026-10-07, al explorar". Las sub-viñetas se numeran M1-M10 (viñetas principales, en orden) y P1-P9 (precisiones, en orden) en la tabla de trazabilidad de abajo.

## Definiciones

- **Código válido**: un código TOTP vigente del usuario, o un código de recuperación no usado del usuario.
- **Obligado**: usuario para quien el 2FA es obligatorio (ver `auth-2fa-login`, L3).
- **2FA activo**: el usuario tiene un secreto TOTP confirmado.

## Requirements

### Requirement: T1 Parámetros del código TOTP

El código DEBE ser TOTP según RFC 6238: 6 dígitos, paso de 30 segundos, HMAC-SHA1. El sistema DEBE aceptar el paso actual y un paso hacia atrás o hacia adelante (±1 paso) y NO DEBE aceptar ningún otro.

#### Scenario: Vector oficial del RFC

- GIVEN el secreto y el instante de un vector del apéndice B del RFC 6238
- WHEN se verifica el código esperado del vector (truncado a 6 dígitos)
- THEN el código es aceptado

#### Scenario: Tolerancia de un paso

- GIVEN un secreto y un instante T
- WHEN se verifica el código del paso anterior a T, y luego el del paso siguiente a T
- THEN ambos son aceptados

#### Scenario: Fuera de tolerancia o mal formado

- GIVEN un secreto y un instante T
- WHEN se verifica el código de dos pasos antes de T, uno de 5 dígitos y uno no numérico
- THEN los tres son rechazados

### Requirement: T2 Un código se acepta como máximo una vez

El sistema DEBE rechazar la reutilización de un código TOTP: aceptar un código DEBE registrar su paso, y todo código de un paso menor o igual al último aceptado DEBE ser rechazado. El registro DEBE ser atómico bajo concurrencia.

#### Scenario: Replay del mismo código

- GIVEN un código aceptado hace 5 segundos
- WHEN se envía el mismo código otra vez dentro de su ventana
- THEN es rechazado

#### Scenario: Dos envíos simultáneos del mismo código

- GIVEN un código válido aún no usado
- WHEN llegan dos verificaciones concurrentes con ese código
- THEN exactamente una es aceptada

### Requirement: T3 El secreto se guarda cifrado y no se vuelve a exponer

El secreto TOTP DEBE generarse con aleatoriedad criptográfica y persistirse cifrado, nunca en texto plano. El sistema DEBE mostrarlo (URI `otpauth://` y clave manual) solo durante el enrolamiento pendiente. NO DEBE aparecer en logs, en errores, ni en ninguna respuesta posterior a la confirmación.

#### Scenario: La base no contiene el plaintext

- GIVEN un enrolamiento iniciado
- WHEN se inspecciona la fila persistida
- THEN el secreto está cifrado y no coincide con el entregado al usuario

#### Scenario: Ninguna respuesta posterior lo devuelve

- GIVEN un enrolamiento confirmado
- WHEN el usuario consulta su estado de 2FA
- THEN la respuesta indica si está activo y no contiene el secreto ni su URI

### Requirement: T4 Enrolamiento con confirmación por código

Iniciar el enrolamiento DEBE crear un secreto pendiente que NO activa el 2FA. Confirmar DEBE exigir un código TOTP válido de ese secreto; solo entonces el 2FA queda activo y se entregan los 10 códigos de recuperación. Un nuevo inicio DEBE reemplazar el secreto pendiente anterior.

#### Scenario: Confirmación correcta

- GIVEN un enrolamiento pendiente
- WHEN el usuario confirma con el código vigente de su app
- THEN el 2FA queda activo y la respuesta trae los 10 códigos de recuperación

#### Scenario: Confirmación con código incorrecto

- GIVEN un enrolamiento pendiente
- WHEN el usuario confirma con un código erróneo
- THEN se rechaza, el 2FA sigue inactivo y no se entregan códigos

#### Scenario: Un secreto pendiente no se pide en el login

- GIVEN un usuario con enrolamiento pendiente y sin 2FA activo
- WHEN hace login y no está obligado
- THEN no se le pide código

#### Scenario: Reiniciar reemplaza el pendiente

- GIVEN un enrolamiento pendiente con secreto S1
- WHEN el usuario inicia otro enrolamiento y recibe S2
- THEN confirmar con un código de S1 es rechazado y con uno de S2 es aceptado

### Requirement: T5 Diez códigos de recuperación de un solo uso

Al activar, el sistema DEBE generar exactamente 10 códigos de recuperación, mostrarlos UNA sola vez y persistir solo un derivado no reversible. Cada código DEBE aceptarse como máximo una vez, también bajo concurrencia, y reemplaza al código TOTP en el paso de verificación.

#### Scenario: Diez códigos mostrados una vez

- GIVEN una confirmación de enrolamiento exitosa
- WHEN se entregan los códigos
- THEN son 10, distintos entre sí, y ninguna consulta posterior puede devolverlos

#### Scenario: Un código usado no vuelve a servir

- GIVEN un código de recuperación ya usado en un login
- WHEN se intenta usar otra vez
- THEN es rechazado

#### Scenario: Uso concurrente

- GIVEN un código de recuperación sin usar
- WHEN dos verificaciones concurrentes lo envían
- THEN exactamente una es aceptada

#### Scenario: La base no contiene los códigos

- GIVEN códigos entregados
- WHEN se inspeccionan las filas
- THEN no hay ningún código en texto plano

### Requirement: T6 El 2FA es por usuario

El estado de 2FA (secreto, códigos, dispositivos) DEBE pertenecer al usuario global, no a una membresía ni a un cliente. Un usuario con membresías en varios clientes DEBE tener un único secreto.

#### Scenario: Un usuario en dos clientes

- GIVEN un usuario con membresías en los clientes A y B
- WHEN activa el 2FA estando en A
- THEN el mismo secreto rige al entrar a B y no existe una segunda configuración

### Requirement: T7 Cualquier usuario puede activar el 2FA por su cuenta

Todo usuario autenticado DEBE poder activar su 2FA aunque no esté obligado.

#### Scenario: Activación voluntaria

- GIVEN un usuario no obligado, sin 2FA
- WHEN completa el enrolamiento
- THEN su 2FA queda activo y el próximo login le pide código

### Requirement: T8 Desactivar solo si no está obligado, con código válido

El usuario DEBE poder desactivar su 2FA solo si no está obligado y presentando un código válido. Desactivar DEBE eliminar el secreto y los códigos de recuperación e invalidar sus dispositivos confiables.

#### Scenario: No obligado desactiva

- GIVEN un usuario con 2FA activo y no obligado
- WHEN desactiva con un código válido
- THEN el 2FA queda inactivo, sin secreto, sin códigos y sin dispositivos confiables

#### Scenario: Obligado no puede desactivar

- GIVEN un ROOT, o un usuario con membresía activa en un cliente que exige 2FA
- WHEN intenta desactivar con un código válido
- THEN se rechaza y el 2FA sigue activo

#### Scenario: Sin código válido

- GIVEN un usuario no obligado con 2FA activo
- WHEN intenta desactivar sin código o con uno incorrecto
- THEN se rechaza y el 2FA sigue activo

### Requirement: T9 Regenerar los códigos invalida el juego anterior

Cualquier usuario con 2FA activo DEBE poder regenerar sus códigos de recuperación presentando un código válido. El juego nuevo son 10 códigos mostrados una vez y el juego anterior DEBE quedar inválido por completo.

#### Scenario: Regeneración correcta

- GIVEN un usuario con 2FA y 3 códigos ya usados
- WHEN regenera con un código válido
- THEN recibe 10 códigos nuevos y ningún código del juego anterior es aceptado

#### Scenario: Regeneración sin código válido

- GIVEN un usuario con 2FA activo
- WHEN pide regenerar con un código incorrecto
- THEN se rechaza y el juego vigente no cambia

### Requirement: T10 Cambiar de celular

Cualquier usuario con 2FA activo DEBE poder cambiar de celular: presenta un código válido, inicia un enrolamiento nuevo y lo confirma con un código del secreto nuevo. Hasta la confirmación rige el secreto anterior; después, solo el nuevo. Cambiar de celular NO regenera los códigos de recuperación.

#### Scenario: Cambio correcto

- GIVEN un usuario con 2FA activo con secreto S1
- WHEN presenta un código válido, inicia el cambio y confirma con un código de S2
- THEN los códigos de S1 dejan de ser aceptados y los de S2 sí

#### Scenario: Cambio abandonado

- GIVEN un cambio iniciado y no confirmado
- WHEN el usuario hace login
- THEN se le pide el código de S1 y los de S2 son rechazados

#### Scenario: Sin código válido

- GIVEN un usuario con 2FA activo
- WHEN intenta iniciar el cambio sin código válido
- THEN se rechaza y no se crea secreto pendiente

### Requirement: T11 No hay otros canales ni avisos por mail

El segundo factor NO DEBE entregarse por mail ni por SMS, no DEBE existir WebAuthn/passkeys ni registro de auditoría de logins, y el sistema NO DEBE enviar mail al activar, desactivar o resetear el 2FA. (Fuera de alcance por decisión de producto: el correo sale por el SMTP de cada cliente y ROOT o un cliente sin correo no lo recibirían; el resto queda en el roadmap.)

#### Scenario: Activar y resetear no envían mail

- GIVEN un usuario con SMTP de cliente configurado
- WHEN activa su 2FA y luego un administrador se lo resetea
- THEN no se envía ningún mail

### Requirement: T12 Un secreto indescifrable nunca produce un 500

Si el secreto no puede descifrarse al verificar un código, el sistema DEBE responder con un rechazo controlado (no un error 500), no iniciar sesión, y registrar el fallo sin incluir secreto ni código.

#### Scenario: Descifrado fallido en la verificación

- GIVEN un usuario cuyo secreto cifrado no descifra con la clave vigente
- WHEN envía un código en el paso de verificación
- THEN la respuesta es un rechazo 4xx, no se emite sesión y el log no contiene el código ni material de clave

## Trazabilidad (todas las specs del cambio)

M = viñetas principales; P = "Precisiones del 2026-10-07, al explorar", ambas en el orden de la decisión.

| # | Sub-viñeta de la decisión (resumen) | Requerimiento(s) |
|---|---|---|
| M1 | App autenticadora TOTP; 10 códigos de un solo uso mostrados una vez; sin código por mail | `auth-2fa-totp`: T1, T2, T4, T5, T11 |
| M2 | 2FA por usuario, no por cliente | `auth-2fa-totp`: T6 |
| M3 | Activación propia; ADMINISTRADOR lo exige para su cliente; cualquier cliente que lo exija; configuración forzada tras la contraseña | `auth-2fa-totp`: T7; `auth-2fa-politica-cliente`: C1, C3; `auth-2fa-login`: L3, L5 |
| M4 | Obligatorio para ROOT | `auth-2fa-login`: L3, L10; `auth-2fa-totp`: T8 |
| M5 | Una vez por login, tras la contraseña y antes del selector; cambiar de cliente o renovar no lo pide | `auth-2fa-login`: L1, L2, L6, L7, L8, L9 |
| M6 | Dispositivo de confianza automático, ventana deslizante de 30 días (cambiado 2026-10-08); se invalida al cambiar contraseña, resetear 2FA o cerrar todas las sesiones | `auth-2fa-dispositivo-confiable`: D1, D2, D3, D5, D6, D8; `usuarios-reset-password`: U1; `auth-reseteo-por-olvido`: O1 |
| M7 | ROOT resetea el 2FA; ADMINISTRADOR solo si el usuario pertenece únicamente a su cliente | `auth-2fa-reseteo`: S1, S2, S3, S4 |
| M8 | El reset de contraseña por mail no desactiva el 2FA | `auth-reseteo-por-olvido`: O2; `usuarios-reset-password`: U2 |
| M9 | Límite de intentos en login y verificación del código (5 cada 15 min) | `auth-limite-intentos`: I1-I8 |
| M10 | Fuera de alcance: WebAuthn/passkeys, SMS, auditoría de logins | `auth-2fa-totp`: T11 |
| P1 | No obligado puede desactivar; obligado no; cualquiera regenera y cambia de celular; todo con código válido | `auth-2fa-totp`: T8, T9, T10; `auth-limite-intentos`: I6 |
| P2 | ROOT sin celular ni códigos: script de operador; ROOT resetea a ROOT; ADMINISTRADOR nunca a un ROOT | `auth-2fa-reseteo`: S1, S2, S6 |
| P3 | "Únicamente a su cliente" cuenta todas las membresías, inactivas y de clientes suspendidos | `auth-2fa-reseteo`: S2 |
| P4 | Dispositivo no disponible para ROOT; se invalida por cambio propio, reset por mail y reset por administrador | `auth-2fa-dispositivo-confiable`: D4, D5; `usuarios-reset-password`: U1; `auth-reseteo-por-olvido`: O1 |
| P5 | Sesiones abiertas siguen si un administrador empieza a exigir el 2FA | `auth-2fa-politica-cliente`: C4 |
| P6 | Límite de contraseña por usuario e IP (el BFF pasa la IP); el del código por usuario | `auth-limite-intentos`: I3, I4, I6 |
| P7 | Configuración obligatoria: el login termina al confirmar que se guardaron los 10 códigos | `auth-2fa-login`: L5 |
| P8 | Sin forma de relajar el 2FA fuera de producción; tests con secreto conocido | `auth-2fa-login`: L10 |
| P9 | Aviso por mail al activar o resetear: fuera de alcance | `auth-2fa-totp`: T11 |

Nada de la decisión queda sin implementar; lo declarado fuera de alcance (M10, P9) está en T11 con su motivo. Requerimientos de soporte sin viñeta propia: T3, T12, L4, L11, I8, D7, S5, S7, S8, C2, C5, `email-crypto-key-rotacion`: K1-K4, `usuarios-reset-password`: el requerimiento MODIFIED "Un fallo de revocación no hace fallar la respuesta".
