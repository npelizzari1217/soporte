# Delta for Componentes Catálogo Único

Delta contra `openspec/specs/componentes-catalogo-unico/spec.md`. Depende de la
spec nueva `stock-insumo-condicion` (condición del movimiento, saldo por
condición, alcance a repuestos).

## MODIFIED Requirements

### Requirement: Un solo flujo de alta con descuento de stock opcional

El sistema DEBE ofrecer un único flujo de alta con el indicador
`descontarStock`, cuyo valor por defecto DEBE ser `true` cuando se omite. Con
`true`, el sistema DEBE registrar en una sola transacción el componente y una
SALIDA de 1 unidad del insumo, con el `equipoId` como trazabilidad, descontada
del saldo de la condición elegida por el usuario; si no se elige, la condición
DEBE ser `NUEVO`. Si el saldo de esa condición no alcanza, o si la SALIDA falla
por cualquier causa, el sistema DEBE rechazar el alta y revertir también el
componente (issue #153); el faltante se evalúa por condición, no sobre el total.
Con `false`, el sistema DEBE registrar el componente sin ningún movimiento de
stock. Serie y capacidad DEBEN seguir siendo datos del componente en ambos
casos. Cuando el flujo se invoca con `descontarStock: false` e incluye una
condición, si se ignora o se rechaza queda a decisión de diseño.

#### Scenario: Descuento por defecto

- GIVEN un insumo repuesto con saldo NUEVO suficiente
- WHEN se agrega un componente sin indicar `descontarStock` ni condición
- THEN quedan registrados el componente y una SALIDA NUEVO de 1 unidad del
  insumo

#### Scenario: Descuento del saldo USADO

- GIVEN un insumo repuesto con saldo NUEVO 0 y saldo USADO 2
- WHEN se agrega un componente con `descontarStock: true` y condición `USADO`
- THEN quedan registrados el componente y una SALIDA USADO de 1 unidad, y el
  saldo USADO es 1

#### Scenario: Stock insuficiente en la condición elegida

- GIVEN un insumo repuesto con saldo NUEVO 0 y saldo USADO 5
- WHEN se agrega un componente con `descontarStock: true` y sin condición
  (`NUEVO`)
- THEN el sistema rechaza el alta por stock insuficiente y no queda ni
  componente ni movimiento

#### Scenario: Falla la SALIDA y se revierte el alta

- GIVEN un insumo repuesto sin saldo suficiente en la condición elegida
- WHEN se agrega un componente con `descontarStock: true`
- THEN el sistema rechaza el alta y no queda ni componente ni movimiento

#### Scenario: Alta sin descuento

- GIVEN un insumo repuesto con saldo conocido
- WHEN se agrega un componente con `descontarStock: false`
- THEN el componente queda persistido y el saldo y los movimientos del insumo
  no cambian

#### Scenario: Selector de saldo en el alta

- GIVEN la pantalla de alta de un componente con descuento y un insumo
  repuesto con saldos NUEVO y USADO mayores que cero
- WHEN el usuario abre el alta
- THEN el saldo NUEVO aparece preseleccionado, el usuario puede cambiarlo a
  USADO y se muestran ambos saldos disponibles

#### Scenario: Un solo saldo disponible

- GIVEN un insumo repuesto donde solo un saldo es mayor que cero
- WHEN el usuario abre el alta con descuento
- THEN el selector PUEDE mostrarse fijo en ese saldo

## REMOVED Requirements

### Requirement: El retiro sigue siendo el borrado lógico sin movimiento de stock

(Reason: el requerimiento se declaró explícitamente provisorio, "hasta que entre
el cambio `stock-usado-componentes`". Este cambio lo reemplaza por el retiro con
dos desenlaces, que devuelve la pieza al stock como USADO o la descarta con
motivo. Retirar sin destino ya no es un comportamiento vigente.)

(Migration: los retiros anteriores a este cambio no se modifican; quedan como
"retiros legados", sin destino, sin motivo y sin movimiento, y pueden
reactivarse. Todo retiro nuevo pasa por los requerimientos "El retiro de un
componente tiene dos desenlaces" y "Un componente que vino con el equipo puede
devolverse al stock con motivo". El destino del endpoint de borrado actual queda
a decisión de diseño.)

## ADDED Requirements

### Requirement: El retiro de un componente tiene dos desenlaces que elige el usuario

El sistema DEBE exigir, al retirar un componente activo, un destino con uno de
dos valores: `STOCK_USADO` o `DESCARTE`. NO DEBE retirar un componente sin
destino. El retiro DEBE requerir el permiso `EQUIPOS:BORRADO` y NO DEBE
introducir un permiso nuevo. Con `STOCK_USADO`, el sistema DEBE registrar en una
sola transacción una ENTRADA de 1 unidad del insumo del componente con condición
`USADO` (con el `equipoId` como trazabilidad y el usuario que retira), el borrado
lógico del componente y su registro de retiro; si cualquiera falla, no DEBE
quedar ninguno. Con `DESCARTE`, el sistema DEBE exigir un motivo de texto libre
no vacío de a lo sumo 500 caracteres (con la misma normalización que el motivo
de los movimientos de insumo), DEBE registrar el borrado lógico y el registro de
retiro, y NO DEBE registrar ningún movimiento de stock. El endpoint y el verbo
del retiro quedan a decisión de diseño.

Consecuencia de permisos asumida: quien tiene `EQUIPOS:BORRADO` puede sumar
existencias USADO al depósito sin tener permisos de insumos, del mismo modo que
`EQUIPOS:ALTAS` ya descuenta stock al instalar sin permisos de insumos.

#### Scenario: Devolver al stock como usado

- GIVEN un componente activo, instalado con descuento, de un insumo con saldo
  USADO 0
- WHEN un usuario con `EQUIPOS:BORRADO` lo retira con destino `STOCK_USADO`
- THEN el componente queda soft-deleted, existe una ENTRADA USADO de 1 unidad
  del insumo con el `equipoId`, el saldo USADO es 1 y el saldo NUEVO no cambia

#### Scenario: Descartar por rotura

- GIVEN un componente activo de un insumo con saldos conocidos
- WHEN se lo retira con destino `DESCARTE` y motivo "placa quemada"
- THEN el componente queda soft-deleted con su registro de retiro, y los saldos
  y los movimientos del insumo no cambian

#### Scenario: Descarte sin motivo

- GIVEN un componente activo
- WHEN se lo retira con destino `DESCARTE` sin motivo, con motivo vacío o solo
  con espacios
- THEN el sistema rechaza el retiro y el componente sigue activo

#### Scenario: Motivo demasiado largo

- GIVEN un componente activo
- WHEN se lo retira con destino `DESCARTE` y un motivo de más de 500 caracteres
- THEN el sistema rechaza el retiro y el componente sigue activo

#### Scenario: Retiro sin destino o con destino inválido

- GIVEN un componente activo
- WHEN se lo retira sin destino o con un destino distinto de `STOCK_USADO` y
  `DESCARTE`
- THEN el sistema rechaza el retiro y el componente sigue activo

#### Scenario: Falla la ENTRADA y se revierte el retiro

- GIVEN un componente activo y una falla al registrar la ENTRADA USADO
- WHEN se lo retira con destino `STOCK_USADO`
- THEN el componente sigue activo, no existe movimiento ni registro de retiro

#### Scenario: Usuario sin permiso de borrado

- GIVEN un usuario sin `EQUIPOS:BORRADO`, aunque tenga permisos de insumos
- WHEN intenta retirar un componente con cualquier destino
- THEN el sistema rechaza por falta de permiso y no cambia nada

#### Scenario: Usuario con borrado y sin permisos de insumos

- GIVEN un usuario con `EQUIPOS:BORRADO` y sin ningún permiso de insumos
- WHEN retira un componente con destino `STOCK_USADO`
- THEN el retiro se completa y el saldo USADO del insumo aumenta en 1

#### Scenario: Componente ya retirado

- GIVEN un componente ya retirado
- WHEN se intenta retirarlo de nuevo
- THEN el sistema rechaza el retiro y no registra ningún movimiento

#### Scenario: Diálogo de retiro

- GIVEN un componente activo en la sección de componentes del equipo
- WHEN el usuario elige retirarlo
- THEN se le presentan los dos desenlaces ("devolver al stock como usado" y
  "descartar por rotura"), el motivo se exige solo para el descarte y, tras
  confirmar, la lista de componentes y los saldos y movimientos del insumo se
  muestran actualizados

### Requirement: Un componente que vino con el equipo puede devolverse al stock con motivo obligatorio

El sistema DEBE permitir devolver al stock como USADO un componente que nunca
salió del depósito (instalado con `descontarStock: false`, es decir, sin SALIDA
asociada), pero DEBE exigir en ese caso un motivo no vacío de a lo sumo 500
caracteres. El sistema DEBE marcar el registro de retiro de ese componente para
que quede constancia de que "no había salido del depósito". Un componente
instalado con descuento NO DEBE requerir motivo para devolverse al stock, y su
registro NO DEBE llevar esa marca.

#### Scenario: Devolver una pieza que vino con el equipo

- GIVEN un componente instalado con `descontarStock: false`
- WHEN se lo retira con destino `STOCK_USADO` y motivo "disco del equipo
  comprado"
- THEN se registra la ENTRADA USADO de 1 unidad, el componente queda
  soft-deleted y su registro de retiro queda marcado como "no había salido del
  depósito"

#### Scenario: Devolver una pieza que vino con el equipo sin motivo

- GIVEN un componente instalado con `descontarStock: false`
- WHEN se lo retira con destino `STOCK_USADO` sin motivo
- THEN el sistema rechaza el retiro, el componente sigue activo y no se
  registra movimiento

#### Scenario: Pieza instalada con descuento

- GIVEN un componente instalado con `descontarStock: true`
- WHEN se lo retira con destino `STOCK_USADO` sin motivo
- THEN el retiro se completa y el registro no lleva la marca "no había salido
  del depósito"

### Requirement: Reactivar un componente depende del destino de su retiro

El sistema NO DEBE permitir reactivar un componente cuyo retiro tuvo destino
`STOCK_USADO`, para evitar contar la pieza en el equipo y en el depósito a la
vez; ante el intento DEBE rechazar sin cambiar nada. El sistema DEBE permitir
reactivar un componente retirado con destino `DESCARTE` y un componente cuyo
retiro es legado (anterior a este cambio, sin destino). Para volver a instalar
una pieza devuelta al stock se usa el alta con descuento de saldo USADO.

#### Scenario: Reactivar tras devolver al stock

- GIVEN un componente retirado con destino `STOCK_USADO`
- WHEN se intenta reactivarlo
- THEN el sistema lo rechaza, el componente sigue retirado y no se registra
  ningún movimiento

#### Scenario: Reactivar tras descartar

- GIVEN un componente retirado con destino `DESCARTE`
- WHEN se lo reactiva
- THEN el componente vuelve a estar activo y el saldo del insumo no cambia

#### Scenario: Reactivar un retiro legado

- GIVEN un componente retirado antes de este cambio, sin destino
- WHEN se lo reactiva
- THEN el componente vuelve a estar activo y el saldo del insumo no cambia

#### Scenario: Interfaz de reactivar

- GIVEN la sección de componentes con un componente retirado con destino
  `STOCK_USADO`
- WHEN el usuario la consulta
- THEN no se le ofrece reactivarlo y la fila indica el destino del retiro

### Requirement: El componente conserva el registro de su retiro

El sistema DEBE guardar en el propio componente, al retirarlo, el destino
(`STOCK_USADO` o `DESCARTE`), el motivo (cuando exista), el vínculo al
movimiento de devolución (solo con `STOCK_USADO`), la marca "no había salido del
depósito" cuando corresponda y el usuario que lo retiró, y DEBE exponerlos al
consultar el componente. Un componente retirado antes de este cambio DEBE
mostrar estos campos vacíos (retiro legado). El sistema NO DEBE crear una tabla
nueva de retiros ni un tipo de movimiento de dirección cero. Con el vínculo al
movimiento y el `equipoId` del movimiento DEBE poder responderse de qué equipo
vino una pieza usada. Los nombres y la forma exacta de las columnas, y cómo se
registra el usuario, quedan a decisión de diseño.

#### Scenario: Registro de una devolución

- GIVEN un componente retirado con destino `STOCK_USADO`
- WHEN se consulta el componente
- THEN informa destino `STOCK_USADO`, el vínculo a su movimiento ENTRADA USADO
  y el usuario que lo retiró, y ese movimiento informa el equipo de origen

#### Scenario: Registro de un descarte

- GIVEN un componente retirado con destino `DESCARTE` y motivo "placa quemada"
- WHEN se consulta el componente
- THEN informa destino `DESCARTE` y el motivo, y no tiene vínculo a ningún
  movimiento

#### Scenario: Retiro legado

- GIVEN un componente retirado antes de este cambio
- WHEN se consulta el componente tras la migración
- THEN sus campos de retiro están vacíos y no se le inventa un destino

#### Scenario: Migración aditiva

- GIVEN un tenant con componentes y movimientos previos
- WHEN se aplica la migración
- THEN ninguna fila existente se modifica ni se borra, salvo el valor por
  defecto `NUEVO` de la condición de los movimientos
