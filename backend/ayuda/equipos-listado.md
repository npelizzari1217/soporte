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

## Sin filtros

A diferencia de otros listados del sistema, este **no tiene filtros**: siempre
muestra el inventario completo de equipos, activos y dados de baja por igual.
Si necesitás encontrar un equipo puntual, usá la búsqueda del navegador
(Ctrl+F) sobre la tabla cargada.

## Exportar a Excel

Arriba a la derecha del listado hay un botón **Exportar a Excel**. Baja un
archivo con **las mismas cuatro columnas de la tabla** (nombre, marca, número
de serie, estado), que se abre con Excel (o con cualquier planilla de
cálculo) haciéndole doble clic.

Como el listado no tiene filtros, el archivo siempre trae **el inventario
activo completo**, sin excepción — nunca solo una parte.

Mientras el archivo se prepara, el botón queda deshabilitado. En inventarios
grandes puede tardar unos segundos.

### "El listado supera el volumen que la exportación soporta"

Si el inventario es muy grande, la exportación no se hace y aparece un aviso
con este mensaje. No es un error ni se perdió nada: el archivo sería tan
pesado que no habría con qué abrirlo cómodamente.

A diferencia de compras o tickets, acá **no hay filtros que acotar** — el
aviso no te va a pedir que los cambies, porque no existen. La salida en este
caso es exportar el inventario **en partes**, una capacidad que todavía hay
que habilitar. Si te encontrás con este aviso, avisá para que se habilite esa
exportación por partes.
