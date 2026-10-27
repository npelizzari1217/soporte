---
slug: equipos-listado
titulo: El listado de equipos y su exportación a Excel o CSV
visibleParaSolicitante: true
---

# El listado de equipos y su exportación a Excel o CSV

## Quién entra a esta pantalla

El ítem **Equipos** del menú aparece para quien tiene la casilla **LECTURA** de la
fila **Equipos** en la matriz de permisos. La pantalla se titula **Equipos IT** y
lista el inventario de equipos del cliente.

En la misma pantalla hay dos botones de alta:

- **Nuevo equipo**, para quien tiene la casilla **ALTAS** de **Equipos**.
- **Nuevo ticket de soporte**, para quien tiene **Crear** sobre el tipo de ticket
  Soporte. Abre un ticket de soporte, con un equipo del inventario o con la opción
  **Sin equipo**.

## Dar de alta un equipo

Para cargar un equipo nuevo en el inventario, presione **Nuevo equipo**: abre un
formulario. Solo el **Nombre** es obligatorio; el resto se puede completar después,
desde la página del equipo.

- **Nombre** y **Número de serie**.
- **Modelo de catálogo**: elija uno de la lista para tomar la marca y el modelo del
  catálogo. Mientras haya uno elegido, **Marca** y **Modelo** quedan deshabilitados.
  Con **Sin modelo de catálogo**, escriba la **Marca** y el **Modelo** a mano. Ver
  "Componentes de un equipo y catálogo de modelos de equipo".
- **Fecha de adquisición**.
- **Ubicación**: texto libre; se guarda en mayúscula.
- **Importe (valor del equipo)**, **Fecha de valoración** y la sección
  **Depreciación** (**% de depreciación** con **Aplicar**, **Valor residual** y
  **Fecha del valor residual**). Ver "Importe, valor residual y depreciación de un equipo".
- **Observaciones**.

Presione **Crear** para guardarlo. El equipo aparece en el listado como **Activo**.

## Qué muestra el listado

Cada fila es un equipo, con cuatro columnas:

| Columna | Qué muestra |
|---|---|
| **Nombre** | El nombre del equipo. |
| **Marca** | Si el equipo tiene un modelo de catálogo, la marca y el modelo de ese catálogo. Si no, la marca escrita a mano en el equipo. |
| **N.º de serie** | El número de serie, o una raya si no tiene. |
| **Estado** | **Activo** o **Baja**. |

El listado **no muestra montos**. Haga clic en una fila para abrir la página del
equipo.

## La página del equipo

La página muestra el nombre y el número de serie del equipo y, debajo:

- La sección **QR del equipo**, para emitir, descargar e imprimir su código QR.
- La sección **Valor del equipo**, con el importe y el valor residual vigentes y el
  historial del valor.
- La sección **Componentes**, con las piezas instaladas y las que se retiraron.
- Al final, el gráfico **Evolución del valor del equipo**.

Arriba están los botones **Agregar componente**, **Editar**, **Dar de baja** y
**Eliminar equipo (cargado por error)**. Cada uno aparece solo si usted tiene el
permiso que le corresponde. Los demás datos del equipo (marca, modelo, modelo de
catálogo, fecha de adquisición, ubicación y observaciones) no se muestran en la
página: se ven y se cambian desde **Editar**.

Un equipo dado de baja muestra el aviso **Equipo dado de baja** y ya no tiene
botones de acción: su página es de solo lectura.

Cada parte se explica en su artículo:

- "Importe, valor residual y depreciación de un equipo".
- "Dar de baja o eliminar un equipo, y su código QR".
- "Componentes de un equipo y catálogo de modelos de equipo".

## El filtro «Mostrar equipos dados de baja»

Arriba de la tabla está la casilla **Mostrar equipos dados de baja**, que viene
**desmarcada**: por defecto el listado muestra solo los equipos vigentes. Al
marcarla aparecen también los equipos dados de baja, con **Baja** en la columna
**Estado**. La casilla queda en la dirección del navegador, así que puede guardar o
compartir el enlace con el filtro ya aplicado.

Es el único filtro del listado. El listado no se divide en páginas: todos los
equipos se cargan en la misma tabla, así que para encontrar uno puntual puede usar
la búsqueda del navegador (Ctrl+F).

Un equipo eliminado por haberse cargado por error no aparece en el listado, con la
casilla marcada o sin ella.

## Exportar

Arriba del listado está el botón **Exportar**, que abre un menú con dos opciones:

- **Excel** descarga un archivo que se abre directamente con Excel o con cualquier
  planilla de cálculo.
- **CSV** descarga el mismo contenido como texto separado, útil para importarlo en
  otros programas.

El archivo se llama *equipos-* seguido de la fecha del día y trae las columnas
**Nombre**, **Marca**, **N.º de serie** y **Estado**, sin montos ni fechas.

El archivo **sigue el mismo filtro que el listado**: con la casilla desmarcada trae
todos los equipos vigentes; con la casilla marcada trae además los dados de baja,
con **Baja** en la columna **Estado**.

La columna **Marca** del archivo dice lo mismo que la pantalla: la marca y el
modelo del catálogo si el equipo tiene un modelo de catálogo, y si no, la marca
escrita a mano.

Mientras el archivo se prepara, el botón queda en espera. En inventarios grandes
puede tardar unos segundos.

### Cuando el inventario es demasiado grande

La exportación admite hasta **5000 filas**. Si el inventario tiene más, no se
descarga nada y aparece un aviso que indica cuántas filas tiene y que hace falta
habilitar la exportación en partes. No es un error ni se perdió ningún dato.

Desmarcar la casilla de equipos dados de baja es lo único que reduce el archivo. Si
aun así lo supera, avise al administrador del sistema para que se habilite la
exportación en partes.
