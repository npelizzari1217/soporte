# Exploración: stock-usado-componentes

> Producida por `sdd-explore` el 2026-09-30 (segundo intento; el primero se perdió por un
> error del proveedor del modelo), sobre `main` en `e90035f`. El ejecutor no contaba con
> herramienta de escritura; el orquestador la persiste sin cambios de contenido. Solo lectura,
> sin cambios de código.

## Decisiones de producto confirmadas (dueño, 2026-09-29)

- (A) Reemplazar un componente es darlo de baja y dar de alta el nuevo.
- (B) La baja tiene dos resultados que elige el usuario: devolver la pieza al stock como USADO, o descartarla por rotura (queda registrado y nada vuelve al stock).
- (C) El stock tiene condición NUEVO/USADO sobre el mismo ítem del catálogo. Cada movimiento lleva su condición, el saldo se lleva por insumo y condición, y al instalar con descuento el usuario elige de qué saldo descontar.

## 0. Hallazgos que condicionan el diseño

- **La bitácora es la única fuente del saldo.** `calcularStock` (`insumos/domain/entities/tipo-movimiento-insumo.ts:120-130`) es la única fórmula. Recorre `TIPOS_MOVIMIENTO_INSUMO` y usa `DIRECCION_POR_TIPO_MOVIMIENTO` (`:90`, `Record<Tipo, 1|-1>`). Ese `Record` solo admite ±1, así que un tipo con dirección 0 no encaja: un tipo "DESCARTE" rompería el modelo.
- **No hay lectores del saldo fuera de `insumos/`.** Solo `equipos` (SALIDA vía `InstalarComponenteDesdeDepositoUseCase`) y `compras` (ENTRADA vía `RegistrarRecepcionDeItemUseCase`) escriben, y lo hacen mediante los casos de uso de insumos. Todo el saldo pasa por `sumarPorTipo`.
- **El listado `/insumos` no muestra stock.** `catalogo-insumos-list-view.tsx:110-115` solo tiene la columna `stockMinimo`. No hay alertas agregadas ni exportación de stock. Solo existe la ficha del insumo, que consulta `GET /insumos/:id/stock`.
- **El lock ya es por insumo** (`pg_advisory_xact_lock(hashtext(PREFIJO + insumoId))`, `prisma-movimiento-insumo.repository.ts:124`). Cubre ambas condiciones sin cambios: no se parte el lock por condición.
- **El movimiento ya trae trazabilidad hacia el equipo.** `equipoId` es FK a `equipos` (`schema.prisma:812`, `:899`), e `itemCompraId` indica de dónde vino una entrada (`:833`). No existe `componenteId` en el movimiento.
- **La baja del componente hoy no tiene confirmación ni datos.** `equipo-componentes-section.tsx:138-148` dispara `DELETE` directo con el icono de papelera. `EliminarComponenteUseCase` (`eliminar-componente.use-case.ts:29-38`) solo hace `repo.delete` (soft delete, `deletedAt`; el repo lo implementa en `prisma-componente-equipo.repository.ts:59`).
- **No hay spec de stock.** `openspec/specs/` tiene 14 specs (preventivo-*, feriados-*, horario-laboral-cliente, modelos-equipo-catalogo, repuestos-autoridad-catalogo, componentes-catalogo-unico, etc.). Ninguna cubre movimientos, condición ni saldo. El comportamiento actual del stock solo está en JSDoc y en tests. Las decisiones históricas están en engram, en ciclos previos al 2026-08-30 (por ejemplo `insumos-entrega-2`, citado en `tipo-movimiento-insumo.ts:29`).
- **La Ayuda está suspendida.** Toda pantalla que cambie debe anotar la deuda en el commit y el PR. Un artículo existente que el cambio vuelva falso sí debe corregirse.

## 1. Stock: qué hay que volver sensible a la condición

Propuesta base: `movimientos_insumo.condicion VARCHAR(10) NOT NULL DEFAULT 'NUEVO' CHECK (condicion IN ('NUEVO','USADO'))`. La constante `CONDICIONES_STOCK` vive en el dominio junto a `TIPOS_MOVIMIENTO_INSUMO`, con el mismo patrón de comparación contra el CHECK real que usa el spec de constraints.

| Archivo:línea | Qué cambia |
|---|---|
| `prisma_tenant/schema.prisma:779` (`MovimientoInsumo`) | Nueva columna `condicion` con default `NUEVO`. Índice opcional `(insumoId, condicion)`. |
| `prisma_tenant/migrations/<nueva>` | `ADD COLUMN ... DEFAULT 'NUEVO'` + CHECK con nombre explícito. Ver §5. |
| `insumos/domain/entities/tipo-movimiento-insumo.ts:31` | Se agrega `CONDICIONES_STOCK` y el tipo `CondicionStock`. `TIPOS_MOVIMIENTO_INSUMO` **no cambia** en la opción recomendada. |
| `tipo-movimiento-insumo.ts:120` (`calcularStock`) | La firma pasa a recibir sumas por condición. Devuelve `{NUEVO, USADO}` y un total derivado. Sigue siendo la única fórmula. Rompe los llamadores de `:187`, `:140` y `:98` (ver filas siguientes). |
| `insumos/domain/entities/movimiento-insumo.entity.ts:10-39` (props), `create()` | Campo `condicion: CondicionStock`, obligatorio en el dominio. `reconstitute` lo lee de la fila. |
| `insumos/infrastructure/persistence/prisma/movimiento-insumo.mapper.ts` | `toPersistence` y `toDomain` mapean `condicion` (el mapper tiene además un cast del CHECK de `tipo`, línea ~46; se replica para la condición). |
| `insumos/domain/ports/i-movimiento-insumo.repository.ts:128` (`lockAndSumByTipo`) y `:159` (`sumByTipo`) | Contrato del desglose por (condición × tipo). El tipo `SumasPorTipoMovimiento` se replantea. El lock sigue por insumo. |
| `prisma-movimiento-insumo.repository.ts:110`, `:148`, `:220-241` (`sumarPorTipo`) | `groupBy` por `['condicion','tipo']`; completar los 2×4 ceros desde los catálogos. |
| `prisma-movimiento-insumo.repository.ts:180-201` (`listarPorInsumo`) | Devuelve `condicion` en cada fila. Opcional: filtro por condición. |
| `registrar-salida-insumo.use-case.ts:19-31` (DTO), `:139-140` | DTO con `condicion`. El chequeo de disponible usa el saldo de **esa** condición, no el total. |
| `registrar-ajuste-insumo.use-case.ts:36-50` (DTO), `:186-187` | Ajuste por condición. Un AJUSTE_NEGATIVO no puede dejar negativa esa condición. |
| `registrar-entrada-insumo.use-case.ts:158-167` (`create`) | Propaga `condicion`. Sin `lockAndSumByTipo`, por diseño existente. |
| `compras/.../registrar-recepcion-de-item.use-case.ts:169` | La recepción pasa `condicion: 'NUEVO'` explícito, no por default implícito. |
| `consultar-stock-insumo.use-case.ts:28-33`, `:97-104` | La respuesta agrega saldo por condición. `estadoReposicion` según pregunta (b). |
| `insumos/domain/entities/estado-reposicion-insumo.ts` (`evaluarReposicion`) | Sin cambio de lógica. Cambia qué número recibe (NUEVO o total). |
| `insumos/interface/dtos/movimientos-insumo.dto.ts:89-` (`RegistrarMovimientoInsumoHttpDto`), `:204-255` (`StockInsumoResponseDto`), `toMovimientoInsumoResponseDto` | `condicion` opcional en el request, con `@IsIn`. Response de stock con `stockPorCondicion`. Response del movimiento con `condicion`. |
| `insumos/interface/controllers/movimientos-insumo.controller.ts:142`, `:184`, `:227`, `:271`, `:307` | Pasan `condicion` a entrada, salida y ajuste. Los `GET` de stock y movimientos ya devuelven lo nuevo por DTO. |
| Frontend `features/insumos/schemas.ts`, `types.ts`, `hooks/use-stock-insumo.ts` | Espejo de los DTO (los schemas Zod reflejan al backend). |
| Frontend `insumo-detail-view.tsx:98`, `:115`, `:316-330`, `:365-378` | Muestra el saldo NUEVO y USADO. Columna condición en la tabla de movimientos. |
| Frontend `movimiento-entrada-dialog.tsx`, `movimiento-salida-dialog.tsx`, `movimiento-ajuste-dialog.tsx` | Selector de condición. `stockDisponible` es el de la condición elegida. |

No requieren cambio (verificado): el listado `/insumos`, el ABM de insumos, la exportación de equipos y `estado-reposicion-insumo.ts` como lógica. No existen alertas ni exportaciones de stock.

## 2. Equipos

**Backend**

| Archivo:línea | Cambio |
|---|---|
| `equipos.controller.ts:341-367` (POST componentes) | `CreateComponenteHttpDto` (`equipos.dto.ts:~266`) suma `condicion?: 'NUEVO'\|'USADO'` (solo tiene sentido con `descontarStock=true`). Con `false` y `condicion` presente se decide en pregunta (a) si es 400. |
| `instalar-componente-desde-deposito.use-case.ts:45-54`, `:125-130` | El DTO suma `condicion`. La SALIDA lo lleva. Sigue atómico: componente primero, SALIDA después, y `FalloSalidaDeStock` revierte. Ahora "stock insuficiente" es por condición. |
| `equipos.controller.ts:375-382` (DELETE componente) | Hoy sin body. Necesita un contrato nuevo (ver abajo). |
| `eliminar-componente.use-case.ts:24-38` | Hoy con Pick `findById`/`delete`. Pasa a orquestar dentro de una transacción: si `destino=STOCK_USADO`, ENTRADA `condicion=USADO` (cantidad 1, `equipoId`, `usuarioId`, motivo) más el soft delete. Si `destino=DESCARTE`, solo el soft delete más el registro del descarte. Requiere `txRunner` e inyectar `RegistrarEntradaInsumoUseCase` (insumos), con el mismo patrón que instalar. Si falla la entrada, revierte la baja. |
| `reactivar-componente.use-case.ts:36-49` | Ver pregunta (f). |
| `prisma-componente-equipo.repository.ts:59` (`delete`) | Además de `deletedAt`, persiste las columnas de baja. |
| `schema.prisma:919-945` (`ComponenteEquipo`) | Columnas nuevas (recomendación para h): `bajaDestino` (`STOCK_USADO`\|`DESCARTE`, nullable), `bajaMotivo` (nullable), `bajaMovimientoId` (FK nullable a `movimientos_insumo`), quizá `bajaUsuarioId`. |
| `componente-equipo.mapper.ts`, `ComponenteResponseDto` | Exponen los campos de baja. |

Contrato de baja: `DELETE` con body es poco portable en proxies e IIS. Alternativas: (i) `DELETE /equipos/:id/componentes/:cid` con body, (ii) `POST /equipos/:id/componentes/:cid/baja` con `{destino, motivo?}`. Recomendación: (ii). Los verbos con efecto sobre el stock ya son `POST` en insumos (`movimientos/entrada`), y el `DELETE` sin body se puede retirar o dejar como alias del descarte, decisión de diseño. Permiso: `EQUIPOS:BORRADO`. Devolver al stock **suma** existencias, algo que hoy exige `INSUMOS:ALTAS`; misma consecuencia asumida que en instalar (`EQUIPOS:ALTAS` descuenta stock sin permiso de INSUMOS).

**Frontend**

- `equipo-componentes-section.tsx:138-148`: la papelera pasa de acción directa a un diálogo de baja con dos resultados: "Devolver al stock como usado" y "Descartar por rotura" (con motivo).
- `use-equipo-mutations.ts:94` (`useEliminarComponente`): payload nuevo. Invalida además `["stock", insumoId]` y `["movimientos", insumoId]`, como ya hace el alta.
- `componente-create-dialog.tsx`: al marcar "Descontar del depósito", muestra un selector NUEVO/USADO junto con el saldo de cada uno. Hoy la casilla está marcada por defecto y el payload lleva `descontarStock` explícito.
- `equipo-componentes-section.tsx:154-166`: el botón Reactivar cambia según (f). Se puede mostrar la etiqueta "Devuelto al stock" / "Descartado" en la fila dada de baja (ya se muestra "Dado de baja: fecha").

## 3. Specs necesarias

Como no existe spec de stock, hay tres opciones de organización.

| Opción | Contenido |
|---|---|
| A (recomendada) | Una spec nueva `stock-insumo-condicion` (dominio insumos): condición en el movimiento, saldo por insumo y condición, salida/ajuste/entrada por condición, `stockMinimo`, migración con default NUEVO. Y un delta a `componentes-catalogo-unico` (instalación con condición elegida; baja con dos resultados; reactivar). |
| B | Todo en `componentes-catalogo-unico`: mezcla dominios y deja el stock sin spec propia. |
| C | Además, una spec retroactiva de la bitácora actual (invariante de saldo no negativo, lock, append-only). Aporta, pero infla el ciclo. |

Nota: si el ciclo implementa un punto de `docs/roadmap-comercial.md`, la spec cita la decisión por ruta y cada viñeta es un requerimiento. Verificar en el propose si este trabajo corresponde a algún punto ("Decisiones de producto ya cerradas"); no se comprobó en esta exploración.

## 4. Preguntas abiertas para el dueño

**(a) Saldo por defecto al instalar con descuento**

| Opción | Consecuencia |
|---|---|
| 1. NUEVO preseleccionado, el usuario cambia | Comportamiento actual intacto; un clic más para usar usado. |
| 2. USADO preseleccionado si hay saldo USADO > 0, si no NUEVO | Consume lo usado antes; sorprende, y el default cambia según datos. |
| 3. Sin default: hay que elegir cuando hay ambos saldos | Obliga a decidir; fricción en el caso común. |

Recomendado: 1. Con solo un saldo > 0, el selector puede mostrarse deshabilitado, ya con esa condición.

**(b) `stockMinimo` cuenta solo NUEVO o el total**

| Opción | Consecuencia |
|---|---|
| 1. Solo NUEVO | "Reponer" refleja piezas comprables; lo usado no oculta la falta. Riesgo: alerta aunque haya usados aptos. |
| 2. Total | Un usado enmascara la falta de nuevos. |
| 3. Mínimo por condición | Más UI y schema; sobredimensionado. |

Recomendado: 1. El estado de reposición se calcula sobre NUEVO, y la ficha muestra ambos saldos.

**(c) Condición para todos los insumos o solo familias `esRepuesto`**

| Opción | Consecuencia |
|---|---|
| 1. Todos los insumos (columna universal) | Simple, una sola regla; consumibles (tóner) muestran USADO=0 sin sentido. |
| 2. Solo `es_repuesto` | Coherente con el negocio; validación cruzada extra en entrada/salida/ajuste y la UI oculta el selector. |
| 3. Universal en datos, visible solo en repuestos en la UI | Sin validación cruzada; se puede registrar USADO de un consumible por API. |

Recomendado: 3 (columna universal, selector visible solo en repuestos), y rechazar USADO en no-repuestos con un 422 si el equipo lo tolera. Confirmar con el dueño.

**(d) Formato del motivo del descarte**

| Opción | Consecuencia |
|---|---|
| 1. Texto libre obligatorio (máx. 500, como `MOVIMIENTO_INSUMO_MOTIVO_MAX_LENGTH`) | Reutiliza la normalización de motivo; el análisis posterior es manual. |
| 2. Lista cerrada (rotura, obsoleto, DOA, otro) + texto opcional | Reportable; catálogo nuevo. |
| 3. Opcional | Sin fricción; se pierde la trazabilidad de la pérdida. |

Recomendado: 1. Permiso: el mismo `EQUIPOS:BORRADO`, sin permiso nuevo (el catálogo de acciones no tiene "REACTIVAR" propio, R1, y la convención es no multiplicar acciones). Opción de endurecimiento: exigir `INSUMOS:AJUSTAR` para descartar, por ser un desvío de existencias; no recomendada por ahora.

**(e) Devolver como USADO un componente que vino con el equipo**

Un componente creado con `descontarStock=false` nunca salió del depósito.

| Opción | Consecuencia |
|---|---|
| 1. Permitido siempre | Simple; fabrica stock USADO que nunca existió (se puede "generar" stock). |
| 2. Solo si tiene SALIDA asociada | Exige poder ligar movimiento y componente; hoy no hay `componenteId` en el movimiento. |
| 3. Permitido pero con motivo obligatorio y marcado | Auditable; sin bloquear el caso real (retirar un disco de un equipo comprado). |

Recomendado: 3. Es un caso legítimo (la pieza existe físicamente). Requiere registrar en la baja que no hubo salida previa (`bajaMovimientoId` de la instalación nulo). La opción 2 requeriría trazar la instalación; ver (h).

**(f) Destino de `reactivar`**

| Opción | Consecuencia |
|---|---|
| 1. Se mantiene igual | Si la baja devolvió al stock, la pieza quedaría en el equipo Y en el depósito: doble conteo. |
| 2. Bloquear tras `STOCK_USADO`, permitir tras `DESCARTE` y en bajas legadas | Sin doble conteo; para volver a instalar se usa el alta con USADO. |
| 3. Reactivar compensa con SALIDA USADO en la misma transacción | Deshace de verdad; falla si el usado ya se consumió (409) y añade otra ruta con lock. |
| 4. Retirar `reactivar` | Elimina el problema; borra una función que existe hoy. |

Recomendado: 2 (mínimo riesgo). La opción 3 es válida si el dueño quiere un deshacer completo.

**(g) ENTRADA/AJUSTE sobre USADO; recepciones**

| Opción | Consecuencia |
|---|---|
| 1. ENTRADA manual y AJUSTE pueden apuntar a USADO; la recepción de compra siempre NUEVO | Permite cargar el inventario físico inicial de usados y corregir conteos; el usado también puede entrar sin equipo de origen. |
| 2. USADO solo por devolución desde un equipo | Origen siempre trazable; sin forma de corregir el conteo de usados sin ajuste. |
| 3. ENTRADA solo NUEVO; AJUSTE puede USADO | Punto medio. |

Recomendado: 1, con la recepción de compra fija en NUEVO (no expone el campo).

**(h) Historial dedicado de bajas**

| Opción | Consecuencia |
|---|---|
| 1. Movimiento + soft delete solamente | Falla en el descarte: no hay movimiento, y el motivo y el destino no tienen dónde vivir. |
| 2. Columnas de baja en `componentes_equipo` (recomendada) | Cubre el descarte y el vínculo al movimiento de devolución. Sin tabla nueva. |
| 3. Tabla `bajas_componente` dedicada | Historial completo por evento; útil si un componente se baja/reactiva varias veces. Más migración y código. |
| 4. Un movimiento de dirección 0 (`DESCARTE`) | Rechazada: choca con `DIRECCION_POR_TIPO_MOVIMIENTO` (solo ±1) y con la pregunta de cómo se lee en el saldo. |

Recomendado: 2. Con `bajaMovimientoId` y `movimiento.equipoId`, se responde "de qué equipo vino esta pieza usada". Si se permite reactivar y volver a dar de baja, la opción 2 sobrescribe el destino anterior; eso pesa a favor de 3 solo si el dueño quiere trazar múltiples ciclos.

## 5. Migración, despliegue y rollback

- **SQL**: `ALTER TABLE movimientos_insumo ADD COLUMN condicion VARCHAR(10) NOT NULL DEFAULT 'NUEVO'`, más el CHECK (`movimientos_insumo_condicion_check`). Con `DEFAULT` constante, Postgres 11+ no reescribe la tabla y el lock es breve. En `componentes_equipo`: columnas de baja nullable, más el CHECK de `bajaDestino`.
- **Backfill**: los movimientos históricos quedan NUEVO por el default, coherente con que hoy todo el stock se trata como nuevo. Los componentes ya dados de baja quedan con `bajaDestino` NULL (baja legada, sin resultado de stock).
- **No quitar el default** en esta entrega: permite que el binario viejo siga insertando durante la ventana de deploy.
- **Migraciones por tenant**: son multi-base; el deploy recorre los tenants (ver `deploy.ps1` y `predeploy-dump.ps1`, que ya hace dump verificado). No hay CHECK cross-tenant. Confirmar que la migración pasa por la tabla `clientes` como las anteriores (p. ej. `20260929120000_componentes_insumo_obligatorio`).
- **Orden**: (1) migración aditiva, (2) backend, (3) frontend. Con la migración aplicada primero, el backend viejo sigue funcionando (ignora la columna).
- **Rollback**: la migración se puede dejar puesta con seguridad. El riesgo es el backend viejo con datos USADO ya escritos: sumaría USADO y NUEVO como un solo saldo y permitiría una SALIDA que consuma usados creyendo que son nuevos. Mitigación: no habilitar la devolución a USADO en producción hasta que el backend nuevo esté estable, o un feature flag; documentarlo en el runbook. Revertir el backend antes de que existan USADO es sin costo.

## 6. Tamaño y corte en work units (≤400 líneas cambiadas, auto-chain)

Estimación total: ~1.800-2.200 líneas, casi la mitad son tests. Corte propuesto, en orden de dependencia:

| WU | Contenido | Est. |
|---|---|---|
| 1 | Dominio y persistencia: `CONDICIONES_STOCK`, `condicion` en entidad, mapper, schema, migración, CHECK y su spec de constraints. Puerto y repo con `sumarPorTipo` por condición (más el spec de integración del repo). | ~380 |
| 2 | Casos de uso de insumos: `calcularStock` por condición, salida/ajuste/entrada/consultar, recepción de compra fija en NUEVO. Incluye actualizar los specs que llaman a `calcularStock`. | ~400 |
| 3 | Borde HTTP de insumos: DTOs, controller, respuesta con saldo por condición y `estadoReposicion`; e2e. | ~300 |
| 4 | Equipos backend, instalación: `condicion` en DTO, controller e `InstalarComponenteDesdeDeposito`; atomicidad y stock insuficiente por condición. | ~250 |
| 5 | Equipos backend, baja: columnas de baja, `EliminarComponenteUseCase` transaccional, endpoint nuevo, política de `reactivar`; integración de atomicidad. | ~400 (si se pasa, separar reactivar) |
| 6 | Frontend insumos: schemas y tipos, ficha con dos saldos, columna condición, selector en los tres diálogos. | ~380 |
| 7 | Frontend equipos: diálogo de baja con dos resultados, selector de condición en el alta, invalidaciones, etiquetas de baja. | ~350 |
| 8 | Cierre: deuda de Ayuda anotada, runbook (rollback y flag si aplica). | ~150 |

WU-1 → 2 → 3 (backend insumos) y 4-5 dependen de 2. Los WU 6-7 dependen del contrato de 3 y 5. La política de `strict_tdd` no se inyecta: es una feature, no un bugfix. Las estimaciones de este repo suelen quedar cortas por 1,5 a 2 veces.

## 7. Riesgos

1. **Firma de `calcularStock` y `SumasPorTipoMovimiento`.** Cambian para todos los llamadores y para muchos specs; el `Record<Tipo, 1|-1>` obliga a que la dimensión condición sea ortogonal al tipo y no un tipo nuevo. Mitigación: una sola función que devuelve el saldo por condición y el total.
2. **Concurrencia al devolver.** La ENTRADA no toma el lock (por diseño, no decide nada). La devolución solo suma, así que es segura; una SALIDA USADO concurrente solo ve el saldo confirmado, lo que es consistente.
3. **Doble conteo en `reactivar`** tras una devolución (ver f). Decisión obligatoria antes del propose.
4. **Fabricar stock USADO** con componentes que vinieron con el equipo (e) o con un ajuste positivo (g). Mitigación: motivo obligatorio y auditoría; los permisos existentes gobiernan.
5. **Rollback con USADO escrito** (§5): el binario viejo mezcla saldos.
6. **Permisos cruzados.** `EQUIPOS:BORRADO` pasaría a poder sumar stock; consecuencia asumida como en instalar, pero hay que declararla en la spec. Los usuarios con `EQUIPOS:ALTAS` sin `INSUMOS:LECTURA` no ven los saldos al instalar (salen de `GET /insumos/:id/stock`).
7. **Baja de un equipo completo** (`eliminar-equipo.use-case.ts`): no se exploró. Sus componentes quedan activos bajo un equipo dado de baja; ¿deben devolver piezas al stock? Fuera de alcance salvo que el dueño lo pida.
8. **Frontend**: `equipo-componentes-section.tsx` usa un cache con `staleTime: Infinity` y `queryFn` que devuelve las props; las mutaciones locales actualizan el cache. Un payload de baja nuevo debe cuidar que `["componentes", equipoId]` y el stock se invaliden.
9. **Ayuda** suspendida: anotar la deuda en commit y PR de cada WU que cambie una pantalla.
10. **Tests de integración** que comparten `soporte_master_test` deben llamar `usarLockMasterTest()` si truncan esa base.

## Recomendación

Adoptar: columna `condicion` en `movimientos_insumo` (NUEVO por default, CHECK), saldo por insumo y condición con un lock por insumo, baja como `POST .../baja` con dos destinos, y columnas de baja en `componentes_equipo` en lugar de un tipo de movimiento o una tabla nueva. Antes del propose, resolver (b), (e), (f) y (h), que cambian el diseño; (a), (c), (d) y (g) tienen un default razonable.
