# Baja de equipo completo Specification

## Purpose

Definir la baja de un equipo entero: una operación atómica, todo o nada, con dos
destinos (devolver todas las piezas al stock como `USADO`, o descartarlas todas),
una misma leyenda en todas las piezas, y un equipo que queda fuera de servicio con
su historial visible. Incluye la corrección del borrado actual, que hoy deja
unidades `INSTALADA` huérfanas.

## Decisión de producto citada

Fuente: `docs/roadmap-comercial.md`, sección "Decisiones de producto ya cerradas",
viñeta "Baja de equipo completo" (decisiones del dueño del 2026-10-01). Cada
sub-viñeta es un requerimiento de esta spec:

| Sub-viñeta | Requerimiento |
|---|---|
| Dos opciones, todo o nada; misma leyenda | R1, R2, R3, R4 |
| Motivo: categoría + texto; "otra" exige texto | R5 |
| Definitiva | R8 |
| Tickets abiertos: se permite con aviso | R10 |
| Visibilidad, "Baja", filtro, ficha, no agregar ni editar | R8, R11 |
| Permiso `EQUIPOS:BORRADO` | R12 |
| Descartar todo no deja asiento negativo | R3 |
| Borrado solo para equipos por error; botón renombrado | R13 |
| Serial de legados; insumo borrado frena y se informa | R6, R7 |
| Confirmación: resumen; nombre del equipo para descartar | R14 |

Atomicidad, equipo sin piezas o ya dado de baja, concurrencia y casos borde: R6,
R9, R15, R16, R17.

**No se implementa** (declarado de antemano, con motivo): destinos mezclados por
pieza (el dueño puede retirar piezas sueltas antes de la baja); deshacer o reactivar
un equipo dado de baja (la baja es definitiva); un permiso nuevo (se reusa
`EQUIPOS:BORRADO`); un asiento negativo de stock; un flujo de aprobación. Ver R17.
La categoría estructurada vive en el equipo; las piezas llevan solo la leyenda.

## Requirements

### Requirement: R1. La baja tiene dos destinos y es todo o nada

El sistema DEBE ofrecer la baja de un equipo vigente con exactamente un destino para
todas sus piezas activas: `STOCK_USADO` (devolver al stock como `USADO`) o `DESCARTE`
(descartar). NO DEBE aceptar otro valor ni un destino por pieza. Todas las piezas
activas del equipo DEBEN recibir el mismo destino.

#### Scenario: Destino inválido

- GIVEN un equipo vigente con dos componentes activos
- WHEN se solicita la baja con destino "REGALO"
- THEN el sistema rechaza la solicitud y el equipo, los componentes, las unidades y los movimientos no cambian

#### Scenario: Todas las piezas con el mismo destino

- GIVEN un equipo vigente con tres componentes activos
- WHEN se da de baja con destino `DESCARTE`
- THEN los tres componentes quedan retirados con `bajaDestino = DESCARTE` y ninguno con otro destino

### Requirement: R2. Devolver al stock (opción A) por tipo de pieza

Con destino `STOCK_USADO`, el sistema DEBE, en la misma transacción que marca el
equipo: para cada componente de un insumo `NINGUNO`, registrar una ENTRADA `USADO`
de cantidad 1 con el `equipoId` de origen, el usuario y la leyenda como motivo, y
enlazarla al componente; para cada componente con unidad de un insumo `SERIE`,
pasar la unidad `INSTALADA` a `EN_DEPOSITO` condición `USADO`, sin equipo y con su
serial, registrar su evento `RETIRO_A_DEPOSITO` y una ENTRADA `USADO` de cantidad 1
que referencia la unidad, con la leyenda en el evento y en la ENTRADA. El saldo
`USADO` de cada insumo DEBE aumentar en la cantidad de piezas devueltas. El sistema
DEBE admitir un insumo deshabilitado y una familia dada de baja o deshabilitada
(misma exención que el retiro de un componente).

#### Scenario: Insumo NINGUNO

- GIVEN un equipo "PC-1" con un componente activo de un insumo `NINGUNO` con saldo USADO 0
- WHEN se da de baja con destino `STOCK_USADO`
- THEN existe una ENTRADA `USADO` de cantidad 1 con `equipoId` de "PC-1" y la leyenda como motivo, el saldo USADO es 1 y el componente queda retirado con `STOCK_USADO` enlazado a esa ENTRADA

#### Scenario: Dos componentes del mismo insumo NINGUNO

- GIVEN un equipo con dos componentes activos del mismo insumo `NINGUNO`
- WHEN se da de baja con destino `STOCK_USADO`
- THEN existen dos ENTRADAs `USADO` de cantidad 1, cada una enlazada a su componente, y el saldo USADO aumenta en 2

#### Scenario: Unidad SERIE

- GIVEN un componente activo vinculado a la unidad "S1" `INSTALADA` en el equipo
- WHEN se da de baja con destino `STOCK_USADO`
- THEN "S1" queda `EN_DEPOSITO` `USADO` sin equipo y con su serial, existe el evento `RETIRO_A_DEPOSITO` de "S1" con la leyenda, existe una ENTRADA `USADO` de cantidad 1 que referencia "S1" y el saldo USADO del insumo aumenta en 1

#### Scenario: Insumo deshabilitado

- GIVEN un componente activo cuyo insumo `NINGUNO` está deshabilitado
- WHEN se da de baja el equipo con destino `STOCK_USADO`
- THEN la baja se completa y el saldo USADO de ese insumo aumenta en 1

### Requirement: R3. Descartar todo (opción B) sin asiento de stock

Con destino `DESCARTE`, el sistema DEBE marcar todos los componentes activos como
retirados con ese destino y, para cada componente con unidad, pasar la unidad
`INSTALADA` a `DESCARTADA` con su evento `DESCARTE` y la leyenda. NO DEBE registrar
ningún movimiento de stock (ni ENTRADA, ni asiento negativo) y NO DEBE cambiar
ningún saldo. Un insumo dado de baja lógica NO DEBE impedir el descarte.

#### Scenario: Descartar piezas NINGUNO y SERIE

- GIVEN un equipo con un componente de un insumo `NINGUNO` (saldo USADO 2) y otro vinculado a la unidad "S1" `INSTALADA`
- WHEN se da de baja con destino `DESCARTE`
- THEN "S1" queda `DESCARTADA` con su evento `DESCARTE` y la leyenda, ambos componentes quedan retirados con `DESCARTE`, no se crea ningún movimiento y el saldo USADO sigue en 2

#### Scenario: Sin asiento negativo

- GIVEN un equipo con un componente de un insumo `NINGUNO` con saldo NUEVO 3 y USADO 0
- WHEN se da de baja con destino `DESCARTE`
- THEN el número de movimientos del insumo no cambia y sus saldos NUEVO y USADO siguen en 3 y 0

#### Scenario: Insumo borrado no bloquea el descarte

- GIVEN un componente activo cuyo insumo tiene baja lógica
- WHEN se da de baja el equipo con destino `DESCARTE`
- THEN la baja se completa y el componente queda retirado con `DESCARTE`

### Requirement: R4. Una única leyenda compuesta en todas las piezas

El sistema DEBE componer una única leyenda con el formato
`Baja del equipo «<nombre>» — <Categoría>` seguida de `: <texto>` cuando hay texto
libre (categorías visibles `Vejez`, `Donación`, `Rotura`, `Otra`) y DEBE guardar
exactamente ese mismo texto en `bajaMotivo` de cada componente, en el motivo de cada
ENTRADA (opción A) y en el motivo de cada evento de unidad. La leyenda NO DEBE
superar 500 caracteres. Si la leyenda compuesta supera 500 caracteres, el sistema
DEBE rechazar la baja entera con un error de validación que informa cuántos
caracteres admite el texto libre, sin truncar y sin cambiar nada.

#### Scenario: Misma leyenda en los tres lugares

- GIVEN el equipo "PC-Caja-3" con un componente `NINGUNO` y otro con unidad "S1"
- WHEN se da de baja con destino `STOCK_USADO`, categoría `DONACION` y texto "a la escuela N° 12"
- THEN `bajaMotivo` de ambos componentes, el motivo de ambas ENTRADAs y el motivo del evento de "S1" son idénticos a `Baja del equipo «PC-Caja-3» — Donación: a la escuela N° 12`

#### Scenario: Leyenda sin texto libre

- GIVEN un equipo "PC-1" con un componente activo
- WHEN se da de baja con destino `DESCARTE`, categoría `VEJEZ` y sin texto
- THEN la leyenda de la pieza es `Baja del equipo «PC-1» — Vejez`

#### Scenario: Leyenda de exactamente 500 caracteres

- GIVEN un equipo cuyo prefijo compuesto deja un espacio de N caracteres para el texto
- WHEN se da de baja con un texto de exactamente N caracteres
- THEN la baja se completa y la leyenda guardada mide 500 caracteres

#### Scenario: Leyenda de 501 caracteres

- GIVEN el mismo equipo
- WHEN se da de baja con un texto de N+1 caracteres
- THEN el sistema rechaza la baja con un error que informa N, el equipo sigue vigente y ninguna pieza ni movimiento cambia

### Requirement: R5. El motivo es una categoría más un texto libre

El sistema DEBE exigir una categoría con valor `VEJEZ`, `DONACION`, `ROTURA` u
`OTRA` en las dos opciones, y NO DEBE aceptar otro valor. El texto libre DEBE ser
opcional salvo con `OTRA`, que lo exige no vacío después de recortar espacios.

#### Scenario: OTRA sin texto

- GIVEN un equipo vigente
- WHEN se solicita la baja con categoría `OTRA` y texto vacío o solo espacios
- THEN el sistema rechaza la solicitud y nada cambia

#### Scenario: OTRA con texto

- GIVEN un equipo vigente
- WHEN se solicita la baja con categoría `OTRA` y texto "reciclado para repuestos"
- THEN la baja se completa y la leyenda incluye ese texto

#### Scenario: Categoría ausente o inválida

- GIVEN un equipo vigente
- WHEN se solicita la baja sin categoría, o con categoría "OTROS"
- THEN el sistema rechaza la solicitud y nada cambia

#### Scenario: Categoría sin texto en la opción A

- GIVEN un equipo vigente con un componente
- WHEN se solicita la baja con destino `STOCK_USADO`, categoría `ROTURA` y sin texto
- THEN la baja se completa

### Requirement: R6. La baja es atómica y el error lista las piezas problemáticas

El sistema DEBE ejecutar la baja en una sola transacción: si una pieza falla, NO
DEBE quedar ningún cambio en el equipo, los componentes, las unidades, los eventos
ni los movimientos. El sistema DEBE detectar todas las piezas que impiden la baja y
devolver un único error que lista cada una con su componente, su insumo y su causa
(por ejemplo insumo dado de baja, serial requerido, serial duplicado, familia que no
es de repuesto), no solo la primera.

#### Scenario: Una pieza falla y no cambia nada

- GIVEN un equipo con tres componentes: uno `NINGUNO` válido, uno con unidad "S1" y uno cuyo insumo tiene baja lógica
- WHEN se da de baja con destino `STOCK_USADO`
- THEN la baja se rechaza, el equipo sigue `activo = true`, los tres componentes siguen activos, "S1" sigue `INSTALADA`, no existe ninguna ENTRADA ni evento nuevo y el error nombra el componente con el insumo borrado

#### Scenario: El error lista todas las piezas problemáticas

- GIVEN un equipo con dos componentes cuyos insumos tienen baja lógica y un legado `SERIE` sin serial informado
- WHEN se da de baja con destino `STOCK_USADO`
- THEN el error lista los tres componentes, cada uno con su causa

#### Scenario: Falla al marcar el equipo

- GIVEN un equipo con piezas válidas
- WHEN la baja falla en el último paso, al marcar el equipo
- THEN las ENTRADAs, los cambios de unidad, los eventos y las marcas de componente ya hechos se revierten y nada cambia

### Requirement: R7. Devolver al stock exige el serial de las piezas legadas SERIE

Con destino `STOCK_USADO`, el sistema DEBE exigir un serial para cada componente
legado (sin unidad) de un insumo hoy `SERIE`, y con él crear una unidad
`EN_DEPOSITO` `USADO`, con la unicidad de serial normalizada por insumo, incluida la
unicidad entre los seriales informados en la misma baja. NO DEBE crear unidades en
serie pendiente. Sin ese serial, o con un serial repetido, la baja DEBE rechazarse
como en R6. La interfaz DEBE precargar el serial con el serial de texto del
componente cuando no está vacío y es válido. Con `DESCARTE` NO DEBE exigirse serial
ni crearse unidad. Un componente cuyo insumo tiene baja lógica DEBE frenar la baja
con `STOCK_USADO` y aparecer en el error.

#### Scenario: Legado SERIE con serial

- GIVEN un componente legado sin unidad de un insumo `SERIE`
- WHEN se da de baja con `STOCK_USADO` informando el serial "LEG-1" para ese componente
- THEN existe una unidad `EN_DEPOSITO` `USADO` con serial "LEG-1", su ENTRADA de cantidad 1 y el componente queda retirado con `STOCK_USADO`

#### Scenario: Legado SERIE sin serial

- GIVEN un componente legado sin unidad de un insumo `SERIE`
- WHEN se da de baja con `STOCK_USADO` sin informar serial
- THEN la baja se rechaza con un error que lista el componente por serial requerido y nada cambia

#### Scenario: Serial repetido dentro de la misma baja

- GIVEN dos componentes legados de un mismo insumo `SERIE`
- WHEN se da de baja con `STOCK_USADO` informando "x1" y "X 1" para ambos
- THEN la baja se rechaza listando ambos componentes por serial duplicado y no se crea ninguna unidad

#### Scenario: Serial ya existente en el insumo

- GIVEN un componente legado de un insumo `SERIE` que ya tiene una unidad con serial "A1"
- WHEN se da de baja con `STOCK_USADO` informando "a1"
- THEN la baja se rechaza listando el componente y nada cambia

#### Scenario: Descartar un legado SERIE sin serial

- GIVEN un componente legado sin unidad de un insumo `SERIE`
- WHEN se da de baja con `DESCARTE` sin serial
- THEN la baja se completa, el componente queda retirado con `DESCARTE` y no se crea ninguna unidad

#### Scenario: Insumo borrado frena la devolución

- GIVEN un componente activo cuyo insumo tiene baja lógica
- WHEN se da de baja con `STOCK_USADO`
- THEN la baja se rechaza y el error lista ese componente como insumo dado de baja

### Requirement: R8. La baja es definitiva y deja el equipo registrado como dado de baja

Al completarse, el equipo DEBE quedar con `activo = false` y conservar el destino,
la categoría, el texto libre, la fecha y el usuario de la baja. El sistema NO DEBE
ofrecer ni aceptar ninguna operación que reactive o deshaga la baja de un equipo.
El sistema NO DEBE dejar ninguna unidad `INSTALADA` ni ningún componente activo
sobre un equipo dado de baja.

#### Scenario: Registro de la baja

- GIVEN un equipo vigente con un componente
- WHEN el usuario "u1" lo da de baja con destino `DESCARTE`, categoría `ROTURA` y texto "no enciende"
- THEN el equipo tiene `activo = false`, destino `DESCARTE`, categoría `ROTURA`, texto "no enciende", la fecha de la baja y el usuario "u1"

#### Scenario: Sin reactivación

- GIVEN un equipo dado de baja
- WHEN se intenta reactivarlo por la edición o por cualquier endpoint
- THEN el sistema rechaza la operación y el equipo sigue con `activo = false`

#### Scenario: Sin unidades instaladas tras la baja

- GIVEN un equipo con dos unidades `INSTALADA`
- WHEN se da de baja con cualquiera de los dos destinos
- THEN no existe ninguna unidad `INSTALADA` con el `equipoId` de ese equipo ni ningún componente activo

### Requirement: R9. Un equipo sin piezas puede darse de baja; uno ya dado de baja no

El sistema DEBE permitir la baja de un equipo vigente sin componentes activos: solo
cambia el equipo (R8), sin movimientos, eventos ni cambios de unidad. El sistema NO
DEBE permitir la baja de un equipo ya dado de baja, y DEBE tratar un equipo
inexistente o con borrado lógico como no encontrado.

#### Scenario: Equipo sin piezas activas

- GIVEN un equipo vigente cuyos componentes están todos retirados, o sin componentes
- WHEN se da de baja con `STOCK_USADO`
- THEN el equipo queda con `activo = false` y sus datos de baja, y no se crea ningún movimiento ni evento

#### Scenario: Equipo ya dado de baja

- GIVEN un equipo dado de baja
- WHEN se solicita otra baja
- THEN el sistema rechaza la operación con un error de equipo ya dado de baja y los datos de baja originales no cambian

#### Scenario: Equipo con borrado lógico

- GIVEN un equipo con borrado lógico
- WHEN se solicita su baja
- THEN el sistema responde que el equipo no existe y no cambia nada

### Requirement: R10. Tickets abiertos: la baja se permite con un aviso de cuántos hay

El sistema NO DEBE bloquear la baja por tener tickets abiertos (en un estado no
terminal). DEBE informar la cantidad de tickets abiertos del equipo antes de
confirmar y conservar los tickets sin modificarlos. El sistema NO DEBE permitir
crear un ticket nuevo sobre un equipo dado de baja (comportamiento vigente que se
conserva).

#### Scenario: Aviso con tickets abiertos

- GIVEN un equipo con 2 tickets abiertos y 1 cerrado
- WHEN el usuario abre el diálogo de baja
- THEN el aviso informa 2 tickets abiertos

#### Scenario: Baja con tickets abiertos

- GIVEN un equipo con 2 tickets abiertos
- WHEN se da de baja
- THEN la baja se completa y los 2 tickets siguen abiertos, referenciando al equipo

#### Scenario: Ticket nuevo sobre equipo dado de baja

- GIVEN un equipo dado de baja
- WHEN se intenta crear un ticket de soporte sobre ese equipo
- THEN el sistema rechaza la creación

### Requirement: R11. El equipo dado de baja se ve en la lista y la ficha, y no admite cambios

La lista de equipos DEBE incluir los equipos dados de baja con la etiqueta "Baja",
ocultos por un filtro activo por defecto que el usuario puede desactivar; la
exportación DEBE respetar el mismo filtro que la lista. La ficha y el historial de
componentes de un equipo dado de baja DEBEN seguir visibles y mostrar los datos de
la baja. El sistema NO DEBE permitir editar un equipo dado de baja ni agregarle
componentes, y NO DEBE permitir reactivar uno de sus componentes retirados.

#### Scenario: Oculto por defecto

- GIVEN un equipo vigente y otro dado de baja
- WHEN el usuario abre la lista con el filtro por defecto
- THEN solo se muestra el equipo vigente

#### Scenario: Visible con etiqueta

- GIVEN el mismo escenario
- WHEN el usuario desactiva el filtro de ocultar dados de baja
- THEN se muestran ambos y el dado de baja lleva la etiqueta "Baja"

#### Scenario: Exportación con el filtro

- GIVEN un equipo vigente y otro dado de baja
- WHEN se exporta con el filtro por defecto
- THEN el CSV contiene solo el equipo vigente, y con el filtro desactivado contiene ambos con "Baja" en la columna de estado del dado de baja

#### Scenario: Ficha visible

- GIVEN un equipo dado de baja con componentes retirados
- WHEN el usuario abre su ficha
- THEN la ficha responde con sus componentes retirados, su historial y los datos de la baja

#### Scenario: Editar un equipo dado de baja

- GIVEN un equipo dado de baja
- WHEN se intenta editar cualquiera de sus datos
- THEN el sistema rechaza la edición y el equipo no cambia

#### Scenario: Agregar un componente

- GIVEN un equipo dado de baja
- WHEN se intenta agregarle un componente, con o sin descuento de stock
- THEN el sistema rechaza la operación y no se crea componente ni se mueve stock

#### Scenario: Reactivar un componente de un equipo dado de baja

- GIVEN un equipo dado de baja con destino `DESCARTE` y un componente retirado con unidad "S1" `DESCARTADA`
- WHEN se intenta reactivar el componente
- THEN el sistema rechaza la operación, el componente sigue retirado y "S1" sigue `DESCARTADA`

### Requirement: R12. La baja exige `EQUIPOS:BORRADO` y ningún permiso de insumos

La baja DEBE exigir `EQUIPOS:BORRADO` y NO DEBE exigir ningún permiso de INSUMOS ni
introducir un permiso nuevo.

#### Scenario: Sin permiso

- GIVEN un usuario con `EQUIPOS:LECTURA` y sin `EQUIPOS:BORRADO`
- WHEN solicita la baja de un equipo
- THEN la respuesta es 403 y nada cambia

#### Scenario: Con BORRADO y sin permisos de insumos

- GIVEN un usuario con `EQUIPOS:BORRADO` y sin ningún permiso de INSUMOS
- WHEN da de baja un equipo con destino `STOCK_USADO`
- THEN la baja se completa y se registran las ENTRADAs

### Requirement: R13. El borrado actual solo procede sin piezas activas y se renombra (corrección de defecto)

`DELETE /equipos/:id` DEBE rechazar el borrado de un equipo con uno o más
componentes activos, con un error que informa cuántos son, sin cambiar el equipo, los
componentes, las unidades ni los movimientos (hoy los deja huérfanos: unidades
`INSTALADA` sobre un equipo invisible). DEBE permitir el borrado de un equipo sin
componentes activos (cargado por error) y NO DEBE permitir el borrado de un equipo
dado de baja, para que su ficha siga visible. El botón de la ficha DEBE dejar de
llamarse "Dar de baja", y ese nombre queda para el flujo de baja completa. El
requerimiento se prueba primero en RED contra el comportamiento actual.

#### Scenario: Borrar con piezas activas (RED actual, GREEN esperado)

- GIVEN un equipo con un componente activo vinculado a la unidad "S1" `INSTALADA`
- WHEN se invoca `DELETE /equipos/:id`
- THEN el sistema rechaza el borrado con un error que informa 1 componente activo, el equipo no tiene borrado lógico, el componente sigue activo y "S1" sigue `INSTALADA`

#### Scenario: Borrar un equipo cargado por error

- GIVEN un equipo sin componentes activos (o sin componentes)
- WHEN se invoca `DELETE /equipos/:id`
- THEN el equipo queda con borrado lógico y la ficha responde no encontrado

#### Scenario: Borrar un equipo dado de baja

- GIVEN un equipo dado de baja
- WHEN se invoca `DELETE /equipos/:id`
- THEN el sistema rechaza el borrado y la ficha sigue visible

#### Scenario: Botón renombrado

- GIVEN la ficha de un equipo vigente
- WHEN el usuario la consulta
- THEN el botón del borrado muestra "Eliminar equipo (cargado por error)", el botón de la baja completa se llama "Dar de baja" y ninguno otro lleva ese texto

### Requirement: R14. La confirmación muestra un resumen y, para descartar, exige escribir el nombre

El diálogo de baja DEBE mostrar, antes de confirmar, un resumen con la cantidad de
piezas activas, el destino elegido y la cantidad de tickets abiertos. Con
`STOCK_USADO` DEBE bastar un botón de confirmar. Con `DESCARTE` el botón de
confirmar DEBE permanecer deshabilitado hasta que el usuario escriba el nombre
exacto del equipo (comparación exacta, sin contar espacios en los extremos). La
confirmación por nombre es de la interfaz; el backend NO DEBE exigirla.

#### Scenario: Resumen

- GIVEN un equipo "PC-1" con 4 piezas activas y 1 ticket abierto
- WHEN el usuario elige devolver al stock
- THEN el diálogo muestra 4 piezas, destino "devolver al stock" y 1 ticket abierto

#### Scenario: Devolver confirma con un botón

- GIVEN el diálogo con destino `STOCK_USADO` y categoría elegida
- WHEN el usuario pulsa confirmar sin escribir nada más
- THEN se envía la baja

#### Scenario: Descartar exige el nombre

- GIVEN el diálogo con destino `DESCARTE` para el equipo "PC-1"
- WHEN el usuario escribe "PC-2" y luego "PC-1"
- THEN con "PC-2" el botón sigue deshabilitado y con "PC-1" se habilita

### Requirement: R15. La baja concurrente con una instalación no produce deadlock

La baja DEBE adquirir los bloqueos de los insumos y unidades que toca en un orden
global consistente con el de las instalaciones, de modo que una baja y una
instalación concurrentes sobre los mismos insumos NO DEBEN terminar en error de
sistema por deadlock (`40P01`) y DEBEN dejar un único resultado consistente. Un
componente NO DEBE quedar activo sobre un equipo dado de baja.

#### Scenario: Baja contra instalación sobre los mismos insumos

- GIVEN el equipo "E1" con componentes de los insumos `SERIE` X e Y, y el equipo "E2" vigente con unidades `EN_DEPOSITO` de Y y de X
- WHEN se da de baja "E1" con `STOCK_USADO` y al mismo tiempo se instalan desde el depósito unidades de Y y de X en "E2", en orden inverso
- THEN las dos operaciones terminan sin error de sistema ni `40P01`, y para cada insumo las unidades `EN_DEPOSITO` por condición igualan el saldo del libro

#### Scenario: Dos bajas simultáneas del mismo equipo

- GIVEN un equipo vigente con piezas
- WHEN dos bajas del mismo equipo se ejecutan a la vez
- THEN exactamente una se completa y la otra se rechaza como equipo ya dado de baja, sin movimientos duplicados

#### Scenario: Baja contra agregar componente

- GIVEN un equipo vigente
- WHEN se da de baja y a la vez se le agrega un componente con descuento
- THEN o el componente se agregó antes y fue retirado por la baja, o se rechazó por equipo dado de baja; nunca queda un componente activo ni una unidad `INSTALADA` en el equipo dado de baja

### Requirement: R16. Una unidad instalada garantiza su insumo SERIE

Como un insumo `SERIE` no puede volver a `NINGUNO` mientras tenga unidades
`INSTALADA` (regla vigente de `unidades-insumo-serie`), la baja NO necesita tratar
un componente con unidad `INSTALADA` de un insumo `NINGUNO`: ese estado es
imposible.

#### Scenario: El cambio a NINGUNO con una unidad instalada se rechaza

- GIVEN un insumo `SERIE` con la unidad "S1" `INSTALADA` en un equipo
- WHEN se intenta cambiarlo a `NINGUNO`
- THEN el sistema rechaza el cambio, de modo que una baja posterior encuentra siempre un insumo `SERIE`

### Requirement: R17. Lo que la baja no hace

La baja NO DEBE aceptar destinos mezclados por pieza, NO DEBE ofrecer deshacer la
baja y NO DEBE introducir un permiso nuevo, un asiento negativo ni un flujo de
aprobación.

#### Scenario: Destino por pieza

- GIVEN un equipo con dos componentes activos
- WHEN se solicita la baja con destino `DESCARTE` de primer nivel y, además, una clave de destino distinta por componente
- THEN el sistema ignora los destinos por pieza y ambos componentes quedan retirados con `DESCARTE`

#### Scenario: Destino solo por pieza

- GIVEN un equipo con dos componentes activos
- WHEN se solicita la baja con destinos por componente y sin destino de primer nivel
- THEN el sistema rechaza la solicitud por destino faltante y nada cambia
