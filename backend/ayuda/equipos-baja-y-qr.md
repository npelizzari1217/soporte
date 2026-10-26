---
slug: equipos-baja-y-qr
titulo: Dar de baja o eliminar un equipo, y su código QR
visibleParaSolicitante: false
---

# Dar de baja o eliminar un equipo, y su código QR

Desde la página de un equipo hay dos formas de sacarlo del inventario, que no son
lo mismo:

- **Dar de baja** es lo habitual cuando un equipo deja de usarse: el equipo queda
  en el sistema como **Baja**, con su historial, y sus piezas vuelven al stock o se
  descartan.
- **Eliminar equipo (cargado por error)** es solo para un equipo que nunca debió
  cargarse: el equipo desaparece del listado.

Las dos acciones piden la casilla **BORRADO** de la fila **Equipos** en la matriz
de permisos y solo se ofrecen mientras el equipo está activo.

## Dar de baja un equipo

Presione **Dar de baja** en la página del equipo. Se abre el cuadro **Dar de baja
el equipo**, que primero carga un resumen:

- Cuántas piezas activas tiene el equipo y qué va a pasar con cada una.
- Si el equipo tiene tickets abiertos, un aviso de que esos tickets **siguen
  abiertos** y apuntando al equipo. La baja no los cierra.

La baja es **todo o nada**: se aplica al equipo y a todas sus piezas a la vez, o no
se aplica.

### Qué pasa con las piezas

En **¿Qué pasa con las piezas?** se elige un único destino para todas:

- **Devolver todas las piezas al stock (como usadas)**, la opción inicial. Cada
  pieza asociada a un repuesto del catálogo vuelve al depósito como usada. Una pieza
  sin repuesto asociado se retira sin mover stock. El resumen lo indica pieza por
  pieza: *Vuelve al stock como usada* o *Se retira (sin repuesto asociado: no mueve
  stock)*.
- **Descartar todas las piezas**. Ninguna vuelve al stock; el resumen indica *Se
  descarta* en cada una.

Si alguna pieza se cargó antes de que su repuesto se siguiera por número de serie,
al devolverla al stock el cuadro pide su **número de serie**, con el valor sugerido
ya cargado. Con ese serial se registra en el depósito.

Si alguna pieza **no puede volver al stock**, el cuadro la lista con la causa y el
botón de confirmación queda deshabilitado. Las causas posibles son:

- el repuesto fue eliminado del catálogo;
- su familia ya no es de repuestos;
- falta el número de serie, no es válido, está repetido en esta baja o ya existe en
  el stock.

En ese caso, corrija el número de serie cuando la causa sea esa, o elija
**Descartar todas las piezas**.

### Categoría y motivo

- **Categoría**: **Vejez** (la opción inicial), **Donación**, **Rotura** u **Otra**.
- **Motivo**: texto libre, opcional, salvo con la categoría **Otra**, donde es
  obligatorio. Debajo del campo, un contador indica cuántos caracteres admite; el
  máximo depende del nombre del equipo y de la categoría elegida.

### Confirmar

Presione **Confirmar baja**. Si eligió **Descartar todas las piezas**, antes tiene
que escribir el nombre exacto del equipo en el campo de confirmación (el cuadro
muestra el nombre debajo, como referencia).

Si alguien modificó las piezas del equipo mientras usted completaba el cuadro, la
baja no se aplica: el cuadro actualiza el resumen y le pide que lo revise y vuelva a
confirmar.

### Después de la baja

- La página del equipo muestra el aviso **Equipo dado de baja**, con la fecha, la
  categoría, el destino de las piezas y el motivo, si se cargó.
- La página queda de **solo lectura**: no se puede editar el equipo, ni agregar,
  editar, retirar o reactivar componentes, y no se muestra la sección del QR.
- En la sección **Componentes**, las piezas figuran como **Devuelto al stock** o
  **Descartado**, con la fecha.
- El equipo conserva su historial del valor.
- En el listado figura con **Baja** y solo aparece al marcar **Mostrar equipos dados
  de baja**.

La baja es **definitiva**: no hay una opción para reactivar el equipo.

## Eliminar un equipo cargado por error

El botón **Eliminar equipo (cargado por error)** pide confirmación en el cuadro
**Eliminar equipo** y, al confirmar con **Eliminar equipo**, lo saca del inventario
y vuelve al listado.

- Solo se puede eliminar un equipo **sin piezas activas**. Si tiene alguna, el
  sistema rechaza el borrado e indica cuántas piezas activas tiene: en ese caso,
  corresponde darlo de baja.
- Un equipo eliminado **no aparece en el listado**, ni siquiera con **Mostrar
  equipos dados de baja** marcada.
- Un equipo dado de baja no se puede eliminar.

## El código QR del equipo

La sección **QR del equipo** aparece en la página de los equipos activos, para
quien tiene la casilla **MODIFICACION** de la fila **Equipos**. Quien escanee el QR
abre el formulario público de pedido con ese equipo ya cargado.

### Emitir y regenerar

- Si el equipo nunca tuvo QR, presione **Emitir QR**.
- Si ya tiene uno, el botón dice **Regenerar QR**.

Los dos piden confirmación en el cuadro **Generar QR**, que avisa que, si el equipo
ya tenía un QR, el anterior **deja de funcionar al instante** y los ya impresos hay
que reemplazarlos. Confirme con **Generar QR**.

Si el sistema avisa que el cliente todavía no tiene un slug cargado, el QR no se
puede emitir hasta que un administrador global lo configure.

### Descargar e imprimir

Con un QR vigente, la sección muestra la imagen del QR y tres botones:

- **Descargar SVG**: una imagen que se puede agrandar sin perder calidad.
- **Descargar PNG**: una imagen común.
- **Imprimir**: abre una ventana con el QR y el nombre del equipo, lista para
  imprimir. Si el navegador bloquea esa ventana, permita las ventanas emergentes
  para el sitio y vuelva a intentarlo.

El QR vigente se puede descargar o imprimir todas las veces que haga falta, sin
regenerarlo. Se descarga o imprime de a un equipo por vez.

Si el equipo tiene un QR emitido antes de que el sistema pudiera volver a
mostrarlo, la sección lo avisa: hay que regenerarlo una vez para verlo y
descargarlo, y el que está impreso deja de funcionar al regenerar.

### Cuándo el QR deja de traer el equipo

Un QR que fue reemplazado al regenerarlo, o el QR de un equipo dado de baja o
eliminado, sigue abriendo el formulario público de pedido, pero **sin el equipo
cargado**.

## Quién puede hacer cada cosa

Las casillas son las de la fila **Equipos** de la matriz de permisos. Un
Administrador puede hacer todo, tenga la matriz que tenga.

| Acción | Casilla |
|---|---|
| Ver el listado y la página de un equipo | **LECTURA** |
| Emitir, regenerar, descargar e imprimir el QR | **MODIFICACION** |
| Dar de baja un equipo | **BORRADO** |
| Eliminar un equipo cargado por error | **BORRADO** |
