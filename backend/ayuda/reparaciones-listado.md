---
slug: reparaciones-listado
titulo: El listado de reparaciones edilicias y su exportación a Excel
visibleParaSolicitante: false
---

# El listado de reparaciones edilicias y su exportación a Excel

## Qué muestra el listado

Cada fila es una reparación edilicia, con **número, título, ubicación y
avance**. El número identifica el ticket; el título resume el trabajo; la
ubicación es el lugar físico donde ocurre (texto libre, puede estar vacía).

El **avance** de cada fila sale del checklist de subtareas de esa reparación
(`avance = subtareas completadas ÷ subtareas totales × 100`) — para el detalle
de cómo se calcula, cómo se cargan las subtareas y cómo se dejan comentarios
sobre una reparación puntual, ver el artículo **"Subtareas y comentarios de
una reparación edilicia"**. Este artículo es sobre el LISTADO de muchas
reparaciones; el otro es sobre UNA reparación abierta.

## Sin filtros

Este listado **no tiene filtros**: siempre muestra todas las reparaciones del
tenant. Si necesitás encontrar una reparación puntual, usá la búsqueda del
navegador (Ctrl+F) sobre la tabla cargada.

## Exportar a Excel

Arriba a la derecha del listado hay un botón **Exportar a Excel**. Baja un
archivo con **cuatro columnas** (número, título, ubicación, avance %), que se
abre con Excel (o con cualquier planilla de cálculo) haciéndole doble clic.

El valor de avance que trae el archivo es **el mismo que ves en la columna
Avance de la pantalla** — no se recalcula aparte ni puede desincronizarse de
lo que muestra el listado.

Como el listado no tiene filtros, el archivo siempre trae **todas las
reparaciones**, sin excepción — nunca solo una parte.

Mientras el archivo se prepara, el botón queda deshabilitado. En listados
grandes puede tardar unos segundos.

### "El listado supera el volumen que la exportación soporta"

Si el listado es muy grande, la exportación no se hace y aparece un aviso con
este mensaje. No es un error ni se perdió nada: el archivo sería tan pesado
que no habría con qué abrirlo cómodamente.

Acá **no hay filtros que acotar** — el aviso no te va a pedir que los
cambies, porque no existen. La salida en este caso es exportar el listado
**en partes**, una capacidad que todavía hay que habilitar. Si te encontrás
con este aviso, avisá para que se habilite esa exportación por partes.
