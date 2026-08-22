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

## El chip "Bloqueada"

Una fila puede mostrar el chip **Bloqueada** junto al resto de sus datos.
Aparece sola, sin que nadie la marque a mano: el sistema la calcula mirando
si la reparación tiene alguna compra vinculada que todavía está en curso (sin
entregar, sin cancelar, sin cerrar con faltante). En cuanto esa compra se
resuelve, el chip desaparece solo, sin que haga falta tocar nada en la
reparación.

El chip **no muestra un número** — no dice "Bloqueada (2)" aunque haya más de
una compra frenándola. Solo responde de un vistazo si la reparación está
trabada o no; para ver el detalle de qué compra la frena hay que abrir la
reparación.

El chip **no afecta el avance**: una reparación bloqueada puede tener
subtareas completadas igual, y el porcentaje de avance de la columna no
cambia por estar bloqueada o no.

## Filtro por bloqueo

Arriba del listado hay un selector **Bloqueo** con tres opciones: **Todas**,
**Bloqueadas** y **No bloqueadas**. Elegir una opción distinta de "Todas"
oculta las filas que no corresponden — es instantáneo, porque filtra sobre
los datos que ya están cargados en la pantalla, sin volver a pedirle nada al
servidor.

Si necesitás encontrar una reparación puntual por otro dato (número, título,
ubicación), seguí usando la búsqueda del navegador (Ctrl+F) sobre la tabla
cargada.

## Exportar a Excel

Arriba a la derecha del listado hay un botón **Exportar a Excel**. Baja un
archivo con **cuatro columnas** (número, título, ubicación, avance %), que se
abre con Excel (o con cualquier planilla de cálculo) haciéndole doble clic.

El valor de avance que trae el archivo es **el mismo que ves en la columna
Avance de la pantalla** — no se recalcula aparte ni puede desincronizarse de
lo que muestra el listado.

**El archivo trae siempre todas las reparaciones del tenant**, aunque tengas
el selector **Bloqueo** filtrado a "Bloqueadas" o "No bloqueadas" en pantalla:
la exportación ignora ese filtro a propósito y nunca trae solo una parte. Si
necesitás solo las bloqueadas, filtrá el archivo ya descargado.

Mientras el archivo se prepara, el botón queda deshabilitado. En listados
grandes puede tardar unos segundos.

### "El listado supera el volumen que la exportación soporta"

Si el listado es muy grande, la exportación no se hace y aparece un aviso con
este mensaje. No es un error ni se perdió nada: el archivo sería tan pesado
que no habría con qué abrirlo cómodamente.

Acá el selector **Bloqueo** no ayuda — la exportación no lo respeta, así que
filtrar en pantalla no reduce el archivo. La salida en este caso es exportar
el listado **en partes**, una capacidad que todavía hay que habilitar. Si te
encontrás con este aviso, avisá para que se habilite esa exportación por
partes.
