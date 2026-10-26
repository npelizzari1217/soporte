---
slug: encuesta-satisfaccion
titulo: La encuesta de satisfacción al cerrar un ticket
visibleParaSolicitante: true
---

# La encuesta de satisfacción al cerrar un ticket

## Cómo funciona, del lado de quien pidió el ticket

Cuando un ticket pasa a **Cerrado**, y si su organización tiene la encuesta de
satisfacción habilitada, el sistema envía automáticamente un correo a quien pidió
el ticket con un enlace para calificar la atención: un puntaje de 1 a 5 estrellas
y, de forma opcional, un comentario. No hace falta iniciar sesión para responder:
el enlace alcanza por sí solo.

El correo sale de la cuenta de correo de su organización. Si esa cuenta no está
configurada, la encuesta no se envía.

## Cómo se habilita para un cliente

La encuesta viene **apagada** para cada cliente nuevo: hay que habilitarla de forma
explícita. Lo hace el administrador de la plataforma (ROOT), no cada cliente por
su cuenta: desde el ítem **Clientes** de la sección **ROOT** del menú, con el botón
**Encuesta** en la fila del cliente, marcando **Encuesta de satisfacción
habilitada** y guardando. Mientras esté apagada, ningún ticket cerrado de ese
cliente envía el correo: no es que falle, es que no está habilitada.

### El enlace es de un solo uso y vence a los 30 días

Una vez que se envía la respuesta, ese enlace deja de servir. Y aunque nunca se
responda, el enlace deja de ser válido a los **30 días** de haberse generado.
Pasado ese plazo, o después de responder, un nuevo clic en el mismo enlace no
vuelve a mostrar la encuesta.

### "Este link de encuesta no es válido o ya fue utilizado": por qué no distingue el motivo

Si el enlace venció, ya se usó, fue reemplazado o directamente no existe, la página
muestra siempre el **mismo mensaje**: "Este link de encuesta no es válido o ya fue
utilizado." No es un error del sistema: es intencional. Si el mensaje distinguiera
"ya respondió" de "esto venció" o de "esto no existe", alguien ajeno al ticket
podría usar esas diferencias para averiguar qué tickets existen con solo probar
enlaces al azar.

**Consecuencia práctica**: si usted respondió la encuesta y después vuelve a
entrar al mismo enlace (por ejemplo, lo abre de nuevo desde el correo), **no va a
ver un agradecimiento**: va a ver el mismo mensaje de enlace no válido. No
significa que su respuesta se haya perdido. El agradecimiento se muestra una sola
vez, en el momento en que se envía la respuesta.

### Si el ticket se reabre y se vuelve a cerrar

Cada cierre genera su propia encuesta. Si un ticket se reabre y se cierra de
nuevo, se envía un **enlace nuevo**, y el anterior, aunque nunca se haya usado,
queda invalidado en ese mismo momento. Si conserva el correo viejo, ese enlace ya
no sirve: hay que responder con el del cierre más reciente.

## Quién ve las respuestas

Las respuestas no las ve cualquiera: hace falta tener la casilla **LECTURA** en la
fila **Satisfacción** de la matriz de permisos (el funcionamiento de la matriz
está en el artículo sobre permisos y roles). Quien la tiene ve:

- El **promedio** y la **cantidad de respuestas** en el Dashboard, para el ciclo
  elegido.
- El **puntaje y el comentario** de la última respuesta, en el detalle de cada
  ticket.

Sin esa casilla, esos datos directamente no aparecen: no es un error, es que el
usuario no tiene el permiso. Si le parece que debería verlos, consulte con quien
administra su cliente.

El alcance depende del rol:

- Un **Técnico** con la casilla ve únicamente las respuestas de los tickets que
  tiene asignados **en este momento**, nunca las de tickets ajenos. Ese alcance
  sigue la asignación actual, no la histórica: si un ticket se reasigna, el técnico
  que lo atendió deja de ver la respuesta, y el técnico nuevo pasa a verla.
- Los demás roles con la casilla ven las respuestas de los tickets que pueden ver.
- Un **Administrador** ve las respuestas de todo el cliente.

## Si un ticket se reabre después de tener respuesta

El puntaje y el comentario que se muestran son siempre los de la **última**
respuesta registrada para ese ticket. Si un ticket se reabrió, se volvió a cerrar
y se respondió de nuevo, el detalle muestra esa respuesta más reciente. La
anterior queda registrada, pero no es la que cuenta para el promedio ni la que se
ve en el detalle.
