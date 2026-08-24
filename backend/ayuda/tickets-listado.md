---
slug: tickets-listado
titulo: El listado de tickets: filtros, alcance y exportación a Excel
visibleParaSolicitante: true
---

# El listado de tickets: filtros, alcance y exportación a Excel

## Qué muestra el listado

Cada fila es un ticket, con su número, título, estado, prioridad y el
técnico asignado (si todavía no tiene uno, dice "Sin asignar"). Un clic en la
fila abre el detalle completo, con la descripción y el historial de
operaciones.

## Quién ve qué: el alcance por permiso

**No todos ven los mismos tickets.** Si tu usuario no tiene el permiso para
ver todos los tickets, el listado te muestra **únicamente los que vos
creaste** — los de cualquier otra persona no aparecen, ni siquiera contando
para la paginación. No es un filtro que se pueda cambiar desde la pantalla:
lo decide el permiso de tu usuario.

Si en cambio tenés el permiso de ver todos los tickets (típico de técnicos y
administradores), el listado muestra los de **todo el tenant**, y además se
habilita un filtro adicional para acotar por técnico asignado.

Esto explica el reclamo más común sobre esta pantalla: "no veo un ticket que
sé que existe". Antes de sospechar un error, confirmá si tu usuario tiene
permiso para ver todos los tickets — si no lo tiene, es esperable que solo
veas los propios.

## Los filtros

Arriba del listado hay filtros combinables (se aplican todos juntos, no uno
a la vez):

- **Estado** — el estado actual del ticket (Nuevo, Asignado, En proceso,
  Resuelto, Cerrado, Cancelado).
- **Tipo** — el tipo de ticket, según el catálogo del tenant.
- **Prioridad** — la prioridad cargada.
- **Asignado** — solo visible si tenés permiso para ver todos los tickets;
  filtra por el técnico responsable.
- **Búsqueda** — texto libre que busca coincidencias en el título o la
  descripción del ticket.

Los filtros se guardan en la URL de la página: podés compartir un link con
un filtro aplicado, o volver atrás con el botón del navegador para recuperar
el filtro anterior.

## Exportar a Excel

Arriba a la derecha del listado hay un botón **Exportar a Excel**. Baja un
archivo con los tickets del listado, que se abre con Excel (o con cualquier
planilla de cálculo) haciéndole doble clic.

Como en los demás listados del sistema, lo importante es **qué** baja: el
archivo trae **exactamente lo que los filtros de la pantalla están
mostrando, pero completo**, no solo las filas de la página que se ve. Si el
listado tiene 300 tickets repartidos en páginas de a 10, el archivo trae los
300.

El alcance por permiso descripto arriba también aplica a la exportación: si
tu usuario solo ve sus propios tickets en pantalla, el archivo exportado
tampoco va a traer los de otras personas — exportar no es una forma de
esquivar esa restricción.

El archivo incluye, además de las columnas del listado, la **fecha de
creación** y la **fecha de cierre** del ticket (esta última queda vacía si
el ticket sigue abierto). Los textos del estado y de la prioridad salen
igual que en pantalla, no como un código interno.

### "Hay demasiadas filas"

Si el listado filtrado es muy grande, la exportación no se hace y aparece un
aviso pidiendo que acotes los filtros activos. No es un error ni se perdió
nada: el archivo sería tan pesado que no habría con qué abrirlo cómodamente.

La salida es acotar el pedido combinando filtros — por ejemplo, elegir un
estado puntual, o buscar por una palabra del título — y repetir la
exportación las veces que haga falta.

## La encuesta de satisfacción al cerrar

Cuando un ticket pasa a **Cerrado** (y si tu cliente tiene la función
habilitada), quien lo solicitó recibe automáticamente un mail para calificar
la atención con estrellas y un comentario opcional — no hace falta que nadie
la cargue a mano. El puntaje y el comentario, si los hay, se ven en el
detalle del ticket para quien tenga el permiso `CSAT:LECTURA`. Los detalles
del link (uso único, vencimiento, qué pasa si se reabre el ticket) están en
el artículo de [la encuesta de satisfacción](encuesta-satisfaccion).
