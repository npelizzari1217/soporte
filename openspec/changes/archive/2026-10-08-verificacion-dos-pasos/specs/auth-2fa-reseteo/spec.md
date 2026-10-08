# Auth 2FA Reseteo — Specification

## Purpose

Definir quién puede resetear el 2FA de otro usuario cuando pierde el celular y los códigos, y cómo se recupera un ROOT que no tiene ni celular, ni códigos, ni otro ROOT.

> **Decisión de producto citada.** `docs/roadmap-comercial.md`, "Decisiones de producto de la segunda etapa", viñeta "Segunda etapa, punto 5 — verificación en dos pasos (2FA)": viñeta del reseteo por ROOT o ADMINISTRADOR y precisiones sobre ROOT, script de operador y conteo de membresías. Trazabilidad completa en `auth-2fa-totp`.

## Definiciones

- **Membresías del usuario**: TODAS, activas o inactivas, de clientes suspendidos o no.
- **Reseteo de 2FA**: elimina el secreto, los códigos de recuperación y los dispositivos confiables del usuario y revoca sus refresh tokens.

## Requirements

### Requirement: S1 ROOT resetea el 2FA de cualquiera

Un ROOT DEBE poder resetear el 2FA de cualquier usuario, incluido otro ROOT.

#### Scenario: ROOT a un usuario común

- GIVEN un usuario con 2FA activo
- WHEN un ROOT le resetea el 2FA
- THEN el usuario queda sin 2FA

#### Scenario: ROOT a otro ROOT

- GIVEN un ROOT B con 2FA activo
- WHEN otro ROOT A le resetea el 2FA
- THEN B queda sin 2FA

### Requirement: S2 ADMINISTRADOR solo si el usuario no tiene otras membresías, y nunca a un ROOT

Un ADMINISTRADOR DEBE poder resetear el 2FA de un usuario solo si la única membresía del usuario, contando todas (activas o inactivas, de cliente suspendido o no), es la de su propio cliente. NO DEBE poder resetear a un ROOT bajo ninguna circunstancia.

#### Scenario: Pertenece solo a su cliente

- GIVEN un usuario cuya única membresía es del cliente A
- WHEN el ADMINISTRADOR de A le resetea el 2FA
- THEN la operación reporta éxito

#### Scenario: Tiene otra membresía inactiva

- GIVEN un usuario con membresía activa en A y una inactiva en B
- WHEN el ADMINISTRADOR de A intenta resetearlo
- THEN se rechaza y el 2FA no cambia

#### Scenario: Otra membresía en un cliente suspendido

- GIVEN un usuario con membresía en A y otra en un cliente suspendido
- WHEN el ADMINISTRADOR de A intenta resetearlo
- THEN se rechaza

#### Scenario: Destino ROOT

- GIVEN un ROOT con una única membresía en el cliente A
- WHEN el ADMINISTRADOR de A intenta resetearlo
- THEN se rechaza y el 2FA no cambia

### Requirement: S3 Efectos del reseteo

El reseteo DEBE eliminar el secreto y los códigos de recuperación, invalidar los dispositivos confiables (fail-closed, ver `auth-2fa-dispositivo-confiable` D6) y revocar los refresh tokens del usuario.

#### Scenario: Reseteo completo

- GIVEN un usuario con 2FA, 4 códigos sin usar, un dispositivo y una sesión abierta
- WHEN se le resetea el 2FA
- THEN no tiene secreto, códigos ni dispositivos válidos, y su refresh token es rechazado

### Requirement: S4 El aislamiento no filtra existencia

Cuando el actor es ADMINISTRADOR y el destino no tiene membresía activa en su cliente, el sistema DEBE responder el MISMO error que para un usuario inexistente, antes de tocar nada.

#### Scenario: Usuario de otro cliente o inexistente

- GIVEN un usuario de otro cliente y un id inexistente
- WHEN el ADMINISTRADOR de A intenta resetear a cada uno
- THEN ambas respuestas son idénticas

### Requirement: S5 Después del reseteo, el próximo login lo exige o no según corresponda

Tras el reseteo, el usuario NO DEBE necesitar código en su próximo login si no está obligado, y DEBE pasar por la configuración forzada si está obligado.

#### Scenario: No obligado

- GIVEN un usuario no obligado con 2FA reseteado
- WHEN hace login
- THEN no se le pide código

#### Scenario: Obligado

- GIVEN un ROOT con 2FA reseteado
- WHEN supera la contraseña
- THEN se fuerza la configuración y no obtiene sesión hasta completarla

### Requirement: S6 Script de operador para el ROOT sin acceso

DEBE existir un script de operador, ejecutable en el VPS, que resetee el 2FA de un ROOT sin celular, sin códigos y sin otro ROOT. DEBE operar solo sobre usuarios ROOT, aplicar los mismos efectos que S3 y terminar con código distinto de cero si el usuario no existe o no es ROOT.

#### Scenario: ROOT bloqueado

- GIVEN el único ROOT, sin celular ni códigos
- WHEN el operador corre el script con su email
- THEN su 2FA queda reseteado y en el próximo login debe configurarlo

#### Scenario: Usuario que no es ROOT o no existe

- GIVEN un email de un usuario común o inexistente
- WHEN se corre el script
- THEN termina con código distinto de cero y no modifica nada

### Requirement: S7 El script no expone secretos y respeta las reglas de scripts del repo

El script NO DEBE imprimir secretos ni códigos. Si es un `.ps1`, DEBE ser 100 % ASCII sin BOM y figurar en la tabla §2.2 de `~/proyectos/CLAUDE.md`.

#### Scenario: Salida del script

- GIVEN cualquier resultado del script
- WHEN se inspecciona su salida
- THEN no aparece secreto ni código de recuperación

#### Scenario: Codificación del `.ps1`

- GIVEN el archivo `.ps1` del script, si existe
- WHEN se inspecciona su codificación
- THEN todos sus bytes son ASCII y no lleva BOM

### Requirement: S8 Un actor sin rol de administración es rechazado

El sistema DEBE responder 403 cuando el actor no cumple `esAdminDeCliente`, sin importar el destino.

#### Scenario: TECNICO

- GIVEN un actor TECNICO
- WHEN intenta resetear el 2FA de un usuario
- THEN responde 403 y nada cambia
