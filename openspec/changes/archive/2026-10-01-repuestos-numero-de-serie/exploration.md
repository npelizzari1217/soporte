# Exploración: seguimiento por número de serie de repuestos (`repuestos-numero-de-serie`)

> Producida por `sdd-explore` el 2026-09-30 sobre `main` en `dc8f9a77`, en solo lectura. El
> ejecutor no contaba con herramienta de escritura; el orquestador la persiste sin cambios de
> contenido. No se consultó producción: los volúmenes son inferencias.

## 1. Estado actual

**Dónde existe un serial hoy**

| Dónde | Hecho | Ref |
|---|---|---|
| `componentes_equipo.numero_serie` | `VARCHAR(255)` nullable, texto libre, **sin índice único** (la migración init solo indexa el de equipos). Se carga a mano en el alta y se edita en `PATCH`. | `backend/prisma_tenant/schema.prisma:945`; `migrations/20260805194710_init_tenant/migration.sql:272,292` |
| `equipos_informaticos.numero_serie` | Único parcial `WHERE NOT NULL`. Es el serial del equipo completo, no de una pieza. | `schema.prisma:561`; `migration.sql:443` |
| Frontend | Campo `numeroSerie` en `componente-create-dialog.tsx:51,84,145`, en `componente-edit-dialog.tsx` y en `equipo-componentes-section.tsx`. Ningún diálogo de movimiento de insumo envía una referencia de unidad. | `frontend/src/features/equipos/components/*` |

**Dónde una unidad es solo cantidad**

- `movimientos_insumo` (`schema.prisma:779`): `cantidad Decimal(10,2)` con `CHECK > 0`, más `condicion` NUEVO/USADO, `equipoId`, `sectorId` e `itemCompraId`. No existe columna de unidad. El signo lo da el `tipo`.
- Saldo: `sumarPorTipo` hace un `groupBy(condicion, tipo)` con `SUM(cantidad)` (`prisma-movimiento-insumo.repository.ts:223`). `lockAndSumByTipo` toma `pg_advisory_xact_lock(hashtext('insumo-stock:'+insumoId))` y exige transacción (`:113-130`). `sumByTipo` es la lectura sin lock (`:151`).
- `Insumo` (`schema.prisma:685`) no tiene flag de seguimiento. Lo único que distingue un repuesto de un consumible es `FamiliaInsumo.esRepuesto` (`:657`).

**Flujos que deberían conocer unidades individuales**

| Flujo | Archivo | Hoy | Necesidad |
|---|---|---|---|
| Entrada manual | `registrar-entrada-insumo.use-case.ts`; `movimientos-insumo.controller.ts:142` | ENTRADA de N, condición elegible | Pedir N seriales (o un serial y cantidad 1) y crear N unidades. |
| Recepción de compra | `registrar-recepcion-de-item.use-case.ts:169-181` | ENTRADA NUEVO con delta en centésimas e `itemCompraId`; recepción parcial y acumulada, el delta puede ser fraccional | Capturar seriales por delta recibido. Es el punto más delicado: el acumulado es un número, no una lista. |
| Salida manual | `registrar-salida-insumo.use-case.ts`; controller `:185` | SALIDA de N con validación de saldo por condición bajo lock | Elegir unidad concreta. |
| Ajuste +/- | `registrar-ajuste-insumo.use-case.ts:206`; controller `:229` | AJUSTE ± con motivo obligatorio | El positivo crea unidad; el negativo da de baja una unidad concreta. |
| Instalar desde depósito | `instalar-componente-desde-deposito.use-case.ts:113-153` (POST `equipos.controller.ts:348`) | Componente + SALIDA(1) en una transacción (patrón `FalloSalidaDeStock`) y `vincularInstalacion(salidaId)`; el serial del componente se tipea aparte | El componente debería nacer de una unidad elegida. |
| Alta manual sin descuento | `agregar-componente.use-case.ts:60-109` | Crea el componente sin movimiento | Decidir si se crea una unidad INSTALADA sin origen. |
| Retiro STOCK_USADO | `retirar-componente.use-case.ts:90-101` → `registrarDevolucionDeComponente` | ENTRADA(1) USADO y `bajaMovimientoId` | La unidad vuelve a EN_DEPOSITO/USADO conservando su serial. |
| Retiro DESCARTE | `retirar-componente.use-case.ts` | Marca la baja; no toca stock | La unidad pasa a DESCARTADA. |
| Reactivar | `reactivar-componente.use-case.ts:50-56` | Bloquea tras STOCK_USADO; permite tras DESCARTE | Reactivar un DESCARTE vuelve la unidad a INSTALADA. |
| Editar componente | `editar-componente.use-case.ts` | Edita `numeroSerie` libre | Con unidad, el serial pertenece a la unidad: editarlo es una corrección. |
| Eliminar equipo | `eliminar-equipo.use-case.ts` | Solo soft-delete del equipo; los componentes quedan intactos | Es el punto de partida del ciclo de baja de equipo completo. |
| Consultas | `consultar-stock-insumo.use-case.ts:113`, `listar-movimientos-insumo.use-case.ts`, controller `:274,:310` | Saldo por condición y bitácora paginada | Saldo derivado de unidades y lista de unidades. |
| UI | `insumo-detail-view.tsx`, `repuestos-list-view.tsx`, `movimiento-*-dialog.tsx`, `condicion-stock-selector.tsx`, `equipo-componentes-section.tsx`, `componente-create-dialog.tsx` | Solo cantidades | Selector de unidad, lista de unidades e historial por serial. |
| Exportar equipos | `exportar-equipos.use-case.ts` | Incluye el `numeroSerie` del equipo | Fuera de alcance salvo para el reporte de stock futuro. |

**Hallazgo de diseño.** `ComponenteEquipo` ya es "una fila por unidad instalada" (ver el JSDoc de
`instalar-componente-desde-deposito:43`). Falta el equivalente para las unidades en depósito.

## 2. Opciones de modelo

| Opción | Descripción | A favor | En contra | Esfuerzo |
|---|---|---|---|---|
| **A. Modo de seguimiento por insumo** (`Insumo.seguimiento`: NINGUNO\|SERIE) | Flag en el catálogo, al estilo del `tracking` de Odoo. Define quién se serializa. | Granularidad exacta; es el patrón investigado. | Solo, no guarda nada: necesita B. | Bajo |
| **A'. Flag en la familia** | Lo mismo, a nivel familia. | Una decisión para toda la familia. | Mezcla dentro de una familia artículos con y sin serie. | Bajo |
| **B. Tabla `unidades_insumo`** (una fila por pieza física) | `id`, `insumoId`, `numeroSerie`, `condicion`, `estado` EN_DEPOSITO/INSTALADA/DESCARTADA, `equipoId?`, timestamps. Cada movimiento de un insumo serializado referencia `unidadId`. | Historial por serial; la pieza conserva su identidad; encaja con `item_devices` de GLPI. | Segunda fuente de verdad del saldo si no se diseña bien. | Alto |
| **C. Serial solo en componentes** | Índice único parcial en `componentes_equipo.numero_serie`; el depósito sigue siendo cantidad. | Muy barato. | No sabe qué seriales hay en el depósito; el serial se pierde al devolver. No cubre el pedido. | Bajo |

**Recomendación: A + B.** Reglas:

1. **Fuente única del saldo.** Para un insumo `SERIE`, el saldo es `COUNT(unidades EN_DEPOSITO)` por condición, no la suma del libro. El libro sigue append-only y gana `unidadId` (nullable), con CHECK `cantidad = 1` cuando hay `unidadId`. Un insumo `NINGUNO` no cambia.
2. **Bloqueo.** Se mantiene el advisory lock por insumo; también serializa la elección de unidad.
3. **Coherencia libro/unidades.** Toda mutación de unidad ocurre en la misma transacción que su movimiento. Un spec de integración verifica el invariante: el último movimiento de cada unidad coincide con su estado, y el conteo de unidades EN_DEPOSITO coincide con el saldo del libro.
4. **Cambio de modo con stock.** Se bloquea si el saldo es distinto de cero, o se exige una conversión explícita (ver P4).
5. **`ComponenteEquipo`** gana `unidadId` nullable y único. Su `numeroSerie` de texto queda como dato legado; la columna no se elimina en este ciclo.

**Encaje con los ciclos futuros.** El reporte de stock exporta `unidades_insumo`, que es una tabla
plana (serial, estado, condición, equipo). La baja de un equipo completo es una operación en lote
sobre las unidades INSTALADAS del equipo: devolverlas todas a EN_DEPOSITO/USADO o descartarlas con
un motivo compartido. El motivo compartido (vejez, donación, rotura, otra) sugiere que `bajaMotivo`
pase a un catálogo cerrado en ese ciclo, no en este.

## 3. Preguntas de producto abiertas

- **P1. ¿Qué se serializa?** (a) Por insumo, con un flag en el ABM (recomendado); (b) por familia; (c) todos los repuestos, que obliga a cargar seriales de teclados, mouses y cables.
- **P2. ¿El serial es obligatorio al ingresar?** (a) Obligatorio en insumos `SERIE` (recomendado); (b) opcional, con unidades "sin serie"; (c) obligatorio pero completable después, con una unidad creada como placeholder. Impacto en la recepción de compras: hay que capturar seriales por lote recibido, cargándolos en la recepción o después desde la ficha.
- **P3. Unicidad del serial.** (a) Único por insumo (recomendado); (b) único por tenant; (c) sin unicidad, solo advertencia. Conviene normalizar: sin mayúsculas ni espacios.
- **P4. Stock existente sin serial.** (a) El modo `SERIE` solo se activa con saldo 0 (recomendado); (b) backfill de unidades placeholder "SIN-SERIE-n"; (c) unidades "sin serie" explícitas, completables luego.
- **P5. Componentes ya instalados y alta sin descuento.** (a) El componente legado queda sin unidad, con su serial de texto; solo las altas nuevas usan unidades (recomendado). (b) Crear unidades INSTALADAS retroactivas a partir del serial de texto, con riesgo de duplicados y basura. Para el alta sin descuento de un insumo `SERIE`: crear una unidad INSTALADA sin origen.
- **P6. ¿Instalar exige elegir una unidad?** (a) Sí, por serial (recomendado); (b) FIFO automático e informado.
- **P7. Historial por serial.** (a) Panel de historial de la unidad: ingreso, equipos, retiros, destino (recomendado); (b) solo búsqueda que lleva al estado actual. La historia anterior a este ciclo no existe.
- **P8. Corrección de un serial.** (a) Editable con motivo obligatorio y registro (recomendado); (b) inmutable: se da de baja y se recrea; (c) editable libremente.
- **P9. NUEVO/USADO por unidad.** La condición es propiedad de la unidad: entra NUEVO y pasa a USADO al devolverse de un equipo. Confirmar que el conteo por condición sale de las unidades EN_DEPOSITO.
- **P10. Ajustes manuales.** Un ajuste positivo exige un serial nuevo y uno negativo exige elegir la unidad, en los dos casos con motivo (recomendado). Alternativa: prohibir ajustes cuantitativos en insumos `SERIE`.
- **P11. Cantidad fraccional.** Un insumo `SERIE` debe tener una unidad de medida entera.

## 4. Migración, rollback y despliegue

- **Migración aditiva.** Tabla `unidades_insumo`; `Insumo.seguimiento` con default `'NINGUNO'`; `movimientos_insumo.unidad_id` nullable con FK y CHECK `(unidad_id IS NULL OR cantidad = 1)`; `componentes_equipo.unidad_id` nullable y único. Con `NINGUNO`, todo se comporta igual que hoy.
- **Rollback.** Mientras ningún insumo esté en `SERIE`, alcanza con revertir el código y las columnas nuevas quedan nulas. Con unidades ya creadas hace falta una decisión.
- **Orden.** Primero la migración en todos los tenants, después el backend, después el frontend, y al final el dueño activa `SERIE` insumo por insumo.
- **Multi-tenant.** `predeploy-dump.ps1` previo; los specs que truncan `soporte_master_test` llaman a `usarLockMasterTest()`.
- **Volumen en producción:** no verificado. Hay que medirlo antes de decidir P4.

## 5. Tamaño y corte en work units (≤400 líneas; el real suele ser 2-3 veces el estimado)

| WU | Contenido | Estimado |
|---|---|---|
| WU-1 | Esquema y dominio: `Insumo.seguimiento`, entidad `UnidadInsumo`, migración, repositorio, spec de constraints | ~350 |
| WU-2 | Entrada y recepción serializadas, unicidad, saldo derivado | ~400 (riesgo) |
| WU-3 | Salida, ajuste y consulta con unidades; selección de unidad; invariante | ~400 |
| WU-4 | Instalar, retirar y reactivar sobre unidades; `componentes_equipo.unidad_id` | ~400 |
| WU-5 | Frontend: flag en el ABM, lista de unidades, selector e historial | ~400+ (probablemente 5a y 5b) |

Estimación: entre 5 y 7 PRs.

## 6. Riesgos

1. Dos fuentes de verdad del saldo: se mitiga derivando el saldo de las unidades y con el spec del invariante.
2. La recepción parcial con deltas fraccionales complica la carga de seriales.
3. Concurrencia al elegir unidad: la cubre el lock por insumo si la elección ocurre bajo el lock.
4. Los seriales legados de componentes son texto libre sin unicidad: no se convierten automáticamente.
5. Reactivar y eliminar equipo deben mantener consistente el estado de la unidad y reutilizar sus operaciones.
6. Cambio de modo con stock existente: P4 tiene que resolverse antes de codificar.
7. Tamaño de PR: WU-2 y WU-5 son las candidatas a pasar de 400.
8. No se verificó si el roadmap comercial tiene una viñeta para esto.
