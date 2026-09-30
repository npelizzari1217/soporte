# Delta for Stock por Condición de Insumo

Para los insumos `NINGUNO` no cambia nada. Para los insumos `SERIE` (spec
`unidades-insumo-serie`) el saldo sale de las unidades y cada movimiento
referencia exactamente una unidad con cantidad 1. Decisión del dueño: una SALIDA
manual de un insumo `SERIE` (por ejemplo, la entrega de una pieza a un sector)
deja la unidad elegida `ENTREGADA`, porque la pieza sigue existiendo fuera del
depósito; un AJUSTE_NEGATIVO (pérdida, rotura) la deja `DESCARTADA`.

## ADDED Requirements

### Requirement: Todo movimiento de un insumo SERIE referencia una unidad con cantidad 1

El sistema DEBE registrar cada movimiento de un insumo `SERIE` con exactamente
una unidad y cantidad 1, y NO DEBE persistir un movimiento de un insumo `SERIE`
sin unidad, con más de una, ni con cantidad distinta de 1. Un movimiento de un
insumo `NINGUNO` NO DEBE referenciar unidad. Una operación sobre N piezas DEBE
generar N movimientos, uno por unidad, en una sola transacción. La condición del
movimiento DEBE ser la condición de su unidad. Los movimientos existentes antes de
este cambio NO DEBEN modificarse.

#### Scenario: Entrada de varias piezas

- GIVEN un insumo `SERIE`
- WHEN se registra una ENTRADA con 3 seriales distintos
- THEN existen 3 unidades `EN_DEPOSITO` y 3 movimientos ENTRADA de cantidad 1, cada uno con su unidad

#### Scenario: Movimiento sin unidad

- GIVEN un insumo `SERIE`
- WHEN se intenta registrar un movimiento sin unidad o con cantidad 2
- THEN el sistema rechaza la operación y no persiste el movimiento

#### Scenario: Insumo NINGUNO con unidad

- GIVEN un insumo `NINGUNO`
- WHEN se intenta registrar un movimiento que referencia una unidad
- THEN el sistema rechaza la operación

## MODIFIED Requirements

### Requirement: El saldo se calcula por insumo y condición con una única fórmula

El sistema DEBE calcular el saldo de un insumo como un saldo por condición
(`NUEVO` y `USADO`) y un total derivado, a partir de los movimientos del insumo
y con la fórmula única vigente (suma de entradas y ajustes positivos menos
salidas y ajustes negativos), aplicada dentro de cada condición. El total DEBE
ser la suma de los dos saldos. Una condición sin movimientos DEBE tener saldo 0.
Ningún otro componente DEBE calcular saldos con una fórmula propia. Para un
insumo `SERIE`, el saldo de cada condición DEBE ser la cantidad de unidades
`EN_DEPOSITO` de esa condición, y DEBE coincidir con el resultado de la fórmula
sobre los movimientos.
(Previously: el saldo se calculaba solo desde los movimientos; ahora, en insumos SERIE, es la cuenta de unidades y debe coincidir con el libro.)

#### Scenario: Saldos independientes por condición

- GIVEN un insumo con ENTRADA NUEVO de 10, SALIDA NUEVO de 3 y ENTRADA USADO de 2
- WHEN se consulta su saldo
- THEN el saldo NUEVO es 7, el saldo USADO es 2 y el total es 9

#### Scenario: Insumo sin movimientos USADO

- GIVEN un insumo con solo movimientos NUEVO
- WHEN se consulta su saldo
- THEN el saldo USADO es 0 y el total es igual al saldo NUEVO

#### Scenario: Saldo de un insumo SERIE

- GIVEN un insumo `SERIE` con 4 unidades `EN_DEPOSITO` NUEVO, 1 `INSTALADA` y 2 `EN_DEPOSITO` USADO
- WHEN se consulta su saldo
- THEN el saldo NUEVO es 4, el saldo USADO es 2, el total es 6 y coincide con la fórmula del libro

### Requirement: Una salida o un ajuste negativo no deja negativo el saldo de su condición

El sistema NO DEBE registrar una SALIDA ni un AJUSTE_NEGATIVO cuya cantidad
supere el saldo de la condición indicada, aunque el total del insumo sí alcance.
La verificación DEBE hacerse sobre el saldo de esa condición, bajo el mismo
bloqueo por insumo que ya serializa los movimientos que deciden sobre el saldo,
de modo que dos operaciones concurrentes sobre el mismo insumo no puedan dejar
negativa ninguna condición. Ante el incumplimiento el sistema DEBE rechazar con
el error de stock insuficiente existente y NO DEBE persistir el movimiento. En un
insumo `SERIE`, la SALIDA y el AJUSTE_NEGATIVO DEBEN elegir una unidad
`EN_DEPOSITO`, con serial, de la condición indicada; NO DEBEN aceptar una unidad
en serie pendiente, `INSTALADA`, `ENTREGADA` ni `DESCARTADA`. Con la SALIDA la
unidad elegida pasa a `ENTREGADA` y el historial registra su destino (el sector o
el equipo que la salida informa, y su motivo si lo tiene); con el AJUSTE_NEGATIVO
pasa a `DESCARTADA`. Un AJUSTE_NEGATIVO de un insumo `SERIE` DEBE exigir un motivo no
vacío.
(Previously: sin elección de unidad; ahora, en insumos SERIE, se elige una unidad en depósito con serial y el ajuste negativo exige motivo.)

#### Scenario: Salida mayor que el saldo de su condición

- GIVEN un insumo con saldo NUEVO 0 y saldo USADO 5
- WHEN se registra una SALIDA NUEVO de 1
- THEN el sistema rechaza por stock insuficiente y el saldo no cambia

#### Scenario: Ajuste negativo mayor que el saldo de su condición

- GIVEN un insumo con saldo NUEVO 10 y saldo USADO 1
- WHEN se registra un AJUSTE_NEGATIVO USADO de 2
- THEN el sistema rechaza por stock insuficiente y el saldo USADO sigue en 1

#### Scenario: Salida dentro del saldo de su condición

- GIVEN un insumo con saldo NUEVO 0 y saldo USADO 5
- WHEN se registra una SALIDA USADO de 2
- THEN el movimiento queda persistido, el saldo USADO es 3 y el saldo NUEVO
  sigue en 0

#### Scenario: Operaciones concurrentes sobre la misma condición

- GIVEN un insumo con saldo USADO 1
- WHEN dos SALIDA USADO de 1 se registran de forma concurrente
- THEN exactamente una queda persistida, la otra se rechaza por stock
  insuficiente y el saldo USADO final es 0

#### Scenario: Salida de una unidad elegida por serial

- GIVEN un insumo `SERIE` con las unidades "A1" y "A2" `EN_DEPOSITO` NUEVO
- WHEN se registra una SALIDA NUEVO eligiendo la unidad "A1" con destino el sector "Administración"
- THEN existe un movimiento SALIDA de cantidad 1 de "A1" con ese sector, "A1" queda `ENTREGADA` y el saldo NUEVO es 1

#### Scenario: Salida sin elegir unidad o con unidad no disponible

- GIVEN un insumo `SERIE` con una unidad pendiente, una `INSTALADA` y una `EN_DEPOSITO` con serial
- WHEN se registra una SALIDA sin unidad, o con la pendiente o la `INSTALADA`
- THEN el sistema rechaza la operación y no cambia nada

#### Scenario: Ajuste negativo con unidad y motivo

- GIVEN un insumo `SERIE` con la unidad "B1" `EN_DEPOSITO` USADO
- WHEN se registra un AJUSTE_NEGATIVO USADO eligiendo "B1" con motivo "pieza extraviada"
- THEN se registra el movimiento con motivo, "B1" queda `DESCARTADA` y el saldo USADO baja en 1

#### Scenario: Ajuste negativo SERIE sin motivo

- GIVEN un insumo `SERIE` con una unidad `EN_DEPOSITO`
- WHEN se registra un AJUSTE_NEGATIVO eligiendo la unidad sin motivo o con motivo vacío
- THEN el sistema rechaza la operación y la unidad no cambia

### Requirement: ENTRADA y AJUSTE manuales pueden apuntar a USADO

El sistema DEBE permitir que una ENTRADA manual y un AJUSTE (positivo o
negativo) indiquen la condición `USADO`, sujeto a la regla de alcance a
repuestos. Sin condición indicada DEBEN registrarse como `NUEVO`. La condición
NO DEBE cambiar la elegibilidad vigente del insumo: la ENTRADA manual sobre un
insumo deshabilitado DEBE seguir rechazándose con cualquier condición, y el
AJUSTE conserva su regla actual, que no exige que el insumo esté habilitado. La
única exención para un insumo deshabilitado es el retiro de un componente al
stock (spec `componentes-catalogo-unico`). En un insumo `SERIE`, la ENTRADA y el
AJUSTE_POSITIVO DEBEN informar un serial nuevo por cada pieza, cumpliendo la
unicidad normalizada, y crear una unidad `EN_DEPOSITO` con la condición
indicada; el AJUSTE_POSITIVO DEBE exigir un motivo no vacío. La ENTRADA manual de
un insumo `SERIE` NO DEBE aceptar piezas sin serial.
(Previously: ENTRADA y AJUSTE_POSITIVO operaban solo por cantidad; ahora, en insumos SERIE, exigen un serial nuevo por pieza y el ajuste positivo un motivo.)

#### Scenario: Entrada manual USADO de un insumo deshabilitado sigue rechazada

- GIVEN un insumo de familia repuesto que está deshabilitado
- WHEN se registra una ENTRADA manual con condición `USADO`
- THEN el sistema la rechaza por insumo deshabilitado y no persiste el
  movimiento

#### Scenario: Entrada manual de usados

- GIVEN un insumo de familia repuesto
- WHEN se registra una ENTRADA con condición `USADO` de 3
- THEN el movimiento queda con condición `USADO` y el saldo USADO aumenta en 3

#### Scenario: Ajuste positivo de usados

- GIVEN un insumo de familia repuesto con saldo USADO 1
- WHEN se registra un AJUSTE_POSITIVO con condición `USADO` de 2
- THEN el saldo USADO es 3 y el saldo NUEVO no cambia

#### Scenario: Entrada manual SERIE con seriales

- GIVEN un insumo `SERIE` de familia repuesto
- WHEN se registra una ENTRADA `USADO` con los seriales "U1" y "U2"
- THEN existen dos unidades `EN_DEPOSITO` USADO y el saldo USADO aumenta en 2

#### Scenario: Entrada manual SERIE sin serial o repetido

- GIVEN un insumo `SERIE` con una unidad de serial "U1"
- WHEN se registra una ENTRADA sin serial, o con el serial "u1"
- THEN el sistema rechaza la operación y no persiste nada

#### Scenario: Ajuste positivo SERIE

- GIVEN un insumo `SERIE`
- WHEN se registra un AJUSTE_POSITIVO con serial nuevo "P1" y motivo "hallazgo en inventario"
- THEN se crea la unidad "P1" `EN_DEPOSITO`, el movimiento lleva el motivo y el saldo aumenta en 1

#### Scenario: Ajuste positivo SERIE sin motivo

- GIVEN un insumo `SERIE`
- WHEN se registra un AJUSTE_POSITIVO con serial nuevo y sin motivo
- THEN el sistema rechaza la operación y no crea la unidad

### Requirement: La recepción de una compra siempre registra condición NUEVO

El sistema DEBE registrar la ENTRADA generada por la recepción de un ítem de
compra con condición `NUEVO`, de forma explícita, y NO DEBE permitir que el
usuario elija otra condición en ese flujo. En un insumo `SERIE`, la recepción
DEBE crear una unidad `EN_DEPOSITO` `NUEVO` por cada pieza recibida, con el
serial informado o en serie pendiente cuando no se informa, y registrar un
movimiento ENTRADA de cantidad 1 por unidad. La cantidad recibida de un insumo
`SERIE` DEBE ser un entero; una recepción con cantidad fraccional DEBE
rechazarse. Los seriales informados DEBEN ser únicos entre sí y respecto del
insumo. Una recepción parcial DEBE crear solo las unidades de la cantidad
recibida en esa operación. La recepción es completa aunque queden unidades en
serie pendiente.
(Previously: la recepción generaba una ENTRADA NUEVO por cantidad; ahora, en insumos SERIE, genera una unidad por pieza, con serial o pendiente.)

#### Scenario: Recepción de compra

- GIVEN un ítem de compra pendiente de recepción de un insumo repuesto
- WHEN se registra su recepción
- THEN la ENTRADA generada tiene condición `NUEVO` y el saldo USADO no cambia

#### Scenario: El flujo de recepción no acepta condición

- GIVEN el flujo de recepción de un ítem de compra
- WHEN el request incluye una condición `USADO`
- THEN la ENTRADA generada queda igualmente en `NUEVO` o el request se rechaza
  (el manejo del campo sobrante, ignorar o rechazar, queda a decisión de
  diseño), y nunca se registra `USADO`

#### Scenario: Recepción SERIE con todos los seriales

- GIVEN un ítem de compra de 2 unidades de un insumo `SERIE`
- WHEN se registra la recepción con los seriales "R1" y "R2"
- THEN existen 2 unidades `EN_DEPOSITO` NUEVO con esos seriales y 2 movimientos ENTRADA de cantidad 1

#### Scenario: Recepción SERIE con seriales parciales

- GIVEN un ítem de compra de 3 unidades de un insumo `SERIE`
- WHEN se registra la recepción con un solo serial "R1"
- THEN la recepción queda completa, existen 3 unidades (una con "R1", dos en serie pendiente) y el saldo NUEVO aumenta en 3

#### Scenario: Recepción SERIE con serial repetido

- GIVEN un ítem de compra de 2 unidades de un insumo `SERIE`
- WHEN se registra la recepción con los seriales "R1" y "r1"
- THEN el sistema rechaza la recepción y no se crea ninguna unidad ni movimiento

#### Scenario: Recepción SERIE fraccional

- GIVEN un ítem de compra de un insumo `SERIE`
- WHEN se intenta recibir una cantidad fraccional
- THEN el sistema rechaza la recepción y no cambia nada
