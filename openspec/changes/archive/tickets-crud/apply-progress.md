# Apply Progress: tickets-crud — S1+S2+S3+S4 DONE ✓ CHANGE COMPLETO

**Batch**: S1 (Infra compartida) + S2 (Create) + S3 (Edit) + S4 (Delete)
**Status**: FRONTEND COMPLETO — T1.1–T1.8 + T2.1–T2.4 + T3.1–T3.4 + T4.1–T4.2 (0 regressions)
**Date**: 2026-06-28
**Runner**: Vitest + RTL + MSW, `frontend/` root
**Suite**: 45 test files, 350 tests, 0 failures

---

## Tasks completadas (S1)

- [x] **T1.1** — Instalación deps + verificación compat React 19.1
- [x] **T1.2** — `<Textarea>` atom (10 tests GREEN)
- [x] **T1.3** — `<FormField>` atom (8 tests GREEN)
- [x] **T1.4** — `<FormModal>` sobre Radix Dialog (9 tests GREEN)
- [x] **T1.5** — `<ConfirmDialog>` sobre Radix AlertDialog (12 tests GREEN)
- [x] **T1.6** — `notify` helper + `<Toaster>` en root layout (3+1 tests GREEN)
- [x] **T1.7** — `mapApiError` helper (9 tests GREEN)
- [x] **T1.8** — Extender `<Select>` con prop `error` (2 tests nuevos GREEN; 8 total)

## Tasks completadas (S2)

- [x] **T2.1** — `CreateTicketSchema` (zod) (8 tests GREEN)
- [x] **T2.2** — `useCreateTicket` hook (6 tests GREEN, MSW)
- [x] **T2.3** — Botón "Nuevo ticket" gateado en `TicketsList` (3 tests nuevos GREEN)
- [x] **T2.4** — `TicketFormModal` (create) + `useTicketForm('create')` (12 tests GREEN, MSW)

## Tasks completadas (S3)

- [x] **T3.1** — `UpdateTicketSchema` (zod, parcial, sin tipoId/estado) (7 tests nuevos GREEN; 15 total en schemas.test.ts)
- [x] **T3.2** — `useUpdateTicket` hook (6 tests GREEN, MSW PATCH)
- [x] **T3.3** — Botón "Editar" gateado en `TicketsList` (3 tests nuevos GREEN; 15 total)
- [x] **T3.4** — Edit mode en `TicketFormModal` + `useTicketForm('edit')` (10 tests nuevos GREEN; 22 total en TicketFormModal.test.tsx)

## Tasks completadas (S4)

- [x] **T4.1** — `useDeleteTicket` hook (6 tests GREEN, MSW DELETE 204)
- [x] **T4.2** — Botón "Borrar" gateado + `ConfirmDialog` wiring en `TicketsList` (10 tests nuevos GREEN; 25 total en TicketsList.test.tsx)

---

## Deps verificadas (S1)

| Package | Versión instalada | React 19.1 compat |
|---------|-------------------|-------------------|
| react-hook-form | ^7.80.0 | OK |
| zod | ^3.25.76 | OK |
| @hookform/resolvers | ^3.10.0 | OK |
| sonner | ^1.7.4 | OK |
| @radix-ui/react-alert-dialog | ^1.1.17 | OK |
| @radix-ui/react-dialog | ^1.1.17 | OK |

---

## Archivos creados / modificados

### S1 (infra)

**Nuevos (S1):**
- `frontend/src/components/ui/textarea.tsx`
- `frontend/src/components/ui/textarea.test.tsx`
- `frontend/src/components/ui/form-field.tsx`
- `frontend/src/components/ui/form-field.test.tsx`
- `frontend/src/components/ui/form-modal.tsx`
- `frontend/src/components/ui/form-modal.test.tsx`
- `frontend/src/components/ui/confirm-dialog.tsx`
- `frontend/src/components/ui/confirm-dialog.test.tsx`
- `frontend/src/shared/lib/notify.ts`
- `frontend/src/shared/lib/notify.test.ts`
- `frontend/src/shared/lib/map-api-error.ts`
- `frontend/src/shared/lib/map-api-error.test.ts`

**Modificados (S1):**
- `frontend/src/components/ui/select.tsx` (+5 líneas: prop `error`)
- `frontend/src/components/ui/select.test.tsx` (+10 líneas: 2 nuevos tests)
- `frontend/src/app/layout.tsx` (+8 líneas: Toaster)
- `frontend/src/app/layout.test.tsx` (+18 líneas: Toaster tests)

### S2 (create)

**Nuevos (S2):**
- `frontend/src/features/tickets/schemas.ts` (CreateTicketSchema + types)
- `frontend/src/features/tickets/schemas.test.ts` (8 tests CreateTicketSchema)
- `frontend/src/features/tickets/hooks/use-create-ticket.ts`
- `frontend/src/features/tickets/hooks/use-create-ticket.test.ts` (6 tests)
- `frontend/src/features/tickets/hooks/use-ticket-form.ts`
- `frontend/src/features/tickets/components/TicketFormModal.tsx`
- `frontend/src/features/tickets/components/TicketFormModal.test.tsx` (12 tests create)

**Modificados (S2):**
- `frontend/src/features/tickets/components/TicketsList.tsx` (+onOpenCreate prop + gate)
- `frontend/src/features/tickets/components/TicketsList.test.tsx` (+3 tests T2.3)
- `frontend/src/components/ui/select.tsx` (+aria-label + id props)

### S3 (edit)

**Modificados (S3):**
- `frontend/src/features/tickets/schemas.ts` (+UpdateTicketSchema + UpdateTicketInput)
- `frontend/src/features/tickets/schemas.test.ts` (+7 tests UpdateTicketSchema; 15 total)
- `frontend/src/features/tickets/hooks/use-ticket-form.ts` (extendido para mode='edit'; mapTicketToForm; 404 handling)
- `frontend/src/features/tickets/components/TicketFormModal.tsx` (extendido: mode='edit', omits tipoId, defaultValues, "Guardar" label)
- `frontend/src/features/tickets/components/TicketFormModal.test.tsx` (+10 tests edit mode; 22 total)
- `frontend/src/features/tickets/components/TicketsList.tsx` (+onOpenEdit prop + Editar button + Pencil icon)
- `frontend/src/features/tickets/components/TicketsList.test.tsx` (+3 tests T3.3; 15 total)

**Nuevos (S3):**
- `frontend/src/features/tickets/hooks/use-update-ticket.ts`
- `frontend/src/features/tickets/hooks/use-update-ticket.test.ts` (6 tests)

### S4 (delete) — COMPLETADO 2026-06-28

**Nuevos (S4):**
- `frontend/src/features/tickets/hooks/use-delete-ticket.ts`
- `frontend/src/features/tickets/hooks/use-delete-ticket.test.ts` (6 tests, TDD RED→GREEN)

**Modificados (S4):**
- `frontend/src/features/tickets/components/TicketsList.tsx`
  (+useDeleteTicket + useState confirmId + ConfirmDialog + Borrar button + handleDelete)
  (+imports: useState, ConfirmDialog, notify, mapApiError, Trash2, useDeleteTicket)
- `frontend/src/features/tickets/components/TicketsList.test.tsx`
  (refactored: all renders updated to include QueryClientProvider via renderList helper)
  (+10 tests T4.2; 25 total in file)

---

## Notas de implementación (S4)

### useDeleteTicket — 204 sin body
`apiFetch<void>` con `method: 'DELETE'` → `normalize.ts` detecta `res.status === 204` y retorna `undefined as T` sin intentar parsear el body. La mutación resuelve con `undefined`, no lanza error. El tipo `void` en el genérico refleja esto correctamente.

### Idempotencia 204
El backend retorna 204 tanto para tickets que existen como para tickets ya eliminados. La lógica del hook no distingue: en ambos casos `onSuccess` invalida `queryKeys.tickets.all` y la UI se actualiza.

### ConfirmDialog wiring — e.preventDefault() en Action
`ConfirmDialog` ya implementa `e.preventDefault()` en el botón de confirmar (S1/T1.5), evitando el cierre automático de Radix AlertDialog. El caller (`TicketsList`) controla el estado `open` a través de `confirmId`. El dialog cierra solo cuando `confirmId` se limpia (onSuccess), no al click.

### Dialog permanece abierto en error (retry UX)
En `handleDelete`, el `catch` llama `notify.error(mapApiError(err))` pero NO limpia `confirmId`. Esto mantiene el dialog abierto, permitiendo al usuario reintentar o cancelar manualmente.

### TicketsList — migración a QueryClientProvider en tests
Al agregar `useDeleteTicket()` (que llama `useQueryClient()` internamente), todos los tests de TicketsList requieren un `QueryClientProvider`. Se creó el helper `renderList()` que siempre incluye QueryClientProvider y opcionalmente SessionProvider, simplificando todos los `render()` calls. Los 15 tests existentes se actualizaron para usar este helper sin cambiar sus assertions.

---

## Notas de implementación (S3)

### UpdateTicketSchema — exclusión de tipoId/estado
`UpdateTicketSchema` usa Zod con `.strip()` por defecto: si el caller pasa `tipoId` por error, Zod lo elimina silenciosamente antes de serializar el body. Esto previene errores 422 del backend (que rechaza PATCH con tipoId).

### useTicketForm — extensión a mode='edit'
Sigue las Rules of Hooks: ambas mutaciones (`useCreateTicket` y `useUpdateTicket`) se llaman siempre incondicionalmente; solo se usa la correspondiente al modo. El formulario usa `useForm<any>` con `zodResolver(UpdateTicketSchema)` en edit mode.

El manejo de 404 en edit mode es diferenciado: cierra el modal y llama `invalidateQueries` (en lugar de mostrar un banner), porque el ticket ya no existe y la fila debe desaparecer de la lista.

### TicketFormModal — tipoId omitido en edit mode
El campo tipoId se renderiza condicionalmente (`!isEdit`). El form de edición no tiene Select de Tipo ni campo de Estado. El botón de submit muestra "Guardar" en edit mode y "Crear" en create mode.

### TicketsList — Editar button
El botón usa `variant="ghost" size="icon"` con ícono `Pencil` (lucide-react) y `aria-label="Editar ticket"`. Gateado por `can('ticket:editar')`. El `e.stopPropagation()` previene que el click del botón se propague al CardRow (si fuera interactivo).

---

## Notas de implementación (S2)

### solicitanteId — confirmación ADR-6
`solicitanteId = user?.sub` se inyecta en `useTicketForm.onSubmit()` al construir el DTO. NO aparece en `CreateTicketSchema`.

### Select aria-label (extensión menor Select)
Radix Select Trigger requiere `aria-label` para que RTL resuelva `getByRole('combobox', { name: /tipo/i })`.

### useTicketForm — container puro
El hook orquesta: `useForm` + `zodResolver` → mutación → `notify` → `reset` → `onClose`.

---

## Tasks pendientes

Ninguna. CHANGE FRONTEND COMPLETO.
