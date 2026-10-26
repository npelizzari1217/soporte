---
slug: reparaciones-listado
titulo: El listado de reparaciones y su exportación a Excel o CSV
visibleParaSolicitante: true
---

# El listado de reparaciones y su exportación a Excel o CSV

## Quién entra a esta pantalla

La pantalla se abre desde el ítem **Edilicia** del menú y se titula
**Reparaciones**. El ítem aparece solo si usted tiene el permiso **Ver** sobre al
menos un tipo de ticket del módulo Edilicia (por ejemplo, Edilicia o Preventivo).
Quien solo ve tickets de otros módulos no tiene este ítem y trabaja sus tickets
desde **Tickets**.

Cada fila de la grilla es un ticket. Un ticket abierto desde **Tickets** aparece
aquí igual que uno abierto desde esta pantalla: es el mismo ticket.

## Qué tickets se listan

El listado muestra los mismos tickets que usted vería en **Tickets** para esos
tipos:

- Con **Ver** y **Ver todos** sobre un tipo, aparecen todos los tickets de ese tipo.
- Con **Ver** pero sin **Ver todos**, aparecen solo los tickets que usted solicitó,
  los que tiene asignados como responsable y aquellos en los que es el técnico de
  una subtarea.

Los permisos se otorgan por tipo de ticket; el artículo "Cómo funcionan los
permisos y los roles" explica cómo.

## El selector Tipo

Arriba del listado, el selector **Tipo** decide qué tickets se ven:

- **Todos los de Edilicia**, la opción inicial, lista los tickets de todos los
  tipos del módulo Edilicia.
- Cada una de las demás opciones es un tipo de ticket sobre el que usted tiene
  **Ver**, de cualquier módulo. Al elegirla, la grilla muestra solo los tickets de
  ese tipo, con las mismas columnas.

Elegir un tipo no amplía lo que usted puede ver. Si un enlace guardado trae un tipo
que ya no se puede elegir (porque se dio de baja o porque usted ya no tiene **Ver**
sobre él), el selector muestra **Tipo no disponible**. Mientras se cargan los
tipos, muestra **Cargando tipos…**.

## Las columnas

| Columna | Qué muestra |
|---|---|
| **Número** | El número del ticket y, debajo, la fecha y hora en que se creó. |
| **Título** | El resumen del trabajo. |
| **Ubicación** | El lugar donde se hace el trabajo, en texto libre. Si no se cargó, se ve una raya. |
| **Sector** | El sector del ticket, aunque ese sector se haya desactivado después. Si no tiene, se ve una raya. |
| **Avance** | Una barra y el porcentaje de subtareas completadas. |
| **Bloqueo** | El aviso **Bloqueada**, si corresponde, y el botón de compras vinculadas. |
| **Editar** | El botón **Editar**, para quien tiene **Modificar** sobre el tipo del ticket. |
| **Subtareas** | El botón **Ver subtareas**, con la cantidad de subtareas al lado. |
| **Comentarios** | El botón **Ver comentarios**, con la cantidad de comentarios al lado. |

El **avance** se calcula como las subtareas completadas divididas por las subtareas
activas, por cien; las eliminadas no cuentan. Una reparación sin subtareas queda en
0 %. El cálculo, las subtareas, los comentarios y las compras de una reparación se
explican en el artículo "Trabajar una reparación: alta, edición, subtareas,
comentarios y compras".

El número al lado de **Ver comentarios** cuenta solo los comentarios que usted
puede ver: los internos se suman únicamente si tiene **Comentario interno** sobre
el tipo del ticket. Cuando la cantidad es cero, no se muestra ningún número.

## El aviso «Bloqueada»

Una fila muestra **Bloqueada** cuando el ticket tiene alguna compra vinculada que
todavía está en curso. Nadie lo marca a mano: aparece y desaparece solo, según el
estado de las compras.

El aviso **no muestra una cantidad**: solo indica si la reparación está frenada o
no. Lo ve todo el que ve la fila. Para saber qué compra la frena hace falta la
casilla **LECTURA** de la fila **Compras** en la matriz de permisos: con ella, el
botón **Gestionar compras** (o **Ver compras**) de la misma columna muestra las
compras vinculadas.

Estar bloqueada no cambia el porcentaje de avance: son dos datos independientes.

## El filtro Bloqueo

El selector **Bloqueo** ofrece **Todas**, **Bloqueadas** y **No bloqueadas**. El
filtro se aplica sobre el listado completo, no solo sobre la página que se está
viendo. Al cambiarlo, el listado vuelve a la primera página.

## Páginas

El listado muestra **10 tickets por página**, del más reciente al más antiguo.
Debajo de la grilla se indica la página actual (por ejemplo, *Página 1 de 4*) y los
botones **Anterior** y **Siguiente** permiten recorrer el resto.

La página, el tipo y el filtro de bloqueo quedan en la dirección del navegador: al
recargar, al volver atrás o al compartir el enlace, se ve la misma página con los
mismos filtros. Si con los filtros elegidos no hay ningún resultado (por ejemplo,
un enlace viejo a una página que ya no existe), el listado ofrece el botón
**Limpiar filtros** para volver al comienzo.

La búsqueda del navegador (Ctrl+F) solo encuentra lo que está en la página
visible. Para buscar una reparación puntual en todo el listado, conviene
exportarlo y buscar en el archivo.

## Exportar

Arriba del listado está el botón **Exportar**, que abre un menú con dos opciones:

- **Excel** descarga un archivo que se abre directamente con Excel o con cualquier
  planilla de cálculo.
- **CSV** descarga el mismo contenido como texto separado, útil para importarlo en
  otros programas.

El archivo se llama *reparaciones-* seguido de la fecha del día y trae **cuatro
columnas**: **Número**, **Título**, **Ubicación** y **Avance %**. El avance del
archivo es el mismo valor que muestra la columna **Avance** de la pantalla.

Qué tickets trae el archivo:

- **Respeta el selector Tipo**: exporta los tickets del tipo elegido o, con
  **Todos los de Edilicia**, los de todo el módulo.
- **Ignora el filtro Bloqueo y la página**: trae todos los tickets que usted puede
  ver de ese tipo, en todas las páginas. Para quedarse solo con las bloqueadas,
  filtre el archivo después de descargarlo.

Mientras el archivo se prepara, el botón queda en espera. En listados grandes puede
tardar unos segundos.

### Cuando el listado es demasiado grande

La exportación admite hasta **5000 filas**. Si el listado tiene más, no se
descarga nada y aparece un aviso que indica cuántas filas tiene y que hace falta
habilitar la exportación en partes. No es un error ni se perdió ningún dato.

Como la exportación no respeta el filtro **Bloqueo**, filtrar en pantalla no
reduce el archivo. Elegir un tipo puntual en el selector **Tipo** sí puede
reducirlo. Si aun así lo supera, avise al administrador del sistema para que se
habilite la exportación en partes.
