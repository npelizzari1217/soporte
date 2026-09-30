# Stock por Condición de Insumo Specification

## Purpose

Definir que todo movimiento de stock de un insumo lleva una condición (`NUEVO`
o `USADO`), que el saldo se lleva por insumo y condición a partir de una única
fórmula, y que la reposición se evalúa solo sobre el saldo `NUEVO`. No existía
una spec de stock: esta cubre únicamente lo que la condición agrega o cambia
(condición del movimiento, saldo por condición, no negatividad por condición,
alcance a repuestos, recepción de compra y reposición). Los tipos de movimiento
(ENTRADA, SALIDA, AJUSTE_POSITIVO, AJUSTE_NEGATIVO) y su dirección no cambian:
la condición es ortogonal al tipo.

## Requirements

### Requirement: Todo movimiento de stock lleva una condición

El sistema DEBE registrar en cada movimiento de stock una condición con valor
`NUEVO` o `USADO`, y NO DEBE persistir un movimiento sin condición ni con un
valor fuera de ese conjunto. Los movimientos existentes antes de este cambio
DEBEN quedar con condición `NUEVO`. Cuando un movimiento nuevo se registra sin
indicar condición, el sistema DEBE tratarla como `NUEVO`.

#### Scenario: Movimiento histórico tras la migración

- GIVEN un tenant con movimientos registrados antes de este cambio
- WHEN se aplica la migración y se consultan los movimientos
- THEN todos los movimientos previos figuran con condición `NUEVO` y el saldo
  total de cada insumo no cambia

#### Scenario: Movimiento sin condición explícita

- GIVEN un insumo con familia repuesto
- WHEN se registra una ENTRADA sin indicar condición
- THEN el movimiento queda persistido con condición `NUEVO`

#### Scenario: Valor de condición inválido

- GIVEN un insumo existente
- WHEN se registra un movimiento con una condición distinta de `NUEVO` y `USADO`
- THEN el sistema rechaza la operación y no persiste el movimiento

### Requirement: El saldo se calcula por insumo y condición con una única fórmula

El sistema DEBE calcular el saldo de un insumo como un saldo por condición
(`NUEVO` y `USADO`) y un total derivado, a partir de los movimientos del insumo
y con la fórmula única vigente (suma de entradas y ajustes positivos menos
salidas y ajustes negativos), aplicada dentro de cada condición. El total DEBE
ser la suma de los dos saldos. Una condición sin movimientos DEBE tener saldo 0.
Ningún otro componente DEBE calcular saldos con una fórmula propia.

#### Scenario: Saldos independientes por condición

- GIVEN un insumo con ENTRADA NUEVO de 10, SALIDA NUEVO de 3 y ENTRADA USADO de 2
- WHEN se consulta su saldo
- THEN el saldo NUEVO es 7, el saldo USADO es 2 y el total es 9

#### Scenario: Insumo sin movimientos USADO

- GIVEN un insumo con solo movimientos NUEVO
- WHEN se consulta su saldo
- THEN el saldo USADO es 0 y el total es igual al saldo NUEVO

### Requirement: Una salida o un ajuste negativo no deja negativo el saldo de su condición

El sistema NO DEBE registrar una SALIDA ni un AJUSTE_NEGATIVO cuya cantidad
supere el saldo de la condición indicada, aunque el total del insumo sí alcance.
La verificación DEBE hacerse sobre el saldo de esa condición, bajo el mismo
bloqueo por insumo que ya serializa los movimientos que deciden sobre el saldo,
de modo que dos operaciones concurrentes sobre el mismo insumo no puedan dejar
negativa ninguna condición. Ante el incumplimiento el sistema DEBE rechazar con
el error de stock insuficiente existente y NO DEBE persistir el movimiento.

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

### Requirement: ENTRADA y AJUSTE manuales pueden apuntar a USADO

El sistema DEBE permitir que una ENTRADA manual y un AJUSTE (positivo o
negativo) indiquen la condición `USADO`, sujeto a la regla de alcance a
repuestos. Sin condición indicada DEBEN registrarse como `NUEVO`. La condición
NO DEBE cambiar la elegibilidad vigente del insumo: la ENTRADA manual sobre un
insumo deshabilitado DEBE seguir rechazándose con cualquier condición, y el
AJUSTE conserva su regla actual, que no exige que el insumo esté habilitado. La
única exención para un insumo deshabilitado es el retiro de un componente al
stock (spec `componentes-catalogo-unico`).

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

### Requirement: La recepción de una compra siempre registra condición NUEVO

El sistema DEBE registrar la ENTRADA generada por la recepción de un ítem de
compra con condición `NUEVO`, de forma explícita, y NO DEBE permitir que el
usuario elija otra condición en ese flujo.

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

### Requirement: La condición USADO solo es válida para insumos de familia repuesto

El sistema DEBE rechazar con 422 todo movimiento con condición `USADO` sobre un
insumo cuya familia no tiene `esRepuesto = true`, en ENTRADA, SALIDA y AJUSTE, y
NO DEBE persistir el movimiento. La condición `NUEVO` DEBE seguir siendo válida
para todos los insumos. La regla DEBE aplicarse en el backend con independencia
de lo que muestre la interfaz.

#### Scenario: USADO sobre un insumo no repuesto

- GIVEN un insumo cuya familia tiene `esRepuesto = false`
- WHEN se registra una ENTRADA con condición `USADO`
- THEN el sistema responde 422 y no persiste el movimiento

#### Scenario: USADO rechazado en salida y ajuste

- GIVEN un insumo cuya familia tiene `esRepuesto = false`
- WHEN se registra una SALIDA o un AJUSTE con condición `USADO`
- THEN en ambos casos el sistema responde 422 y no persiste nada

#### Scenario: NUEVO sobre un insumo no repuesto

- GIVEN un insumo cuya familia tiene `esRepuesto = false`
- WHEN se registra una ENTRADA sin condición o con condición `NUEVO`
- THEN el movimiento queda persistido con condición `NUEVO`

### Requirement: El estado de reposición se calcula solo sobre el saldo NUEVO

El sistema DEBE evaluar el estado de reposición de un insumo (frente a su
`stockMinimo`) usando únicamente el saldo `NUEVO`. El saldo `USADO` NO DEBE
contar para el mínimo ni enmascarar la falta de piezas nuevas. El sistema NO
DEBE definir un mínimo de reposición por condición.

#### Scenario: Usados no ocultan la falta de nuevos

- GIVEN un insumo con `stockMinimo` 5, saldo NUEVO 2 y saldo USADO 10
- WHEN se consulta su estado de reposición
- THEN el estado es el de un saldo de 2 frente al mínimo de 5 (reposición
  necesaria), no el de un saldo de 12

#### Scenario: Nuevos suficientes

- GIVEN un insumo con `stockMinimo` 5, saldo NUEVO 8 y saldo USADO 0
- WHEN se consulta su estado de reposición
- THEN el estado es el de un saldo de 8 frente al mínimo de 5

### Requirement: La consulta de stock devuelve ambos saldos y el listado de movimientos muestra la condición

El sistema DEBE devolver, en la consulta de stock de un insumo, el saldo `NUEVO`,
el saldo `USADO` y el total, junto con el estado de reposición calculado sobre
`NUEVO`. El sistema DEBE incluir la condición en cada movimiento del listado de
movimientos de un insumo. La ficha del insumo DEBE mostrar ambos saldos y la
condición de cada movimiento. La forma exacta de la respuesta queda a decisión
de diseño.

#### Scenario: Consulta de stock

- GIVEN un insumo con saldo NUEVO 4 y saldo USADO 2
- WHEN se consulta su stock
- THEN la respuesta informa NUEVO 4, USADO 2 y total 6

#### Scenario: Listado de movimientos

- GIVEN un insumo con una ENTRADA NUEVO y una ENTRADA USADO
- WHEN se lista sus movimientos
- THEN cada movimiento informa su condición

#### Scenario: Ficha del insumo

- GIVEN un usuario con acceso de lectura a un insumo con saldos NUEVO y USADO
- WHEN abre la ficha del insumo
- THEN ve ambos saldos y la condición de cada movimiento
