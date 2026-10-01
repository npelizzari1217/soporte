# Exploración: baja de equipo completo (`baja-equipo-completo`)

> Producida por `sdd-explore` el 2026-10-01 sobre la rama `feat/baja-equipo-completo` (árbol limpio, HEAD `4c03e8a5`), en solo lectura. El ejecutor no contaba con herramienta de escritura; el orquestador la persiste sin cambios de contenido. No se consultó producción ni se corrió ningún test. La comparación de mercado sale de conocimiento general, sin búsqueda web.

## 1. Pedido

Pedido del dueño (2026-09-30), en espíritu: dar de baja un equipo completo con dos opciones. (A) Dar de baja para **volver todo al stock**. (B) Dar de baja y **hacer desaparecer el stock** (por vejez, donación, rotura u otra opción). En ambos casos "todas las piezas deberán llevar la misma leyenda".

`docs/roadmap-comercial.md:137-141` lo registra en "Pendiente, sin construir": "la baja de un equipo entero con dos opciones (devolver todas sus piezas al stock, o descartarlas todas con un motivo común: vejez, donación, rotura u otra). Hoy el retiro opera componente por componente". No hay una decisión de producto cerrada en la sección "Decisiones de producto ya cerradas" para este punto. El pedido verbatim es la única fuente, así que **todo lo no dicho es pregunta abierta** (sección 12). Aplica la regla del `CLAUDE.md` del proyecto: la spec debe citar la decisión y convertir cada viñeta en requerimiento con escenario.

## 2. Estado actual

### 2.1 El equipo hoy

- **Entidad** `backend/src/equipos/domain/entities/equipo-informatico.entity.ts`.
  - Tiene `activo: boolean` (`:192`), con `deactivate()` (`:331`) y `activate()` (`:337`).
  - Tiene además `deletedAt` heredado de `BaseEntity`.
  - El comentario del ADR-9 (`:186-191`, `:211-222`) distingue ambos: `activo=false` es "dado de baja (fuera de servicio)", permanece en el historial y sigue siendo referenciable; `deletedAt` es la baja lógica completa.
- **`deactivate()` no tiene ningún caller de producción.** Ningún caso de uso ni endpoint lo invoca. El único "dar de baja" real es el soft delete.
- **`DELETE /equipos/:id`** (`equipos.controller.ts:356-364`, `EQUIPOS:BORRADO`) llama a `EliminarEquipoUseCase` (`eliminar-equipo.use-case.ts:29-37`). Solo hace `repo.delete()`, que setea `deletedAt` (`prisma-equipo-informatico.repository.ts:59-64`).
  - **No toca componentes ni stock.** Los componentes siguen activos.
  - Las `unidades_insumo` siguen INSTALADA con `equipoId` apuntando a un equipo ya invisible.
  - Es un defecto latente: la pieza ni vuelve al depósito ni consta como descartada.
  - **La UI lo rotula "Dar de baja"** (`frontend/src/features/equipos/components/equipo-detail-view.tsx:76`, `¿Confirmás dar de baja "…"?`, con `useEliminarEquipo` en `:27,39,80`). Es justo la acción que el dueño quiere reemplazar.
- **Visibilidad**:
  - `findAllActive` filtra `deletedAt: null, activo: true` (`prisma-equipo-informatico.repository.ts:41-47`). Un equipo `activo=false` **desaparece de la lista y del export**.
  - La columna "Baja" de la lista (`equipos-list-view.tsx:86-88`) y la de `exportar-equipos.use-case.ts:79` (`Activo`/`Baja`) quedan hoy inalcanzables.
  - `ObtenerEquipoUseCase` (`obtener-equipo.use-case.ts:58-62`) filtra solo `isDeleted()`. Un equipo `activo=false` **sí se ve en el detalle**, con todos sus componentes (activos y dados de baja). Un equipo con `deletedAt` da 404.
- **Guards sobre un equipo no vigente**:
  - `CrearTicketSoporte` exige `activo` y no borrado (`crear-ticket-soporte.use-case.ts:115`).
  - `AgregarComponente` solo mira `isDeleted()` (`agregar-componente.use-case.ts:85-87`). **Se pueden instalar piezas en un equipo `activo=false`.**
  - `EditarEquipo` solo mira `isDeleted()` (`editar-equipo.use-case.ts:83-84`).
  - Estos dos huecos hay que cerrarlos con la baja.
- **No hay campos de baja en el equipo.** Ni fecha, ni motivo, ni usuario (`schema.prisma:557-589`). Hay que agregarlos si el equipo debe "recordar" por qué se dio de baja (ver 3).

### 2.2 Qué referencia a un equipo (`schema.prisma`)

| Tabla | Columna | Efecto en baja | Ref |
|---|---|---|---|
| `componentes_equipo` | `equipo_id` (FK) | Se retiran todas sus piezas activas | `:951,991` |
| `unidades_insumo` | `equipo_id?` (solo INSTALADA), `onDelete: Restrict` | A: pasa a EN_DEPOSITO y `equipoId` se limpia. B: pasa a DESCARTADA | `:1385,1390` |
| `eventos_unidad_insumo` | `equipo_id?`, Restrict | Eventos `RETIRO_A_DEPOSITO` o `DESCARTE` con equipo y componente | `:1409,1419` |
| `movimientos_insumo` | `equipo_id?`, Restrict | A: ENTRADA USADO por cada pieza, con `equipoId` de origen | `:828,915` |
| `ticket_soporte` | `equipo_id?` | Se conserva (historial). Ver 6.1 | `:1020,1028` |
| `planes_preventivo` | `equipo_id?`, índice parcial | Se conserva. Ver 6.2 | `:1251,1271,1277` |
| `archivos_equipo` | `equipo_id`, Cascade | Adjuntos; no se tocan | `:1005,1009` |

- **Compras y reparaciones no referencian el equipo.** Un grep de `equipoId`/`equipo_id` en `backend/src` sin specs no devuelve ningún archivo de `compras` salvo un comentario de DTO, ni de `reparaciones`. Quedan fuera del alcance.
- **Tickets**: las pantallas de ticket no se inspeccionaron.
- **Permisos** (`equipos.controller.ts:8-17`): `EQUIPOS:LECTURA`, `ALTAS`, `MODIFICACION` y `BORRADO`.
  - `BORRADO` cubre hoy el DELETE del equipo **y** el retiro de componente (`:439-440`).
  - El retiro de componente no exige ningún permiso de insumos: "el asiento de stock lo registra el caso de uso" (`:431-432`).

### 2.3 Retiro de componente hoy (`RetirarComponenteUseCase`)

`backend/src/equipos/application/use-cases/retirar-componente.use-case.ts`.

**Fuera de la transacción** (`:89-102`):
- El componente existe y pertenece al equipo; si no, `ComponenteNoEncontradoError`.
- Está activo; si no, `ComponenteDadoDeBajaError`.
- Pasa `validarRetiro` (motivo).

**Dentro de `txRunner.run()`** (`:104-153`):
- `STOCK_USADO`:
  1. Se llama a `registrarEntrada.registrarDevolucionDeComponente` (ENTRADA USADO).
  2. Se llama a `componente.retirar(...)`.
  3. `componenteRepo.retirar` hace la marca condicional `WHERE deleted_at IS NULL`. Si toca 0 filas se lanza `FalloRetiroDeComponente` y se revierte la ENTRADA.
- `DESCARTE`:
  - Con unidad, `operaciones.descartarInstaladas` (unidad INSTALADA a DESCARTADA, sin movimiento, evento `DESCARTE`).
  - Sin unidad, no se toca stock.
- El componente (L4) se marca siempre después de los locks de insumos (ADR-12).

**Reglas del motivo** (`componente-equipo.entity.ts:315-334`):
- Obligatorio en `DESCARTE`.
- Obligatorio en `STOCK_USADO` sin SALIDA vinculada (`instalacionMovimientoId === null`), que es lo que `bajaSinSalidaPrevia` deriva (`:242-244`). Sin motivo, esa vuelta fabricaría una unidad sin explicación.
- Opcional en `STOCK_USADO` con SALIDA vinculada.
- Tope 500 caracteres (`:27`), igual al de la bitácora de insumos. Con `STOCK_USADO` el mismo motivo viaja a la ENTRADA.

**Persistencia de la baja** en el componente (`schema.prisma:979-984`):
- `baja_destino` (CHECK `STOCK_USADO|DESCARTE`).
- `baja_motivo` (TEXT).
- `baja_movimiento_id` (único).
- `baja_usuario_id`.
- `deleted_at`.
- El CHECK `componentes_equipo_baja_coherente_check` fija qué columnas van juntas.

**Guards de insumo en la devolución** (`registrar-entrada-insumo.use-case.ts:303-418`):
- Se admite el insumo **deshabilitado** y la familia **no vigente** ("la pieza existe físicamente aunque el catálogo se haya deshabilitado", `:288-293`).
- Se rechaza el insumo inexistente o con baja lógica (`InsumoNoEncontradoError`, `:346-347`).
- Se rechaza la familia que **no es de repuestos** (`CondicionUsadoNoAdmitidaError`, `:357-363`).
- `validarInsumoElegible` está en `:349`. Su detalle exacto no se leyó.

**Casos con serial**:
- Con `unidadId`, la pieza vuelve con su serial (`devolverAlDeposito`).
- **Componente legado** (sin unidad) de un insumo hoy `SERIE`: exige `numeroSerie` en el retiro. Sin él, `SerialRequeridoError` y no cambia nada (`:385-395`). No se admiten series pendientes (decisión del dueño).
- Insumo `NINGUNO`: ENTRADA USADO por cantidad 1.

**Reactivar** (`reactivar-componente.use-case.ts:53-96`), **asimétrico**:
- `STOCK_USADO` no se reactiva (`ComponenteDevueltoAlStockError`): "reactivarlo lo contaría dos veces".
- `DESCARTE` sí. Con unidad, `reinstalar` exige unidad `DESCARTADA` Y que su último evento sea el `DESCARTE` de ese componente (`operaciones-unidad-insumo.service.ts:458-498`). Si la pieza se recuperó, se reinstaló en otro lado o el insumo ya no es SERIE, falla.
- `reactivar()` limpia las cuatro columnas de baja. El motivo de un descarte revertido se pierde (`componente-equipo.entity.ts:377-384`).

### 2.4 Locks e invariante L (ADR-12)

- **L1**: fila del insumo, `FOR SHARE`, vía `leerSeguimientoParaMovimiento`.
- **L2**: advisory `insumo-stock:<id>` (`prisma-movimiento-insumo.repository.ts:98-102`).
- **L3**: filas de unidad, `FOR NO KEY UPDATE ORDER BY id` (`prisma-unidad-insumo.repository.ts:57-75`).
- **L4**: `componentes_equipo`.

El servicio `OperacionesUnidadInsumo` ya está **preparado para el lote** y lo dice textual:
- `devolverAlDeposito` "sirve a la baja de un equipo completo: N unidades y un motivo compartido en una sola transacción" (`operaciones-unidad-insumo.service.ts:366-375`).
- `leerLoteEnEquipo` (`:642-677`) lee las unidades sin lock para conocer sus insumos, toma **L1 de todos y después L2 de todos, con `insumoIds` ordenados**, y después L3 con ids de unidad ordenados.
- `bloquearInsumos` (`:751-764`) hace un nivel completo antes del siguiente.
- `descartarInstaladas` (`:417-443`) y `reinstalar` también son por lote.
- `exigirInstaladaEn` (`:679-693`) verifica que la unidad esté instalada en el equipo del item ("la baja de un equipo no toca piezas de otro").

**Consecuencia para el diseño**: llamar `RetirarComponenteUseCase.execute` en bucle, una vez por componente en una sola transacción, **viola el espíritu de L**.
- Cada llamada toma L1, L2 y L3 de su insumo en el orden en que llegan los componentes, y no ordenado por `insumoId`.
- Una instalación concurrente que tome los mismos insumos en otro orden puede **abrazarse con el lote**.
- El camino seguro es un caso de uso nuevo que **junte los items por tipo y llame una sola vez** a `devolverAlDeposito` (o `descartarInstaladas`) con todo el lote, y después marque los componentes (L4) en orden de id.
- Los componentes sin unidad de un insumo `NINGUNO`:
  - ENTRADA no toma el advisory (el propio use case dice "NO toma el advisory lock del…", `registrar-entrada-insumo.use-case.ts:89`).
  - Por eso la ENTRADA de un `NINGUNO` no entra en el ciclo de locks y es segura en cualquier orden.
  - Solo los SERIE entran en L1 a L3.
- Falta un método batch en `RegistrarEntradaInsumoUseCase`. Hoy `registrarDevolucionDeComponente` es de un componente y valida elegibilidad y condición USADO por insumo (`:333-418`). La validación por insumo hay que repetirla, o extraerla, para el lote.
- Referencia de atomicidad: el patrón `FalloRetiroDeComponente` (`retirar-componente.use-case.ts:26-31`) convierte un `Result.fail` en excepción para que `$transaction` revierta. El lote debe usarlo igual.
- Existen specs de concurrencia que sirven de plantilla: `retirar-reactivar-unidad.concurrencia.integration.spec.ts` e `instalar-componente-desde-deposito.concurrencia.integration.spec.ts`.

### 2.5 Componentes sin insumo, o con insumo no vigente

- **Sin insumo: ya no existen.** `componentes_equipo.insumo_id` es `NOT NULL` y la migración `componentes_insumo_obligatorio` abortaba si quedaban filas sin vínculo (aplicada en todos los tenants el 2026-09-29, `schema.prisma:952-957`). La entidad exige `insumoId` (`componente-equipo.entity.ts:165`).
- **Insumo deshabilitado o familia no vigente**: la devolución **lo admite** (G2). Los dos casos son retirables a `STOCK_USADO`.
- **Insumo con baja lógica (`deletedAt`)**: la ENTRADA falla con `InsumoNoEncontradoError`. Hoy ese componente **no se puede devolver al stock**; sí se puede descartar.
- **Familia que no es de repuestos**: no debería existir un componente así, porque `AgregarComponente` lo impide. Si existiera, la ENTRADA USADO falla.
- **Insumo que cambió de seguimiento** (`NINGUNO` a `SERIE`): el componente queda legado y exige serial. Es el caso conocido de 2.3.
- **Insumo que pasó de `SERIE` a `NINGUNO`**: la devolución con `unidadId` usa `devolverAlDeposito`. `leerLoteEnEquipo` valida SERIE y fallaría con `UnidadNoAdmitidaError`. Es un caso borde que habrá que cubrir con un test (no se verificó cómo lo maneja el cambio de seguimiento).

## 3. Cómo mapea "la misma leyenda en todas las piezas"

Datos disponibles hoy por pieza, todos alimentados desde el mismo `motivo`:
- `componentes_equipo.baja_motivo` (TEXT, 500 de tope).
- `movimientos_insumo.motivo` (ENTRADA USADO, con `equipoId`), solo en la opción A.
- `eventos_unidad_insumo.motivo` (`RETIRO_A_DEPOSITO` o `DESCARTE`), solo con unidad.

Con el retiro actual un único `motivo` string va a los tres lados. Para la baja completa se mantiene el mecanismo: **un único string compuesto** que se pasa como `motivo` a todos los componentes. Ejemplo: `Baja del equipo «PC-Caja-3» — Donación: a la escuela N° 12`. Hay que verificar el tope de 500.

Si se quiere categoría estructurada (reporte "bajas por donación"), el string no alcanza para filtrar. Las alternativas son:
- Columna `baja_categoria` en `componentes_equipo` (CHECK con enum), con migración y ampliación de `baja_coherente`.
- Guardar la categoría solo en el equipo (las piezas llevan texto, el equipo la estructura).
- Los eventos de unidad no tienen categoría.

**El equipo debería registrar su propia baja** (fecha, usuario, categoría, texto, destino). Hoy no existe nada de eso y es la fuente más limpia para "por qué desapareció este equipo". Es una migración nueva en todos los tenants.

## 4. Las dos opciones, precisas

| | A: volver todo al stock | B: desaparecer el stock |
|---|---|---|
| Componente | `bajaDestino=STOCK_USADO`, soft delete | `bajaDestino=DESCARTE`, soft delete |
| Stock `NINGUNO` | ENTRADA USADO cantidad 1 por pieza, con `equipoId` de origen | Nada |
| Unidad SERIE | INSTALADA a EN_DEPOSITO, `condicion=USADO`, evento `RETIRO_A_DEPOSITO`, ENTRADA | INSTALADA a DESCARTADA, evento `DESCARTE`, sin movimiento |
| Legado SERIE | Exige serial (UI o error) | No exige serial |
| Motivo | Siempre el común (la leyenda). Resuelve `bajaSinSalidaPrevia` | Obligatorio (ya lo exige `DESCARTE`) |
| Reversible | **No**: `ComponenteDevueltoAlStockError` | Parcial: `reactivar` por pieza, si la unidad no fue recuperada |

Notas:
- En A, la leyenda es obligatoria **de hecho**: algunos componentes serán `bajaSinSalidaPrevia` y exigen motivo. Lo más simple es exigir motivo siempre en la baja completa, en ambas opciones.
- En B, el "stock desaparece" no es un asiento negativo: las piezas `NINGUNO` no se "restan", simplemente no entran. Las unidades DESCARTADA son recuperables (`recuperar-unidad-descartada.use-case.ts`), lo que da una vía de arrepentimiento por pieza.
- **Decisión de producto en B**: la "desaparición" no genera ninguna salida en la bitácora de movimientos. Un reporte de movimientos no va a mostrar la baja. Solo se ve en `componentes_equipo` y en los eventos de unidad. Ver P8.

## 5. Qué le pasa al equipo después

Dos mecanismos disponibles, no equivalentes:

| | `activo=false` (ADR-9, `deactivate()`) | `deletedAt` (soft delete actual) |
|---|---|---|
| Detalle | Visible, con componentes y su historial de baja | 404 |
| Lista y export | Oculto (`findAllActive`) | Oculto |
| Tickets existentes | Siguen apuntando | Siguen apuntando |
| Preventivo | Plan degrada a `EQUIPO_DADO_DE_BAJA` | Plan degrada a `EQUIPO_ELIMINADO` |
| Nuevos tickets | Bloqueado (`crear-ticket-soporte.use-case.ts:115`) | Bloqueado |
| Agregar componente / editar | **No bloqueado hoy** | Bloqueado |

**Recomendación**: `activo=false` más las columnas de baja. Es lo que el ADR-9 y el rótulo "Baja" ya prevén, conserva la trazabilidad en la ficha y no rompe los tickets de soporte. El soft delete queda para "creado por error".

Sobre el DELETE actual:
- **Pasa a ser un riesgo** si convive con la baja: borra el equipo dejando piezas INSTALADA.
- Una opción es bloquear `EliminarEquipo` mientras queden componentes activos. Otra es redirigirlo a la baja completa.
- Esto es una pregunta de producto (P9) y a la vez un defecto latente a corregir.

## 6. Entidades relacionadas

### 6.1 Tickets abiertos

`ticket_soporte.equipo_id` es nullable y conserva la FK. El estado "abierto" vive en `tickets`, que no se inspeccionó.
- No existe hoy ninguna consulta "tickets abiertos de un equipo" en `i-ticket-soporte.repository.ts` (el grep de estado devuelve vacío).
- Bloquear la baja con tickets abiertos requiere una consulta nueva. El costo es bajo, pero cruza el módulo de tickets.
- Permitirla es posible: el ticket queda referenciando un equipo `activo=false`, visible en historial.

### 6.2 Planes preventivos

`generar-preventivos.use-case.ts:258-282` ya distingue cinco estados de equipo (`EQUIPO_VIGENTE`, `EQUIPO_DADO_DE_BAJA`, `EQUIPO_ELIMINADO`, `EQUIPO_INEXISTENTE`, `EQUIPO_NO_CONSULTABLE`). El plan de un equipo dado de baja **ya degrada de forma controlada**, así que no hace falta desactivar planes por código. La spec debería fijar si se desactivan o solo se degradan.

### 6.3 Compras y reparaciones

Sin referencia al equipo (2.2). Fuera de alcance.

## 7. Comparación de mercado (breve, sin búsqueda web)

Las herramientas de gestión de activos de IT (ITAM) tratan el retiro de un activo como un cambio de estado (`Retired`, `Disposed`, `Donated`, `Lost`, `Scrapped`) con un código de motivo, fecha y responsable.
- La disposición suele ser un flujo propio, a veces con aprobación.
- El **componente** se maneja con "harvest parts" (cosechar piezas): se devuelven al inventario como usadas o reacondicionadas.
- El historial del activo se conserva y el registro no se borra: es auditoría y base de depreciación.

El pedido encaja en ese patrón estándar:
- Opción A: harvest.
- Opción B: dispose con código.
- Categoría (vejez, donación, rotura, otra) mapea a los códigos de motivo habituales.

La práctica común, a verificar con el dueño:
- Reversión de una disposición: poco común, o con permiso especial.
- "Otra" exige texto libre.

## 8. Archivos afectados

Backend:
- `backend/src/equipos/domain/entities/equipo-informatico.entity.ts`. Método de baja con motivo, categoría, fecha y usuario. Hoy solo `deactivate()`.
- `backend/src/equipos/application/use-cases/` (nuevo). Caso de uso `DarDeBajaEquipoUseCase`.
- `backend/src/equipos/application/use-cases/retirar-componente.use-case.ts`. Reuso de la lógica, o extracción de la parte común.
- `backend/src/insumos/application/use-cases/registrar-entrada-insumo.use-case.ts:303`. Método batch para devolver N piezas.
- `backend/src/insumos/application/services/operaciones-unidad-insumo.service.ts`. `devolverAlDeposito` y `descartarInstaladas` ya son por lote. Casi no cambia.
- `backend/src/equipos/application/use-cases/agregar-componente.use-case.ts:85-87` y `editar-equipo.use-case.ts:83-84`. Guard de equipo no vigente.
- `backend/src/equipos/application/use-cases/eliminar-equipo.use-case.ts`. Guard o redirección (P9).
- `backend/src/equipos/interface/controllers/equipos.controller.ts` y `dtos/equipos.dto.ts`. Endpoint nuevo y DTO.
- `backend/prisma_tenant/schema.prisma` y una migración tenant (columnas de baja del equipo, y quizá categoría en componente). Requiere aplicarse en todos los tenants (ver P12).
- `equipos.module.ts` (wiring).
- `findAllActive` / listado: decidir si hay vista "dados de baja" (P6).
- `docs/roadmap-comercial.md`: la viñeta debe quedar **Cumplida** o **Desviación** al cerrar (lo verifica `scripts/check-roadmap-fresco.mjs`).

Frontend:
- `frontend/src/features/equipos/components/equipo-detail-view.tsx:76`. Reemplazar el diálogo de "Dar de baja" por el nuevo flujo.
- `frontend/src/features/equipos/components/componente-retiro-dialog.tsx`. Referencia de UX (radios `STOCK_USADO` / `DESCARTE`, motivo obligatorio solo en descarte, serial para legado).
- `frontend/src/features/equipos/hooks/use-equipo-mutations.ts`, `schemas.ts` y `types.ts`.

Ayuda: el cambio altera lo que el usuario ve y hace. **La Ayuda está suspendida desde el 2026-09-07**, así que corresponde anotar la deuda en el commit y el PR. La excepción es corregir un artículo que el cambio vuelva falso: el que describe "dar de baja" un equipo, si existe (no se buscó en `backend/ayuda/`).

## 9. Enfoques

### 9.1 Atomicidad y lock

| Enfoque | Pros | Contras | Esfuerzo |
|---|---|---|---|
| **E1. Un caso de uso nuevo, una transacción, locks por lote** (recomendado) | Todo-o-nada. Respeta ADR-12 sin riesgo de deadlock con instalaciones concurrentes. Reusa `devolverAlDeposito` y `descartarInstaladas` ya por lote | Requiere batch en `RegistrarEntradaInsumo` y extraer la validación de motivo | Medio |
| E2. Bucle sobre `RetirarComponenteUseCase` dentro de una transacción | Reuso casi total, cambio chico | Orden de locks dependiente del orden de componentes: **riesgo de deadlock**. Viola el invariante L. Un fallo a mitad revierte todo, pero el diseño es frágil | Bajo |
| E3. Baja en N transacciones, una por componente, más marca final del equipo | Sin transacción grande | **No es atómico**: un fallo deja el equipo a medias. Contradice "todo o nada". No recomendable | Bajo |

### 9.2 Alcance de la elección

| Enfoque | Pros | Contras |
|---|---|---|
| **Todo-o-nada** (recomendado, es lo que se pidió) | Simple, una leyenda, una opción por equipo | No contempla "devolver la RAM, descartar el disco roto" |
| Elección por componente | Cubre un caso real de operación | UI compleja. Rompe "misma leyenda en todas las piezas". Es lo que ya existe, pieza por pieza |

Mitigación: el dueño ya puede retirar piezas sueltas antes de dar de baja el equipo. Una baja con mezcla de destinos se deja para después.

### 9.3 Estado del equipo

| Enfoque | Pros | Contras |
|---|---|---|
| **`activo=false` + columnas de baja** (recomendado) | Detalle y historial visibles. Coincide con ADR-9. Preventivo ya lo degrada | Migración. Requiere cerrar los huecos de editar y agregar |
| `deletedAt` | Sin migración de equipo | Detalle 404. Se pierde la ficha. El motivo de baja no tendría dónde vivir |

### 9.4 Comportamiento ante fallo de una pieza

| Enfoque | Pros | Contras |
|---|---|---|
| **Fallar todo con un error que lista las piezas problemáticas** (recomendado) | El usuario ve exactamente qué corregir | Más trabajo de DTO de error |
| Saltear la pieza e informar | La baja avanza | Deja el equipo "dado de baja" con piezas vivas: incoherente |

## 10. Recomendación

1. Caso de uso nuevo `DarDeBajaEquipoUseCase`, **atómico y todo-o-nada**, en una sola transacción.
2. Marcar el equipo con `activo=false` y columnas de baja: `baja_destino`, `baja_categoria`, `baja_motivo`, `baja_fecha`, `baja_usuario_id`.
3. Armar un único motivo compuesto, que lleva la categoría y el texto, y pasarlo a todas las piezas.
4. Agrupar por tipo y por insumo, con ids **ordenados**, y llamar **una vez** a `devolverAlDeposito` (A) o `descartarInstaladas` (B). Los componentes `NINGUNO` van por la ENTRADA sin advisory (A) o no tocan stock (B). Marcar los componentes (L4) por id ordenado al final.
5. Si hay legados SERIE en A sin serial, o piezas con insumo con baja lógica (que no se pueden devolver), **cortar con un error que liste las piezas**. No hacer baja parcial.
6. Cerrar los huecos: no agregar componentes ni editar un equipo con `activo=false`.
7. Tratar el DELETE actual como defecto: bloquearlo con componentes activos, o redirigirlo.
8. Un test de concurrencia de la baja contra una instalación de los mismos insumos, a imagen de los dos specs existentes.

## 11. Riesgos

- **Orden de locks**: un bucle ingenuo viola ADR-12 y puede dar deadlock con instalaciones concurrentes (2.4).
- **Defecto latente**: el DELETE actual deja unidades INSTALADA huérfanas hoy mismo (2.1). Conviene medir cuántas hay antes de actuar (consulta de unidades INSTALADA con equipo borrado).
- **Serial en legados SERIE** (2.3): sin interfaz para pedirlo, la opción A falla en esos equipos.
- **Insumos con baja lógica**: la pieza no se puede devolver al stock, solo descartar (2.5). La baja A queda bloqueada.
- **Migración tenant**: nuevas columnas en todos los tenants. El orden de despliegue importa (P12).
- **Equipos `activo=false` que ya existan** (si alguien los marcó por SQL): no hay camino de producto que los cree hoy. Habría que verificarlo en producción.
- **Tope de 500** caracteres del motivo compuesto: hay que reservar espacio para el prefijo (equipo y categoría) o validar el texto libre más corto.
- **La baja B no deja asiento en la bitácora** de movimientos (P8).
- **Ticket abierto**: el estado "abierto" no se verificó en el módulo de tickets (6.1).
- Esta exploración **no corrió ningún test**: las afirmaciones sobre locks salen de leer código y comentarios.

## 12. Preguntas de producto abiertas para el dueño

Cada una con opciones y una recomendación.

**P1. Categorías del motivo.** El pedido dice "vejez, donación, rotura, otra opción".
- (a) Enum cerrado de 4: `VEJEZ`, `DONACION`, `ROTURA`, `OTRA`.
- (b) Enum de 4 más texto libre siempre opcional.
- (c) Solo texto libre.
- **Recomendación: (b)**, con `OTRA` exigiendo texto. Es lo que permite reportar sin perder el detalle.

**P2. ¿Las categorías aplican a las dos opciones o solo a la B?** "Por vejez, donación…" parece describir B. En A (volver al stock) puede haber razón (reemplazo, reciclaje de piezas).
- (a) Categoría en ambas.
- (b) Categoría solo en B; en A, texto libre opcional.
- (c) Categorías distintas por opción (A: "reciclado", "reemplazo"; B: las del pedido).
- **Recomendación: (a)**. Una leyenda uniforme y un solo formulario. Pendiente que el dueño confirme que A también lleva motivo.

**P3. ¿"Otra" exige texto?**
- (a) Sí, obligatorio.
- (b) No.
- **Recomendación: (a)**. Sin texto, `OTRA` no informa nada.

**P4. ¿La baja se puede deshacer?**
- (a) No, definitiva. La A ya no es reversible hoy por pieza, y la baja se declara irreversible.
- (b) Reversible solo la B, vía reactivar de cada pieza más el equipo (hoy el reactivar de pieza es por pieza y depende de que la unidad no se haya recuperado).
- (c) Un "reactivar equipo" explícito, con reglas por opción (más trabajo).
- **Recomendación: (a) para v1**, con confirmación fuerte. Es lo más simple y coincide con la asimetría actual. Se puede sumar (c) después si hay pedidos reales. El dueño debe saber que corregir un error de baja A obliga a reinstalar las piezas a mano.

**P5. Tickets abiertos del equipo.**
- (a) Bloquear la baja si hay tickets abiertos, y avisar cuáles.
- (b) Permitir, con aviso de cuántos hay.
- (c) Permitir sin aviso.
- **Recomendación: (b)**. Bloquear obliga a cerrar tickets por un trámite administrativo. El aviso evita sorpresas. Si el dueño prefiere (a), requiere una consulta nueva de tickets por equipo.

**P6. Visibilidad del equipo dado de baja.**
- (a) Oculto de lista y export (como hoy con `activo=false`), visible en la ficha por enlace o historial de tickets.
- (b) Visible en la lista con el badge "Baja", con un filtro por defecto que lo oculta.
- (c) Una vista aparte "Equipos dados de baja".
- **Recomendación: (b)**. El badge y la columna ya existen y hoy son inalcanzables. Pedir al dueño qué quiere ver en el reporte.

**P7. Permisos.**
- (a) Reusar `EQUIPOS:BORRADO` (lo que exige hoy el retiro de pieza y el DELETE).
- (b) Acción nueva específica, por ejemplo `EQUIPOS:BAJA`, porque es más grave y toca stock.
- **Recomendación: (a) para v1**. Crear una acción implica tocar la matriz de permisos por usuario. Se puede separar después. Confirmar con el dueño si algún usuario con BORRADO no debería poder hacerlo.

**P8. ¿La opción B debe dejar asiento en el stock?** Hoy el descarte de una pieza no genera movimiento, así que un reporte de movimientos no la ve.
- (a) No, como hoy. La baja se ve en la ficha y los eventos de unidad.
- (b) Sí, un asiento negativo informativo.
- **Recomendación: (a)**. (b) rompe el invariante de que el saldo de un `NINGUNO` sale de la bitácora y obligaría a replantear el reporte de stock ya entregado.

**P9. El DELETE actual del equipo.**
- (a) Se mantiene tal cual, para "creado por error".
- (b) Se bloquea si hay componentes activos.
- (c) Se elimina y toda baja pasa por el nuevo flujo.
- **Recomendación: (b)**. Corrige el defecto de las unidades huérfanas y deja una vía para el equipo cargado por error. El texto del botón actual ("Dar de baja") se renombra.

**P10. ¿Piezas sin posibilidad de volver al stock (insumo con baja lógica, o legado SERIE sin serial) bloquean la baja A?**
- (a) Bloquean y se informa qué corregir.
- (b) La pieza se descarta automáticamente y el resto vuelve.
- (c) Se pide el serial en el formulario para los legados, y las de insumo borrado bloquean.
- **Recomendación: (c)**. (b) rompe "todas las piezas con la misma leyenda" y mezcla destinos sin que el usuario lo elija.

**P11. Confirmación en la UI.**
- (a) Diálogo con resumen (cuántas piezas, adónde van) y un botón de confirmar.
- (b) (a) más escribir el nombre del equipo para confirmar.
- **Recomendación: (a) para A, (b) para B**, porque B hace desaparecer el stock y no se revierte. Un resumen previo de las piezas ayuda a ver el efecto antes de confirmar.

**P12. Orden de despliegue y datos existentes.** La migración agrega columnas a todos los tenants.
- (a) Se despliega con la rutina habitual (`predeploy-dump` y deploy).
- (b) Antes, se mide y se corrigen las unidades INSTALADA de equipos ya borrados por el DELETE actual.
- **Recomendación: (b) como precondición**, para no mezclar el estado actual con el nuevo flujo.

## 13. Listo para propuesta

Sí, con las preguntas P1 a P5 respondidas por el dueño. P6 a P11 tienen recomendación razonable y pueden avanzar como supuestos declarados en la propuesta. P12 es un chequeo previo a medir.

Se recomienda que la spec cite `docs/roadmap-comercial.md` (viñeta del punto) y convierta cada decisión en requerimiento con escenario.
