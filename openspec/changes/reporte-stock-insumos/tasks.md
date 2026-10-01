# Tasks: reporte y exportación del stock de insumos

> **Desviación de presupuesto declarada.** La skill `sdd-tasks` limita este artefacto a 530
> palabras; lo supera porque cada work unit lleva sus tareas, comandos de verificación, escenarios
> de spec y límite de PR, más el mapa escenario → tarea que `sdd-verify` necesita. Recortar
> cobertura para entrar en el presupuesto sería peor que declarar el excedente.

> **TDD en este ciclo: deshabilitado.** Es una feature, no una corrección de defecto
> (`~/proyectos/CLAUDE.md` §6.3). Modo estándar: el test viaja en el mismo commit que el código
> que verifica, sin exigir RED verificado antes de la implementación.

> **Ayuda: escritura suspendida** (`CLAUDE.md` del repo). Ningún WU crea ni actualiza artículos de
> `backend/ayuda/*.md`, salvo que un WU vuelva **falso** uno existente (el diseño verificó que no
> ocurre: el reporte es una pantalla y una ruta nuevas). Los WU con UI (5 y 6) anotan la deuda en
> el cuerpo del commit y del PR: *"Ayuda pendiente: pantalla Reporte de stock (filtros, columnas,
> estado de reposición, cantidades negativas resaltadas) y exportación 'Exportar a Excel' del
> reporte"*. Los WU de backend dicen "sin deuda".

> **Este ciclo implementa un pedido del roadmap** (viñeta "Reporte de stock" de "Decisiones de
> producto ya cerradas", `docs/roadmap-comercial.md`). La spec ya convirtió cada sub-viñeta en un
> requerimiento (R1 a R9). WU-6 cierra la viñeta declarando **Cumplida** o **Desviación**.

## Review Workload Forecast

| Field | Value |
|---|---|
| Estimated changed lines | ~2.400 (+/−) en total; entre 330 y 480 por WU |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | Tracker con 6 PR hijos en cadena lineal (el hint del diseño preveía 4; el frontend y el bloque CSV/export se parten para que código y tests entren juntos bajo 400) |
| Delivery strategy | auto-chain |
| Chain strategy | feature-branch-chain |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: feature-branch-chain
400-line budget risk: High

**Por qué "No" a la decisión:** el dueño confirmó auto-chain con feature-branch-chain y la política
de tamaño (partir en costura limpia con código y tests juntos; `size:exception` solo si partir los
separa, con `size:exception: N lineas, <por qué>` en el cuerpo del commit). No hay migración ni
decisión de producto abierta (el diseño no tiene preguntas abiertas).

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|---|---|---|---|---|---|
| 1 | Puertos y agregados por lote (`groupBy`) con integración | PR 1 → tracker | `cd backend && pnpm vitest run src/insumos/infrastructure/persistence/prisma` | Base `soporte_tenant_test` migrada; integración sobre base efímera | Métodos aditivos en 3 puertos y 3 repos; nadie los llama aún |
| 2 | Caso de uso núcleo + comparación con la ficha | PR 2 → wu01 | `cd backend && pnpm vitest run src/insumos/application/use-cases/consultar-reporte-stock src/insumos/application/use-cases/reporte-stock-coincide-con-ficha.integration.spec.ts` | Integración sobre base efímera (ficha vs. reporte) | Un use case nuevo sin ruta; revert sin efecto en runtime |
| 3 | `cantidadCsv`/`CeldaNumericaCsv`, exportación y error de tope | PR 3 → wu02 | `cd backend && pnpm vitest run src/shared/infrastructure/csv src/insumos/application/use-cases/exportar-reporte-stock` | N/A: unitario puro, sin I/O (el CSV real se ejercita en el e2e de WU-4) | `csv.ts` aditivo (tipo y fábrica nuevos) + use case sin ruta |
| 4 | Controller, DTOs, registro primero, mapeo 422, e2e | PR 4 → wu03 | `cd backend && pnpm vitest run src/insumos/interface` | e2e supertest sobre tenant efímero: `GET /insumos/reporte-stock` y `/export` | Quitar controller y su registro; el resto queda inerte |
| 5 | Frontend base: tipos, filtros↔URL, formato, reposición compartida, hook | PR 5 → wu04 | `cd frontend && pnpm vitest run src/features/insumos` | N/A: libs puras y hook con MSW | Archivos nuevos + movimiento de dos constantes (revertible junto) |
| 6 | Frontend: vista, página, enlace, botón; cierre del roadmap | PR 6 → wu05 | `cd frontend && pnpm vitest run src/features/insumos` y `node scripts/check-roadmap-fresco.mjs` | Componente con MSW; ruta `/insumos/reporte-stock` | Quitar página, vista y enlace; el roadmap vuelve a "Pendiente" |

| WU | Estimación | Riesgo | Corte previsto si se pasa |
|---|---|---|---|
| 1 | ~450 (puertos 40, repos 130, integración 280) | Medio | Repos de movimientos/unidades vs. repo de insumo + helper de ceros |
| 2 | ~480 (use case 90, spec unitario 200, integración de comparación 190) | Medio | Unit vs. integración de comparación |
| 3 | ~400 (csv 70 + spec 90, export 90 + spec 150) | Bajo | `csv.ts` vs. exportación |
| 4 | ~420 (controller 90, DTO 50, mapeo 10, spec 90, e2e 180) | Medio | Controller + spec vs. e2e |
| 5 | ~330 | Bajo | — |
| 6 | ~450 | Medio | Vista vs. enlace + roadmap |

## Cadena de PR y dependencias

Ramas: `feat/reporte-stock-insumos-wu01` a `feat/reporte-stock-insumos-wu06`. El tracker
`feat/reporte-stock-insumos` ya contiene los commits de planificación. **Cada PR hijo apunta a la
rama del PR inmediatamente anterior**; solo el tracker se integra a `main`. Si un hijo muestra
cambios del anterior, la base está mal: retargetear o rebasar.

`main` ← tracker ← wu01 ← wu02 ← wu03 ← wu04 ← wu05 ← wu06

| WU | Depende de | Motivo |
|---|---|---|
| 1 | — | Puertos y agregados que consumen los use cases |
| 2 | 1 | El núcleo usa los tres métodos de lote |
| 3 | 2 | La exportación compone el núcleo; `cantidadCsv` solo la usa ella |
| 4 | 3 | El controller invoca ambos use cases y mapea el error de tope |
| 5 | 4 | Los hooks y los tipos consumen el contrato HTTP ya existente |
| 6 | 5 | La vista usa filtros, hook y formato; cierra el roadmap |

## Recordatorios operativos

- **`usarLockMasterTest()`**: todo spec e2e o de integración que trunque `soporte_master_test` lo
  llama antes de su `describe` (el e2e de WU-4). Los specs con base tenant **efímera** sin master
  compartido no lo necesitan.
- **Higiene de base efímera**: limpiar filas → `app.close()` → `dropDatabase`. Al revés, el DROP
  falla en silencio.
- **Si la suite tira `PrismaClientKnownRequestError` masivo** en los `*.integration.spec.ts`, es la
  base caída (`P1001`), no el código. No hay migración en este ciclo: no se toca `schema.prisma`.
- **Gates de backend**: `cd backend && pnpm lint && pnpm typecheck && pnpm vitest run <ruta> &&
  pnpm test`. **Gates de frontend**: `cd frontend && pnpm lint && pnpm type-check && pnpm vitest
  run src/features/insumos && pnpm test`.
- **Conventional Commits, sin atribución de IA. No commitear desde esta fase de tasks**; apply
  commitea por WU.
- **Nunca hardcodear el nombre de la base de un tenant real**; ningún test toca un tenant real.
- **Specs de `openspec/specs/`**: no se editan en apply; el alta del dominio la hace `sdd-archive`.

---

## WU-1 — Puertos y agregados por lote: `groupBy` en los tres repos

**Branch**: `feat/reporte-stock-insumos-wu01` · **Base**: tracker (`feat/reporte-stock-insumos`)

- [ ] 1.1 Puerto `backend/src/insumos/domain/ports/i-movimiento-insumo.repository.ts`: `sumByTipoDeInsumos(insumoIds: readonly string[]): Promise<Map<string, SumasPorCondicionYTipo>>`. Contrato en JSDoc: cada id pedido está en el mapa con ceros completos (2×4); lista vacía devuelve mapa vacío sin ir a la base; sin lock ni transacción. (Req: R11)
- [ ] 1.2 Puerto `backend/src/insumos/domain/ports/i-unidad-insumo.repository.ts`: `contarEnDepositoPorCondicionDeInsumos(insumoIds): Promise<Map<string, ConteoPorCondicion>>` con el mismo contrato (ceros 2, lista vacía, sin lock). (Req: R9, R11)
- [ ] 1.3 Puerto `backend/src/insumos/domain/ports/i-insumo.repository.ts`: tipo `FilaCatalogoStock` (`insumoId`, `codigo`, `nombre`, `activo`, `seguimiento`, `stockMinimo: number | null`, `familia {id, nombre, esRepuesto}`, `unidadMedida {codigo, nombre, entera}`) y `listarParaReporteStock(f: { familiaId?: string; esRepuesto?: boolean })`. Proyección, no `InsumoEntity`. (Req: R2, R3)
- [ ] 1.4 `prisma-movimiento-insumo.repository.ts`: `sumByTipoDeInsumos` con un `groupBy` (`insumoId IN (...)`, por condición y tipo) y extraer la completación con ceros del `sumarPorTipo` privado a un helper compartido por la lectura individual y la de lote (no dos copias). Sin `exigirTransaccionActiva`. (Req: R11)
- [ ] 1.5 `prisma-unidad-insumo.repository.ts`: `contarEnDepositoPorCondicionDeInsumos` con un `groupBy` sobre `estado = 'EN_DEPOSITO'` (cuenta pendientes de serie) y ceros para ids sin filas; sin lock. (Req: R9, R11)
- [ ] 1.6 `prisma-insumo.repository.ts`: `listarParaReporteStock` en una consulta con `select` y relaciones, `deletedAt: null` sobre el insumo, filtros `familiaId` y `familia.esRepuesto` en SQL, orden `codigo ASC`; convierte `stockMinimo` con `Number(...)` (como `InsumoMapper`) y `null` queda `null`. Incluye deshabilitados y familia deshabilitada. (Req: R2, R3)
- [ ] 1.7 Integración `backend/src/insumos/infrastructure/persistence/prisma/prisma-movimiento-insumo.repository.reporte-stock.integration.spec.ts` (base efímera): ceros completos para un insumo sin movimientos, aislamiento entre dos insumos, lista vacía ⇒ mapa vacío (y cero consultas), resultado igual a `sumByTipo` por insumo. (Escenarios abajo)
- [ ] 1.8 Integración `.../prisma-unidad-insumo.repository.reporte-stock.integration.spec.ts`: conteo por condición solo de `EN_DEPOSITO` (descarta `INSTALADA`, `ENTREGADA`, `DESCARTADA`), pendiente de serie suma, ceros para id sin unidades, lista vacía, igual a `contarEnDepositoPorCondicion` por insumo.
- [ ] 1.9 Integración `.../prisma-insumo.repository.reporte-stock.integration.spec.ts`: excluye `deletedAt` no nulo, incluye deshabilitado y de familia deshabilitada, filtra por `familiaId` y por `esRepuesto`, orden por código, `stockMinimo` `Decimal` → `number` y nulo → `null`, campos de familia y unidad (`entera`).
- [ ] 1.10 Quality gates (backend): `cd backend && pnpm lint && pnpm typecheck && pnpm vitest run src/insumos/infrastructure/persistence/prisma src/insumos/domain` y `pnpm test`.

**Escenarios**: base de Sin N+1 (R11, capa repo: ceros, aislamiento y lista vacía sin consulta);
base de Pendientes de serie suman al saldo y SERIE coincide (conteo solo `EN_DEPOSITO`); base de
Deshabilitado incluido, Insumo en familia deshabilitada incluido y Baja lógica excluida (catálogo);
Filtro por familia y tipo (catálogo); Insumo sin punto de reposición (`stockMinimo` nulo).
**PR boundary**: ~450 líneas, base tracker. Corte si pasa de 400: repos de movimientos y unidades /
repo de insumo con su integración. Revert limpio: todo es aditivo.
**Ayuda**: sin deuda (sin cambio visible).
Commit sugerido: `feat(insumos): agregados de stock por lote para el reporte`.

## WU-2 — Caso de uso núcleo `ConsultarReporteStockUseCase` y comparación con la ficha

**Branch**: `feat/reporte-stock-insumos-wu02` · **Base**: wu01

- [ ] 2.1 Crear `backend/src/insumos/application/use-cases/consultar-reporte-stock.use-case.ts`: `execute(filtros): Promise<ReporteStock>` sin `Result`; constructor con `Pick` de los tres métodos de lote y `ahora: () => Date`. Pasos de ADR-2: `generadoEn = ahora()` antes de leer; catálogo filtrado; ids partidos por `seguimiento`, `NINGUNO` → `calcularSaldos(sumByTipoDeInsumos)` y `SERIE` → `saldosDesdeUnidades(contarEnDepositoPorCondicionDeInsumos)` en `Promise.all`; `evaluarReposicion(saldos.NUEVO, stockMinimo)`; filtros derivados después del dominio. (Req: R1, R2, R3, R9, R10)
- [ ] 2.2 Filtros derivados en el mismo use case: `soloBajoMinimo` → solo `BAJO_MINIMO`; `ocultarSinStock` → oculta únicamente `NUEVO === 0 && USADO === 0` (un negativo o NUEVO 3 / USADO −3 nunca se oculta); orden por código; punto de reposición `null` conserva `SIN_PUNTO_DEFINIDO`. Exportar tipos `FiltrosReporteStock`, `FilaReporteStock`, `ReporteStock`. (Req: R2, R3, R8)
- [ ] 2.3 Spec unitario `consultar-reporte-stock.use-case.spec.ts` con fakes `Pick`: columnas de la fila "R-1" (NUEVO 3, USADO 2, mín 5 ⇒ total 5, BAJO_MINIMO); `stockMinimo` nulo ⇒ vacío y SIN_PUNTO_DEFINIDO; filtros familia y tipo; solo bajo mínimo con tres estados; deshabilitado con stock 4 presente con su estado; familia deshabilitada; ocultar sin stock con las cuatro variantes (0/0, total 2, saldo negativo, 3/−3); usados no tapan el faltante (mín 5, NUEVO 2, USADO 10 ⇒ total 12 y BAJO_MINIMO); NUEVO igual al mínimo ⇒ BAJO_MINIMO; reloj fijo ⇒ `generadoEn` es el de `ahora()` y se toma antes de la primera lectura; orden por código; un `SERIE` toma el saldo de las unidades aunque el libro difiera.
- [ ] 2.4 En el mismo spec, **Sin N+1 (R11)**: ~50 ids mezclados `NINGUNO`/`SERIE` con fakes contadores; `listarParaReporteStock` ×1, `sumByTipoDeInsumos` ×1, `contarEnDepositoPorCondicionDeInsumos` ×1; los fakes no exponen `sumByTipo`, `contarEnDepositoPorCondicion` ni `findById`, así que una llamada por insumo no compila ni corre. Además: con lista vacía de un tipo no se llama a la consulta de ese tipo.
- [ ] 2.5 Integración de comparación `backend/src/insumos/application/use-cases/reporte-stock-coincide-con-ficha.integration.spec.ts` (base tenant efímera; higiene: filas → `app.close()` → `dropDatabase`): por cada fila del reporte, saldos y `estadoReposicion` iguales a `ConsultarStockInsumoUseCase` para `NINGUNO` (NUEVO y USADO, negativo, sin movimientos) y `SERIE` (unidades en los 4 estados y en ambas condiciones, una pendiente). Incluye un `SERIE` cuyo libro **difiere** de sus unidades (movimiento insertado directo en el fixture): la fila sigue a las unidades. Incluye insumo deshabilitado y de familia deshabilitada (presentes) y baja lógica (ausente; la ficha responde no encontrado para ella).
- [ ] 2.6 **Mutación adversarial local** (no se commitea; declarar el resultado en el PR): hacer que la rama `SERIE` use `calcularSaldos` sobre el libro ⇒ el spec 2.5 debe ponerse rojo; contar `INSTALADA` en el conteo ⇒ rojo; revertir y dejar verde.
- [ ] 2.7 Quality gates (backend): `cd backend && pnpm lint && pnpm typecheck && pnpm vitest run src/insumos/application/use-cases` y `pnpm test`.

**Escenarios**: Columnas de una fila; Insumo sin punto de reposición; Filtro por familia y tipo;
Solo bajo mínimo; Deshabilitado incluido con su estado; Insumo en familia deshabilitada incluido;
Ocultar sin stock; Baja lógica excluida, como la ficha; NINGUNO coincide con la ficha; SERIE
coincide con la ficha; Pendientes de serie suman al saldo; Libro de un SERIE no se usa; Usados no
tapan el faltante; Saldo igual al mínimo; Cantidad de consultas acotada.
**PR boundary**: ~480 líneas, base wu01. Corte si pasa: unit (2.1 a 2.4) / integración (2.5 y 2.6).
Un use case sin ruta: revert sin efecto en runtime.
**Ayuda**: sin deuda.
Commit sugerido: `feat(insumos): caso de uso del reporte de stock con la misma formula que la ficha`.

## WU-3 — CSV: `cantidadCsv`/`CeldaNumericaCsv`, exportación y error de tope

**Branch**: `feat/reporte-stock-insumos-wu03` · **Base**: wu02

- [ ] 3.1 `backend/src/shared/infrastructure/csv/csv.ts`: interfaz `CeldaNumericaCsv { tipo: 'numero'; texto: string }`, ampliar `ValorCelda`, y `cantidadCsv(valor: number, entera: boolean)`. `Number.isFinite` o lanza; `-0` → `0`; unidad `entera` con valor entero ⇒ sin decimales; cualquier fraccionario ⇒ dos decimales con coma, sin miles, sin redondear a entero. Salida solo `^-?\d+(,\d{2})?$`. (Req: R8)
- [ ] 3.2 `aTexto` y `escaparCelda` emiten `CeldaNumericaCsv.texto` tal cual, sin neutralizar ni entrecomillar; el texto libre sigue neutralizado y un `number` plano conserva el comportamiento actual (no cambia las exportaciones existentes). (Req: R8)
- [ ] 3.3 Spec `backend/src/shared/infrastructure/csv/csv.spec.ts` (ampliar): `cantidadCsv(3, true)` ⇒ `3`; `cantidadCsv(2.5, false)` ⇒ `2,50`; fraccionario en unidad entera ⇒ `2,50`; `-3` sale `-3` sin apóstrofo ni comillas; `-0` ⇒ `0` (nunca `-0` ni `-0,00`); `NaN` e `Infinity` lanzan; el texto `-3` y un texto que empieza con `=` siguen neutralizados; un `number` plano `-3` sigue saliendo como hoy (regresión).
- [ ] 3.4 `ExportacionStockDemasiadoGrandeError` en `backend/src/insumos/domain/errors/insumos.errors.ts` (mensaje explícito con el tope, como el de equipos).
- [ ] 3.5 Crear `backend/src/insumos/application/use-cases/exportar-reporte-stock.use-case.ts`: compone `ConsultarReporteStockUseCase` con los filtros idénticos que recibió; `TOPE_FILAS_EXPORT` sobre `filas.length` después del filtro (5000 pasa, 5001 lanza el error sin contenido); columnas de ADR-4 (Código, Nombre, Familia, Tipo Consumible/Repuesto, Unidad de medida, Stock nuevo, Stock usado, Stock total, Punto de reposición, Estado de reposición con las etiquetas de la ficha, Estado Habilitado/Deshabilitado, Generado el con `fechaHoraCsv(generadoEn)` repetido por fila); cantidades con `cantidadCsv(valor, unidadMedida.entera)`; punto de reposición `null` ⇒ celda vacía; **sin ninguna columna de dinero**; nombre `reporte-stock-insumos-aaaa-mm-dd.csv` con fecha argentina vía `armarExportCsv`. (Req: R1, R3, R4, R6, R8)
- [ ] 3.6 Spec `exportar-reporte-stock.use-case.spec.ts`: espía sobre el núcleo recibe los mismos filtros (filas y orden del CSV = las del JSON); columnas y etiquetas exactas, sin monto/costo/precio/moneda en el encabezado ni en los datos aun con un fake de núcleo que arrastre ítems de compra con monto; BOM, `;` y nombre con regex `^reporte-stock-insumos-\d{4}-\d{2}-\d{2}\.csv$`; con reloj 2026-10-02T01:30Z la celda "Generado el" vale `01/10/2026 22:30` y el nombre lleva `2026-10-01`; 5000 filas ⇒ encabezado + 5000 líneas; 5001 ⇒ `ExportacionStockDemasiadoGrandeError` y ningún contenido; negativo −3 exportado como `-3`; entero `3` vs. fraccionario `2,50`; nombre de insumo `=cmd` neutralizado.
- [ ] 3.7 Quality gates (backend): `cd backend && pnpm lint && pnpm typecheck && pnpm vitest run src/shared/infrastructure/csv src/insumos/application/use-cases src/insumos/domain` y `pnpm test`.

**Escenarios**: El CSV registra la generación; Ninguna columna de dinero; Formato del archivo
(parte unitaria: BOM, `;`, nombre); Más de 5000 filas; Exactamente 5000 filas; Mismos filtros en
pantalla y exportación (parte unitaria); Unidad entera; Unidad fraccionaria; Negativo en el CSV;
Texto sigue neutralizado.
**PR boundary**: ~400 líneas, base wu02. Corte si pasa: `csv.ts` y su spec / exportación. `csv.ts`
es aditivo: revert limpio.
**Ayuda**: sin deuda.
Commit sugerido: `feat(insumos): exportacion CSV del reporte de stock con celda numerica tipada`.

## WU-4 — Borde HTTP: controller, DTOs, registro primero, mapeo 422, e2e

**Branch**: `feat/reporte-stock-insumos-wu04` · **Base**: wu03

- [ ] 4.1 Crear `backend/src/insumos/interface/dtos/reporte-stock.dto.ts`: DTO de query (`familiaId?: uuid`, `esRepuesto?`, `soloBajoMinimo?`, `ocultarSinStock?` con `parsearBooleanQuery`) y DTO de respuesta `{ generadoEn: string (ISO), filas }` sin ningún campo de dinero. (Req: R1, R3, R4)
- [ ] 4.2 Crear `backend/src/insumos/interface/controllers/reporte-stock-insumos.controller.ts`: `@Controller('insumos/reporte-stock')`, `@UseGuards(JwtAuthGuard, TenantGuard)` a nivel de clase; `GET /` (JSON) y `GET /export` (CSV) con `@UseGuards(AccionesGuard)` + `@RequiereAcciones('INSUMOS:LECTURA')` por método; headers de `equipos.controller.ts` (`text/csv; charset=utf-8`, `Content-Disposition: attachment`, `Access-Control-Expose-Headers`). Sin chequeos de permiso inline. (Req: R5, R6)
- [ ] 4.3 `backend/src/insumos/insumos.module.ts`: registrar `ReporteStockInsumosController` **primero** en `controllers:` y los dos use cases como providers (con `ahora: () => new Date()`). (Req: R5)
- [ ] 4.4 `backend/src/insumos/interface/controllers/insumos.controller.ts`: mapear `ExportacionStockDemasiadoGrandeError` a 422 explícito en `toHttpException`. (Req: R6)
- [ ] 4.5 Spec `reporte-stock-insumos.controller.spec.ts` (patrón `equipos.controller.spec.ts`): reflexión confirma `INSUMOS:LECTURA` en los dos handlers y `JwtAuthGuard`/`TenantGuard` de clase; error de tope ⇒ 422 sin headers de descarga; el JSON incluye `generadoEn`; el DTO rechaza `familiaId` no uuid.
- [ ] 4.6 e2e `backend/src/insumos/interface/controllers/reporte-stock-insumos.e2e.spec.ts` (`usarLockMasterTest()` antes del `describe`; tenant efímero; higiene: filas → `app.close()` → `dropDatabase`): 403 sin la acción en `GET /insumos/reporte-stock` y en `/export` (y sin archivo); 200 en ambas con un rol que solo tiene `INSUMOS:LECTURA`; ruta no capturada por `:insumoId` (la atiende el reporte); `Content-Type: text/csv; charset=utf-8`, `Content-Disposition` con regex de nombre de R6, BOM al inicio, `;`; JSON con `generadoEn`; 400 con `familiaId` inválido; con filtros `familiaId` + `esRepuesto` + `soloBajoMinimo` + `ocultarSinStock` el CSV tiene las mismas filas y el mismo orden que el JSON; 5001 filas ⇒ 422 sin CSV parcial y 5000 ⇒ 200 completo (siembra masiva por SQL); ninguna clave de dinero en el JSON ni columna en el CSV.
- [ ] 4.7 Quality gates (backend): `cd backend && pnpm lint && pnpm typecheck && pnpm vitest run src/insumos/interface src/insumos/application` y `pnpm test`.

**Escenarios**: La respuesta lleva el instante de generación; Sin permiso la consulta responde 403;
Sin permiso la exportación responde 403; Con permiso ambas responden 200; Las rutas no las captura
`:id`; Formato del archivo; Más de 5000 filas (HTTP 422); Exactamente 5000 filas (HTTP); Mismos
filtros en pantalla y exportación (HTTP); Ninguna columna de dinero (HTTP).
**PR boundary**: ~420 líneas, base wu03. Corte si pasa: controller + DTO + spec / e2e. Revert: quitar
controller y su registro; los use cases quedan inertes.
**Ayuda**: sin deuda (backend; la pantalla llega en WU-5/6). Repetir `rg -n "INSUMOS:LECTURA|lectura" backend/ayuda/permisos-y-roles.md`: los permisos no cambian.
Commit sugerido: `feat(insumos): endpoints de reporte y exportacion del stock`.

## WU-5 — Frontend base: tipos, filtros ↔ URL, formato, reposición compartida, hook

**Branch**: `feat/reporte-stock-insumos-wu05` · **Base**: wu04

- [ ] 5.1 Mover `ETIQUETA_REPOSICION` y `VARIANTE_REPOSICION` de `frontend/src/features/insumos/components/insumo-detail-view.tsx` a `frontend/src/features/insumos/lib/reposicion.ts` (exporta ambas) y actualizar el import del detalle; el spec existente `insumo-detail-view.test.tsx` debe seguir verde sin cambios. (Req: R2)
- [ ] 5.2 `frontend/src/features/insumos/lib/formato-cantidad.ts`: `formatearCantidadEsAr(valor, entera)`: coma decimal; unidad entera con valor entero ⇒ sin decimales; fraccionario ⇒ siempre dos decimales, sin redondear a entero; `-0` ⇒ `0`. Spec `formato-cantidad.test.ts`: `3` ⇒ "3" (no "3,00"), `2,5` ⇒ "2,50", negativo `-3`, fraccionario en unidad entera ⇒ "2,50". (Req: R8)
- [ ] 5.3 `frontend/src/features/insumos/lib/filtros-reporte-stock.ts`: schema Zod que parsea `searchParams` (`familiaId`, `esRepuesto`, `soloBajoMinimo`, `ocultarSinStock`, valores inválidos ⇒ ignorados) y **un solo serializador** que arma el query string usado por el hook y por el botón de exportación. Spec `filtros-reporte-stock.test.ts`: ida y vuelta URL ↔ filtros, el query del export es idéntico al de la consulta, parámetros inválidos se descartan, orden estable de claves. (Req: R3, R7)
- [ ] 5.4 `frontend/src/features/insumos/types.ts`: `FilaReporteStock` y `ReporteStock` (`generadoEn`, `filas`) espejando el backend con Zod, sin ningún campo de dinero.
- [ ] 5.5 `frontend/src/features/insumos/hooks/use-reporte-stock.ts`: `useQuery` con clave `["reporte-stock", filtros]` y `staleTime: 0`, parseando la respuesta con el schema. Spec con MSW `use-reporte-stock.test.tsx`: manda los filtros serializados, devuelve `generadoEn`, refetch con filtros nuevos usa otra clave.
- [ ] 5.6 Quality gates (frontend): `cd frontend && pnpm lint && pnpm type-check && pnpm vitest run src/features/insumos` y `pnpm test`.

**Escenarios**: Filtros en la URL (parte lib: serialización y parseo); Unidad entera y Unidad
fraccionaria (formato en pantalla); Negativo en pantalla (base de formato); Mismos filtros en
pantalla y exportación (mismo query string).
**PR boundary**: ~330 líneas, base wu04. Sin corte previsto. Revert: archivos nuevos y el movimiento
de dos constantes.
**Ayuda**: Ayuda pendiente: pantalla Reporte de stock y exportación "Exportar a Excel" del reporte;
anotar en commit y PR (pausa vigente). Sin artículo falso.
Commit sugerido: `feat(insumos): base del reporte de stock en el frontend`.

## WU-6 — Frontend: vista, página, enlace, botón de exportación y cierre del roadmap

**Branch**: `feat/reporte-stock-insumos-wu06` · **Base**: wu05

- [ ] 6.1 `frontend/src/features/insumos/components/reporte-stock-view.tsx`: filtros (familia, consumible/repuesto, solo bajo mínimo, ocultar sin stock) reflejados en la URL (`useSearchParams`/`router.replace` con el serializador de 5.3); tabla con las columnas del CSV (sin dinero); "Generado el" visible con `formatearInstante`; cantidades con `formatearCantidadEsAr`; negativo con `text-destructive` y la fila sigue presente; `BAJO_MINIMO` con badge destructivo vía `lib/reposicion.ts`; columna de estado habilitado/deshabilitado. (Req: R1, R2, R3, R7, R8)
- [ ] 6.2 En la misma vista, `ExportarCsvButton` con `recurso="insumos/reporte-stock"` y texto "Exportar a Excel" usando el mismo query string de los filtros activos (sin cambios en el botón compartido). (Req: R6)
- [ ] 6.3 `frontend/src/app/(dashboard)/insumos/reporte-stock/page.tsx`: renderiza `ReporteStockView` envuelto en `<Can permiso="INSUMOS:LECTURA">` con el fallback `ErrorState`; el segmento estático gana sobre `[id]`. (Req: R7)
- [ ] 6.4 `frontend/src/features/insumos/components/catalogo-insumos-list-view.tsx`: enlace "Reporte de stock" dentro de su `<Can permiso="INSUMOS:LECTURA">`, con `esRepuesto` de la sección precargado en la URL. `nav-config.ts` no cambia. (Req: R7)
- [ ] 6.5 Tests Vitest + MSW `reporte-stock-view.test.tsx`: renderiza la tabla con filtros y "Generado el"; filtros ↔ URL (recargar conserva familia y solo bajo mínimo); el botón pide el mismo query string que la consulta; celda negativa con `text-destructive` y fila presente; entero "3" y fraccionario "2,50"; `BAJO_MINIMO` resaltado; sin `INSUMOS:LECTURA` la página muestra el fallback; y en `catalogo-insumos-list-view.test.tsx` (ampliar o crear) el enlace "Reporte de stock" no aparece sin el permiso y apunta con `esRepuesto` precargado con él. Ninguna columna ni texto de costo/precio/valor.
- [ ] 6.6 Cierre del roadmap en `docs/roadmap-comercial.md`: reemplazar **Pendiente** de la viñeta "Reporte de stock" por **Cumplida** (con evidencia: ciclo `reporte-stock-insumos`, rutas `GET /insumos/reporte-stock[/export]`, pantalla `/insumos/reporte-stock`) o **Desviación** con su motivo si apply o verify encontraron algo no implementado. Correr `node scripts/check-roadmap-fresco.mjs` (el check solo exige la declaración en puntos HECHO; esta viñeta está fuera de los seis puntos, pero el cierre es obligatorio por la regla del repo).
- [ ] 6.7 Quality gates (frontend): `cd frontend && pnpm lint && pnpm type-check && pnpm vitest run src/features/insumos && pnpm test`, más `node scripts/check-roadmap-fresco.mjs`.

**Escenarios**: Botón de la pantalla; Acceso desde Insumos; Filtros en la URL; Sin permiso (pantalla
y enlace); Negativo en pantalla; Unidad entera / fraccionaria (pantalla); La respuesta lleva el
instante de generación (pantalla); Ninguna columna de dinero (pantalla).
**PR boundary**: ~450 líneas, base wu05. Corte si pasa: vista y página con sus tests / enlace y
roadmap. Revert: quitar página, vista y enlace; el roadmap vuelve a "Pendiente".
**Ayuda**: Ayuda pendiente: pantalla Reporte de stock (filtros, columnas, estado de reposición,
cantidades negativas resaltadas) y exportación "Exportar a Excel" del reporte; anotar en commit y PR
(pausa vigente). Sin artículo falso.
Commit sugerido: `feat(insumos): pantalla del reporte de stock y cierre en el roadmap`.

---

## Mapa escenario → tarea

Cada escenario de `specs/reporte-stock-insumos/spec.md` (35) con la tarea que lo cubre. Donde hay
varias capas, la tarea primaria va primero.

| Req | Escenario | Tarea(s) |
|---|---|---|
| R1 | La respuesta lleva el instante de generación | 4.6, 4.5, 2.3, 6.5 |
| R1 | El CSV registra la generación | 3.6 |
| R2 | Columnas de una fila | 2.3 |
| R2 | Insumo sin punto de reposición | 2.3, 3.6, 1.9 |
| R3 | Filtro por familia y tipo | 2.3, 1.9 |
| R3 | Solo bajo mínimo | 2.3 |
| R3 | Deshabilitado incluido con su estado | 2.5, 2.3, 1.9 |
| R3 | Insumo en familia deshabilitada incluido | 2.5, 2.3, 1.9 |
| R3 | Ocultar sin stock | 2.3 |
| R3 | Baja lógica excluida, como la ficha | 2.5, 1.9 |
| R3 | Mismos filtros en pantalla y exportación | 4.6, 3.6, 5.3, 6.5 |
| R4 | Ninguna columna de dinero | 3.6, 4.6, 6.5 |
| R5 | Sin permiso, la consulta responde 403 | 4.6, 4.5 |
| R5 | Sin permiso, la exportación responde 403 | 4.6, 4.5 |
| R5 | Con permiso, ambas responden 200 | 4.6 |
| R5 | Las rutas no las captura `:id` | 4.6, 4.3 |
| R6 | Formato del archivo | 4.6, 3.6 |
| R6 | Más de 5000 filas | 3.6, 4.6, 4.5 |
| R6 | Exactamente 5000 filas | 3.6, 4.6 |
| R6 | Botón de la pantalla | 6.5, 6.2 |
| R7 | Acceso desde Insumos | 6.5, 6.4 |
| R7 | Filtros en la URL | 6.5, 5.3 |
| R7 | Sin permiso | 6.5, 6.3, 6.4 |
| R8 | Unidad entera | 3.6, 3.3, 5.2, 6.5 |
| R8 | Unidad fraccionaria | 3.6, 3.3, 5.2, 6.5 |
| R8 | Negativo en el CSV | 3.3, 3.6 |
| R8 | Negativo en pantalla | 6.5, 5.2 |
| R8 | Texto sigue neutralizado | 3.3, 3.6 |
| R9 | NINGUNO coincide con la ficha | 2.5 |
| R9 | SERIE coincide con la ficha | 2.5, 1.8 |
| R9 | Pendientes de serie suman al saldo | 2.5, 1.8, 2.3 |
| R9 | Libro de un SERIE no se usa | 2.5, 2.3, 2.6 |
| R10 | Usados no tapan el faltante | 2.3 |
| R10 | Saldo igual al mínimo | 2.3, 2.5 |
| R11 | Cantidad de consultas acotada | 2.4, 1.7, 1.8 |

Verificación del mapa: 35 escenarios (R1 2, R2 2, R3 7, R4 1, R5 4, R6 4, R7 3, R8 5, R9 4, R10 2,
R11 1), ninguno huérfano. La spec no tiene escenarios fuera de esas R.
