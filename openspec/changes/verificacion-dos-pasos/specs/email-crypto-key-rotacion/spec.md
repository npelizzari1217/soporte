# Delta for Email Crypto Key Rotación

> **Decisión de producto citada.** `docs/roadmap-comercial.md`, "Decisiones de producto de la segunda etapa", viñeta "Segunda etapa, punto 5 — verificación en dos pasos (2FA)": el 2FA se apoya en un secreto TOTP por usuario que usuarios con 2FA necesitan poder descifrar para loguear. La spec es agnóstica de la clave: la rotación DEBE cubrir la clave con la que se cifran los secretos TOTP, sea la misma de las contraseñas SMTP o una dedicada (lo decide diseño; si es dedicada, su rotación es un entregable de este cambio con las mismas garantías).

## ADDED Requirements

### Requirement: K1 La rotación preserva todos los secretos TOTP

Rotar la clave que cifra los secretos TOTP DEBE re-cifrar todos los secretos TOTP persistidos, de modo que cada uno siga descifrando con la clave nueva y reproduzca el mismo texto plano. El vínculo criptográfico de cada secreto con su usuario DEBE preservarse.

#### Scenario: Rotación con secretos TOTP

- GIVEN usuarios con secretos TOTP cifrados con la clave vieja
- WHEN se ejecuta la rotación
- THEN todos descifran con la clave nueva y los códigos TOTP generados antes y después de la rotación coinciden

#### Scenario: Vínculo con el usuario

- GIVEN un secreto re-cifrado durante la rotación
- WHEN se intenta descifrarlo con el vínculo de OTRO usuario
- THEN el descifrado falla

### Requirement: K2 Atomicidad y fallo duro también para los secretos TOTP

Los secretos TOTP DEBEN rotarse con las mismas garantías que las contraseñas SMTP: transacción única con ROLLBACK completo ante cualquier error, verificación round-trip antes del COMMIT, fallo duro con código distinto de cero si un secreto no descifra ni con la clave vieja ni con la nueva, y re-corrida idempotente sobre filas ya migradas.

#### Scenario: Un secreto indescifrable aborta todo

- GIVEN un secreto TOTP que no descifra ni con la clave vieja ni con la nueva
- WHEN se ejecuta la rotación
- THEN termina con código distinto de cero y ninguna fila (SMTP ni TOTP) queda modificada

#### Scenario: Re-corrida

- GIVEN secretos TOTP ya migrados en una corrida previa
- WHEN se vuelve a ejecutar la rotación con las mismas claves
- THEN se reportan como ya migrados y no cambian

### Requirement: K3 `--verificar` cubre los secretos TOTP

El modo `--verificar` DEBE comprobar también que todo secreto TOTP descifra con la clave dada, en solo lectura, con código de salida distinto de cero si alguno no descifra, sin imprimir clave ni texto plano.

#### Scenario: Todo descifra

- GIVEN secretos TOTP y SMTP cifrados con una misma clave
- WHEN se ejecuta `--verificar` con esa clave
- THEN termina con código 0 sin escribir nada

#### Scenario: Un secreto TOTP no descifra

- GIVEN al menos un secreto TOTP cifrado con otra clave
- WHEN se ejecuta `--verificar`
- THEN termina con código distinto de cero

### Requirement: K4 Un secreto que no descifra nunca produce un 500 en el login

Si, después de una rotación incompleta o un error de clave, el secreto de un usuario no descifra en el login, el sistema DEBE devolver un rechazo controlado (ver `auth-2fa-totp` T12 y `auth-2fa-login` L11), nunca un 500, y NO DEBE imprimir clave ni texto plano.

#### Scenario: Login con clave equivocada

- GIVEN la clave del entorno distinta de la que cifró el secreto
- WHEN un usuario con 2FA envía un código
- THEN recibe un rechazo 4xx genérico y el log no contiene clave ni código
