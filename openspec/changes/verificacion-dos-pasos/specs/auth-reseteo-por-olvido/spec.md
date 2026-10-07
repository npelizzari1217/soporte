# Delta for Auth Reseteo Por Olvido

> **Decisión de producto citada.** `docs/roadmap-comercial.md`, "Decisiones de producto de la segunda etapa", viñeta "Segunda etapa, punto 5 — verificación en dos pasos (2FA)": "El reseteo de contraseña por mail no desactiva el 2FA" y "Recordar este dispositivo ... se invalida ... por cualquier vía: ... el reseteo por mail". Trazabilidad en `auth-2fa-totp`.

## ADDED Requirements

### Requirement: O1 Confirmar el reset invalida los dispositivos confiables y falla cerrado

Confirmar el reset DEBE invalidar todos los dispositivos confiables del usuario. Un fallo de esa invalidación DEBE propagarse como fallo de la confirmación y `passwordHash` NO DEBE quedar modificado. El usuario DEBE poder reintentar pidiendo un reset nuevo.

#### Scenario: Confirmación exitosa

- GIVEN un usuario con un dispositivo confiable vigente y un token de reset vigente
- WHEN confirma el reset
- THEN la contraseña cambia y el dispositivo queda inválido

#### Scenario: La invalidación falla

- GIVEN que la invalidación de dispositivos lanza una excepción
- WHEN se confirma el reset
- THEN la confirmación informa fallo, `passwordHash` no cambia y el usuario puede solicitar un reset nuevo

### Requirement: O2 El reset por mail no desactiva el 2FA

Confirmar un reset NO DEBE alterar el secreto ni los códigos de recuperación, y NO DEBE pedir ni omitir el segundo paso: el siguiente login DEBE pedir el código igual.

#### Scenario: Login posterior al reset

- GIVEN un usuario con 2FA activo que confirmó un reset por mail
- WHEN hace login con la contraseña nueva
- THEN se le pide el segundo paso

#### Scenario: La confirmación no pide código

- GIVEN un usuario con 2FA activo y un token de reset vigente
- WHEN confirma el reset sin enviar código
- THEN el reset procede

## MODIFIED Requirements

### Requirement: Las sesiones se revocan tras un reset exitoso sin condicionar la respuesta

El sistema DEBE revocar todas las sesiones activas (refresh tokens) tras persistir la contraseña nueva. Un fallo de revocación de refresh tokens NO DEBE propagarse como error. Esta tolerancia aplica ÚNICAMENTE a los refresh tokens: la invalidación de dispositivos confiables NO la comparte y falla cerrado (O1).
(Previously: sin distinguir refresh tokens de dispositivos confiables, porque estos no existían.)

#### Scenario: Reset exitoso revoca las sesiones activas

- GIVEN un usuario con sesiones activas
- WHEN confirma el reset con éxito
- THEN reporta éxito y las sesiones previas quedan revocadas

#### Scenario: Un fallo de revocación no deshace el reset

- GIVEN que `revokeAllByUsuarioId()` lanza una excepción
- WHEN se confirma el reset
- THEN igual reporta éxito y el fallo se loguea sin el plaintext

#### Scenario: La tolerancia no alcanza a los dispositivos confiables

- GIVEN que la revocación de refresh tokens y la invalidación de dispositivos fallan
- WHEN se confirma el reset
- THEN la confirmación informa fallo y `passwordHash` no cambia
