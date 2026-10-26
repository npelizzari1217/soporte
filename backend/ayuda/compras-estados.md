---
slug: compras-estados
titulo: El listado de compras: estados, orden, filtros y exportación
visibleParaSolicitante: false
---

# El listado de compras: estados, orden, filtros y exportación

Una compra **no tiene un estado propio que alguien fije a mano**. El estado se
deduce de los ítems que la compra contiene. Entender eso explica casi todo lo
demás.

## Qué muestra el listado

Cada fila es una compra, con las columnas **Número**, **Fecha** (la fecha de
solicitud), **Motivo**, **Estado**, **Totales por moneda** y **Progreso**. Haga
clic en una fila para abrir la compra completa, con sus ítems.

## Los cinco estados

| Estado | Cuándo aparece |
|---|---|
| **Pendiente** | Queda al menos un ítem sin resolver. También es el estado de una compra que todavía no tiene ítems cargados. |
| **Aprobada** | Todos los ítems fueron aprobados. |
| **Aprobada parcialmente** | Ningún ítem quedó pendiente, y hay ítems aprobados y rechazados. |
| **Rechazada** | Todos los ítems fueron rechazados. |
| **Cancelada** | La compra se canceló. Este estado tiene prioridad absoluta: se muestra sin importar cómo estén los ítems. |

Los ítems eliminados no cuentan para nada de esto.

Como el estado es una consecuencia, no se edita: **cambia al aprobar o rechazar
ítems**. Aprobar el último ítem pendiente de una compra que ya tenía rechazos la
deja en **Aprobada parcialmente**, no en **Aprobada**.

## La columna Progreso

Además del estado, cada fila muestra dos etiquetas de avance, **Comprado** y
**Cerrado**. Las dos aparecen siempre; se resaltan en verde cuando se cumplen y
quedan apagadas cuando no:

- **Comprado**: todos los ítems aprobados ya se recibieron completos, o se
  cerraron con faltante.
- **Cerrado**: todos los ítems aprobados ya se entregaron completos, o se
  cerraron con faltante.

Solo pueden resaltarse en una compra **Aprobada** o **Aprobada parcialmente**.
En una compra pendiente, rechazada o cancelada, las dos quedan apagadas.

## Cómo se ordena el listado

El listado no ordena solo por fecha. Primero agrupa y, **dentro de cada grupo**,
ordena por **fecha de solicitud**, de la más reciente a la más antigua.

Los tres grupos, siempre en este orden:

1. **Activas**: todo lo que sigue en curso. Incluye las pendientes y las
   aprobadas o aprobadas parcialmente que todavía tienen algo aprobado sin
   entregar. Una compra sin ítems también cae aquí.
2. **Completadas o cerradas**: aprobadas o aprobadas parcialmente con todo lo
   aprobado ya entregado (o cerrado con faltante).
3. **Canceladas o rechazadas**: las canceladas y las rechazadas por completo.

Por eso una compra antigua pero activa aparece **antes** que una reciente ya
cerrada: el grupo pesa más que la fecha.

La fecha que ordena es la **fecha de solicitud**, la que se carga en la compra,
no el momento en que se registró en el sistema. Si dos compras comparten fecha de
solicitud, aparece primero la registrada más recientemente.

## Los filtros

Arriba del listado hay tres filtros, que se pueden combinar.

**Estado**, con cuatro opciones:

- **Activas** (es la opción con la que se abre la pantalla)
- **Completadas o cerradas**
- **Canceladas o rechazadas**
- **Todas**

**Sector**: por defecto dice **Todos los sectores**; elija uno para ver solo sus
compras.

**Rango de fechas**: dos fechas, desde y hasta, aplicadas sobre la fecha de
solicitud. Las dos fechas se incluyen en el resultado, y puede completar solo
una de ellas.

Como el filtro de estado arranca en **Activas**, **una compra cancelada,
rechazada o cerrada no se ve al entrar**. No desapareció: hay que cambiar el
filtro. Es la causa más frecuente del reporte «no encuentro una compra que sé
que existe».

## Exportar

Arriba a la derecha del listado está el botón **Exportar**. Al hacer clic se
despliega un menú con dos formatos:

- **Excel**: un archivo que se abre directamente con Excel o con cualquier
  planilla de cálculo.
- **CSV**: un archivo de texto con los valores separados por punto y coma, útil
  para importarlo en otro sistema.

El archivo trae una fila por compra con el número, la fecha de solicitud, el
motivo, el estado, si está comprada y si está cerrada, y una columna de total por
cada moneda que aparezca en las compras exportadas. La celda de una moneda queda
vacía cuando la compra no tiene importes en ella.

Lo importante es **qué** compras incluye: el archivo trae **exactamente lo que los
filtros de la pantalla están mostrando, pero completo**, no solo la página que se
ve. Si el listado tiene 400 compras repartidas en páginas de a 10, el archivo trae
las 400. Y al revés: si el filtro está en **Activas**, en el archivo **no** hay
ninguna compra cancelada.

Por eso conviene revisar los filtros antes de exportar. El caso típico es querer
todo el año y descargar solo lo activo, porque el filtro seguía en el valor con
el que se abre la pantalla. Si necesita absolutamente todas las compras, ponga el
estado en **Todas**, elija **Todos los sectores** y deje las fechas vacías.

Mientras el archivo se prepara, el botón queda ocupado y no admite otro clic. En
listados grandes puede tardar unos segundos.

### Cuando la exportación supera el máximo

La exportación admite hasta 5000 compras. Si el listado filtrado tiene más, el
archivo no se genera y aparece un aviso con la cantidad que se alcanzaría y el
máximo permitido. No es una falla ni se perdió nada: el archivo sería demasiado
pesado para abrirlo con comodidad.

La solución es acotar el pedido y, si hace falta, descargar varios archivos:

- **Acote las fechas**: es lo que más recorta. Un mes o un trimestre por vez.
- **Elija un sector**, y repita la exportación sector por sector.
- **Elija un estado**: por ejemplo, exporte primero las activas y después las
  completadas.

Combinando dos de estos tres criterios, el problema desaparece prácticamente
siempre.
