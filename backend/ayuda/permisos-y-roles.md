---
slug: permisos-y-roles
titulo: Cómo funcionan los permisos y los roles
visibleParaSolicitante: false
---

# Cómo funcionan los permisos y los roles

Esta es la fuente de casi toda la confusión del sistema, así que conviene leerla
completa: **el rol no otorga permisos**. Los otorga la matriz de permisos, que es
una cosa distinta.

## La regla de fondo

Cada persona tiene, dentro de cada cliente, una **matriz de permisos**: una
grilla donde cada fila es un módulo (Tickets, Compras, Edilicia, Equipos, Ayuda,
Dashboard, Satisfacción, Preventivo) y cada casilla es una acción sobre ese
módulo. Lo que la persona puede hacer sale de esa grilla y de nada más.

En este artículo los permisos se escriben como `MÓDULO:ACCIÓN` — por ejemplo
`COMPRAS:APROBACION` — porque es como los identifica el sistema. En la pantalla
se ven como la casilla `APROBACION` dentro de la fila **Compras**.

La única excepción es el rol **Administrador**: un administrador pasa por encima
de la matriz y puede hacer todo, tenga la grilla que tenga. De hecho, la grilla
de un administrador se muestra completa y no se puede editar.

Hay un caso donde la grilla **no** decide, y no es el rol: las casillas de
escritura de la fila **Ayuda** (`ALTAS`, `MODIFICACION`, `BORRADO`, `PUBLICAR`)
aparecen pero no gobiernan nada. La Ayuda es una sola para todo el sistema y la
escribe únicamente el administrador global. Marcarle esas casillas a alguien no
le habilita ningún botón. En la fila Ayuda solo tienen efecto `LECTURA` y
`VER_TODOS`; está explicado en el artículo del módulo de Ayuda.

## Entonces, ¿para qué sirve el rol?

El rol trae una **plantilla**: un conjunto de casillas sugeridas para ese perfil.
Esa plantilla se copia a la matriz de la persona **una sola vez, al darla de
alta**, y a partir de ahí las dos cosas viven separadas. Si después se ajusta la
grilla a mano, esos ajustes quedan.

Consecuencias que sorprenden a todo el mundo:

- **Cambiar el rol no cambia lo que la persona puede hacer.** Cambiar a alguien
  de Colaborador a Técnico modifica la etiqueta del rol y nada más: la matriz
  queda idéntica.
- Si se vuelve a habilitar a alguien que había sido dado de baja, **conserva su
  matriz anterior**; no se le vuelve a aplicar la plantilla.

## Reaplicar la plantilla del rol

Desde la pantalla de usuarios se abre el botón **Permisos** de una persona. En
ese cuadro, además de la grilla y del botón **Guardar**, está el botón
**Reaplicar plantilla del rol**.

Ese botón **reemplaza la matriz completa** por la plantilla del rol que la
persona tiene en ese momento. Es la forma de volver al punto de partida desde la
aplicación, y **los ajustes manuales se pierden**. El sistema pide una
confirmación antes de hacerlo, justamente por eso.

## La trampa de "ascender" a alguien

Las plantillas no están ordenadas de menor a mayor. En particular, en Compras:

| Rol | Qué trae la plantilla en Compras |
|---|---|
| Usuario | `COMPRAS:LECTURA` |
| Colaborador | `LECTURA`, `ALTAS`, `MODIFICACION`, `BORRADO`, `APROBACION` |
| Técnico | `COMPRAS:LECTURA` |
| Administrador | La plantilla está vacía, pero puede todo |

Un **Técnico tiene menos permisos de Compras que un Colaborador**. Si a un
colaborador que aprueba compras se le cambia el rol a Técnico y además se
reaplica la plantilla, **pierde `COMPRAS:APROBACION`** y deja de poder aprobar.

Hay un caso peor. Un usuario creado directamente como **Administrador** tiene la
matriz vacía, porque no la necesita. Si más adelante se lo baja a otro rol sin
reaplicar la plantilla, queda con una matriz vacía: **sin ningún permiso**.

## El módulo Satisfacción (`CSAT:LECTURA`)

La fila **Satisfacción** de la grilla tiene una sola casilla habilitada:
`LECTURA`. No hay `ALTAS`, `MODIFICACION` ni `BORRADO` porque nadie carga una
encuesta a mano — las respuestas las deja el propio cliente al contestar el
mail que recibe cuando su ticket se cierra.

`CSAT:LECTURA` es lo que decide si una persona ve el resultado de esas
encuestas: el promedio y la cantidad de respuestas en el Dashboard, y el
puntaje con su comentario en el detalle de cada ticket. Sin esa casilla, esos
datos no aparecen — ni un error, directamente no se muestran.

Quién ve qué, además de tener la casilla:

- **Administrador** ve las respuestas de todo el cliente (bypasea la grilla,
  como el resto de los módulos).
- **Técnico** con `CSAT:LECTURA` ve solo las respuestas de los tickets que
  tiene asignados **en este momento**, nunca las de tickets ajenos. Si un
  ticket se reasigna, la vista se mueve con la asignación actual: quien lo
  atendió deja de ver esa respuesta, y el técnico nuevo pasa a verla.

Por plantilla, `CSAT:LECTURA` viene marcada de entrada para **Técnico** y
**Colaborador** al crear el usuario. **Usuario** no la trae — es consistente
con que Usuario tampoco ve el Dashboard.

Si tu Técnico o Colaborador venía de antes de que este permiso existiera, no
tenés que hacer nada: se le agregó una única vez a todos los que ya estaban
activos con ese rol, con el mismo criterio que si se hubieran creado hoy. Si
de todas formas alguien no ve los datos de la encuesta, revisá su casilla en
la grilla — puede haberla desmarcado una edición manual posterior.

## El módulo Preventivo (`PREVENTIVO:*`)

La fila **Preventivo** gobierna el mantenimiento preventivo programado: los
planes de mantenimiento recurrente (por equipo o por ubicación) y los tickets
que se generan solos cuando vence cada ciclo. Tiene las cuatro casillas
estándar, sin extras:

| Casilla | Habilita |
|---|---|
| `LECTURA` | Ver los planes y su historial de generación |
| `ALTAS` | Crear planes nuevos |
| `MODIFICACION` | Editar un plan existente (cadencia, objetivo, responsable) |
| `BORRADO` | Dar de baja un plan (deja de generar, no borra lo ya generado) |

Por plantilla, las cuatro casillas vienen marcadas de entrada para
**Colaborador** al crear el usuario — es el rol que administra el
mantenimiento preventivo. **Técnico no las trae**: no tiene acceso al
módulo. **Administrador** ve y puede todo igual, porque bypasea la grilla
como en el resto del sistema. Si tenías Técnicos usando el módulo, lo
pierden apenas se aplique esta corrección: las casillas que ya tenían
otorgadas se movieron a Colaborador (si además tienen ese rol), no se
duplicaron ni se les agregó nada de más.

## Dos detalles prácticos

1. **Los cambios no son instantáneos para la persona afectada.** Los permisos
   viajan dentro de su sesión, así que un cambio puede tardar unos minutos en
   verse, o hacerse efectivo recién cuando vuelva a iniciar sesión.
2. **Los permisos son por cliente.** Ser administrador en un cliente no otorga
   absolutamente nada en otro.

Sobre la grilla: la casilla `IMPRESION` aparece en todas las filas pero está
siempre deshabilitada, y `APROBACION` solo se puede marcar en la fila de
Compras.
