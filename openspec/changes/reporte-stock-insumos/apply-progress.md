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
