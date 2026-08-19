---
slug: permisos-y-roles
titulo: Cómo funcionan los permisos y los roles
tipoTicket: null
visibleParaSolicitante: false
---

# Cómo funcionan los permisos y los roles

Esta es la fuente de casi toda la confusión del sistema, así que conviene leerla
completa: **el rol no otorga permisos**. Los otorga la matriz de permisos, que es
una cosa distinta.

## La regla de fondo

Cada persona tiene, dentro de cada cliente, una **matriz de permisos**: una
grilla donde cada fila es un módulo (Tickets, Compras, Edilicia, Equipos, Ayuda,
Dashboard) y cada casilla es una acción sobre ese módulo. Lo que la persona puede
hacer sale de esa grilla y de nada más.

En este artículo los permisos se escriben como `MÓDULO:ACCIÓN` — por ejemplo
`COMPRAS:APROBACION` — porque es como los identifica el sistema. En la pantalla
se ven como la casilla `APROBACION` dentro de la fila **Compras**.

La única excepción es el rol **Administrador**: un administrador pasa por encima
de la matriz y puede hacer todo, tenga la grilla que tenga. De hecho, la grilla
de un administrador se muestra completa y no se puede editar.

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

## Dos detalles prácticos

1. **Los cambios no son instantáneos para la persona afectada.** Los permisos
   viajan dentro de su sesión, así que un cambio puede tardar unos minutos en
   verse, o hacerse efectivo recién cuando vuelva a iniciar sesión.
2. **Los permisos son por cliente.** Ser administrador en un cliente no otorga
   absolutamente nada en otro.

Sobre la grilla: la casilla `IMPRESION` aparece en todas las filas pero está
siempre deshabilitada, y `APROBACION` solo se puede marcar en la fila de
Compras.
