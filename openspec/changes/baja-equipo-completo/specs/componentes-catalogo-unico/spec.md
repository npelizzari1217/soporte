# Delta for Componentes con Catálogo Único

## MODIFIED Requirements

### Requirement: Reactivar un componente depende del destino de su retiro

El sistema NO DEBE permitir reactivar un componente cuyo retiro tuvo destino
`STOCK_USADO`, para evitar contar la pieza en el equipo y en el depósito a la
vez; ante el intento DEBE rechazar sin cambiar nada. El sistema DEBE permitir
reactivar un componente retirado con destino `DESCARTE` y un componente cuyo
retiro es legado (anterior a este cambio, sin destino). Para volver a instalar
una pieza devuelta al stock se usa el alta con descuento de saldo USADO. Al
reactivar un componente descartado vinculado a una unidad, la unidad `DESCARTADA`
DEBE volver a `INSTALADA` en el mismo equipo, en la misma transacción, sin
movimiento y sin cambio de saldo; el componente y la unidad NO DEBEN quedar en
estados inconsistentes. Si el insumo del componente ya no está en `SERIE`, el
sistema DEBE rechazar la reactivación de un componente con unidad sin cambiar
nada. La reactivación de un componente con unidad DEBE exigir que la unidad siga
`DESCARTADA` por el descarte de ese mismo componente; si la unidad se recuperó al
depósito, se instaló en otro equipo o se dio de baja por otra vía, el sistema DEBE
rechazar la reactivación sin cambiar nada, y para volver a instalar la pieza se
usa el alta con descuento eligiendo la unidad. Reactivar un componente legado sin
unidad NO DEBE crear una unidad. El sistema NO DEBE permitir reactivar un
componente de un equipo dado de baja, cualquiera sea el destino de su retiro,
porque la baja del equipo es definitiva (spec `equipos-baja-completa`); ante el
intento DEBE rechazar sin cambiar nada.
(Previously: no existía la excepción del equipo dado de baja; un componente retirado con DESCARTE de un equipo con activo=false podía reactivarse.)

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

#### Scenario: Reactivar un componente con unidad descartada

- GIVEN un componente retirado con `DESCARTE` cuya unidad "S1" está `DESCARTADA`
- WHEN se lo reactiva
- THEN el componente está activo, "S1" está `INSTALADA` en el mismo equipo, no hay movimientos nuevos y los saldos no cambian

#### Scenario: Reactivar un componente con unidad de un insumo que volvió a NINGUNO

- GIVEN un componente retirado con `DESCARTE` cuya unidad "S1" está `DESCARTADA`, y su insumo cambiado a `NINGUNO`
- WHEN se intenta reactivarlo
- THEN el sistema rechaza la reactivación, el componente sigue retirado y "S1" sigue `DESCARTADA`

#### Scenario: Reactivar un componente cuya unidad se recuperó

- GIVEN un componente retirado con `DESCARTE` cuya unidad "S1" se recuperó después al depósito
- WHEN se intenta reactivar el componente
- THEN el sistema rechaza la reactivación, el componente sigue retirado y "S1" sigue `EN_DEPOSITO`

#### Scenario: Reactivar un componente legado sin unidad

- GIVEN un componente legado retirado con `DESCARTE`, de un insumo `SERIE`
- WHEN se lo reactiva
- THEN el componente vuelve a estar activo y no se crea ninguna unidad

#### Scenario: Reactivar un componente de un equipo dado de baja

- GIVEN un equipo dado de baja con destino `DESCARTE` y un componente retirado con `DESCARTE` cuya unidad "S1" está `DESCARTADA`
- WHEN se intenta reactivar el componente
- THEN el sistema rechaza la reactivación, el componente sigue retirado y "S1" sigue `DESCARTADA`
