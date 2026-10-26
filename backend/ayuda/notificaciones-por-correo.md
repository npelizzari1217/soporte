---
slug: notificaciones-por-correo
titulo: Qué correos envía el sistema, a quién y cuándo
visibleParaSolicitante: true
---

# Qué correos envía el sistema, a quién y cuándo

El sistema avisa por correo cuando pasa algo que requiere la atención de alguien.
Este artículo reúne todos los avisos: primero los que recibe quien pide ayuda,
después los del equipo de soporte.

## Antes de empezar: el correo de cada cliente

Los correos salen de la cuenta de correo de su organización, que configura el
administrador de la plataforma. **Si su organización no tiene el correo
configurado, el sistema no envía ningún aviso**: el trabajo sigue normalmente,
pero nadie recibe correos.

Dos reglas valen para todos los avisos:

- Un correo que no se pudo enviar **nunca deshace** lo que lo originó. Si un aviso
  falla, el comentario o el cambio de estado quedan registrados igual.
- Una persona sin dirección de correo cargada no recibe avisos.

## Si usted pidió el ticket

Usted recibe un correo cuando:

- **Su ticket pasa a Resuelto o a Cerrado.** El correo indica el estado anterior y
  el nuevo.
- **Su ticket pasa a Esperando al cliente.** Significa que el equipo de soporte
  necesita una respuesta suya para seguir. Si tiene usuario en el sistema, puede
  responder con un comentario en el ticket. Mientras el ticket espera su respuesta, el plazo de atención se detiene.
- **Alguien más agrega un comentario público** en su ticket: un técnico, un
  administrador o un sistema externo conectado al de soporte.
- **Su ticket se cierra y su organización tiene la encuesta de satisfacción
  habilitada.** El correo trae un enlace para calificar la atención. Está
  explicado en el artículo sobre la encuesta de satisfacción.

Los demás cambios de estado (por ejemplo, cuando el ticket pasa a En proceso) no
envían correo.

### Si pidió ayuda desde el formulario público

Quien pide ayuda desde el enlace de soporte o desde el código QR de un equipo, sin
haber iniciado sesión, recibe dos correos:

1. **Un correo para confirmar el pedido**, con un enlace que vence a las 24 horas.
   Hasta que no se confirma, el pedido no llega al equipo de soporte. Si usted no
   hizo ese pedido, puede ignorar el correo: no se crea nada.
2. **Un correo con el número del ticket**, apenas se confirma el pedido. Conviene
   guardar ese número.

Como quien pide de esta forma no tiene usuario en el sistema, los correos que
recibe después no traen el enlace al ticket.

### Si olvidó su contraseña

Al pedir el restablecimiento desde la pantalla de ingreso, usted recibe un correo
con un enlace que vence a los 60 minutos. Cuando cambia la contraseña con ese
enlace, recibe otro correo que confirma el cambio. Si no fue usted quien la
cambió, avise a su administrador.

## Si usted atiende tickets

Usted recibe un correo cuando:

- **Se le asigna un ticket**, ya sea a mano o por la regla de asignación
  automática de su tipo. El aviso llega también si usted mismo se asigna el
  ticket, e indica el tipo y la prioridad.
- **Quien pidió un ticket que usted tiene asignado agrega un comentario
  público.**
- **Vence el SLA** de un ticket que usted tiene asignado.
- **Vence la meta de primera respuesta** de un ticket que usted tiene asignado.

Si usted es el responsable de un plan de mantenimiento preventivo, además recibe:

- **Un aviso cada vez que el plan genera un ticket**, con su fecha objetivo.
- **Un recordatorio el día anterior a la fecha objetivo**, si el ticket sigue
  abierto. No hay recordatorio si el ticket se generó ese mismo día.

Si la regla de asignación automática asigna a usted el ticket que generó un plan
del que también es responsable, recibe los dos avisos: el de asignación y el de
ticket generado.

## Si usted es administrador

Los usuarios con rol **Administrador** del cliente reciben un correo cuando:

- **Vence el SLA** de cualquier ticket.
- **Vence la meta de primera respuesta** de cualquier ticket.
- **Un plan de mantenimiento preventivo genera un ticket.**
- **Quien pidió un ticket que todavía no tiene técnico asignado agrega un
  comentario público.**

Si un administrador es además el técnico asignado, recibe un solo correo por cada
vencimiento.

## Lo que nunca genera un aviso

- **Su propio comentario.** Nadie recibe aviso de lo que escribió.
- **Los comentarios internos.** No se avisan a nadie, ni siquiera al equipo de
  soporte.
- **Un ciclo de mantenimiento preventivo que no generó ticket**, porque el anterior
  seguía abierto o porque quedó atrasado.

Los vencimientos se explican en el artículo sobre SLA y prioridades, y los planes
preventivos en el artículo sobre el mantenimiento preventivo.
