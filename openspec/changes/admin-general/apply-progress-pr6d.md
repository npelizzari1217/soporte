# Apply Progress — PR6d: Grupo D — Pantalla Reportes

**Change**: admin-general
**PR Slice**: PR6d — Grupo D del PR6 (pantallas admin), pantalla Reportes
**Branch**: `feat/admin-general-pr6d-reportes`
**Estado**: COMPLETE (2/2 tareas — T6.7, T6.8)
**Fecha**: 2026-07-02

---

## Tasks

- [x] T6.7 — [RED] Test `ReportesPage` (`frontend/src/features/admin/components/ReportesPage.test.tsx`, 9 tests)
- [x] T6.8 — [GREEN] Implementar pantalla Reportes

---

## TDD Cycle Evidence

| Task | RED | GREEN | REFACTOR |
|------|-----|-------|----------|
| T6.7/T6.8 | `ReportesPage.test.tsx` escrito primero; corrida confirmó fallo real: `Failed to resolve import "./ReportesPage"` (componente no existía) | Implementado `use-reportes.ts` + `ReportesPage.tsx` + ruta + CSS print; 9/9 tests verdes en el primer intento tras implementar | Sin refactor adicional — implementación limpia desde el GREEN inicial |

---

## Archivos creados/modificados

| Archivo | Acción | Tarea |
|---------|--------|-------|
| `frontend/src/features/admin/types.ts` | Modificado (append, sin pisar Cliente/Ciclo existentes) | T6.8 |
| `frontend/src/shared/api/query-keys.ts` | Modificado (append `admin.reportes.*`) | T6.8 |
| `frontend/src/features/admin/hooks/use-reportes.ts` | Creado | T6.8 |
| `frontend/src/features/admin/components/ReportesPage.tsx` | Creado | T6.8 |
| `frontend/src/features/admin/components/ReportesPage.test.tsx` | Creado (9 tests) | T6.7 |
| `frontend/src/app/(dashboard)/admin/reportes/page.tsx` | Creado (thin route wrapper) | T6.8 |
| `frontend/src/styles/globals.css` | Modificado (`.report-card` — borde reforzado en `@media print`) | T6.8 |

---

## Commits (work-unit)

```
feat(admin): add reportes types and query keys
feat(admin): add useReportes hook for parallel report fetching
feat(admin): add Reportes admin screen
docs(sdd): mark admin-general T6.7-T6.8 done (PR6d)
```

---

## Validación final (números reales)

### pnpm test

```
Test Files  57 passed (57)
      Tests  458 passed (458)
   Start at  21:48:00
   Duration  53.50s
```

Baseline previo a este PR: 56 archivos / 449 tests, todos verdes. Este PR agrega 1 archivo
de test (9 tests) y no rompe ninguno existente.

### pnpm lint

```
$ next lint
./src/components/shell/app-shell.test.tsx
  Warning: 'JwtPayload' is defined but never used.
./src/features/tickets/components/TicketFormModal.test.tsx
  Warning: 'makeWrapper' is defined but never used.
  Warning: 'dialog' is assigned a value but never used.
```

0 errores. Los 2 warnings son pre-existentes, en archivos no tocados por este PR
(verificado con `git status` antes de tocar código — ya estaban ahí en baseline).

### pnpm exec tsc --noEmit

```
(sin salida — 0 errores)
```

---

## Decisiones técnicas

- **`useQueries` (TanStack Query) en vez de `Promise.allSettled` manual**: el
  `design.md`/tasks.md describe la arquitectura como "Promise.allSettled para fetch
  paralelo sin fallo en cascada". Implementé el mismo contrato (4 fetches en
  paralelo, ninguno cascadea el fallo de otro, cada uno con su propio
  loading/error/retry) usando `useQueries`, que es el mecanismo nativo de la
  librería de fetching que ya gobierna TODO el resto del módulo admin
  (`useClientes`, `useCiclos`). Es el equivalente semántico exacto sin reinventar
  a mano el manejo de estado (loading/error/refetch/caché) que TanStack Query ya
  resuelve — más alineado con SOLID (no duplicar responsabilidad) y con el patrón
  establecido en el proyecto. Documentado aquí como decisión explícita, no como
  desviación silenciosa.
- **422 (`NoCicloActivoError`) tratado a nivel de pantalla, no por sección**: dado
  que las 4 agregaciones dependen del mismo `cicloId` resuelto por `TenantContext`,
  un 422 en una implica 422 en las 4 (misma causa raíz: no hay ciclo activo). Si
  las 4 fallan con 422 simultáneamente, se reemplaza el grid completo por UN
  mensaje amigable ("No hay ciclo activo. Seleccioná un ciclo para ver los
  reportes.") en vez de repetirlo 4 veces. Otros errores (red, 500) SÍ se muestran
  por sección con botón "Reintentar", porque son eventos independientes por
  reporte donde reintentar tiene sentido.
- **Catálogo completo en tickets-por-tipo/tickets-por-estado**: el backend (PR4,
  `PrismaReportesRepository`) garantiza catalog completeness vía LEFT JOIN — los
  arrays SIEMPRE incluyen todas las entradas del catálogo, incluso con
  `totalTickets: 0`. Por eso el chequeo de "vacío" para estas 2 secciones NO es
  `array.length === 0` (nunca lo estará) sino `array.every(x => x.totalTickets === 0)`.
  `tickets-por-usuario` sí puede tener arrays genuinamente vacíos (no es un
  catálogo fijo), así que ahí el chequeo es `length === 0` en ambas vistas.
- **`.report-card` (CSS) en vez de clases Tailwind `print:*` inline**: los bordes
  de las tarjetas en pantalla son translúcidos (`border-slate-200/50` /
  `dark:border-white/5`, glassmorphism) — el `border-white/5` del modo oscuro es
  prácticamente invisible una vez que `@media print` fuerza fondo blanco. Se
  agregó una regla `.report-card { border: 1px solid black !important }` dentro
  del bloque `@media print` ya existente en `globals.css` (mismo bloque que oculta
  sidebar/botones y fuerza blanco/negro, heredado de `frontend-design-system`).
  Sidebar/nav/botones NO se repiten en este componente — ya están cubiertos por
  las reglas globales `aside, [data-sidebar], nav, button { display: none }`.
- **Sin test de computed style para `@media print`**: igual que el precedente ya
  documentado en `globals.css` ("NOTE: no unit test — jsdom does not execute media
  queries. Verification: sdd-verify"), el test de impresión es un proxy atómico
  (assert de la clase `report-card` presente en las 4 secciones), no una
  verificación de estilos computados. Verificación visual real: sdd-verify /
  manual (Ctrl+P) o Playwright con emulación de print.
- **`useQueries` con union de queryFn distintos**: cada entrada del array tiene su
  propio tipo de retorno (`TicketsPorUsuarioReporte`, `TipoConTickets[]`, etc.);
  TypeScript infiere correctamente el tuple `[porUsuario, porTipo, porEstado,
  tiempoResolucion]` por posición sin necesitar `as any`/`as unknown as` en ningún
  punto (verificado con `tsc --noEmit`, 0 errores).

---

## Deviations from Design

Ninguna deviation material. La única diferencia con la redacción literal de
tasks.md es la elección de `useQueries` sobre `Promise.allSettled` manual,
documentada arriba con su justificación — el contrato observable (4 fetches
paralelos, sin cascada de fallos, retry independiente) es idéntico.

## Issues Found

Ninguno.

## Remaining Tasks (fuera de alcance de PR6d)

- [ ] T6.1–T6.2 (Grupo A: Clientes) — branch separada `feat/admin-general-pr6a-clientes`
- [ ] T6.3–T6.4 (Grupo B: Ciclos) — branch separada `feat/admin-general-pr6b-ciclos`
- [ ] T6.5–T6.6 (Grupo C: Usuarios) — no asignado a este batch

## Status

2/2 tareas de este batch (T6.7, T6.8) completas. Listo para sdd-verify de este slice
o para continuar con el siguiente grupo del PR6.
