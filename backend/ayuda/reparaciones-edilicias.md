---
slug: reparaciones-edilicias
titulo: Trabajar una reparación: alta, edición, subtareas, comentarios y compras
visibleParaSolicitante: false
---

# Trabajar una reparación: alta, edición, subtareas, comentarios y compras

Todo lo de este artículo se hace desde la pantalla **Reparaciones** (ítem
**Edilicia** del menú), con los botones de cada fila. Cómo se lee y se exporta esa
grilla se explica en el artículo "El listado de reparaciones y su exportación a
Excel o CSV".

Una reparación es un ticket: lo que se hace aquí se ve también en el detalle del
ticket, y al revés.

## Crear una reparación

El botón **Nueva reparación** aparece si usted tiene el permiso **Crear** sobre
algún tipo de ticket de los módulos Tickets o Edilicia. El formulario pide:

| Campo | Qué es |
|---|---|
| **Título** | Obligatorio. El resumen del trabajo. |
| **Tipo** | El tipo de ticket que se crea. Solo aparece cuando hay más de una opción. |
| **Descripción** | Opcional. El detalle del pedido. |
| **Ubicación** | Opcional. El lugar del trabajo, en texto libre, hasta 255 caracteres. |
| **Prioridad** | Obligatoria. |
| **Sector** | Opcional. Uno de los sectores cargados, o **Sin sector**. |

Sobre el selector **Tipo**:

- La primera opción es el tipo Edilicia, y es la que se usa si no se elige otra.
  Se ofrece solo si usted tiene **Crear** sobre ese tipo; si no lo tiene, hay que
  elegir un tipo de la lista.
- Las demás opciones son los tipos de los módulos Tickets y Edilicia sobre los que
  usted tiene **Crear**. Preventivo no se ofrece: esos tickets los genera el
  sistema (vea el artículo "El mantenimiento preventivo se genera solo").
- Si usted solo puede crear tickets del tipo Edilicia, el selector no se muestra.

El tipo no se puede cambiar después de crear la reparación. Presione **Crear**
para guardarla.

## Editar una reparación

La columna **Editar** muestra el botón **Editar** a quien tiene **Modificar** sobre
el tipo del ticket. El formulario permite cambiar **Título**, **Descripción**,
**Ubicación**, **Prioridad** y **Sector**, y se guarda con **Guardar**. Si cambia
la prioridad, el sistema recalcula el vencimiento del ticket.

La regla es que una reparación se edita mientras **todavía no se empezó a
trabajar**:

- Se puede editar si el ticket está **Nuevo** o **Asignado** y ninguna subtarea
  está completada.
- Pasado ese punto, solo un usuario **ROOT** puede editarla, en cualquier estado.
- Una reparación **bloqueada** por una compra en curso no la puede editar nadie,
  tampoco ROOT.

Cuando no se puede editar, el botón aparece deshabilitado y debajo se lee el
motivo:

- *Bloqueada por una compra en curso: no se puede editar.*
- *Ya está en proceso: solo ROOT puede editarla.*
- *Ya tiene tareas completadas: solo ROOT puede editarla.*
- *El ticket está resuelto: solo admite comentarios.* (o *cerrado*, o
  *cancelado*), para quien no es Administrador ni ROOT.

Un Administrador tampoco puede editar una reparación que ya se empezó a trabajar:
ese caso queda solo para ROOT.

## Subtareas: el checklist que mueve el avance

El botón **Ver subtareas** de cada fila abre la lista de pasos del trabajo. Son las
**tareas del ticket**: las mismas que aparecen en la sección de tareas del detalle
del ticket, que se explica en el artículo "Las tareas de un ticket".

Arriba de la lista se ve el avance, por ejemplo *50% · 1 de 2 completadas*, o
*Sin tareas todavía.* si no hay ninguna. Cada tarea muestra su descripción, su
técnico (o **Sin técnico**), si está **Pendiente** o **Completada** y, si está
completada, cuándo y quién la completó.

El porcentaje de la columna **Avance** sale de esa lista:

> avance = tareas completadas ÷ tareas activas × 100

Se muestra con hasta dos decimales, así que una de tres completadas da 33.33 %.
Una reparación **sin tareas queda en 0 %**. El avance no se carga a mano: solo se
mueve agregando, completando, descompletando o eliminando tareas. Tenga en cuenta
que agregar una tarea **baja** el avance, porque aumenta el total.

Lo que se puede hacer con las tareas:

1. **Agregar** una tarea: escriba la descripción en el campo **Nueva tarea** (hasta
   255 caracteres) y presione **Agregar**.
2. **Asignarle un técnico**, o quitárselo eligiendo **Sin técnico**. La lista ofrece
   los usuarios con rol Técnico o Colaborador que tienen **Ver** sobre el tipo del
   ticket.
3. **Completarla**, con el botón **Completar**. Queda registrado quién la completó y
   cuándo.
4. **Descompletarla**, con el botón **Descompletar**, si se marcó por error. Vuelve a
   pendiente.
5. **Eliminarla**, con el ícono de borrar. El sistema pide confirmación y avisa que
   la tarea deja de contar para el avance y que no se puede deshacer.

No se puede cambiar el texto de una tarea ya creada ni reordenarlas. Si la
descripción quedó mal, elimínela y cárguela de nuevo.

### Las tareas mueven el estado del ticket

- Al completar una tarea cuando todavía quedan otras pendientes, un ticket
  **Nuevo** o **Asignado** pasa a **En proceso**.
- Al completar la **última** tarea pendiente, el ticket pasa a **Resuelto**, igual
  que si se lo resolviera a mano.
- Si el ticket estaba **Nuevo** y sin responsable, queda asignado a quien completó
  la tarea, siempre que sea un técnico o colaborador habilitado en ese tipo. Si la
  completa un Administrador o ROOT, el ticket cambia de estado igual, pero sigue
  sin responsable.
- Si se descompleta una tarea de un ticket **Resuelto**, el ticket vuelve a **En
  proceso**. Como un ticket resuelto solo admite comentarios para el resto de los
  usuarios, esto solo lo puede hacer un Administrador o ROOT.

## Comentarios: por qué se está demorando

El comentario es una nota sobre la reparación entera, no sobre una tarea. Su uso
típico es dejar asentado el motivo de una demora, por ejemplo: *falta el repuesto,
el proveedor lo entrega la semana próxima*.

El botón **Ver comentarios** de cada fila abre la lista, del más nuevo al más
antiguo, con el nombre de quien escribió cada uno y la fecha. Para escribir uno,
use el campo **Nuevo comentario interno** y presione **Comentar**.

Lo que conviene saber antes de escribir:

- **Todo comentario publicado desde esta pantalla es interno.** Lo ven solo
  quienes tienen **Comentario interno** sobre el tipo del ticket; el solicitante no
  lo ve. Por eso no le envía aviso al solicitante ni cuenta como primera respuesta
  del ticket.
- Son los comentarios del ticket: lo que se publica aquí aparece en el historial del
  ticket, y los comentarios del ticket que usted puede ver aparecen aquí.
- **Un comentario no se edita ni se borra.** Lo que se publica queda.
- El texto admite **hasta 2000 caracteres** y no puede estar vacío ni tener solo
  espacios.
- Se puede comentar en **cualquier estado** del ticket, también cuando está
  bloqueado por una compra o cuando ya está resuelto, cerrado o cancelado.

## Compras vinculadas y bloqueo

Una reparación puede quedar frenada mientras se espera algo que se pidió por el
módulo Compras. Para eso se le **vinculan** las compras que la frenan.

### El panel de compras

En la columna **Bloqueo** de cada fila está el botón **Gestionar compras**. Lo ve
quien tiene la casilla **LECTURA** de la fila **Compras** en la matriz de permisos.
Si además tiene **Modificar** sobre el tipo del ticket, el panel permite vincular y
desvincular; si no, el botón se llama **Ver compras** y el panel solo muestra la
lista.

El panel muestra:

- **Todas las compras vinculadas**, también las ya completadas o canceladas. El
  número de cada una abre la compra. La etiqueta **Bloquea** marca las que frenan
  la reparación; las demás muestran **Completada** o **Cancelada**.
- El botón **Desvincular** al lado de cada compra.
- La sección **Vincular compra**, con un buscador (**Buscar por descripción o
  número**) y la lista de compras encontradas. Solo se ofrecen compras **activas**
  que todavía no están vinculadas. Elija una y presione **Vincular**.

La búsqueda se hace sobre todas las compras activas, no solo sobre las que entran
en la lista. Si hay más resultados de los que se muestran, el panel lo indica y
sugiere acotar la búsqueda. Presionar Enter en el buscador no vincula nada: la
compra se vincula solo con el botón **Vincular**.

### Cuándo está bloqueada

La reparación está **bloqueada** mientras tenga al menos una compra vinculada en
curso. El listado lo muestra con el aviso **Bloqueada**, y el detalle del ticket
también lo indica. Vale para un ticket de cualquier tipo con compras vinculadas.

Nadie marca ni desmarca el bloqueo a mano. Una compra vinculada deja de frenar la
reparación, y el aviso desaparece solo, cuando:

1. Todo lo aprobado de la compra se **entregó** (o se cerró con faltante). No
   alcanza con que el depósito lo haya recibido: el bloqueo sigue hasta la entrega.
2. La compra se **cancela**.
3. La compra se **rechaza** por completo.

Cómo se calcula el estado de una compra se explica en el artículo "El listado de
compras: estados, orden, filtros y exportación".

Mientras la reparación está bloqueada:

- **Las tareas quedan de solo lectura** para todos, desde esta pantalla y desde el
  detalle del ticket. La lista de subtareas muestra *El ticket está bloqueado por
  una compra en curso: sus tareas ya no se modifican.*
- **Nadie puede editar** sus datos.
- Los **comentarios** y la gestión de **compras vinculadas** siguen disponibles.

El bloqueo **no cambia el avance**: una reparación puede estar al 80 % y bloqueada
al mismo tiempo.

## Reparación resuelta, cerrada o cancelada

Cuando el ticket está **Resuelto**, **Cerrado** o **Cancelado**, quien no es
Administrador ni ROOT **solo puede comentar**. No puede agregar, asignar, completar,
descompletar ni eliminar tareas, ni editar los datos, ni vincular o desvincular
compras. La pantalla lo indica con el motivo, por ejemplo *El ticket está
resuelto: solo admite comentarios.*

Un **Administrador** o **ROOT** queda exento de esa regla: puede seguir trabajando
las tareas y las compras, y reabrir el ticket. Por ejemplo, si una tarea se marcó
como completada por error y eso resolvió el ticket, un Administrador la
descompleta y el ticket vuelve a **En proceso**. Editar los datos sigue reservado a
ROOT, y el bloqueo por una compra en curso vale para todos.

## Quién puede hacer cada cosa

Los permisos de la tabla son los del tipo del ticket, salvo la casilla de Compras.

| Acción | Quién puede |
|---|---|
| Ver la reparación, sus tareas y sus comentarios no internos | Quien tiene **Ver** sobre el tipo y ve el ticket |
| Ver los comentarios internos | Además, **Comentario interno** sobre el tipo |
| Crear una reparación | **Crear** sobre el tipo elegido |
| Editar los datos | **Modificar** sobre el tipo, con las reglas de "Editar una reparación" |
| Agregar, asignar o eliminar tareas | El responsable del ticket con **Modificar** sobre el tipo, o un Administrador o ROOT |
| Completar o descompletar una tarea | El técnico de la tarea, el responsable del ticket, o un Administrador o ROOT |
| Publicar un comentario | **Comentar** y **Comentario interno** sobre el tipo |
| Ver las compras vinculadas | **Ver** sobre el tipo y la casilla **LECTURA** de **Compras** |
| Vincular o desvincular compras | **Modificar** sobre el tipo y la casilla **LECTURA** de **Compras** |
| Saber si está bloqueada | Todo el que ve la fila |

Todo lo de la tabla, salvo ver y comentar, vale mientras el ticket no esté
resuelto, cerrado ni cancelado, o si usted es Administrador o ROOT.

Estos permisos los exige el sistema, no solo la pantalla: ocultar un botón es una
comodidad, y quien no tiene el permiso recibe un rechazo aunque intente la acción
por otra vía.
