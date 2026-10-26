---
slug: tickets-detalle
titulo: El detalle de un ticket: acciones, actividad y tiempo del técnico
visibleParaSolicitante: true
---

# El detalle de un ticket: acciones, actividad y tiempo del técnico

El detalle se abre al hacer clic en una fila del listado de **Tickets**. Lo que
usted ve y puede hacer en esta pantalla depende de los permisos que tiene sobre
el **tipo** de ese ticket (la grilla **Tipos de ticket** de los permisos del
usuario): un botón que no le corresponde, directamente no aparece.

## La cabecera

Arriba se muestran el número, el título, el estado, la prioridad y, si
corresponde, las marcas del SLA (**SLA al día**, **SLA vencido**,
**SLA en pausa** y **Primera respuesta vencida**). Su significado se explica en
el artículo "Estados de un ticket, asignación y SLA".

Debajo aparecen la descripción y estos datos:

- **Tipo**, **Solicitante** y **Asignado** (o **Sin asignar**).
- **Teléfono**: solo si el solicitante es una persona externa que pidió soporte
  por el formulario público y dejó su teléfono. Ver el artículo "Pedir soporte
  con el link o el QR, sin cuenta".
- **Ubicación** y **Sector**, en cualquier tipo de ticket. Un guion indica que
  están vacíos.
- **Fecha objetivo**: solo en los tickets que genera un plan preventivo.
- **SLA vence**, con fecha y hora. Si el SLA está en pausa se lee
  **En pausa, esperando al cliente**; si el ticket no tiene SLA, se muestra la
  fecha de alta (**Creado**).

Si quien pidió el ticket ya respondió la encuesta de satisfacción y usted tiene la casilla
**LECTURA** de la fila **Satisfacción**, también se ve el puntaje y el
comentario.

En un ticket de soporte vinculado a un equipo, una tarjeta
**Equipo en mantenimiento** muestra el nombre del equipo y su número de serie.

## La tarjeta Acciones

Las acciones están agrupadas, y cada control tiene su etiqueta y su botón:

- **Responsable**: asignar o cambiar el responsable del ticket. Exige
  **Asignar** sobre el tipo.
- **Estado**: cambiar el estado del ticket. Exige **Estado** sobre el tipo.
- **Ticket**: los botones **Editar**, **Descargar PDF** y **Borrar**.

Cómo funcionan **Responsable** y **Estado** se explica en el artículo "Estados
de un ticket, asignación y SLA".

### Editar

El botón **Editar** exige **Modificar** sobre el tipo y abre el diálogo
**Editar ticket**, con **Título**, **Descripción**, **Prioridad**, **Ubicación**
y **Sector**. Presione **Guardar** para aplicar los cambios.

Los datos del ticket solo se editan mientras está **Nuevo** o **Asignado**. Una
vez que pasa a **En proceso**, el botón desaparece y se lee el aviso
**En proceso: solo ROOT puede editar.**: desde ese momento solo puede editarlo
el administrador global de la plataforma.

La **Ubicación** es texto libre, de hasta 255 caracteres. El **Sector** se elige
de los sectores activos del cliente, o se deja en **Sin sector**. Si el ticket
tiene un sector que después se dio de baja, el selector lo muestra con la marca
"(dado de baja)" para que no se pierda al guardar. Los mismos dos campos están
en el formulario de alta. Cambiar la ubicación o el sector no deja una entrada en
la actividad del ticket.

### Descargar PDF

El botón **Descargar PDF** exige **Imprimir** sobre el tipo. Baja la ficha del
ticket en PDF. El PDF **nunca incluye los comentarios internos**, aunque usted
pueda verlos en pantalla.

### Borrar

El botón **Borrar** exige **Borrar** sobre el tipo y pide confirmación. El
ticket borrado deja de verse en listados, exportaciones y métricas; sus
adjuntos, comentarios e historial se conservan.

El sistema no deja borrar el ticket en estos casos, y el aviso dice qué hay que
resolver antes:

- Tiene **tareas pendientes**: hay que completarlas o eliminarlas.
- Tiene **compras vinculadas**: hay que desvincularlas.
- Es un ticket de **mantenimiento preventivo**: no se borra nunca, ni siquiera
  un administrador, porque lo genera el sistema a partir de su plan.

En un ticket **Resuelto**, **Cerrado** o **Cancelado**, solo lo puede borrar un
usuario con rol Administrador o el administrador global.

Un ticket borrado solo lo pueden recuperar un usuario con rol Administrador o el
administrador global, desde el listado de **Tickets** con el filtro
**Borrados** y el botón **Recuperar**. Vuelve con el mismo estado y los mismos
datos. El borrado y la recuperación quedan registrados en la actividad como
entradas internas.

## Tareas, tiempo del técnico y compras

Debajo de las acciones está la sección **Tareas**, presente en cualquier tipo de
ticket. Se explica en el artículo "Las tareas de un ticket".

### Tiempo del técnico

La tarjeta **Tiempo del técnico** muestra cuánto tiempo tuvo el ticket cada
técnico. Cada fila es un **tramo**: el período en que un técnico fue el
responsable. Un tramo empieza cuando el técnico recibe el ticket y termina
cuando se lo reasignan, cuando el ticket queda sin responsable, o cuando pasa a
**Resuelto**, **Cerrado** o **Cancelado**.

Las columnas son:

- **Técnico**, **Desde** y **Hasta** (vacío mientras el tramo sigue abierto).
- **Horas hábiles**: el tiempo contado en el horario laboral **del propio
  técnico** (o en el del cliente, si el técnico no tiene uno), descontando los
  feriados y el tiempo en que el ticket estuvo **Esperando al cliente**.
- **Meta**: la meta del SLA del ticket.
- **Resultado**: **En curso** mientras el tramo sigue abierto; **Cumplido** o
  **No cumplido** según las horas hábiles hayan quedado dentro de la meta o no;
  o **Sin veredicto**, con el motivo.

**Solo se evalúa el tramo que termina con el ticket resuelto.** Un tramo que
terminó por otra causa guarda su tiempo pero queda **Sin veredicto**, con el
motivo **Reasignado**, **Desasignado**, **Cerrado sin resolver** o
**Cancelado**. También queda sin veredicto si el ticket no tenía meta de SLA
(**Sin meta de SLA**) o si la medición no se pudo hacer (**Sin medición**).

La tarjeta la ve cualquiera que vea el ticket. Si el ticket no tiene tramos, la
tarjeta no aparece; eso pasa, por ejemplo, con los tickets que ya estaban
asignados antes de que el sistema empezara a medir los tramos.

### Compras vinculadas

Quien tiene la casilla **LECTURA** de la fila **Compras** ve la sección
**Compras vinculadas**, con las compras asociadas al ticket. Una compra en curso
lleva la marca **Bloquea**, y el ticket muestra
**Bloqueado por una compra en curso**: mientras tanto, sus tareas no se pueden
modificar. Vincular y desvincular compras exige además **Modificar** sobre el
tipo del ticket.

## Actividad: comentarios, adjuntos e historial

La sección **Actividad** tiene arriba el formulario para comentar y adjuntar, y
debajo la línea de tiempo del ticket.

### Comentar

Con **Comentar** sobre el tipo, usted ve el campo **Comentario** y el botón
**Enviar**.

- Un comentario **público** lo ve cualquiera que vea el ticket, incluido el
  solicitante. Además, se avisa por correo a la otra parte: si comenta el
  solicitante, recibe el aviso el responsable (o, si el ticket no tiene
  responsable, los administradores del cliente); si comenta otra persona,
  recibe el aviso el solicitante.
- Un comentario **interno** solo lo ven quienes tienen **Comentario interno**
  sobre el tipo, y no genera ningún correo. Para escribirlo, marque la casilla
  **Comentario interno (no visible para el solicitante)**, que solo aparece si
  usted tiene ese permiso.

Si el cliente tiene respuestas predefinidas activas, junto al campo aparece
**Insertar respuesta**. Al elegir una del selector, su texto se agrega al
comentario: si el campo ya tenía texto, se agrega en una línea nueva sin
borrarlo. **Insertar no envía el comentario**: usted puede revisarlo y editarlo
antes de presionar **Enviar**.

### Adjuntar un archivo

Con **Crear** o **Modificar** sobre el tipo, aparece **Adjuntar archivo**. Se
aceptan imágenes, PDF, documentos de Office (Word, Excel y PowerPoint) y
archivos ZIP, de hasta 10 MB. Un archivo vacío o de otro tipo se rechaza con un
aviso antes de subirlo. Cada adjunto queda como una entrada **Adjunto** en la
actividad, con el nombre del archivo.

### La línea de tiempo

La línea de tiempo muestra **lo más nuevo arriba**. Cada entrada tiene su tipo,
su fecha y hora y, si corresponde, un texto: **Cambio de estado**,
**Comentario**, **Asignación**, **Adjunto**, las entradas de tareas
(**Tarea agregada**, **Técnico de tarea**, **Tarea completada**,
**Tarea descompletada**, **Tarea eliminada**) y **Ticket borrado** o
**Ticket recuperado**.

Las entradas internas llevan la marca **Interno** y solo las ve quien tiene
**Comentario interno** sobre el tipo. A los demás no les aparecen.

## Tickets resueltos, cerrados o cancelados: solo comentarios

Cuando un ticket está **Resuelto**, **Cerrado** o **Cancelado**, quien no es
Administrador **solo puede comentarlo**, públicamente o en forma interna, en
cualquier tipo de ticket. No puede editarlo, cambiar su responsable, adjuntar
archivos, tocar sus tareas, vincular o desvincular compras, borrarlo ni cambiar
su estado (tampoco pasar un ticket resuelto a **Cerrado**). La pantalla lo
indica con el aviso "El ticket está resuelto: solo admite comentarios." (o
cerrado, o cancelado).

Los usuarios con rol Administrador y el administrador global quedan exentos:
pueden seguir trabajando el ticket (responsable, tareas, adjuntos, compras y
borrado), cerrarlo, y corregir o reabrir su estado. La edición de los datos del
ticket sigue la regla de **Editar** descrita arriba.
