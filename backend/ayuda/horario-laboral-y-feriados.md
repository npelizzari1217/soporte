---
slug: horario-laboral-y-feriados
titulo: El horario laboral, los feriados y el horario propio de cada técnico
visibleParaSolicitante: true
---

# El horario laboral, los feriados y el horario propio de cada técnico

El sistema mide los plazos de atención en **horas hábiles**: solo cuentan las horas
en que el soporte trabaja. Para saber cuáles son esas horas usa dos datos que se
configuran en pantallas propias: el **horario laboral** del cliente y la lista de
**feriados**.

## Para qué se usan

- **El SLA.** El vencimiento de un ticket se calcula sumando horas hábiles. Si el
  sábado y el domingo no son días laborales, un ticket con 8 horas de SLA creado un
  viernes a última hora vence el lunes, no el sábado. Lo mismo vale para el plazo de primera respuesta.
- **El Dashboard.** Los tiempos de resolución y de primera respuesta se informan
  en horas hábiles.

Los tiempos que ya quedaron registrados (por ejemplo, cuánto tardó en resolverse
un ticket) no se recalculan si después se modifica el horario o los feriados.

El SLA se explica en el artículo sobre SLA y prioridades, y los indicadores en el
artículo sobre el Dashboard.

## La pantalla Horario laboral

El ítem **Horario laboral** del menú está disponible para todos los usuarios del
cliente. Muestra la semana completa, de **Domingo** a **Sábado**, con un intervalo
por día:

- La casilla con el nombre del día indica si ese día se trabaja.
- **Apertura** y **Cierre** son la hora de inicio y de fin del día laboral, en
  hora de Argentina. Un cierre a las 00:00 significa medianoche, es decir, el fin
  del día.

Reglas que el sistema controla al guardar:

- La apertura tiene que ser anterior al cierre.
- Debe quedar al menos un día abierto.

**Quién puede modificarlo.** Solo el **Administrador** del cliente y el
administrador de la plataforma (ROOT) ven el botón **Guardar**. El resto de los
usuarios ve la grilla en modo de solo lectura.

## El horario propio de cada técnico

Un técnico puede trabajar en un horario distinto al del cliente. Ese horario
propio se carga desde **Admin > Usuarios**, con el botón **Horarios** de la fila
de la persona. El botón aparece solo para los roles **Técnico** y
**Colaborador**, y lo usa el administrador del cliente. El detalle de esa pantalla
está en el artículo sobre la administración de usuarios.

- Si la persona no tiene horario propio, el cuadro muestra el horario del cliente
  y el botón **Usar horario propio**. Al guardar, la persona deja de seguir los
  cambios del horario del cliente.
- Si ya tiene horario propio, **Guardar** lo reemplaza y **Volver al horario del
  cliente** lo borra, previa confirmación.

El horario propio **solo sirve para medir** el cumplimiento de ese técnico (la
tabla **Cumplimiento del técnico** del Dashboard). No cambia el SLA que ve quien
pidió el ticket, y no impide asignarle tickets fuera de su horario: un
especialista puede recibir un ticket en cualquier momento.

## Los feriados

Un feriado es un día que no cuenta como hábil, aunque en el horario laboral sea un
día abierto. Hay dos clases, y el sistema usa la suma de las dos:

| Origen | Quién lo carga | A quién afecta |
|---|---|---|
| **Nacional** | El administrador de la plataforma (ROOT) | A todos los clientes |
| **Del cliente** | El Administrador del cliente | Solo a ese cliente |

### La pantalla Feriados

El ítem **Feriados** del menú está disponible para todos los usuarios del cliente.
Muestra juntos los feriados nacionales y los del cliente, con las columnas
**Fecha**, **Descripción** y **Origen**. El botón **Ver como almanaque** cambia a
una vista de calendario mes por mes; **Ver como lista** vuelve a la tabla.

El Administrador del cliente ve además el botón **Nuevo feriado** (con **Fecha** y
**Descripción**, de hasta 200 caracteres) y las acciones **Editar** y **Eliminar**.
Esas acciones aparecen solo en los feriados **Del cliente**: los nacionales no se
pueden modificar desde esta pantalla.

El sistema rechaza un feriado del cliente en una fecha que ya es feriado nacional,
o en una fecha que ya tiene otro feriado del mismo cliente.

### Los feriados nacionales

El administrador de la plataforma mantiene la lista maestra desde el ítem
**Feriados nacionales** de la sección **ROOT** del menú. Ahí puede crear, editar y
eliminar feriados, que se aplican al cálculo de todos los clientes.
