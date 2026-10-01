# Apply progress: reporte-stock-insumos

## WU-1 — Puertos y agregados por lote (completo, 10/10)

Rama `feat/reporte-stock-insumos-wu01` (partida en tres commits por la política de 400 líneas; ramas
`-wu01`, `-wu01-2`, `-wu01-3` en cadena lineal; la última lleva todo el WU).

| Parte | Rama | Contenido |
|---|---|---|
| 1 | `feat/reporte-stock-insumos-wu01` | `sumByTipoDeInsumos` (puerto, repo con helper `completarConCeros` compartido con `sumarPorTipo`, integración) |
| 2 | `feat/reporte-stock-insumos-wu01-2` | `contarEnDepositoPorCondicionDeInsumos` (puerto, repo, integración) |
| 3 | `feat/reporte-stock-insumos-wu01-3` | `listarParaReporteStock` + `FilaCatalogoStock` (puerto, repo, integración), tasks.md y este archivo |

Tareas 1.1 a 1.10 marcadas en `tasks.md`.

Decisiones de implementación:

- Los tres métodos de lote deduplican los ids (`new Set`) y devuelven una entrada por id pedido.
- `sumByTipoDeInsumos` y `contarEnDepositoPorCondicionDeInsumos`: una sola consulta `groupBy`; lista
  vacía devuelve `new Map()` antes de tocar el cliente (los specs lo prueban con un cliente espía).
- `completarConCeros` es una función de módulo usada por `sumarPorTipo` y por el lote: no hay dos copias.
- El puerto de insumos exporta además `FiltrosCatalogoStock` (`familiaId?`, `esRepuesto?`).
- Los specs usan el patrón del repo: base compartida `soporte_tenant_test`, fixtures con prefijo por
  corrida y `tenantContext.bind`; el de unidades crea su propio equipo (CHECK `INSTALADA` ⇒ `equipo_id`).

## WU-2 — Caso de uso núcleo y comparación con la ficha (parte 1 de 2: 2.1 a 2.4)

Rama `feat/reporte-stock-insumos-wu02` (base `-wu01-3`). Partido en dos ramas (`-wu02` y `-wu02-2`).

- `consultar-reporte-stock.use-case.ts`: `ConsultarReporteStockUseCase` con los tres `Pick` de lote y
  `ahora`. Reutiliza `FilaCatalogoStock`/`FiltrosCatalogoStock` del puerto. No consulta una fuente cuando
  no hay ids de ese seguimiento; orden por código aplicado también en el caso de uso.
- `consultar-reporte-stock.use-case.spec.ts`: 17 casos (columnas, filtros, ocultar sin stock con las
  cuatro variantes, reloj antes de leer, SERIE vs. libro, sin N+1 con 50 ids).
- Parte 1 de 2 (esta rama): tareas 2.1 a 2.4. La integración de comparación y la mutación (2.5, 2.6)
  van en `feat/reporte-stock-insumos-wu02-2`.
