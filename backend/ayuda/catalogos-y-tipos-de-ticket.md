---
slug: catalogos-y-tipos-de-ticket
titulo: Los catálogos: tipos de ticket, sectores, respuestas predefinidas y asignación automática
visibleParaSolicitante: false
---

# Los catálogos: tipos de ticket, sectores, respuestas predefinidas y asignación automática

Los **catálogos** son las listas que el resto del sistema usa para clasificar el
trabajo: los tipos de ticket, las prioridades, los sectores y las respuestas
predefinidas. Se administran desde el ítem **Admin** del menú.

## Quién los administra

El ítem **Admin** aparece solo para el **Administrador** del cliente y para el
administrador de la plataforma (ROOT). No depende de la matriz de permisos: el
resto de los usuarios no tiene acceso a estas pantallas, aunque sí ve los valores
de los catálogos al cargar un ticket.

Dentro de **Admin**, la barra superior lleva a cada sección. Este artículo cubre
**Catálogos** y **Asignación automática**.

## La pantalla Catálogos

**Admin > Catálogos** tiene cuatro pestañas: **Tipos de ticket**,
**Prioridades**, **Sectores** y **Respuestas**. Las prioridades y su SLA se
explican en el artículo sobre SLA y prioridades.

En todas las pestañas los registros no se borran: se dan de baja y se pueden
volver a activar. Un registro dado de baja deja de ofrecerse para cargas nuevas,
pero lo que ya lo usaba lo conserva.

## Tipos de ticket

La pestaña **Tipos de ticket** muestra las columnas **Código**, **Nombre** y
**Estado** (**Activo** o **Baja**), con las acciones **Editar** y **Dar de baja** o
**Activar**. El botón **Nuevo tipo** abre el formulario de alta.

### Los campos del tipo

- **Código**: mayúsculas, números y guion bajo, sin espacios. El número de cada
  ticket empieza con un prefijo de tres letras que sale de este código (por
  ejemplo, los tickets de Soporte empiezan con SOP). Por eso el sistema rechaza
  un código cuyo prefijo coincida con el de otro tipo activo.
- **Nombre**: el que se ve en los tickets.
- **Módulo**: el área a la que pertenece el tipo, **TICKETS** o **EDILICIA**.

Los tipos de los dos módulos se ofrecen al crear un ticket, tanto desde
**Tickets** como desde **Edilicia**. La diferencia es dónde se listan: la pantalla
**Edilicia** muestra por defecto los tickets de los tipos del módulo EDILICIA,
mientras que **Tickets** muestra los de todos los tipos que la persona puede ver.

### Copiar permisos al crear un tipo

El acceso a los tickets se otorga **tipo por tipo**, en la matriz de permisos de
cada persona. Por eso un tipo nuevo nace **cerrado**: solo los administradores lo
ven hasta que se le asignen permisos a alguien.

Al crear un tipo, el campo **Copiar permisos de** evita cargar esos permisos a
mano. Si se elige otro tipo del mismo módulo, cada usuario recibe en el tipo nuevo
los mismos permisos que tiene en el elegido. La opción **Ninguno (cerrado)** deja
el tipo sin permisos. Este campo solo aparece en el alta, no al editar.

El detalle de los permisos por tipo está en el artículo sobre permisos y roles.

### Los tres tipos fijos del sistema

**Preventivo**, **Soporte** y **Edilicia** son tipos fijos: hay funciones del
sistema que dependen de ellos, como el mantenimiento preventivo, los pedidos desde
el QR de un equipo y las reparaciones edilicias.

- **No se pueden dar de baja**: su fila no tiene esa acción.
- **Su código no se puede cambiar**: el campo aparece bloqueado al editar.
- **Su nombre sí se puede cambiar.**

El tipo **Preventivo** no se ofrece al crear un ticket a mano: esos tickets los
genera el sistema a partir de los planes de mantenimiento.

### Dar de baja un tipo

Un tipo dado de baja deja de ofrecerse para tickets nuevos. Los tickets que ya
eran de ese tipo no cambian. Un plan de mantenimiento preventivo cuyo tipo se dio
de baja deja de generar tickets hasta que se le elija otro tipo o se reactive el
tipo.

## Sectores

La pestaña **Sectores** administra la lista de sectores que se eligen al cargar
tickets, reparaciones edilicias, compras y movimientos de insumos. Muestra
**Código**, **Nombre** y **Estado**, con las acciones **Editar** y **Dar de baja**
o **Activar**. El botón **Nuevo sector** pide:

- **Código**: hasta 50 caracteres.
- **Nombre**: hasta 100 caracteres.

## Respuestas predefinidas

La pestaña **Respuestas** guarda textos que se repiten al contestar tickets, para
no escribirlos cada vez. Muestra **Título**, **Texto** y **Estado** (**Activa** o
**Desactivada**), con las acciones **Editar** y **Desactivar** o **Activar**. El
botón **Nueva respuesta** pide:

- **Título**: hasta 100 caracteres. Es lo que se ve en la lista para elegir.
- **Texto**: hasta 4000 caracteres.

### Cómo se usan

Al comentar un ticket aparece el selector **Insertar respuesta** con las respuestas
activas. Al elegir una, su texto se agrega al comentario:

- Si el comentario está vacío, el texto lo ocupa entero.
- Si ya tenía texto, la respuesta se agrega en una línea nueva, sin borrar lo
  escrito.

El texto se inserta tal cual y se puede modificar antes de enviar. Una respuesta
desactivada deja de ofrecerse. Si no hay ninguna respuesta activa, el selector no
aparece.

## Asignación automática

**Admin > Asignación automática** permite elegir quién recibe los tickets nuevos
de cada tipo. La pantalla tiene una fila por tipo de ticket activo, con las
columnas **Tipo**, **Código**, **Módulo**, **Estado** y **Responsable**.

Para configurar una regla, elija a la persona en la columna **Responsable**. El
cambio se guarda al elegirla. Para quitar la regla, elija **Sin regla**.

Solo se ofrecen como responsables los usuarios con rol **Técnico** o
**Colaborador** que tienen el permiso **Ver** sobre ese tipo.

La columna **Estado** indica cómo está cada regla:

| Estado | Qué significa |
|---|---|
| **Sin regla** | Los tickets de este tipo nacen sin asignar |
| **Activa** | Los tickets nuevos de este tipo se asignan a la persona elegida |
| **Rota** | El responsable ya no es válido (por ejemplo, perdió el permiso Ver sobre el tipo o dejó de ser Técnico o Colaborador). Los tickets nacen sin asignar hasta que se elija otra persona o se deje la fila en **Sin regla** |

Cuando la regla asigna un ticket, la persona recibe un correo que indica que se le
asignó automáticamente según la regla del tipo. Una regla que no se puede aplicar
nunca impide crear el ticket: en ese caso el ticket nace sin asignar.

## Otras secciones de Admin

La barra de **Admin** también lleva a **Ciclos**, **Usuarios**, **Familia de
Catálogos**, **Unidades**, **Modelos de equipo** e **Integraciones**. Las
integraciones se explican en el artículo sobre clientes e integraciones.
