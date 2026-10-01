# Exploración: reporte y exportación del stock de insumos (`reporte-stock-insumos`)

> Producida por `sdd-explore` el 2026-10-01 sobre `main` en `089d5f2d`, en solo lectura. El ejecutor no contaba con herramienta de escritura; el orquestador la persiste sin cambios de contenido. No se consultó producción: los volúmenes son inferencias. La comparación de mercado sale de conocimiento general, sin búsqueda web.

## 1. Pedido

El dueño pidió, después del ciclo de número de serie, "luego el reporte". `docs/roadmap-comercial.md` ("Pendiente, sin construir", línea 137) dice solo: "un reporte y exportación del stock". No hay una decisión de producto cerrada en la sección "Decisiones de producto ya cerradas" para este punto, así que **todo el alcance es una pregunta abierta** (sección 11).

## 2. Estado actual

### 2.1 Qué datos de stock existen

| Dato | Dónde vive | Notas | Ref |
|---|---|---|---|
| Catálogo de insumos | `insumos`: `codigo`, `nombre`, `familiaId`, `unidadMedidaId`, `stockMinimo` (Decimal 10,2, nullable), `seguimiento` (NINGUNO/SERIE), `activo`, `deletedAt` | **No hay costo ni precio.** | `backend/prisma_tenant/schema.prisma:690` |
| Familias | `familias_insumo`: `codigo`, `nombre`, `activo`, `esRepuesto` | `esRepuesto` separa consumible de repuesto | `schema.prisma:648` |
| Unidad de medida | `unidades_medida`: `codigo`, `nombre`, `entera` | | `schema.prisma:671` |
| Bitácora | `movimientos_insumo`: `tipo` (ENTRADA/SALIDA/AJUSTE_POSITIVO/AJUSTE_NEGATIVO), `condicion` (NUEVO/USADO), `cantidad` > 0, `usuarioId`, `motivo`, `equipoId?`, `sectorId?`, `itemCompraId?`, `createdAt` | Append-only; el signo lo da el tipo | `schema.prisma:790`; `domain/entities/tipo-movimiento-insumo.ts:31,104` |
| Unidades por serie | `unidades_insumo`: `numeroSerie?`, `numeroSerieNormalizado?`, `condicion`, `estado` (EN_DEPOSITO/INSTALADA/ENTREGADA/DESCARTADA), `equipoId?` (solo INSTALADA), timestamps | Índices `(insumoId, estado)` y `(equipoId)` | `schema.prisma:1375`; `domain/entities/unidad-insumo.entity.ts:24` |
| Eventos de unidad | `eventos_unidad_insumo`: tipo (12 valores), serial anterior/nuevo, motivo, `equipoId`, `componenteId`, `usuarioId`, `movimientoId?` | Historial por serial | `schema.prisma:1403`; `unidad-insumo.entity.ts:35` |
| Dinero | Solo `items_compra.monto` (Decimal 14,2) y `moneda` (ARS/USD/EUR), con `insumoId?` nullable y sin backfill | Es precio de compra por ítem, no costo del insumo | `schema.prisma:1125-1150` |
| Componentes instalados | `componentes_equipo` con `insumoId?` y `unidadId?` | Una fila por pieza instalada | `schema.prisma:949` |

Los destinos de una salida (`sectorId`, `equipoId`) son **solo trazabilidad**: "hay un solo stock, no uno por sector ni por equipo" (comentario en `schema.prisma:822-830`). No existe el concepto de ubicación o depósito múltiple: el reporte no puede ser "por depósito".

### 2.2 Cómo se calcula el saldo (ADR-2, fuente única)

`ConsultarStockInsumoUseCase` (`backend/src/insumos/application/use-cases/consultar-stock-insumo.use-case.ts:109-160`):

- Devuelve `StockDeInsumo`: `stock` total, `saldos {NUEVO, USADO}`, `admiteUsado`, `stockMinimo`, `estadoReposicion`, `seguimiento`, `pendientesDeSerie`.
- **Rama por seguimiento.** `SERIE`: `saldosDesdeUnidades(contarEnDepositoPorCondicion)`, o sea unidades `EN_DEPOSITO` por condición. `NINGUNO`: `calcularSaldos(sumByTipo)`, o sea `ENTRADA + AJUSTE_POSITIVO − SALIDA − AJUSTE_NEGATIVO` por condición, en centésimas exactas (`tipo-movimiento-insumo.ts:134,171,199`).
- `estadoReposicion = evaluarReposicion(saldos.NUEVO, stockMinimo)`: **solo cuenta NUEVO**; los usados no tapan la falta. Valores `SIN_PUNTO_DEFINIDO | SUFICIENTE | BAJO_MINIMO` (`domain/entities/estado-reposicion-insumo.ts`).
- `pendientesDeSerie` = unidades `EN_DEPOSITO` con `numeroSerie === null`; cuentan en el saldo pero no pueden salir ni instalarse.
- Lectura **sin lock** (`sumByTipo`), es una foto; el caso de uso está pensado para mostrar, no para decidir. El reporte hereda esa naturaleza: un reporte es una foto y debe decirlo (fecha y hora de generación).
- Dos fuentes que "coinciden por invariante" para SERIE (`invariante-serie.integration.spec.ts`); el reporte puede usar cualquiera, pero debe elegir **una** y respetar la rama.

### 2.3 Qué hay y qué falta en las lecturas

| Lectura | Existe | Detalle |
|---|---|---|
| Stock de UN insumo | Sí: `GET /insumos/:insumoId/stock` | `INSUMOS:LECTURA` (`movimientos-insumo.controller.ts:358`) |
| Movimientos de UN insumo, paginados | Sí: `GET /insumos/:insumoId/movimientos` | `createdAt DESC, id DESC`; índice `(insumoId, createdAt)` (`i-movimiento-insumo.repository.ts:205`) |
| Unidades de UN insumo | Sí: `GET /insumos/:insumoId/unidades?estado&disponibles` | Sin paginación, ordenadas por id (`unidades-insumo.controller.ts:83`) |
| Historial de una unidad | Sí: `.../:unidadId/historial` | |
| Catálogo completo de insumos | Sí: `GET /insumos` (`ListarInsumosUseCase`, filtro `esRepuesto`, `soloVinculables`) | **Sin stock**: el listado y las pantallas `insumos-list-view.tsx` y `repuestos-list-view.tsx` no muestran existencias; solo la ficha (`insumo-detail-view.tsx`) |
| Stock de TODOS los insumos | **No** | No hay consulta agregada: sería la primera pantalla/endpoint que cruza el catálogo con saldos |
| Movimientos de TODOS los insumos / por período | **No** | Solo por insumo |
| Unidades de TODOS los insumos | **No** | Solo por insumo |
| Piezas instaladas por equipo | Parcial: `unidades_insumo.equipoId` + índice; `componentes_equipo` | Sin consulta agregada |

Conclusión: **el reporte es la primera lectura transversal del módulo**. No hay nada para reusar a nivel repositorio salvo `IInsumoRepository.findAllActive` y los mapeos de dominio.

### 2.4 Permisos

- Acciones del módulo en uso: `INSUMOS:LECTURA` (todas las lecturas), `INSUMOS:ALTAS` (entradas, salidas, cargas de serial), `INSUMOS:AJUSTAR` (ajustes, correcciones). Se aplican con `@UseGuards(AccionesGuard)` + `@RequiereAcciones('INSUMOS:...')`.
- El propio controller justifica `INSUMOS:LECTURA` para el stock: "el saldo del depósito no es un dato de catálogo abierto como el listado de insumos — dice cuánto hay de cada cosa" (`movimientos-insumo.controller.ts:343-347`). El listado de insumos, en cambio, no lleva gate de acción propio.
- Los exports existentes se gatean con la **misma acción de lectura del listado** (`EQUIPOS:LECTURA` en `/equipos/export`). El mismo criterio daría `INSUMOS:LECTURA` para el reporte.
- Un valorizado (si lo hubiera) podría merecer una acción distinta: no existe `INSUMOS:COSTOS` ni similar; crear una acción es una decisión de permisos (matriz por usuario) que queda como pregunta.

## 3. Patrones de exportación existentes (a reutilizar)

Hay cuatro exportaciones CSV de servidor: compras, tickets, equipos, reparaciones (`sdd/exportar-listados-csv`, roadmap punto 1).

| Pieza | Ruta | Qué hace |
|---|---|---|
| Serializador | `backend/src/shared/infrastructure/csv/csv.ts` | BOM UTF-8 (`BOM_UTF8`), separador `;` (Excel es-AR), CRLF, escapado RFC 4180, neutralización de inyección de fórmulas (apóstrofo ante `= + - @`), `fechaCsv`, `diaArgentinoCsv`, `fechaHoraCsv` (hora Argentina), `montoCsv` (coma decimal, sin miles) |
| Armado | `backend/src/shared/application/armar-export-csv.ts` | `armarExportCsv({filas,total,tope,columnas,prefijo,alExceder})`: valida el tope, serializa, nombra el archivo `prefijo-aaaa-mm-dd.csv` con fecha argentina. Cada módulo aporta **su propia clase de error** (por la reflexión de los specs de controller) |
| Tope | `backend/src/shared/domain/tope-filas-export.ts` | `TOPE_FILAS_EXPORT = 5000`; si se supera, error de dominio explícito (422) y nunca truncado en silencio |
| Caso de uso | `equipos/application/use-cases/exportar-equipos.use-case.ts` (el más simple), `compras/.../exportar-compras.use-case.ts` (con filtros, `count` real y columnas dinámicas por moneda) | Consulta pura, sin transacción |
| Endpoint | `equipos.controller.ts:275` | `GET /equipos/export` con `@Res({ passthrough: true })`; `Content-Type: text/csv; charset=utf-8`, `Content-Disposition: attachment`, `Access-Control-Expose-Headers: Content-Disposition`. **Debe declararse ANTES de `GET /:id`**; en insumos, `GET /insumos/export` tiene que ir antes de cualquier ruta `:id` |
| Frontend | `frontend/src/shared/components/exportar-csv-button.tsx` + `shared/hooks/use-exportar-csv.ts` | `useMutation` sobre `apiFetchBlob("{recurso}/export?{query}")`, `dispararDescarga`, nombre desde `Content-Disposition`, errores a `notifyError` (incluye el 422 de demasiadas filas). Sin `<Can>` propio: la ruta ya exige la acción. El `queryString` lo arma cada feature y la URL es la fuente de verdad de los filtros |
| Etiqueta de UI | `equipos-list-view.tsx:104` | "Exportar a Excel" (el CSV con `;` y BOM está pensado para abrirse en Excel) |

No hay librerías de XLSX, PDF ni gráficos en `backend/package.json` ni `frontend/package.json` (búsqueda de exceljs, xlsx, pdfkit, pdfmake, puppeteer, jspdf, recharts sin resultados), ni hojas de estilo de impresión (`window.print`/`@media print`) en el frontend. Un XLSX o un PDF implicaría **una dependencia nueva** y un patrón nuevo.

Observación: el serializador pone apóstrofo ante `-`, de modo que un saldo negativo (posible, "se devuelve tal cual", `tipo-movimiento-insumo.ts:129`) saldría como texto `'-3`. Los montos usan `montoCsv`, pero **las cantidades hoy no tienen helper**: el reporte necesita un `cantidadCsv` (coma decimal) y decidir qué hacer con un saldo negativo.

## 4. Rendimiento y escala

- **El saldo es una agregación por insumo** (`SUM(cantidad) GROUP BY condicion, tipo` con `sumByTipo`; o un conteo por condición sobre `unidades_insumo`). Un reporte que llame `ConsultarStockInsumoUseCase` por cada insumo hace 1 a 3 consultas por insumo (más `validarInsumoElegible`, `validarCondicionAdmitida` y `listarPorInsumo` para pendientes): **N+1 seguro**. Para un catálogo de cientos de insumos son miles de idas y vueltas.
- **Camino correcto:** consultas agregadas nuevas en los puertos, una por familia de dato: `SUM(cantidad) GROUP BY insumo_id, condicion, tipo` sobre `movimientos_insumo`, y `COUNT(*) GROUP BY insumo_id, condicion` (más pendientes con `numero_serie IS NULL`) sobre `unidades_insumo WHERE estado='EN_DEPOSITO'`. El cálculo del saldo debe seguir pasando por `calcularSaldos`/`saldosDesdeUnidades` y `evaluarReposicion` (dominio), no repetirse en SQL: la propia documentación advierte que dos copias de la fórmula discreparían.
- **Índices:** `movimientos_insumo` tiene `(insumoId, createdAt)`; un agregado global por insumo lo recorre completo (sin filtro de fecha). Un reporte por período necesita rango sobre `createdAt`, que **ese índice no cubre sin `insumoId`**: un reporte "movimientos del mes" global haría un scan, probablemente aceptable a este volumen pero hay que confirmarlo. `unidades_insumo` tiene `(insumoId, estado)` y `(equipoId)`.
- **Tamaño esperado (inferencia, no medido):** catálogo de insumos de un tenant de soporte IT en el orden de decenas a pocos cientos; unidades por serie, de cientos a pocos miles; movimientos, de miles a decenas de miles. Una foto de stock queda holgadamente bajo `TOPE_FILAS_EXPORT = 5000`; el listado de unidades y los movimientos por período podrían rozarlo.
- **Paginación:** hoy solo la bitácora por insumo (`pagina`/`porPagina`, defaults del caso de uso). Los exports son sin paginación y con tope. Un reporte en pantalla de decenas/cientos de filas no la necesita; el de unidades y el de movimientos sí o bien se acotan por filtro y tope.
- **Consistencia:** las dos lecturas (libro y unidades) deben hacerse sin lock y no atómicas entre sí; es una foto, igual que la ficha. Documentarlo en el reporte (fecha y hora de generación).
- **Memoria:** el patrón actual arma el CSV completo en un `string` en memoria con tope; no hay streaming. Coherente con el tope.

## 5. Comparación de mercado (conocimiento general)

Los reportes habituales en helpdesk/ITAM/inventario (GLPI, Snipe-IT, Odoo Inventory, Freshservice, ManageEngine AssetExplorer, Lansweeper):

| Reporte típico | Descripción | ¿Aplica acá? |
|---|---|---|
| Stock actual por artículo | Existencia, unidad de medida, familia/categoría, estado activo | Sí, base de todo |
| Bajo mínimo / a reponer | Filtra o resalta artículos bajo el punto de reposición; a veces con "cantidad sugerida a reponer" (mínimo − stock) | Sí: `estadoReposicion` ya existe |
| Stock valorizado | Existencia × costo unitario, total por familia | **No hay costo**; ver P4 |
| Por condición | Nuevo vs. usado/reacondicionado | Sí: dato propio de este sistema |
| Movimientos por período | Entradas, salidas y ajustes entre dos fechas, por artículo, usuario, tipo, sector | Sí: la bitácora ya guarda todo |
| Consumo / rotación | Salidas promedio por mes, días de cobertura | Derivable de movimientos; fuera de lo pedido |
| Activos/piezas por serie | Listado de seriales con estado, ubicación y a quién están asignados | Sí con `SERIE`: `unidades_insumo` |
| Piezas instaladas por equipo | Qué componentes (serial) tiene cada equipo | Sí: `unidades_insumo.equipoId`, `componentes_equipo` |
| Series pendientes | Unidades sin serial cargado | Sí: `pendientesDeSerie` |
| Compras recibidas / pendientes | Lo comprado contra lo recibido | Ya vive en el módulo Compras |
| Descartes / bajas | Piezas dadas de baja con motivo | Parcial: eventos `DESCARTE`, `BAJA_DE_DEPOSITO` |
| Formatos de salida | CSV casi universal; XLSX frecuente; PDF/imprimible para inventario físico y auditoría | CSV ya resuelto en el repo |

Lo más frecuente en herramientas de este tamaño: **stock actual con alerta de mínimo + exportación a CSV/Excel**, y la hoja de conteo para inventario físico (impresión). Lo valorizado y lo de rotación son típicos de herramientas de ERP, y aquí no hay datos de costo.

## 6. Áreas afectadas (según la opción)

- `backend/src/insumos/domain/ports/i-movimiento-insumo.repository.ts` y `i-unidad-insumo.repository.ts` — consultas agregadas nuevas (suma/conteo para todos los insumos; unidades de todos los insumos; movimientos por rango de fechas).
- `backend/src/insumos/infrastructure/persistence/prisma/prisma-movimiento-insumo.repository.ts` y `prisma-unidad-insumo.repository.ts` — implementación (`groupBy` o SQL crudo).
- `backend/src/insumos/application/use-cases/` — casos de uso nuevos (`ReporteStockInsumos`, `ExportarStockInsumos`; según opción movimientos y unidades). **Sin transacción ni lock**, con `Pick` del puerto como en `ConsultarStockInsumoUseCase`.
- `backend/src/insumos/interface/controllers/insumos.controller.ts` (o uno nuevo `reportes-insumos.controller.ts`) y DTOs — rutas `GET /insumos/reporte-stock` y `.../export` **declaradas antes de cualquier `:id`** con `INSUMOS:LECTURA`.
- `backend/src/insumos/domain/errors/` — error propio de exportación demasiado grande (cada módulo tiene el suyo) y su mapeo HTTP 422 en el `toHttpException` del controller.
- `backend/src/shared/infrastructure/csv/csv.ts` — probable helper de cantidad con coma decimal; decisión sobre negativos.
- `backend/src/insumos/insumos.module.ts` — registrar proveedores.
- `frontend/src/features/insumos/` — pantalla (nueva vista de reporte o pestaña en la sección Insumos/Repuestos), filtros en URL, botón `ExportarCsvButton`, hook de datos, navegación y permisos de menú.
- `frontend/src/shared/` — `ExportarCsvButton`/`useExportarCsv` se reutilizan sin cambios (`recurso` = `insumos/reporte-stock` o `insumos`).
- `backend/ayuda/*.md` — la Ayuda está suspendida: **anotar la deuda** en commit y PR; no escribir artículos.
- `docs/roadmap-comercial.md` — al cerrar, declarar **Cumplida/Desviación** en la viñeta del punto (lo exige `scripts/check-roadmap-fresco.mjs`).
- Tests: unit de los casos de uso, integration de las consultas agregadas (incluida la comparación contra `ConsultarStockInsumoUseCase` para detectar divergencia entre las dos fuentes del saldo), e2e del endpoint (permiso, tope, headers, BOM).

## 7. Opciones

### 7.1 Alcance

| Opción | Contenido | Pros | Contras | Esfuerzo |
|---|---|---|---|---|
| **A. Foto de stock** | Una fila por insumo (y condición: NUEVO/USADO como columnas), con familia, unidad de medida, mínimo, estado de reposición, seguimiento, pendientes de serie. Filtros: familia, repuesto/consumible, solo bajo mínimo, activo. Pantalla + CSV | Cubre literalmente "un reporte y exportación del stock"; entra bajo el tope; reutiliza toda la plomería CSV; el único trabajo nuevo real son las dos consultas agregadas y la pantalla | No responde "qué pasó" ni "dónde están las piezas por serial" | Bajo a medio |
| **B. A + movimientos por período** | Suma un reporte de bitácora global con rango de fechas y filtros (insumo, familia, tipo, condición, usuario, sector/equipo) y su CSV | Responde auditoría y consumo; la bitácora ya tiene todo | Consulta nueva sobre `createdAt` sin índice global; puede superar el tope en períodos largos; un segundo reporte = más pantalla, más tests | Medio |
| **C. B + piezas por serie e instalado por equipo** | Suma el listado de unidades (serial, estado, condición, equipo, ingreso) y "piezas instaladas por equipo" | El valor diferencial del ciclo de seriales; responde "dónde está esta pieza" | Es lo más cercano a volver a abrir el ciclo anterior; mayor riesgo de pasar el tope; combina varias fuentes (`unidades_insumo`, `componentes_equipo`, `equipos_informaticos`) | Alto |

Variante barata dentro de A: **la hoja de unidades como un segundo CSV** del mismo endpoint (`?detalle=series`) en lugar de una pantalla propia. Cumple "con serial" sin pantalla.

### 7.2 Formato

| Opción | Pros | Contras |
|---|---|---|
| **CSV** (el del repo: `;`, BOM, coma decimal) | Cero dependencias; patrón probado en cuatro módulos; se abre en Excel; tests y helpers listos | Sin formato, sin varias hojas; negativos con apóstrofo; el usuario que quiere "Excel de verdad" no lo tiene |
| **XLSX** (exceljs o similar) | Varias hojas, tipos numéricos reales, formato | Dependencia nueva (peso, mantenimiento), patrón nuevo, tests nuevos; para A no hace falta |
| **PDF / vista imprimible** | Útil para el conteo físico y la auditoría | Dependencia o estilos de impresión nuevos; no hay base alguna en el repo; no es lo pedido ("exportación") |

### 7.3 Dónde se exporta

| Opción | Pros | Contras |
|---|---|---|
| **Servidor (patrón actual)** | Coherente con las otras cuatro exportaciones; el tope y los errores de dominio están resueltos; el archivo no depende de lo cargado en pantalla | Cada reporte necesita su caso de uso de exportación |
| **Cliente (armar el CSV con los datos de la pantalla)** | Un solo endpoint de datos | Duplica el serializador en el frontend (escapado, BOM, inyección de fórmulas, hora argentina), rompe la política única y el tope; descartada |

## 8. Recomendación

**Opción A, CSV, en el servidor**, con una arquitectura que deje B y C como incrementos sin retrabajo:

1. Dos consultas agregadas nuevas en los puertos (saldo del libro por insumo y condición; conteo de unidades EN_DEPOSITO por insumo y condición, con pendientes de serie), y el cálculo del saldo y del estado de reposición **siempre por las funciones de dominio existentes**.
2. `GET /insumos/reporte-stock` (JSON para la pantalla) y `GET /insumos/reporte-stock/export` (CSV por `armarExportCsv`) gateados con `INSUMOS:LECTURA`, declarados antes de cualquier ruta con parámetro.
3. Un test que compare, sobre datos reales de integración, el saldo del reporte contra `ConsultarStockInsumoUseCase` para NINGUNO y SERIE: es la red contra la divergencia de fuentes.
4. Pantalla como pestaña o ruta dentro de la sección de insumos/repuestos, con filtros en la URL y `ExportarCsvButton`.
5. Dejar fuera, por defecto: valorizado, movimientos por período y detalle por serie, hasta que las preguntas de abajo los pidan.

El valorizado es el único ítem que **no** se puede decidir con el código: no hay costo de insumo en ningún modelo.

## 9. Riesgos

- **Dos fuentes del saldo.** Un reporte que sume solo el libro mostraría un número distinto del de la ficha en insumos SERIE (o al revés). Mitigación: ramificar por `seguimiento` y fijarlo con el test de comparación.
- **N+1** si se orquesta con `ConsultarStockInsumoUseCase` insumo por insumo. Mitigación: agregados nuevos en los puertos.
- **Saldo negativo** posible (no hay backstop de base): el CSV lo escaparía como texto por la neutralización de fórmulas. Decidir cómo mostrarlo.
- **Insumos deshabilitados o con familia deshabilitada:** la ficha los muestra a propósito (puede quedar stock que hay que vaciar). El reporte tiene que decidir si los incluye (P3).
- **Foto no atómica** entre libro y unidades; debe aclararse con fecha y hora de generación.
- **Tope de 5000** y exportación en memoria: ajustado para unidades/movimientos, holgado para la foto.
- **Permisos:** un valorizado o un listado por serial podrían exigir una acción distinta de `INSUMOS:LECTURA`; hoy la matriz no la tiene.
- **Ayuda suspendida:** anotar la deuda (pantalla nueva y export) en commit y PR.
- **Spec del roadmap:** al implementar un punto del roadmap, la spec debe citar la sección de decisiones cerradas, y esa sección hoy no existe para este punto; las respuestas del dueño a las preguntas deberían registrarse allí antes de la spec, para que `sdd-verify` tenga contra qué contrastar.

## 10. Estado para la propuesta

**No listo todavía.** El alcance depende de decisiones de producto que el código no puede resolver. Decirle al dueño que responda, como mínimo, P1, P2, P3 y P5. Con esas cuatro se puede proponer la opción A con confianza; P4 (valorizado) es el único que puede cambiar el modelo de datos.

## 11. Preguntas de producto abiertas

Cada pregunta lleva su recomendación entre paréntesis.

- **P1. ¿Qué reportes se necesitan en este ciclo?**
  - (a) Solo la foto de stock actual (opción A) (recomendado).
  - (b) Foto + movimientos por período (opción B).
  - (c) Foto + movimientos + detalle por serie e instalado por equipo (opción C).
  - (d) Foto ahora; el resto se pide por separado más adelante (equivale a (a) dejando la puerta abierta).

- **P2. ¿Qué columnas lleva la foto de stock?**
  - (a) Código, nombre, familia, tipo (consumible/repuesto), unidad de medida, stock NUEVO, stock USADO, total, punto de reposición, estado de reposición (recomendado).
  - (b) Lo de (a) más seguimiento (con serie / sin serie) y series pendientes.
  - (c) Lo de (b) más última fecha de movimiento por insumo (requiere otra consulta agregada).
  - Sub-decisión: ¿una fila por insumo con dos columnas NUEVO/USADO (recomendado) o una fila por insumo y condición?

- **P3. ¿Qué filtros y qué universo de insumos?**
  - (a) Filtros: familia, consumible/repuesto, solo bajo mínimo; incluye activos y deshabilitados con una columna "Estado" (recomendado, coherente con la ficha, que no esconde el stock de un deshabilitado).
  - (b) Igual que (a) pero solo habilitados.
  - (c) Sin filtros: todo el catálogo vigente.
  - Sub-decisión: ¿se incluyen insumos con stock cero? (recomendado: sí, con opción "ocultar sin stock").

- **P4. ¿Valorizado?** Hoy no hay costo ni precio del insumo; solo `monto` y `moneda` por ítem de compra.
  - (a) No: reporte de cantidades solamente (recomendado para este ciclo).
  - (b) Valorizar con el último precio de compra recibido de cada insumo, aclarando que es una estimación y por moneda (usa el dato existente, pero es multimoneda y los ítems históricos no tienen insumo).
  - (c) Agregar un campo "costo unitario" al ABM de insumos (ciclo propio: modelo, migración, formulario, permiso).

- **P5. ¿Quién puede ver el reporte y exportarlo?**
  - (a) Cualquiera con `INSUMOS:LECTURA`, igual que la ficha y el stock (recomendado).
  - (b) Una acción nueva `INSUMOS:REPORTES` en la matriz de permisos.
  - (c) Ver con `INSUMOS:LECTURA`, exportar con una acción más restrictiva.

- **P6. ¿Formato de exportación?**
  - (a) CSV como el resto de la aplicación: `;`, BOM, abre en Excel, botón "Exportar a Excel" (recomendado).
  - (b) XLSX real (agrega una dependencia y un patrón nuevo).
  - (c) CSV más vista imprimible (hoja de conteo para inventario físico).

- **P7. ¿Se incluye detalle por serie?** (solo aplica si P1 es (c), o como variante barata de (a)/(b))
  - (a) No: la foto cuenta unidades pero no lista seriales (recomendado con P1 = (a)).
  - (b) Un segundo CSV de unidades (serial, estado, condición, equipo, fecha de ingreso) accesible desde el mismo botón o un selector.
  - (c) Reporte propio "piezas instaladas por equipo" con pantalla.
  - Si el listado de unidades puede pasar de 5000, ¿se acepta el error de "demasiadas filas" con filtros para acotar?

- **P8. Si hay movimientos por período (P1 = (b) o (c)), ¿cuáles son los rangos y filtros?**
  - (a) Rango de fechas obligatorio (desde/hasta, día argentino) y filtros por insumo, familia, tipo y condición (recomendado).
  - (b) Rangos predefinidos (mes en curso, mes anterior, últimos 30/90 días) más personalizado.
  - (c) Agregar usuario, sector y equipo de destino como filtros y columnas.
  - Sub-decisión: ¿resumen por insumo (entradas, salidas, ajustes del período) o una fila por movimiento? (el resumen entra bajo el tope; la fila por movimiento puede no entrar).

- **P9. ¿Dónde vive en la interfaz?**
  - (a) Una pestaña o botón "Reporte de stock" dentro de la sección Insumos, con el export (recomendado).
  - (b) Una sección propia "Reportes" en el menú, pensada para crecer.
  - (c) Solo el botón "Exportar a Excel" en el listado de insumos y de repuestos (sin pantalla de reporte; reutiliza `ExportarCsvButton` tal cual, y en este caso el listado tendría que mostrar el stock, hoy no lo muestra).

- **P10. Cantidades fraccionarias y saldos negativos.**
  - (a) Mostrar la cantidad tal cual, con coma decimal y sin decimales cuando la unidad de medida es entera (recomendado); un saldo negativo se exporta como número negativo (con un helper nuevo que no lo trate como fórmula) y se resalta en la pantalla.
  - (b) Mostrar siempre dos decimales.
  - (c) Excluir y avisar de los saldos negativos (esconde un desvío que hoy el sistema deja a la vista a propósito).
