---
slug: insumos-y-repuestos
titulo: Insumos y repuestos: el catálogo, la ficha y el alta de un ítem
visibleParaSolicitante: true
---

# Insumos y repuestos: el catálogo, la ficha y el alta de un ítem

El sistema lleva el stock del depósito en un único catálogo, que se muestra en
dos secciones del menú lateral: **Insumos** y **Repuestos**. Este artículo
explica qué va en cada una, qué muestra la ficha de un ítem y cómo se da de alta
uno nuevo.

## Quién puede ver estas secciones

Las dos secciones aparecen para quien tiene la casilla **LECTURA** en la fila
**Insumos** de su matriz de permisos. No hay un permiso aparte para Repuestos: la
misma casilla habilita las dos.

Dar de alta, editar, deshabilitar o habilitar un ítem del catálogo es tarea del
**Administrador**: los botones correspondientes solo se muestran a los
administradores. Registrar
movimientos de stock depende de otras casillas de la misma fila, explicadas en el
artículo «Movimientos de stock y piezas con número de serie».

## Insumos o Repuestos: lo decide la familia

Cada ítem pertenece a una **familia** (por ejemplo, «Tóner» o «Teclados»), y es
la familia la que decide en qué sección aparece:

- **Insumos** muestra los ítems cuya familia **no** está marcada como repuesto:
  los consumibles, como tóneres, cartuchos o resmas.
- **Repuestos** muestra los ítems cuya familia tiene marcada la opción **Es
  repuesto**: piezas de equipos, como teclados, mouses o fuentes.

La diferencia no es solo de ubicación. **Solo los repuestos admiten stock
«Usado»**, porque una pieza retirada de un equipo puede volver al depósito usada;
un tóner o una resma no tienen esa condición.

La marca **Es repuesto** se configura en la familia, desde **Admin**. Ver el
artículo «Administración de familias, unidades de medida y reporte de stock».

## El listado

Cada sección muestra una tabla con las columnas **Código**, **Nombre**,
**Familia**, **Unidad de medida**, **Stock mínimo** y **Estado**. Haga clic en
una fila para abrir la ficha del ítem.

- **Stock mínimo** muestra un guion cuando el ítem no tiene punto de reposición
  definido.
- **Estado** dice **Habilitado** o **Deshabilitado** (más abajo se explica la
  diferencia).

Arriba de la tabla están el botón **Reporte de stock**, que abre el reporte ya
filtrado por el tipo de la sección, y, para el administrador, el botón **Nuevo
insumo** o **Nuevo repuesto**.

## La ficha de un ítem

La ficha muestra el nombre del ítem como título y su código debajo. Arriba a la
derecha, el administrador tiene los botones **Editar** y **Deshabilitar** (o
**Habilitar**, si ya está deshabilitado).

Debajo aparece un recuadro con la **Familia**, la **Unidad de medida** y el
**Estado**, y luego estas secciones:

- **Existencia**: el stock actual y los botones para registrar movimientos.
- **Unidades**: solo en los ítems que se llevan por número de serie; lista cada
  pieza con su serial y su estado.
- **Movimientos**: el registro de todas las entradas, salidas y ajustes.

### La sección Existencia

- **Stock nuevo**: lo que hay en el depósito en condición nueva.
- **Stock usado**: lo que hay en condición usada. Solo se muestra si el ítem
  admite usados (los repuestos de una familia activa) o si ya tiene usados
  registrados.
- **Stock total**: la suma de los dos.
- **Stock mínimo**: el punto de reposición, o un guion si no se definió.
- **Reposición**: una etiqueta que compara el **stock nuevo** con el mínimo.

La etiqueta de **Reposición** puede decir:

| Etiqueta | Cuándo aparece |
|---|---|
| **Sin punto de reposición definido** | El ítem no tiene stock mínimo cargado. |
| **Existencia suficiente** | El stock nuevo está por encima del mínimo. |
| **Hay que reponer** | El stock nuevo es igual o menor que el mínimo. |

Los usados no cuentan para la reposición: un repuesto usado no reemplaza a uno
nuevo a la hora de decidir una compra.

## Dar de alta un ítem: Nuevo insumo o Nuevo repuesto

El administrador da de alta un ítem desde el listado de su sección, con el botón
**Nuevo insumo** o **Nuevo repuesto**. El formulario tiene estos campos:

- **Código**: no se escribe. Muestra «Se genera al guardar» y el sistema lo
  asigna al crear el ítem.
- **Nombre**: obligatorio, de hasta 255 caracteres.
- **Familia**: obligatoria.
- **Unidad de medida**: obligatoria.
- **Stock mínimo (opcional)**: el punto de reposición. Admite hasta dos
  decimales y no puede ser negativo. Cero es un valor válido: significa «avisar
  apenas se agote». Si lo deja vacío, el ítem queda sin punto de reposición.
- **Seguimiento**: **Por cantidad** o **Por número de serie** (se explica más
  abajo).

Haga clic en **Crear** para guardar.

### El código se genera solo

El código tiene la forma **INS-0001** para los insumos y **REP-0001** para los
repuestos. Cada serie lleva su propia numeración correlativa: crear un repuesto
no adelanta la numeración de los insumos, ni al revés.

El prefijo se decide al crear el ítem, según la familia elegida, y el código no
se puede modificar después. En la edición se muestra, pero no es un campo
editable.

### La lista de familias depende de la sección

El campo **Familia** muestra solo las familias de la clase del ítem: al crear un
insumo aparecen las familias de consumibles, y al crear un repuesto, las marcadas
como **Es repuesto**.

Al **editar** un ítem, la lista conserva además la familia que el ítem ya tiene,
aunque sea de la otra clase. Así el campo siempre muestra el valor real guardado.

Las familias y unidades dadas de baja aparecen marcadas con **(deshabilitada)**,
pero el sistema no permite asignarlas. Si no hay ninguna familia o unidad de
medida cargada, el campo queda deshabilitado con una nota que indica dónde
crearla.

## El seguimiento: Por cantidad o Por número de serie

El campo **Seguimiento** decide cómo se lleva el stock del ítem.

**Por cantidad** es la opción habitual. El sistema solo sabe cuántos hay: cada
entrada suma y cada salida resta. Sirve para todo lo que es intercambiable entre
sí, como tóneres, resmas o cables.

**Por número de serie** registra cada pieza por separado, con su propio número de
serie, su estado (en el depósito, instalada en un equipo, entregada o descartada)
y su historial. Conviene para piezas valiosas o con garantía que se quieren
seguir una por una, como discos, fuentes o placas.

Con **Por número de serie**:

- Cada entrada pide un número de serie por pieza, y la cantidad tiene que ser un
  número entero.
- Cada salida se hace eligiendo la pieza concreta que sale.
- La ficha muestra la sección **Unidades**, con todas las piezas.

Reglas para elegir o cambiar el seguimiento:

- **La unidad de medida tiene que ser entera.** Para llevar un ítem por número de
  serie, su unidad debe estar marcada como entera (se cuenta en piezas). Si elige
  una que no lo es, el formulario lo advierte.
- **Pasar a Por número de serie exige stock total cero.** El stock existente no se
  convierte en piezas: primero hay que llevarlo a cero.
- **Volver a Por cantidad exige que no queden piezas en el depósito ni instaladas
  en equipos.**

El seguimiento se puede cambiar desde **Editar**. Si el cambio no cumple alguna de
estas reglas, el formulario muestra el motivo. Si en la misma edición cambió otros
datos, el aviso indica qué parte ya quedó guardada, y el botón pasa a ofrecer
reintentar solo lo que falta.

## Habilitado, deshabilitado y fuera del catálogo

**Deshabilitar** un ítem significa «no se compra más esto». El ítem sigue en el
catálogo, se ve en el listado con la etiqueta **Deshabilitado** y se puede volver
a habilitar en cualquier momento con **Habilitar**. Mientras está deshabilitado:

- **No admite entradas manuales**: el botón **Registrar entrada** queda
  deshabilitado.
- **Sí admite salidas y ajustes**, para poder consumir o corregir lo que quedó en
  el depósito.
- La recepción de una compra que ya lo declaraba **sí** suma stock (ver «El
  insumo de un ítem de compra y el stock que se carga solo»).

**Fuera del catálogo** es otra cosa: es un ítem que el sistema ya no encuentra.
Si abre la ficha de un ítem así, por ejemplo desde un enlace guardado, la
pantalla muestra «No se encontró el insumo en el catálogo» (o «el repuesto»).
Del mismo modo, en una tabla puede aparecer **Fuera del catálogo** en lugar del
nombre de una familia o una unidad de medida que ya no está disponible.
