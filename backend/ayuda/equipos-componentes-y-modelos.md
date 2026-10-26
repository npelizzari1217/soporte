---
slug: equipos-componentes-y-modelos
titulo: Componentes de un equipo y catálogo de modelos de equipo
visibleParaSolicitante: false
---

# Componentes de un equipo y catálogo de modelos de equipo

Los **componentes** son las piezas instaladas en un equipo (una memoria, un disco,
una fuente). Se cargan siempre a partir de un **repuesto del catálogo** de
insumos, y pueden descontar una unidad del depósito al instalarse. El catálogo de
repuestos se explica en el artículo "Insumos y repuestos: el catálogo, la ficha y
el alta de un ítem".

Los **modelos de equipo** son un catálogo aparte, con marca y modelo, que se elige
en el formulario de cada equipo.

## La sección Componentes

En la página del equipo, la sección **Componentes** lista las piezas con las
columnas **Tipo**, **Descripción**, **Nro de serie** y **Capacidad**. El tipo es la
familia del repuesto; si esa familia se desactivó, se ve con la etiqueta **Dado de
baja** al lado.

Debajo de cada pieza se indica cuándo se creó y cuándo se actualizó. Primero se
listan las piezas activas y después las retiradas, cada grupo en orden alfabético.
Las retiradas se ven tachadas, con la fecha y el destino del retiro: **Devuelto al
stock** o **Descartado** (las retiradas antes de que existiera el destino figuran
como **Dado de baja**). Si la pieza volvió al stock sin que constara su salida
del depósito, se aclara *sin salida registrada del depósito*.

En un equipo dado de baja, la sección es de solo lectura.

## Agregar un componente

Presione **Agregar componente** arriba de la página del equipo. El formulario
pide:

| Campo | Qué es |
|---|---|
| **Repuesto del catálogo** | Obligatorio. Se muestran el código y el nombre de cada repuesto habilitado de una familia habilitada. |
| **Descripción** | Opcional. |
| **Número de serie** | Opcional, salvo en el caso de los repuestos seguidos por serie (vea más abajo). |
| **Capacidad** | Opcional, por ejemplo *16 GB*. |
| **Descontar del depósito** | Casilla marcada al abrir el formulario. |

El tipo del componente no se elige: sale de la familia del repuesto.

### La casilla «Descontar del depósito»

- **Marcada**: al presionar **Agregar**, el sistema descuenta 1 unidad del stock
  del repuesto y crea el componente en un mismo paso. Si no hay stock suficiente,
  rechaza la operación y no crea nada.
- **Desmarcada**: el componente se registra sin mover el stock del repuesto. Sirve,
  por ejemplo, para cargar piezas que el equipo ya traía.

### Nuevo o usado

Con la casilla marcada, aparece el selector **Condición** cuando el repuesto admite
stock usado. Elige de qué saldo se descuenta la unidad: **Nuevo** (la opción
inicial) o **Usado**. Si el repuesto tiene saldo en una sola condición, el selector
queda fijo en ella y aclara *Solo hay saldo en esta condición.*

### Repuestos seguidos por número de serie

Si el repuesto se sigue por número de serie, el formulario cambia:

- **Con la casilla marcada**, primero se elige la **Condición** y después la pieza
  concreta en **Pieza (por número de serie)**, que lista los seriales disponibles en
  esa condición. La pieza elegida se instala en el equipo. Si no hay piezas para
  elegir, el formulario lo indica.
- **Con la casilla desmarcada**, el **Número de serie** pasa a ser obligatorio y
  aparece el selector **Condición** (**Nuevo** o **Usado**) para registrar la pieza.
  El serial no puede estar repetido entre las piezas de ese repuesto.

## Editar un componente

El ícono de lápiz de una pieza activa abre **Editar componente**, donde se cambian
**Descripción**, **Número de serie** y **Capacidad**, y se guarda con **Guardar**.

- El repuesto y el tipo no se pueden cambiar.
- Si la pieza se sigue por número de serie, su serial no se puede editar.
- Una pieza retirada no se edita: primero hay que reactivarla.

## Retirar un componente

El ícono de borrar de una pieza activa abre **Dar de baja el componente**. En **¿Qué
pasa con la pieza?** se elige:

- **Devolver al stock como usado**, la opción inicial: la pieza vuelve al depósito
  como usada.
- **Descartar por rotura**: la pieza se da de baja sin volver al stock.

El **Motivo** admite hasta 500 caracteres:

- Al descartar, es **obligatorio**.
- Al devolver al stock, es opcional, salvo que el componente se haya agregado sin
  descontar del depósito: en ese caso el sistema también lo pide, para explicar de
  dónde sale esa pieza.

Si la pieza se cargó antes de que su repuesto se siguiera por número de serie, al
devolverla al stock se pide **Número de serie de la pieza (obligatorio)**: con ese
serial se registra en el depósito. Si ese serial ya lo tiene otra pieza, el sistema
lo rechaza.

Confirme con **Confirmar baja**. Para retirar todas las piezas junto con el equipo,
vea el artículo "Dar de baja o eliminar un equipo, y su código QR".

## Reactivar un componente

Una pieza retirada muestra el botón **Reactivar**, que la vuelve a instalar en el
equipo.

- No se ofrece para las piezas **devueltas al stock**: reactivarlas las contaría
  dos veces.
- Si la pieza se sigue por número de serie y esa unidad ya se recuperó o se movió
  por otra vía, el sistema rechaza la reactivación.

## Quién puede hacer cada cosa

Las casillas son las de la fila **Equipos** de la matriz de permisos. Un
Administrador puede hacer todo, tenga la matriz que tenga.

| Acción | Casilla |
|---|---|
| Agregar un componente | **ALTAS** |
| Editar un componente | **MODIFICACION** |
| Reactivar un componente | **MODIFICACION** |
| Retirar un componente | **BORRADO** |

Agregar o retirar una pieza no pide permisos de Insumos: el movimiento de stock lo
registra el sistema.

## El catálogo de modelos de equipo

El catálogo se administra desde **Admin**, en la sección **Modelos de equipo**. Solo
entran el Administrador del cliente y ROOT.

La tabla muestra **Marca**, **Modelo**, **Estado** (**Activo** o **Baja**) y, en
**Acciones**, los botones **Editar** y **Dar de baja** (o **Activar**, si el modelo
está dado de baja). Los dos cambios de estado piden confirmación.

Para cargar uno, presione **Nuevo modelo de equipo** y complete:

- **Marca**: obligatoria, hasta 100 caracteres. Se guarda en mayúsculas.
- **Modelo**: obligatorio, hasta 150 caracteres. Se guarda tal como se escribe, sin
  los espacios de los bordes.

No puede haber dos modelos con la misma marca y el mismo modelo, aunque uno esté
dado de baja: el sistema rechaza el duplicado.

Los modelos **no se eliminan**. Dar de baja un modelo hace que deje de poder
elegirse en los equipos, pero los equipos que ya lo tienen lo siguen mostrando.

## El modelo en el formulario del equipo

Los formularios **Nuevo equipo** y **Editar equipo** tienen el selector **Modelo de
catálogo**, con la opción **Sin modelo de catálogo** al principio.

- Al **elegir un modelo**, los campos de texto libre **Marca** y **Modelo** se
  vacían y quedan deshabilitados: la marca y el modelo salen del catálogo. En el
  listado de equipos, la columna **Marca** muestra entonces la marca y el modelo del
  catálogo.
- Al **volver a Sin modelo de catálogo**, los dos campos se habilitan otra vez, pero
  vacíos: lo que tenían antes no se recupera y hay que volver a escribirlo.
- Los modelos dados de baja aparecen en el selector con la aclaración
  *(deshabilitado)*, pero el sistema no permite guardar un equipo con un modelo
  deshabilitado. Si un equipo ya lo tenía, para guardar cambios en él elija otro
  modelo, elija **Sin modelo de catálogo** o pida que se active el modelo.
- Si el catálogo está vacío, el formulario avisa que no hay modelos cargados y que
  se crean desde **Admin**, en **Modelos de equipo**.

Un equipo sin modelo de catálogo es válido: sigue usando la marca y el modelo
escritos a mano.
