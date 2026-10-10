# Delta for Auth 2FA Login

> **Decisión de producto citada.** `docs/roadmap-comercial.md`, "Decisiones de producto de la segunda etapa", viñeta "Segunda etapa, punto 7 — login con Google o Microsoft (SSO)": viñetas del 2FA propio después del SSO y del selector de cliente que no cambia (D3, D8). Trazabilidad completa en `auth-sso-login`.
>
> **Definición afectada.** "Ticket de selección" (sección Definiciones) pasa a leerse: prueba de un solo uso y vida corta de que el usuario superó el primer factor (contraseña o SSO) y, si le corresponde, el segundo paso. Se aplica a través de L7.

## MODIFIED Requirements

### Requirement: L1 Orden del login

El login DEBE seguir este orden: primer factor (contraseña o ingreso por SSO), después segundo paso o configuración forzada, después selector de cliente (si hay más de una membresía), después sesión. El sistema NO DEBE emitir ningún token de sesión antes de completar los pasos que le corresponden al usuario, por ninguno de los dos primeros factores. Entrar por SSO NO DEBE contar como segundo paso. Una contraseña incorrecta NO DEBE revelar si la cuenta tiene 2FA.
(Previously: el primer paso era solo la contraseña)

#### Scenario: Usuario con 2FA y un solo cliente

- GIVEN un usuario con 2FA activo y una membresía
- WHEN envía email y contraseña correctos
- THEN recibe un desafío y ningún token; con un código válido recibe la sesión

#### Scenario: Usuario con 2FA y varios clientes

- GIVEN un usuario con 2FA activo y dos membresías
- WHEN supera la contraseña y el código
- THEN recién entonces se le presenta el selector, y al elegir cliente recibe la sesión

#### Scenario: Contraseña incorrecta no filtra el 2FA

- GIVEN un usuario con 2FA y otro sin 2FA
- WHEN se envía una contraseña incorrecta para cada uno
- THEN ambas respuestas son idénticas

#### Scenario: Usuario con 2FA que entra por SSO

- GIVEN un usuario con 2FA activo, una membresía y sin dispositivo de confianza vigente
- WHEN supera el ingreso por SSO
- THEN recibe un desafío y ningún token; con un código válido recibe la sesión

#### Scenario: SSO no cuenta como segundo paso

- GIVEN un usuario obligado a 2FA que supera el ingreso por SSO
- WHEN el proveedor ya había pedido su propia verificación en dos pasos
- THEN igual se le pide el segundo paso propio

#### Scenario: SSO con varios clientes

- GIVEN un usuario con 2FA activo y dos membresías
- WHEN supera el SSO y el código
- THEN recién entonces se le presenta el selector

### Requirement: L7 El selector usa un ticket y no reenvía contraseña ni código

Tras el primer factor (contraseña o SSO) y el paso previo que le corresponda, el selector de cliente DEBE completarse con un ticket de selección de un solo uso y vida corta, sin reenviar la contraseña y sin pedir el código otra vez. El ticket DEBE ser el mismo, con el mismo canje, tanto si el primer factor fue la contraseña como el SSO. El clienteId elegido DEBE ser una membresía activa del usuario; de lo contrario se rechaza con el mismo error que un ticket inválido.
(Previously: el ticket acreditaba solo haber superado la contraseña)

#### Scenario: Selección con ticket

- GIVEN un usuario con 2FA y dos membresías que superó el segundo paso
- WHEN elige cliente con su ticket
- THEN recibe la sesión sin enviar contraseña ni código

#### Scenario: Ticket reutilizado o vencido

- GIVEN un ticket ya usado o vencido
- WHEN se lo presenta con un clienteId válido
- THEN se rechaza

#### Scenario: Cliente ajeno

- GIVEN un ticket vigente
- WHEN se elige un clienteId donde el usuario no tiene membresía activa
- THEN se rechaza con el mismo error que un ticket inválido

#### Scenario: Usuario sin 2FA y con varios clientes

- GIVEN un usuario sin 2FA, no obligado, con dos membresías
- WHEN supera la contraseña
- THEN elige cliente con un ticket, sin reenviar la contraseña

#### Scenario: Ticket emitido por el SSO

- GIVEN un usuario no obligado con dos membresías que superó el ingreso por SSO
- WHEN elige cliente con el ticket que recibió
- THEN recibe la sesión por el mismo canje y sin enviar contraseña

#### Scenario: Ticket del SSO reutilizado

- GIVEN un ticket emitido por el SSO ya canjeado
- WHEN se lo presenta de nuevo
- THEN se rechaza igual que cualquier ticket reutilizado
