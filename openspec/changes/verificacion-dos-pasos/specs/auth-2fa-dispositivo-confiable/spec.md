# Auth 2FA Dispositivo Confiable — Specification

## Purpose

Definir "Recordar este dispositivo": cuándo se ofrece, cuánto dura, para quién nunca está disponible y qué lo invalida, con invalidación que falla cerrado.

> **Decisión de producto citada.** `docs/roadmap-comercial.md`, "Decisiones de producto de la segunda etapa", viñeta "Segunda etapa, punto 5 — verificación en dos pasos (2FA)": viñeta de "Recordar este dispositivo" por 30 días y precisión sobre ROOT y las vías de cambio de contraseña. Trazabilidad completa en `auth-2fa-totp`.

## Definiciones

- **Dispositivo confiable**: navegador al que el usuario pidió recordar tras superar el segundo paso; no se le vuelve a pedir el código mientras valga.
- **Fail-closed**: si la invalidación falla, la operación que la dispara informa fallo y no deja un dispositivo válido junto a la credencial nueva.

## Requirements

### Requirement: D1 Alta del dispositivo al verificar con "recordar"

Cuando el usuario supera el segundo paso eligiendo "recordar este dispositivo", el sistema DEBE emitir un token opaco, mostrarlo en crudo una sola vez y persistir solo un derivado no reversible. El token DEBE viajar en una cookie httpOnly gestionada por el BFF y valer por navegador.

#### Scenario: Recordar tras el segundo paso

- GIVEN un usuario no ROOT que supera el desafío marcando "recordar"
- WHEN se completa la verificación
- THEN el BFF fija una cookie httpOnly con el token y la base guarda solo su derivado

#### Scenario: Sin marcar "recordar"

- GIVEN un usuario que supera el desafío sin marcar "recordar"
- WHEN se completa la verificación
- THEN no se emite token ni cookie de dispositivo

### Requirement: D2 Vigencia de 30 días

El dispositivo DEBE valer 30 días desde su emisión y ni un instante más.

#### Scenario: Dentro de la vigencia

- GIVEN un dispositivo emitido hace 29 días
- WHEN el usuario hace login con su token
- THEN no se le pide código

#### Scenario: Vencido

- GIVEN un dispositivo emitido hace 31 días
- WHEN el usuario hace login con su token
- THEN se le pide el código

### Requirement: D3 Un dispositivo válido omite el desafío, no la contraseña

Con un token de dispositivo válido del mismo usuario, el login DEBE omitir el segundo paso pero DEBE exigir la contraseña. Un token vencido, revocado, desconocido o emitido para otro usuario DEBE ignorarse y el login sigue con el desafío normal.

#### Scenario: Dispositivo válido

- GIVEN un usuario con 2FA y un dispositivo vigente
- WHEN envía contraseña correcta con el token
- THEN pasa al selector o a la sesión sin desafío

#### Scenario: Token de otro usuario o revocado

- GIVEN un token de dispositivo de otro usuario, o uno revocado
- WHEN el usuario hace login con él
- THEN recibe el desafío normal

#### Scenario: Contraseña incorrecta con dispositivo válido

- GIVEN un dispositivo vigente
- WHEN la contraseña es incorrecta
- THEN el login falla como cualquier credencial inválida

### Requirement: D4 No disponible para ROOT

El sistema NO DEBE ofrecer ni emitir dispositivo confiable a un ROOT y NO DEBE honrar un token si el usuario es ROOT al momento del login.

#### Scenario: ROOT no recibe token

- GIVEN un ROOT que supera el desafío marcando "recordar"
- WHEN se completa la verificación
- THEN no se emite token y el siguiente login pide código

#### Scenario: Usuario promovido a ROOT

- GIVEN un usuario con un dispositivo vigente que pasó a ser ROOT
- WHEN hace login con ese token
- THEN se le pide el código

### Requirement: D5 Se invalidan al cambiar la contraseña por cualquier vía, fail-closed

Todo cambio de contraseña DEBE invalidar todos los dispositivos confiables del usuario: cambio propio, reseteo por mail y reseteo por un administrador (ver `usuarios-reset-password` y `auth-reseteo-por-olvido`). Si la invalidación falla, el cambio DEBE informar fallo y NO DEBE dejar la contraseña cambiada con un dispositivo válido.

#### Scenario: Cambio propio

- GIVEN un usuario con dos dispositivos vigentes
- WHEN cambia su contraseña
- THEN ambos dispositivos quedan inválidos

#### Scenario: Fallo de invalidación

- GIVEN que la invalidación de dispositivos lanza una excepción
- WHEN el usuario cambia su contraseña
- THEN la operación informa fallo y la contraseña no queda cambiada

### Requirement: D6 Se invalidan al resetear o desactivar el 2FA

El reseteo de 2FA (`auth-2fa-reseteo`) y la desactivación propia DEBEN invalidar todos los dispositivos confiables del usuario. Si la invalidación falla, la operación DEBE informar fallo sin dejar el 2FA reseteado con un dispositivo válido.

#### Scenario: Reseteo

- GIVEN un usuario con un dispositivo vigente
- WHEN un ROOT le resetea el 2FA
- THEN el dispositivo queda inválido

#### Scenario: Fallo de invalidación en el reseteo

- GIVEN que la invalidación lanza una excepción
- WHEN se resetea el 2FA
- THEN la operación informa fallo y el 2FA del usuario sigue como estaba

### Requirement: D7 El token no se persiste en crudo

El sistema NO DEBE persistir ni loguear el token de dispositivo en crudo.

#### Scenario: Inspección de base y logs

- GIVEN un dispositivo emitido
- WHEN se inspeccionan la fila y los logs
- THEN no aparece el token en crudo
