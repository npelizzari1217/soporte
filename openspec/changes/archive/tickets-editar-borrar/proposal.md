# Proposal: tickets-editar-borrar (Change A — BACKEND)

## Intent / Why
El backend de tickets soporta crear, transicionar estado y asignar, pero NO permite
editar campos de datos ni dar de baja un ticket. El frontend del CRUD (Change B
`tickets-crud`) necesita estos dos endpoints para ser construido. Este change completa
el CRUD del lado servidor respetando Clean Arch, multi-tenant y soft-delete universal.
Éxito = `PATCH /tickets/:id` y `DELETE /tickets/:id` operativos, con permisos, auditoría
y exclusión de soft-deleted, todo bajo TDD estricto.

## What changes
1. **Dominio**: agregar a `TicketEntity` un método de mutación de datos (ej. `updateDatos({titulo, descripcion, prioridadId, tipoId, cicloId, fechaVencimiento})`) con invariante de edición (rechaza si `isDeleted()` o estado terminal). La entidad YA extiende `BaseEntity` → `softDelete()`/`isDeleted()` existen. Nuevos `DomainError`: `TicketEliminadoError`, `TicketNoEditableError` (estado terminal).
2. **Aplicación**: `EditarTicketUseCase` (carga, valida tenant + invariantes, `updateDatos`, `save`) y `EliminarTicketUseCase` (carga, idempotencia anti doble-borrado vía `isDeleted()`, `softDelete()` + `save()`). Opcionalmente registran `OperacionTicket` (trail) en la misma transacción — ver decisión abierta.
3. **Interface**: endpoints `PATCH /tickets/:id` (`@RequirePermissions('ticket:editar')`) y `DELETE /tickets/:id` (`@RequirePermissions('ticket:eliminar')`), nuevo `UpdateTicketHttpDto` (interfaz plana, sin class-validator, todos los campos opcionales), mapeo de errores de dominio a HTTP (404 / 409 idempotencia / 422 terminal).
4. **Infra/Permisos**: el puerto `ITicketRepository` YA tiene `save` (upsert) y `delete` (soft); `findAll`/`findByEstado` YA filtran `deletedAt: null`. Nueva migración master que agrega `ticket:editar` y `ticket:eliminar` al seed RBAC (UUIDs deterministas b0000000…012/013) y los mapea a ADMIN (+ SOPORTE_IT, a confirmar en design).

## Scope
**In**: dominio→aplicación→infra→interface para editar (campos de datos) y soft-delete; permisos nuevos + asignación a roles; auditoría en edit/delete (a confirmar en design); tests TDD (Jest, RED→GREEN). Slices auto-chain < 400 líneas: (a) edit, (b) delete, (c) permisos+seed.
**Out**: frontend (Change B `tickets-crud`); transición de estado y asignación (ya existen); edición de `estado`/`solicitanteId`/`autorId`/`clienteId`/`anio`; las otras 3 entidades (Equipos/Compras/Reparaciones).

## Impact
- Archivos: `ticket.entity.ts`, `tickets.errors.ts`, 2 use cases nuevos, `tickets.controller.ts`, `tickets.dto.ts`, `tickets.module.ts`, nueva migración `prisma_master/migrations`. El puerto/repo NO requieren cambios estructurales (ya soportan save/soft-delete).
- Multi-tenant (§7): edit/delete operan sobre el tenant activo vía `TenantContext`; sin fuga cross-tenant (el repo ya está scopeado).

## Risks / Open questions
- **Estados terminales**: ¿rechazar edición Y borrado en CERRADO/CANCELADO, o solo edición? Recomendado: edición rechazada en terminal; borrado permitido. → spec/design.
- **Auditoría**: registrar `OperacionTicket` en edit/delete requiere nuevos `tipo_operacion` (EDICION/ELIMINACION) en el catálogo + seeding. Recomendado: sí (consistencia con el trail). Tensiona scope → decisión de design.
- **Idempotencia delete**: el `repo.delete()` actual NO es idempotente; el use case debe cargar y chequear `isDeleted()` antes de re-borrar (409/no-op).
- **Roles destino** de los permisos nuevos (¿solo ADMIN o también SOPORTE_IT?) → design.
