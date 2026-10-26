---
slug: sla-y-prioridades
titulo: El SLA y las prioridades: plazos, pausas y avisos de vencimiento
visibleParaSolicitante: true
---

# El SLA y las prioridades: plazos, pausas y avisos de vencimiento

El **SLA** es el plazo en el que un ticket debería quedar resuelto. En este sistema
el plazo no se configura ticket por ticket: lo define la **prioridad** del ticket.

## Dónde se configuran las prioridades

Las prioridades se administran desde **Admin > Catálogos**, en la pestaña
**Prioridades**. Esta pantalla la usan el **Administrador** del cliente y el
administrador de la plataforma (ROOT).

La tabla muestra estas columnas:

| Columna | Qué muestra |
|---|---|
| **Código** | El identificador de la prioridad |
| **Nombre** | El nombre que se ve en los tickets |
| **Orden** | La posición en la que se listan las prioridades |
| **SLA** | Las horas de resolución, o **Sin SLA**. Si el SLA está apagado, se lee "(inactivo)" junto a las horas |
| **Primera respuesta** | Las horas de la meta de primera respuesta, o **Sin meta** |
| **Estado** | **Activa** o **Baja** |

Con **Nueva prioridad** o **Editar** se abre un formulario con estos campos:

- **Código**: mayúsculas, números y guion bajo, sin espacios.
- **Nombre**.
- **Color (opcional)**.
- **Orden**: un número entero.
- **Horas de SLA (resolución objetivo)**: un número entero mayor a 0. Vacío
  significa que la prioridad no tiene SLA.
- **SLA activo**: si se desmarca, los tickets de esa prioridad no tienen plazo de
  resolución, aunque la prioridad tenga horas cargadas.
- **Primera respuesta (h)**: un número entero mayor a 0. Vacío significa que no
  hay meta de primera respuesta. Esta meta no depende de la casilla **SLA activo**.

Las acciones **Dar de baja** y **Activar** de cada fila piden confirmación.

## Cómo se cuenta el plazo

El plazo se mide en **horas hábiles**: solo cuentan las horas dentro del horario
laboral del cliente, y no cuentan los feriados. Está explicado en el artículo
sobre el horario laboral y los feriados.

- **El plazo se fija al crear el ticket**, con las horas que tiene en ese momento
  su prioridad.
- **Si se cambian las horas de una prioridad**, los tickets que ya existen
  conservan su plazo. El cambio rige para los tickets nuevos.
- **Si se le cambia la prioridad a un ticket**, su plazo se recalcula con la
  prioridad nueva, sin perder el tiempo que ya llevaba acumulado.
- **Los tickets de tipo Preventivo no tienen SLA.**

## La pausa mientras se espera al cliente

El reloj de resolución corre mientras el ticket está en **Nuevo**, **Asignado** o
**En proceso**. Se detiene cuando el ticket pasa a **Esperando al cliente** y vuelve a
correr cuando sale de ese estado, desde donde había quedado.

También se detiene en **Resuelto**. Si el ticket se reabre, el reloj sigue
contando sobre el tiempo que ya tenía.

Al pasar a **Esperando al cliente**, quien pidió el ticket recibe un correo que le
avisa que se necesita su respuesta. Comentar no cambia el estado por sí solo:
quien atiende el ticket lo vuelve a poner en curso.

## La primera respuesta

Además del plazo de resolución, una prioridad puede tener una meta de **primera
respuesta**: cuánto se puede tardar en dar la primera respuesta al pedido.

- Cuenta como primera respuesta el **primer comentario público** de alguien que no
  sea quien pidió el ticket, mientras el ticket no esté resuelto, cerrado ni
  cancelado.
- Los comentarios internos no cuentan, y tampoco los que llegan desde un sistema
  externo conectado por la API.
- Este plazo **no se pausa** en **Esperando al cliente**.
- Una vez registrada la primera respuesta, cambiar la prioridad ya no la modifica.

## Cómo se ve en un ticket

En el encabezado del detalle de un ticket aparecen estas etiquetas:

| Etiqueta | Significado |
|---|---|
| **SLA al día** | El plazo todavía no venció, o el ticket se resolvió a tiempo |
| **SLA en pausa** | El ticket está en Esperando al cliente. En lugar de la fecha de vencimiento se lee "En pausa, esperando al cliente" |
| **SLA vencido** | El plazo venció, o el ticket se resolvió fuera de término |
| **Primera respuesta vencida** | Venció la meta de primera respuesta sin que se respondiera a tiempo |

Mientras el plazo corre, el encabezado muestra también la fecha y la hora en que
vence, bajo **SLA vence**. Un ticket sin SLA no muestra ninguna de las tres
primeras etiquetas.

## Los avisos de vencimiento

El sistema revisa los plazos cada pocos minutos. Cuando un plazo vence, envía un
correo:

- **SLA vencido**: al técnico asignado y a todos los administradores del cliente.
- **Primera respuesta vencida**: a los mismos destinatarios.

Cada vencimiento se avisa una sola vez. Si después se cambia la prioridad y el
plazo nuevo queda en el futuro, el sistema puede volver a avisar cuando ese plazo
nuevo venza.

El sistema **no cambia la prioridad por su cuenta**: un ticket vencido conserva la
prioridad que tenía. Los correos se explican en el artículo sobre las
notificaciones por correo.

## Dónde se mide el cumplimiento

El porcentaje de tickets resueltos dentro del SLA y el de primera respuesta a
tiempo se ven en el Dashboard. Allí también está la tabla **Cumplimiento del
técnico**, que mide a cada técnico contra las mismas horas del SLA pero en su
propio horario. Está explicado en el artículo sobre el Dashboard.
