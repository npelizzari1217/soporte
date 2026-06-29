# Proposal — tickets-maquina-estados-observaciones (Change A)

## Intent

Reemplazar la máquina de estados base de tickets (4 estados legacy) por el flujo de negocio real de 7 estados, incorporar las **observaciones del técnico** como disparador de transición, endurecer el bloqueo por estado y **cerrar un bug de seguridad activo**. Es el Change A del split; Change B (RBAC 4 roles + multi-tenant admin) va después.

## Why now

`PATCH /tickets/:id/estado` **NO tiene `@RequirePermissions`** (controller:336): cualquier usuario autenticado transiciona cualquier ticket a cualquier estado. Es un fallo de menor privilegio (CONSTITUCIÓN §7) en producción. Además el dominio modela un flujo que ya no existe (ABIERTO→EN_PROGRESO→RESUELTO→CERRADO con reapertura), divergente del proceso real aprobado. Postergar acopla la deuda de seguridad al RBAC completo.

## Success

- Las 7 transiciones válidas (y solo esas) se aceptan; terminales = RESUELTO/SIN_SOLUCION/RECHAZADO.
- El técnico crea una observación y el ticket auto-transiciona desde APROBADO en la misma transacción.
- Ningún endpoint de mutación de estado queda sin guard de permiso.
- Editar/borrar solo en ABIERTO. Observaciones bloqueadas en cerrados.
- `fechaCierre` se setea en los 3 terminales. Suite verde (RED→GREEN).

## Scope

**IN:** máquina 7 estados (`VALID_TRANSITIONS`); catálogo tenant SUSPENDIDO/SIN_SOLUCION + congelar CERRADO/CANCELADO/PENDIENTE_APROBACION; `tipo_operacion` OBSERVACION + `CrearObservacionUseCase` + `POST /tickets/:id/observaciones`; `TERMINAL_STATES` nuevo, `canEdit`/`canDelete`, validación en `EliminarTicketUseCase`; `@RequirePermissions` granulares (`ticket:aprobar`, `ticket:rechazar`, `ticket:transicionar`, `ticket:observar`); **siembra mínima** de esos permisos a los roles actuales; rename `fechaResolucion→fechaCierre` + borrado del dead code de reapertura.

**OUT:** los 4 roles nuevos, jerarquía acumulada, `is_global_admin`/multi-tenant admin, migración de usuarios → **Change B**. Migración de datos de tickets CERRADO/CANCELADO (se congelan).

## Approach

- **Dominio:** reescribir `VALID_TRANSITIONS` (7 estados); `TERMINAL_STATES`={RESUELTO,SIN_SOLUCION,RECHAZADO}; `canEdit`→solo ABIERTO; nuevo `canDelete()`. Sin imports externos (clean-arch). Reglas devuelven `Result`.
- **Aplicación:** `CrearObservacionUseCase` (transacción: crea OBSERVACION y, si APROBADO, transiciona a EN_PROGRESO o al estado superior elegido); `EliminarTicketUseCase` carga estado y valida `canDelete`; quitar branch de reapertura/`fechaResolucion=null`.
- **Infra:** seeds tenant (catálogo + OBSERVACION f0…009); migración idempotente `RENAME COLUMN fechaResolucion→fechaCierre`; siembra mínima de permisos.
- **Interface:** `@RequirePermissions` por arco en `transicionarEstado`; nuevo controller de observaciones.

## Dependencia (resuelta) — recomendación

**Change A incluye siembra mínima de los permisos granulares asignados a los roles actuales.** Deny-by-default dejaría a TODOS sin `ticket:*` (ningún rol los tiene aún) → el fix de seguridad se volvería un *denial-of-service* del flujo y no sería testeable. Con la siembra, A es shippable y verificable solo; B luego redistribuye permisos a los 4 roles. Recomendado: **siembra mínima**.

## Slicing — PRs encadenados (auto-chain, <400 líneas c/u)

- **PR1:** máquina 7 estados + catálogo + `TERMINAL_STATES`/`canEdit`/`canDelete` + bloqueo en `EliminarTicketUseCase`.
- **PR2:** OBSERVACION + `CrearObservacionUseCase` + auto-transición + `POST /observaciones`.
- **PR3:** `@RequirePermissions` granulares + siembra mínima permisos + rename `fechaCierre` + borrado dead code de reapertura.

## Riesgos

- `base-ticket-state-machine.spec.ts` y otros tests van a RED al cambiar el diagrama — reescribir (RED→GREEN), no borrar sin justificar.
- Dead code de reapertura (RESUELTO terminal) en `TransicionarEstadoUseCase` — eliminar con cuidado de regresión.
- Migración `fechaCierre` debe correr en TODAS las tenant DBs idempotente (`RENAME COLUMN`, guard `IF EXISTS`).
- Acoplamiento con Change B: los códigos de permiso sembrados acá deben coincidir exactos con los que B redistribuye.
- Catálogos congelados: tickets en CERRADO/CANCELADO quedan no transitables (dead data conocido y aceptado).
