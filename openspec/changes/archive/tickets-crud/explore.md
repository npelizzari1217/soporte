# Explore: tickets-crud

**Change**: tickets-crud — CRUD piloto para Tickets + infraestructura compartida de CRUD
**Fecha**: 2026-06-27
**Status**: done

---

## 1. Contrato real del backend para Tickets (escritura)

### DTOs — plain TypeScript interfaces, SIN class-validator

`backend/src/tickets/interface/dtos/tickets.dto.ts` usa interfaces planas. Comentario en el archivo: "La validación con class-validator se añade en un PR posterior si se requiere." → **no hay validación por campo en el backend**; los errores son strings de dominio únicos (no arrays por campo). La validación por campo es responsabilidad exclusiva del cliente (Zod).

### Endpoints de escritura disponibles

| Método | Path | Permiso | DTO | Descripción |
|--------|------|---------|-----|-------------|
| POST | /tickets | `ticket:crear` | `CreateTicketHttpDto` | Crear ticket |
| PATCH | /tickets/:id/estado | solo autenticado | `TransicionarEstadoHttpDto` | Transicionar estado |
| POST | /tickets/:id/asignar | `ticket:asignar` | `AsignarTicketHttpDto` | Asignar responsable |
| POST | /tickets/:id/adjuntos | `ticket:crear` | multipart `file` | Adjuntar archivo |

### CRÍTICO: No hay PATCH /tickets/:id general ni DELETE

No existe endpoint para actualizar titulo/descripcion/prioridad de un ticket existente, ni de borrado. El "CRUD" de tickets en la UI es realmente:
- **Create**: formulario completo → POST /tickets
- **Read**: lista + detalle (ya existen)
- **Update**: solo transición de estado + solo asignación (operaciones parciales)
- **Delete**: no existe

### CreateTicketHttpDto

```typescript
interface CreateTicketHttpDto {
  titulo: string                    // requerido
  descripcion?: string | null       // opcional
  tipoId: string                    // requerido, UUID → tipos_ticket (catálogo local)
  prioridadId: string               // requerido, UUID → prioridades (catálogo local)
  cicloId?: string | null           // opcional, UUID → ciclos_cliente
  solicitanteId: string             // requerido, UUID → master.usuarios
  fechaVencimiento?: string | null  // opcional, ISO date
}
// clienteId, autorId, anio → extraídos del JWT por el backend (NO van en el body)
```

### TransicionarEstadoHttpDto
```typescript
interface TransicionarEstadoHttpDto { nuevoEstadoCodigo: string } // código semántico 'EN_PROGRESO' — NO UUID
```
El frontend (catalogos.ts) tiene UUIDs→labels, NO códigos semánticos. State machine valida la transición; inválida → 422.

### AsignarTicketHttpDto
```typescript
interface AsignarTicketHttpDto { asignadoId: string } // UUID → master.usuarios
```

### Errores: 201 creado, 200 OK, 422 dominio (Solicitante/Transicion/Asignado inválidos), 404, 500 catálogo sin seed. Mensajes = strings únicos, NO arrays por campo.

---

## 2. Camino de mutación por el BFF

`apiFetch` ya soporta mutaciones: `apiFetch<T>('tickets', { method:'POST', json: dto })`. Maneja single-flight 401 refresh, errores de red (`ApiError(0,...)`), no-OK (`ApiError(status, message, messages[])`). El BFF catch-all maneja todos los verbos, CSRF (Origin check), inyecta Bearer desde cookie. `serverFetch` (RSC) es solo GET → las mutaciones van por `apiFetch` desde Client Components.

Patrón de hook de mutación (sobre use-login.ts):
```typescript
useMutation<TicketResponseDto, ApiError, CreateTicketHttpDto>({
  mutationFn: (dto) => apiFetch('tickets', { method:'POST', json: dto }),
  onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.tickets.all }),
  onError: (err) => { /* err.statusCode, err.message, err.messages[] */ },
})
```

---

## 3. Patrones existentes

- **LoginForm + use-login**: único form actual, Container/Presentational. Form management manual (`elements.namedItem()`) NO escala a 7 campos con 3 Selects controlados (Radix Select no expone ref de input nativo). El split Container/Presentational SÍ se mantiene.
- **useTickets / query-keys**: `queryKeys.tickets.all` para invalidar tras mutación.
- **catalogos.ts**: TIPOS/PRIORIDADES (para selects del create). ESTADOS tiene UUID→label pero la transición usa código semántico → falta mapa `ESTADO_CODIGOS`.
- **Rutas stub**: `/tickets/nueva` y `/tickets/[id]` existen como "próximamente"; `/tickets` lista funcional sin acciones.

---

## 4. Stack de formularios — A vs B

### Opción A: react-hook-form + zod (recomendada)
Deps: `react-hook-form` v7.54+ (React 19 ok), `zod` v3, `@hookform/resolvers`. Per-field errors → `<Input error>`; `<Controller>` para `<Select>`; `defaultValues` para edit; `formState.isSubmitting` → `<Button isLoading>`; schema Zod = contrato de validación (espeja DTOs); replicación a 4 entidades barata. Con: 3 deps, boilerplate de Controller.

### Opción B: Manual (estilo LoginForm)
Sin deps, patrón conocido. Pero 7 useState + validación por campo + Selects controlados + edit con useEffect → inaceptable a escala × 4 entidades.

**Recomendación: A.**

Schema esbozo:
```typescript
const CreateTicketSchema = z.object({
  titulo: z.string().min(1).max(255),
  descripcion: z.string().max(1000).optional().nullable(),
  tipoId: z.string().uuid(), prioridadId: z.string().uuid(),
  cicloId: z.string().uuid().optional().nullable(),
  solicitanteId: z.string().uuid(),
  fechaVencimiento: z.string().datetime().optional().nullable(),
})
```

---

## 5. Infraestructura compartida (construir una vez, reusar en 4 entidades)

- **Hooks de mutación** por operación (useCreateTicket / useTransitionTicket / useAssignTicket) — específicos por entidad para tipos correctos.
- **Dialog de confirmación**: instalar `@radix-ui/react-alert-dialog` (semántica exacta de acción destructiva, accesible).
- **Toast**: instalar `sonner` (~4kb, default Shadcn, React 19 ok) → `<Toaster/>` en root + `toast.success()`.
- **`<FormField>`** wrapper (Label + control + error) en `components/ui/`.
- **`<FormModal>`** wrapper sobre Radix Dialog (ESC/click-outside, glassmorphism) — si se elige modales.
- **Mapa `ESTADO_CODIGOS`** (código semántico → label) en `shared/lib/catalogos.ts` — verificar códigos contra la state machine.

---

## 6. Permisos / RBAC en la UI

| Operación | Permiso |
|-----------|---------|
| Crear ticket | `ticket:crear` |
| Transicionar estado | ninguno (solo auth) |
| Asignar ticket | `ticket:asignar` |

UI gatea por UX con `useSession().can(permiso)` (ocultar/deshabilitar). El backend es la autoridad real (§7). Nunca confiar en el check del front para seguridad.

---

## 7. Preguntas abiertas (decisiones del usuario antes de propose)

- **P1 Stack de form** (BLOQUEANTE): A (rhf+zod) vs B (manual). Rec: A.
- **P2 Toast** (BLOQUEANTE): sonner / react-hot-toast / inline. Rec: sonner.
- **P3 Dialog** (BLOQUEANTE): radix-alert-dialog / radix-dialog / custom. Rec: radix-alert-dialog.
- **P4 Scope del piloto** (CRÍTICO): el backend NO tiene edit general ni delete. ¿El piloto hace Create + UI de transición/asignación con lo que existe, o se expande el backend con edit/delete primero?
- **P5 `solicitanteId`** (BLOQUEANTE para el form): (a) input UUID libre, (b) Select desde endpoint `/usuarios` (¿existe?), (c) siempre el usuario autenticado (`user.sub`) → campo automático.
- **P6 `cicloId`**: ¿hay endpoint de ciclos? ¿o null por ahora?
- **P7 Modal vs página**: `/tickets/nueva` ya existe como stub de página vs modal desde la lista.
- **P8 Códigos de estado**: ¿qué transiciones válidas expone la state machine? Define la UI de cambio de estado.

---

## 8. Gaps de infraestructura

| Gap | Instalar | Recomendación |
|-----|----------|---------------|
| Form management | react-hook-form + zod + @hookform/resolvers | Instalar |
| Toast | sonner | Instalar |
| Confirmation dialog | @radix-ui/react-alert-dialog | Instalar |
| FormField / FormModal | — (componentes nuevos) | Crear en ui/ |
| ESTADO_CODIGOS | — (entry en catalogos.ts) | Agregar |
| Mutation hooks | — (por operación) | Crear en feature |

## Hallazgos clave para propose
1. **No hay "edit ticket" completo** ni delete — el backend no lo soporta. El piloto NO puede asumir un form de edición de campos genérico.
2. **DTOs sin class-validator** — Zod es la única validación por campo.
3. **`solicitanteId` ambiguo** — necesita decisión del usuario.
4. **Códigos de estado semánticos** no mapeados en el frontend.
5. **3 deps nuevas** mínimas: rhf+zod / sonner / radix-alert-dialog.
