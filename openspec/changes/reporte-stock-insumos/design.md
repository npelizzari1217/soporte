# Design: reporte y exportación del stock de insumos

## Technical Approach

Opción A de la exploración, CSV en el servidor. Un **caso de uso núcleo** arma la foto (catálogo +
dos agregados por lote + fórmulas del dominio) y lo consumen dos bordes: JSON para la pantalla y
CSV por `armarExportCsv`. La exportación **compone** el núcleo, así que el filtrado es idéntico por
construcción. Lectura sin transacción ni lock, como la ficha.

Fuente de producto: `docs/roadmap-comercial.md`, "Decisiones de producto ya cerradas", viñeta
"Reporte de stock" (2026-10-01). Verificado contra `main` en `64735b68`.

## Capa de cada pieza (`rules.design`)

| Pieza | Capa | Por qué |
|---|---|---|
| `calcularSaldos`, `saldosDesdeUnidades`, `evaluarReposicion` (sin cambios) | domain | Única fórmula del saldo |
| `FilaCatalogoStock` (proyección) y métodos de lote en los tres puertos | domain (ports) | Contrato sin Prisma |
| `groupBy` por lote | infrastructure | Mecanismo de Postgres/Prisma |
| `ConsultarReporteStockUseCase`, `ExportarReporteStockUseCase` | application | Orquestan puertos y filtros derivados |
| `ExportacionStockDemasiadoGrandeError` | domain (`insumos.errors.ts`) | Cada módulo tiene su error de tope |
| `cantidadCsv` y `CeldaNumericaCsv` | shared/infrastructure (`csv.ts`) | Formato de salida, no negocio |
| `ReporteStockInsumosController`, DTOs | interface | Ruta, permiso, headers |
| Pantalla, filtros en URL, formato en pantalla | frontend `features/insumos` | Presentación; el estado llega resuelto |

**Autorización, dos lugares.** Borde: `@UseGuards(AccionesGuard)` + `@RequiereAcciones('INSUMOS:LECTURA')`
por método en las dos rutas. Inline: ninguno; el reporte no depende del actor. El `<Can>` del
frontend es UI, no autoridad.

## Architecture Decisions

### ADR-1: agregados por lote en los puertos existentes, con `groupBy`

```ts
// IMovimientoInsumoRepository
sumByTipoDeInsumos(insumoIds: readonly string[]): Promise<Map<string, SumasPorCondicionYTipo>>;
// IUnidadInsumoRepository
contarEnDepositoPorCondicionDeInsumos(insumoIds: readonly string[]): Promise<Map<string, ConteoPorCondicion>>;
// IInsumoRepository
listarParaReporteStock(f: { familiaId?: string; esRepuesto?: boolean }): Promise<FilaCatalogoStock[]>;
```

Contrato: **cada id pedido está en el mapa**, con los ceros completos (2×4 o 2) si no tiene filas;
lista vacía devuelve mapa vacío sin ir a la base. Sin lock y sin exigir transacción, igual que
`sumByTipo`. La completación con ceros se extrae del `sumarPorTipo` privado a un helper compartido
por la lectura individual y la de lote: dos copias derivarían.

`FilaCatalogoStock` = `{ insumoId, codigo, nombre, activo, seguimiento, stockMinimo, familia:
{ id, nombre, esRepuesto }, unidadMedida: { codigo, nombre, entera } }`. Una consulta con `select`
y relaciones, `deletedAt: null` sobre el insumo, orden `codigo ASC`. Es una proyección, no
`InsumoEntity`: no es pasable a `save()` (mismo precedente que `FamiliaDeInsumo`).

| Opción | Decisión |
|---|---|
| `ConsultarStockInsumoUseCase` por insumo | Rechazada: N+1 (1–3 consultas por insumo) |
| Puerto de lectura dedicado (`IReporteStockQuery`) | Rechazada: duplicaría la completación con ceros fuera del repo que la define |
| `$queryRaw` con `SUM` | Rechazada: casts, nombres de columna a mano; `groupBy` ya es el patrón de `sumByTipo` y `contarEnDepositoPorCondicion` |
| Fórmula del saldo en SQL | Rechazada: segunda fórmula; el JSDoc del dominio lo prohíbe |
| `groupBy` con `insumoId IN (...)` partido por seguimiento | **Elegida** |

### ADR-2: núcleo único con rama por seguimiento

`ConsultarReporteStockUseCase.execute(filtros): Promise<ReporteStock>` (sin `Result`: no hay falla
de negocio; una familia inexistente da lista vacía). Constructor con `Pick` de los tres métodos de
lote y `ahora: () => Date`.

1. `generadoEn = ahora()` **antes** de leer: la foto es posterior a la hora que se informa.
2. Catálogo filtrado por `familiaId` y `esRepuesto` en SQL.
3. Ids partidos por `seguimiento`: `NINGUNO` → `calcularSaldos(sumByTipoDeInsumos)`; `SERIE` →
   `saldosDesdeUnidades(contarEnDeposito…)`. Las dos consultas en `Promise.all`. Mismo criterio que
   la ficha; las pendientes de serie cuentan en el saldo (son `EN_DEPOSITO`) y no son columna (P2 a).
4. `estadoReposicion = evaluarReposicion(saldos.NUEVO, stockMinimo)`.
5. Filtros derivados, **después** del dominio: `soloBajoMinimo` → `BAJO_MINIMO`; `ocultarSinStock`
   → oculta solo si `NUEVO === 0 && USADO === 0`. Un negativo nunca se oculta (NUEVO 2 / USADO −2
   tampoco).

Universo: vigentes (`deletedAt: null`), habilitados y deshabilitados, con familia en cualquier
estado, como `findAllActive` y la ficha. Orden: código.

Sin transacción ni lock: la invariante L (ADR-12 de `repuestos-numero-de-serie`) ordena locks de
**escritores**; un lector sin locks no participa. Libro y unidades no son atómicos entre sí; lo
declara `generadoEn`.

### ADR-3: borde HTTP en un controller nuevo, registrado primero

`ReporteStockInsumosController`, `@Controller('insumos/reporte-stock')`: `GET /` (JSON) y
`GET /export` (CSV). No va en `InsumosController`: su contrato documentado es "ABM por rol, lectura
abierta, sin `@RequiereAcciones`".

Orden de rutas, verificado: hoy no hay `GET /insumos/:id`; los `GET` con parámetro son
`:insumoId/stock|movimientos|unidades[...]`, que no matchean `reporte-stock` ni
`reporte-stock/export`. Igual se registra **primero** en `controllers:` de `insumos.module.ts`, para
que un `GET /insumos/:id` futuro no lo capture; lo fija un e2e.

DTO de query (class-validator): `familiaId?: uuid`, `esRepuesto?`, `soloBajoMinimo?`,
`ocultarSinStock?` con `parsearBooleanQuery`. Export: headers de `equipos.controller.ts`
(`text/csv; charset=utf-8`, `Content-Disposition`, `Access-Control-Expose-Headers`).
`ExportacionStockDemasiadoGrandeError` se mapea explícito a 422 en `toHttpException` de
`insumos.controller.ts`.

### ADR-4: CSV — celda numérica tipada que no pasa por la neutralización

`neutralizarFormula` antepone `'` a todo texto que empieza con `-`. Se agrega a `csv.ts`:

```ts
export interface CeldaNumericaCsv { readonly tipo: 'numero'; readonly texto: string }
export type ValorCelda = string | number | boolean | null | undefined | CeldaNumericaCsv;
export function cantidadCsv(valor: number, entera: boolean): CeldaNumericaCsv;
```

`escaparCelda` emite `texto` tal cual solo para `CeldaNumericaCsv`. Por qué es seguro: la única
fábrica es `cantidadCsv`, que exige `Number.isFinite` (si no, lanza) y produce solo
`^-?\d+(,\d{2})?$`. Sin `=`, `+`, `@`, letras ni separadores, una planilla lo lee como literal
numérico. El texto libre sigue neutralizado. Formato: unidad `entera` y valor entero → sin
decimales; si no, dos decimales con coma, sin miles. Un fraccionario en unidad entera muestra sus
decimales, nunca se redondea. `-0` sale `0`.

| Opción | Decisión |
|---|---|
| Que `number` saltee la neutralización | Rechazada: cambia las exportaciones existentes en silencio |
| `cantidadCsv` devolviendo `string` | Rechazada: el negativo sale `'-3` |

Columnas: Código; Nombre; Familia; Tipo (Consumible/Repuesto); Unidad de medida; Stock nuevo;
Stock usado; Stock total; Punto de reposición; Estado de reposición (etiquetas de la ficha); Estado
(Habilitado/Deshabilitado); Generado el (`fechaHoraCsv`, se repite por fila para no romper la
tabla). Prefijo `stock-insumos`. Tope `TOPE_FILAS_EXPORT` sobre `filas.length` después del filtro
(residual aceptado de `ExportarEquiposUseCase`).

### ADR-5: frontend

- Ruta `app/(dashboard)/insumos/reporte-stock/page.tsx` (el segmento estático gana sobre `[id]`) →
  `ReporteStockView`, con `<Can permiso="INSUMOS:LECTURA">` y el fallback `ErrorState`.
- `lib/filtros-reporte-stock.ts`: un schema Zod parsea `searchParams` y un solo serializador arma el
  query string que usan el hook (`["reporte-stock", filtros]`, `staleTime: 0`) y `ExportarCsvButton`
  (`recurso="insumos/reporte-stock"`, "Exportar a Excel"), sin cambios en el botón.
- Tabla con las columnas del CSV. Negativo con `text-destructive`; `BAJO_MINIMO` con badge
  destructivo. `ETIQUETA_REPOSICION` y `VARIANTE_REPOSICION` se mueven de `insumo-detail-view.tsx` a
  `lib/reposicion.ts`. `formatearCantidadEsAr(valor, entera)` en `lib/formato-cantidad.ts`.
  "Generado el" con `formatearInstante`.
- Enlace "Reporte de stock" en `CatalogoInsumosListView`, dentro de su `<Can>`, con `esRepuesto` de
  la sección precargado.

### ADR-6: sin migración ni índice nuevo

`movimientos_insumo (insumo_id, created_at)` filtra por prefijo y `unidades_insumo (insumo_id,
estado)` cubre el conteo. Volumen inferido: miles a decenas de miles de movimientos. Índice
cubriente rechazado: cuesta en cada escritura sin una medición que lo pida. Se revisa con medición.

## Data Flow

    GET /insumos/reporte-stock[/export] ── AccionesGuard(INSUMOS:LECTURA)
            │
    [Exportar] ──→ ConsultarReporteStock ──→ listarParaReporteStock (1 consulta)
            │              ├─ NINGUNO ids → sumByTipoDeInsumos ─→ calcularSaldos
            │              ├─ SERIE ids   → contarEnDeposito…   ─→ saldosDesdeUnidades
            │              └─ evaluarReposicion → filtros derivados
            └─ armarExportCsv(cantidadCsv) ─→ text/csv + BOM

## File Changes

| File | Action |
|---|---|
| `backend/src/insumos/domain/ports/i-{insumo,movimiento-insumo,unidad-insumo}.repository.ts` | Modify |
| `backend/src/insumos/infrastructure/persistence/prisma/prisma-{insumo,movimiento-insumo,unidad-insumo}.repository.ts` | Modify |
| `backend/src/insumos/application/use-cases/{consultar,exportar}-reporte-stock.use-case.ts` | Create |
| `backend/src/insumos/domain/errors/insumos.errors.ts`, `interface/controllers/insumos.controller.ts` (mapeo) | Modify |
| `backend/src/insumos/interface/controllers/reporte-stock-insumos.controller.ts`, `interface/dtos/reporte-stock.dto.ts` | Create |
| `backend/src/insumos/insumos.module.ts` | Modify |
| `backend/src/shared/infrastructure/csv/csv.ts` | Modify |
| `frontend/src/app/(dashboard)/insumos/reporte-stock/page.tsx` | Create |
| `frontend/src/features/insumos/{components/reporte-stock-view,hooks/use-reporte-stock,lib/filtros-reporte-stock,lib/formato-cantidad,lib/reposicion}.ts(x)` | Create |
| `frontend/src/features/insumos/{types.ts,components/insumo-detail-view.tsx,components/catalogo-insumos-list-view.tsx}` | Modify |
| `docs/roadmap-comercial.md` | Modify al cerrar (Cumplida/Desviación) |

## Testing Strategy

| Capa | Qué | Cómo |
|---|---|---|
| Unit | Núcleo: rama por seguimiento, filtros derivados (negativo visible), `generadoEn` antes de leer, orden; export: columnas, etiquetas, tope 5001 → error; `cantidadCsv` (`3`, `2,50`, `-3` sin apóstrofo, `-0`, `NaN` lanza); texto `-3` sigue neutralizado | Fakes con `Pick` |
| Unit | Controller: metadata `INSUMOS:LECTURA` en los dos handlers; error → 422 sin headers | Reflexión, patrón `equipos.controller.spec.ts` |
| Integration | Métodos de lote: ceros, aislamiento por insumo, lista vacía | Base tenant real |
| Integration | **Comparación**: por cada fila, saldos y `estadoReposicion` iguales a `ConsultarStockInsumoUseCase` para `NINGUNO` (ambas condiciones, negativo, sin movimientos) y `SERIE` (unidades en los 4 estados, pendiente); deshabilitado presente, baja lógica ausente | Higiene: filas → `app.close()` → `dropDatabase` |
| E2E | 403 sin la acción en las dos rutas; ruta no capturada; headers, BOM, `;`, nombre; 400 con `familiaId` inválido | supertest |
| Frontend | Filtros ↔ URL, mismo query string en el export, negativo y bajo mínimo resaltados, fallback sin permiso, formato | Vitest + MSW |

## Threat Matrix

N/A: no hay routing de shell, subprocesos, automatización de VCS/PR, clasificación de ejecutables
ni integración de procesos. La inyección CSV se trata en ADR-4.

## Migration / Rollout

No migration required. Ayuda suspendida: deuda (pantalla y exportación) anotada en commit y PR de
las WU con UI; ningún artículo queda falso. Rollback: `git revert` de la cadena en orden inverso.
Hint para `sdd-tasks`: 4 PR bajo 400 líneas (puertos y repos; núcleo y comparación; CSV, export,
controller y e2e; frontend).

## Open Questions

- [ ] Hay que alinear con la spec: la columna "Generado el" repetida en el CSV y los dos decimales
  fijos en unidades no enteras.
