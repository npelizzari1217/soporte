---
slug: compras-estados
titulo: El listado de compras: estados, orden y exportación a Excel
visibleParaSolicitante: false
---

# El listado de compras: estados, orden y exportación a Excel

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

## Exportar a Excel

Arriba a la derecha del listado hay un botón **Exportar a Excel**. Baja un
archivo con las compras del listado, que se abre con Excel (o con cualquier
planilla de cálculo) haciéndole doble clic.

Lo importante es **qué** baja: el archivo trae **exactamente lo que los filtros
de la pantalla están mostrando, pero completo**, no solo las filas que se ven.
Si el listado tiene 400 compras repartidas en páginas de a 10, el archivo trae
las 400. Y al revés: si el filtro está en *Activas*, en el archivo **no** hay ni
una compra cancelada.

Eso hace que valga la pena mirar los filtros antes de exportar. El caso típico
es querer todo el año y bajar solo lo activo, porque el filtro seguía en el
valor con el que arranca la pantalla. Si querés absolutamente todas las compras,
poné el filtro de estado en **Todas** y limpiá las fechas y el sector.

Mientras el archivo se prepara, el botón queda deshabilitado. En listados
grandes puede tardar unos segundos.

### "Hay demasiadas filas"

Si el listado filtrado es muy grande, la exportación no se hace y aparece un
aviso pidiendo que acotes los filtros. No es un error ni se perdió nada: el
archivo sería tan pesado que no habría con qué abrirlo cómodamente.

La salida es achicar el pedido y, si hace falta, bajar varios archivos:

- **Acotá las fechas** — es lo que más recorta. Un mes o un trimestre por vez.
- **Elegí un sector** — y repetí la exportación sector por sector.
- **Elegí un estado** — por ejemplo, exportá primero las activas y después las
  completadas.

Combinando dos de esos tres el problema desaparece prácticamente siempre.
