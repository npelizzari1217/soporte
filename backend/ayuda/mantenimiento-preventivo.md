---
slug: mantenimiento-preventivo
titulo: El mantenimiento preventivo se genera solo
visibleParaSolicitante: false
---

# El mantenimiento preventivo se genera solo

Un **plan de mantenimiento preventivo** describe una tarea que hay que repetir
cada tanto: revisar un equipo cada 90 días, hacer una ronda por una ubicación
todos los meses. Una vez que el plan existe, **nadie tiene que acordarse de
nada**: el sistema crea el ticket de mantenimiento por su cuenta, el día que
corresponde.

## Cuándo aparecen los tickets

Una vez por día el sistema revisa todos los planes activos y, por cada uno que
haya llegado a su fecha, crea un ticket de tipo **Mantenimiento**. El ticket
queda a nombre del responsable del plan, con el título que el plan tenga
cargado y una descripción que arranca con el objetivo (ver "Qué dice la
descripción del ticket generado", abajo).

Las fechas se calculan **siempre desde la fecha de inicio del plan**, no desde
el último ticket. Un plan mensual que arrancó un 31 de enero cae el 28 de
febrero y vuelve al 31 de marzo: no se va corriendo hacia atrás con los meses
cortos.

## Qué dice la descripción del ticket generado

La descripción de cada ticket generado arranca con una línea que identifica el
objetivo del plan, seguida de una línea en blanco y después las
instrucciones cargadas:

- Si el plan apunta a un **equipo**, la línea dice **"Equipo: &lt;nombre del
  equipo&gt;"**.
- Si el plan apunta a una **ubicación**, la línea dice **"Ubicación:
  &lt;texto&gt;"**, tal como está guardada (siempre en mayúscula).

Cuando el plan apunta a un equipo que ya no está disponible tal cual, la línea
lo dice explícitamente, distinguiendo dos situaciones que no son lo mismo:

- **Equipo dado de baja** (sigue en el inventario, pero fuera de servicio): la
  línea dice **"Equipo: &lt;nombre&gt; (dado de baja)"**.
- **Equipo eliminado del inventario**: la línea dice **"Equipo: &lt;nombre&gt;
  (eliminado del inventario)"**. El nombre se conserva porque el sistema lo
  guarda igual aunque el equipo esté eliminado.
- Si el equipo directamente **no existe** (por ejemplo, el registro se borró
  de otra forma), la línea dice **"Equipo: no encontrado (id ...)"**.
- Si el sistema **no pudo consultar** el equipo por un problema pasajero, la
  línea dice **"Equipo: no se pudo consultar (id ...)"**.

En los cuatro casos de arriba **el ticket se genera igual**: un dato
descriptivo que no se pudo resolver nunca frena el mantenimiento. Lo único
que cambia es cómo se identifica el objetivo en el texto.

## Por qué a veces NO aparece un ticket

Esta es la parte que más confunde, así que va derecho: **si el preventivo
anterior de ese plan todavía está abierto, el sistema no crea uno nuevo.**

Es a propósito. Si el mantenimiento de marzo nunca se atendió, apilar encima
el de abril, el de mayo y el de junio no ayuda a nadie: multiplica tickets
abiertos por un trabajo que en realidad es uno solo. El ciclo queda registrado
como **salteado**, la fecha del plan avanza igual, y el próximo ciclo se
genera normalmente **una vez que el ticket abierto se resuelva, se cierre o se
cancele**.

O sea: si esperabas un ticket de mantenimiento y no está, lo primero que
conviene mirar es si quedó uno anterior sin cerrar.

## Si el sistema estuvo apagado unos días

Cuando un plan quedó atrasado varios ciclos —porque el sistema estuvo
detenido, por ejemplo— **no se genera una ráfaga de tickets viejos**. Se crea
**un solo ticket**, el del ciclo vencido más reciente, y los anteriores quedan
registrados como salteados. El objetivo es que alguien salga a hacer el
mantenimiento ahora, no que se encuentre con quince tickets atrasados que ya
no tienen sentido.

## Quién se entera cuando se genera un ticket

Cuando el sistema crea el ticket, avisa por email al **responsable del plan** y a
**todos los administradores** del tenant. El aviso llega en el momento en que el
ticket queda creado — no antes.

El aviso **solo llega si se creó un ticket nuevo**. En los dos casos donde el
sistema NO genera (preventivo anterior sin cerrar, o un ciclo que quedó
registrado como salteado por atraso) **no se manda ningún email**: no tiene
sentido notificar algo que no pasó. Si un destinatario no recibe el aviso, no
significa que el ticket no se haya creado — conviene revisar el listado de
generaciones del plan antes de asumir un problema de notificación.

## Dar de baja un plan

Un plan dado de baja **deja de generar** en el acto. Los tickets que ya generó
no se tocan: siguen su curso como cualquier otro ticket.

## Quién puede ver y administrar los planes

El acceso se controla con el módulo **Preventivo**, que define cuatro
permisos al asignar roles (ver, crear, modificar y dar de baja). Sin el
permiso de lectura, el módulo no aparece. **Colaborador** es el rol que
administra el módulo completo por plantilla; **Técnico no tiene acceso**.
**Administrador** ve y puede todo igual, porque bypasea la grilla como en
el resto del sistema. Si tenías Técnicos usando el módulo, lo pierden
apenas se aplique esta corrección: sus permisos se mueven a Colaborador (si
además tienen ese rol), no se duplican. Desde la pantalla se puede **ver**,
**crear**, **editar** (ver "Editar un plan existente", abajo) y **dar de
baja** un plan. El detalle de cómo se asignan los permisos está en el
artículo de permisos y roles.

## Cómo se da de alta un plan

Desde **Preventivo**, en el menú lateral, "Nuevo plan" abre un formulario con
estos datos:

- **Título** e **instrucciones**: lo que va a leer quien atienda el ticket
  generado.
- **Objetivo**: hay que elegir **uno solo**, nunca los dos ni ninguno —
  - **Equipo**: se elige de la lista de equipos ya cargados en el inventario.
  - **Ubicación**: texto libre (una zona, una sucursal, un sector) que el
    sistema guarda siempre en mayúscula.
  Si el formulario detecta que faltan los dos, o que están los dos a la vez,
  no deja enviar la carga hasta que se corrija.
- **Prioridad** y **responsable**: la prioridad que va a tener cada ticket
  generado, y quién queda como responsable (ver "Quién se entera cuando se
  genera un ticket", arriba).
- **Cadencia**: un número y una unidad, **días** o **meses** (por ejemplo,
  "cada 90 días" o "cada 3 meses"). El número no puede superar los 3650,
  cualquiera sea la unidad elegida.
- **Fecha de inicio**: la fecha desde la que se cuenta la cadencia. Como
  explica la sección de arriba, todos los ciclos futuros se calculan desde
  esta fecha, nunca desde el ticket anterior.

**Título** y **ubicación** tienen un tope de 255 caracteres cada uno (el
mismo límite que otros campos de texto del sistema). Si alguno se pasa, el
formulario avisa antes de guardar.

## Editar un plan existente

Desde el detalle de un plan, el botón **"Editar"** abre el mismo tipo de
formulario que la carga inicial, ya completado con los datos actuales.
Se puede cambiar todo lo del alta —título, instrucciones, objetivo (equipo
u ubicación), prioridad, responsable y cadencia— **y además activar o
desactivar el plan desde ahí mismo**, sin ir a una acción aparte: es el
mismo botón "Guardar" el que aplica todos los cambios juntos.

La **fecha de inicio no se edita**: no aparece en el formulario de edición
bajo ningún concepto. Es un dato que solo se define al crear el plan.

Si se cambia la cadencia (el número o la unidad), la próxima ejecución se
recalcula **hacia adelante desde hoy** — nunca hacia atrás, y **sin generar
los ciclos que quedaron entre medio**. Por ejemplo, un plan mensual que
pasa a ser trimestral no dispara de golpe los tickets de los meses que ya
pasaron: arranca a contar de nuevo desde el momento de la edición.

Si el plan apunta a un equipo que fue dado de baja o eliminado del
inventario después de crear el plan, el selector de equipo lo sigue
mostrando (con la aclaración correspondiente) para no perder de vista cuál
era el objetivo original, aunque ya no aparezca en la lista de equipos
activos.

## El listado de planes

La pantalla principal muestra todos los planes con su objetivo, su cadencia,
la próxima ejecución y una columna **"Última generación"**. Esa columna es la
forma más rápida de detectar un plan que quedó huérfano: si dice **"Nunca
generó"**, es que todavía no se creó ningún ticket ni fila de auditoría para
ese plan, algo que conviene revisar (por ejemplo, si la fecha de inicio quedó
mal cargada). Cuando sí generó algo, se ve la fecha y el resultado del ciclo
más reciente.

## Ver las generaciones de un plan

Al entrar al detalle de un plan (haciendo clic en la fila del listado) se ve
el historial completo de generaciones: la fecha programada de cada ciclo, el
resultado (**Generado**, **Salteado (pendiente)** o **Salteado (atraso)** —
ver las secciones de arriba para lo que significa cada uno) y el ticket que
generó, si lo hubo. Desde ahí también se puede editar el plan (ver "Editar
un plan existente", arriba) o darlo de baja.
