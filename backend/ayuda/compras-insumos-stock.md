---
slug: compras-insumos-stock
titulo: El insumo de un ítem de compra y el stock que se carga solo
visibleParaSolicitante: false
---

# El insumo de un ítem de compra y el stock que se carga solo

Un ítem de compra puede decir **qué insumo del catálogo** se está comprando. Ese
dato es opcional, pero cambia una cosa importante: cuando se registra la
recepción del ítem, **el stock de ese insumo sube solo**, sin que nadie cargue
nada aparte.

Este artículo explica cuándo conviene declararlo, qué pasa después y qué deja de
poder hacerse una vez que llegó la mercadería.

## Declarar el insumo es opcional

Al cargar un ítem de compra se puede elegir un insumo del catálogo, además de la
descripción de siempre. Son dos datos distintos y conviven:

- La **descripción** es el texto libre que describe lo que se pide, y sigue
  siendo obligatoria.
- El **insumo** es una referencia al catálogo, y sirve para que el sistema sepa
  a qué existencias imputar lo que entre.

Un ítem sin insumo declarado es perfectamente válido. Es el caso de todo lo que
no se lleva por stock: un servicio, una reparación puntual, una compra única.

## Al registrar la recepción, el stock sube solo

Este es el cambio de conducta que conviene entender bien.

Cuando el ítem declara un insumo y se registra una recepción, el sistema asienta
**una entrada en la bitácora de existencias de ese insumo**, en el mismo acto.
No hay que ir después al módulo de insumos a cargar la entrada a mano: **hacerlo
contaría la mercadería dos veces**.

Dos detalles que evitan sorpresas:

- **Se asienta lo que entró en ese registro, no el acumulado.** La cantidad
  recibida que se carga en el ítem es siempre el total recibido hasta el
  momento. Si primero se reciben 4 de 10 y después se completa a 10, el stock
  sube 4 y después 6 — nunca 4 y después 10.
- **Volver a guardar el mismo número no suma nada.** Si se registra otra vez la
  misma cantidad recibida, no se asienta ningún movimiento nuevo. Reintentar es
  inofensivo.

La entrada queda a nombre de quien registró la recepción, y guarda de qué ítem
de compra vino. No lleva un motivo escrito a mano: el origen ya está registrado,
y es un dato que el sistema puede seguir hacia atrás hasta la compra.

## El insumo no se puede cambiar una vez que el ítem recibió

Mientras el ítem **no** haya recibido nada, su insumo se puede asignar, cambiar
o borrar libremente. Incluso si el ítem ya fue aprobado y ya tiene la orden
emitida: declarar el insumo tarde es normal y está permitido.

**Desde la primera recepción, eso se cierra.** El sistema rechaza el cambio con
un aviso que dice que el ítem ya recibió mercadería. Vale para las tres formas
de cambiarlo: pasarlo a otro insumo, asignarle uno donde no había, y quitarle el
que tenía.

El motivo es directo: el stock que ya subió quedó imputado al insumo que estaba
declarado en ese momento. Si el ítem apuntara a otro insumo, **lo que entró
seguiría contado en el insumo viejo y lo que entre después iría al nuevo**. El
depósito quedaría diciendo que hay existencias de algo que nunca llegó, y que
falta algo que sí está.

Las dos salidas, según el caso:

- **Antes de la primera recepción**: declarar o corregir el insumo del ítem. Es
  el momento en que todavía no hay nada asentado.
- **Después**: dejar el ítem como está y **corregir las existencias con un
  ajuste manual** en el módulo de insumos, que es la herramienta que existe
  justamente para arreglar un conteo. Un ajuste queda registrado con su motivo,
  así que la corrección se explica sola.

## Los ítems de siempre siguen funcionando igual

Todo lo cargado antes de este cambio es texto libre y **no tiene insumo
declarado**. Esos ítems se aprueban, se ordenan, se reciben y se entregan
exactamente como antes, y **no mueven stock**. No hay nada que corregir en
ellos ni ninguna carga pendiente.

Tampoco se les asignó un insumo automáticamente: no había forma confiable de
adivinar a cuál correspondía cada texto, y hacerlo mal habría ensuciado las
existencias.

## Dos casos que conviene tener presentes

**Si el insumo elegido no existe**, el sistema rechaza el ítem con un aviso que
nombra el insumo que no encontró. Suele pasar cuando el insumo fue dado de baja
del catálogo entre que se armó la solicitud y se guardó.

**Si el insumo fue deshabilitado**, la compra sigue su curso igual. Deshabilitar
un insumo significa "no se compra más de esto de acá en adelante", y una orden
que ya se aprobó es una decisión anterior a esa baja. La mercadería llegó al
depósito, así que el stock la refleja. Lo que sí conviene revisar en ese caso es
si la compra todavía tiene sentido, porque el sistema no la va a frenar.
