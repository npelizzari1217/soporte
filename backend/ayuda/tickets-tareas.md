---
slug: tickets-tareas
titulo: Las tareas de un ticket
visibleParaSolicitante: true
---

# Las tareas de un ticket

Todo ticket, de cualquier tipo, tiene una sección **Tareas** en su detalle: una
lista de pasos para resolverlo, cada uno con su técnico. Las mismas tareas se
ven en las reparaciones de **Edilicia**; ese caso se explica en el artículo
"Trabajar una reparación: alta, edición, subtareas, comentarios y compras".

## Qué muestra la sección

Arriba, una barra de avance con el porcentaje y el conteo ("3 de 5
completadas"). Las tareas eliminadas no cuentan. Si el ticket todavía no tiene
tareas, se lee **Sin tareas todavía.**

Cada tarea muestra su descripción, el técnico a cargo (**Técnico:** y el
nombre, o **Sin técnico**), la marca **Pendiente** o **Completada** y, si está
completada, la fecha y quién la completó.

La sección la ve cualquiera que vea el ticket.

## Quién puede hacer cada cosa

| Acción | Quién |
|---|---|
| Agregar una tarea | El responsable del ticket, un usuario con rol Administrador o el administrador global, siempre con **Modificar** sobre el tipo del ticket |
| Elegir o quitar el técnico de una tarea | Los mismos |
| Eliminar una tarea | Los mismos |
| Completar o descompletar una tarea | El técnico de esa tarea, el responsable del ticket, un usuario con rol Administrador o el administrador global |

Para completar o descompletar no hace falta **Modificar** sobre el tipo: al
técnico de la tarea le alcanza con serlo.

## Agregar una tarea

Escriba la descripción en el campo **Nueva tarea** y presione **Agregar**. La
descripción no puede quedar vacía y admite hasta 255 caracteres.

## El técnico de cada tarea

Junto a cada tarea hay un selector para elegir su técnico, o dejarla en
**Sin técnico**. Solo se ofrecen los usuarios con rol Técnico o Colaborador que
tienen **Ver** sobre el tipo del ticket: son los mismos que pueden ser
responsables de un ticket de ese tipo. Si el técnico actual de una tarea ya no
cumple esa condición, se lo sigue mostrando en el selector para no ocultar el
dato.

Ser el técnico de una tarea le permite a esa persona ver el ticket aunque no
tenga **Ver todos** sobre el tipo, siempre que tenga **Ver**. Si se la quita de
la tarea, o la tarea se elimina, deja de ver el ticket, salvo que lo vea por
otro motivo.

## Completar, descompletar y eliminar

- **Completar** marca la tarea como hecha y registra quién y cuándo.
- **Descompletar** la vuelve a pendiente.
- El ícono de papelera elimina la tarea, previa confirmación. La tarea deja de
  contar para el avance y **no se puede deshacer**.

Cada una de estas acciones, igual que agregar una tarea o cambiar su técnico,
queda registrada en la **Actividad** del ticket.

## Cómo las tareas mueven el estado del ticket

Completar y descompletar tareas cambia el estado del ticket solo:

- **Completar una tarea cuando todavía quedan otras pendientes** lleva el
  ticket a **En proceso** si estaba **Nuevo** o **Asignado**. En los demás
  estados no lo cambia.
- **Completar la última tarea pendiente** lleva el ticket a **Resuelto**, si
  estaba **Nuevo**, **Asignado**, **En proceso** o **Esperando al cliente**.
- **Descompletar una tarea de un ticket Resuelto** lo devuelve a
  **En proceso**. En los demás estados, descompletar no cambia el estado.
- Un ticket **Cerrado** o **Cancelado** no cambia de estado por sus tareas.

Si el ticket estaba **Nuevo** y sin responsable, quien completa la tarea pasa a
ser el responsable, siempre que sea Técnico o Colaborador con **Ver** sobre el
tipo. Un usuario con rol Administrador puede completar la tarea, pero no recibe
el ticket: queda sin responsable y el estado avanza igual.

Cada cambio de estado queda en la **Actividad** como un **Cambio de estado**, a
nombre de quien completó o descompletó, y tiene los mismos efectos que un cambio
hecho a mano: por ejemplo, el aviso por correo al solicitante cuando el ticket
pasa a **Resuelto**.

## Cuándo las tareas quedan de solo lectura

En dos casos la sección muestra la lista pero oculta los botones, y explica el
motivo:

- **El ticket está Resuelto, Cerrado o Cancelado** y usted no es Administrador.
  En esos estados el ticket solo admite comentarios. Los usuarios con rol
  Administrador y el administrador global quedan exentos: por ejemplo, pueden
  descompletar una tarea de un ticket resuelto para reabrirlo.
- **El ticket está bloqueado por una compra en curso.** Mientras haya una compra
  vinculada en curso, nadie modifica sus tareas, ni siquiera un administrador.
  Cuando la compra se resuelve, las tareas vuelven a poder modificarse.

## Tareas pendientes y borrado del ticket

Un ticket con tareas pendientes no se puede borrar: antes hay que completarlas o
eliminarlas. Las tareas completadas no impiden el borrado. Ver el artículo "El
detalle de un ticket: acciones, actividad y tiempo del técnico".
