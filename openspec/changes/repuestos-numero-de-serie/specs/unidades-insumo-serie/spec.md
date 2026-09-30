# Unidades de Insumo con Número de Serie Specification

## Purpose

Definir el seguimiento por unidad física de los insumos marcados como
serializados (`seguimiento = SERIE`): cada pieza es una unidad con serial único,
condición propia y un ciclo de vida (`EN_DEPOSITO`, `INSTALADA`, `ENTREGADA`,
`DESCARTADA`),
con corrección de serial auditada e historial por serial. Los insumos
`NINGUNO` no cambian. Los nombres de tablas, columnas y endpoints, el bloqueo, el
lugar donde viven el registro de auditoría y el historial, y la forma de validar
la unidad de medida entera son decisiones de diseño y esta spec no las fija. No
hay decisión de producto de `docs/roadmap-comercial.md` involucrada: este ciclo
no implementa un punto del roadmap.

## Requirements

### Requirement: Cada insumo tiene un modo de seguimiento NINGUNO o SERIE

El sistema DEBE guardar en cada insumo un modo de seguimiento con valor `NINGUNO`
o `SERIE`, y NO DEBE aceptar otro valor. Los insumos existentes antes de este
cambio y los creados sin indicarlo DEBEN quedar en `NINGUNO`. El modo DEBE poder
elegirse en el alta y la edición del insumo del catálogo. Un insumo `NINGUNO` NO
DEBE tener unidades y DEBE comportarse exactamente como antes de este cambio.

#### Scenario: Insumo existente tras la migración

- GIVEN un tenant con insumos y movimientos previos a este cambio
- WHEN se aplica la migración
- THEN todos los insumos figuran con seguimiento `NINGUNO` y sus saldos no cambian

#### Scenario: Valor de seguimiento inválido

- GIVEN el alta de un insumo
- WHEN se envía un seguimiento distinto de `NINGUNO` y `SERIE`
- THEN el sistema rechaza la operación y no persiste el insumo

#### Scenario: Insumo NINGUNO sin cambios

- GIVEN un insumo `NINGUNO` con saldo NUEVO 5
- WHEN se registra una ENTRADA, una SALIDA o un AJUSTE de cantidad mayor que 1 sin serial
- THEN la operación se comporta como antes y no se crea ninguna unidad

### Requirement: SERIE solo se activa con saldo cero y unidad de medida entera

El sistema DEBE rechazar el cambio de un insumo a `SERIE` si su saldo total es
distinto de cero, y NO DEBE convertir stock existente en unidades. El sistema DEBE
rechazar `SERIE` en un insumo cuya unidad de medida no es entera (por ejemplo
litros o kilos), tanto al activarlo como en el alta, y DEBE rechazar el cambio de
unidad de medida de un insumo `SERIE` a una no entera. Las reglas DEBEN aplicarse
en el backend con independencia de la interfaz. La forma de determinar qué unidad
de medida es entera queda a decisión de diseño. Un insumo `SERIE` DEBE poder
volver a `NINGUNO` solo si no tiene ninguna unidad `EN_DEPOSITO` ni `INSTALADA`
(decisión del dueño). Las unidades `ENTREGADA` y `DESCARTADA` no lo impiden, NO
DEBEN modificarse ni borrarse al volver a `NINGUNO` y conservan su historial.

#### Scenario: Activar con saldo cero

- GIVEN un insumo `NINGUNO` con saldo total 0 y unidad de medida entera
- WHEN se lo cambia a `SERIE`
- THEN el insumo queda en `SERIE` sin unidades

#### Scenario: Activar con saldo distinto de cero

- GIVEN un insumo `NINGUNO` con saldo NUEVO 0 y saldo USADO 2
- WHEN se lo cambia a `SERIE`
- THEN el sistema rechaza el cambio y el insumo sigue en `NINGUNO`

#### Scenario: Activar con unidad de medida no entera

- GIVEN un insumo con unidad de medida no entera y saldo 0
- WHEN se lo cambia a `SERIE`
- THEN el sistema rechaza el cambio

#### Scenario: Volver a NINGUNO con unidades vivas

- GIVEN un insumo `SERIE` con una unidad `EN_DEPOSITO` o una `INSTALADA`
- WHEN se lo cambia a `NINGUNO`
- THEN el sistema rechaza el cambio y las unidades no se modifican

#### Scenario: Volver a NINGUNO con unidades entregadas o descartadas

- GIVEN un insumo `SERIE` cuyas unidades están todas `ENTREGADA` o `DESCARTADA`
- WHEN se lo cambia a `NINGUNO`
- THEN el insumo queda en `NINGUNO`, las unidades conservan su estado y su historial sigue consultable

### Requirement: La unidad tiene un serial, una condición y un estado

El sistema DEBE representar cada pieza de un insumo `SERIE` como una unidad con
serial, condición (`NUEVO` o `USADO`) y un estado con valor `EN_DEPOSITO`,
`INSTALADA`, `ENTREGADA` o `DESCARTADA`, y NO DEBE aceptar valores fuera de esos
conjuntos. Una unidad `INSTALADA` DEBE referir el equipo donde está; una
`EN_DEPOSITO`, `ENTREGADA` o `DESCARTADA` NO DEBE referir equipo. Una unidad
`ENTREGADA` salió del depósito por una SALIDA manual (por ejemplo, entregada a un
sector): sigue existiendo fuera del depósito y su destino queda en el historial.
Una unidad `DESCARTADA` es una baja definitiva (pérdida, rotura, descarte). Ni
`ENTREGADA` ni `DESCARTADA` cuentan en ningún saldo.

#### Scenario: Unidad instalada refiere su equipo

- GIVEN una unidad `INSTALADA`
- WHEN se consulta la unidad
- THEN informa el equipo donde está

#### Scenario: Estado inválido

- GIVEN una unidad existente
- WHEN se intenta guardar un estado fuera de `EN_DEPOSITO`, `INSTALADA`, `ENTREGADA` y `DESCARTADA`
- THEN el sistema rechaza la operación

#### Scenario: Unidad entregada no refiere equipo ni cuenta en el saldo

- GIVEN una unidad "E1" `EN_DEPOSITO` NUEVO con serial
- WHEN se registra una SALIDA de "E1" hacia un sector
- THEN "E1" queda `ENTREGADA`, sin equipo, y el saldo NUEVO baja en 1

### Requirement: El serial es obligatorio, se normaliza y es único por insumo

El sistema DEBE exigir un serial en toda unidad de un insumo `SERIE`, salvo la
unidad en serie pendiente (ver requerimiento siguiente). El sistema DEBE
normalizar el serial para comparar (sin distinguir mayúsculas ni minúsculas y sin
considerar espacios) y DEBE rechazar un serial que, normalizado, ya exista en el
mismo insumo, sin importar el estado de la unidad existente (incluida
`DESCARTADA`). La unicidad NO DEBE extenderse entre insumos distintos. El serial
DEBE conservar la forma con que el usuario lo cargó para mostrarse. La
normalización tiene una única fuente en el dominio del backend.

#### Scenario: Serial duplicado con otra capitalización

- GIVEN un insumo `SERIE` con una unidad de serial "AB 123"
- WHEN se intenta crear otra unidad con serial "ab123"
- THEN el sistema rechaza la operación y no persiste nada

#### Scenario: Serial duplicado de una unidad descartada

- GIVEN un insumo `SERIE` con una unidad `DESCARTADA` de serial "X1"
- WHEN se intenta crear otra unidad con serial "x1"
- THEN el sistema rechaza la operación

#### Scenario: Mismo serial en otro insumo

- GIVEN un insumo `SERIE` A con una unidad de serial "X1"
- WHEN se crea una unidad de serial "X1" en otro insumo `SERIE` B
- THEN la unidad queda creada

#### Scenario: Serial vacío

- GIVEN el alta de una unidad con serial informado
- WHEN el serial es vacío o solo espacios
- THEN el sistema rechaza la operación

#### Scenario: Concurrencia con el mismo serial

- GIVEN un insumo `SERIE` sin unidades
- WHEN dos operaciones concurrentes intentan crear una unidad con el mismo serial normalizado
- THEN exactamente una queda persistida y la otra se rechaza

### Requirement: Las unidades sin serial entran como serie pendiente

El sistema DEBE permitir que una recepción de compra de un insumo `SERIE` se
complete con unidades sin serial. Cada una DEBE crearse `EN_DEPOSITO`, condición
`NUEVO`, marcada como serie pendiente, y DEBE contar en el saldo. Una unidad en
serie pendiente NO DEBE poder instalarse en un equipo ni salir del depósito
(salida ni ajuste negativo) hasta que se le cargue un serial. La unidad en serie
pendiente NO DEBE participar de la unicidad de serial. Una unidad con serial
cargado NO DEBE volver a serie pendiente.

#### Scenario: Recepción sin seriales

- GIVEN un insumo `SERIE` con recepción pendiente de 3 unidades
- WHEN se registra la recepción sin ningún serial
- THEN la recepción queda completa, existen 3 unidades `EN_DEPOSITO` `NUEVO` en serie pendiente y el saldo NUEVO aumenta en 3

#### Scenario: Instalar una unidad pendiente

- GIVEN una unidad en serie pendiente
- WHEN se intenta instalarla en un equipo o darle salida
- THEN el sistema rechaza la operación y la unidad no cambia

#### Scenario: Selector sin pendientes

- GIVEN un insumo `SERIE` con una unidad con serial y otra pendiente
- WHEN el usuario abre el selector de unidades para instalar o dar salida
- THEN solo se ofrece la unidad con serial

### Requirement: El serial pendiente se completa desde la ficha del insumo

El sistema DEBE permitir cargar el serial de una unidad en serie pendiente desde
el detalle de las unidades del insumo, con las mismas validaciones de obligatoriedad,
normalización y unicidad. Al cargarlo, la unidad DEBE quedar disponible para
instalar y dar salida. Cargar un serial pendiente NO DEBE requerir motivo ni
generar un movimiento de stock, pero DEBE quedar en el historial de la unidad.

#### Scenario: Completar un serial pendiente

- GIVEN una unidad en serie pendiente
- WHEN el usuario carga el serial "SN-77" desde la ficha
- THEN la unidad tiene serial "SN-77", puede instalarse y el saldo no cambia

#### Scenario: Completar con un serial repetido

- GIVEN una unidad pendiente y otra unidad del mismo insumo con serial "SN-77"
- WHEN se carga "sn-77" en la pendiente
- THEN el sistema rechaza la operación y la unidad sigue pendiente

### Requirement: La condición es propiedad de la unidad y el saldo SERIE cuenta unidades

Para un insumo `SERIE`, el sistema DEBE guardar la condición en la unidad. Su
saldo por condición DEBE ser la cantidad de unidades `EN_DEPOSITO` de esa
condición, incluidas las de serie pendiente, y el total la suma de ambos. Las
unidades `INSTALADA`, `ENTREGADA` y `DESCARTADA` NO DEBEN contar. El saldo `NUEVO`
sigue siendo el único que evalúa la reposición.

#### Scenario: Saldo por condición

- GIVEN un insumo `SERIE` con 3 unidades `EN_DEPOSITO` NUEVO (una pendiente), 2 `EN_DEPOSITO` USADO, 1 `INSTALADA`, 1 `ENTREGADA` y 1 `DESCARTADA`
- WHEN se consulta su stock
- THEN el saldo NUEVO es 3, el saldo USADO es 2 y el total es 5

#### Scenario: Reposición sobre NUEVO

- GIVEN un insumo `SERIE` con `stockMinimo` 4, 2 unidades NUEVO y 6 USADO `EN_DEPOSITO`
- WHEN se consulta su estado de reposición
- THEN el estado es el de un saldo de 2 frente al mínimo de 4

### Requirement: La corrección de un serial exige motivo y queda auditada

El sistema DEBE permitir corregir el serial de una unidad con serial, en
cualquier estado, y DEBE exigir un motivo de texto libre no vacío de a lo sumo 500
caracteres (misma normalización que el motivo de los movimientos de insumo). El
nuevo serial DEBE cumplir la obligatoriedad y la unicidad normalizada. El sistema
DEBE registrar la corrección con el serial anterior, el nuevo, el motivo, el
usuario y la fecha, y NO DEBE modificar el saldo ni generar un movimiento de
stock. Sin motivo o ante un serial inválido, DEBE rechazar sin cambiar nada. El
lugar del registro y el permiso requerido quedan a decisión de diseño.

#### Scenario: Corrección válida

- GIVEN una unidad con serial "SN-1" y ninguna otra con "SN-2"
- WHEN se corrige a "SN-2" con motivo "error de tipeo en la recepción"
- THEN la unidad queda con "SN-2", existe un registro con "SN-1", "SN-2", motivo, usuario y fecha, y el saldo no cambia

#### Scenario: Corrección sin motivo

- GIVEN una unidad con serial
- WHEN se corrige el serial con motivo vacío, solo espacios o de más de 500 caracteres
- THEN el sistema rechaza la operación y el serial no cambia

#### Scenario: Corrección a un serial existente

- GIVEN dos unidades del mismo insumo con seriales "A" y "B"
- WHEN se corrige "A" a "b" con motivo
- THEN el sistema rechaza la operación y ambos seriales siguen igual

#### Scenario: Corregir una unidad instalada

- GIVEN una unidad `INSTALADA` en un equipo
- WHEN se corrige su serial con motivo
- THEN el serial cambia, la unidad sigue instalada y queda el registro

### Requirement: Cada unidad tiene un historial consultable por serial

El sistema DEBE mostrar, por unidad, su historial cronológico desde este cambio en
adelante: ingreso (recepción, entrada, ajuste o alta sin descuento), cada equipo
donde estuvo instalada, cada retiro con su destino y motivo, la entrega por una
SALIDA con su destino (el sector o el equipo que la salida informa, y su motivo si
lo tiene; este cambio no agrega un campo de destinatario), el descarte o la baja
por ajuste negativo con su motivo, las correcciones de serial y la carga de un
serial pendiente. El sistema NO DEBE
reconstruir historia anterior a este cambio. La ficha del insumo DEBE permitir
ver las unidades con su serial, condición y estado, y abrir el historial de cada
una. Dónde vive el historial (registro propio o derivado del libro) queda a
decisión de diseño.

#### Scenario: Vida completa de una unidad

- GIVEN una unidad recibida, instalada en el equipo E1, retirada al stock y luego instalada en E2
- WHEN se abre su historial
- THEN muestra el ingreso, la instalación en E1, el retiro al stock como USADO y la instalación en E2, en ese orden

#### Scenario: Historial de una unidad descartada

- GIVEN una unidad instalada y luego retirada con `DESCARTE` y motivo "placa quemada"
- WHEN se abre su historial
- THEN muestra el descarte con su motivo y la unidad figura `DESCARTADA`

#### Scenario: Historial de una unidad entregada

- GIVEN una unidad recibida y luego entregada por una SALIDA al sector "Administración"
- WHEN se abre su historial
- THEN muestra el ingreso y la entrega con el sector "Administración", y la unidad figura `ENTREGADA`

#### Scenario: Unidad sin historia anterior

- GIVEN una unidad creada por este cambio
- WHEN se abre su historial
- THEN no muestra eventos anteriores a su creación

### Requirement: El saldo de las unidades coincide con el libro de movimientos

El sistema DEBE mantener, para todo insumo `SERIE` y cada condición, la igualdad
entre la cantidad de unidades `EN_DEPOSITO` y el saldo que resulta de sumar sus
movimientos. Toda mutación de una unidad que cambia el saldo DEBE ocurrir en la
misma transacción que su movimiento, bajo el bloqueo por insumo existente; si una
falla, ninguna DEBE quedar. Dos operaciones concurrentes NO DEBEN poder tomar la
misma unidad. Un spec de integración DEBE verificar el invariante.

#### Scenario: Invariante tras una secuencia de operaciones

- GIVEN un insumo `SERIE` sin unidades
- WHEN se reciben 3 unidades, se instala una, se la retira al stock, se entrega otra por SALIDA y se descarta la tercera por ajuste negativo
- THEN en cada paso las unidades `EN_DEPOSITO` por condición igualan el saldo del libro

#### Scenario: Concurrencia sobre la misma unidad

- GIVEN una unidad `EN_DEPOSITO` con serial
- WHEN dos operaciones concurrentes intentan instalarla o darle salida
- THEN exactamente una se completa y la otra se rechaza sin cambiar nada

#### Scenario: Falla parcial

- GIVEN una operación que cambia el estado de una unidad y registra su movimiento
- WHEN el movimiento falla
- THEN la unidad conserva su estado anterior

### Requirement: Las operaciones de unidad son reutilizables en lote

Las operaciones que mueven una unidad entre estados (instalar, devolver al
depósito, descartar) DEBERÍAN poder aplicarse a varias unidades dentro de una
misma transacción, con reversión total si una falla y sin depender del flujo de
un componente individual, para que el ciclo futuro de baja de equipo completo las
reutilice. Ese ciclo solo lleva unidades `INSTALADA` a `EN_DEPOSITO` `USADO` o a
`DESCARTADA`; la entrega (`ENTREGADA`) es propia de la SALIDA manual desde el
depósito y no forma parte de la baja de equipo. La forma de la interfaz queda a
decisión de diseño. Este cambio NO DEBE implementar la baja de equipo completo.

#### Scenario: Varias unidades en una transacción

- GIVEN un equipo con dos unidades `INSTALADA`
- WHEN se devuelven ambas al depósito mediante la operación de unidad en una sola transacción
- THEN ambas quedan `EN_DEPOSITO` `USADO` con su serial

#### Scenario: Falla en una del lote

- GIVEN un lote donde una de las unidades ya no está `INSTALADA`
- WHEN se aplica la operación
- THEN se rechaza el lote y ninguna unidad cambia

### Requirement: Los componentes legados conservan su serial de texto y no reciben unidad

El sistema NO DEBE crear unidades a partir de componentes instalados antes de este
cambio ni migrar su serial de texto a un serial de unidad. El serial de texto libre
de un componente legado DEBE conservarse y seguir siendo editable. La migración
DEBE ser aditiva.

#### Scenario: Migración con componentes previos

- GIVEN un tenant con componentes que tienen serial de texto
- WHEN se aplica la migración
- THEN ningún componente recibe unidad, sus seriales de texto quedan iguales y no se borra ninguna fila

#### Scenario: Editar el serial de un componente legado

- GIVEN un componente legado sin unidad
- WHEN se edita su serial de texto
- THEN el dato se actualiza sin unicidad ni motivo
