---
slug: tickets-listado
titulo: El listado de tickets: filtros, alcance y exportación a Excel o CSV
visibleParaSolicitante: true
---

# El listado de tickets: filtros, alcance y exportación a Excel o CSV

## Quién entra a esta pantalla

El ítem **Tickets** del menú aparece para quien tiene **Ver** sobre al menos un
tipo de ticket, de cualquier módulo. Por eso quien solo trabaja tipos de
Edilicia también puede seguir desde aquí el estado de lo que pidió.

## Qué muestra el listado

Cada fila es un ticket, y las columnas son:

- **Ticket**: el título y, debajo, el número y la fecha y hora de alta.
- **Estado**: el estado actual (Nuevo, Asignado, En proceso, Esperando al
  cliente, Resuelto, Cerrado o Cancelado).
- **Prioridad**: la prioridad cargada.
- **Responsable**: el técnico a cargo. Si todavía no tiene uno, dice
  **Sin asignar**.
- **Ubicación**: el lugar físico que se cargó en el ticket, o un guion si está
  vacía.
- **Sector**: el sector del cliente, o un guion si no tiene. Un sector que se
  dio de baja después se sigue mostrando con su nombre.
- **Fecha objetivo**: solo la tienen los tickets que genera un plan de
  mantenimiento preventivo. Es informativa y no cambia el SLA.

Haga clic en una fila para abrir el detalle del ticket. Lo que se puede hacer
ahí se explica en el artículo "El detalle de un ticket: acciones, actividad y
tiempo del técnico".

El listado muestra **10 tickets por página**, el más reciente primero. Debajo
de la tabla se indica la página ("Página 1 de 4") y los botones **Anterior** y
**Siguiente** permiten recorrer el resto.

## Quién ve qué: el alcance por tipo de ticket

**No todos ven los mismos tickets.** Lo que usted ve se decide tipo por tipo,
según los permisos que tiene sobre cada tipo de ticket (la grilla
**Tipos de ticket** de la pantalla de permisos del usuario):

- Sin **Ver** sobre un tipo, ningún ticket de ese tipo aparece, ni siquiera uno
  donde usted sea el responsable.
- Con **Ver** pero sin **Ver todos**, de ese tipo aparecen solo los tickets que
  usted pidió, los que tiene asignados como responsable y aquellos donde es el
  técnico de una tarea. Si le reasignan el ticket o lo quitan de la tarea, el
  ticket deja de aparecer, salvo que lo vea por otro de esos motivos.
- Con **Ver** y **Ver todos**, aparecen todos los tickets de ese tipo.

Los usuarios con rol Administrador y el administrador global de la plataforma
ven todos los tickets, sin importar la grilla.

Esto explica el reclamo más común sobre esta pantalla: "no veo un ticket que sé
que existe". Antes de sospechar un error, revise qué permisos tiene su usuario
sobre el tipo de ese ticket. No es un filtro que se pueda cambiar desde la
pantalla.

## Los filtros

Arriba del listado hay filtros combinables: se aplican todos juntos, no uno a la
vez.

- **Búsqueda**: el campo **Buscar por título o descripción…** encuentra el
  texto dentro del título o de la descripción del ticket.
- **Ciclo**: por defecto el listado muestra el **Ciclo activo**. Para ver
  tickets de un ciclo anterior, elíjalo en esta lista; el ciclo vigente figura
  con la marca "(activo)". Si el cliente no tiene ningún ciclo activo, se elige
  solo el ciclo más reciente.
- **Estado**: el estado actual del ticket.
- **Tipo**: ofrece solo los tipos sobre los que usted tiene **Ver**.
- **Prioridad**: la prioridad cargada.
- **Asignado**: filtra por responsable. Aparece si usted tiene **Asignar**
  sobre algún tipo de ticket, o **Ver todos** sobre algún tipo de los módulos
  Tickets, Compras o Equipos. La lista ofrece solo a los técnicos y
  colaboradores que atienden los tipos que usted ve; si además filtró por un
  tipo, solo a los que atienden ese tipo.
- **Borrados**: solo para usuarios con rol Administrador y para el administrador
  global. Con la opción **Tickets activos** se ve el listado normal; con
  **Borrados** se ven únicamente los tickets borrados (ver más abajo).

Los filtros quedan guardados en la dirección de la página: puede compartir un
enlace con un filtro aplicado, o volver atrás con el botón del navegador para
recuperar el filtro anterior. Si el resultado queda vacío por los filtros, la
pantalla ofrece **Limpiar filtros**.

## Crear un ticket

El botón **Nuevo ticket** aparece si usted tiene **Crear** sobre algún tipo de
ticket que admita alta desde esta pantalla. El formulario pide **Título**,
**Descripción**, **Tipo** y **Prioridad**, y opcionalmente **Ubicación** (texto
libre de hasta 255 caracteres) y **Sector**. El selector **Tipo** ofrece solo
los tipos sobre los que usted tiene **Crear**. Al presionar **Crear ticket** se
abre el detalle del ticket nuevo.

Los tickets de Compras y de Equipos no se crean desde aquí: tienen su propia
alta en su módulo. Los de mantenimiento preventivo los genera el sistema.

## Tickets borrados y su recuperación

Con el filtro **Borrados**, cada fila lleva la marca **Borrado** y una columna
**Borrado** con la fecha en que se borró y el botón **Recuperar**. El ticket
recuperado vuelve al listado normal con el mismo estado y los mismos datos que
tenía. En esta vista las filas no abren el detalle y el botón **Exportar** no
aparece.

## Exportar a Excel o CSV

Arriba a la derecha del listado está el botón **Exportar**, que despliega dos
opciones: **Excel** y **CSV**. Las dos bajan el mismo contenido; el archivo de
Excel se abre con un doble clic en Excel o en cualquier planilla de cálculo.

Lo importante es **qué** baja: el archivo trae **exactamente lo que los filtros
de la pantalla están mostrando, pero completo**, no solo la página visible. Si
el listado tiene 300 tickets repartidos en páginas de a 10, el archivo trae los
300. El ciclo elegido también se respeta.

El alcance por tipo de ticket descrito arriba también aplica a la exportación:
el archivo nunca trae tickets que usted no podría ver en pantalla. Exportar no es
una forma de esquivar esa restricción.

El archivo tiene estas columnas: **Número**, **Título**, **Estado**,
**Prioridad**, **Técnico asignado**, **Fecha de creación** (con hora) y
**Fecha de cierre** (solo el día; queda vacía si el ticket sigue abierto). La
ubicación, el sector y la fecha objetivo se ven en pantalla pero no viajan en el
archivo. El estado y la prioridad salen con el mismo nombre que en pantalla.

### Cuando hay demasiados tickets para exportar

La exportación admite hasta **5000 tickets**. Si el listado filtrado supera ese
número, no se genera el archivo y aparece un aviso que pide acotar los filtros.
No es un error ni se perdió nada.

La salida es acotar el pedido combinando filtros (por ejemplo, un estado
puntual, un tipo o una palabra del título) y repetir la exportación las veces que
haga falta.

## La encuesta de satisfacción al cerrar

Cuando un ticket pasa a **Cerrado**, y si el cliente tiene la función
habilitada, quien lo pidió recibe automáticamente un correo para calificar la
atención con estrellas y un comentario opcional. El puntaje y el comentario, si
los hay, se ven en el detalle del ticket para quien tenga la casilla
**LECTURA** de la fila **Satisfacción** en su matriz de permisos. Los detalles
del enlace se explican en el artículo "La encuesta de satisfacción al cerrar un
ticket".
