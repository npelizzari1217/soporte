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
SALIDA de 1 unidad del insumo, con el `equipoId` como trazabilidad; si la SALIDA
falla, el sistema DEBE revertir también el componente (issue #153). Con `false`,
el sistema DEBE registrar el componente sin ningún movimiento de stock. Serie y
capacidad DEBEN seguir siendo datos del componente en ambos casos.

#### Scenario: Descuento por defecto

- GIVEN un insumo repuesto con saldo suficiente
- WHEN se agrega un componente sin indicar `descontarStock`
- THEN quedan registrados el componente y una SALIDA de 1 unidad del insumo

#### Scenario: Falla la SALIDA y se revierte el alta

- GIVEN un insumo repuesto sin saldo suficiente
- WHEN se agrega un componente con `descontarStock: true`
- THEN el sistema rechaza el alta y no queda ni componente ni movimiento

#### Scenario: Alta sin descuento

- GIVEN un insumo repuesto con saldo conocido
- WHEN se agrega un componente con `descontarStock: false`
- THEN el componente queda persistido y el saldo y los movimientos del insumo
  no cambian

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
demás datos del componente (serie, capacidad).

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

### Requirement: El retiro sigue siendo el borrado lógico sin movimiento de stock

Hasta que entre el cambio `stock-usado-componentes`, el sistema DEBE retirar un
componente con el borrado lógico actual, sin motivo y sin ningún movimiento de
stock.

#### Scenario: Retiro sin stock

- GIVEN un componente instalado con descuento en su alta
- WHEN se lo retira
- THEN queda soft-deleted y el saldo del insumo no cambia

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
