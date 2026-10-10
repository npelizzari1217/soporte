# Delta for Auth 2FA Dispositivo Confiable

> **Decisión de producto citada.** `docs/roadmap-comercial.md`, "Decisiones de producto de la segunda etapa", viñeta "Segunda etapa, punto 7 — login con Google o Microsoft (SSO)": viñeta del 2FA propio después del SSO "con el dispositivo de confianza de 30 días" (D3). Trazabilidad completa en `auth-sso-login`.

## RENAMED Requirements

### Requirement: D3 Un dispositivo válido omite el desafío, no la contraseña → D3 Un dispositivo válido omite el desafío, no el primer factor

(Reason: el primer factor puede ser la contraseña o el ingreso por SSO)
(Migration: ninguna; solo cambia el nombre. Los escenarios existentes se conservan abajo)

## MODIFIED Requirements

### Requirement: D3 Un dispositivo válido omite el desafío, no el primer factor

Con un token de dispositivo válido del mismo usuario, el login DEBE omitir el segundo paso pero DEBE exigir el primer factor: la contraseña, o el ingreso por SSO completo y aceptado. Un dispositivo válido NO DEBE permitir entrar sin uno de los dos. Un token vencido, revocado, desconocido o emitido para otro usuario DEBE ignorarse y el login sigue con el desafío normal. La vigencia de 30 días y su renovación son las de D2, también cuando el primer factor fue el SSO.
(Previously: exigía solo la contraseña como primer factor)

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
