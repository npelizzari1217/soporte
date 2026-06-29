# Archive Report — tickets-list-filtros-resolucion

**Fecha de archivado:** 2026-06-29
**Veredicto del verify:** PASS-WITH-WARNINGS
**Tests totales:** 2162/2162 GREEN (1770 backend + 392 frontend)

---

## Resumen ejecutivo

El change `tickets-list-filtros-resolucion` (tlfr) está archivado y cerrado. Todos sus 5 PRs
fueron implementados correctamente. El CRITICAL del verify-report fue resuelto vía reconciliación
de spec (no era un bug de código — era un conflicto de specs entre changes apilados). El merge
delta → spec principal se realizó sin regresión de la máquina de estados.

---

## Trazabilidad de artefactos

| Artefacto | openspec (archivado) | engram |
|-----------|---------------------|--------|
| explore | archive/tickets-list-filtros-resolucion/explore.md | — |
| proposal | archive/tickets-list-filtros-resolucion/proposal.md | obs buscable via topic `sdd/tickets-list-filtros-resolucion/proposal` |
| spec | archive/tickets-list-filtros-resolucion/specs/ | obs buscable via topic `sdd/tickets-list-filtros-resolucion/spec` |
| design | archive/tickets-list-filtros-resolucion/design.md | obs buscable via topic `sdd/tickets-list-filtros-resolucion/design` |
| tasks | archive/tickets-list-filtros-resolucion/tasks.md | obs buscable via topic `sdd/tickets-list-filtros-resolucion/tasks` |
| verify-report | archive/tickets-list-filtros-resolucion/verify-report.md | obs #1539 |
| archive-report | archive/tickets-list-filtros-resolucion/archive-report.md | topic `sdd/tickets-list-filtros-resolucion/archive-report` |

---

## Verify: PASS-WITH-WARNINGS — detalle

### Tests (REAL — pegados del verify-report)

| Suite | Archivos | Tests | Duración |
|-------|----------|-------|----------|
| Backend vitest | 114 PASS | **1770/1770** | 103.80s |
| Frontend vitest | 49 PASS | **392/392** | 43.34s |
| Backend lint | — | 0 errors | — |
| Frontend lint | — | 3 warnings pre-existing (ajenos a tlfr) | — |
| Backend tsc --noEmit | — | 0 errors | — |
| Frontend tsc --noEmit | — | 0 errors en archivos tlfr; ~30 pre-existing en archivos RBAC stacked | — |

### Gates (13/13 verificados)

| # | Gate | Resultado |
|---|------|-----------|
| G1 | GET /ciclo-activo → 404 cuando no hay ciclo | PASS |
| G2 | useCicloActivo 404 → data=null, error=null | PASS |
| G3 | fechaResolucion obligatoria al transicionar a RESUELTO (422 si falta) | WARNING (campo es `fechaCierre`) |
| G4 | Reapertura desde RESUELTO limpia fechaResolucion | CRITICAL → RESUELTO es terminal |
| G5 | Cero ocurrencias `fechaVencimiento` en .ts/.tsx fuera de openspec | PASS |
| G6 | ORDER created_at DESC, tipos_ticket.nombre ASC | PASS |
| G7 | POST /tickets acepta fechaCreacion (incluso futura) | PASS |
| G8 | Form tiene fechaCreacion, NO tiene fechaVencimiento/fechaResolucion | PASS |
| G9 | defaultTipoId cuando exactamente 1 tipo filtrado | PASS |
| G10 | FiltrosBar con 3 controles tipo + fecha range | PASS |
| G11 | useTickets con filtros + queryKey parametrizado | PASS |
| G12 | Sin ciclo activo → role=alert + useTickets deshabilitado | PASS |
| G13 | invalidateQueries usa queryKeys.tickets.all | PASS |

---

## CRITICAL resuelto — reconciliación de spec (punto central)

**CRITICAL-1 del verify:** "Reapertura desde RESUELTO no implementada"

**Diagnóstico:** No era un bug de tlfr. El change stacked `tickets-maquina-estados-observaciones`
(2026-06-29, ADR-1) convirtió `RESUELTO` en estado terminal y eliminó explícitamente el arco de
reapertura `RESUELTO → EN_PROGRESO`. El test de `transicionar-estado.use-case.spec.ts` documenta
la sección como "reapertura — ELIMINADA (ADR-1)". Los scenarios de tlfr eran inalcanzables por
diseño deliberado del change siguiente.

**Resolución:** Enmienda del spec para que sea veraz. Se reconciliaron los deltas de tlfr en las
specs principales bajo esta política:

### Lo que se mergeó (cambios verificados GREEN)

**tickets-core/spec.md:**
- Rename `fecha_vencimiento` → `fecha_resolucion` → `fecha_cierre`: historial documentado en la tabla `tickets` (columna `fecha_cierre`, L164)
- `PATCH /tickets/:id` campos editables: `fechaVencimiento` eliminado del listado; nota de superseding añadida
- Escenario: `fechaCierre` en body de PATCH es ignorado silenciosamente (nuevo)
- Requirement: Listado filtrable con orden compuesto (nuevo — G5, G6, filtros)
- Requirement: GET /tickets/ciclo-activo (nuevo — G1)
- Requirement: POST /tickets acepta fechaCreacion (nuevo — G7)
- Migración histórica `fecha_vencimiento → fecha_resolucion` (nuevo, como registro)

**tickets-ui/spec.md:**
- `CreateTicketSchema`: `fechaVencimiento` eliminado, `fechaCreacion` agregado
- `UpdateTicketSchema`: `fechaVencimiento` eliminado
- Scenarios nuevos: CreateTicketSchema acepta/rechaza fechaCreacion, no tiene fechaVencimiento/fechaResolucion
- Requirement: useTickets acepta filtros y parametriza query key (nuevo — G11)
- Requirement: useCicloActivo (nuevo — G2)
- Requirement: Panel de filtros (nuevo — G10)
- Requirement: Aviso cuando no hay ciclo activo (nuevo — G12)
- Requirement: Pre-población de tipoId (nuevo — G9)
- Requirement: fechaCreacion editable en formulario de alta (nuevo — G8)
- Requirement: Campo fechaResolucion eliminado de formularios (nuevo — G8)

### Lo que NO se mergeó (obsoleto — superado por tickets-maquina-estados-observaciones)

Los siguientes contenidos del delta de tlfr NO fueron copiados al spec principal porque
reintroducirían regresiones:

- **L229-237 delta tickets-core:** Requirement: "fechaResolucion seteada por el técnico al
  transicionar a RESUELTO" — texto que menciona `fechaResolucion` y define arco de reapertura.
  Superado: el campo es `fechaCierre` (ADR-6) y RESUELTO es terminal (ADR-1).

- **L239-276 delta tickets-core:** Scenarios de transición con `fechaResolucion`. Superados:
  el campo HTTP es `fechaCierre` (ya documentado en Requirement: fechaCierre en estados terminales).

- **L278-296 delta tickets-core:** Scenarios de reapertura ("Reapertura desde RESUELTO limpia
  fechaResolucion", "Ticket reabierto vuelve a RESUELTO"). Superados: RESUELTO es terminal,
  no hay arco de salida (ya documentado en Scenario: Reapertura RESUELTO → EN_PROGRESO ya no
  es un arco válido, L396 del spec principal).

En su lugar, se añadió la sección:
> **"Requirement: fechaResolucion al transicionar a RESUELTO — SUPERADO"**
> con referencia explícita a ADR-1 y ADR-6, explicando por qué los scenarios obsoletos
> no aplican y dónde encontrar el comportamiento vigente.

### Confirmación: el merge NO regresó la máquina de estados

Las siguientes líneas del spec principal `openspec/specs/tickets-core/spec.md` quedaron intactas:

- **L55:** `RESUELTO | Resuelto | 50 | ... | **Terminal**` — estado terminal, sin cambio.
- **L331-332:** "El flujo legacy de 4 estados (ABIERTO → EN_PROGRESO → RESUELTO → CERRADO,
  con reapertura) queda completamente reemplazado." — nota de superseding, sin cambio.
- **L396:** Scenario "Reapertura RESUELTO → EN_PROGRESO ya no es un arco válido" — sin cambio.
- **L164:** Columna `fecha_cierre` (no `fecha_resolucion`) — sin cambio; solo se añadió
  historial de renombres en la descripción.
- **Requirement: fechaCierre en estados terminales (ADR-6):** sin cambio; `fechaCierre` en HTTP.

---

## Deuda conocida (no bloqueante)

### WARNING-1: Campo HTTP `fechaCierre` vs spec original `fechaResolucion`

El spec de tlfr especificó `fechaResolucion` como campo HTTP. La implementación usa `fechaCierre`
(renombrado por el change stacked). El comportamiento funcional es correcto (422 si falta,
storage correcto en `fecha_cierre`). El spec principal ya refleja `fechaCierre` como el campo
correcto (L721 del spec principal, Requirement: fechaCierre en estados terminales). No hay
inconsistencia en el spec final — la deuda es solo histórica y está documentada.

**Impacto real:** Consumers que envíen `fechaResolucion` al API recibirán 422. El spec principal
ya documenta `fechaCierre` como campo correcto.

### WARNING-2: ~30 errores TSC pre-existing en archivos del change RBAC

`sidebar.test.tsx`, `user-menu.test.tsx`, `app-shell.test.tsx`, `layout.test.tsx` tienen ~30
errores TS2558/TS2345/TS18046. Todos pertenecen al change stacked `tickets-rbac-4-roles`, ajenos
a tlfr. Documentados en el apply-progress de PR5. Pendiente resolución en ese change.

### SUGGESTION-1: URL param tiposIds sin brackets (cosmético)

El spec define `tiposIds[]`. El frontend envía `tiposIds=a&tiposIds=b` (sin brackets). El backend
DTO acepta ambos estilos. Funciona correctamente. Cosmético. No requiere acción.

---

## Specs principales actualizadas

| Archivo | Líneas antes | Líneas después | Delta |
|---------|-------------|----------------|-------|
| `openspec/specs/tickets-core/spec.md` | 1074 | 1336 | +262 |
| `openspec/specs/tickets-ui/spec.md` | 417 | 723 | +306 |

---

## Carpeta archivada

`openspec/changes/archive/tickets-list-filtros-resolucion/`
- design.md (verbatim)
- explore.md (verbatim)
- proposal.md (verbatim)
- specs/tickets-core/spec.md (delta original — verbatim)
- specs/tickets-ui/spec.md (delta original — verbatim)
- tasks.md (verbatim)
- verify-report.md (verbatim)
- archive-report.md (este archivo)

La carpeta activa `openspec/changes/tickets-list-filtros-resolucion/` fue eliminada.
El change existe únicamente en el archive.

---

**Cerrado por:** sdd-archive executor
**Fecha:** 2026-06-29
