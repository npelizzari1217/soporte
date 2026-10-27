---
slug: dashboard
titulo: El Dashboard: indicadores, ciclo y cómo se miden los tiempos
visibleParaSolicitante: true
---

# El Dashboard: indicadores, ciclo y cómo se miden los tiempos

El **Dashboard** reúne en una sola pantalla los indicadores de la atención de
tickets: cuántos hay abiertos, cuánto se tarda en resolverlos, cuánto se cumple el
SLA y cómo trabaja cada técnico.

## Quién lo ve

El ítem **Dashboard** del menú aparece solo para quien tiene marcada la casilla
**LECTURA** en la fila **Dashboard** de su matriz de permisos. Las plantillas de
**Colaborador** y **Técnico** la traen; la de **Usuario** no. El rol
**Administrador** lo ve siempre.

Además, cada persona ve los números de los tickets que puede ver:

- Los indicadores cuentan solo los tickets de los tipos sobre los que la persona
  tiene el permiso **Ver**.
- Un **Técnico** ve únicamente lo suyo: los tickets que tiene asignados, sus
  tareas completadas y su propia fila en la tabla de cumplimiento. Esa fila
  cuenta todas las resoluciones que hizo, aunque el ticket sea de un tipo que hoy
  ya no puede ver o se haya reasignado a otra persona.

El detalle de las casillas está en el artículo sobre permisos y roles.

## El filtro por ciclo

Arriba a la derecha hay un selector de ciclo. Por defecto muestra **Ciclo
activo**; también puede elegir cualquier ciclo anterior por su nombre.

- Los indicadores por ticket cuentan los tickets **creados en ese ciclo**: cada
  ticket queda asociado al ciclo que estaba activo cuando se creó.
- **Tareas completadas por técnico** y **Cumplimiento del técnico** cuentan por
  fecha: lo que se completó o se resolvió entre la fecha de inicio y la fecha de
  fin del ciclo, aunque el ticket sea de un ciclo anterior.

Si en el ciclo elegido no hay nada para mostrar, la pantalla dice **Sin datos**.

## Cómo se miden los tiempos

Todos los tiempos del Dashboard están en **horas hábiles**: solo cuentan las horas
dentro del horario laboral del cliente, sin los feriados nacionales ni los del
cliente. Un ticket creado un viernes a la tarde no acumula horas durante el fin de
semana.

Tres reglas que conviene tener presentes:

- **El tiempo se guarda en el momento en que ocurre.** El tiempo de resolución
  queda fijado cuando el ticket pasa a **Resuelto**, y el de primera respuesta
  cuando se registra esa respuesta. Si después se cambia el horario laboral o los
  feriados, esos tiempos ya guardados no se recalculan.
- **Las pausas no cuentan.** Mientras el ticket está en **Esperando al cliente**, el
  reloj de resolución se detiene.
- **Los tickets de tipo Preventivo no entran** en los tiempos ni en los
  porcentajes de cumplimiento: un preventivo se atiende en su fecha, no contra un
  reloj de respuesta. Sí aparecen en los conteos y en las distribuciones.

El horario laboral y los feriados se explican en el artículo sobre horario
laboral y feriados, y el SLA en el artículo sobre SLA y prioridades.

## Los indicadores

### Tickets abiertos / cerrados

Cuenta como **cerrado** todo ticket que llegó a **Resuelto** o a **Cerrado**, y
como **abierto** el que todavía no llegó. Los tickets **cancelados** no cuentan en
ninguno de los dos, ni en la carga por agente.

### Tiempo promedio de resolución (horas hábiles, sin pausas)

Promedio del tiempo hábil que tardaron los tickets en llegar a **Resuelto**, sin
contar las pausas. Un ticket reabierto deja de contar hasta que se vuelva a
resolver.

### Carga por agente

Cuántos tickets abiertos tiene asignados cada persona. Los tickets sin asignar no
aparecen.

### Tareas completadas por técnico

Cuántas tareas completó cada persona en las fechas del ciclo. El crédito es de
**quien completó la tarea**, aunque el ticket esté asignado a otra persona.

### Cumplimiento del técnico (horas hábiles en su horario)

Una tabla que mide si cada técnico resolvió dentro de las horas del SLA,
contando solo **su propio horario laboral** (o el del cliente, si no tiene uno
propio). Tiene estas columnas:

| Columna | Qué muestra |
|---|---|
| **Técnico** | La persona evaluada |
| **Resoluciones evaluadas** | Cuántas resoluciones suyas se midieron |
| **Cumplidos** | Cuántas de ellas quedaron dentro de la meta |
| **% cumplimiento** | Cumplidos sobre evaluadas |
| **Promedio (h:mm hábiles)** | El tiempo promedio de esas resoluciones |

Cómo se mide cada resolución:

- El reloj del técnico corre **desde que se le asigna el ticket hasta que el
  ticket pasa a Resuelto**, y se detiene mientras está en **Esperando al cliente**.
- Si el ticket pasa de un técnico a otro, cada uno tiene su propio tramo, y se
  evalúa el de quien lo resolvió.
- La meta son las horas del SLA del ticket. Un ticket sin SLA no se evalúa.
- **Cada resolución se evalúa por separado**: un ticket reabierto y vuelto a
  resolver suma dos.
- Los tickets borrados no cuentan.

Un **Técnico** ve solo su propia fila.

### % Cumplimiento SLA

De los tickets resueltos o cerrados que tenían SLA, qué porcentaje se resolvió
dentro del plazo. El cumplimiento de cada ticket queda fijado al resolverse.

### % Primera respuesta a tiempo

De los tickets con meta de primera respuesta que ya recibieron esa respuesta, o
cuyo plazo ya venció, qué porcentaje la recibió a tiempo.

### Tiempo medio de primera respuesta (horas hábiles)

El tiempo hábil promedio entre la creación del ticket y su primera respuesta.
Incluye también los tickets cuya prioridad no tiene meta de primera respuesta.

### Distribución por tipo y Distribución por prioridad

Cuántos tickets del ciclo hay de cada tipo y de cada prioridad, en cualquier
estado.

### Satisfacción (CSAT)

El promedio de la encuesta de satisfacción (sobre 5) y la cantidad de respuestas.
Solo aparece para quien tiene la casilla **LECTURA** en la fila **Satisfacción**.
De cada ticket cuenta solo la respuesta más reciente. Está explicado en el
artículo sobre la encuesta de satisfacción.

## Si un indicador dice "Sin datos"

No es un error: significa que en el ciclo elegido todavía no hay nada que medir
para ese indicador. Un porcentaje sin datos nunca se muestra como 0 %, porque no
es lo mismo "no se cumplió nada" que "todavía no hay nada para evaluar".
