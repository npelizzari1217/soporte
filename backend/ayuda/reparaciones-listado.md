---
slug: reparaciones-listado
titulo: El listado de reparaciones edilicias y su exportación a Excel
visibleParaSolicitante: false
---

# El listado de reparaciones edilicias y su exportación a Excel

## Qué muestra el listado

Cada fila es una reparación edilicia, con **número, título, ubicación,
sector y avance**. El número identifica el ticket; el título resume el trabajo; la
ubicación es el lugar físico donde ocurre (texto libre, puede estar vacía); el
sector es uno de los sectores cargados en el cliente (también puede estar vacío).

El **avance** de cada fila sale del checklist de subtareas (las tareas del
ticket) de esa reparación (`avance = tareas completadas ÷ tareas activas × 100`;
las eliminadas no cuentan) — para el detalle
de cómo se calcula, cómo se cargan las tareas, quién puede completarlas y cómo se dejan comentarios
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
**Bloqueadas** y **No bloqueadas**. Al elegir una opción distinta de "Todas",
el listado se vuelve a pedir al servidor con ese filtro y muestra solo las
reparaciones que corresponden, en todas las páginas. Cambiar el filtro vuelve
a la primera página.

## Páginas

El listado muestra **10 reparaciones por página**, la más reciente primero.
Debajo de la tabla se indica en qué página se está ("Página 1 de 4") y los
botones **Anterior** y **Siguiente** permiten recorrer el resto.

La página y el filtro quedan en la dirección del navegador: al recargar, al
volver atrás o al compartir el enlace se ve la misma página con el mismo
filtro. Si una página queda vacía (por ejemplo, un enlace viejo a una página
que ya no existe), el listado ofrece **Limpiar filtros** para volver al
comienzo.

La búsqueda del navegador (Ctrl+F) solo encuentra lo que está en la página
visible. Para buscar una reparación puntual en todo el listado conviene
exportarlo a Excel (ver abajo) y buscar en el archivo.

## Exportar a Excel

Arriba a la derecha del listado hay un botón **Exportar a Excel**. Baja un
archivo con **cuatro columnas** (número, título, ubicación, avance %), que se
abre con Excel (o con cualquier planilla de cálculo) haciéndole doble clic.

El valor de avance que trae el archivo es **el mismo que ves en la columna
Avance de la pantalla** — no se recalcula aparte ni puede desincronizarse de
lo que muestra el listado.

**El archivo respeta el selector Tipo**, pero ignora el selector **Bloqueo**:
aunque en pantalla filtre "Bloqueadas" o "No bloqueadas", trae todas las del
tipo elegido. Para quedarse solo con las bloqueadas, filtre el archivo ya
descargado.

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
