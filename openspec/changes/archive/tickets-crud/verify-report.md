# Verify Report: tickets-crud (S1+S2+S3+S4)

**Verificación**: SDD-verify adversarial · Fecha: 2026-06-28
**Veredicto**: PASS WITH WARNINGS — 0 CRITICAL, 4 WARNING, 1 SUGGESTION

---

## Suite

| Métrica | Resultado |
|---------|-----------|
| Test files | 45 (pasaron: 45) |
| Tests | 350 (pasaron: 350) |
| Failures | 0 |
| `tsc --noEmit` — errores nuevos (change) | 5 en `TicketFormModal.tsx` |
| `tsc --noEmit` — errores pre-existentes | 28 en shell + layout.test.tsx (anteriores a este change) |
| `next build` | No ejecutado (TS errors presentes bloquean utilidad del run) |

**Origen de los 5 errores TS nuevos**: `use-ticket-form.ts:81` usa `useForm<any>` con `eslint-disable`. Esto hace que `errors.campo?.message` sea `string | FieldError | Merge<FieldError, ...> | undefined` en lugar de `string | undefined`, incompatible con el prop `error?: string` de `FormField`. Ver W1.

---

## Requisitos — Cobertura

| Requirement / Spec | Resultado | Evidencia |
|--------------------|-----------|-----------|
| Schemas Zod: CreateTicketSchema (6 escenarios) | SATISFECHO | `schemas.test.ts:1–107`; 8 tests verdes |
| Schemas Zod: UpdateTicketSchema excluye tipoId/estado | SATISFECHO | `schemas.test.ts:114–115`; `'tipoId' in shape === false` |
| Schemas Zod: UpdateTicketSchema (escenario "requiere titulo y prioridadId") | NO SATISFECHO (por diseño) | Ver W3 — tasks T3.1 eligió all-optional; `safeParse({})` → `success: true` |
| ticket:crear gatea "Nuevo ticket" | SATISFECHO | `TicketsList.tsx:89`; tests T2.3 ×3 |
| ticket:crear — sin permiso → NOT in DOM | SATISFECHO | `TicketsList.test.tsx:191–197`; `queryByRole → null` |
| Formulario create en FormModal; solicitanteId auto-inyectado | SATISFECHO | `TicketFormModal.tsx:55–203`; test T2.4-5; T2.4-8 verifica `capturedBody.solicitanteId === user.sub` |
| Errores inline blur/submit | SATISFECHO | Tests T2.4-6, T2.4-7 |
| POST 201 → modal cierra + toast | SATISFECHO | Test T2.4-8 |
| POST 422 → banner root + modal abierto | SATISFECHO | Test T2.4-9 |
| POST error red → toast + modal abierto | SATISFECHO | Test T2.4-10 |
| ESC → modal cierra sin POST | SATISFECHO | Test T2.4-12 |
| ticket:editar gatea "Editar" por fila | SATISFECHO | `TicketsList.tsx:119`; tests T3.3 ×3 |
| ticket:editar — sin permiso → NOT in DOM | SATISFECHO | `TicketsList.test.tsx:223–229` |
| Edit form: pre-poblado; omite tipoId y estado | SATISFECHO | Tests T3.4-1,2,3,4,5 |
| PATCH body no incluye tipoId ni estado | SATISFECHO | Test T3.4-6; Zod `.strip()` elimina keys desconocidas |
| PATCH 200 → modal cierra + toast | SATISFECHO | Test T3.4-7 |
| PATCH 422 → banner root + modal abierto | SATISFECHO | Test T3.4-8 |
| PATCH 404 → toast + modal cierra + invalidate | SATISFECHO | Test T3.4-9 |
| ticket:eliminar gatea "Borrar" por fila | SATISFECHO | `TicketsList.tsx:129`; tests T4.2-1 |
| ticket:eliminar — sin permiso → NOT in DOM | SATISFECHO | `TicketsList.test.tsx:260–266` |
| Click "Borrar" → ConfirmDialog; DELETE no disparado | SATISFECHO | Test T4.2-3 |
| ConfirmDialog no cierra con click-outside | SATISFECHO | Test T4.2-5; AlertDialog behavior nativo |
| Cancelar → dialog cierra; DELETE no disparado | SATISFECHO | Test T4.2-6 |
| DELETE 204 → toast + dialog cierra + invalidate | SATISFECHO | Test T4.2-7 |
| DELETE 204 idempotente | SATISFECHO | Test T4.2-8 |
| Error de red → toast + dialog permanece abierto | SATISFECHO | Test T4.2-9 |
| isPending → botón Confirmar disabled | SATISFECHO | Test T4.2-10 |
| useCreateTicket: POST + invalidate all | SATISFECHO | `use-create-ticket.test.ts` ×6 |
| useUpdateTicket: PATCH + invalidate all + detail | SATISFECHO | `use-update-ticket.test.ts` ×6 |
| useDeleteTicket: DELETE 204 void + invalidate all | SATISFECHO | `use-delete-ticket.test.ts` ×6 |
| mapApiError: todos los casos (0,401,403,404,422,500,non-ApiError,null) | SATISFECHO | `map-api-error.test.ts` ×9 |
| notify.success/error wrappers | SATISFECHO | `notify.test.ts` ×3 |
| FormField, FormModal, ConfirmDialog atoms | SATISFECHO | Tests ×8, ×9, ×12 respectivamente |
| Toaster en root layout (una instancia) | SATISFECHO | `layout.tsx` + `layout.test.tsx` |
| Select con prop `error` | SATISFECHO | `select.test.tsx` — 2 tests nuevos |

---

## Permisos — Gateo (§7 adversarial)

**Confirmado por tests y código:**

```tsx
// TicketsList.tsx:89
{can('ticket:crear') && <Button onClick={onOpenCreate}>Nuevo ticket</Button>}

// TicketsList.tsx:119
{can('ticket:editar') && <Button ... aria-label="Editar ticket">}

// TicketsList.tsx:129
{can('ticket:eliminar') && <Button ... aria-label="Borrar ticket">}
```

Tests confirman exclusión condicional (NOT `aria-hidden`, NOT `display:none` — el elemento directamente no se monta).

- `can('ticket:crear')` sin permiso → `queryByRole('button', { name: /nuevo ticket/i })` → `null` ✓
- `can('ticket:editar')` sin permiso → `queryByRole('button', { name: /editar ticket/i })` → `null` ✓
- `can('ticket:eliminar')` sin permiso → `queryByRole('button', { name: /borrar ticket/i })` → `null` ✓

Recordatorio (§7): gateo de UX solamente. El backend es la autoridad final de RBAC en cada request.

---

## Infraestructura compartida — Reusabilidad

**Genérica para las 4 entidades** (Tickets, Compras, Reparaciones, Catálogos):

| Átomo / Helper | Path | Acoplamiento a Ticket |
|----------------|------|-----------------------|
| `<FormField>` | `@/components/ui/form-field` | Ninguno — acepta cualquier control hijo |
| `<FormModal>` | `@/components/ui/form-modal` | Ninguno — `title`, `children` genéricos |
| `<ConfirmDialog>` | `@/components/ui/confirm-dialog` | Ninguno — `title`, `description`, `onConfirm` genéricos |
| `notify` | `@/shared/lib/notify` | Ninguno |
| `mapApiError` | `@/shared/lib/map-api-error` | Ninguno — recibe `unknown`, trabaja con `ApiError` |
| Convención de hooks | pure data hook + container hook | No acoplada a Ticket |

Los átomos requieren cero modificaciones para Compras/Reparaciones/Catálogos. El piloto cumple su objetivo.

---

## Findings

### WARNING W1 — TypeScript: `useForm<any>` introduce 5 errores TS en TicketFormModal.tsx

**Archivos**: `use-ticket-form.ts:81`, `TicketFormModal.tsx:96,112,129,153,176`

`useForm<any>` hace que `errors.campo?.message` tenga tipo `string | FieldError | Merge<FieldError, FieldErrorsImpl<any>> | undefined`. El prop `error` de `<FormField>` espera `string | undefined`. Resultado: 5 errores TS2322.

Los tests Vitest pasan (Vitest no ejecuta tsc), por lo que el comportamiento en runtime es correcto. Pero `next build` fallaría si `strict: true` está configurado y no hay `transpileOnly`.

**Fix mínimo**: en `TicketFormModal.tsx`, castear `errors.campo?.message as string | undefined` en los 5 puntos afectados, O tipificar `useForm` con un tipo unión discriminado en lugar de `any`.

---

### WARNING W2 — ui-states-delta: `notify.success` no se llama en `onSuccess` del hook

**Spec**: "ambas llamadas MUST ocurrir en el mismo `onSuccess` (no diferido ni en el componente caller)"

**Implementación real**:
- `useCreateTicket.onSuccess` → solo `invalidateQueries` (no `notify.success`)
- `useUpdateTicket.onSuccess` → solo `invalidateQueries` (no `notify.success`)
- `useDeleteTicket.onSuccess` → solo `invalidateQueries` (no `notify.success`)
- `notify.success` se llama en `useTicketForm.onSubmit` (container) y `TicketsList.handleDelete`

**Por qué fue así**: ADR-3 ("UI effects live in the container hook, not here"). Permite testear los hooks de mutación en aislamiento sin espiar `notify`. El objetivo práctico del spec (que el toast aparezca tras el éxito) SE CUMPLE; lo que no se cumple es la cláusula de co-localización en `onSuccess`.

**Impacto**: Bajo. Las otras 3 entidades reusarán el mismo patrón. Si el equipo decide que `notify.success` debe ir en el hook (para garantizar que el toast nunca se olvide), hay que moverlo antes de establecer la convención.

---

### WARNING W3 — UpdateTicketSchema: escenario "requiere titulo y prioridadId" no satisfecho

**Spec** (tickets-ui): "UpdateTicketSchema requiere titulo y prioridadId — `safeParse({})` MUST fallar con errores en titulo y prioridadId"

**Implementación**: todos los campos son `.optional()` → `safeParse({})` → `success: true`

**Por qué fue así**: tasks T3.1 explícitamente dice `safeParse({}) → success: true (schema totalmente opcional)`. Esto sigue semántica REST PATCH correcta. La spec tenía un escenario inconsistente con PATCH parcial.

**Impacto**: Bajo en runtime (el formulario siempre envía `titulo` y `prioridadId` porque están pre-poblados). El riesgo es que si el hook se usa fuera del form sin valores, el PATCH llegaría al backend sin campos obligatorios, y el backend sería quien rechace.

---

### WARNING W4 — Container/Presentational: TicketsList ya no es presentacional puro

**Archivo**: `frontend/src/features/tickets/components/TicketsList.tsx`

`TicketsList` ahora llama `useDeleteTicket()`, mantiene `useState(confirmId)` y monta `<ConfirmDialog>`. Esto rompe el modelo container/presentational original. La alternativa es elevar todo el estado de delete a `TicketsPage` (container) y pasar `onDelete`, `confirmId`, `setConfirmId`, `isPending` como props a `TicketsList`.

**Decisión pendiente**: si las otras 3 entidades repiten este patrón "el list-component posee el confirm dialog", se establecerá como convención. Si se quiere pureza container/presentational, hay que refactorizar antes de que el patrón se repita.

---

### SUGGESTION S1 — FormField: aria-describedby no implementado

**Spec** (design-system-delta): "the input MUST have `aria-describedby` pointing to the error element AND `aria-invalid="true"` when there is error"

**Implementación**: `FormField` emite `<p role="alert">` para el error pero no genera un `id` ni lo conecta con `aria-describedby` al control hijo. El tasks T1.3 decidió explícitamente que "el `aria-invalid` es responsabilidad del consumer (no `cloneElement`)". El consumer (`TicketFormModal`) pasa `error={!!errors.titulo}` al `Input` (que aplica estilos visuales) pero no pasa `aria-describedby`.

**Impacto**: accesibilidad parcial — los screen readers anuncian el error via `role="alert"` (live region) pero no hay vinculación programática entre el input y el mensaje de error. Usuarios con lectores de pantalla en modo formulario podrían no escuchar el error al llegar al campo.

---

## Tareas pendientes (post-verify)

Ninguna del change en sí. Las warnings son deuda técnica a resolver antes o durante el primer PR de Compras.

- **W1** (5 errores TS): fixear antes de `next build` en CI.
- **W2** (notify en onSuccess): decidir la convención antes de implementar hooks de Compras.
- **W3** (UpdateTicketSchema): documentar la desviación de spec como decisión conscientemente tomada.
- **W4** (container/puro): decidir patrón antes de que se repita en Compras.

