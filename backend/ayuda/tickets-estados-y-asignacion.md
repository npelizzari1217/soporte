---
slug: tickets-estados-y-asignacion
titulo: Estados de un ticket, asignación y SLA
visibleParaSolicitante: true
---

# Estados de un ticket, asignación y SLA

## Los siete estados

- **Nuevo**: el ticket se acaba de crear y todavía no tiene responsable.
- **Asignado**: ya tiene responsable, pero el trabajo no empezó.
- **En proceso**: el responsable está trabajando en el ticket.
- **Esperando al cliente**: el trabajo está frenado a la espera de una respuesta
  del solicitante. El SLA queda en pausa.
- **Resuelto**: el trabajo terminó.
- **Cerrado**: el ticket quedó cerrado en forma definitiva.
- **Cancelado**: el ticket se dio de baja sin resolverse.

## El recorrido normal

Desde cada estado, el ticket solo puede pasar a ciertos estados:

| Desde | Puede pasar a |
|---|---|
| Nuevo | Asignado o Cancelado |
| Asignado | En proceso o Cancelado |
| En proceso | Esperando al cliente, Resuelto o Cancelado |
| Esperando al cliente | En proceso, Resuelto o Cancelado |
| Resuelto | Cerrado |
| Cerrado | Ninguno |
| Cancelado | Ninguno |

El recorrido normal no vuelve atrás: un ticket resuelto no regresa a
**En proceso**, y uno cerrado o cancelado no se reabre. Para eso existe la
corrección de estado, reservada a los administradores (ver más abajo).

Además de los cambios manuales, las tareas del ticket también mueven su estado.
Eso se explica en el artículo "Las tareas de un ticket".

## Cómo nace un ticket

Un ticket nace **Nuevo** y sin responsable, salvo que su tipo tenga una regla de
asignación automática (se configura en **Admin**, sección
**Asignación automática**). En ese caso nace **Asignado**, con el responsable de
la regla ya cargado.

La regla solo se aplica si su responsable todavía puede atender ese tipo de
ticket: tiene que ser un usuario con rol Técnico o Colaborador, con **Ver** sobre
el tipo. Si dejó de cumplirlo, el ticket nace **Nuevo**, sin responsable, y se
asigna a mano. Los pedidos que llegan por el link o el QR del cliente siguen la
misma regla.

## Asignar el responsable

En el detalle del ticket, el grupo **Responsable** de la tarjeta **Acciones**
aparece para quien tiene **Asignar** sobre el tipo. Tiene un selector
**Nuevo responsable** y un botón, cuyo efecto depende del estado del ticket.

El selector ofrece solo a los usuarios con rol Técnico o Colaborador que tienen
**Ver** sobre el tipo del ticket. Los usuarios con rol Administrador o Usuario no
reciben tickets.

- **Asignar y poner en proceso**: aparece con el ticket **Nuevo** o
  **Asignado**, si usted tiene además **Estado** sobre el tipo. Asigna al
  elegido y lleva el ticket a **En proceso** en una sola acción.
- **Cambiar responsable** (reasignar): aparece en los demás casos. Cambia el
  responsable sin tocar el estado, con una excepción: si el ticket estaba
  **Nuevo**, pasa a **Asignado**.

Un ticket **Cerrado** o **Cancelado** ya no se reasigna. Uno **Resuelto** solo lo
reasigna un usuario con rol Administrador o el administrador global.

Cada asignación queda en la **Actividad** del ticket como una entrada
**Asignación**, y cada cambio de estado, como un **Cambio de estado**.

## Cambiar el estado a mano

El grupo **Estado** aparece para quien tiene **Estado** sobre el tipo del
ticket. Elija el destino en **Nuevo estado** y presione **Confirmar**.

El selector ofrece los estados siguientes del recorrido normal, salvo los dos
pasos de arranque (de **Nuevo** a **Asignado** y de **Asignado** a
**En proceso**), que se hacen desde **Responsable** con
**Asignar y poner en proceso**. Por eso, con el ticket **Nuevo** o **Asignado**,
el grupo **Estado** solo ofrece **Cancelado**.

### Tickets resueltos, cerrados o cancelados

Con el ticket **Resuelto**, **Cerrado** o **Cancelado**, quien no es
Administrador no puede cambiar el estado, tampoco pasar un ticket resuelto a
**Cerrado**: el grupo muestra **Sin transiciones disponibles** y el motivo. En
esos estados el ticket solo admite comentarios, en cualquier tipo de ticket.

Solo los usuarios con rol Administrador y el administrador global cambian el
estado de un ticket en esos estados; en particular, son quienes pasan un ticket
de **Resuelto** a **Cerrado**.

### Corregir estado (solo administradores)

Los usuarios con rol Administrador y el administrador global ven además la
opción **Corregir estado**, con el botón **Corregir**. Permite llevar el ticket a
**Nuevo**, **Asignado**, **En proceso** o **Resuelto** salteando el recorrido
normal: sirve para volver atrás un cambio equivocado o para reabrir un ticket
cerrado o cancelado.

La corrección nunca lleva a **Cerrado**, **Cancelado** ni
**Esperando al cliente**: a esos estados solo se llega por el recorrido normal.

## Esperando al cliente

Cuando el responsable necesita información del solicitante, pasa el ticket de
**En proceso** a **Esperando al cliente**. En ese momento:

- El solicitante recibe un correo avisándole que el ticket espera su respuesta.
- El SLA queda en pausa: el tiempo que el ticket pasa esperando no cuenta. En la
  cabecera aparece **SLA en pausa** y, en lugar de la fecha de vencimiento, se
  lee **En pausa, esperando al cliente**.

El ticket sale de la espera de dos maneras:

- **Sola**, cuando el solicitante escribe un **comentario público** en el
  ticket: vuelve a **En proceso**, y en la actividad queda el cambio de estado a
  nombre del solicitante. Un comentario interno, o uno de otra persona, no lo
  saca de la espera.
- **A mano**, cuando alguien con **Estado** sobre el tipo lo pasa a
  **En proceso**, **Resuelto** o **Cancelado**.

Si el pedido llegó por el link o el QR del cliente, el solicitante no tiene
cuenta para comentar en el sistema: en ese caso el ticket se retoma a mano.

## Los avisos por correo al solicitante

Quien pidió el ticket recibe un correo cuando el ticket pasa a
**Esperando al cliente**, a **Resuelto** y a **Cerrado**, y cada vez que alguien
del equipo escribe un comentario público. Los comentarios internos no generan
correos.

## Las marcas del SLA en el detalle

En la cabecera del detalle, junto al estado y la prioridad, pueden aparecer
estas marcas:

- **SLA al día**: el ticket está dentro de su plazo o, si ya se resolvió, se
  resolvió a tiempo.
- **SLA vencido**: el plazo ya pasó sin resolverse o, si ya se resolvió, se
  resolvió tarde.
- **SLA en pausa**: el ticket está **Esperando al cliente**.
- **Primera respuesta vencida**: venció el plazo para la primera respuesta. La
  primera respuesta es el primer comentario público de alguien que no sea el
  solicitante. La marca también queda si esa respuesta llegó tarde.

Mientras el SLA corre, el dato **SLA vence** muestra la fecha y hora de
vencimiento. El SLA corre con el ticket **Nuevo**, **Asignado** o
**En proceso**. Un ticket sin SLA (por ejemplo, uno de mantenimiento preventivo)
no muestra marcas de SLA: en su lugar se ve la fecha de alta (**Creado**).
