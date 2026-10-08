# Auth 2FA Política por Cliente — Specification

## Purpose

Definir la política "exigir 2FA" de cada cliente, a cargo de su ADMINISTRADOR, y su efecto sobre los usuarios y las sesiones abiertas.

> **Decisión de producto citada.** `docs/roadmap-comercial.md`, "Decisiones de producto de la segunda etapa", viñeta "Segunda etapa, punto 5 — verificación en dos pasos (2FA)": viñeta del ADMINISTRADOR que lo exige para su cliente y precisión sobre las sesiones abiertas. Trazabilidad completa en `auth-2fa-totp`.

## Requirements

### Requirement: C1 El ADMINISTRADOR exige 2FA para su cliente

Un actor con `esAdminDeCliente` (ADMINISTRADOR del cliente, o ROOT en el contexto de ese cliente) DEBE poder activar y desactivar "exigir 2FA" sobre SU cliente. El cliente afectado DEBE salir del contexto del actor y nunca de un parámetro del cuerpo.

#### Scenario: Activar la política

- GIVEN un ADMINISTRADOR del cliente A
- WHEN activa "exigir 2FA"
- THEN el cliente A queda con la política activa

#### Scenario: No puede tocar otro cliente

- GIVEN un ADMINISTRADOR del cliente A
- WHEN intenta cambiar la política enviando el id del cliente B
- THEN no se modifica B; solo A es afectable

### Requirement: C2 Autorización y valor por defecto

La política DEBE estar desactivada por defecto en todos los clientes, incluidos los existentes. Un actor sin rol de administración DEBE recibir 403.

#### Scenario: Cliente existente

- GIVEN clientes anteriores al cambio
- WHEN se aplica la migración
- THEN todos tienen la política desactivada

#### Scenario: Actor no administrador

- GIVEN un TECNICO o SOLICITANTE
- WHEN intenta cambiar la política
- THEN el sistema responde 403 y nada cambia

### Requirement: C3 Efecto sobre los usuarios, también en otros clientes

Con la política activa, todo usuario con una membresía activa en ese cliente DEBE quedar obligado a tener 2FA al entrar a CUALQUIER cliente suyo. Si no lo tiene configurado, se aplica la configuración forzada de `auth-2fa-login` (L5).

#### Scenario: Usuario en varios clientes

- GIVEN un usuario con membresías en A y B, y A exige 2FA
- WHEN hace login y elige B
- THEN se le pidió el segundo paso

#### Scenario: Usuario sin 2FA configurado

- GIVEN un usuario sin 2FA y miembro de un cliente que exige
- WHEN supera la contraseña
- THEN se lo fuerza a configurarlo antes de seguir

### Requirement: C4 Las sesiones abiertas siguen hasta vencer

Activar la política NO DEBE revocar ni degradar sesiones abiertas: el 2FA se pide en el próximo login.

#### Scenario: Sesión abierta al activar

- GIVEN un usuario sin 2FA con una sesión abierta en A
- WHEN el ADMINISTRADOR activa "exigir 2FA"
- THEN su sesión y su refresh siguen funcionando hasta que venzan, y su próximo login exige configurarlo

### Requirement: C5 Desactivar la política quita la obligación, no el 2FA

Al desactivar la política, los usuarios que solo estaban obligados por ella DEJAN de estarlo, pero un 2FA ya activo NO DEBE borrarse.

#### Scenario: Se desactiva la política

- GIVEN un usuario con 2FA activo cuya única obligación venía de A
- WHEN A desactiva la política
- THEN su 2FA sigue activo, le sigue pidiendo código y ahora puede desactivarlo
