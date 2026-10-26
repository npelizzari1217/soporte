---
slug: insumos-movimientos-y-series
titulo: Movimientos de stock y piezas con número de serie
visibleParaSolicitante: false
---

# Movimientos de stock y piezas con número de serie

El stock de un insumo o repuesto no se edita a mano: **se calcula a partir de sus
movimientos**. Cada entrada suma, cada salida resta y cada ajuste corrige. Este
artículo explica cómo registrar cada tipo de movimiento desde la ficha del ítem y
cómo se manejan las piezas que se llevan por número de serie.

Para saber qué es la ficha, qué significa cada saldo y cómo se elige el
seguimiento de un ítem, vea «Insumos y repuestos: el catálogo, la ficha y el alta
de un ítem».

## Quién puede registrar movimientos

Los botones aparecen en la sección **Existencia** de la ficha, según las casillas
de la fila **Insumos** de la matriz de permisos:

| Casilla | Qué habilita |
|---|---|
| **LECTURA** | Ver la ficha, el stock, los movimientos y el historial de las piezas. |
| **ALTAS** | **Registrar entrada** y **Registrar salida**; en las piezas con número de serie, **Cargar serial** y **Devolver al depósito**. |
| **AJUSTAR** | **Registrar ajuste**; en las piezas con número de serie, **Corregir serial** y **Recuperar**. |

Las casillas son independientes: tener **ALTAS** no habilita los ajustes. El ajuste
es la única operación que puede corregir un faltante, y por eso tiene su propia
casilla.

## Los campos comunes

Los tres cuadros (entrada, salida y ajuste) comparten estos campos:

- **Cantidad**: mayor que cero, con hasta dos decimales y un máximo de 1.000.000.
- **Motivo (opcional)**: hasta 500 caracteres. En el ajuste se llama **Motivo** y
  es obligatorio.
- **Equipo (opcional)**: permite vincular el movimiento a un equipo. Si no
  corresponde, deje **Sin equipo**.
- **Sector (opcional)**: permite vincular el movimiento a un sector. Si no
  corresponde, deje **Sin sector**.
- **Condición**: **Nuevo** o **Usado**. Solo aparece en los repuestos, que son los
  únicos que admiten stock usado. Si en ese momento solo hay saldo en una de las
  dos condiciones, el campo queda fijo en ella y lo indica con la nota «Solo hay
  saldo en esta condición.».

Haga clic en **Registrar** para guardar el movimiento.

## Registrar entrada

Suma stock: mercadería que llegó al depósito por fuera de una compra, una
donación, un traslado desde otro lugar.

El botón **Registrar entrada** queda deshabilitado si el ítem está
deshabilitado: un ítem deshabilitado no admite entradas manuales.

Si el ítem viene de una compra con el insumo declarado, **no registre la entrada a
mano**: la recepción de la compra ya la asienta sola. Ver «El insumo de un ítem de
compra y el stock que se carga solo».

## Registrar salida

Resta stock: lo que se entrega o se consume.

- El botón **Registrar salida** queda deshabilitado cuando no hay existencia.
- La cantidad no puede superar el stock disponible. Si lo supera, el cuadro lo
  indica con el disponible actual.

## Registrar ajuste

Corrige el stock cuando el conteo físico no coincide con el sistema: un faltante,
un sobrante, una rotura.

- **Tipo de ajuste**: **Ajuste positivo** (suma) o **Ajuste negativo** (resta).
- **Motivo**: obligatorio. Un ajuste sin explicación es un faltante sin
  explicación, y el motivo queda visible en los movimientos.
- Un **Ajuste negativo** no puede superar el stock disponible.

El ajuste también se puede registrar sobre un ítem deshabilitado, igual que la
salida, para corregir lo que quedó en el depósito.

## El registro de movimientos

La sección **Movimientos** de la ficha lista todo lo registrado, de a 10 filas por
página. Sus columnas son:

- **Fecha**: el momento del registro.
- **Tipo**: **Entrada**, **Salida**, **Ajuste positivo** o **Ajuste negativo**.
- **Cantidad**: con signo más si sumó y signo menos si restó.
- **Condición**: **Nuevo** o **Usado**.
- **Registrado por**: la persona que lo registró.
- **Motivo**: el texto cargado, o un guion si no tiene.
- **Origen**: **Recepción de compra** si lo asentó una compra, o **Carga manual**
  si se registró desde la ficha.

Los movimientos no se editan ni se borran. Si uno quedó mal, se corrige con un
ajuste en sentido contrario, que queda registrado con su motivo.

## La condición: nuevo o usado

Los repuestos llevan dos saldos separados, **Stock nuevo** y **Stock usado**. Una
pieza usada es, por ejemplo, la que se retiró de un equipo y volvió al depósito en
buen estado. Los insumos que no son repuestos solo tienen stock nuevo.

La condición importa para reponer: la etiqueta de reposición de la ficha mira solo
el stock nuevo.

## Piezas con número de serie

Cuando el ítem tiene el seguimiento **Por número de serie**, cada pieza se registra
por separado y los movimientos cambian así:

- **Entrada y ajuste positivo**: la cantidad tiene que ser un número entero, de 1
  a 100 por vez. Debajo de la cantidad aparece un campo **Número de serie de la
  pieza** por cada pieza, y todos son obligatorios.
- **Salida**: en lugar de la condición aparece el campo **Pieza (por número de
  serie)**, para elegir la pieza concreta que sale. La cantidad queda fija en 1.
  Solo se ofrecen piezas en el depósito que ya tienen número de serie. La salida
  deja la pieza como **Entregada**.
- **Ajuste negativo**: también se elige la pieza, con la cantidad fija en 1. Aquí
  se ofrecen todas las piezas en el depósito, incluidas las de serie pendiente. El
  ajuste negativo deja la pieza como **Descartada**.

Un número de serie no se puede repetir dentro de un mismo ítem, en ningún estado,
incluso si la pieza fue descartada. Las mayúsculas y minúsculas, y los espacios, no
cuentan como diferencia.

### La sección Unidades

La ficha de un ítem por número de serie muestra la sección **Unidades**, con una
fila por pieza y las columnas **Número de serie**, **Condición**, **Estado** y
**Equipo** (donde está instalada, si corresponde).

Cada pieza está en uno de cuatro estados:

| Estado | Qué significa |
|---|---|
| **En depósito** | Está disponible en el depósito y cuenta en el stock. |
| **Instalada** | Está colocada en un equipo. |
| **Entregada** | Salió del depósito con una salida. |
| **Descartada** | Se dio de baja, con un ajuste negativo o al retirarla de un equipo como descarte. |

Las piezas pasan a **Instalada** cuando se agregan como componente de un equipo, y
dejan de estarlo cuando se retiran; esas operaciones se hacen desde el módulo
**Equipos**.

Arriba de la tabla, el filtro **Todos los estados** permite ver solo las piezas de
un estado. Si hay piezas sin número de serie en el depósito, al lado del título
aparece una etiqueta con la cantidad, por ejemplo «2 series pendientes».

### Series pendientes

Una pieza con **serie pendiente** es una pieza en el depósito que todavía no tiene
su número cargado. Aparece sobre todo al recibir una compra en la que se dejaron
números en blanco.

Las piezas pendientes **cuentan en el stock**, pero no se pueden entregar con una
salida ni instalar en un equipo hasta que tengan su número. Sí se pueden dar de
baja con un ajuste negativo.

### Las acciones sobre cada pieza

Cada fila ofrece los botones que correspondan a su estado y a sus permisos:

- **Cargar serial**: en una pieza en el depósito con serie pendiente. Escriba el
  **Número de serie** y haga clic en **Cargar serial**. Si el número ya existe en
  ese ítem, el sistema lo rechaza y el cuadro muestra el aviso.
- **Corregir serial**: en cualquier pieza que ya tenga número. El cuadro muestra
  el serial actual y pide el **Número de serie nuevo** y el **Motivo de la
  corrección**, que es obligatorio. El serial anterior queda en el historial de la
  pieza, junto con el motivo.
- **Devolver al depósito**: en una pieza **Entregada** que vuelve. Elija la
  **Condición** con la que regresa (**Nuevo** si no se usó, **Usado** si se usó) y,
  si quiere, un **Motivo (opcional)**.
- **Recuperar**: en una pieza **Descartada** que en realidad sirve. Elija la
  **Condición** y escriba el **Motivo de la recuperación**, que es obligatorio.
- **Historial**: abre la línea de tiempo de la pieza.

Al devolver o recuperar, la pieza vuelve a **En depósito** conservando su número de
serie; una pieza que estaba pendiente vuelve pendiente. Cada devolución o
recuperación suma una unidad al stock y aparece en **Movimientos** como una entrada
de 1. Estas dos acciones funcionan aunque el ítem esté deshabilitado, porque la
pieza ya existe físicamente.

La opción **Usado** solo aparece en los repuestos. En los demás ítems, la pieza
vuelve como nueva.

### El historial de una pieza

El botón **Historial** abre el cuadro **Historial de la unidad**: cada evento con su
fecha, la persona que lo registró y, cuando corresponde, el serial, el equipo, el
sector y el motivo. Los eventos posibles son:

- **Ingreso al depósito**
- **Alta como instalada**
- **Serial cargado**
- **Corrección de serial** (con el serial anterior y el nuevo)
- **Instalación en un equipo**
- **Retiro al depósito**
- **Descarte**
- **Entrega**
- **Devolución de una entrega**
- **Baja del depósito**
- **Recuperación de una pieza descartada**
- **Reactivación del componente**
