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

## WU-2 — Caso de uso núcleo y comparación con la ficha (completo, 7/7)

Rama `feat/reporte-stock-insumos-wu02` (base `-wu01-3`). Partido en dos ramas (`-wu02` y `-wu02-2`).

- `consultar-reporte-stock.use-case.ts`: `ConsultarReporteStockUseCase` con los tres `Pick` de lote y
  `ahora`. Reutiliza `FilaCatalogoStock`/`FiltrosCatalogoStock` del puerto. No consulta una fuente cuando
  no hay ids de ese seguimiento; orden por código aplicado también en el caso de uso.
- `consultar-reporte-stock.use-case.spec.ts`: 17 casos (columnas, filtros, ocultar sin stock con las
  cuatro variantes, reloj antes de leer, SERIE vs. libro, sin N+1 con 50 ids).
- `reporte-stock-coincide-con-ficha.integration.spec.ts` (parte 2, rama `-wu02-2`): 6 casos contra
  `soporte_tenant_test` con fixtures prefijados por corrida (mismo patrón que WU-1), no con una base
  efímera: ver Desviación.
- Mutación 2.6 (local, revertida): (a) rama `SERIE` con `calcularSaldos` sobre el libro ⇒ 3 casos
  rojos; (b) `INSTALADA` contada en el conteo ⇒ 1 caso rojo (el de valores explícitos de SERIE;
  la comparación con la ficha no lo ve porque la ficha cuenta por otro método). Ambos revertidos.

Desviación: la integración usa la base compartida de pruebas con prefijo y limpieza por prefijo, no una
base efímera, por coherencia con los tres specs de integración de WU-1; los resultados se filtran por
el prefijo de la corrida.

## WU-3 — CSV, exportación y error de tope (completo, 7/7)

Rama `feat/reporte-stock-insumos-wu03` (base `-wu02-2`), partido en dos ramas: `-wu03` (csv.ts y su spec) y `-wu03-2` (error, exportación, `armarExportCsv`).

- `csv.ts`: `CeldaNumericaCsv` (`tipo: 'numero'`, `texto`), `ValorCelda` ampliado y `cantidadCsv(valor, entera)`.
  `serializarCsv` pasa cada valor por `escaparValor`: la celda numérica sale verbatim y todo lo demás
  conserva `escaparCelda` (texto y `number` plano siguen igual; las cuatro exportaciones existentes no cambian).
  `-0` y un fraccionario que redondea a `-0,00` salen como `0` / `0,00`.
- `ExportacionStockDemasiadoGrandeError` en `insumos.errors.ts`.
- `exportar-reporte-stock.use-case.ts`: compone el núcleo con los mismos filtros; columnas de ADR-4;
  etiquetas de reposición copiadas de la ficha (frontend; no hay copia en el backend).
- Desviación mínima: `armarExportCsv` recibe un `ahora?: Date` opcional. Sin él, el nombre del archivo usaba
  `new Date()` y no se podía probar que con reloj 2026-10-02T01:30Z lleve `2026-10-01`; el export pasa
  `generadoEn`, así nombre y celda "Generado el" comparten instante. Los otros callers no lo pasan.
- Specs: `csv.spec.ts` ampliado (`cantidadCsv`), `exportar-reporte-stock.use-case.spec.ts` (13 casos).

## WU-4 — Borde HTTP (completo, 7/7)

Rama `feat/reporte-stock-insumos-wu04` (base `-wu03-2`).

- `reporte-stock.dto.ts`: `ReporteStockQueryDto` (`familiaId` uuid, `esRepuesto`, `soloBajoMinimo`, `ocultarSinStock` con `parsearBooleanQuery`, ahora exportado de `insumos.dto.ts`) y respuesta `{ generadoEn (ISO), filas }` armada campo por campo, sin dinero.
- `reporte-stock-insumos.controller.ts`: `@Controller('insumos/reporte-stock')`, guards de clase `JwtAuthGuard`/`TenantGuard`, `AccionesGuard` + `INSUMOS:LECTURA` por metodo, headers de descarga como `equipos.controller.ts`; los dos handlers comparten el DTO de query.
- `insumos.module.ts`: controller registrado PRIMERO; providers de los dos use cases (`ahora: () => new Date()`, el export con el nucleo inyectado).
- `toHttpException`: `ExportacionStockDemasiadoGrandeError` a 422 explicito.
- Specs: controller (7 casos: metadata, filtros, headers, 422 sin headers, DTO) y e2e (9 casos, tenant efimero, `usarLockMasterTest()`).
- Gotcha: `fetch().text()` descarta el BOM; el e2e lo verifica sobre los bytes crudos (EF BB BF).
- El e2e limpia `insumos`/`movimientos_insumo` del tenant en cada caso (el reporte lista todos los insumos de la base).
