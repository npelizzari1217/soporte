# Entrega 2 del módulo de insumos — movimientos y stock

> Documento de diseño de una página. **No es un ciclo SDD.** El camino se eligió por el
> criterio del proyecto: la ambigüedad selecciona SDD, nunca el tamaño. Después de la
> exploración quedaba una sola decisión abierta —el modelo de autorización— y se resolvió
> antes de escribir esto. Lo demás tiene precedente verificado en el repo.
>
> Fecha: 2026-09-06. Exploración previa en engram: `sdd/insumos-entrega-2/explore`.

## Qué entrega

Responder **cuánto hay** de cada insumo, y **quién lo movió y por qué**.

El stock es la SUMA de los movimientos, nunca una columna mutable — mismo patrón que
`OperacionCompra`, que ya funciona así en este repo.

## Qué NO entrega, y por qué se cortó

| Recortado | Motivo |
|---|---|
| `ItemCompra.insumoId` y la entrada automática al recibir una compra | Arrastra su propia decisión de idempotencia de reintento, y no bloquea nada de lo de acá. Va a la Entrega 3 |
| Listado global de "insumos bajo el mínimo" | Recorrer todos los movimientos de todos los insumos en cada consulta es una optimización sin dato: **no se pudo medir el volumen real de producción**. Primero el stock por insumo en su ficha; el listado global se dimensiona cuando haya datos |

Sigue fuera de alcance lo que ya estaba: múltiples depósitos, lotes y vencimientos, número
de serie por unidad, reservas.

## Las decisiones

### 1. Concurrencia: advisory lock transaccional

Dos salidas simultáneas del mismo insumo que juntas superan lo que hay son el riesgo real.

Se usa `pg_advisory_xact_lock(hashtext('insumo-stock:' + insumoId))`, adquirido **dentro**
de la transacción que suma los movimientos y escribe el nuevo, vía
`ITenantTransactionRunner`. No es un patrón nuevo: el repo ya lo aplica en
`prisma-compra.repository.ts:279` y en `prisma-ticket.repository.ts`. Serializa solo a los
escritores del MISMO insumo.

**El límite hay que decirlo, no esconderlo.** Postgres no puede expresar
`SUM(cantidad) >= 0` sobre varias filas, así que **no hay backstop de base**: la invariante
depende de que toda escritura pase por el único punto que toma el lock. Un segundo
repositorio, o un script que inserte en `movimientos_insumo` directo, la rompe sin que la
base lo note. No se resuelve con un trigger: **no hay un solo trigger en las migraciones de
este repo**, y estrenar ese patrón acá sería introducir un mecanismo sin precedente para
tapar un problema de disciplina.

Descartado explícitamente: una fila de stock mutable con `SELECT ... FOR UPDATE` y un
`CHECK` real. Resolvería el backstop, pero contradice la decisión ya tomada de que el stock
nunca es una columna mutable.

### 2. Autorización: `INSUMOS` entra a la matriz `MODULO:ACCION`

El catálogo de la Entrega 1 se gatea 100% con `AdminClienteGuard`, y para un catálogo que
se edita de vez en cuando alcanza. **Para el movimiento no alcanza, y el motivo es
operativo antes que de auditoría**: las salidas las registra un técnico todos los días. Si
el movimiento hereda el gate del catálogo, el técnico no puede sacar un tóner del depósito
y el módulo no sirve.

Entra un módulo nuevo al catálogo de `src/shared/domain/acciones.ts`, que hoy declara 8
módulos y 33 pares. Permite además separar quién registra de quién firma un AJUSTE — la
operación que puede tapar un faltante—, igual que `COMPRAS` separa `MODIFICACION` de
`APROBACION`.

Los permisos se otorgan por usuario en `master` (`UsuarioClientePermiso`), así que **no hay
que sembrar los pares**: el cambio es la constante y lo que de ella se deriva.

### 3. El ajuste lleva motivo obligatorio

Precedente exacto: `ItemCompraEntity.cerrarConFaltante`, que falla con
`MotivoCierreFaltanteRequeridoError` si el motivo viene vacío o en blanco. Un ajuste sin
motivo es un faltante sin explicación.

### 4. La tabla es append-only

Sin `updatedAt`, sin `deletedAt`, con `usuarioId` y catálogo de `tipo` cerrado por `CHECK`
—`ENTRADA`, `SALIDA`, `AJUSTE`—, calcado de `OperacionCompra`. Un movimiento no se edita ni
se borra: se corrige con otro movimiento. `CHECK (cantidad > 0)`: el signo lo da el tipo, no
el número, para que no haya dos formas de representar lo mismo.

## Las ocho unidades entregables

Cada una se entrega y se revierte sola, con sus tests adentro.

| # | Unidad |
|---|---|
| 1 | Cimientos: migración de `movimientos_insumo` + `INSUMOS` en la matriz de permisos |
| 2 | Dominio: `MovimientoInsumoEntity` y su puerto |
| 3 | Persistencia: repositorio, mapper, el advisory lock y el **test de concurrencia real** |
| 4 | Registrar ENTRADA |
| 5 | Registrar SALIDA, validando stock suficiente bajo el lock |
| 6 | Registrar AJUSTE, con motivo obligatorio |
| 7 | Stock actual por insumo e indicador de "bajo el mínimo" en su ficha |
| 8 | Borde HTTP: controller, DTOs y wiring del módulo |

Ocho, bajo el techo de doce. **El orden no es negociable en un punto**: la persistencia (3)
va ANTES que los casos de uso (4-6). En la Entrega 1 se cortó al revés y la capa de
aplicación aprendió a escribir algo que la infraestructura descartaba en silencio. Un
contrato y su implementación viajan en el mismo commit.

El test de concurrencia no es una unidad aparte: vive dentro de la unidad que introduce la
sección crítica, porque un commit es un comportamiento entregable con sus tests adentro.

La Ayuda va DENTRO de la unidad que agrega el endpoint o la pantalla que el usuario ve,
nunca en una unidad final de documentación.

## Lo que queda sin verificar

- **El volumen real de `movimientos_insumo` en producción.** No hay acceso para medirlo
  (mismo bloqueo registrado el 2026-09-04). Por eso el listado global de reposición se
  corta en vez de diseñarse a ciegas.
- Que el advisory lock se comporte igual bajo la carga real del inquilino. El test de
  concurrencia lo prueba con conexiones simultáneas genuinas —espejo del de compras, que
  instrumenta el pool para demostrar que hubo paralelismo real y no encolamiento—, pero eso
  es un banco de pruebas, no producción.
