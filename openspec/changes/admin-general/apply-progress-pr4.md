# Apply Progress — PR4: Backend Reportes

**Change**: admin-general  
**PR Slice**: PR4 — 4 agregaciones de reportes read-only por tenant+ciclo  
**Branch**: `feat/admin-general-pr4-reportes`  
**Estado**: COMPLETE (14/14 tareas)  
**Fecha**: 2026-06-30  

---

## Tasks T4.x

- [x] T4.1 — Domain port `IReportesRepository` + token `REPORTES_REPOSITORY` + `NoCicloActivoError`
- [x] T4.2 — `AdminOrGlobalGuard` + 8 tests (is_global_admin OR rol ADMINISTRADOR, O(1) JWT-only)
- [x] T4.3–T4.6 — `TicketsPorUsuarioUseCase` + 8 tests (porSolicitante + porAsignado, enriquece nombres via IUsuarioRepository, null → "Sin asignar")
- [x] T4.7 — `TicketsPorTipoUseCase` + 6 tests
- [x] T4.8 — `TicketsPorEstadoUseCase` + 6 tests
- [x] T4.9–T4.10 — `TiempoResolucionUseCase` + 7 tests (RESUELTO+SIN_SOLUCION, excluye RECHAZADO, AVG días)
- [x] T4.11 — `PrismaReportesRepository` (LEFT JOIN catálogos, $queryRawUnsafe, COUNT::int, AVG::float8)
- [x] T4.12 — `ReportesController` spec — 14 tests (4 endpoints, 422 handling, guard metadata)
- [x] T4.13 — `ReportesController` impl — 4 GET endpoints, `handleReportesError` NoCicloActivoError→422
- [x] T4.14 — `ReportesModule` + registro en `AppModule`

---

## Archivos creados/modificados

| Archivo | Tarea |
|---------|-------|
| `backend/src/reportes/domain/ports/i-reportes.repository.ts` | T4.1 |
| `backend/src/reportes/domain/errors/reportes.errors.ts` | T4.1 |
| `backend/src/reportes/infrastructure/guards/admin-or-global.guard.ts` | T4.2 |
| `backend/src/reportes/infrastructure/guards/admin-or-global.guard.spec.ts` | T4.2 |
| `backend/src/reportes/application/use-cases/tickets-por-usuario.use-case.ts` | T4.3-T4.6 |
| `backend/src/reportes/application/use-cases/tickets-por-usuario.use-case.spec.ts` | T4.3-T4.6 |
| `backend/src/reportes/application/use-cases/tickets-por-tipo.use-case.ts` | T4.7 |
| `backend/src/reportes/application/use-cases/tickets-por-tipo.use-case.spec.ts` | T4.7 |
| `backend/src/reportes/application/use-cases/tickets-por-estado.use-case.ts` | T4.8 |
| `backend/src/reportes/application/use-cases/tickets-por-estado.use-case.spec.ts` | T4.8 |
| `backend/src/reportes/application/use-cases/tiempo-resolucion.use-case.ts` | T4.9-T4.10 |
| `backend/src/reportes/application/use-cases/tiempo-resolucion.use-case.spec.ts` | T4.9-T4.10 |
| `backend/src/reportes/infrastructure/persistence/prisma/prisma-reportes.repository.ts` | T4.11 |
| `backend/src/reportes/interface/controllers/reportes.controller.ts` | T4.13 |
| `backend/src/reportes/interface/controllers/reportes.controller.spec.ts` | T4.12 |
| `backend/src/reportes/interface/dtos/reporte-query.dto.ts` | T4.13 |
| `backend/src/reportes/reportes.module.ts` | T4.14 |
| `backend/src/app.module.ts` | T4.14 |

---

## Commits (work-unit por capa)

```
e40a5cd feat(reportes): domain port IReportesRepository + NoCicloActivoError
db7fd8e feat(reportes): AdminOrGlobalGuard — permite ADMINISTRADOR OR is_global_admin (T4.2)
f9752c2 feat(reportes): use cases tickets-por-usuario, por-tipo, por-estado, tiempo-resolucion (T4.3-T4.10)
aac7b78 feat(reportes): PrismaReportesRepository — LEFT JOIN para completeness tipos/estados (T4.11)
659bb07 feat(reportes): ReportesController — 4 GET endpoints con AdminOrGlobalGuard (T4.12-T4.13)
32ac88b feat(reportes): ReportesModule + registro en AppModule (T4.14)
0318365 style(reportes): fix prettier formatting in controller + module (lint)
```

---

## Validación final (números reales)

### pnpm test

```
Test Files  24 failed | 104 passed (128)
      Tests  1404 passed (1404)
   Start at  19:05:12
   Duration  56.62s
```

**Nota**: Los 24 archivos fallidos son todos pre-existentes (`.prisma/master` no generado en worktree sin DB). Cero nuevas fallas introducidas por PR4. Los 6 spec files de reportes están en los 104 passing (49 tests propios).

### pnpm lint

```
$ eslint "src/**/*.ts"
EXIT:0
```

### npx tsc --noEmit

```
31 líneas de errores — TODOS pre-existentes (.prisma/master y .prisma/tenant no generados)
0 errores en src/reportes/ (verificado con grep)
```

---

## Decisiones técnicas

- **`$queryRawUnsafe<RawXxxRow[]>`**: evita importar `.prisma/tenant` (no generado). Usa parámetro genérico para tipar las filas — elimina `implicit any` sin `as any`.
- **`IPrismaClient` interfaz local**: declarada en `PrismaReportesRepository` para aislar del artefacto generado.
- **LEFT JOIN catálogos**: `tipos_ticket`/`estados` como tabla izquierda garantiza catalog completeness (0 counts para tipos/estados sin tickets).
- **`COUNT(...)::int`**: evita BigInt de Postgres en Node.js.
- **`AVG(fecha_cierre - created_at::date)::float8`**: DATE - DATE = INTEGER días en Postgres; AVG sobre integer retorna NUMERIC → cast a float8.
- **`vi.mock` en controller spec**: TenantGuard y JwtAuthGuard mockeados para evitar cadena de imports hacia `.prisma/master`.
- **Sin JOIN cross-DB**: enriquecimiento de nombres vía `IUsuarioRepository.findById()` en app layer (master DB), separado del query de tenant DB.
