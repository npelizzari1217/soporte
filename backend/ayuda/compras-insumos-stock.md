---
slug: compras-insumos-stock
titulo: El insumo de un ítem de compra y el stock que se carga solo
visibleParaSolicitante: false
---

# El insumo de un ítem de compra y el stock que se carga solo

Un ítem de compra puede indicar **qué insumo o repuesto del catálogo** se está
comprando. El dato es opcional, pero cambia algo importante: cuando se registra
la recepción del ítem, **el stock de ese insumo sube solo**, sin que nadie tenga
que cargarlo aparte.

Este artículo explica cuándo conviene declararlo, qué ocurre al recibir la
mercadería (incluido el caso de los repuestos que se llevan por número de serie)
y qué deja de poder cambiarse una vez que llegó.

## Declarar el insumo es opcional

Al agregar o editar un ítem de compra aparece el campo **Insumo (opcional)**,
además de la descripción de siempre. Son dos datos distintos y conviven:

- La **descripción** es el texto libre que describe lo que se pide, y sigue
  siendo obligatoria.
- El **insumo** es una referencia al catálogo y le indica al sistema a qué
  existencias imputar lo que entre.

La lista muestra cada insumo y cada repuesto del catálogo como «código —
nombre». Si no corresponde ninguno, elija **Sin insumo**: es el caso de todo lo
que no se lleva por stock, como un servicio, una reparación puntual o una compra
única.

Los insumos deshabilitados también aparecen en la lista, marcados con
**(deshabilitado)**, y se pueden elegir. La marca sirve para advertir que ese
insumo ya no se compra habitualmente.

## Al registrar la recepción, el stock sube solo

Cuando el ítem declara un insumo y se registra una recepción con **Registrar
recepción**, el sistema asienta en el mismo acto **una entrada en los
movimientos de ese insumo**. No hace falta ir después a la ficha del insumo a
cargar la entrada a mano: **hacerlo contaría la mercadería dos veces**.

Tres detalles que evitan sorpresas:

- **Se asienta lo que entró en ese registro, no el acumulado.** La **Cantidad
  recibida** que se carga es siempre el total recibido hasta el momento. Si
  primero se reciben 4 de 10 y después se completa a 10, el stock sube 4 y
  después 6, nunca 4 y después 10.
- **Volver a guardar el mismo número no suma nada.** Si se registra otra vez la
  misma cantidad recibida, no se asienta ningún movimiento nuevo.
- **Lo que se compra entra siempre como nuevo.** La condición «Usado» nunca nace
  de una recepción de compra.

La entrada queda a nombre de quien registró la recepción. En los movimientos del
insumo se reconoce porque la columna **Origen** dice **Recepción de compra** y
no lleva motivo escrito: el origen ya identifica de qué ítem de compra vino.

## Insumos que se llevan por número de serie

Si el insumo del ítem tiene el seguimiento **Por número de serie**, el cuadro de
**Registrar recepción** pide además un **Número de serie** por cada pieza nueva,
es decir, por la diferencia entre lo que se está registrando y lo que ya se había
recibido antes.

- **Puede dejar casillas en blanco.** Esas piezas entran igual al stock, pero
  quedan con **serie pendiente**. El cuadro le avisa cuántas quedan pendientes, y
  el número se carga después desde la ficha del insumo, con el botón **Cargar
  serial** de la sección **Unidades**.
- **La diferencia tiene que ser un número entero, de 1 a 100 piezas por
  registro.** Si no lo es, el cuadro lo indica y no deja guardar. Para recibir
  más de 100 piezas, registre la recepción en varias veces.
- **Un número de serie no se puede repetir.** Ni dentro del mismo cuadro ni con
  uno que ese insumo ya tenga registrado, en cualquier estado, incluso
  descartado. Mayúsculas y minúsculas, y los espacios, no cuentan como
  diferencia. Si un número choca, **se rechaza toda la recepción** y no se
  registra nada: corrija el número y vuelva a guardar.

El detalle de las piezas con número de serie, sus estados y su historial está en
el artículo «Movimientos de stock y piezas con número de serie».

## El insumo no se puede cambiar una vez que el ítem recibió

Mientras el ítem **no** haya recibido nada, su insumo se puede asignar, cambiar
o quitar libremente, incluso si el ítem ya fue aprobado y ya tiene la orden
registrada. Declarar el insumo tarde es normal y está permitido.

**Desde la primera recepción, eso se cierra.** En el cuadro de edición del ítem
el campo **Insumo (opcional)** queda deshabilitado, con una nota que lo explica.
Vale para las tres formas de cambiarlo: pasarlo a otro insumo, asignarle uno
donde no había y quitarle el que tenía.

El motivo es directo: el stock que ya subió quedó imputado al insumo declarado en
ese momento. Si el ítem pasara a apuntar a otro insumo, **lo que entró seguiría
contado en el insumo anterior y lo que entre después iría al nuevo**. El depósito
quedaría mostrando existencias de algo que nunca llegó y faltantes de algo que sí
está.

Las dos salidas, según el caso:

- **Antes de la primera recepción**: declare o corrija el insumo del ítem. Es el
  momento en que todavía no hay nada asentado.
- **Después**: deje el ítem como está y **corrija las existencias con un ajuste**
  desde la ficha del insumo. El ajuste queda registrado con su motivo, así que la
  corrección se explica sola.

## Los ítems sin insumo siguen funcionando igual

Los ítems cargados como texto libre, sin insumo declarado, se aprueban, se
ordenan, se reciben y se entregan exactamente igual, y **no mueven stock**. No
hay nada que corregir en ellos.

A los ítems anteriores a esta función no se les asignó un insumo
automáticamente: no había una forma confiable de deducir a cuál correspondía
cada texto, y hacerlo mal habría ensuciado las existencias.

## Si el insumo fue deshabilitado

Una compra cuyo ítem declara un insumo deshabilitado **sigue su curso**, y al
registrar la recepción el stock sube igual: la mercadería llegó al depósito, así
que las existencias tienen que reflejarla.

Es una excepción a propósito. Fuera de las compras, un insumo deshabilitado
**no admite entradas manuales**: el botón **Registrar entrada** de su ficha queda
deshabilitado. Si una compra de un insumo deshabilitado sigue abierta, conviene
revisar si todavía tiene sentido, porque el sistema no la va a frenar.
