---
slug: reparaciones-edilicias
titulo: Subtareas y comentarios de una reparación edilicia
tipoTicket: EDILICIA
visibleParaSolicitante: false
---

# Subtareas y comentarios de una reparación edilicia

Una reparación tiene dos herramientas de seguimiento que se parecen pero sirven
para cosas distintas: las **subtareas**, que miden el avance, y los
**comentarios**, que explican qué está pasando.

## Subtareas: el checklist que mueve el avance

Cada fila del listado de reparaciones tiene un botón **Ver subtareas**. Ahí se
carga la lista de pasos concretos del trabajo.

El porcentaje de la columna **Avance** sale directamente de ese checklist:

> avance = subtareas completadas ÷ subtareas totales × 100

Se muestra con hasta dos decimales, así que una de tres da `33.33%`. Una
reparación **sin subtareas queda en 0%**: el avance no se puede cargar a mano,
solo se mueve cargando y completando subtareas. Las subtareas eliminadas no
cuentan ni arriba ni abajo de la división.

Lo que se puede hacer con una subtarea:

1. **Agregarla**, escribiendo su descripción en el campo *Nueva subtarea*.
2. **Completarla**, con el botón **Completar**. Una vez completada, el botón
   desaparece: **no hay forma de descompletarla**.
3. **Eliminarla**, con el ícono de borrar.

Lo que **no** se puede hacer: cambiarle el texto a una subtarea ya creada, ni
reordenarlas. Si la descripción quedó mal, se elimina y se carga de nuevo.

Un punto importante: **llegar al 100% no cierra la reparación**. El avance y el
estado del ticket son dos cosas separadas; el cambio de estado sigue siendo una
decisión de la persona.

Al completar una subtarea el porcentaje se recalcula solo. Si en cambio agrega o
elimina subtareas, actualice la página para ver la columna *Avance* al día.

## Comentarios: por qué se está demorando

El comentario es una nota a nivel de la reparación entera, no de una subtarea.
Su caso de uso típico es dejar asentado el motivo de una demora: *"falta el
repuesto X, el proveedor lo entrega la semana que viene"*.

Se accede con el botón **Ver comentarios** de cada fila. Se escriben en el campo
*Nuevo comentario* y se publican con **Comentar**. Se listan del más nuevo al
más viejo, con el nombre de quien lo escribió y la fecha.

Dos cosas que conviene saber antes de escribir:

- **Un comentario no se edita ni se borra.** No es una restricción de permisos:
  el sistema directamente no tiene esa operación. Lo que se publica queda.
- El texto admite **hasta 2000 caracteres** y no puede estar vacío ni ser solo
  espacios.

## El contador del listado

En la columna **Comentarios**, el botón *Ver comentarios* muestra al lado un
número con la cantidad de comentarios que tiene esa reparación. Si no tiene
ninguno, no aparece número.

Sirve para barrer el listado de un vistazo: las reparaciones con varios
comentarios suelen ser las que vienen complicadas. Después de publicar un
comentario, actualice la página para ver el contador al día.

## Quién puede hacer cada cosa

| Acción | Permiso |
|---|---|
| Ver la reparación, sus subtareas y sus comentarios | `EDILICIA:LECTURA` |
| Agregar una subtarea, o publicar un comentario | `EDILICIA:ALTAS` |
| Completar una subtarea | `EDILICIA:MODIFICACION` |
| Eliminar una subtarea | `EDILICIA:BORRADO` |

Los comentarios no tienen visibilidad propia: quien puede ver la reparación, los
ve todos.
