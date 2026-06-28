# Archive Report: tickets-crud

**Change**: tickets-crud — CRUD piloto de Tickets + infraestructura compartida de forms/mutaciones
**Tipo**: Frontend (Change B)
**Archivado**: 2026-06-28
**Veredicto final**: PASS — 0 CRITICAL · 4 WARNING (W1 resuelto por orquestador) · 1 SUGGESTION
**Suite**: 350/350 tests · 45 archivos · 0 failures · `next build` limpio (16 rutas)

---

## Resumen ejecutivo

Change completo. El frontend de Tickets tiene ahora Create + Edit + Delete end-to-end con
validación Zod por campo, feedback inline de errores de dominio (422), gateo de permisos
(ticket:crear / ticket:editar / ticket:eliminar), confirmación destructiva y toasts de
resultado. La infraestructura compartida (`<FormField>`, `<FormModal>`, `<ConfirmDialog>`,
`notify`, `mapApiError`) queda lista para replicar a Compras, Reparaciones y Catálogos sin
modificaciones.

La advertencia W1 (5 errores TS de `useForm<any>`) fue corregida por el orquestador antes del
archive: se tipificó con `TicketFormValues` y `next build` compila limpio.

---

## Slices implementados

| Slice | Tareas | Tests | Estado |
|-------|--------|-------|--------|
| **S1 — Infra compartida** | T1.1–T1.8 (8 tareas) | 52 tests | DONE |
| **S2 — Create** | T2.1–T2.4 (4 tareas) | 29 tests | DONE |
| **S3 — Edit** | T3.1–T3.4 (4 tareas) | 26 tests | DONE |
| **S4 — Delete** | T4.1–T4.2 (2 tareas) | 16 tests | DONE |
| **TOTAL** | 18 tareas | 350 tests | DONE |

### S1 — Archivos nuevos (infra compartida)
- `frontend/src/components/ui/textarea.tsx` + `.test.tsx`
- `frontend/src/components/ui/form-field.tsx` + `.test.tsx`
- `frontend/src/components/ui/form-modal.tsx` + `.test.tsx`
- `frontend/src/components/ui/confirm-dialog.tsx` + `.test.tsx`
- `frontend/src/shared/lib/notify.ts` + `.test.ts`
- `frontend/src/shared/lib/map-api-error.ts` + `.test.ts`

### S1 — Archivos modificados
- `frontend/src/components/ui/select.tsx` (+prop `error`)
- `frontend/src/app/layout.tsx` (+`<Toaster>` global)

### S2 — Archivos nuevos (create)
- `frontend/src/features/tickets/schemas.ts` (CreateTicketSchema + CreateTicketInput)
- `frontend/src/features/tickets/schemas.test.ts`
- `frontend/src/features/tickets/hooks/use-create-ticket.ts` + `.test.ts`
- `frontend/src/features/tickets/hooks/use-ticket-form.ts`
- `frontend/src/features/tickets/components/TicketFormModal.tsx` + `.test.tsx`

### S3 — Archivos modificados (edit)
- `frontend/src/features/tickets/schemas.ts` (+UpdateTicketSchema)
- `frontend/src/features/tickets/hooks/use-ticket-form.ts` (modo edit, mapTicketToForm, 404)
- `frontend/src/features/tickets/components/TicketFormModal.tsx` (modo edit)

### S3 — Archivos nuevos
- `frontend/src/features/tickets/hooks/use-update-ticket.ts` + `.test.ts`

### S4 — Archivos nuevos/modificados (delete)
- `frontend/src/features/tickets/hooks/use-delete-ticket.ts` + `.test.ts`
- `frontend/src/features/tickets/components/TicketsList.tsx` (ConfirmDialog, botones gateados)
- `frontend/src/features/tickets/components/TicketsList.test.tsx` (migrado a renderList helper)

---

## Specs promovidas a canónicas

### Nueva capability canónica: `tickets-ui`
**Path**: `openspec/specs/tickets-ui/spec.md`
**Contenido**: Create/Edit/Delete en FormModal, schemas Zod por operación, hooks de mutación,
gateo de permisos RBAC, mapeo ApiError→feedback, delete idempotente vía ConfirmDialog.

**Corrección W3 aplicada**: el scenario "UpdateTicketSchema requiere titulo y prioridadId"
fue eliminado y reemplazado por "UpdateTicketSchema acepta objeto vacío — todos los campos son
opcionales (edición parcial)". La semántica REST PATCH correcta es que el schema es all-optional.
La validación de presencia recae en el formulario que pre-pobla con defaultValues, no en el schema.
Esto refleja la implementación real (tasks T3.1: `safeParse({}) → success: true`) y ADR-en
`design.md §3`.

### Canónica actualizada: `frontend-design-system`
**Path**: `openspec/specs/frontend-design-system/spec.md`
**Adiciones**: `<Textarea>` atom, `<FormField>` wrapper, `<FormModal>` glassmorphism modal,
`<ConfirmDialog>` AlertDialog, `<Toaster>` + helper `notify`, `<Select error>` prop.
Nota sobre S1/a11y: `<FormField>` usa `role="alert"` para el error (correcto para live region)
pero el `aria-describedby` entre el input y el mensaje de error queda como deuda técnica.

### Canónica actualizada: `frontend-ui-states`
**Path**: `openspec/specs/frontend-ui-states/spec.md`
**Adiciones**: tres nuevas secciones de mutation feedback:
1. Mutación exitosa: `invalidateQueries` + toast de éxito
2. Error 422 (dominio): inline banner con `role="alert"`, modal permanece abierto
3. Errores no-422: `notify.error` toast, modal cierra en 404/403

ADR-3 registrado: los efectos UI (toast, reset, cierre de modal) viven en el container hook
(`useTicketForm`), no en el hook de mutación puro — hooks son puros de datos.

---

## Fixes post-verify aplicados antes del archive

| Warning | Estado | Cómo se resolvió |
|---------|--------|------------------|
| **W1** — 5 errores TS `useForm<any>` | RESUELTO | Orquestador tipificó con `TicketFormValues`; `next build` compila limpio (16 rutas) |
| **W2** — `notify.success` en container vs hook | DOCUMENTADO | Registrado como deuda a decidir antes de Compras (ver follow-ups) |
| **W3** — scenario spec incorrecto | CORREGIDO | Scenario reescrito en spec canónica (PATCH parcial, all-optional) |
| **W4** — `TicketsList` no es presentacional puro | DOCUMENTADO | Registrado como deuda a evaluar antes de replicar patrón |
| **S1 a11y** — `aria-describedby` no implementado | DOCUMENTADO | Registrado como deuda técnica de accesibilidad |

---

## Follow-ups registrados (deuda conocida)

### W2 — Convención `notify` en onSuccess del hook vs container
**Qué**: ADR-3 pone el `notify.success` en el container (`useTicketForm`), no en el hook de
mutación puro. El spec ui-states-delta decía que debía estar en el `onSuccess` del hook.
**Por qué importa**: las otras 3 entidades (Compras, Reparaciones, Catálogos) replicarán este
patrón. Si el equipo cambia a "notify en el hook", hay que moverlo antes de establecer la
convención.
**Acción**: decidir y documentar la convención ANTES de implementar `useCreateCompra` etc.

### W4 — `TicketsList` dejó de ser presentacional puro
**Qué**: `TicketsList` ahora llama `useDeleteTicket()`, mantiene `useState(confirmId)` y
monta `<ConfirmDialog>`. Rompe el modelo container/presentational original.
**Alternativa**: elevar el estado de delete a `TicketsPage` (container) y pasar
`onDelete`, `confirmId`, `setConfirmId`, `isPending` como props.
**Acción**: evaluar antes de replicar el patrón a Compras. Si el equipo acepta el modelo
"el list-component posee el confirm dialog", documentarlo como convención.

### S1 a11y — `<FormField>` sin `aria-describedby`
**Qué**: `<FormField>` emite `<p role="alert">` para el error pero no genera un `id` ni lo
conecta con `aria-describedby` al control hijo. Screen readers en modo formulario pueden no
escuchar el error al llegar al campo.
**Acción**: añadir `id` generado al `<p>` de error y pasar `aria-describedby` al control hijo
vía `cloneElement` o context, antes del primer PR de Compras.

### Deuda TS pre-existente — 28 errores en shell + layout.test.tsx
**Qué**: 28 errores TypeScript pre-existentes en `frontend-shell` (anteriores a este change),
incluyendo errores `vi.fn<[],T>` en test files de shell. No bloquean `next build`.
**Acción**: limpieza pendiente en un change separado; no relacionado con tickets-crud.

### tickets-operaciones (follow-up recomendado)
**Qué**: UI de transición de estado + asignación de tickets.
**Por qué bloqueado actualmente**: falta el mapa `ESTADO_CODIGOS` (UUID→código semántico) en
`catalogos.ts` y el endpoint de usuarios para asignación.
**Acción**: diseñar como `tickets-operaciones` una vez que esos gaps se cubran en el backend.

### Replicar CRUD a Compras, Reparaciones, Equipos
**Qué**: las 3 entidades reutilizan la infra compartida construida aquí.
**Prerequisito**: verificar qué soporta el backend de cada una (no asumir que tienen
PATCH/:id y DELETE análogos a tickets — el explore de tickets-crud reveló que el backend puede
tener gaps, ver `explore.md §1`).
**Acción**: hacer un `sdd-explore` por entidad antes de proponer el change de CRUD.

---

## Traceability — Observation IDs

| Artefacto | Backend | Nota |
|-----------|---------|------|
| proposal | Engram #1518 + `openspec/changes/archive/tickets-crud/proposal.md` | hybrid |
| spec (tickets-ui delta) | `openspec/changes/archive/tickets-crud/specs/tickets-ui/spec.md` | openspec |
| spec (design-system-delta) | `openspec/changes/archive/tickets-crud/specs/design-system-delta/spec.md` | openspec |
| spec (ui-states-delta) | `openspec/changes/archive/tickets-crud/specs/ui-states-delta/spec.md` | openspec |
| design | `openspec/changes/archive/tickets-crud/design.md` | openspec |
| tasks | `openspec/changes/archive/tickets-crud/tasks.md` | openspec |
| apply-progress | `openspec/changes/archive/tickets-crud/apply-progress.md` | openspec |
| verify-report | `openspec/changes/archive/tickets-crud/verify-report.md` | openspec |
| archive-report | Engram (sdd/tickets-crud/archive-report) + este archivo | hybrid |
