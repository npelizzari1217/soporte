---
slug: mantenimiento-preventivo
titulo: El mantenimiento preventivo se genera solo
visibleParaSolicitante: false
---

# El mantenimiento preventivo se genera solo

Un **plan de mantenimiento preventivo** describe una tarea que hay que repetir
cada tanto: revisar un equipo cada 90 días, hacer una ronda por una ubicación
todos los meses. Una vez que el plan existe, **nadie tiene que acordarse de
nada**: el sistema crea el ticket de mantenimiento por su cuenta, el día que
corresponde.

## Cuándo aparecen los tickets

Una vez por día el sistema revisa todos los planes activos y, por cada uno que
haya llegado a su fecha, crea un ticket de tipo **Mantenimiento**. El ticket
queda a nombre del responsable del plan, con el título y las instrucciones que
el plan tenga cargados.

Las fechas se calculan **siempre desde la fecha de inicio del plan**, no desde
el último ticket. Un plan mensual que arrancó un 31 de enero cae el 28 de
febrero y vuelve al 31 de marzo: no se va corriendo hacia atrás con los meses
cortos.

## Por qué a veces NO aparece un ticket

Esta es la parte que más confunde, así que va derecho: **si el preventivo
anterior de ese plan todavía está abierto, el sistema no crea uno nuevo.**

Es a propósito. Si el mantenimiento de marzo nunca se atendió, apilar encima
el de abril, el de mayo y el de junio no ayuda a nadie: multiplica tickets
abiertos por un trabajo que en realidad es uno solo. El ciclo queda registrado
como **salteado**, la fecha del plan avanza igual, y el próximo ciclo se
genera normalmente **una vez que el ticket abierto se resuelva, se cierre o se
cancele**.

O sea: si esperabas un ticket de mantenimiento y no está, lo primero que
conviene mirar es si quedó uno anterior sin cerrar.

## Si el sistema estuvo apagado unos días

Cuando un plan quedó atrasado varios ciclos —porque el sistema estuvo
detenido, por ejemplo— **no se genera una ráfaga de tickets viejos**. Se crea
**un solo ticket**, el del ciclo vencido más reciente, y los anteriores quedan
registrados como salteados. El objetivo es que alguien salga a hacer el
mantenimiento ahora, no que se encuentre con quince tickets atrasados que ya
no tienen sentido.

## Quién se entera cuando se genera un ticket

Cuando el sistema crea el ticket, avisa por email al **responsable del plan** y a
**todos los administradores** del tenant. El aviso llega en el momento en que el
ticket queda creado — no antes.

El aviso **solo llega si se creó un ticket nuevo**. En los dos casos donde el
sistema NO genera (preventivo anterior sin cerrar, o un ciclo que quedó
registrado como salteado por atraso) **no se manda ningún email**: no tiene
sentido notificar algo que no pasó. Si un destinatario no recibe el aviso, no
significa que el ticket no se haya creado — conviene revisar el listado de
generaciones del plan antes de asumir un problema de notificación.

## Dar de baja un plan

Un plan dado de baja **deja de generar** en el acto. Los tickets que ya generó
no se tocan: siguen su curso como cualquier otro ticket.

## Quién puede ver y administrar los planes

El acceso se controla con el módulo **Preventivo**, con sus cuatro permisos
habituales (ver, crear, modificar y dar de baja). Sin el permiso de lectura,
el módulo no aparece. El detalle de cómo se asignan los permisos está en el
artículo de permisos y roles.
