---
slug: encuesta-satisfaccion
titulo: La encuesta de satisfacción al cerrar un ticket
visibleParaSolicitante: true
---

# La encuesta de satisfacción al cerrar un ticket

## Cómo funciona, del lado de quien pidió el ticket

Cuando un ticket pasa a **Cerrado**, y si tu cliente tiene la encuesta de
satisfacción habilitada, el sistema envía automáticamente un mail a quien
solicitó el ticket con un link para calificar la atención: un puntaje de 1 a
5 estrellas y, opcionalmente, un comentario. No hace falta iniciar sesión
para responder — el link alcanza por sí solo.

## Cómo se habilita para un cliente

La encuesta viene **apagada por defecto** para cada cliente nuevo — hay que
prenderla explícitamente. Eso lo hace quien administra la plataforma (ROOT),
no cada cliente por su cuenta: desde **Admin > Clientes**, con el botón
**Encuesta** en la fila del cliente, tildando "Encuesta de satisfacción
habilitada" y guardando. Mientras esté apagada, ningún ticket cerrado de ese
cliente envía el mail — no es que falle, es que no está prendida.

### El link es de un solo uso y vence a los 30 días

Una vez que se envía la respuesta, ese link deja de servir. Y aunque nunca
se responda, el link deja de ser válido a los **30 días** de haberse
generado. Pasado ese plazo, o después de responder, un nuevo clic en el
mismo link no vuelve a mostrar la encuesta.

### "Este link no es válido": por qué no distingue el motivo

Si el link venció, ya se usó, fue revocado o directamente no existe, la
página muestra siempre el **mismo mensaje genérico**: que el link no es
válido. No es un error del sistema ni una falla — es intencional: si el
mensaje distinguiera "ya respondiste" de "esto venció" de "esto no existe",
alguien que no tiene nada que ver con el ticket podría usar esas
diferencias para adivinar qué tickets existen en el sistema con solo probar
links al azar. Por eso el mensaje siempre es el mismo, sea cual sea el
motivo real.

**Consecuencia práctica que conviene conocer**: si respondiste la encuesta y
después volvés a entrar al mismo link (por ejemplo, lo abriste de nuevo
desde el mail), **NO vas a ver un "gracias por responder"** — vas a ver el
mismo mensaje genérico de "link no válido" que vería cualquier otro caso.
No significa que tu respuesta se haya perdido ni que algo se rompió: el
mensaje de agradecimiento solo se muestra una vez, en el momento en que se
envía la respuesta. Si volvés a entrar después, el sistema ya no puede (ni
debe) confirmarte que fuiste vos quien respondió.

### Si el ticket se reabre y se vuelve a cerrar

Cada cierre genera su propia encuesta. Si un ticket se reabre y se cierra
de nuevo, se envía un **link nuevo** — y el anterior, aunque nunca se haya
usado, queda invalidado en ese mismo momento. Si tenías el mail viejo
guardado, ese link ya no sirve: hay que responder con el del cierre más
reciente.

## Quién ve las respuestas

Las respuestas no las ve cualquiera: hace falta tener la casilla
`CSAT:LECTURA` en la matriz de permisos (ver el artículo de
[permisos y roles](permisos-y-roles)). Quien la tiene ve:

- El **promedio** y la **cantidad de respuestas** en el Dashboard.
- El **puntaje y el comentario** de la última respuesta, en el detalle de
  cada ticket.

Sin esa casilla en tu matriz, esos datos directamente no aparecen — no es
un error, es que tu usuario no tiene el permiso habilitado. Si te parece que
deberías verlos, consultá con quien administra tu cliente.

Un técnico con `CSAT:LECTURA` ve únicamente las respuestas de los tickets
que tiene asignados **en este momento**, nunca las de tickets ajenos. Ese
alcance sigue la asignación actual, no la histórica: si un ticket se
reasigna, el técnico que lo atendió y sobre el que se respondió la encuesta
deja de verla, y el técnico nuevo pasa a verla. Un administrador con
`CSAT:LECTURA` ve las respuestas de todo el cliente.

## Si un ticket se reabre después de tener respuesta

El puntaje y el comentario que se muestran son siempre los de la **última**
respuesta registrada para ese ticket. Si un ticket se reabrió, se volvió a
cerrar y se respondió de nuevo, el detalle muestra esa respuesta más
reciente — la anterior queda en el historial pero no es la que cuenta para
el promedio ni la que se ve en el detalle.
