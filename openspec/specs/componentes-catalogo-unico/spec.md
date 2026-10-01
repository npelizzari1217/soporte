# Componentes Catálogo Único Specification

## Purpose

Definir que todo componente instalado en un equipo referencia un repuesto del
catálogo del tenant (`insumoId` obligatorio), que su tipo se deriva de la
familia del insumo y que el catálogo MASTER `tipos_componente` no existe. Fija
además el alta única con descuento opcional y atómico, y la inmutabilidad del
repuesto y del tipo en la edición.

## Requirements

### Requirement: El alta de un componente exige un insumo repuesto válido

El sistema DEBE exigir `insumoId` en el alta de un componente y NO DEBE aceptar
un alta sin él. El insumo DEBE existir, estar `activo` y no estar soft-deleted;
su familia DEBE existir, no estar soft-deleted, tener `esRepuesto = true` y
estar `activo`. Ante cada incumplimiento el sistema DEBE rechazar con el error
de dominio existente de ese guard y NO DEBE persistir el componente ni registrar
movimiento de stock.

#### Scenario: Alta sin insumoId

- GIVEN un equipo existente
- WHEN se agrega un componente sin `insumoId`
- THEN el sistema rechaza el alta y no persiste el componente

#### Scenario: Cada guard rechaza con su error propio

- GIVEN por separado: un insumo inexistente, inactivo o soft-deleted; y un
  insumo válido con familia inexistente, soft-deleted, no repuesto o inactiva
- WHEN se agrega un componente en cada caso
- THEN el sistema rechaza con el error de dominio correspondiente y no
  persiste nada

#### Scenario: Alta válida

- GIVEN un insumo activo de una familia `esRepuesto: true` y `activo: true`
- WHEN se agrega un componente con ese `insumoId`
- THEN el componente queda persistido y vinculado al insumo

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
condición, si se ignora o se rechaza queda a decisión de diseño. En un insumo
`SERIE` con `descontarStock: true`, el alta DEBE exigir elegir una unidad
`EN_DEPOSITO` con serial, identificada por su serial y de la condición elegida;
NO DEBE aceptar una unidad en serie pendiente ni un alta sin unidad. La SALIDA
DEBE referenciar esa unidad con cantidad 1, la unidad DEBE pasar a `INSTALADA` en
el equipo y quedar vinculada al componente, y el serial del componente DEBE ser el
de la unidad, sin ingreso libre. Si la unidad ya no está disponible al momento de
confirmar, el sistema DEBE rechazar el alta y revertir todo. Con `false` en un
insumo `SERIE` rige el requerimiento de unidad instalada sin descuento.
(Previously: el alta con descuento solo restaba 1 del saldo de la condición; ahora, en insumos SERIE, exige elegir la unidad y la instala.)

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

#### Scenario: Instalar una unidad SERIE elegida por serial

- GIVEN un insumo `SERIE` con las unidades "S1" y "S2" `EN_DEPOSITO` NUEVO
- WHEN se agrega un componente con descuento eligiendo la unidad "S1"
- THEN existe una SALIDA de cantidad 1 de "S1", "S1" queda `INSTALADA` en el equipo, el componente tiene el serial "S1" y el saldo NUEVO es 1

#### Scenario: Alta SERIE sin unidad o con unidad pendiente

- GIVEN un insumo `SERIE` con una unidad en serie pendiente
- WHEN se agrega un componente con descuento sin unidad, o eligiendo la pendiente
- THEN el sistema rechaza el alta y no queda componente ni movimiento

#### Scenario: Unidad tomada por otra operación

- GIVEN una unidad `EN_DEPOSITO` elegida en el alta
- WHEN otra operación la toma antes de confirmar
- THEN el sistema rechaza el alta y no queda ni componente ni movimiento

#### Scenario: Selector de unidad en el alta

- GIVEN la pantalla de alta con descuento de un insumo `SERIE` con unidades de ambas condiciones
- WHEN el usuario elige la condición
- THEN se listan solo las unidades `EN_DEPOSITO` con serial de esa condición, identificadas por serial

### Requirement: El tipo del componente se deriva de la familia y no se almacena

El sistema NO DEBE almacenar el tipo del componente ni tomarlo del request: el
tipo DEBE resolverse siempre desde `insumo.familia` del tenant. Ningún código
DEBE ramificar su comportamiento por `familia.codigo`; el código solo se usa
para mostrar.

#### Scenario: Familia propia del tenant sin catálogo global

- GIVEN una familia `TORNILLO`, `esRepuesto: true`, `activo: true`
- WHEN se agrega un componente con un insumo de esa familia
- THEN el componente se muestra con tipo `TORNILLO` y no se consulta ningún
  catálogo global

#### Scenario: Un tipo enviado en el request no define el tipo

- GIVEN un insumo de familia `RAM`
- WHEN el request de alta incluye además un tipo distinto (`DISCO`)
- THEN el tipo resultante es el de la familia `RAM`, nunca el enviado
  (el manejo del campo sobrante, ignorar o rechazar, queda a decisión de diseño)

### Requirement: La edición no cambia el tipo ni el insumo del componente

El sistema NO DEBE permitir cambiar el `insumoId` ni el tipo de un componente
existente mediante edición; el reemplazo de un repuesto DEBE ser el retiro del
componente más un alta nueva. El sistema DEBE seguir permitiendo editar los
demás datos del componente (serie, capacidad). El serial de un componente
vinculado a una unidad NO DEBE editarse desde el componente: DEBE corregirse por
la corrección de serial de la unidad, con motivo (spec `unidades-insumo-serie`).
El serial de texto de un componente legado sin unidad DEBE seguir siendo editable.
(Previously: la serie del componente siempre era editable; ahora, si el componente tiene unidad, se corrige por la unidad.)

#### Scenario: Edición de datos propios

- GIVEN un componente instalado
- WHEN se edita su serie o su capacidad
- THEN los datos se actualizan y `insumoId` y tipo permanecen iguales

#### Scenario: Intento de cambiar el insumo

- GIVEN un componente instalado con insumo A
- WHEN se intenta editarlo para vincularlo al insumo B
- THEN el insumo del componente sigue siendo A

#### Scenario: Reemplazo como retiro más alta

- GIVEN un componente instalado con insumo A
- WHEN se lo retira y se agrega un componente con insumo B
- THEN el equipo tiene el componente B activo y el A retirado

#### Scenario: Editar el serial de un componente con unidad

- GIVEN un componente vinculado a la unidad "S1"
- WHEN se intenta editar su serie desde el componente
- THEN el sistema no cambia el serial de la unidad y la capacidad puede editarse

#### Scenario: Editar el serial de un componente legado

- GIVEN un componente instalado antes de este cambio, sin unidad
- WHEN se edita su serie
- THEN el dato se actualiza

### Requirement: El display del tipo resuelve por la familia del tenant

El sistema DEBE resolver `tipoNombre` y `tipoActivo` de todo componente desde la
familia del tenant vía `insumoId`, sin consultar MASTER. `tipoActivo` DEBE ser
`familia.activo && familia.deletedAt === null`.

#### Scenario: Familia activa

- GIVEN un componente de un insumo de familia `TORNILLO`, `activo: true`
- WHEN se consulta el detalle del equipo
- THEN se muestra `tipoNombre: 'TORNILLO'` y `tipoActivo: true`

#### Scenario: Familia desactivada

- GIVEN un componente cuya familia fue desactivada después del alta
- WHEN se consulta el detalle del equipo
- THEN `tipoActivo` es `false` y el componente sigue listado

### Requirement: La migración del tenant es fail-closed y deja el esquema sin tipo almacenado

La migración de cada base de tenant DEBE abortar, sin modificar ni borrar
ninguna fila, si existe alguna fila de `componentes_equipo` con `insumo_id NULL`,
incluidas las borradas lógicamente. Si no existe ninguna, DEBE dejar `insumo_id`
NOT NULL y eliminar la columna `tipo_componente_codigo` y su índice. La FK
`RESTRICT` de `insumo_id` DEBE conservarse. Un tenant con la tabla vacía DEBE
migrar sin error. El mecanismo que deja las bases sin filas no conformes queda a
decisión de diseño; ningún mecanismo puede borrar en silencio.

#### Scenario: Fila viva con insumo_id NULL

- GIVEN un tenant con una fila viva con `insumo_id NULL`
- WHEN corre la migración
- THEN aborta con error y el esquema y los datos quedan intactos

#### Scenario: Fila borrada lógicamente con insumo_id NULL

- GIVEN un tenant cuya única fila no conforme está soft-deleted
- WHEN corre la migración
- THEN aborta igual que con una fila viva

#### Scenario: Migración exitosa

- GIVEN un tenant donde todas las filas tienen `insumo_id`
- WHEN corre la migración
- THEN `insumo_id` es NOT NULL, `tipo_componente_codigo` y su índice no
  existen y la FK a `insumos` sigue vigente

#### Scenario: Tenant nuevo con tabla vacía

- GIVEN un tenant recién creado sin componentes
- WHEN corre la migración
- THEN termina sin error

### Requirement: El catálogo MASTER de tipos de componente no existe

El sistema NO DEBE exponer el módulo `tipos-componente` ni su catálogo: sus 5
endpoints ROOT y `GET /equipos/tipos-componente` DEBEN responder 404; la ruta
frontend `/admin/tipos-componente` NO DEBE existir; la navegación ROOT NO DEBE
contener su entrada; y, al cierre del ciclo, la tabla MASTER `tipos_componente`
NO DEBE existir. El momento exacto del DROP de MASTER queda a decisión de
diseño, pero mientras exista, ningún código de la aplicación DEBE leerla.

#### Scenario: Endpoints retirados

- GIVEN el sistema desplegado
- WHEN se invoca cualquiera de las rutas antiguas de `tipos-componente`
- THEN la respuesta es 404

#### Scenario: Pantalla y navegación retiradas

- GIVEN un usuario ROOT autenticado
- WHEN abre la navegación o visita `/admin/tipos-componente`
- THEN no hay entrada de menú y la ruta no existe

#### Scenario: Tabla MASTER eliminada

- GIVEN el ciclo cerrado
- WHEN se inspecciona el esquema de `soporte_master`
- THEN no existe la tabla `tipos_componente`
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
`EQUIPOS:ALTAS` ya descuenta stock al instalar sin permisos de insumos. El dueño lo
confirmó para las unidades de un insumo `SERIE`: `EQUIPOS:ALTAS` instala unidades y
crea unidades instaladas sin descuento, `EQUIPOS:BORRADO` las devuelve al depósito
o las descarta y `EQUIPOS:MODIFICACION` las reinstala al reactivar, sin permisos de
insumos (spec `unidades-insumo-serie`).

Con `STOCK_USADO`, el retiro DEBE admitir un insumo deshabilitado y una familia
dada de baja o deshabilitada, porque la pieza existe físicamente (decisión del
dueño, 2026-09-30). Por el mismo motivo, el dueño la extendió a dos operaciones
sobre unidades de un insumo `SERIE`: la devolución de una unidad entregada y la
recuperación de una unidad descartada (spec `unidades-insumo-serie`). NO DEBE
extenderse a la ENTRADA ni al AJUSTE manuales. El retiro NO DEBE admitir un insumo dado de
baja ni un insumo cuya familia no es de repuesto.

Cuando el componente está vinculado a una unidad, con `STOCK_USADO` la ENTRADA
DEBE referenciar esa unidad con cantidad 1 y la unidad DEBE volver a
`EN_DEPOSITO` con condición `USADO`, conservando su serial y sin equipo; con
`DESCARTE` la unidad DEBE pasar a `DESCARTADA` sin movimiento y sin cambio de
saldo. El retiro y el cambio de la unidad DEBEN ser atómicos. Con `STOCK_USADO`
de un componente legado sin unidad de un insumo `SERIE`, el sistema DEBE exigir un
serial y crear con él una unidad `EN_DEPOSITO` `USADO`, cumpliendo la unicidad
normalizada; NO DEBE crear una unidad en serie pendiente, y sin serial DEBE
rechazar el retiro sin cambiar nada. La interfaz DEBE precargar ese serial con el
serial de texto del componente cuando no está vacío y es válido.
(Previously: el retiro solo movía saldo por cantidad; ahora, si el componente tiene unidad, la devuelve al depósito o la descarta.)

#### Scenario: Devolver al stock como usado

- GIVEN un componente activo, instalado con descuento, de un insumo con saldo
  USADO 0
- WHEN un usuario con `EQUIPOS:BORRADO` lo retira con destino `STOCK_USADO`
- THEN el componente queda soft-deleted, existe una ENTRADA USADO de 1 unidad
  del insumo con el `equipoId`, el saldo USADO es 1 y el saldo NUEVO no cambia

#### Scenario: Retiro al stock de un repuesto deshabilitado

- GIVEN un componente activo, instalado con descuento, cuyo insumo está
  deshabilitado
- WHEN se lo retira con destino `STOCK_USADO`
- THEN el retiro se completa, existe una ENTRADA USADO de 1 unidad y el saldo
  USADO del insumo aumenta en 1

#### Scenario: Retiro al stock con familia dada de baja

- GIVEN un componente activo, instalado con descuento, cuyo insumo pertenece a
  una familia de repuesto dada de baja o deshabilitada
- WHEN se lo retira con destino `STOCK_USADO`
- THEN el retiro se completa y existe una ENTRADA USADO de 1 unidad

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

#### Scenario: Devolver una unidad al depósito

- GIVEN un componente vinculado a la unidad "S1" `INSTALADA`, instalada con descuento
- WHEN se lo retira con destino `STOCK_USADO`
- THEN "S1" queda `EN_DEPOSITO` `USADO` con serial "S1" y sin equipo, la ENTRADA USADO referencia "S1" con cantidad 1 y el saldo USADO aumenta en 1

#### Scenario: Descartar una unidad

- GIVEN un componente vinculado a la unidad "S1" `INSTALADA`
- WHEN se lo retira con destino `DESCARTE` y motivo "placa quemada"
- THEN "S1" queda `DESCARTADA`, no se registra movimiento y los saldos no cambian

#### Scenario: Retiro al stock de un componente legado de un insumo SERIE

- GIVEN un componente legado sin unidad de un insumo ahora `SERIE`, con motivo informado
- WHEN se lo retira con destino `STOCK_USADO` informando el serial "L1"
- THEN se crea la unidad "L1" `EN_DEPOSITO` `USADO`, se registra la ENTRADA USADO de cantidad 1 y el saldo USADO aumenta en 1

#### Scenario: Retiro al stock de un legado sin serial informado

- GIVEN un componente legado sin unidad de un insumo `SERIE`, con motivo informado
- WHEN se lo retira con destino `STOCK_USADO` sin serial o con serial vacío
- THEN el sistema rechaza el retiro, el componente sigue activo y no se crea ninguna unidad ni movimiento

#### Scenario: Serial precargado en el retiro de un legado

- GIVEN un componente legado sin unidad de un insumo `SERIE` con serial de texto "L1"
- WHEN el usuario elige devolverlo al stock
- THEN el diálogo muestra el serial precargado con "L1" y el usuario puede cambiarlo antes de confirmar

### Requirement: Un componente que vino con el equipo puede devolverse al stock con motivo obligatorio

El sistema DEBE permitir devolver al stock como USADO un componente sin SALIDA
registrada del depósito, pero DEBE exigir en ese caso un motivo no vacío de a lo
sumo 500 caracteres. Un componente no tiene SALIDA registrada cuando se instaló
con `descontarStock: false` o cuando se instaló antes de este cambio, con o sin
descuento: el sistema no registraba el vínculo entre el componente y su SALIDA.
El registro de retiro de ese componente DEBE mostrar la marca "sin salida
registrada del depósito". Un componente instalado con descuento a partir de este
cambio NO DEBE requerir motivo para devolverse al stock, y su registro NO DEBE
llevar esa marca.

Consecuencia asumida (dueño, 2026-09-30): un componente instalado con descuento
antes de este cambio también exige motivo para volver al stock y muestra la
marca, aunque en su momento haya salido del depósito.

#### Scenario: Devolver una pieza que vino con el equipo

- GIVEN un componente instalado con `descontarStock: false`
- WHEN se lo retira con destino `STOCK_USADO` y motivo "disco del equipo
  comprado"
- THEN se registra la ENTRADA USADO de 1 unidad, el componente queda
  soft-deleted y su registro de retiro muestra la marca "sin salida registrada
  del depósito"

#### Scenario: Devolver una pieza instalada antes de este cambio

- GIVEN un componente instalado con descuento antes de este cambio
- WHEN se lo retira con destino `STOCK_USADO` sin motivo
- THEN el sistema rechaza el retiro y el componente sigue activo
- AND con un motivo, el retiro se completa y su registro muestra la marca "sin
  salida registrada del depósito"

#### Scenario: Devolver una pieza que vino con el equipo sin motivo

- GIVEN un componente instalado con `descontarStock: false`
- WHEN se lo retira con destino `STOCK_USADO` sin motivo
- THEN el sistema rechaza el retiro, el componente sigue activo y no se
  registra movimiento

#### Scenario: Pieza instalada con descuento

- GIVEN un componente instalado con `descontarStock: true` a partir de este
  cambio
- WHEN se lo retira con destino `STOCK_USADO` sin motivo
- THEN el retiro se completa y el registro no lleva la marca "sin salida
  registrada del depósito"

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
### Requirement: El componente conserva el registro de su retiro

El sistema DEBE guardar en el propio componente, al retirarlo, el destino
(`STOCK_USADO` o `DESCARTE`), el motivo (cuando exista), el vínculo al
movimiento de devolución (solo con `STOCK_USADO`) y el usuario que lo retiró, y
DEBE exponerlos al consultar el componente junto con la marca "sin salida
registrada del depósito" cuando corresponda. La marca NO DEBE guardarse como
dato propio: DEBE derivarse de que el destino es `STOCK_USADO` y el componente no
tiene vínculo a la SALIDA de su instalación (`instalacion_movimiento_id` nulo),
vínculo que la instalación con descuento DEBE registrar a partir de este cambio.
Un componente retirado antes de este cambio DEBE mostrar los campos de retiro
vacíos (retiro legado). El sistema NO DEBE crear una tabla nueva de retiros ni un
tipo de movimiento de dirección cero. Con el vínculo al movimiento y el
`equipoId` del movimiento DEBE poder responderse de qué equipo vino una pieza
usada. El usuario se registra como referencia al usuario de la base de control,
sin clave foránea entre bases (`baja_usuario_id`), según el diseño.

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
### Requirement: Un componente de un insumo SERIE instalado sin descuento crea una unidad ya instalada

Cuando se agrega un componente de un insumo `SERIE` con `descontarStock: false`
(la pieza vino dentro de un equipo comprado), el sistema DEBE exigir su serial y
DEBE crear una unidad en estado `INSTALADA` en ese equipo, con la condición
indicada (por defecto `NUEVO`), vinculada al componente, sin registrar ningún
movimiento de origen y sin alterar ningún saldo. El serial DEBE cumplir la
unicidad normalizada del insumo. La unidad DEBE figurar en el historial. Si luego
el componente se retira al stock, DEBE volver como `EN_DEPOSITO` `USADO` con ese
mismo serial. Como el componente no tiene SALIDA de instalación, ese retiro DEBE
exigir el motivo de la regla vigente de "pieza que vino con el equipo".

#### Scenario: Alta sin descuento con serial

- GIVEN un insumo `SERIE` con saldo conocido
- WHEN se agrega un componente con `descontarStock: false` y serial "K9"
- THEN existe una unidad "K9" `INSTALADA` en el equipo, vinculada al componente, sin movimientos nuevos y con el saldo sin cambios

#### Scenario: Alta sin descuento sin serial

- GIVEN un insumo `SERIE`
- WHEN se agrega un componente con `descontarStock: false` sin serial o con serial vacío
- THEN el sistema rechaza el alta y no persiste el componente ni la unidad

#### Scenario: Alta sin descuento con serial repetido

- GIVEN un insumo `SERIE` con una unidad de serial "K9"
- WHEN se agrega un componente con `descontarStock: false` y serial "k9"
- THEN el sistema rechaza el alta y no persiste nada

#### Scenario: Retiro al stock de una unidad de origen sin salida

- GIVEN un componente con unidad "K9" `INSTALADA` creada sin descuento
- WHEN se lo retira con destino `STOCK_USADO` y motivo "pieza del equipo comprado"
- THEN "K9" queda `EN_DEPOSITO` `USADO` con serial "K9", existe una ENTRADA USADO de cantidad 1 para "K9" y la marca "sin salida registrada del depósito" aparece

#### Scenario: Retiro al stock sin motivo

- GIVEN un componente con unidad creada sin descuento
- WHEN se lo retira con destino `STOCK_USADO` sin motivo
- THEN el sistema rechaza el retiro y la unidad sigue `INSTALADA`

