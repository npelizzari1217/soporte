# Auth 2FA Login — Specification

## Purpose

Definir cómo el segundo factor se integra al login: orden de pasos, desafío, quién está obligado, configuración forzada, selector de cliente con ticket, y qué NO vuelve a pedir el código (refresh y cambio de cliente).

> **Decisión de producto citada.** `docs/roadmap-comercial.md`, "Decisiones de producto de la segunda etapa", viñeta "Segunda etapa, punto 5 — verificación en dos pasos (2FA)", viñetas de obligatoriedad, de "una sola vez por login", de ROOT, y precisiones de configuración obligatoria y de relajación fuera de producción. Trazabilidad completa en `auth-2fa-totp`.

## Definiciones

- **Obligado**: ROOT, o usuario con al menos una membresía activa en un cliente activo que exige 2FA.
- **Desafío**: estado intermedio, entre contraseña correcta y sesión, que prueba que el usuario ya superó el paso de contraseña.
- **Ticket de selección**: prueba de un solo uso, de vida corta, de que el usuario superó la contraseña y, si le corresponde, el segundo paso, usada para elegir cliente sin reenviar credenciales.

## Requirements

### Requirement: L1 Orden del login

El login DEBE seguir este orden: contraseña, después segundo paso o configuración forzada, después selector de cliente (si hay más de una membresía), después sesión. El sistema NO DEBE emitir ningún token de sesión antes de completar los pasos que le corresponden al usuario. Una contraseña incorrecta NO DEBE revelar si la cuenta tiene 2FA.

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

### Requirement: L2 El desafío es opaco, de vida corta y de un solo uso

El desafío DEBE ser opaco, estar atado al usuario, vencer en un lapso corto y poder usarse una sola vez para completar el paso. Un desafío vencido, ya usado o desconocido DEBE rechazarse con el mismo error genérico.

#### Scenario: Desafío vencido

- GIVEN un desafío emitido cuyo tiempo de vida pasó
- WHEN se envía un código correcto con él
- THEN se rechaza y no se emite sesión

#### Scenario: Desafío reutilizado

- GIVEN un desafío ya consumido por una verificación exitosa
- WHEN se lo vuelve a presentar con un código válido
- THEN se rechaza

#### Scenario: Desafío de otro usuario o inventado

- GIVEN un desafío inexistente o emitido para otro usuario
- WHEN se presenta con un código válido del primero
- THEN se rechaza con el mismo error que el vencido

### Requirement: L3 Quién está obligado

El 2FA DEBE ser obligatorio para todo ROOT y para todo usuario con al menos una membresía activa en un cliente activo con la política "exigir 2FA". La obligación DEBE valer al entrar a CUALQUIER cliente del usuario. Una membresía inactiva, o de un cliente suspendido, NO DEBE obligar.

#### Scenario: ROOT siempre obligado

- GIVEN un ROOT sin ningún cliente que exija 2FA
- WHEN supera la contraseña
- THEN se le pide el segundo paso (o la configuración forzada)

#### Scenario: Un cliente exige y el usuario entra a otro

- GIVEN un usuario con membresías activas en A (no exige) y B (exige)
- WHEN entra eligiendo A
- THEN igual se le pidió el segundo paso antes del selector

#### Scenario: Membresía inactiva o cliente suspendido

- GIVEN un usuario cuya única membresía en un cliente que exige 2FA está inactiva, o cuyo cliente que exige está suspendido
- WHEN hace login
- THEN esa membresía no lo obliga

### Requirement: L4 Se pide también a quien lo activó voluntariamente

Un usuario con 2FA activo DEBE recibir el segundo paso en cada login aunque no esté obligado.

#### Scenario: No obligado con 2FA activo

- GIVEN un usuario no obligado con 2FA activo
- WHEN supera la contraseña
- THEN recibe el desafío

### Requirement: L5 Configuración forzada y cierre del login

Si un usuario obligado no tiene 2FA activo, después de la contraseña el sistema DEBE forzar la configuración antes de seguir: solo se permiten iniciar y confirmar el enrolamiento. El login DEBE terminar recién cuando el usuario confirma que guardó los 10 códigos de recuperación; hasta entonces NO DEBE emitirse sesión.

#### Scenario: Obligado sin 2FA

- GIVEN un ROOT sin 2FA activo
- WHEN supera la contraseña
- THEN recibe un desafío de configuración y ningún token

#### Scenario: Cierre solo con confirmación de guardado

- GIVEN un usuario en configuración forzada que confirmó el código de su app y recibió los 10 códigos
- WHEN abandona sin confirmar que los guardó
- THEN no se emitió sesión; y al confirmar el guardado el login continúa (selector o sesión)

#### Scenario: El desafío de configuración no sirve para otra cosa

- GIVEN un desafío de configuración forzada
- WHEN se lo usa para pedir sesión, seleccionar cliente o llamar a otra operación autenticada
- THEN se rechaza

### Requirement: L6 Verificación del código en el login

En el paso del segundo factor el usuario DEBE poder presentar un código TOTP o un código de recuperación. Un código incorrecto DEBE rechazarse y contar como fallo (ver `auth-limite-intentos`). Un código válido consume el desafío.

#### Scenario: Código TOTP correcto

- GIVEN un desafío vigente
- WHEN se envía el código TOTP vigente
- THEN el paso se supera

#### Scenario: Código de recuperación

- GIVEN un desafío vigente y un código de recuperación sin usar
- WHEN se envía ese código
- THEN el paso se supera y el código queda usado

#### Scenario: Código incorrecto

- GIVEN un desafío vigente
- WHEN se envía un código erróneo
- THEN se rechaza con un error genérico y el desafío sigue siendo utilizable hasta su vencimiento o bloqueo

### Requirement: L7 El selector usa un ticket y no reenvía contraseña ni código

Tras el paso previo, el selector de cliente DEBE completarse con un ticket de selección de un solo uso y vida corta, sin reenviar la contraseña y sin pedir el código otra vez. El clienteId elegido DEBE ser una membresía activa del usuario; de lo contrario se rechaza con el mismo error que un ticket inválido.

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

### Requirement: L8 Refresh y cambio de cliente no piden el código

Renovar la sesión (refresh) y cambiar de cliente con una sesión abierta NO DEBEN pedir el segundo factor ni un desafío.

#### Scenario: Refresh

- GIVEN una sesión abierta de un usuario con 2FA
- WHEN se renueva con su refresh token vigente
- THEN se emite el token nuevo sin código

#### Scenario: Cambio de cliente

- GIVEN una sesión abierta de un usuario con 2FA y varias membresías
- WHEN cambia de cliente
- THEN lo logra sin código

### Requirement: L9 Consecuencia declarada: el refresh token robado no exige 2FA

Por decisión de diseño, un refresh token robado DEBE seguir funcionando sin segundo factor hasta que venza o se revoque. Esto se declara y no es un defecto.

#### Scenario: Refresh token sin segundo factor

- GIVEN un refresh token vigente emitido en un login con 2FA
- WHEN lo presenta alguien que no tiene el celular
- THEN la renovación procede hasta que el token venza o sea revocado

### Requirement: L10 No hay forma de relajar el 2FA fuera de producción

El sistema NO DEBE ofrecer ningún flag, variable de entorno ni modo que omita u ofrezca otro camino al 2FA obligatorio fuera de producción. Los tests, e2e y seeds DEBEN usar un secreto conocido y generar el código TOTP.

#### Scenario: ROOT en entorno de test

- GIVEN el entorno de test y un ROOT sin código
- WHEN supera la contraseña
- THEN no obtiene sesión; con un código generado desde el secreto conocido del fixture sí

#### Scenario: Seed de ROOT

- GIVEN el seed de ROOT ejecutado en un entorno de desarrollo
- WHEN se inspecta el usuario creado
- THEN tiene 2FA activo con un secreto conocido documentado

### Requirement: L11 Un secreto indescifrable no rompe el login con un 500

Si el secreto TOTP del usuario no descifra durante el login, el sistema DEBE devolver un rechazo controlado y NO DEBE emitir sesión ni responder 500.

#### Scenario: Secreto ilegible

- GIVEN un usuario con 2FA cuyo secreto no descifra con la clave vigente
- WHEN envía un código en el desafío
- THEN recibe un rechazo 4xx genérico y no obtiene sesión
