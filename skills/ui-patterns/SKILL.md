---
name: ui-patterns
description: "Trigger: UI, button, botón, formulario, form, input, list, browser, combobox, select, tabla, table, modal, dialog, componente, layout. Apply framework-agnostic UI patterns — copy into each project and bind to its framework."
license: Apache-2.0
metadata:
  author: gentleman-programming
  version: "1.0"
---

## Activation Contract

Apply when creating UI components — forms, lists, tables, buttons, inputs, modals, layouts. This skill is deliberately framework-agnostic. **When copied into a project**, replace the `[PROJECT-SPECIFIC]` slots with that project's framework and conventions.

## Hard Rules

### Data Flow (NON-NEGOTIABLE)

```
User Action → DTO (validate transport) → Use Case → Result → UI Update

NO business logic in UI. NO direct API calls in components.
UI calls a use case / hook / service that returns Result<T, E>.
```

### Framework Bindings (fill these per project)

```yaml
# ============================================================
# [PROJECT-SPECIFIC] — Fill these when copying to a project
# ============================================================
# framework: react | expo-react-native | angular | vue | svelte
# ui-library: tamagui | shadcn | material-ui | chakra | radix
# forms: react-hook-form | angular-forms | vee-validate
# tables: tanstack-table | ag-grid | prime-table
# routing: react-router | angular-router | vue-router
# state: zustand | redux | ngxs | pinia
# naming-components: PascalCase (React/Vue) | kebab-case (Angular)
# naming-functions: camelCase (React/Angular) | camelCase (Vue setup)
# file-structure: colocated | feature-folders | flat
# ============================================================
```

### Form Patterns

```
┌─────────────────────────────────────────────┐
│  [ Form Component ]                         │
│                                              │
│  DTO validation (Zod/schema) ───► errors     │
│  Submit ───► UseCase.execute(dto)           │
│  Success ───► toast + redirect/update list   │
│  Error   ───► show field errors              │
│                                              │
│  Loading state: disable button, show spinner │
│  Read-only mode: same layout, inputs locked  │
└─────────────────────────────────────────────┘
```

```typescript
// ABSTRACT PATTERN — adapt to project's framework
function FormComponent() {
  // 1. Schema-based validation (project picks Zod, Joi, class-validator)
  const schema = FormSchema // [PROJECT-SPECIFIC: import schema]
  const form = useForm({ schema }) // [PROJECT-SPECIFIC: form library]

  // 2. Submit → Use Case
  async function onSubmit(raw: FormDTO) {
    const result = await useCase.execute(raw)
    if (result.isErr()) {
      showFieldErrors(result.error)    // validation errors → fields
      showToast('error', result.error.message) // [PROJECT-SPECIFIC]
      return
    }
    showToast('success', 'Guardado correctamente')
    redirectToList() // or update optimistic state
  }

  // 3. Render fields
  return (
    <Form onSubmit={form.handleSubmit(onSubmit)}>
      <TextField name="email" label="Email" />
      <Select name="tipo" label="Tipo" options={options} />
      <DatePicker name="fecha" label="Fecha" />
      <Button type="submit" loading={form.isSubmitting}>
        Guardar
      </Button>
    </Form>
  )
}
```

### Input Patterns

| Input | Data | When to Use | Empty Value |
|-------|------|-------------|-------------|
| TextField | `string` | Nombres, descripciones, títulos | `""` (not null) |
| NumberField | `number` | Edad, cantidad, precio | `null` if optional |
| Select (combo) | `enum \| union \| foreignKey` | Tipo de documento, provincia, estado civil | `null` + placeholder |
| MultiSelect | `T[]` | Categorías, roles múltiples | `[]` |
| DatePicker | `Date \| DateTime` | Fecha de cita, vencimiento, nacimiento | `null` |
| Switch | `boolean` | Activo/inactivo, habilitado | `false` |
| FileUpload | `File \| FileId` | Imagen, plano, radiografía | `null` |
| TextArea | `string` | Observaciones, descripciones largas | `""` |
| RadioGroup | `enum` | <4 opciones mutuamente excluyentes | selected value |

**Select/Combobox Rules:**
- Always show a placeholder (`"Seleccionar..."`) when nullable
- If options are from DB (categorías, productos), fetch via query use case, NOT inline in the UI
- Show loading skeleton while options load
- Allow search/filter when >10 options
- Show `noResults` message when filter yields empty

**FileUpload Rules:**
- Show preview for images/PDFs before submit
- Validate file type + size client-side (security re-validates server-side)
- Show upload progress bar
- Return FileId (from file-storage) on success
- Allow remove before submit

### List / Browser Patterns

```
┌──────────────────────────────────────────────────┐
│  Header: title + action buttons (Crear, etc.)    │
│                                                   │
│  Filters ───► [search input] [select filters]    │
│                                                   │
│  Table / Cards / Grid (configurable per project)  │
│  ┌───┬────────────┬──────────┬──────────┬──────┐ │
│  │ # │  Nombre    │ Estado   │  Fecha   │ Acc. │ │
│  ├───┼────────────┼──────────┼──────────┼──────┤ │
│  │ 1 │ Juan Perez │ Activo   │ 13/05/26 │ ✏️ 🗑️ │ │
│  │ 2 │ Ana Lopez  │ Inactivo │ 12/05/26 │ ✏️ 🗑️ │ │
│  └───┴────────────┴──────────┴──────────┴──────┘ │
│                                                   │
│  Pagination: ◀ 1 2 3 ... 10 ▶                    │
│  Empty state: "No hay registros" + create button  │
│  Loading state: skeleton / spinner                 │
│  Error state: alert + retry button                 │
└──────────────────────────────────────────────────┘
```

```typescript
// ABSTRACT LIST PATTERN — adapt to project's framework
function EntityList() {
  // [PROJECT-SPECIFIC: pagination + filter state (useSearchParams or state)]

  // 1. Fetch via query use case
  const { data, pagination, isLoading, error } = useQuery(
    () => queryUseCase.execute({ page, pageSize, filters }),
    // [PROJECT-SPECIFIC: React Query / SWR / Angular resolver]
  )

  // 2. States
  if (isLoading) return <SkeletonTable rows={5} />
  if (error) return <ErrorAlert message={error.message} onRetry={refetch} />
  if (data.length === 0) return <EmptyState
    title="No hay registros"
    action={<Button onClick={onCreate}>Crear primero</Button>}
  />

  // 3. Table
  return (
    <Page>
      <Header title="Entidades" actions={<Button onClick={onCreate}>+ Nueva</Button>} />
      <Filters>
        <SearchInput value={search} onChange={setSearch} />
        <Select value={statusFilter} onChange={setStatusFilter} options={statusOptions} />
      </Filters>
      <Table columns={columns} data={data} onRowClick={onEdit} />
      <Pagination page={page} totalPages={totalPages} onChange={setPage} />
    </Page>
  )
}
```

### Button Patterns

| Type | Color | When | Behavior |
|------|-------|------|----------|
| Primary | Brand color | Main action (Crear, Guardar, Confirmar) | Submit form or navigate |
| Secondary | Neutral | Alternative action (Cancelar, Volver) | Navigate back or reset |
| Danger | Red | Destructive (Eliminar, Anular, Dar de baja) | **Always** show confirmation dialog |
| Ghost | None | Table row actions, toolbar icons | No background, icon-only |
| Link | Text style | Navigate to detail, "Ver más" | Navigation, no visual button |
| Icon | Transparent | Edit, delete, view in table rows | Only icon, tooltip on hover |

**Confirmation Dialog (DEATH ROW for destructive actions):**

```typescript
// Every destructive action follows this pattern:
function handleDelete(id: EntityId) {
  // 1. Show confirmation
  const confirmed = await showConfirmDialog({
    title: '¿Eliminar registro?',
    message: 'Esta acción no se puede deshacer',
    confirmLabel: 'Eliminar',
    variant: 'danger',
  })

  if (!confirmed) return

  // 2. Execute
  const result = await deleteUseCase.execute(id)
  if (result.isErr()) {
    showToast('error', result.error.message)
    return
  }

  // 3. Update list
  removeFromList(id)
  showToast('success', 'Registro eliminado')
}
```

### Modal / Dialog Patterns

| Type | When | Content | Close Behavior |
|------|------|---------|---------------|
| FormModal | Create / Edit entity | Full form with validation | Unsaved changes warning |
| ConfirmDialog | Destructive actions | Title + message + confirm/cancel | ESC closes without action |
| DetailDrawer | Quick view | Read-only details in side panel | Click outside closes |
| FullScreenModal | Complex forms (odonto, boletín) | Full page, no background | Warn before close |

**FormModal Pattern:**

```typescript
function EntityFormModal({ open, entityId, onClose }) {
  const isEditing = entityId !== undefined

  // Fetch existing data if editing
  const { data } = useQuery(() => fetchUseCase.execute(entityId), {
    enabled: isEditing,
    // [PROJECT-SPECIFIC: React Query enabled option or equivalent]
  })

  // Pre-populate form when data arrives
  const form = useForm({ schema: FormSchema, defaultValues: data })

  async function onSubmit(raw: FormDTO) {
    const result = isEditing
      ? await updateUseCase.execute(entityId, raw)
      : await createUseCase.execute(raw)

    if (result.isOk()) {
      onClose(true) // true = refresh parent list
      showToast('success', isEditing ? 'Actualizado' : 'Creado')
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={isEditing ? 'Editar' : 'Crear'}>
      <Form onSubmit={form.handleSubmit(onSubmit)}>
        {/* fields */}
        <ModalFooter>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" loading={form.isSubmitting}>
            {isEditing ? 'Guardar cambios' : 'Crear'}
          </Button>
        </ModalFooter>
      </Form>
    </Modal>
  )
}
```

### Table / Grid Patterns

| Feature | Implementation |
|---------|---------------|
| Sortable columns | Click header → toggle asc/desc → re-fetch with sort param |
| Row actions | Last column with edit/delete/view icons or dropdown |
| Selection | Checkbox column for bulk actions (eliminar múltiple, exportar) |
| Expandable row | Click row → show detail panel or expanded sub-row |
| Sticky header | Always visible on scroll. Critical for long lists. |
| Responsive | Columns collapse → stacked cards on mobile |
| Column visibility | Allow user to show/hide columns (persist preference) |

### State Display Patterns (Loading / Empty / Error / Success)

```typescript
// Use a <DataState> wrapper for every data-fetching component:
function DataState<T>({ data, isLoading, error, children, emptyMessage, onRetry }) {
  if (isLoading) return <Skeleton />
  if (error) return <ErrorAlert message={error} action={<Button onClick={onRetry}>Reintentar</Button>} />
  if (!data || data.length === 0) return <EmptyState message={emptyMessage} />
  return children(data)
}
```

### Decision Gates

| Question | What to Do |
|----------|-----------|
| ¿Formulario simple (3-5 campos)? | Inline form, no modal |
| ¿Formulario complejo (>5 campos, con sub-recursos)? | Modal o página dedicada |
| ¿Crear vs Editar? | Mismo modal, cambia título y endpoint. Pre-populate en edición. |
| ¿Lista con >20 registros? | Server-side pagination + search + filters |
| ¿Lista con <20 registros? | Client-side filter, no pagination needed |
| ¿Acción destructiva? | Confirmation dialog + toast on success/error |
| ¿Select con opciones de DB? | Fetch async, show loading skeleton, allow search |
| ¿Mobile responsive? | List → stacked cards. Form → full width. Modal → full screen. |

### Name & Structure Convention Hints

```
[PROJECT-SPECIFIC: fill these per project]

Components:     EntityForm, EntityList, EntityTable, EntityModal
Hooks:          useEntity, useEntityList, useEntityForm
Files:          entity-form.tsx, entity-list.tsx
Props:          { entityId?: string; onClose: (refreshed: boolean) => void }
State:          EntitiesState = { items: T[], isLoading: boolean, error?: Error }
```

## Execution Steps

1. Identify which UI pattern the request matches (form, list, input, button, modal, table).
2. Apply the generic pattern from this skill.
3. For `[PROJECT-SPECIFIC]` slots: use the project's framework, library, and naming conventions.
4. Ensure the data flow follows: UI → DTO → Use Case → Result → UI Update.
5. Verify: no business logic in UI, confirmation on destructive actions, loading/empty/error states handled.

## Output Contract

Return: UI component(s) following the pattern, framework-agnostic structure, `[PROJECT-SPECIFIC]` slots resolved per the project's conventions, and verification that the data flow is correct (UI doesn't call API directly).

## References

- `api-design/SKILL.md` — DTOs and API contracts that forms submit to
- `error-handling/SKILL.md` — Result type consumed by UI after use case execution
- `file-storage/SKILL.md` — FileUpload pattern integration
- `auth-access/SKILL.md` — show/hide buttons based on permissions
