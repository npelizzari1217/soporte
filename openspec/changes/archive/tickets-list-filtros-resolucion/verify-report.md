# Verify Report — tickets-list-filtros-resolucion

**Fecha**: 2026-06-29  
**Rama verificada**: `feat/rbac-pr4b-comentarios-endpoint` (stacked sobre `feat/tlfr-pr5-frontend-form`)  
**Veredicto**: PASS-WITH-WARNINGS · 1 CRITICAL · 2 WARNING · 1 SUGGESTION

---

## Test Suite — Resultados reales

| Suite | Archivos | Tests | Duración |
|-------|----------|-------|----------|
| Backend vitest | 114 PASS | **1770/1770** | 103.80s |
| Frontend vitest | 49 PASS | **392/392** | 43.34s |
| Backend `pnpm lint` | — | **0 errors** | — |
| Frontend `next lint` | — | **3 warnings pre-existing** (no son de este change) | — |
| Backend `tsc --noEmit` | — | **0 errors** | — |
| Frontend `tsc --noEmit` | — | **0 errors** en archivos tlfr; ~30 pre-existing en `sidebar/user-menu/app-shell/layout.test.tsx` del change RBAC stacked | — |

---

## Gates

| # | Gate | Estado | Evidencia |
|---|------|--------|-----------|
| G1 | `GET /tickets/ciclo-activo` → 404 cuando no hay ciclo (spec gana vs ADR-2 200-null) | ✅ PASS | `NotFoundException` lanzado en controller L306-308 |
| G2 | `useCicloActivo` 404 → `data = null`, `error = null` | ✅ PASS | Catch de `ApiError.statusCode === 404` → return `null` |
| G3 | `fechaResolucion` obligatoria al transicionar a RESUELTO, 422 si falta | ⚠️ WARNING | Comportamiento correcto (422) pero campo HTTP es `fechaCierre` no `fechaResolucion` (renombrado por change stacked) |
| G4 | Reapertura desde RESUELTO limpia `fechaResolucion` a null | ❌ CRITICAL | RESUELTO es terminal (change stacked). Escenario del spec inalcanzable |
| G5 | Cero ocurrencias `fechaVencimiento` en `.ts/.tsx` fuera de `openspec/` | ✅ PASS | `rg` scan: 0 hits en archivos de implementación |
| G6 | ORDER: `created_at DESC, tipos_ticket.nombre ASC` | ✅ PASS | `orderBy: [{ createdAt: 'desc' }, { tipo: { nombre: 'asc' } }]` en `PrismaTicketRepository.findAll` |
| G7 | `POST /tickets` acepta `fechaCreacion` (incluso futura, sin restricción de rango) | ✅ PASS | `dto.fechaCreacion?: Date`, sin refine de rango en schema ni en use case |
| G8 | Form: tiene `fechaCreacion`, NO tiene `fechaVencimiento` ni `fechaResolucion` | ✅ PASS | `CreateTicketSchema` tiene sólo `fechaCreacion`; modal: `id="fechaCreacion"`, sin campo de resolución en DOM |
| G9 | `defaultTipoId` pre-pobla si exactamente 1 tipo filtrado | ✅ PASS | `filtros.tiposIds?.length === 1 ? filtros.tiposIds[0] : ""` en `page.tsx` |
| G10 | `FiltrosBar` con 3 controles de tipo + inputs de fecha | ✅ PASS | Componente existe; prop `tiposDisponibles`, `fechaDesde`/`fechaHasta` inputs |
| G11 | `useTickets` con filtros + queryKey parametrizado | ✅ PASS | `queryKeys.tickets.list(filtros)` → `["tickets","list",filtros]` |
| G12 | Sin ciclo activo → `role="alert"` + `useTickets` deshabilitado | ✅ PASS | `enabled = !!ciclo && !loadingCiclo`; elemento alert con texto "ciclo activo" |
| G13 | `invalidateQueries` apunta a `queryKeys.tickets.all` (raíz) | ✅ PASS | `["tickets"]` como raíz en `query-keys.ts`; mutaciones usan `.all` |

---

## CRITICAL Issues

### CRITICAL-1: Reapertura desde RESUELTO no implementada

**Spec requiere** (tickets-core/spec.md): "Reapertura desde RESUELTO → `tickets.fecha_resolucion` MUST ser NULL" — escenario explícito con transición RESUELTO → EN_PROGRESO.

**Estado actual**: El state machine (`base-ticket-state-machine.ts`) tiene RESUELTO como terminal sin arcos de salida. El change stacked `tickets-maquina-estados-observaciones` (migration `20260629030000_rename_fecha_resolucion_fecha_cierre`, commit `a92e34b`) eliminó explícitamente el arco de reapertura con ADR-1 de ese change. El test de `transicionar-estado.use-case.spec.ts` documenta explícitamente la sección "reapertura — ELIMINADA (ADR-1)".

**Origen**: diseño deliberado del change stacked, no un olvido en tlfr. El change tlfr SÍ implementó T3.4/T3.5 originalmente; el stacked change lo removió.

**Impacto**: el escenario del spec es permanentemente inalcanzable en el árbol actual.

**Resolución recomendada**: actualizar el spec del change tlfr para documentar que el arco de reapertura fue eliminado en el change siguiente, o emitir un delta-spec en `tickets-maquina-estados-observaciones` que amende el requisito.

---

## WARNING Issues

### WARNING-1: Campo HTTP `fechaCierre` vs spec `fechaResolucion`

El spec especifica el campo `fechaResolucion` en el body de `PATCH /tickets/:id/estado` y en el tipo `Ticket` de respuesta. La implementación actual usa `fechaCierre` en:

- `TransicionarEstadoHttpDto.fechaCierre`
- Error de dominio: `FechaCierreRequeridaError` (spec dice `FechaResolucionRequeridaError`)
- Entidad: `setFechaCierre()`, `ticket.fechaCierre`
- Frontend `Ticket.fechaCierre: string | null`
- DB column: `fecha_cierre` (renombrado desde `fecha_resolucion` por migration `20260629030000`)

El comportamiento funcional es correcto (422 si falta, storage correcto). Pero el contrato HTTP expuesto a consumidores difiere del spec.

**Origen**: change stacked `tickets-maquina-estados-observaciones` tarea P3.T7 ("rename fechaResolucion → fechaCierre across interface").

### WARNING-2: TSC pre-existing errors en archivos del change RBAC

`sidebar.test.tsx`, `user-menu.test.tsx`, `app-shell.test.tsx`, `layout.test.tsx` tienen ~30 errores TS2558/TS2345/TS18046. No son de tlfr — están en archivos del change RBAC stacked y fueron documentados en el apply-progress de PR5.

---

## SUGGESTION Issues

### SUGGESTION-1: `tiposIds` URL param sin brackets

El spec define el parámetro como `tiposIds[]`. El frontend envía `?tiposIds=a&tiposIds=b` (sin brackets). El backend DTO declara `tiposIds?: string | string[]` y acepta ambos estilos (NestJS/qs coerce params repetidos a array). Funciona correctamente. Cosmético.

---

## Artefactos

- **Engram**: `sdd/tickets-list-filtros-resolucion/verify-report` (obs #1539)
- **openspec**: `openspec/changes/tickets-list-filtros-resolucion/verify-report.md` (este archivo)
