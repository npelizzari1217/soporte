```yaml
schema: gentle-ai.verify-result/v1
evidence_revision: sha256:f645f122f7bd4951d47766ced56264dad04430e881feec7973460e428ec41ee4
verdict: fail
blockers: 1
critical_findings: 1
requirements: 11/11
scenarios: 35/35
test_command: (cd backend && pnpm test) && (cd frontend && pnpm test)
test_exit_code: 0
test_output_hash: sha256:abf507376b1c8ce98c60ea5b20f4d507d05fb990b5432f8bf021b7b326b434c1
build_command: (cd backend && pnpm typecheck && pnpm lint && pnpm build) && (cd frontend && pnpm type-check && pnpm lint && pnpm build)
build_exit_code: 0
build_output_hash: sha256:ce3a871bce97bc3d8cfeb9b3c6930712773994493467bc8eead07b0ad2fa4710
```

## Verification Report

**Change**: reporte-stock-insumos
**Version**: N/A (delta spec `specs/reporte-stock-insumos/spec.md`)
**Mode**: Standard (feature; strict TDD not active)
**Branch / revision**: `feat/reporte-stock-insumos-wu06-2` at `327543df`; `main` = merge-base = `089d5f2d`; evidence = sha256 of `git diff main...327543df`.

### Verdict

**FAIL**: one blocker. The repository quality gate `node scripts/check-casts-en-specs.mjs` exits 1 on this cycle's diff. CI runs this gate in `.github/workflows/gates-backend.yml:109`, and the roadmap says it is run by hand before integrating. All 35 scenarios have a covering test that passed at runtime, and every other gate is green. The blocker is a two-line fix in one spec file.

### Completeness

| Metric | Value |
|---|---|
| Tasks total | 44 |
| Tasks complete | 44 |
| Tasks incomplete | 0 |

`gentle-ai sdd-status reporte-stock-insumos` reports `apply: all_done`, `tasks: 44/44 complete`, `verify: ready`. The task checkboxes match the code: every file named in tasks 1.1 to 6.6 exists in `git diff main...HEAD` with the described content.

### Build and Tests Execution

| Gate | Command | Exit | Result |
|---|---|---|---|
| Backend lint | `cd backend && pnpm lint` | 0 | zero errors |
| Backend typecheck | `cd backend && pnpm typecheck` | 0 | clean |
| Backend tests | `cd backend && pnpm test` | 0 | 526 files / 6609 tests passed |
| Backend build | `cd backend && pnpm build` | 0 | clean |
| Frontend lint | `cd frontend && pnpm lint` | 0 | "No ESLint warnings or errors" |
| Frontend typecheck | `cd frontend && pnpm type-check` | 0 | clean |
| Frontend tests | `cd frontend && pnpm test` | 0 | 225 files / 1734 tests passed |
| Frontend build | `cd frontend && pnpm build` | 0 | route `/insumos/reporte-stock` built (static segment next to `/insumos/[id]`) |
| Roadmap freshness | `node scripts/check-roadmap-fresco.mjs` | 0 | "El roadmap esta fresco" (3 decisions declared) |
| Gate coverage | `node scripts/check-gate-coverage.mjs` | 0 | 2/2 projects covered |
| **Casts ratchet** | `node scripts/check-casts-en-specs.mjs` | **1** | **668 in 122 files vs base 666 in 121; `reporte-stock-insumos.controller.spec.ts: 0 -> 2`** |

The backend output includes known noise that does not affect the result: `orden-de-arranque.spec.ts` reports "Falta configurar" from its child processes, and `CorreoDeClienteAdapter`/Prisma errors are logged during green runs. The suite exits 0 with 526/526 files passed.

A focused verbose re-run of the 9 backend files for this cycle passed 99/99 tests, including the e2e on an ephemeral tenant and the integration specs on Postgres. A focused verbose run of the 6 frontend files passed all tests. Coverage was not measured (`coverage_threshold: 0`).

**Adversarial mutation (`rules.verify`)**, applied locally, reverted, with a clean tree confirmed afterwards (`git status --porcelain` empty):

1. `evaluarReposicion(saldos.NUEVO, ...)` changed to `saldos.total` in `consultar-reporte-stock.use-case.ts`. Result: 3 red tests ("cada fila del reporte coincide con la ficha...", "NINGUNO: valores esperados...", "los usados no tapan el faltante..."). Reverted, back to green.
2. The `CeldaNumericaCsv` bypass in `escaparValor` (`csv.ts`) disabled. Result: 2 red tests ("un negativo sale sin apostrofo", "un negativo sale sin apostrofo ni comillas"). Reverted, back to green.

### Spec Compliance Matrix

Abbreviations:
- B-core = `backend/src/insumos/application/use-cases/consultar-reporte-stock.use-case.spec.ts`
- B-exp = `.../exportar-reporte-stock.use-case.spec.ts`
- B-ficha = `.../reporte-stock-coincide-con-ficha.integration.spec.ts`
- B-cat / B-mov / B-uni = `backend/src/insumos/infrastructure/persistence/prisma/prisma-{insumo,movimiento-insumo,unidad-insumo}.repository.reporte-stock.integration.spec.ts`
- B-ctl = `backend/src/insumos/interface/controllers/reporte-stock-insumos.controller.spec.ts`
- B-e2e = `.../reporte-stock-insumos.e2e.spec.ts`
- B-csv = `backend/src/shared/infrastructure/csv/csv.spec.ts`
- F-view = `frontend/src/features/insumos/components/reporte-stock-view.test.tsx`
- F-cat = `.../catalogo-insumos-list-view.test.tsx`
- F-fmt = `frontend/src/features/insumos/lib/formato-cantidad.test.ts`
- F-fil = `.../lib/filtros-reporte-stock.test.ts`
- F-hook = `frontend/src/features/insumos/hooks/use-reporte-stock.test.tsx`

| Req | Scenario | Covering test(s), all passed at runtime | Result |
|---|---|---|---|
| R1 | The response carries the generation instant | B-e2e "lleva generadoEn en ISO y las filas con saldos y estado"; B-ctl "devuelve generadoEn en ISO..."; B-core "generadoEn es el de ahora() y se toma antes de la primera lectura"; F-view "renderiza la tabla ... y el instante de generación (R1, R2)" (the screen shows it) | COMPLIANT |
| R1 | The CSV records the generation time | B-exp "con reloj 2026-10-02T01:30Z el nombre lleva la fecha argentina y la celda la hora" (`01/10/2026 22:30`) | COMPLIANT |
| R2 | Columns of a row | B-core "arma las columnas de una fila: NUEVO 3, USADO 2, minimo 5 => total 5 y BAJO_MINIMO"; B-exp "columnas y etiquetas exactas" + "etiquetas de tipo, estado y reposicion" (Tipo = Repuesto); F-view "renderiza la tabla con las columnas del CSV..." | COMPLIANT |
| R2 | Item without a reorder point | B-core "un insumo sin punto de reposicion queda con stockMinimo nulo y SIN_PUNTO_DEFINIDO"; B-cat "convierte stockMinimo Decimal a number y conserva null"; B-exp "etiquetas de tipo..." (empty cell); F-view "sin punto de reposición muestra guion y su estado (R2)" | COMPLIANT |
| R3 | Filter by family and type | B-cat "filtra por familiaId", "filtra por esRepuesto en ambos sentidos", "combina familiaId y esRepuesto"; B-core "pasa los filtros de familia y tipo al catalogo"; B-e2e "con los cuatro filtros combinados..." (other family excluded) | COMPLIANT |
| R3 | Below minimum only | B-core "solo bajo minimo deja unicamente BAJO_MINIMO (tres estados presentes)" | COMPLIANT |
| R3 | Disabled item included with its state | B-core "un insumo deshabilitado con stock 4 aparece con su estado"; B-ficha "el deshabilitado y el de familia deshabilitada estan presentes con su estado"; B-cat "excluye la baja lógica, incluye el deshabilitado..." | COMPLIANT |
| R3 | Item in a disabled family included | B-core "un insumo de familia deshabilitada aparece"; B-ficha (same test); B-cat (same test) | COMPLIANT |
| R3 | Hide items without stock | B-core "ocultar sin stock > oculta solo NUEVO 0 y USADO 0; deja total 2, saldo negativo y 3/-3" + "sin el filtro muestra las cuatro" | COMPLIANT |
| R3 | Logically deleted item excluded, as in the item record | B-ficha "la baja logica no esta en el reporte y la ficha responde no encontrado"; B-cat "excluye la baja lógica..." | COMPLIANT |
| R3 | Same filters on screen and in the export | B-e2e "con los cuatro filtros combinados el CSV tiene las mismas filas y el mismo orden"; B-exp "pasa al nucleo los mismos filtros que recibio"; F-view "\"Exportar a Excel\" pide el mismo query string que la consulta"; F-fil "un solo serializador..." | COMPLIANT |
| R4 | No money column | B-e2e "ni el JSON ni el CSV traen claves o columnas de dinero"; B-exp "no lleva ninguna columna ni dato de dinero, aun si el nucleo arrastra montos"; F-view "no tiene ninguna columna ni texto de costo, precio o valor (R4)" | COMPLIANT |
| R5 | Without permission, the query returns 403 | B-e2e "sin INSUMOS:LECTURA ambas responden 403 y la exportación no entrega archivo"; B-ctl "declara INSUMOS:LECTURA en los dos handlers" | COMPLIANT |
| R5 | Without permission, the export returns 403 | B-e2e (same test: 403, no `Content-Disposition`, no data in the body) | COMPLIANT |
| R5 | With permission, both return 200 | B-e2e "con SOLO INSUMOS:LECTURA ambas responden 200..." | COMPLIANT |
| R5 | The routes are not captured by `:id` | B-e2e "con SOLO INSUMOS:LECTURA ... (y /reporte-stock no la captura otra ruta)" (JSON body is the report, CSV has the row) | COMPLIANT |
| R6 | File format | B-e2e "Content-Type, Content-Disposition, BOM y separador `;`" (raw-byte BOM check); B-exp "BOM, separador y nombre de archivo" + the fixed-clock test (Argentine date `2026-10-01`) | COMPLIANT |
| R6 | More than 5000 rows | B-e2e "5000 filas responde 200 ...; 5001 responde 422 sin CSV parcial"; B-exp "5001 filas devuelven el error de tope y ningun contenido"; B-ctl "el error de tope es 422 y no deja headers de descarga" | COMPLIANT |
| R6 | Exactly 5000 rows | B-e2e (same test, 5000 data rows); B-exp "5000 filas pasan: encabezado + 5000 lineas" | COMPLIANT |
| R6 | Screen button | F-view "\"Exportar a Excel\" pide el mismo query string que la consulta (R3, R6)" | COMPLIANT |
| R7 | Access from Insumos | F-cat "con INSUMOS:LECTURA el enlace apunta al reporte con esRepuesto de la sección" + "la sección de consumibles precarga esRepuesto=false"; F-view "ReporteStockPage — con INSUMOS:LECTURA renderiza el reporte" + "renderiza la tabla ... y el instante de generación" | COMPLIANT |
| R7 | Filters in the URL | F-view "una recarga con la URL conserva familia y solo bajo mínimo, y los manda al backend" + "cambiar un filtro escribe la URL con el serializador compartido"; F-fil "ida y vuelta URL <-> filtros" | COMPLIANT |
| R7 | Without permission | F-view "sin INSUMOS:LECTURA muestra el fallback y no pide el reporte"; F-cat "sin INSUMOS:LECTURA el enlace no aparece" | COMPLIANT |
| R8 | Integer unit | B-exp "entero 3 vs fraccionario 2,50"; B-csv "una unidad entera con valor entero sale sin decimales"; F-fmt "unidad entera con valor entero sale sin decimales"; F-view "unidad entera sin decimales y fraccionaria con dos" | COMPLIANT |
| R8 | Fractional unit | B-exp "entero 3 vs fraccionario 2,50"; B-csv "un fraccionario sale con dos decimales y coma"; F-fmt "unidad fraccionaria siempre lleva dos decimales con coma"; F-view (same test) | COMPLIANT |
| R8 | Negative value in the CSV | B-exp "un negativo sale sin apostrofo"; B-csv "un negativo sale sin apostrofo ni comillas" (both go red under mutation 2) | COMPLIANT |
| R8 | Negative value on screen | F-view "un saldo negativo se resalta y la fila sigue presente (R8)" | COMPLIANT |
| R8 | Text is still neutralized | B-exp "un nombre que empieza con = queda neutralizado"; B-csv "el texto libre sigue neutralizado y un number plano no cambia" | COMPLIANT |
| R9 | NINGUNO matches the item record | B-ficha "cada fila del reporte coincide con la ficha..." + "NINGUNO: valores esperados (condiciones, negativo y sin movimientos)" | COMPLIANT |
| R9 | SERIE matches the item record | B-ficha "cada fila del reporte coincide con la ficha..." + "SERIE: cuenta solo EN_DEPOSITO, con la pendiente de serie incluida"; B-uni "cuenta solo las EN_DEPOSITO y descarta INSTALADA, ENTREGADA y DESCARTADA" | COMPLIANT |
| R9 | Units pending a serial number count toward the balance | B-ficha "SERIE: cuenta solo EN_DEPOSITO, con la pendiente de serie incluida" (NUEVO 2 with one pending); B-uni "la unidad pendiente de serie suma al conteo" | COMPLIANT |
| R9 | A SERIE item's ledger is not used | B-ficha "SERIE con el libro desfasado: la fila sigue a las unidades, igual que la ficha"; B-core "un SERIE toma el saldo de sus unidades aunque el libro difiera" | COMPLIANT |
| R10 | Used units do not cover the shortfall | B-core "los usados no tapan el faltante: minimo 5, NUEVO 2, USADO 10 => total 12 y BAJO_MINIMO" (red under mutation 1) | COMPLIANT |
| R10 | Balance equal to the minimum | B-core "NUEVO igual al minimo es BAJO_MINIMO"; B-ficha "cada fila ... coincide con la ficha" (estadoReposicion equality) | COMPLIANT |
| R11 | Bounded number of queries | B-core "sin N+1 (R11) > con ~50 insumos mezclados hace una consulta por cada fuente" (+3 sibling cases); B-mov / B-uni "resuelve con UNA sola consulta agregada para N insumos" + "con lista vacía devuelve un mapa vacío sin ir a la base" | COMPLIANT |

**Compliance summary**: 35/35 scenarios compliant. Requirements: 11/11.

**Inverse-assertion sweep.** I searched for tests that assert rejection where the spec requires success, and the reverse. None were found:
- The 403 assertions use an actor holding `INSUMOS:ALTAS`, not `INSUMOS:LECTURA`.
- The 200 assertions use an actor holding only `INSUMOS:LECTURA`.
- "ocultar sin stock" asserts that the negative row and the 3/-3 row stay visible.
- The 422 test is paired with a 200 at exactly 5000 rows.
- The 400 for a non-uuid `familiaId` is outside the spec scenarios and is consistent with the DTO.

### Roadmap sub-bullet checklist (`docs/roadmap-comercial.md`, "Decisiones de producto ya cerradas" > "Reporte de stock")

| Sub-bullet | Evidence | Holds? |
|---|---|---|
| Only the current stock snapshot; no movements by period, no per-serial detail | Controller has only `GET /` and `GET /export`; no period or serial parameters in `ReporteStockQueryDto` | Yes |
| One row per item: code, name, family, consumable/spare part, unit, NUEVO, USADO, total, reorder point, reorder state | DTO, CSV columns (B-exp "columnas y etiquetas exactas"), table headers (F-view) | Yes |
| Filters: family, consumable/spare part, below minimum only; disabled items included with a state column; zero-stock items included, with an option to hide them | R3 rows above | Yes |
| No valuation | R4 row above; DTO is mapped field by field | Yes |
| Seen and exported by holders of `INSUMOS:LECTURA` | R5 rows above | Yes |
| CSV export like the rest of the app ("Exportar a Excel") | Shared `armarExportCsv`/`ExportarCsvButton`, label "Exportar a Excel" | Yes |
| "Reporte de stock" screen inside the Insumos section | `/insumos/reporte-stock` page plus a link in `CatalogoInsumosListView` (Insumos and Repuestos) | Yes |
| Decimal comma, no decimals for integer units; negative values exported as numbers and highlighted on screen, never hidden | R8 rows above | Yes |

The **Cumplida** declaration is **true**. Its evidence paths exist, and "enlazada desde Insumos y Repuestos" is confirmed by F-cat. "Sin desviaciones" holds at product level. The deviations below are implementation choices that leave every sub-bullet intact.

### Correctness (static evidence)

| Requirement | Status | Notes |
|---|---|---|
| R1 to R11 | Implemented | Hexagonal layering follows the design: ports in domain, `groupBy` in infrastructure, use cases in application, controller and DTO in interface. `@prisma/client` is imported only in infrastructure. |
| Authorization | Implemented | Edge only: class-level `JwtAuthGuard`/`TenantGuard`, per-method `AccionesGuard` + `INSUMOS:LECTURA`, no inline checks (matches the design's "two places" note). Frontend `<Can>` is UI only. |

### Coherence (design)

| Decision | Followed? | Notes |
|---|---|---|
| ADR-1 batch aggregates with `groupBy`, zero completion shared | Yes | `completarConCeros` shared by `sumarPorTipo` and the batch path; ids deduplicated |
| ADR-2 single core, branch by `seguimiento`, `generadoEn` before reading | Yes | Extra JS re-sort by `codigo` on top of SQL `ORDER BY` (accepted deviation, below) |
| ADR-3 new controller registered first, 422 mapping | Yes | |
| ADR-4 typed numeric cell, columns, prefix, 5000 cap | Yes | `armarExportCsv` gained an optional `ahora` (accepted deviation, below) |
| ADR-5 frontend: URL filters, single serializer, shared `reposicion.ts`, link in the catalog view | Yes | Flattened row, native checkboxes (accepted deviations, below) |
| ADR-6 no migration or index | Yes | No `schema.prisma` change |
| Testing Strategy: comparison integration on an ephemeral DB | Deviated | Uses shared `soporte_tenant_test` with per-run prefixes (WARNING W2) |

### Apply deviations: verdicts

| Deviation | Verdict | Reason |
|---|---|---|
| Screen groups thousands with a dot, the CSV does not | **Accepted** | R8 requires a decimal comma and integer/fraction rules, and both are honored. Thousands grouping is the app-wide es-AR screen format (`formatearNumeroEsAr`). The CSV must not group, so that spreadsheets parse the value as a number. Probe: Node ICU `es-AR` groups consistently (`1234` -> `1.234`). |
| Table uses a flattened row (`FilaTabla`) | **Accepted** | Required by `DataTable`'s `key`-per-column contract. Pure projection, no data loss; F-view asserts every column. |
| Native checkbox inputs for the two boolean filters | **Accepted** | Labelled and accessible (`getByLabelText` works in F-view). Cosmetic only (see S3). |
| Fallback text "No tenés permiso..." vs "No tiene permiso" in the catalog view | **Accepted** | "No tenés permiso" is the majority form in the frontend (equipos, edilicia, preventivo, dashboard, admin views). Only two insumos views use "No tiene". The project memory records voseo as the frontend norm. |
| `armarExportCsv` gained an optional `ahora?: Date` | **Accepted** | Additive and optional; the other callers are unchanged. It makes the file name and the "Generado el" cell share one instant, and makes the R1/R6 Argentine-date test deterministic. |
| JS re-sort by `codigo` on top of SQL order | **Accepted** | The final order is the JS code-unit order, and both JSON and CSV share it (e2e asserts identical order). The SQL `ORDER BY` is redundant but harmless (see S2). |
| Integration specs use the shared tenant test DB with prefixed fixtures instead of an ephemeral DB | **Accepted with WARNING** | Matches the established pattern of more than 20 `*.integration.spec.ts` files on `soporte_tenant_test`, with assertions scoped to the prefix. The broad `insumo.deleteMany({})` / `TRUNCATE insumos` calls in e2e specs target their own ephemeral tenant DBs, so they do not race these fixtures. It still deviates from the design's Testing Strategy (W2). |

### Issues Found

**CRITICAL**
1. **C1: casts ratchet gate fails.** `node scripts/check-casts-en-specs.mjs` exits 1 (668 in 122 files vs base 666 in 121). The cause is `backend/src/insumos/interface/controllers/reporte-stock-insumos.controller.spec.ts:44`:
   `new ReporteStockInsumosController(consultar as never, exportar as never)`
   It was introduced by `1eb32187` (WU-4). `git merge-base --is-ancestor 1eb32187 main` -> not an ancestor, so the finding belongs to this cycle and not to `main`. The gate is wired in CI (`.github/workflows/gates-backend.yml:109`), so integrating as-is turns the backend gates job red. Fix: type the fakes against their real surface without casts, for example `Pick<ConsultarReporteStockUseCase, 'execute'>`-shaped objects, or complete mocks with `unstubbed(...)` from `backend/src/testing/mocks.ts`. Then re-run the ratchet. Do not raise the baseline.

**WARNING**
1. **W1: `openspec/changes/reporte-stock-insumos/state.yaml` is stale.** It says `phase: spec`, `design: false`, `tasks: false`, `tasks_progress: completed: [] / pending: []`, while design, tasks (44/44) and apply-progress exist. Under the repo rule in §3.3 of `~/proyectos/CLAUDE.md`, an artifact that lies is worse than a missing one. Native status does not read these fields, so routing is unaffected.
2. **W2: Design deviation in the Testing Strategy.** The design asked for the comparison integration (R9) on an ephemeral tenant with `dropDatabase` hygiene. It runs on shared `soporte_tenant_test` with prefixed fixtures. apply-progress declares this and it is consistent with the repo pattern. It does not break any spec scenario.

**SUGGESTION**
1. S1: `cantidadCsv` relies on `String(n)`/`toFixed(2)`. For |n| >= 1e21 these yield exponent notation, which would violate the documented `^-?\d+(,\d{2})?$` invariant. This is unreachable with Prisma `Decimal` quantities, but a guard or a test would make the "safe to skip neutralization" argument airtight.
2. S2: Drop either the SQL `orderBy codigo` or the JS re-sort, or document that JS code-unit order is authoritative. The two can disagree under a non-C collation, and only the JS order reaches users.
3. S3: Replace the native checkboxes with the shared UI checkbox component if one exists, for visual consistency.
4. S4: `CEROS_LIBRO = {...} as SumasPorCondicionYTipo` in `consultar-reporte-stock.use-case.ts` is an unnecessary cast in production code. A typed constant compiles without it.
5. S5: The `ExportacionStockDemasiadoGrandeError` branch in `toHttpException` returns the same 422 as the fallthrough. That is acceptable as explicit documentation, but a test that pins the 422 message text ("exportación demasiado grande") through HTTP would make the R6 "explicit error" clause fully observable. The e2e asserts only status and the absence of a partial CSV.

### Process checks

- Commits are Conventional Commits with no AI attribution. WU-5 and WU-6 note the Ayuda debt in their bodies ("Ayuda: pendiente — pantalla Reporte de stock y exportacion 'Exportar a Excel'"). Backend WUs say "sin deuda". `size:exception` is declared where used (`8ae62413`).
- No Ayuda article is made false. Permissions are unchanged, and the report adds a new screen and route.
- The roadmap point is closed with **Cumplida**, and `check-roadmap-fresco.mjs` passes.
