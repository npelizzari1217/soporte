---
slug: reparaciones-edilicias
titulo: Subtareas y comentarios de una reparación edilicia
visibleParaSolicitante: false
---

# Subtareas y comentarios de una reparación edilicia

Una reparación tiene dos herramientas de seguimiento que se parecen pero sirven
para cosas distintas: las **subtareas**, que miden el avance, y los
**comentarios**, que explican qué está pasando.

## Subtareas: el checklist que mueve el avance

Cada fila del listado de reparaciones tiene un botón **Ver subtareas**. Ahí se
carga la lista de pasos concretos del trabajo. Son las **tareas del ticket** de
la reparación: las mismas que aparecen en la sección **Tareas** del detalle del
ticket, así que lo que se haga en un lado se ve en el otro.

Cada tarea muestra su descripción, su **técnico** (o *Sin técnico*), si está
pendiente o completada y, si lo está, cuándo y quién la completó.

El porcentaje de la columna **Avance** sale directamente de ese checklist:

> avance = tareas completadas ÷ tareas activas × 100

Se muestra con hasta dos decimales, así que una de tres da `33.33%`. Una
reparación **sin tareas queda en 0%**: el avance no se puede cargar a mano,
solo se mueve cargando y completando tareas. Las tareas eliminadas no
cuentan ni arriba ni abajo de la división.

Lo que se puede hacer con una tarea:

1. **Agregarla**, escribiendo su descripción en el campo *Nueva tarea*.
2. **Asignarle un técnico**, o quitárselo eligiendo *Sin técnico*. La lista
   solo ofrece técnicos que pueden atender reparaciones edilicias.
3. **Completarla**, con el botón **Completar**. Queda registrado quién la
   completó y cuándo.
4. **Descompletarla**, con el botón **Descompletar**, si se marcó por error.
   Vuelve a pendiente y se borra el registro de quién la había completado.
5. **Eliminarla**, con el ícono de borrar. El sistema pide confirmación antes.

Lo que **no** se puede hacer: cambiarle el texto a una tarea ya creada, ni
reordenarlas. Si la descripción quedó mal, se elimina y se carga de nuevo.

Quién ve cada botón depende de su relación con el ticket (ver "Quién puede
hacer cada cosa" más abajo). Quien solo puede leer la reparación ve el
checklist completo, con el técnico de cada tarea, sin botones.

Un punto importante: **las tareas mueven el estado del ticket**. Al completar la
primera, el ticket pasa a "En proceso" (y si todavía no tenía responsable, queda
asignado a quien la completó). Al completar la última, el ticket pasa a
"Resuelto", con su fecha de cierre y el aviso al solicitante, igual que si se lo
resolviera a mano. Si después se descompleta una tarea de un ticket resuelto, el
ticket vuelve a "En proceso". Resolver a mano con tareas pendientes sigue siendo
posible.

El porcentaje se recalcula solo: al completar o descompletar una tarea, y
también al agregar o eliminar una. Tenga en cuenta que agregar una tarea *baja*
el avance, porque cambia el total sobre el que se calcula.

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
comentarios suelen ser las que vienen complicadas. El contador se actualiza solo
al publicar un comentario.

## Bloqueada por una compra

Una reparación puede quedar frenada mientras se espera un repuesto que se pidió
por el módulo de Compras. Cuando eso pasa, el listado le muestra el chip
**Bloqueada** en la fila correspondiente.

Este chip **es automático**: no lo marca nadie a mano. Aparece solo cuando la
reparación tiene una compra vinculada que todavía está en curso, y desaparece
solo cuando deja de tenerla. No hay ningún botón para "marcar como bloqueada" ni
para "desbloquear" — la única forma de que el chip cambie es actuando sobre la
compra que lo causa.

Un punto que conviene tener claro: **el bloqueo no toca el avance**. La columna
**Avance** (`porcentajeAvance`) sigue calculándose exactamente igual que
siempre, a partir del checklist de subtareas — vea "Subtareas: el checklist que
mueve el avance" más arriba. Una reparación puede estar al 80% de avance y
figurar bloqueada al mismo tiempo: son dos cosas independientes. El bloqueo no
es un freno al progreso registrado, es una señal de que hace falta algo externo
para poder seguir.

### Cómo se gestiona

En la misma fila donde aparece el chip hay un botón **Gestionar compras**. Ahí
se ve:

- La lista de compras que hoy están frenando la reparación (si hay alguna).
- Un selector para **vincular** una compra nueva — solo muestra compras que
  todavía están activas (no tiene sentido vincular una ya entregada o
  cancelada, porque no bloquearía nada).
- Un botón **Desvincular** al lado de cada compra ya vinculada, para el caso de
  un vínculo cargado por error.

### Cuándo deja de bloquear

Una compra vinculada deja de frenar la reparación —y el chip se apaga solo— en
alguno de estos tres casos:

1. La compra pasa a **entregada**. Ojo con la palabra: no es "recibida". Que el
   depósito reciba la mercadería no le sirve de nada al técnico si todavía no la
   tiene en la mano — el bloqueo se sostiene hasta la entrega real.
2. La compra se **cancela**.
3. El ítem pendiente de la compra se **cierra con faltante** (se decide seguir
   adelante sin ese repuesto).

En cualquiera de los tres casos, si esa era la única compra que la frenaba, la
reparación deja de estar bloqueada sin que nadie tenga que tocar nada en la
pantalla de reparaciones — el cambio se hace del lado de la compra.

## Quién puede hacer cada cosa

| Acción | Quién puede |
|---|---|
| Ver la reparación, sus subtareas y sus comentarios | **Ver** sobre el tipo del ticket |
| Agregar una subtarea | El responsable de la reparación, un ADMINISTRADOR o ROOT, con **Modificar** sobre el tipo del ticket |
| Asignar o quitar el técnico de una subtarea | El responsable de la reparación, un ADMINISTRADOR o ROOT, con **Modificar** sobre el tipo del ticket |
| Publicar un comentario | **Crear** o **Comentar** sobre el tipo del ticket |
| Completar o descompletar una subtarea | El técnico de la subtarea, el responsable de la reparación, un ADMINISTRADOR o ROOT |
| Eliminar una subtarea | El responsable de la reparación, un ADMINISTRADOR o ROOT, con **Modificar** sobre el tipo del ticket |
| Vincular una compra a una reparación | **Modificar** sobre el tipo del ticket **y** `COMPRAS:LECTURA` (las dos) |
| Desvincular una compra de una reparación | **Modificar** sobre el tipo del ticket **y** `COMPRAS:LECTURA` (las dos) |

Los comentarios de la reparación son los comentarios del ticket: quien puede ver
la reparación ve los públicos, y los internos solo quien tiene **Comentario
interno** sobre el tipo.

Las dos filas de compras no son una aclaración de qué botones se ven en
pantalla: es el permiso que el servidor exige de verdad. A alguien al que le
falte `COMPRAS:LECTURA` el sistema le rechaza el vínculo aunque de alguna forma
consiga disparar la acción — la interfaz simplemente no le muestra el botón
para no ofrecerle algo que igual le va a fallar.
