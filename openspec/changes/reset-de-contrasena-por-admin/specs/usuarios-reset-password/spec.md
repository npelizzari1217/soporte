# Usuarios Reset Password Specification

## Purpose

Definir quién puede establecer la contraseña de otro usuario del tenant desde
`EditarUsuarioDialog`, qué pasa con las sesiones del usuario reseteado, y cómo
convive ese campo con la edición de identidad (`nombre`/`apellido`) en el
mismo diálogo.

## Requirements

### Requirement: Un admin del tenant resetea la contraseña de un miembro activo

El sistema DEBE permitir que un actor con `esAdminDeCliente(actor)` establezca
una contraseña nueva para un usuario con membresía activa en ESE mismo
tenant. El sistema DEBE hashear ÚNICAMENTE vía `UsuarioEntity.hashPassword()`
(`usuario.entity.ts:191`), la misma instancia de `IHashProvider` que el login
usa para verificar. Invocar el proveedor de hashing por otra vía NO está
permitido.

#### Scenario: Un ADMINISTRADOR resetea a un usuario de su tenant

- GIVEN un usuario con membresía activa en el cliente A
- WHEN un ADMINISTRADOR del cliente A establece una contraseña nueva para ese
  usuario
- THEN la operación reporta éxito
- AND el usuario puede loguearse con la contraseña nueva

#### Scenario: Un ROOT resetea en cualquier tenant al que acceda

- GIVEN un usuario con membresía activa en el cliente B
- WHEN un actor con `is_global_admin: true` establece una contraseña nueva
  para ese usuario dentro del contexto del cliente B
- THEN la operación reporta éxito
- AND el usuario puede loguearse con la contraseña nueva

### Requirement: El aislamiento de tenant nunca filtra existencia

El sistema DEBE resolver la membresía activa del destino por
`(usuarioId, actor.cliente_id)` ANTES de tocar `passwordHash`, como
`EditarUsuarioTenantUseCase` (`editar-usuario-tenant.use-case.ts:52-62`). Sin
membresía activa en el tenant del actor, el sistema DEBE devolver el MISMO
error tanto si el usuario no existe como si su única membresía activa está
en otro tenant.

#### Scenario: Usuario con membresía en otro tenant recibe el mismo error que uno inexistente

- GIVEN un usuario cuya única membresía activa está en el cliente B
- WHEN un ADMINISTRADOR del cliente A intenta establecerle una contraseña
- THEN el sistema rechaza con el mismo error que usa para un `usuarioId`
  inexistente
- AND `passwordHash` no se modifica

#### Scenario: Usuario inexistente recibe el mismo error que uno de otro tenant

- GIVEN un `usuarioId` que no corresponde a ningún usuario
- WHEN un ADMINISTRADOR de un tenant intenta establecerle una contraseña
- THEN el sistema rechaza con el mismo error del escenario anterior

### Requirement: Un actor sin rol de administración es rechazado

El sistema DEBE rechazar la operación con 403 cuando el actor no cumple
`esAdminDeCliente(actor)`, sin importar si el usuario destino existe o tiene
membresía activa en el tenant.

#### Scenario: TECNICO sin esAdminDeCliente es rechazado

- GIVEN un actor con rol TECNICO en su membresía activa
- WHEN intenta establecer una contraseña para otro usuario del mismo tenant
- THEN el sistema responde 403
- AND `passwordHash` del destino no se modifica

#### Scenario: SOLICITANTE sin esAdminDeCliente es rechazado

- GIVEN un actor con rol SOLICITANTE en su membresía activa
- WHEN intenta establecer una contraseña para otro usuario del mismo tenant
- THEN el sistema responde 403

### Requirement: Sin restricciones adicionales de administrador a administrador

El sistema NO DEBE agregar restricción de auto-reset ni de admin-a-admin: un
ADMINISTRADOR PUEDE resetear a otro ADMINISTRADOR del mismo tenant, y PUEDE
resetear la suya propia, igual que `PATCH /:id/rol`, `PATCH /:id` y
`DELETE /:id/membresia` ya se comportan hoy.

#### Scenario: Un ADMINISTRADOR resetea a otro ADMINISTRADOR del mismo tenant

- GIVEN dos usuarios con rol ADMINISTRADOR y membresía activa en el mismo
  cliente
- WHEN uno establece una contraseña nueva para el otro
- THEN la operación reporta éxito

#### Scenario: Un ADMINISTRADOR resetea su propia contraseña por esta vía

- GIVEN un ADMINISTRADOR con membresía activa en su cliente
- WHEN establece una contraseña nueva para su propio `usuarioId`
- THEN la operación reporta éxito

### Requirement: El campo de contraseña vacío no modifica la contraseña

El sistema DEBE tratar un campo de contraseña vacío u omitido como "no
cambiar la contraseña": la edición de identidad (`nombre`/`apellido`) del
mismo diálogo DEBE aplicarse igual, sin tocar `passwordHash`.

#### Scenario: Guardar el diálogo sin escribir contraseña deja la contraseña intacta

- GIVEN un usuario con una contraseña vigente
- WHEN un admin del tenant guarda el diálogo de edición con el campo de
  contraseña vacío y cambia solo el `nombre`
- THEN `nombre` se actualiza
- AND `passwordHash` permanece igual al valor previo

### Requirement: La contraseña nueva respeta el largo mínimo de alta

El sistema DEBE exigir mínimo 8 caracteres para la contraseña nueva, igual
que `crearUsuarioTenantSchema` en el alta (`schemas.ts:28`, `@MinLength(8)`
en el DTO backend de creación).

#### Scenario: Contraseña más corta que el mínimo es rechazada

- GIVEN un admin del tenant completando el campo de contraseña con menos de
  8 caracteres
- WHEN intenta guardar el diálogo
- THEN el sistema rechaza la operación antes de tocar `passwordHash`

### Requirement: Las sesiones del destino se revocan tras un reset exitoso

El sistema DEBE revocar todas las sesiones activas del destino después de
persistir la contraseña nueva, replicando el orden de
`CambiarPasswordUseCase` (`cambiar-password.use-case.ts:74-84`): la
revocación ocurre DESPUÉS de `save()`, nunca antes.

#### Scenario: Reset exitoso revoca las sesiones activas del destino

- GIVEN un usuario destino con sesiones activas
- WHEN un admin del tenant le establece una contraseña nueva
- THEN la operación reporta éxito
- AND las sesiones activas previas del destino quedan revocadas

### Requirement: Un fallo de revocación no hace fallar la respuesta

El sistema NO DEBE propagar un fallo de `revokeAllByUsuarioId()` como error
de la operación: la contraseña ya fue persistida, y reportar fallo mentiría
sobre el estado real de la credencial. El sistema DEBE dejar rastro del
fallo solo vía `logger.error`, sin el plaintext.

#### Scenario: La revocación falla pero la operación igual reporta éxito

- GIVEN que `revokeAllByUsuarioId()` lanza una excepción al ejecutarse
- WHEN un admin del tenant establece una contraseña nueva para el destino
- THEN la operación reporta éxito
- AND `passwordHash` del destino corresponde a la contraseña nueva
- AND el sistema registra el fallo de revocación en el log sin incluir el
  plaintext

### Requirement: No se establece contraseña sobre una cuenta global no disponible

El sistema DEBE rechazar el reset cuando la cuenta global del destino está
inactiva o soft-deleted, con `UsuarioNoDisponibleError`
(`auth.errors.ts:215`), ANTES de tocar `passwordHash`.

La razón no es formal: `LoginUseCase` rechaza a cualquier usuario con
`!usuario.activo || usuario.isDeleted()` antes de siquiera verificar la
contraseña (`login.use-case.ts:111`). Establecer una credencial sobre esa
cuenta reportaría éxito al administrador y dejaría al usuario afuera igual —
la misma forma del incidente documentado en `scripts/reset-password.ts:6-19`,
donde una operación informó éxito sobre una credencial que no servía.

Es el mismo criterio que ya aplica `CambiarPasswordUseCase`, que carga el
usuario y falla con ese error si no existe o no está disponible.

#### Scenario: Reset sobre una cuenta inactiva se rechaza en vez de reportar éxito

- GIVEN un usuario con membresía activa en el tenant del actor pero con su
  cuenta global inactiva o soft-deleted
- WHEN un admin del tenant intenta establecerle una contraseña
- THEN el sistema rechaza la operación con `UsuarioNoDisponibleError`
- AND `passwordHash` no se modifica

### Requirement: El plaintext nunca se expone

El sistema NO DEBE incluir la contraseña en texto plano en la respuesta
HTTP, en ningún mensaje de error, ni en ninguna entrada de log, en ningún
punto del flujo.

#### Scenario: Ninguna superficie observable contiene el plaintext

- GIVEN un admin del tenant que establece una contraseña nueva para un
  destino
- WHEN la operación se ejecuta, sea cual sea su resultado
- THEN el cuerpo de la respuesta no contiene la contraseña en texto plano
- AND ningún mensaje de error la contiene
- AND ninguna línea de log la contiene
