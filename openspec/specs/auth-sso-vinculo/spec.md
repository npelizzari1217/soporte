# Auth SSO Vínculo — Specification

## Purpose

Definir el vínculo entre un usuario y su cuenta puntual del proveedor: cómo se crea en el primer ingreso, por qué identificador inmutable, qué pasa con otra cuenta que usa el mismo email, cómo se resuelven los primeros ingresos concurrentes y cómo lo resetea un administrador.

> **Decisión de producto citada.** `docs/roadmap-comercial.md`, sección "Decisiones de producto de la segunda etapa", viñeta "Segunda etapa, punto 7 — login con Google o Microsoft (SSO)" (ciclo en #507), viñeta del primer ingreso y vínculo, y precisión "Resetear vínculo SSO" de "Precisiones del 2026-10-09, al explorar". Esta spec cubre D7 y P1. Trazabilidad completa en `auth-sso-login`.

## Definiciones

- **Vínculo**: relación entre un usuario y un par (proveedor, sujeto).
- **Sujeto**: Google `sub`; Microsoft `<tid>:<oid>`. Nunca el email, `preferred_username` ni `upn`.
- **Reseteo**: acción de un administrador que borra todos los vínculos del usuario.
- **ROOT**: usuario administrador global.

## Requirements

### Requirement: SV1 Un vínculo por proveedor y por usuario; una cuenta del proveedor, un usuario

El sistema DEBE guardar a lo sumo un vínculo por par (usuario, proveedor) y a lo sumo un vínculo por par (proveedor, sujeto). El vínculo DEBE guardar el proveedor, el sujeto y la fecha. **Desviación declarada (2026-10-10, decisión del dueño):** el vínculo NO guarda el email con que se vinculó. Ese dato era solo informativo, ninguna pantalla lo lee y guardarlo sumaba un dato personal sin uso (ADR-4, `design.md:197`). Lo que se pierde es el rastro de con qué email se creó cada vínculo. El proveedor DEBE estar restringido a `GOOGLE` o `MICROSOFT`. Borrar un usuario DEBE borrar sus vínculos. Estas restricciones DEBEN valer a nivel de base de datos.

#### Scenario: Segundo vínculo del mismo proveedor para el mismo usuario

- GIVEN un usuario con vínculo de Google
- WHEN se intenta insertar otro vínculo de Google para él
- THEN la base lo rechaza

#### Scenario: Misma cuenta del proveedor para dos usuarios

- GIVEN un vínculo (proveedor, sujeto) de un usuario
- WHEN se intenta insertar el mismo par para otro usuario
- THEN la base lo rechaza

#### Scenario: Un usuario con ambos proveedores

- GIVEN un usuario con vínculo de Google
- WHEN se vincula además con Microsoft
- THEN ambos vínculos coexisten

#### Scenario: Proveedor inválido

- GIVEN un valor de proveedor distinto de `GOOGLE` y `MICROSOFT`
- WHEN se intenta insertar
- THEN la base lo rechaza

#### Scenario: Borrado del usuario

- GIVEN un usuario con vínculos
- WHEN se elimina de la base
- THEN sus vínculos desaparecen

### Requirement: SV2 El primer ingreso vincula por el identificador inmutable

En el primer ingreso por SSO de un usuario aceptable cuyo email verificado coincide (SL2 de `auth-sso-login`), el sistema DEBE crear el vínculo con el sujeto del proveedor, no con el email. La creación DEBE ocurrir solo después de superar todas las validaciones del token, del usuario (no ROOT, activo, con membresía) y del límite de intentos.

#### Scenario: Primer ingreso de Google

- GIVEN un usuario sin vínculos y un token de Google verificado con su email
- WHEN completa el ingreso
- THEN se crea el vínculo con el `sub` de Google

#### Scenario: Primer ingreso de Microsoft

- GIVEN un usuario sin vínculos y un token de Microsoft válido con su email
- WHEN completa el ingreso
- THEN se crea el vínculo con el sujeto `<tid>:<oid>`

#### Scenario: Ingreso rechazado no vincula

- GIVEN un ingreso rechazado por ROOT, usuario inactivo o sin membresías
- WHEN se inspeccionan los vínculos
- THEN no se creó ninguno

### Requirement: SV3 Los ingresos siguientes se reconocen por el vínculo

Con un vínculo existente, el ingreso DEBE reconocerse por el par (proveedor, sujeto) sin volver a comparar el email. Un cambio de email en el proveedor NO DEBE impedir el ingreso ni crear otro vínculo.

#### Scenario: Email cambiado en el proveedor

- GIVEN un usuario vinculado y un token con su mismo sujeto pero otro email verificado
- WHEN completa el ingreso
- THEN entra como ese usuario y no se crea otro vínculo

### Requirement: SV4 Otra cuenta con el mismo email no entra

Si el usuario que coincide por email ya tiene un vínculo de ese proveedor con un sujeto distinto, el ingreso DEBE rechazarse con la falla genérica y NO DEBE modificarse el vínculo existente. Esto cubre una dirección que pasa a otra persona.

#### Scenario: Otra cuenta, mismo email

- GIVEN un usuario vinculado con la cuenta A de Google y una cuenta B de Google con el mismo email verificado
- WHEN B completa el ingreso
- THEN se rechaza, el vínculo de A sigue intacto y el log indica el desajuste

#### Scenario: Otro proveedor sin vínculo

- GIVEN un usuario vinculado solo con Google y un token verificado de Microsoft con su email
- WHEN completa el ingreso
- THEN se crea el vínculo de Microsoft y el de Google no cambia

### Requirement: SV5 Primeros ingresos concurrentes: gana el primero

Si dos primeros ingresos del mismo usuario y proveedor ocurren a la vez con sujetos distintos, DEBE crearse exactamente un vínculo (el del primero en escribir) y el otro DEBE rechazarse con la falla genérica. Si ambos llegan con el mismo sujeto, ambos DEBEN poder continuar sin error ni vínculo duplicado.

#### Scenario: Dos cuentas distintas a la vez

- GIVEN un usuario sin vínculos y dos tokens del mismo proveedor con sujetos distintos y su email
- WHEN ambos completan el ingreso a la vez
- THEN queda un solo vínculo y exactamente uno de los dos ingresos se rechaza

#### Scenario: La misma cuenta dos veces a la vez

- GIVEN un usuario sin vínculos y dos ingresos simultáneos con el mismo sujeto
- WHEN ambos completan
- THEN queda un solo vínculo y ninguno falla por la restricción de unicidad

### Requirement: SV6 Una cuenta del proveedor no sirve para dos usuarios

Si el sujeto ya está vinculado a un usuario, el ingreso DEBE resolverse a ese usuario (SL2) y NO DEBE crearse vínculo para otro usuario cuyo email coincida. Si la unicidad (proveedor, sujeto) se viola en una carrera, el ingreso DEBE rechazarse con la falla genérica.

#### Scenario: Cuenta ya vinculada a otro usuario

- GIVEN el sujeto S vinculado al usuario U1 y un token con S y el email de otro usuario U2
- WHEN completa el ingreso
- THEN entra como U1 (por vínculo) y no se crea ningún vínculo para U2

### Requirement: SV7 Un solo reseteo borra todos los vínculos y cierra las sesiones

El sistema DEBE ofrecer una única operación de reseteo del vínculo SSO de un usuario (`DELETE /usuarios/:id/sso`) que borre los vínculos con TODOS los proveedores y revoque los refresh tokens abiertos del usuario. No DEBE existir un reseteo por proveedor. Si la revocación de sesiones falla, el fallo DEBE registrarse y NO DEBE deshacer el borrado de los vínculos. Tras el reseteo, el siguiente ingreso por SSO DEBE vincular de nuevo (SV2). El reseteo NO DEBE tocar la contraseña, el 2FA ni las membresías.

#### Scenario: Reseteo de un usuario con dos vínculos

- GIVEN un usuario con vínculos de Google y de Microsoft y sesiones abiertas
- WHEN un administrador autorizado lo resetea
- THEN responde 204, no quedan vínculos y los refresh tokens del usuario quedan revocados

#### Scenario: Reseteo sin vínculos

- GIVEN un usuario sin vínculos
- WHEN un administrador autorizado lo resetea
- THEN responde 204 sin cambios

#### Scenario: Falla al revocar sesiones

- GIVEN que la revocación de refresh tokens lanza una excepción
- WHEN se resetea
- THEN los vínculos igual quedan borrados y el fallo queda en el log

#### Scenario: Revinculación

- GIVEN un usuario recién reseteado
- WHEN otra cuenta del proveedor con su email completa el ingreso
- THEN se crea un vínculo nuevo con esa cuenta

#### Scenario: El reseteo no toca otras credenciales

- GIVEN un usuario con 2FA, contraseña y membresías
- WHEN se resetea su vínculo SSO
- THEN su 2FA, su contraseña y sus membresías no cambian

### Requirement: SV8 Quién puede resetear: el criterio del reseteo de 2FA

ROOT DEBE poder resetear a cualquier usuario. Un ADMINISTRADOR DEBE poder resetear solo a un usuario no ROOT con membresía activa en su cliente y cuyas membresías (activas, inactivas o de clientes eliminados o suspendidos) estén TODAS en su propio cliente. Toda denegación (usuario inexistente, ROOT como objetivo, membresías en otro cliente, actor sin permiso de administración) DEBE responder el mismo 404, indistinguible. Un ROOT que resetea a otro ROOT DEBE recibir 204 sin efecto. La regla de autorización DEBE ser la misma que usa el reseteo de 2FA.

#### Scenario: ROOT resetea a cualquiera

- GIVEN un ROOT y un usuario con membresías en dos clientes
- WHEN el ROOT lo resetea
- THEN responde 204 y los vínculos se borran

#### Scenario: ADMINISTRADOR con usuario solo de su cliente

- GIVEN un ADMINISTRADOR del cliente A y un usuario cuyas membresías están todas en A
- WHEN lo resetea
- THEN responde 204 y los vínculos se borran

#### Scenario: ADMINISTRADOR con usuario de varios clientes

- GIVEN un ADMINISTRADOR del cliente A y un usuario con membresías en A y B
- WHEN intenta resetearlo
- THEN responde 404 y los vínculos y sesiones no cambian

#### Scenario: Membresía inactiva en otro cliente

- GIVEN un usuario con membresía activa en A y una inactiva en B
- WHEN el ADMINISTRADOR de A intenta resetearlo
- THEN responde 404

#### Scenario: Objetivo ROOT

- GIVEN un ROOT como objetivo
- WHEN un ADMINISTRADOR intenta resetearlo
- THEN responde 404

#### Scenario: Denegaciones indistinguibles

- GIVEN un usuario inexistente y otro de otro cliente
- WHEN un ADMINISTRADOR intenta resetear a cada uno
- THEN ambas respuestas son idénticas (mismo código y cuerpo)

#### Scenario: Sin sesión o sin rol

- GIVEN una petición sin sesión, o de un usuario sin rol administrativo
- WHEN invoca el reseteo
- THEN se rechaza por el guard de administración, sin efecto

## Trazabilidad

| # | Viñeta de la decisión (resumen) | Requerimiento(s) |
|---|---|---|
| D7 | Primer ingreso: vínculo a la cuenta puntual por identificador inmutable, no por email | SV1, SV2, SV3 |
| D7 | Otra cuenta con el mismo email no entra | SV4, SV5, SV6 |
| D7 | Reseteo por administrador con el criterio del reseteo de 2FA | SV7, SV8 |
| P1 | Un solo botón: borra vínculos de todos los proveedores y cierra sesiones abiertas | SV7 |
