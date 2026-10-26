---
slug: insumos-administracion-y-reporte
titulo: Administración de familias, unidades de medida y reporte de stock
visibleParaSolicitante: true
---

# Administración de familias, unidades de medida y reporte de stock

El catálogo de insumos y repuestos se apoya en dos catálogos auxiliares que
configura el administrador: las **familias** y las **unidades de medida**. Este
artículo explica cómo se administran, qué efecto tiene cada opción y cómo se usa
el reporte de stock.

## Quién administra qué

- **Familias y unidades de medida**: solo el **Administrador**, desde **Admin**
  en el menú lateral. Dentro de Admin, la barra superior tiene las secciones
  **Familia de Catálogos** y **Unidades**.
- **Los ítems del catálogo** (alta, edición, deshabilitar y habilitar): también
  solo el **Administrador**, pero no desde Admin, sino desde las secciones
  **Insumos** y **Repuestos** del menú lateral. El formulario está explicado en
  «Insumos y repuestos: el catálogo, la ficha y el alta de un ítem».
- **El reporte de stock**: cualquier persona con la casilla **LECTURA** de la fila
  **Insumos** en su matriz de permisos.

Cuando el formulario de un ítem no encuentra familias cargadas, muestra una nota
que remite a «Admin > Insumos»: se refiere a la sección **Familia de Catálogos**.

## Familias: Familia de Catálogos

Las familias agrupan los ítems del catálogo (por ejemplo, «Tóner» o «Teclados»).
Desde esta sección se crean las familias de las dos clases, consumibles y
repuestos.

La tabla muestra las columnas **Código**, **Nombre**, **Tipo** (**Consumible** o
**Repuesto**), **Estado** (**Activo** o **Baja**) y **Acciones**. Para crear una
familia, haga clic en **Nueva familia**; para modificarla, en **Editar**.

El formulario tiene tres campos:

- **Código**: obligatorio, de hasta 30 caracteres. Solo admite mayúsculas,
  números y guion bajo, sin espacios. No puede repetirse con el de otra familia,
  aunque esa familia esté dada de baja.
- **Nombre**: obligatorio, de hasta 100 caracteres.
- **Es repuesto**: casilla que indica si la familia agrupa repuestos de equipos.

### Qué cambia la marca Es repuesto

La marca **Es repuesto** decide tres cosas para los ítems de la familia:

- **En qué sección aparecen**: con la marca, en **Repuestos**; sin ella, en
  **Insumos**.
- **Si admiten stock usado**: solo los repuestos pueden tener piezas en
  condición «Usado».
- **El prefijo del código** de los ítems que se creen en la familia: **REP-** para
  los repuestos e **INS-** para los consumibles.

La marca se puede cambiar después con **Editar**. En ese caso, los ítems de la
familia pasan a mostrarse en la otra sección, pero **conservan el código** que
tenían: el código se asigna al crear el ítem y no cambia.

### Dar de baja y activar una familia

El botón **Dar de baja** pide confirmación y deja la familia con el estado
**Baja**. Una familia dada de baja:

- no se puede asignar a un ítem nuevo ni a uno que cambie de familia;
- sigue apareciendo en el formulario de los ítems, marcada como
  **(deshabilitada)**;
- no se borra: los ítems que ya pertenecían a ella siguen en el catálogo.

El botón **Activar** la vuelve a dejar disponible.

## Unidades de medida: Unidades

La sección **Unidades** es el catálogo de unidades de medida, común a todos los
insumos y repuestos (por ejemplo, «Unidad», «Caja» o «Metro»).

La tabla muestra las columnas **Código**, **Nombre**, **Entera** (**Entera** o
**No**), **Estado** (**Activo** o **Baja**) y **Acciones**. Para crear una unidad,
haga clic en **Nueva unidad**; para modificarla, en **Editar**.

El formulario tiene tres campos:

- **Código**: obligatorio, de hasta 20 caracteres, con las mismas reglas que el
  código de una familia. Tampoco puede repetirse, aunque la otra unidad esté dada
  de baja.
- **Nombre**: obligatorio, de hasta 50 caracteres.
- **Entera (se cuenta en piezas, requerida para el seguimiento por serie)**:
  casilla que indica que la unidad se cuenta en piezas enteras.

### Para qué sirve la marca Entera

- **Es obligatoria para el seguimiento por número de serie.** Un ítem solo se
  puede llevar **Por número de serie** si su unidad de medida es entera.
- **No se puede quitar mientras la use un ítem por número de serie.** Si lo
  intenta, el sistema rechaza el cambio y muestra el motivo.
- **Cambia cómo se muestran las cantidades en el reporte de stock**: en una unidad
  entera, los números enteros se muestran sin decimales.

Las unidades se dan de baja y se activan igual que las familias, con **Dar de baja**
y **Activar**. Una unidad dada de baja no se puede asignar a un ítem.

## El reporte de stock

El reporte muestra en una sola tabla el stock actual de todo el catálogo. Se abre
con el botón **Reporte de stock** de las secciones **Insumos** o **Repuestos**, y
llega ya filtrado por el tipo de la sección desde la que se abrió.

Debajo del título **Reporte de stock** se indica la fecha y hora en que se generó:
los saldos corresponden a ese momento.

### Columnas

**Código**, **Nombre**, **Familia**, **Tipo** (**Consumible** o **Repuesto**),
**Unidad de medida**, **Stock nuevo**, **Stock usado**, **Stock total**, **Punto
de reposición**, **Estado de reposición** y **Estado** (**Habilitado** o
**Deshabilitado**).

- Las filas se ordenan por código.
- El reporte incluye también los ítems deshabilitados; la columna **Estado** los
  identifica.
- Si un saldo es negativo, se muestra en rojo para que salte a la vista.
- **Estado de reposición** usa las mismas etiquetas que la ficha del ítem: **Sin
  punto de reposición definido**, **Existencia suficiente** o **Hay que reponer**.
  Compara solo el stock nuevo con el punto de reposición.

### Filtros

- **Familia**: por defecto, **Todas las familias**.
- **Tipo**: **Consumibles y repuestos**, **Solo consumibles** o **Solo repuestos**.
- **Solo bajo mínimo**: muestra solo los ítems con la etiqueta **Hay que reponer**.
  Es la forma más rápida de armar una lista de compras.
- **Ocultar sin stock**: oculta los ítems con stock nuevo y usado exactamente en
  cero. Un saldo negativo no se oculta, porque es un dato que conviene revisar.

Los filtros quedan en la dirección de la página, así que puede guardarla en
favoritos o compartirla con los filtros ya aplicados.

### Exportar el reporte

El botón **Exportar** despliega un menú con dos formatos, **Excel** y **CSV**. El
archivo trae las mismas columnas que la tabla, más una columna con la fecha y hora
de generación, y respeta los filtros aplicados en la pantalla.

La exportación admite hasta 5000 filas. Si el reporte filtrado tiene más, el archivo
no se genera y aparece un aviso que pide acotar los filtros (familia, tipo o solo
bajo mínimo). No se descarga un archivo incompleto.
