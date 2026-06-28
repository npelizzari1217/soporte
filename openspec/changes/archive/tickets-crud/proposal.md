# Proposal: tickets-crud

**Change**: tickets-crud — CRUD piloto de Tickets + infraestructura compartida de CRUD
**Tipo**: Frontend (Change B) · **Store**: hybrid · **Fecha**: 2026-06-28

## Intent / Why

El frontend tiene lista y detalle de Tickets, pero NINGUNA operación de escritura (el único form es Login, con manejo manual que no escala a 6 campos con 3 Selects). El backend ya expone el CRUD completo end-to-end (crear, editar, borrar). Necesitamos cerrar ese gap AHORA con Tickets como piloto y, en el mismo golpe, construir la **infraestructura de formularios/mutaciones reutilizable** que las otras 3 entidades (Compras, Reparaciones, Catálogos) replicarán. Construir una vez, reusar cuatro.

**Éxito**: un usuario puede crear, editar y borrar tickets desde la UI, con validación por campo, feedback de errores de dominio y confirmación destructiva — y la infra compartida queda lista para clonar.

## What changes

- **Stack nuevo** (instalar): `react-hook-form` + `zod` + `@hookform/resolvers` (validación que espeja el contrato), `sonner` (toasts), `@radix-ui/react-alert-dialog` (confirmación de borrado).
- **Infra compartida** en `@/components/ui` y `/shared` (Scope Rule §2): `<FormField>` (Label uppercase + control + error), `<FormModal>` (Radix Dialog glassmorphism, ESC/click-outside, footer), `<ConfirmDialog>`, `<Toaster>` + helper de toasts, helper de mapeo `ApiError(422)` → feedback de form, convención de hooks de mutación (useCreate/useUpdate/useDelete por entidad).
- **CRUD de Tickets**: schemas Zod por operación, hooks `useCreateTicket/useUpdateTicket/useDeleteTicket` (invalidan `queryKeys.tickets.all`), form de creación y edición sobre `<FormModal>`, borrado con `<ConfirmDialog>`.
- **Solicitante automático**: `solicitanteId = user.sub` del JWT — NO aparece en el form.
- **RBAC en UI** (UX, no seguridad §7): gateo con `useSession().can('ticket:crear'|'ticket:editar'|'ticket:eliminar')`.

## Scope

**In**: Create + Edit + Delete de Tickets; infra compartida reutilizable; validación Zod por operación; mapeo de errores de dominio; permisos en UI; tests Vitest+RTL+MSW (TDD estricto).

**Out**: Transición de estado y asignación (el backend las tiene, pero son operaciones ticket-específicas que NO generalizan a las 4 entidades y dependen de gaps abiertos — mapa `ESTADO_CODIGOS` ausente y endpoint de usuarios para asignar). Van a un follow-up `tickets-operaciones`. Adjuntos. CRUD de Compras/Reparaciones/Catálogos (clonan esta infra después).

## Impact

- Desbloquea escritura de Tickets end-to-end y establece el patrón de forms para todo el proyecto.
- 3 deps nuevas (~ligeras, React 19 ok). Componentes compartidos nuevos en `ui/`.
- `<FormModal>` recomendado sobre página: form de 6 campos (>5 → modal/página dedicada por ui-patterns) abierto desde lista y detalle sin navegación, máxima reutilización × 4 entidades. El stub `/tickets/nueva` se replantea. Decisión final en spec/design.

## Risks

- **Modal vs página**: recomiendo modal premium; el usuario confirma en design.
- **`tipoId` inmutable en edición**: el form de edit NO debe ofrecer `tipoId` ni estado (el contrato PATCH los excluye → 422).
- **Errores sin arrays por campo**: el backend devuelve strings de dominio únicos; el helper debe decidir field-level vs form-level.
- **Replicabilidad**: si la infra queda demasiado acoplada a Tickets, las otras 3 entidades no la reusan — diseñar genérico desde el slice 1.
