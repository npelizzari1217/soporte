# Entrega 3 del módulo de insumos — la recepción de una compra genera stock

> Documento de diseño de una página. **No es un ciclo SDD**, igual que la Entrega 2. Se
> corrió una sola fase, `sdd-explore`, para medir contra el código real; la única
> ambigüedad genuina quedó resuelta con evidencia antes de escribir esto, y el resto tiene
> precedente exacto en el repo. La ambigüedad selecciona SDD, nunca el tamaño.
>
> Fecha: 2026-09-07. Exploración previa en engram: `sdd/insumos-entrega-3/explore`.

## Qué entrega

Que **recibir una compra sume el stock solo**, sin que nadie lo cargue dos veces.

Hoy el circuito de compras ya tiene las tres etapas encadenadas y `cantidadRecibida`
avanzando. Eso **ya es** una entrada de stock; lo único que falta es decir de qué insumo se
trata y asentar el movimiento.

## Las decisiones

### 1. Un insumo DESHABILITADO no bloquea la recepción

Es la decisión central y la única que no tenía respuesta obvia. Si alguien deshabilita un
insumo mientras hay una orden de compra en curso, la recepción querría generar una ENTRADA
sobre un insumo deshabilitado — y `RegistrarEntradaInsumoUseCase` la rechaza.

Se eligió **generar la entrada igual**, pasando `exigirHabilitado: false` — una opción que
la firma de `validarInsumoElegible` ya soporta.

El argumento: el guard nació en la Entrega 2 para la entrada MANUAL, y su regla es
*"deshabilitar significa que no se compra más de esto"*. Una recepción **no es una decisión
nueva de compra**: la decisión se tomó y se aprobó antes de la baja. La mercadería ya está
en el depósito, la haya pedido quien la haya pedido, y el stock tiene que reflejar lo que
hay.

**La tensión hay que decirla, no esconderla**: la regla que escribimos en la Entrega 2 dice
que `activo: false` frena lo que trae cosas nuevas al depósito, y una recepción trae cosas
nuevas. Lo que la distingue no es el efecto sino el momento del compromiso. Si esa lectura
no convence, la alternativa es rechazar la recepción y obligar a rehabilitar el insumo — y
eso hay que decidirlo antes de implementar, no después.

Se descartaron:
- **Fallar la recepción entera**: una decisión del catálogo bloquea el circuito de compras.
- **Registrar la recepción sin el movimiento**: pierde stock en silencio. Es la peor de
  todas y, ojo, es a la que se llega SOLA si se propaga un `Result.fail` en vez de lanzar
  (ver decisión 3).
- **Impedir deshabilitar un insumo con órdenes abiertas**: sería lo más correcto
  conceptualmente, pero está bloqueado por la arquitectura — `insumos` tendría que
  preguntarle a `compras`, y esa arista cierra un ciclo.

### 2. El movimiento apunta al ítem de compra que lo originó

`movimientos_insumo` gana `item_compra_id`, nullable, con `ON DELETE RESTRICT` explícito y
por el mismo criterio que `equipo_id` y `sector_id`: **el default de Prisma para una
relación opcional es `SetNull`**, que vaciaría la trazabilidad en silencio.

Sin esa columna, "¿de qué compra vino esta entrada?" no tiene respuesta. Agregar una
columna a una tabla append-only es barato: append-only prohíbe el UPDATE y el DELETE de
filas, no el `ALTER TABLE ADD COLUMN` nullable.

Una sola columna y no también `compraId`: `items_compra` ya tiene su índice por compra y se
resuelve con un join.

### 3. El error de la entrada tiene que LANZAR dentro de la transacción

`RegistrarEntradaInsumoUseCase` devuelve `Result`, y `$transaction` de Prisma **solo
revierte ante una excepción**. Propagar un `Result.fail` desde adentro del `run()` de la
recepción dejaría que Postgres commitee la recepción **sin el movimiento de stock**: la
opción que se descartó por perder stock en silencio, entrando por la puerta de atrás.

Es el mecanismo S36, ya documentado y probado contra Postgres real en
`registrar-operacion-compra.s36.integration.spec.ts`. Dentro del `run()` se lanza; afuera se
convierte de vuelta a `Result.fail`.

**Este punto necesita su propio test de integración contra Postgres, no contra un mock**:
un mock commitea igual y el test pasa en verde donde la base no lo haría.

### 4. El delta se captura ANTES de mutar

`cantidadRecibida` es el ACUMULADO, no un delta, y `item.registrarRecepcion(...)` muta la
entidad **antes** de que se abra la transacción. El valor viejo hay que guardarlo antes de
esa línea o ya se perdió.

Emitir por DELTA y no por valor absoluto es lo que da **idempotencia sin mecanismo extra**:
`registrarRecepcion` acepta reenviar el mismo acumulado sin error, así que un reintento
produce delta cero y ningún movimiento.

`registrarRecepcion()` es el único método que muta esa columna, con un solo llamador de
aplicación: el enganche tiene un punto único y no hay camino que se lo saltee.

### 5. Reasignar el insumo de un ítem con recepciones se prohíbe

Si un ítem ya recibió mercadería y se le cambia el `insumoId`, el stock ya emitido queda en
el insumo viejo y los deltas futuros van al nuevo: la historia se parte en dos sin error y
sin log.

Va un guard NUEVO en `ItemCompraEntity.actualizar()`, distinto de `asegurarNoCongelado()`,
que bloquea el cambio cuando `cantidadRecibida > 0`.

### 6. `items_compra.insumo_id` es nullable y NO se backfillea

Los ítems históricos son texto libre y no hay forma confiable de mapearlos al catálogo.
Backfillear uno con `cantidadRecibida > 0` abriría además la pregunta de fabricar
movimientos retroactivos con fecha falsa.

Quedan en `NULL` para siempre, y el enganche trata el `NULL` como "sin insumo": la
recepción funciona igual que hoy.

## Las siete unidades entregables

| # | Unidad |
|---|---|
| 1 | Migración: `items_compra.insumo_id` y `movimientos_insumo.item_compra_id` |
| 2 | Dominio de compras: `insumoId` en el ítem + guard de reasignación post-recepción |
| 3 | Dominio de insumos: `itemCompraId` en el movimiento y en el DTO de ENTRADA |
| 4 | Persistencia de insumos: mapper y repositorio con `itemCompraId` |
| 5 | Wiring entre módulos: `InsumosModule` exporta, `ComprasModule` importa |
| 6 | **El enganche**: delta antes de mutar, invocación dentro del `run()` y el `throw` |
| 7 | Borde HTTP: el `insumoId` en los DTO del ítem de compra, y la Ayuda |

Siete, bajo el techo de doce. **La persistencia (3-4) va antes que el enganche (6)**, misma
lección que la Entrega 2: cortado al revés, la aplicación aprende a escribir algo que la
infraestructura descarta en silencio.

Si hubiera que recortar, sale primero la trazabilidad (parte de 1, y 3-4), igual que la
Entrega 2 cortó el listado global.

## Lo que queda sin verificar

- La decisión 1 se apoya en una interpretación argumentada —que el guard nunca se pensó
  para la mercadería en tránsito—, no en un hecho verificable en código. Es la única del
  documento que se puede discutir sin datos nuevos.

## Verificado, para no re-preguntarlo

- **Ningún script muta `cantidad_recibida` ni toca `items_compra` por fuera del dominio**
  (`grep` sobre `backend/scripts/`, 2026-09-07: cero coincidencias). El punto único del
  enganche es real, no una suposición.
- `registrarRecepcion()` es el único método que escribe `cantidadRecibida`
  (`item-compra.entity.ts:516`), con un solo llamador de aplicación.
- El mecanismo S36 está probado contra Postgres real, no contra un mock:
  `registrar-operacion-compra.s36.integration.spec.ts`.
