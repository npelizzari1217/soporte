---
slug: compras-estados
titulo: Estados de una compra y cómo se ordena el listado
visibleParaSolicitante: false
---

# Estados de una compra y cómo se ordena el listado

Una compra **no tiene un estado propio que alguien fije a mano**. El estado se
deduce de los ítems que la compra contiene. Entender eso explica casi todo lo
demás.

## Los cinco estados

| Estado | Cuándo aparece |
|---|---|
| **Pendiente** | Queda al menos un ítem sin resolver. También es el estado de una compra que todavía no tiene ítems cargados. |
| **Aprobada** | Todos los ítems fueron aprobados. |
| **Aprobada parcialmente** | Ningún ítem quedó pendiente, y hay aprobados y rechazados conviviendo. |
| **Rechazada** | Todos los ítems fueron rechazados. |
| **Cancelada** | La compra se canceló. Este estado tiene prioridad absoluta: se muestra sin importar cómo estén los ítems. |

Los ítems eliminados no cuentan para nada de esto.

Como el estado es una consecuencia, no se lo edita: **se cambia aprobando o
rechazando ítems**. Aprobar el último ítem pendiente de una compra que ya tenía
rechazos la deja en *Aprobada parcialmente*, no en *Aprobada*.

## La columna Progreso

Aparte del estado, el listado muestra dos etiquetas de avance que solo tienen
sentido cuando hay ítems aprobados:

- **Comprado**: todos los ítems aprobados ya se recibieron (o se cerraron con
  faltante).
- **Cerrado**: todos los ítems aprobados ya se entregaron (o se cerraron con
  faltante).

Si no hay ningún ítem aprobado, ninguna de las dos se muestra.

## Cómo se ordena el listado

El listado no ordena por fecha a secas. Primero agrupa, y **dentro de cada grupo**
ordena por **fecha de solicitud**, de la más nueva a la más vieja.

Los tres grupos, siempre en este orden:

1. **Activas** — todo lo que sigue en juego: pendientes, y aprobadas o aprobadas
   parcialmente que todavía tienen algo sin entregar. Una compra sin ítems
   también cae acá.
2. **Completadas o cerradas** — aprobadas o aprobadas parcialmente con todo lo
   aprobado ya entregado.
3. **Canceladas o rechazadas** — las canceladas y las rechazadas por completo.

Por eso una compra vieja pero activa aparece **antes** que una reciente ya
cerrada: el grupo pesa más que la fecha.

Conviene tener presente que la fecha que ordena es la **fecha de solicitud**, la
que se carga en la compra, no el momento en que se registró en el sistema. Si
dos compras comparten fecha de solicitud, desempata la más recientemente
registrada.

## El filtro

Arriba del listado hay un filtro por estado con cuatro opciones:

- **Activas** (es la opción con la que arranca la pantalla)
- **Completadas o cerradas**
- **Canceladas o rechazadas**
- **Todas**

Como el filtro arranca en *Activas*, **una compra cancelada, rechazada o cerrada
no se ve al entrar**. No desapareció: hay que cambiar el filtro. Es la causa más
frecuente del reporte "no encuentro una compra que sé que existe".
