---
slug: equipos-listado
titulo: El listado de equipos y su exportación a Excel
visibleParaSolicitante: false
---

# El listado de equipos y su exportación a Excel

## Qué muestra el listado

Cada fila es un equipo, con **nombre, marca, número de serie y estado**
(Activo o Baja). Un clic en la fila abre la ficha completa del equipo, con
sus componentes y el resto de sus datos.

Este listado **no muestra montos**. El importe, la fecha de valoración, el
valor residual y su fecha viven en la ficha de **Editar** de cada equipo —
ver el artículo sobre importe y depreciación si necesitás esos datos.

## El filtro «Mostrar equipos dados de baja»

Arriba de la tabla hay una casilla **Mostrar equipos dados de baja**, que
viene **apagada**: por defecto el listado muestra solo los equipos vigentes
(estado Activo). Al tildarla aparecen también los equipos dados de baja, con
la etiqueta **Baja** en la columna de estado. La casilla queda reflejada en la
dirección de la página, así que podés guardarla o compartirla con el filtro ya
aplicado.

Es el único filtro del listado. Si necesitás encontrar un equipo puntual, usá
la búsqueda del navegador (Ctrl+F) sobre la tabla cargada.

## Exportar a Excel

Arriba a la derecha del listado hay un botón **Exportar a Excel**. Baja un
archivo con **las mismas cuatro columnas de la tabla** (nombre, marca, número
de serie, estado), que se abre con Excel (o con cualquier planilla de
cálculo) haciéndole doble clic.

El archivo **sigue el mismo filtro que el listado**: con la casilla apagada
trae **todos los equipos vigentes**, sin excepción; con la casilla tildada
trae además los equipos dados de baja, y la columna de estado indica
**Baja** en cada uno. Nunca trae solo una parte de lo que ves.

Mientras el archivo se prepara, el botón queda deshabilitado. En inventarios
grandes puede tardar unos segundos.

### "El listado supera el volumen que la exportación soporta"

Si el inventario es muy grande, la exportación no se hace y aparece un aviso
con este mensaje. No es un error ni se perdió nada: el archivo sería tan
pesado que no habría con qué abrirlo cómodamente.

A diferencia de compras o tickets, acá **no hay filtros que acoten el
volumen**: dejar apagada la casilla de equipos dados de baja ya es lo mínimo
que se puede exportar, así que el aviso no te va a pedir que cambies nada. La
salida en este caso es exportar el inventario **en partes**, una capacidad que todavía hay
que habilitar. Si te encontrás con este aviso, avisá para que se habilite esa
exportación por partes.
