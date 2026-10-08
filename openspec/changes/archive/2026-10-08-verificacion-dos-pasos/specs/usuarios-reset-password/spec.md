# Delta for Usuarios Reset Password

> **Decisión de producto citada.** `docs/roadmap-comercial.md`, "Decisiones de producto de la segunda etapa", viñeta "Segunda etapa, punto 5 — verificación en dos pasos (2FA)": "Recordar este dispositivo se invalida al cambiar la contraseña" y precisión "por cualquier vía: ... el reseteo por un administrador". Trazabilidad en `auth-2fa-totp`.

## ADDED Requirements

### Requirement: U1 El reset invalida los dispositivos confiables del destino y falla cerrado

El sistema DEBE invalidar todos los dispositivos confiables del destino como parte del reset de contraseña. A diferencia de la revocación de refresh tokens, un fallo de esta invalidación SÍ DEBE propagarse: la operación DEBE informar fallo y `passwordHash` del destino NO DEBE quedar modificado, de modo que no exista una contraseña nueva con un dispositivo confiable válido.

#### Scenario: Reset exitoso invalida dispositivos

- GIVEN un destino con dos dispositivos confiables vigentes
- WHEN un admin del tenant le establece una contraseña nueva
- THEN la operación reporta éxito y ambos dispositivos quedan inválidos

#### Scenario: La invalidación de dispositivos falla

- GIVEN que la invalidación de dispositivos lanza una excepción
- WHEN un admin del tenant intenta establecer una contraseña nueva
- THEN la operación informa fallo y `passwordHash` no cambia

### Requirement: U2 El reset de contraseña no desactiva el 2FA del destino

El reset de contraseña por un administrador NO DEBE alterar el secreto ni los códigos de recuperación del destino.

#### Scenario: El siguiente login pide código

- GIVEN un destino con 2FA activo
- WHEN un admin le establece una contraseña nueva y el destino hace login con ella
- THEN se le pide el segundo paso

## MODIFIED Requirements

### Requirement: Un fallo de revocación no hace fallar la respuesta

El sistema NO DEBE propagar un fallo de `revokeAllByUsuarioId()` (refresh tokens) como error de la operación: la contraseña ya fue persistida, y reportar fallo mentiría sobre el estado real de la credencial. El sistema DEBE dejar rastro del fallo solo vía `logger.error`, sin el plaintext. Esta tolerancia aplica ÚNICAMENTE a los refresh tokens: la invalidación de dispositivos confiables NO la comparte y falla cerrado (U1).
(Previously: no distinguía entre refresh tokens y dispositivos confiables, porque estos no existían.)

#### Scenario: La revocación falla pero la operación igual reporta éxito

- GIVEN que `revokeAllByUsuarioId()` lanza una excepción al ejecutarse
- WHEN un admin del tenant establece una contraseña nueva para el destino
- THEN la operación reporta éxito
- AND `passwordHash` del destino corresponde a la contraseña nueva
- AND el sistema registra el fallo de revocación en el log sin incluir el
  plaintext

#### Scenario: La tolerancia no alcanza a los dispositivos confiables

- GIVEN que `revokeAllByUsuarioId()` falla y la invalidación de dispositivos también
- WHEN un admin del tenant establece una contraseña nueva
- THEN la operación informa fallo y `passwordHash` no cambia
