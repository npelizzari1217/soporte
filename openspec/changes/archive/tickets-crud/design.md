# Design: tickets-crud

**Change**: tickets-crud — CRUD piloto de Tickets + infraestructura compartida de forms/mutaciones
**Tipo**: Frontend · **Store**: hybrid · **Fecha**: 2026-06-28
**Lee**: `proposal.md`, `explore.md` · **Decisiones confirmadas**: forms en modal, rhf+zod+sonner+alert-dialog, solicitante = `user.sub`, edit sin `tipoId`/estado.

> Este documento es el HOW arquitectónico (contratos de piezas, integración, flujos, estrategia de test). Los pasos concretos van en `tasks.md`.

---

## 0. Principio rector

**Construir una vez, reusar × 4** (Tickets · Compras · Reparaciones · Catálogos). Toda pieza del bloque 1 es **genérica y agnóstica de entidad**: vive en `@/components/ui` o `@/shared` (Scope Rule §2). Lo Tickets-específico (schemas, hooks de mutación, `TicketFormModal`) vive en `features/tickets`. El acoplamiento a Tickets en la infra compartida es PROHIBIDO — es el riesgo #1 de la propuesta.

Patrón estructural: se mantiene **Container/Presentational** (como `use-login`/`LoginForm`). El container es un hook (`useTicketForm`) que arma rhf + orquesta la mutación; el presentational (`TicketFormModal`) sólo renderiza campos.

---

## 1. Infraestructura compartida (genérica)

### 1.1 `<FormField>` — `@/components/ui/form-field.tsx`

Wrapper presentacional puro: `<Label>` (uppercase, ya existe) + control (children) + mensaje de error. **No conoce rhf** — recibe `error` como string. Reusable por cualquier control.

```ts
interface FormFieldProps {
  label: string;
  htmlFor?: string;              // asocia Label↔control para a11y
  error?: string;                // errors.campo?.message
  required?: boolean;            // marca visual "*"
  children: React.ReactNode;     // <Input>, <Select>, <Textarea>
  className?: string;
}
```

Render: `<div class="flex flex-col gap-1.5"> <Label htmlFor>label</Label> {children} {error && <p role="alert" class="text-sm text-destructive">{error}</p>} </div>`.
`role="alert"` para que RTL lo encuentre y para a11y. El `<Input error>` ya pinta su propio borde destructivo; `FormField` aporta el **mensaje**.

### 1.2 `<Textarea>` — `@/components/ui/textarea.tsx`

No existe atom para texto largo (`descripcion`). Espeja `<Input>`: `rounded-xl` (Constitución §3), `forwardRef` (para `register`), prop `error?: boolean`. Genérico, ~30 líneas.

### 1.3 `<FormModal>` — `@/components/ui/form-modal.tsx`

Shell de diálogo sobre **`@radix-ui/react-dialog`** (NO alert-dialog: este permite ESC + click-outside, correcto para forms). Radix ya provee ESC/click-outside/focus-trap/ARIA vía `onOpenChange`.

```ts
interface FormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: React.ReactNode;     // el consumidor pasa su <form> (campos + footer)
}
```

Estructura: `Root` → `Portal` → `Overlay` (glassmorphism: `fixed inset-0 bg-slate-950/60 backdrop-blur-sm`) → `Content` (tarjeta glass: `rounded-xl border border-white/10 bg-card/95 backdrop-blur shadow-2xl max-h-[85vh] flex flex-col`). Layout interno: **header** (`Title` + `Description` + botón `X` con `Dialog.Close`), **body scrollable** (`overflow-y-auto`, contiene los children), **footer** lo aporta el `<form>` del consumidor (los botones deben vivir dentro del `<form>` para que `type="submit"` funcione). El shell NO posee el footer → así submit/`isSubmitting` quedan en una sola unidad rhf.

### 1.4 `<ConfirmDialog>` — `@/components/ui/confirm-dialog.tsx`

Sobre **`@radix-ui/react-alert-dialog`** (semántica destructiva: NO cierra por click-outside, fuerza decisión explícita; ESC = cancelar).

```ts
interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  confirmLabel?: string;         // default "Eliminar"
  cancelLabel?: string;          // default "Cancelar"
  variant?: 'danger' | 'default';// default 'danger'
  isLoading?: boolean;           // mutación en vuelo → bloquea Confirm
  onConfirm: () => void;
}
```

`AlertDialog.Action` usa `<Button variant="destructive" isLoading={isLoading}>` (el átomo ya soporta `isLoading`). `AlertDialog.Cancel` → `<Button variant="outline">`.

### 1.5 `<Toaster>` + helper `notify` — sonner

- **Montaje**: `<Toaster richColors position="top-right" />` en `app/layout.tsx`, dentro de `<body>`, después de `<Providers>{children}</Providers>`. Es un client island; el `RootLayout` sigue siendo Server Component (sonner se autoinyecta como `"use client"`). Único `<Toaster>` global para los 4 dominios.
- **Helper** `@/shared/lib/notify.ts`: wrapper fino sobre `toast` de sonner.
  ```ts
  export const notify = {
    success: (msg: string) => toast.success(msg),
    error:   (msg: string) => toast.error(msg),
  };
  ```
  **Por qué wrapper**: (1) la librería de toast queda swappable sin tocar features; (2) los tests espían `notify.success/error` (atómico) en vez de asertar el portal DOM de sonner.

### 1.6 `mapApiError` — `@/shared/lib/map-api-error.ts`

**DECISIÓN CLAVE — field-level vs form-level**: el backend NO valida por campo (DTOs sin class-validator, ver explore §1). Sus errores 422 son **strings de dominio únicos** y `normalize` los empaqueta como `messages = [unaSolaString]` (verificado en `normalize.ts`). NO hay estructura por campo que mapear → **los errores del servidor son FORM-LEVEL**, no field-level.

Reparto de responsabilidades:
- **Validación de cliente (Zod)** → errores **field-level** (rhf los pinta vía `errors.campo`, automático).
- **Errores del servidor (`ApiError`)** → **form-level**: banner único arriba del form + toast.

```ts
function mapApiError(err: unknown): string {
  if (err instanceof ApiError) {
    switch (err.statusCode) {
      case 0:   return 'Error de red. Revisá tu conexión.';
      case 401: return 'Tu sesión expiró. Iniciá sesión de nuevo.';
      case 403: return 'No tenés permiso para esta acción.';
      case 404: return 'El recurso ya no existe.';
      case 422: return err.message;   // string de dominio, ya legible
      default:  return err.message || 'Ocurrió un error inesperado.';
    }
  }
  return 'Ocurrió un error inesperado.';
}
```

Uso en el container (rhf): `setError('root', { message: mapApiError(err) })` + `notify.error(mapApiError(err))`. El banner `errors.root?.message` se renderiza en el tope del `<form>` con `role="alert"`.

### 1.7 Convención de hooks de mutación

**Firma reusable** (clonable a las otras 3 entidades cambiando entidad/endpoint/tipo). Los hooks son **puros de datos**: `mutationFn` + invalidación. Los efectos de UI (toast, cierre de modal, `reset`, `setError`) viven en el **container** (donde existe el contexto de rhf). Esto evita acoplar los hooks al form.

```ts
// features/tickets/hooks/use-create-ticket.ts
export function useCreateTicket() {
  const qc = useQueryClient();
  return useMutation<Ticket, ApiError, CreateTicketInput>({
    mutationFn: (dto) => apiFetch<Ticket>('tickets', { method: 'POST', json: dto }),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.tickets.all }),
  });
}

// use-update-ticket.ts — variables { id, dto }
export function useUpdateTicket() {
  const qc = useQueryClient();
  return useMutation<Ticket, ApiError, { id: string; dto: UpdateTicketInput }>({
    mutationFn: ({ id, dto }) => apiFetch<Ticket>(`tickets/${id}`, { method: 'PATCH', json: dto }),
    onSuccess: (_d, { id }) => {
      qc.invalidateQueries({ queryKey: queryKeys.tickets.all });
      qc.invalidateQueries({ queryKey: queryKeys.tickets.detail(id) });
    },
  });
}

// use-delete-ticket.ts — 204 → apiFetch<void> devuelve undefined
export function useDeleteTicket() {
  const qc = useQueryClient();
  return useMutation<void, ApiError, string>({
    mutationFn: (id) => apiFetch<void>(`tickets/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.tickets.all }),
  });
}
```

---

## 2. Integración react-hook-form + átomos existentes

Restricción verificada en el código: **`<Select>` es controlado y NO expone `ref`/`name`** (firma `{ value, onValueChange, options, ... }`). `<Input>`/`<Textarea>` son `forwardRef`.

| Átomo | Integración rhf | Error |
|-------|-----------------|-------|
| `<Input>` | `{...register('titulo')}` | `error={!!errors.titulo}` + `FormField error={errors.titulo?.message}` |
| `<Textarea>` | `{...register('descripcion')}` | idem |
| `<Select>` | `<Controller>` (obligatorio — sin ref nativo) | `FormField error={errors.tipoId?.message}` |
| `<Button>` | `type="submit"` | `isLoading={isSubmitting}` |

Controller para Select:
```tsx
<Controller
  control={control}
  name="tipoId"
  render={({ field }) => (
    <Select value={field.value ?? ''} onValueChange={field.onChange}
            options={toOptions(TIPOS)} placeholder="Seleccionar tipo" />
  )}
/>
```
`toOptions(map) = Object.entries(map).map(([value, label]) => ({ value, label }))` — helper local sobre los mapas de `catalogos.ts` (`TIPOS`, `PRIORIDADES`).

Resolver: `useForm({ resolver: zodResolver(schema), defaultValues })`. `formState.isSubmitting` alimenta el `isLoading` del botón; usar `mutateAsync` dentro de `onSubmit` para que `isSubmitting` refleje la mutación.

> Extensión menor (opcional, slice 1): añadir prop `error?: boolean` a `<Select>` para pintar `border-destructive` vía su `className`. No bloqueante: `FormField` ya muestra el mensaje.

---

## 3. Schemas Zod por operación (espejan el contrato backend)

`features/tickets/schemas.ts`. Verificado contra el contrato confirmado en proposal (engram #1518).

```ts
// CREATE — POST /tickets (todos los campos del form; solicitanteId NO va en el form)
export const CreateTicketSchema = z.object({
  titulo:           z.string().min(1, 'El título es requerido').max(255),
  descripcion:      z.string().max(1000).optional(),
  tipoId:           z.string().uuid('Seleccioná un tipo'),
  prioridadId:      z.string().uuid('Seleccioná una prioridad'),
  cicloId:          z.string().uuid().optional().nullable(),
  fechaVencimiento: z.string().optional().nullable(),  // <input type="date"> → 'YYYY-MM-DD'
});
export type CreateTicketForm = z.infer<typeof CreateTicketSchema>;
// El DTO que viaja añade solicitanteId en el submit:
export type CreateTicketInput = CreateTicketForm & { solicitanteId: string };

// UPDATE — PATCH /tickets/:id (parcial; SIN tipoId, SIN estado → el contrato los excluye, 422 si van)
export const UpdateTicketSchema = z.object({
  titulo:           z.string().min(1).max(255).optional(),
  descripcion:      z.string().max(1000).nullable().optional(),
  prioridadId:      z.string().uuid().optional(),
  cicloId:          z.string().uuid().nullable().optional(),
  fechaVencimiento: z.string().nullable().optional(),
});
export type UpdateTicketInput = z.infer<typeof UpdateTicketSchema>;
```

Normalización de borde en el submit (no en el schema, para mantener tipos limpios): `'' → null` en `descripcion`/`cicloId`/`fechaVencimiento`; `fechaVencimiento` (date) → ISO si el backend lo exige. **DELETE no tiene schema** (sólo `id`).

---

## 4. Flujos Create / Edit / Delete

Componente único `TicketFormModal` (presentational) + `useTicketForm(mode, ticket?)` (container hook). Disparado desde la lista (`TicketsList`) y desde el detalle.

**Create**
1. Botón "Nuevo ticket" (gateado, §5) → `setOpen(true)`.
2. `useTicketForm('create')`: `useForm({ resolver: zodResolver(CreateTicketSchema), defaultValues: vacíos })`.
3. `onSubmit(values)`:
   ```ts
   try {
     await createTicket.mutateAsync({ ...normalize(values), solicitanteId: user.sub });
     notify.success('Ticket creado');
     reset(); onOpenChange(false);
   } catch (err) {
     setError('root', { message: mapApiError(err) });
     notify.error(mapApiError(err));   // modal queda abierto
   }
   ```
   `user.sub` viene de `useSession().user` — **solicitante automático, NO es un campo del form**.
4. `onSuccess` del hook invalida `queryKeys.tickets.all` → la lista refetchea sola.

**Edit**
1. Botón "Editar" por fila (gateado) → abre el modal con `ticket` preseleccionado.
2. `useTicketForm('edit', ticket)`: `defaultValues` = `{ titulo, descripcion, prioridadId, cicloId, fechaVencimiento }` del ticket. **NO** se renderiza `tipo` ni `estado`.
3. `onSubmit` → `updateTicket.mutateAsync({ id: ticket.id, dto: normalize(values) })` → toast + cierre + invalida `all` y `detail(id)`.

**Delete**
1. Botón "Borrar" (gateado, `variant="ghost"` icono) → `setConfirmOpen(true)`.
2. `<ConfirmDialog>` con `isLoading={deleteTicket.isPending}`.
3. `onConfirm` → `deleteTicket.mutateAsync(ticket.id)`. **204 idempotente** → `apiFetch` devuelve `undefined` (verificado en `normalize.ts`). Éxito → `notify.success('Ticket eliminado')` + cierra dialog + invalida `all`. Error → `notify.error(mapApiError(err))`, dialog permanece.

---

## 5. Permisos en UI (§7: sólo UX, backend es la autoridad)

Gateo con `useSession().can(permiso)` (hook ya existente, devuelve `false` mientras `user === null`).

| Botón | Permiso | Comportamiento |
|-------|---------|----------------|
| Nuevo ticket | `ticket:crear` | `if (!can('ticket:crear')) return null` (ocultar) |
| Editar | `ticket:editar` | ocultar/deshabilitar fila-acción |
| Borrar | `ticket:eliminar` | ocultar/deshabilitar fila-acción |

Esto es **conveniencia visual**: el backend re-valida cada request (un usuario que fuerce el request igual recibe 403 → `mapApiError` lo traduce). Nunca confiar en el check del front para seguridad.

---

## 6. Estrategia Test-First (Constitución §4/§5 — TDD estricto, tests atómicos)

Stack: Vitest + RTL + MSW (ya instalado). Server MSW en `frontend/test/msw/server.ts`, handlers en `test/msw/handlers.ts`; polyfills de Radix (pointer/ResizeObserver/scrollIntoView) ya en `vitest.setup.ts`; helper JWT en `test/helpers/jwt.ts`. MSW intercepta `http://localhost/api/...`.

**Qué se mockea**: SÓLO los endpoints HTTP del BFF (`http.post/patch/delete('http://localhost/api/tickets...')`). El `SessionProvider` se provee con un `user` falso (objeto, no red). `notify` se espía (`vi.spyOn(notify, 'success'|'error')`) en vez de asertar el portal de sonner. Sin over-mocking (§5.2).

| Pieza | Test RED (contrato primero) | Tipo |
|-------|------------------------------|------|
| `FormField` | label visible; `role="alert"` con `error`; sin alert sin error; children renderizados | unit atómico, sin red |
| `Textarea` | `forwardRef` recibe ref; `error` aplica borde destructivo | unit |
| `FormModal` | `open` → title+children en DOM; cerrado → ausente; ESC/overlay → `onOpenChange(false)` | unit (Radix, polyfills ok) |
| `ConfirmDialog` | render title/description; Confirm → `onConfirm`; Cancel → `onOpenChange(false)`; `isLoading` bloquea Confirm | unit |
| `mapApiError` | 0→red; 404→legible; 422→`err.message`; default→genérico | unit puro |
| `CreateTicketSchema` | válido pasa; sin `titulo` falla; `tipoId` no-uuid falla | unit puro |
| `UpdateTicketSchema` | parcial válido; `tipoId`/`estado` ausentes del shape | unit puro |
| `useCreateTicket` + `TicketFormModal` (create) | POST 201 → body lleva `solicitanteId=user.sub`, toast success, modal cierra, lista invalida; 422 → banner `root` + toast error, modal abierto | integración (MSW) |
| `TicketFormModal` (edit) | defaultValues precargados; PATCH body **excluye** tipo/estado; success cierra+invalida | integración (MSW) |
| `useDeleteTicket` + `ConfirmDialog` | DELETE 204 → toast success + invalida + cierra; error → toast error, dialog abierto | integración (MSW) |
| Gateo permisos | botón ausente cuando `!can(permiso)` | unit (SessionProvider fake) |

Regla §5.5: si un test falla 2 veces seguidas, DETENER y reportar — no parchear a ciegas.

---

## 7. Plan de slices (auto-chain, objetivo < 400 líneas c/u)

```
Slice 1 (infra)  ──┬──► Slice 2 (create) ──► Slice 3 (edit)
                   └──► Slice 4 (delete)
```

| Slice | Contenido | Deps | Riesgo presupuesto |
|-------|-----------|------|--------------------|
| **1 — Infra compartida** | Instalar deps; `FormField`, `Textarea`, `FormModal`, `ConfirmDialog`, `notify`+`<Toaster>` en layout, `mapApiError` + tests RED | — | **Alto** (~380 líneas) — si excede, separar tests a un sub-PR |
| **2 — Create** | `schemas.ts` (Create), `useCreateTicket`, `useTicketForm('create')`, `TicketFormModal`, wiring botón "Nuevo" en `TicketsList` + gateo + tests | Slice 1 | **Alto** (~400) — vigilar; el modal es el grueso |
| **3 — Edit** | `UpdateTicketSchema`, `useUpdateTicket`, modo edit de `useTicketForm`/`TicketFormModal` (reusa slice 2), botón "Editar" + gateo + tests | Slices 1, 2 | Medio (~200) |
| **4 — Delete** | `useDeleteTicket`, wiring `ConfirmDialog` desde la lista, botón "Borrar" + gateo + tests | Slice 1 (independiente de 2/3) | Bajo (~150) |

Slice 4 puede ir en paralelo a 2/3 (sólo depende de la infra). Slice 3 reusa `TicketFormModal` de 2 → debe ir después.

---

## 8. Decisiones ADR-style

- **ADR-1 — Errores del servidor = form-level, no field-level.** El backend devuelve strings de dominio únicos sin estructura por campo (`messages=[string]`). Mapear a un campo sería adivinar. → banner `root` + toast. Field-level queda exclusivamente para Zod (cliente). *Rechazado*: parsear el string para inferir el campo (frágil, se rompe con cualquier cambio de copy backend).
- **ADR-2 — `FormModal` sobre `@radix-ui/react-dialog`, `ConfirmDialog` sobre `@radix-ui/react-alert-dialog`.** Dialog permite ESC/click-outside (correcto para forms); alert-dialog los bloquea (correcto para destructivo). *Rechazado*: un solo primitivo para ambos (semántica de dismiss incompatible).
- **ADR-3 — Hooks de mutación puros (mutationFn + invalidate); efectos UI en el container.** Los hooks no conocen rhf ni toasts → clonables × 4 entidades sin acoplamiento. `setError('root')` necesita contexto rhf, por eso vive en `useTicketForm`. *Rechazado*: meter toast/close en `onSuccess` del hook (acopla el hook a la UI del modal).
- **ADR-4 — `<Toaster>` en `app/layout.tsx` (body, post-`Providers`).** Único island global; `RootLayout` permanece Server Component. *Rechazado*: montarlo por feature (duplica, descoordina posición).
- **ADR-5 — Helper `notify` en vez de usar `toast` directo.** Swappable + espiable en tests. Coste: una capa trivial.
- **ADR-6 — `solicitanteId = user.sub` inyectado en submit, fuera del schema.** El form no lo colecta; el DTO lo añade al enviar. Evita un Select de usuarios inexistente y respeta el contrato.
