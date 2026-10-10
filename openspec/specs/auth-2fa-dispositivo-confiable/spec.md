# Auth 2FA Dispositivo Confiable — Specification

## Purpose

Definir el dispositivo de confianza automático: cuándo se emite, cuánto dura (ventana deslizante de 30 días), para quién nunca se emite y qué lo invalida, con invalidación que falla cerrada.

> **Decisión de producto citada.** `docs/roadmap-comercial.md`, "Decisiones de producto de la segunda etapa", viñeta "Segunda etapa, punto 5 — verificación en dos pasos (2FA)": viñetas del dispositivo de confianza (30 días) y de ROOT y las vías de cambio de contraseña. **Cambiado el 2026-10-08 por decisión del dueño**: la confianza es automática (sin casilla "Recordar este dispositivo"), la vigencia se renueva en cada login que omite el código y "Cerrar todas las sesiones" invalida los dispositivos. Trazabilidad completa en `auth-2fa-totp`.

## Definiciones

- **Dispositivo confiable**: navegador de un usuario no ROOT que superó el segundo paso; no se le vuelve a pedir el código mientras valga.
- **Fail-closed**: si la invalidación falla, la operación que la dispara informa fallo y no deja un dispositivo válido junto a la credencial nueva.

## Requirements

### Requirement: D1 Alta automática del dispositivo al verificar

Cuando un usuario no ROOT supera el segundo paso (código de la app o de recuperación), el sistema DEBE emitir un token opaco sin que el usuario lo pida, mostrarlo en crudo una sola vez y persistir solo un derivado no reversible. El token DEBE viajar en una cookie httpOnly gestionada por el BFF y valer por navegador. La interfaz NO DEBE ofrecer casilla para recordar el dispositivo.

#### Scenario: Confianza automática tras el segundo paso

- GIVEN un usuario no ROOT que supera el desafío
- WHEN se completa la verificación
- THEN el BFF fija una cookie httpOnly con el token y la base guarda solo su derivado

#### Scenario: Código de recuperación

- GIVEN un usuario no ROOT que supera el desafío con un código de recuperación
- WHEN se completa la verificación
- THEN también se emite el dispositivo

#### Scenario: Código incorrecto

- GIVEN un usuario que falla el desafío
- WHEN se rechaza la verificación
- THEN no se emite token ni cookie de dispositivo

### Requirement: D2 Vigencia deslizante de 30 días

El dispositivo DEBE valer 30 días desde su emisión o desde su último uso y ni un instante más. Cada login que omite el desafío gracias a un dispositivo vigente DEBE mover su vencimiento a 30 días desde ese login, y el BFF DEBE re-fijar la cookie con 30 días nuevos. Un dispositivo vencido NO DEBE renovarse.

#### Scenario: Dentro de la vigencia

- GIVEN un dispositivo vigente
- WHEN el usuario hace login con su token
- THEN no se le pide código

#### Scenario: Renovación

- GIVEN un dispositivo emitido hace 29 días
- WHEN el usuario hace login con su token
- THEN su vencimiento pasa a 30 días desde ese login y el BFF re-fija la cookie con 30 días

#### Scenario: Vencido

- GIVEN un dispositivo sin uso hace más de 30 días
- WHEN el usuario hace login con su token
- THEN se le pide el código y el dispositivo no se renueva

### Requirement: D3 Un dispositivo válido omite el desafío, no el primer factor

Con un token de dispositivo válido del mismo usuario, el login DEBE omitir el segundo paso pero DEBE exigir el primer factor: la contraseña, o el ingreso por SSO completo y aceptado. Un dispositivo válido NO DEBE permitir entrar sin uno de los dos. Un token vencido, revocado, desconocido o emitido para otro usuario DEBE ignorarse y el login sigue con el desafío normal. La vigencia de 30 días y su renovación son las de D2, también cuando el primer factor fue el SSO.

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

#### Scenario: SSO con dispositivo válido

- GIVEN un usuario con 2FA y un dispositivo vigente
- WHEN supera el ingreso por SSO con el token del dispositivo
- THEN no se le pide código, recibe el ticket de selección y el dispositivo se renueva a 30 días desde ese ingreso

#### Scenario: SSO con dispositivo de otro usuario o revocado

- GIVEN un token de dispositivo de otro usuario, o uno revocado
- WHEN el usuario supera el ingreso por SSO con él
- THEN recibe el desafío normal

#### Scenario: Dispositivo válido sin primer factor

- GIVEN un dispositivo vigente
- WHEN el ingreso por SSO se rechaza (por ejemplo, email sin verificar)
- THEN no se omite nada: no hay ticket, ni desafío, ni sesión

#### Scenario: Dispositivo vencido con SSO

- GIVEN un dispositivo sin uso hace más de 30 días
- WHEN el usuario supera el ingreso por SSO con él
- THEN se le pide el código y el dispositivo no se renueva

### Requirement: D4 No disponible para ROOT

El sistema NO DEBE emitir dispositivo confiable a un ROOT (el código se le pide siempre) y NO DEBE honrar ni renovar un token si el usuario es ROOT al momento del login.

#### Scenario: ROOT no recibe token

- GIVEN un ROOT que supera el desafío
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

### Requirement: D8 Cerrar todas las sesiones invalida los dispositivos

"Cerrar todas las sesiones" DEBE invalidar todos los dispositivos confiables del usuario, de modo que el código se pida de nuevo en todos lados; si la invalidación falla, la operación DEBE informar fallo. El cierre de sesión normal NO DEBE invalidarlos.

#### Scenario: Cerrar todas las sesiones

- GIVEN un usuario con dos dispositivos vigentes
- WHEN cierra todas las sesiones
- THEN ambos dispositivos quedan inválidos y el próximo login pide código

#### Scenario: Cierre de sesión normal

- GIVEN un usuario con un dispositivo vigente
- WHEN cierra la sesión actual
- THEN el dispositivo sigue vigente
