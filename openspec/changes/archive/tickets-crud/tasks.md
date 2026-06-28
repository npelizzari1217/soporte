# Tasks: tickets-crud

**Change**: tickets-crud — CRUD piloto de Tickets + infraestructura compartida de forms/mutaciones
**Tipo**: Frontend · **TDD**: RED→GREEN (Vitest + RTL + MSW) · **Fecha**: 2026-06-28
**Lee**: `design.md`, `specs/tickets-ui/spec.md`, `specs/design-system-delta/spec.md`, `specs/ui-states-delta/spec.md`

> Cada tarea es un par TEST→IMPL atómico: el test se escribe primero (RED), la impl lo hace pasar (GREEN).
> Los tests de integración mockean SOLO endpoints HTTP del BFF vía MSW (`http://localhost/api/...`).
> `notify` se espía con `vi.spyOn(notify, 'success'|'error')` en lugar de asertar el portal DOM de sonner.
> El `SessionProvider` se provee con un `user` fixture (sin red). `queryClient` se espía para verificar invalidaciones.

---

## DAG de slices

```
S1 (infra) ──┬──► S2 (create) ──► S3 (edit)
             └──► S4 (delete)    [paralelo a S2/S3]
```

Dentro de S1: **T1.1 es gate de todo S1**; T1.2–T1.8 son paralelos entre sí (T1.3 prefiere T1.2
completado para el escenario "acepta Textarea hijo", pero no lo bloquea estructuralmente).

---

## SLICE 1 — Infra + Deps

> Riesgo presupuesto: **Alto (~380–420 líneas)**. Si excede 400, separar T1.4+T1.5 tests a un sub-PR `S1b`.

---

### T1.1 — Instalar deps + verificar compatibilidad React 19.1

- [x] **SETUP** (gate de S1 — no produce test unitario propio)
- **Spec**: design-system-delta (preamble stack), tickets-ui (preamble stack)
- **Archivos**: `frontend/package.json`

**Acción**:
1. `cd frontend && npm install react-hook-form@^7.54 zod@^3.23 @hookform/resolvers@^3.9 sonner@^1.5 @radix-ui/react-alert-dialog@^1.1 @radix-ui/react-dialog@^1.1`
2. Verificar que el `package.json` registra las versiones instaladas.
3. Confirmar que no hay peer-dep warnings con `react@^19.1` (sonner y @radix-ui ya usan hooks React genéricos).
4. Correr `npx tsc --noEmit` desde `frontend/` — debe completar sin errores de tipo tras la instalación.

**Criterio de done**: `npm run build` sin errores de tipo.

---

### T1.2 — `<Textarea>` atom

- [x] **TEST RED** → `frontend/src/components/ui/textarea.test.tsx`
- [x] **IMPL GREEN** → `frontend/src/components/ui/textarea.tsx`
- **Spec**: design-system-delta §req FormField (acepta Textarea hijo); CLAUDE.md §3 (rounded-xl, forwardRef)
- **MSW**: No (unit puro)
- **Paralelo con**: T1.3–T1.8 (después de T1.1)

**RED — qué asertar**:
1. Renderiza un elemento `<textarea>` en el DOM.
2. `forwardRef` funciona: el `ref` apunta al elemento `HTMLTextAreaElement` real.
3. `error={true}` → el trigger tiene clase `border-destructive`.
4. Sin `error` (o `error={false}`) → NO tiene clase `border-destructive`.
5. Props `placeholder`, `disabled`, `rows`, `className` se propagan al `<textarea>`.
6. Tiene `rounded-xl` como clase base (CLAUDE.md §3 — inputs).
7. Named export `Textarea` resoluble desde `@/components/ui/textarea`.

**GREEN — impl**:
- Clonar estructura de `@/components/ui/input.tsx`; sustituir `<input>` por `<textarea>`.
- Firma: `React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement> & { error?: boolean }>`.
- `cn('...clases-base rounded-xl', error && 'border-destructive', className)`.
- ~25 líneas de impl + ~20 líneas de test.

---

### T1.3 — `<FormField>` atom

- [x] **TEST RED** → `frontend/src/components/ui/form-field.test.tsx`
- [x] **IMPL GREEN** → `frontend/src/components/ui/form-field.tsx`
- **Spec**: design-system-delta §req FormField (todos los escenarios)
- **MSW**: No (unit puro)
- **Paralelo con**: T1.2, T1.4–T1.8

**RED — qué asertar**:
1. Renderiza un `<label>` asociado al control via `htmlFor` correcto.
2. El label tiene clases `text-xs tracking-wider uppercase` y color muted (`text-muted-foreground`).
3. Sin prop `error` → MUST NOT existir `[role="alert"]` en el DOM.
4. Con `error="El título es requerido"` → texto visible debajo del control; tiene `role="alert"`; tiene color `text-destructive`.
5. `required={true}` → el label incluye indicador visual `*`.
6. Acepta `<Input>` como children sin errores de React.
7. Acepta `<textarea>` como children sin errores de React (usar `<textarea>` bare si T1.2 no está listo).
8. Named export `FormField` resoluble desde `@/components/ui/form-field`.

**GREEN — impl**:
- Interface: `{ label: string; htmlFor?: string; error?: string; required?: boolean; children: React.ReactNode; className?: string }`.
- Render: `<div className="flex flex-col gap-1.5"> <Label htmlFor={htmlFor} className="text-xs tracking-wider uppercase text-muted-foreground">{label}{required && <span aria-hidden> *</span>}</Label> {children} {error && <p role="alert" className="text-sm text-destructive">{error}</p>} </div>`.
- El `aria-invalid` en el control hijo es responsabilidad del consumer (no `cloneElement`).
- ~35 líneas de impl + ~35 líneas de test.

---

### T1.4 — `<FormModal>` atom

- [x] **TEST RED** → `frontend/src/components/ui/form-modal.test.tsx`
- [x] **IMPL GREEN** → `frontend/src/components/ui/form-modal.tsx`
- **Spec**: design-system-delta §req FormModal (todos los escenarios)
- **MSW**: No (unit; polyfills Radix ya en `frontend/vitest.setup.ts`)
- **Paralelo con**: T1.2, T1.3, T1.5–T1.8
- **Dep nueva**: `@radix-ui/react-dialog` (instalado en T1.1)

**RED — qué asertar**:
1. Named export `FormModal` resoluble desde `@/components/ui/form-modal`.
2. `open={true}` → existe `role="dialog"` con `aria-modal="true"` en el DOM.
3. `open={true} title="Crear ticket"` → texto "Crear ticket" visible como `Dialog.Title`.
4. `open={false}` → MUST NOT existir `role="dialog"` en el DOM; children no montados.
5. ESC → `onOpenChange` llamado con `false` (`fireEvent.keyDown(document, { key: 'Escape' })`).
6. Click en overlay → `onOpenChange` llamado con `false` (`userEvent.click` sobre el overlay).
7. Children renderizados dentro del dialog cuando `open={true}`.
8. Prop `footer` renderiza contenido después del children con separador visual.
9. Focus trap activo: Tab no escapa al DOM exterior (Radix lo provee; asertar con `userEvent.tab`).

**GREEN — impl**:
- `Dialog.Root` → `Dialog.Portal` → `Dialog.Overlay` → `Dialog.Content` (glass).
- Overlay: `fixed inset-0 bg-slate-950/60 backdrop-blur-sm`.
- Content: `rounded-xl border border-white/10 dark:border-white/10 bg-card/95 backdrop-blur shadow-2xl max-h-[85vh] flex flex-col`.
- Header: `Dialog.Title` + `Dialog.Description?` + `Dialog.Close` (ícono X).
- Body: `overflow-y-auto flex-1 px-6 py-4` → `{children}`.
- El footer lo provee el `<form>` del consumer (los botones del form deben estar DENTRO del form para que `type="submit"` funcione). El shell NO posee el footer.
- ~55 líneas de impl + ~55 líneas de test.

---

### T1.5 — `<ConfirmDialog>` atom

- [x] **TEST RED** → `frontend/src/components/ui/confirm-dialog.test.tsx`
- [x] **IMPL GREEN** → `frontend/src/components/ui/confirm-dialog.tsx`
- **Spec**: design-system-delta §req ConfirmDialog (todos los escenarios)
- **MSW**: No (unit; polyfills Radix ya en `vitest.setup.ts`)
- **Paralelo con**: T1.2–T1.4, T1.6–T1.8
- **Dep nueva**: `@radix-ui/react-alert-dialog` (instalado en T1.1)

**RED — qué asertar**:
1. Named export `ConfirmDialog` resoluble desde `@/components/ui/confirm-dialog`.
2. `open={true}` → existe `role="alertdialog"` con title y description visibles.
3. ESC → `onOpenChange` NOT llamado (AlertDialog no cierra con ESC).
4. Click en overlay → `onOpenChange` NOT llamado (AlertDialog no cierra con click-outside).
5. `isPending={true}` → botón de confirmar `disabled` y muestra spinner/isLoading.
6. Click en "Cancelar" → `onOpenChange(false)` llamado; `onConfirm` NOT llamado.
7. Click en botón confirmar → `onConfirm` llamado exactamente una vez; dialog NO cierra solo.
8. `confirmLabel` default visible ("Eliminar" o "Confirmar") cuando no se provee prop.
9. `cancelLabel` default visible ("Cancelar").
10. Botón de confirmar usa variante destructiva (clase `bg-red` o `variant="destructive"` del `<Button>`).
11. Botón de confirmar tiene `rounded-md` (CLAUDE.md §3 — botones).

**GREEN — impl**:
- `AlertDialog.Root` → `Portal` → `Overlay` → `Content`.
- `AlertDialog.Cancel` asChild → `<Button variant="outline">{cancelLabel ?? 'Cancelar'}</Button>`.
- `AlertDialog.Action` asChild → `<Button variant="destructive" isLoading={isPending} onClick={(e) => { e.preventDefault(); onConfirm(); }}>{confirmLabel ?? 'Eliminar'}</Button>`.
  > `e.preventDefault()` en el Action evita el cierre automático de Radix; el caller controla `open`.
- ~55 líneas de impl + ~50 líneas de test.

---

### T1.6 — `notify` helper + `<Toaster>` en root layout

- [x] **TEST RED (notify)** → `frontend/src/shared/lib/notify.test.ts`
- [x] **IMPL GREEN (notify)** → `frontend/src/shared/lib/notify.ts`
- [x] **IMPL GREEN (layout)** → `frontend/src/app/layout.tsx` (añadir `<Toaster>`)
- **Spec**: design-system-delta §req Toaster (todos los escenarios)
- **MSW**: No
- **Paralelo con**: T1.2–T1.5, T1.7–T1.8
- **Dep nueva**: `sonner` (instalado en T1.1)

**RED (notify) — qué asertar**:
1. `notify.success('msg')` → `toast.success('msg')` llamado (`vi.spyOn(toast, 'success')`).
2. `notify.error('msg')` → `toast.error('msg')` llamado.
3. Named export `notify` resoluble desde `@/shared/lib/notify`.

**RED (layout) — qué asertar** (en `frontend/src/app/layout.test.tsx`, ya existe):
4. `render(<RootLayout>{null}</RootLayout>)` no lanza errores (smoke test).
5. Inspección estática del módulo `layout.tsx`: importa `Toaster` exactamente una vez (verificación de code review, no RTL — Toaster es portal y RTL no lo captura fácilmente en render de Server Component).

**GREEN — impl**:
- `notify.ts`: `import { toast } from 'sonner'; export const notify = { success: (msg: string) => toast.success(msg), error: (msg: string) => toast.error(msg) }`.
- `layout.tsx`: agregar `import { Toaster } from 'sonner'` + `<Toaster richColors position="top-right" theme="system" />` dentro de `<body>`, DESPUÉS de `<Providers>{children}</Providers>`.
- ~12 líneas de impl (notify) + ~3 líneas de cambio (layout) + ~18 líneas de test.

---

### T1.7 — `mapApiError` helper

- [x] **TEST RED** → `frontend/src/shared/lib/map-api-error.test.ts`
- [x] **IMPL GREEN** → `frontend/src/shared/lib/map-api-error.ts`
- **Spec**: tickets-ui §req Mapeo de ApiError a feedback de UI (todos los escenarios); ui-states-delta §req errores no-422
- **MSW**: No (unit puro)
- **Paralelo con**: T1.2–T1.6, T1.8

**RED — qué asertar**:
1. `mapApiError(new ApiError(0, 'x'))` → cadena de error de red (ej. `'Error de red. Revisá tu conexión.'`).
2. `mapApiError(new ApiError(401, 'x'))` → cadena de sesión expirada.
3. `mapApiError(new ApiError(403, 'x'))` → cadena de permisos denegados.
4. `mapApiError(new ApiError(404, 'x'))` → cadena de recurso no encontrado.
5. `mapApiError(new ApiError(422, 'Ciclo inválido'))` → `'Ciclo inválido'` (el `err.message` tal cual).
6. `mapApiError(new ApiError(500, 'Internal error'))` → mensaje genérico del servidor.
7. `mapApiError(new Error('x'))` (no-ApiError) → cadena genérica, sin lanzar.
8. `mapApiError(null)` → cadena genérica, sin lanzar.

**GREEN — impl**:
- `export function mapApiError(err: unknown): string { if (err instanceof ApiError) { switch (err.statusCode) { ... } } return 'Ocurrió un error inesperado.' }`.
- Importar `ApiError` desde `@/shared/api/types` (ya existe).
- ~20 líneas de impl + ~22 líneas de test.

---

### T1.8 — Extender `<Select>` con prop `error`

- [x] **TEST RED** → `frontend/src/components/ui/select.test.tsx` (extender test existente)
- [x] **IMPL GREEN** → `frontend/src/components/ui/select.tsx` (extender impl existente)
- **Spec**: design-system-delta §req FormField (Select con estado visual de error); design.md §2 tabla integración rhf
- **MSW**: No
- **Paralelo con**: T1.2–T1.7
- **Bloqueo**: Bajo — no bloquea S2 (FormField ya muestra el mensaje de error via prop `error`; esto es visual opcional del trigger)

**RED — escenarios a añadir**:
1. `<Select error={true} options={[]} />` → el Trigger tiene clase `border-destructive`.
2. `<Select error={false} options={[]} />` → Trigger NO tiene clase `border-destructive`.

**GREEN — impl**:
- Añadir `error?: boolean` a `SelectProps`.
- `cn('...existente', error && 'border-destructive', className)` en `RadixSelect.Trigger`.
- ~5 líneas de impl + ~10 líneas de test.

---

## SLICE 2 — Create

> Riesgo presupuesto: **Alto (~380–400 líneas)**. El grueso está en T2.4 (`TicketFormModal` + `useTicketForm`).
> Si excede, separar tests de integración de T2.4 a un sub-PR `S2b`.
> **Deps**: S1 completo.

---

### T2.1 — `CreateTicketSchema`

- [x] **TEST RED** → `frontend/src/features/tickets/schemas.test.ts` (nuevo archivo)
- [x] **IMPL GREEN** → `frontend/src/features/tickets/schemas.ts` (nuevo archivo)
- **Spec**: tickets-ui §req Schemas Zod por operación (todos los escenarios de CreateTicketSchema)
- **MSW**: No (unit puro, Zod)
- **Paralelo con**: T2.2, T2.3 (T2.4 depende de los tres)

**RED — qué asertar**:
1. `safeParse({ titulo: '' })` → `success: false`; error apunta a `titulo` con mensaje en español.
2. `safeParse({ titulo: 'x'.repeat(256) })` → `success: false`; error en `titulo`.
3. `safeParse({ titulo: 'ok', tipoId: 'no-es-uuid', prioridadId: uuid })` → `success: false`; error en `tipoId`.
4. `safeParse({ titulo: 'ok', tipoId: uuid, prioridadId: 'no-uuid' })` → `success: false`; error en `prioridadId`.
5. `safeParse({ titulo: 'Falla red', tipoId: uuid, prioridadId: uuid })` → `success: true`; campos opcionales ausentes = undefined/null sin error.
6. `'solicitanteId' in CreateTicketSchema.shape` → `false` (el schema NO tiene ese campo).
7. `safeParse({ titulo: 'ok', tipoId: uuid, prioridadId: uuid, fechaVencimiento: '2026-12-31' })` → `success: true`.
8. `safeParse({ titulo: 'ok', tipoId: uuid, prioridadId: uuid, cicloId: null })` → `success: true`.

**GREEN — impl**:
- `schemas.ts` con `CreateTicketSchema`, `CreateTicketForm`, `CreateTicketInput` (ver design.md §3).
- `CreateTicketInput = CreateTicketForm & { solicitanteId: string }` — el `solicitanteId` solo existe en el DTO de envío, no en el schema.
- ~28 líneas de impl + ~25 líneas de test.

---

### T2.2 — `useCreateTicket` hook

- [x] **TEST RED** → `frontend/src/features/tickets/hooks/use-create-ticket.test.ts` (nuevo)
- [x] **IMPL GREEN** → `frontend/src/features/tickets/hooks/use-create-ticket.ts` (nuevo)
- **Spec**: tickets-ui §req Hooks de mutación (escenarios useCreateTicket); ui-states-delta §req onSuccess create
- **MSW**: `http.post('http://localhost/api/tickets', handler)` → 201 con Ticket fixture / 422 con mensaje de dominio / delay para isPending
- **Paralelo con**: T2.1, T2.3

**RED — qué asertar** (usando `renderHook` + wrapper `QueryClientProvider`):
1. Expone al menos `{ mutateAsync, isPending, error }`.
2. `mutate(dto)` → `POST /api/tickets` con `dto` como body JSON (verificar request interceptado por MSW).
3. `isPending === true` mientras el request está en vuelo (handler con `delay`).
4. `isPending === false` tras respuesta 201.
5. Éxito (201): `vi.spyOn(queryClient, 'invalidateQueries')` → llamado con `{ queryKey: ['tickets'] }`.
6. Error 422: la mutación se rechaza con un `ApiError` cuyo `statusCode === 422`.
7. Error 422: `invalidateQueries` NOT llamado.

**GREEN — impl**:
- `useMutation<Ticket, ApiError, CreateTicketInput>({ mutationFn: (dto) => apiFetch<Ticket>('tickets', { method: 'POST', json: dto }), onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.tickets.all }) })`.
- ~18 líneas de impl + ~42 líneas de test.

---

### T2.3 — Botón "Nuevo ticket" gateado en `TicketsList`

- [x] **TEST RED** → `frontend/src/features/tickets/components/TicketsList.test.tsx` (extender)
- [x] **IMPL GREEN** → `frontend/src/features/tickets/components/TicketsList.tsx` (extender)
- **Spec**: tickets-ui §req Acción "Crear ticket" solo visible para ticket:crear
- **MSW**: No (unit; `SessionProvider` con user fixture)
- **Paralelo con**: T2.1, T2.2

**RED — escenarios a añadir al test existente**:
1. `SessionProvider` con `permisos: ['ticket:crear']` → botón "Nuevo ticket" presente en el DOM y clickeable.
2. `SessionProvider` con `permisos: ['ticket:ver_todos']` (sin `ticket:crear`) → botón MUST NOT estar en el DOM (no `aria-hidden`, no `display:none` — exclusión condicional en render).
3. Click en el botón → invoca prop `onOpenCreate()` exactamente una vez.

**GREEN — impl**:
- Añadir prop `onOpenCreate?: () => void` a `TicketsListProps`.
- `const { can } = useSession()` (ya existe `useSession`).
- `{can('ticket:crear') && <Button onClick={onOpenCreate}>Nuevo ticket</Button>}` en el header de la lista.
- ~10 líneas de impl + ~20 líneas de test.

---

### T2.4 — `TicketFormModal` (create) + `useTicketForm('create')` — integración

- [x] **TEST RED** → `frontend/src/features/tickets/components/TicketFormModal.test.tsx` (nuevo)
- [x] **IMPL GREEN (hook)** → `frontend/src/features/tickets/hooks/use-ticket-form.ts` (nuevo)
- [x] **IMPL GREEN (component)** → `frontend/src/features/tickets/components/TicketFormModal.tsx` (nuevo)
- **Spec**: tickets-ui §req Formulario de creación; ui-states-delta §req 422 inline; ui-states-delta §req onSuccess
- **Deps**: T2.1, T2.2, T2.3, S1 (FormField, FormModal, notify, mapApiError listos)
- **MSW**: `http.post('http://localhost/api/tickets', ...)` → 201 / 422 / `HttpResponse.error()` (red)

**RED — qué asertar**:
1. `open={false}` → MUST NOT existir `role="dialog"` en el DOM.
2. `open={true} mode="create"` → modal visible con campos: input `titulo`, textarea `descripcion`, Select `tipoId`, Select `prioridadId`.
3. Select `tipoId` tiene opciones cargadas desde `TIPOS` (al menos 1 opción visible).
4. Select `prioridadId` tiene opciones cargadas desde `PRIORIDADES`.
5. MUST NOT existir campo con `name="solicitanteId"` en el DOM del form.
6. Submit con todos los campos vacíos → errores inline en `titulo`, `tipoId`, `prioridadId`; POST NOT disparado.
7. Blur en `titulo` vacío → mensaje de error inline bajo el campo.
8. Submit con campos válidos → POST 201:
   - Body JSON incluye `solicitanteId: user.sub` del fixture de sesión.
   - `vi.spyOn(notify, 'success')` → llamado con string no vacío.
   - `onOpenChange(false)` o modal cierra.
   - `queryClient.invalidateQueries({ queryKey: ['tickets'] })` llamado.
9. Submit → 422 `{ message: 'Solicitante inválido' }`:
   - Mensaje `'Solicitante inválido'` visible dentro del form (banner root con `role="alert"`).
   - Modal permanece abierto.
   - `vi.spyOn(notify, 'error')` → llamado.
   - `notify.success` NOT llamado.
10. Submit → error de red (`HttpResponse.error()`):
    - `notify.error` llamado.
    - Modal permanece abierto.
    - No lanza excepción no manejada.
11. Botón submit muestra estado loading (disabled + spinner) mientras POST en vuelo (handler con `delay`).
12. ESC → modal cierra; POST NOT disparado.

**GREEN — impl**:
- `useTicketForm(mode: 'create' | 'edit', opts: { ticket?: Ticket; onClose: () => void })`:
  - `useForm({ resolver: zodResolver(mode === 'create' ? CreateTicketSchema : UpdateTicketSchema), defaultValues: mode === 'edit' ? mapTicketToForm(ticket) : {} })`.
  - `const { user } = useSession()`.
  - `onSubmit(values)`: `await mutateAsync(...)` → `notify.success(msg)` → `reset()` → `onClose()`.
  - En `catch(err)`: `setError('root', { message: mapApiError(err) })` + `notify.error(mapApiError(err))`.
  - Manejo especial 404 en edit: `notify.error(msg)` + `onClose()` + `invalidateQueries`.
- `TicketFormModal({ mode, open, onOpenChange, ticket? })`:
  - Usa `<FormModal>` como shell.
  - Campos modo `create`: `titulo` (Input), `descripcion` (Textarea), `tipoId` (Controller+Select), `prioridadId` (Controller+Select).
  - Banner root: `{errors.root?.message && <p role="alert" className="text-sm text-destructive">{errors.root.message}</p>}` en el tope del form.
  - Footer DENTRO del `<form>`: `<Button type="submit" isLoading={isSubmitting}>Crear</Button>` + `<Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>`.
  - `toOptions(catalog)` helper local: `Object.entries(TIPOS).map(([value, label]) => ({ value, label }))`.
- ~90 líneas de impl (hook + component) + ~80 líneas de test.

---

## SLICE 3 — Edit

> Riesgo presupuesto: **Medio (~200 líneas)** — reusa `TicketFormModal` y `FormModal` de S2.
> **Deps**: S1 + S2 completos.

---

### T3.1 — `UpdateTicketSchema`

- [x] **TEST RED** → `frontend/src/features/tickets/schemas.test.ts` (extender)
- [x] **IMPL GREEN** → `frontend/src/features/tickets/schemas.ts` (extender)
- **Spec**: tickets-ui §req Schemas Zod (todos los escenarios de UpdateTicketSchema)
- **MSW**: No (unit puro)
- **Paralelo con**: T3.2, T3.3

**RED — qué asertar**:
1. `'tipoId' in UpdateTicketSchema.shape` → `false`.
2. `'estado' in UpdateTicketSchema.shape` → `false`.
3. `safeParse({})` → `success: true` (schema totalmente opcional).
4. `safeParse({ titulo: 'x'.repeat(256) })` → `success: false`; error en `titulo`.
5. `safeParse({ titulo: 'ok', prioridadId: 'no-uuid' })` → `success: false`; error en `prioridadId`.
6. `safeParse({ titulo: 'ok', prioridadId: uuid })` → `success: true`.
7. Pasar `{ tipoId: uuid }` en el objeto → `safeParse` resuelve `success: true` pero el valor `tipoId` es ignorado (Zod `.strip()` default). Documentar explícitamente en el test con comentario.

**GREEN — impl**:
- Añadir `UpdateTicketSchema` y `UpdateTicketInput` a `schemas.ts` (ver design.md §3).
- Todos los campos son `.optional()` o `.optional().nullable()`.
- ~22 líneas de impl + ~20 líneas de test.

---

### T3.2 — `useUpdateTicket` hook

- [x] **TEST RED** → `frontend/src/features/tickets/hooks/use-update-ticket.test.ts` (nuevo)
- [x] **IMPL GREEN** → `frontend/src/features/tickets/hooks/use-update-ticket.ts` (nuevo)
- **Spec**: tickets-ui §req Hooks de mutación (escenarios useUpdateTicket); ui-states-delta §req onSuccess update
- **MSW**: `http.patch('http://localhost/api/tickets/:id', ...)` → 200 / 422 / 404
- **Paralelo con**: T3.1, T3.3

**RED — qué asertar**:
1. `mutate({ id: 'uuid', dto: updateDto })` → `PATCH /api/tickets/uuid` con `updateDto` como body JSON.
2. Body del PATCH NOT incluye `tipoId` ni `estado` (verificar request interceptado: `await req.json()` en el handler MSW).
3. Éxito (200): `queryClient.invalidateQueries` llamado con `queryKeys.tickets.all`.
4. Éxito (200): `queryClient.invalidateQueries` llamado con `queryKeys.tickets.detail(id)`.
5. Error 422: mutación rechazada con `ApiError.statusCode === 422`; `invalidateQueries` NOT llamado.
6. `isPending` true mientras PATCH en vuelo; false tras respuesta.

**GREEN — impl**:
- `useMutation<Ticket, ApiError, { id: string; dto: UpdateTicketInput }>` (ver design.md §1.7).
- `onSuccess: (_d, { id }) => { qc.invalidateQueries({ queryKey: queryKeys.tickets.all }); qc.invalidateQueries({ queryKey: queryKeys.tickets.detail(id) }) }`.
- ~20 líneas de impl + ~38 líneas de test.

---

### T3.3 — Botón "Editar" gateado en `TicketsList`

- [x] **TEST RED** → `frontend/src/features/tickets/components/TicketsList.test.tsx` (extender)
- [x] **IMPL GREEN** → `frontend/src/features/tickets/components/TicketsList.tsx` (extender)
- **Spec**: tickets-ui §req Acción "Editar" solo visible para ticket:editar
- **MSW**: No (unit; SessionProvider fake)
- **Paralelo con**: T3.1, T3.2

**RED — escenarios a añadir**:
1. `SessionProvider` con `permisos: ['ticket:editar']` → botón/ícono "Editar" visible para cada ticket en la lista.
2. `SessionProvider` sin `ticket:editar` → botón "Editar" MUST NOT estar en el DOM para ningún ticket.
3. Click en "Editar" de un ticket → invoca prop `onOpenEdit(ticket)` con el ticket correcto.

**GREEN — impl**:
- Añadir prop `onOpenEdit?: (ticket: Ticket) => void` a `TicketsListProps`.
- `{can('ticket:editar') && <Button variant="ghost" size="icon" onClick={() => onOpenEdit?.(ticket)} aria-label="Editar ticket">...</Button>}` dentro de cada fila de `TicketsList`.
- ~10 líneas de impl + ~18 líneas de test.

---

### T3.4 — Edit mode en `TicketFormModal` + `useTicketForm('edit')` — integración

- [x] **TEST RED** → `frontend/src/features/tickets/components/TicketFormModal.test.tsx` (extender)
- [x] **IMPL GREEN (hook)** → `frontend/src/features/tickets/hooks/use-ticket-form.ts` (extender)
- [x] **IMPL GREEN (component)** → `frontend/src/features/tickets/components/TicketFormModal.tsx` (extender con modo edit)
- **Spec**: tickets-ui §req Formulario de edición; ui-states-delta §req 422 inline; ui-states-delta §req 404 cierra
- **Deps**: T3.1, T3.2, T3.3, S1, S2
- **MSW**: `http.patch('http://localhost/api/tickets/:id', ...)` → 200 / 422 / 404

**RED — escenarios a añadir al test de TicketFormModal**:
1. `mode='edit'` con `ticket` fixture → input `titulo` pre-llenado con `ticket.titulo`.
2. Campo `descripcion` pre-llenado con `ticket.descripcion`.
3. Select `prioridadId` tiene la opción correspondiente a `ticket.prioridadId` pre-seleccionada.
4. MUST NOT existir campo con `name="tipoId"` o `name="tipo"` en el DOM.
5. MUST NOT existir campo con `name="estado"` en el DOM.
6. Submit con datos modificados → body del PATCH NOT incluye `tipoId` ni `estado` (verificar request).
7. PATCH 200 → `notify.success` + modal cierra + `invalidateQueries` llamado.
8. PATCH 422 → banner root con mensaje de dominio + modal permanece + `notify.error` llamado.
9. PATCH 404 → `notify.error` con mensaje de "ya no existe" + modal cierra + `invalidateQueries` llamado.
10. Botón submit en `isSubmitting=true` → loading state (disabled + spinner).

**GREEN — impl**:
- Extender `useTicketForm` para `mode='edit'`: `useUpdateTicket()` como hook de mutación; `defaultValues = mapTicketToForm(ticket)`.
- `mapTicketToForm(t: Ticket): UpdateTicketInput = { titulo: t.titulo, descripcion: t.descripcion ?? undefined, prioridadId: t.prioridadId, cicloId: t.cicloId ?? undefined, fechaVencimiento: t.fechaVencimiento ?? undefined }`.
- Manejo diferenciado de 404 en `catch` del edit mode: si `err instanceof ApiError && err.statusCode === 404` → `notify.error(mapApiError(err))` + `onClose()` + `invalidateQueries(all)`.
- `TicketFormModal` en `mode='edit'`: omite campo `tipoId` Select; usa `UpdateTicketSchema`; footer muestra "Guardar" en lugar de "Crear".
- ~40 líneas de impl + ~50 líneas de test.

---

## SLICE 4 — Delete

> Riesgo presupuesto: **Bajo (~135 líneas)**.
> **Deps**: Solo S1 (independiente de S2/S3 — puede mergear en paralelo con S2 y S3).

---

### T4.1 — `useDeleteTicket` hook

- [x] **TEST RED** → `frontend/src/features/tickets/hooks/use-delete-ticket.test.ts` (nuevo)
- [x] **IMPL GREEN** → `frontend/src/features/tickets/hooks/use-delete-ticket.ts` (nuevo)
- **Spec**: tickets-ui §req Hooks de mutación (escenarios useDeleteTicket); ui-states-delta §req onSuccess delete
- **MSW**: `http.delete('http://localhost/api/tickets/:id', ...)` → 204 / `HttpResponse.error()`
- **Paralelo con**: nada en S4 (T4.2 depende de T4.1)

**RED — qué asertar**:
1. `mutate('uuid-del-ticket')` → `DELETE /api/tickets/uuid-del-ticket` (verificar URL interceptada por MSW).
2. 204 → `queryClient.invalidateQueries({ queryKey: ['tickets'] })` llamado.
3. 204 repetido (idempotente) → misma invalidación, sin error.
4. `apiFetch` retorna `undefined` en 204 → la mutación resuelve sin lanzar error al parsear body vacío.
5. `isPending` true mientras DELETE en vuelo; false tras 204.
6. Error (ej. red) → mutación rechazada con `ApiError`; `invalidateQueries` NOT llamado.

**GREEN — impl**:
- `useMutation<void, ApiError, string>({ mutationFn: (id) => apiFetch<void>('tickets/' + id, { method: 'DELETE' }), onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.tickets.all }) })`.
- ~15 líneas de impl + ~38 líneas de test.

---

### T4.2 — Botón "Borrar" gateado + `ConfirmDialog` wiring — integración

- [x] **TEST RED** → `frontend/src/features/tickets/components/TicketsList.test.tsx` (extender)
- [x] **IMPL GREEN** → `frontend/src/features/tickets/components/TicketsList.tsx` (extender)
- **Spec**: tickets-ui §req Acción "Eliminar" (todos los escenarios); ui-states-delta §req onSuccess delete; design-system-delta §req ConfirmDialog (integración)
- **Deps**: T4.1, S1 (ConfirmDialog atom listo)
- **MSW**: `http.delete('http://localhost/api/tickets/:id', ...)` → 204 / `HttpResponse.error()`

**RED — qué asertar**:
1. `SessionProvider` con `ticket:eliminar` → botón "Borrar" visible para cada fila.
2. `SessionProvider` sin `ticket:eliminar` → botón "Borrar" MUST NOT estar en el DOM.
3. Click en "Borrar" para ticket con titulo `"Falla en red"` → aparece `role="alertdialog"`; DELETE NOT disparado aún.
4. El ConfirmDialog muestra el titulo del ticket en el mensaje de confirmación.
5. Click en overlay del ConfirmDialog → dialog PERMANECE abierto (AlertDialog behavior).
6. Click "Cancelar" → dialog cierra; DELETE NOT disparado.
7. Click "Confirmar" → DELETE 204 → `notify.success` + `role="alertdialog"` desaparece + `invalidateQueries` llamado.
8. Click "Confirmar" con ticket ya eliminado (204 idempotente) → mismo resultado que escenario 7.
9. Click "Confirmar" → error de red → `notify.error`; `role="alertdialog"` PERMANECE abierto.
10. `isPending=true` mientras DELETE en vuelo → botón "Confirmar" disabled.

**GREEN — impl**:
- Estado local en `TicketsList` (o en su container `TicketsPage`): `const [confirmId, setConfirmId] = useState<string | null>(null)`.
- `{can('ticket:eliminar') && <Button variant="ghost" size="icon" onClick={() => setConfirmId(ticket.id)}>Borrar</Button>}` por fila.
- `<ConfirmDialog open={!!confirmId} onOpenChange={(v) => { if (!v) setConfirmId(null) }} title="¿Eliminar ticket?" description={`¿Eliminás "${confirmTicket?.titulo}"? Esta acción no se puede deshacer.`} onConfirm={handleDelete} isPending={deleteTicket.isPending} />`.
- `handleDelete`: `await deleteTicket.mutateAsync(confirmId!)` → `notify.success('Ticket eliminado')` → `setConfirmId(null)`. En `catch(err)`: `notify.error(mapApiError(err))` (confirmId NO se limpia → dialog permanece).
- ~30 líneas de impl + ~55 líneas de test.

---

## Review Workload Forecast

| Slice | Tareas | Líneas estimadas | < 400 | Decisión antes de apply |
|-------|--------|-----------------|-------|--------------------------|
| **S1 — Infra + Deps** | T1.1–T1.8 (8 tareas) | ~385–420 | **NO (riesgo límite)** | **Sí** — ver nota |
| **S2 — Create** | T2.1–T2.4 (4 tareas) | ~375–400 | **NO (riesgo límite)** | **Sí** — ver nota |
| **S3 — Edit** | T3.1–T3.4 (4 tareas) | ~200 | Sí | No |
| **S4 — Delete** | T4.1–T4.2 (2 tareas) | ~135 | Sí | No |
| **TOTAL** | **18 tareas** | **~1100–1155 líneas** | — | — |

**Chained PRs recomendados**: Sí (S1 y S2 bordean o superan las 400 líneas por PR).
**Estrategia sugerida**: `auto-chain` — 4 PRs en secuencia: `S1 → S2 → S3 ‖ S4`.

**Notas de corte por slice**:
- **S1**: Si `FormModal` (T1.4) + `ConfirmDialog` (T1.5) hacen exceder 400 líneas, separar sus tests en `S1b` (tests de componentes complejos) y mergear `S1a` (impl + tests simples) primero.
- **S2**: La mayoría de líneas están en T2.4 (`TicketFormModal` + `useTicketForm`). Si se excede, mover los tests de integración de T2.4 a `S2b` y mergear `S2a` (schema + hook + gate) primero.
- **S3 y S4**: Dentro del límite sin corte.
- **S4 paralelo**: Puede mergear en cualquier momento después de S1; no espera S2 ni S3.
