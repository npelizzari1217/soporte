---
slug: mantenimiento-preventivo
titulo: El mantenimiento preventivo se genera solo
visibleParaSolicitante: false
---

# El mantenimiento preventivo se genera solo

Un **plan de mantenimiento preventivo** describe una tarea que hay que repetir cada
cierto tiempo: revisar un equipo cada 90 días, hacer una ronda por una ubicación
todos los meses. Una vez que el plan existe, **nadie tiene que acordarse de nada**:
el sistema crea el ticket de mantenimiento por su cuenta, el día que corresponde.

## Cuándo aparecen los tickets

Una vez por día el sistema revisa todos los planes activos y, por cada uno cuyo
próximo ciclo ya entró en su anticipación, crea un ticket del **tipo de ticket del
plan** (Preventivo, salvo que el plan tenga otro: vea "Cómo se da de alta un plan",
más abajo).

Con anticipación 0 el ticket aparece el mismo día del ciclo. Con, por ejemplo, 10
días, aparece 10 días antes y guarda la fecha del ciclo como **Fecha objetivo**, que
se ve en el ticket. El día anterior a la fecha objetivo, si el ticket sigue
abierto, el responsable del plan recibe un correo de recordatorio. Si el ticket se
generó ese mismo día (por ejemplo, con 1 día de anticipación), no hay
recordatorio: el aviso de generación ya le llegó al responsable.

El ticket figura como pedido por el **responsable del plan**, con el título que el
plan tenga cargado y una descripción que empieza con el objetivo (vea "Qué dice la
descripción del ticket generado", más abajo). Si el tipo del ticket tiene una regla
de asignación automática, el ticket nace asignado a la persona de esa regla; si no,
nace sin asignar.

Los tickets de tipo **Preventivo** **no tienen SLA y no entran en las métricas de
cumplimiento** del Dashboard, y es a propósito: un preventivo se atiende cuando
llega la fecha, no contra un reloj de respuesta. Un plan de **otro tipo** genera
tickets que se comportan como cualquier ticket de ese tipo: tienen el SLA de su
prioridad y cuentan en las métricas.

Un ticket generado por un plan **no se puede borrar**, sea del tipo que sea:
borrarlo solo haría que el sistema genere otro del mismo plan. Para dejar de
generar, se da de baja el plan.

Los tickets generados antes de que existiera el tipo **Preventivo** figuran con el
tipo **Mantenimiento**: no se los reclasificó para no alterar números ya
informados. Si ve los dos tipos en el listado, ese es el motivo.

Las fechas se calculan **siempre desde la fecha de inicio del plan**, no desde el
último ticket. Un plan mensual que empezó un 31 de enero cae el 28 de febrero y
vuelve al 31 de marzo: no se va corriendo hacia atrás con los meses cortos.

## Qué dice la descripción del ticket generado

La descripción de cada ticket generado empieza con una línea que identifica el
objetivo del plan, seguida de una línea en blanco y después las instrucciones
cargadas:

- Si el plan apunta a un **equipo**, la línea dice **"Equipo: &lt;nombre del
  equipo&gt;"**.
- Si el plan apunta a una **ubicación**, la línea dice **"Ubicación:
  &lt;texto&gt;"**, tal como está guardada (siempre en mayúscula).

Cuando el plan apunta a un equipo que ya no está disponible tal cual, la línea lo
dice de forma explícita y distingue estas situaciones:

- **Equipo dado de baja** (sigue en el inventario, pero fuera de servicio): la
  línea dice **"Equipo: &lt;nombre&gt; (dado de baja)"**.
- **Equipo eliminado del inventario**: la línea dice **"Equipo: &lt;nombre&gt;
  (eliminado del inventario)"**. El nombre se conserva porque el sistema lo guarda
  aunque el equipo esté eliminado.
- Si el equipo directamente **no existe** (por ejemplo, el registro se borró de
  otra forma), la línea dice **"Equipo: no encontrado (id ...)"**.
- Si el sistema **no pudo consultar** el equipo por un problema pasajero, la línea
  dice **"Equipo: no se pudo consultar (id ...)"**.

En los cuatro casos **el ticket se genera igual**: un dato descriptivo que no se
pudo resolver nunca frena el mantenimiento. Lo único que cambia es cómo se
identifica el objetivo en el texto.

## Por qué a veces no aparece un ticket

Esta es la parte que más confunde: **si el ticket anterior de ese plan todavía
está abierto, el sistema no crea uno nuevo.**

Es a propósito. Si el mantenimiento de marzo nunca se atendió, sumar encima el de
abril, el de mayo y el de junio no ayuda a nadie: multiplica tickets abiertos por
un trabajo que en realidad es uno solo. El ciclo queda registrado como
**Salteado (pendiente)**, la fecha del plan avanza igual, y el próximo ciclo se
genera normalmente **una vez que el ticket abierto se resuelva, se cierre o se
cancele**.

Es decir: si esperaba un ticket de mantenimiento y no está, lo primero que conviene
revisar es si quedó uno anterior sin cerrar.

## Si el sistema estuvo detenido unos días

Cuando un plan quedó atrasado varios ciclos (porque el sistema estuvo detenido,
por ejemplo), **no se genera una ráfaga de tickets viejos**. Se crea **un solo
ticket**, el del ciclo vencido más reciente, y los anteriores quedan registrados
como **Salteado (atraso)**. El objetivo es que alguien haga el mantenimiento ahora,
no que se encuentre con quince tickets atrasados que ya no tienen sentido.

## Quién se entera cuando se genera un ticket

Cuando el sistema crea el ticket, avisa por correo al **responsable del plan** y a
**todos los administradores** del cliente. El aviso llega en el momento en que el
ticket queda creado, no antes.

El aviso **solo llega si se creó un ticket nuevo**. Cuando el sistema no genera
(ticket anterior sin cerrar, o un ciclo salteado por atraso), **no se envía ningún
correo**: no tiene sentido notificar algo que no pasó. Si un destinatario no recibe
el aviso, no significa que el ticket no se haya creado: conviene revisar las
generaciones del plan antes de suponer un problema de correo. Todos los correos
del sistema se explican en el artículo sobre las notificaciones por correo.

## Dar de baja un plan

Un plan dado de baja **deja de generar** en el acto. Los tickets que ya generó no
se tocan: siguen su curso como cualquier otro ticket.

## Quién puede ver y administrar los planes

El acceso se controla con la fila **Preventivo** de la matriz de permisos, que
tiene cuatro casillas: **LECTURA** (ver los planes), **ALTAS** (crearlos),
**MODIFICACION** (editarlos) y **BORRADO** (darlos de baja). Sin la casilla
**LECTURA**, el ítem **Preventivo** no aparece en el menú.

Además, cada plan tiene un **tipo de ticket**, y solo se ven los planes de los
tipos sobre los que el usuario tiene el permiso **Ver** (el mismo que decide qué
tickets ve). Un plan de un tipo que el usuario no ve no aparece en el listado ni se
puede abrir, editar ni dar de baja. Al crear o editar un plan, solo se ofrecen esos
mismos tipos.

**Colaborador** es el rol que trae las cuatro casillas en su plantilla; **Técnico**
no trae ninguna. **Administrador** ve y puede todo, porque no depende de la matriz,
como en el resto del sistema. El detalle de cómo se asignan los permisos está en el
artículo sobre permisos y roles.

## Cómo se da de alta un plan

Desde **Preventivo**, en el menú lateral, el botón **Nuevo plan** abre un
formulario con estos datos:

- **Título** e **Instrucciones**: lo que va a leer quien atienda el ticket
  generado.
- **Objetivo**: hay que elegir **uno solo**, nunca los dos ni ninguno:
  - **Equipo**: se elige de la lista de equipos ya cargados en el inventario.
  - **Ubicación**: texto libre (una zona, una sucursal, un sector) que el sistema
    guarda siempre en mayúscula.

  Si faltan los dos, o están los dos a la vez, el formulario no deja guardar hasta
  que se corrija.
- **Prioridad**: la prioridad que va a tener cada ticket generado.
- **Tipo de ticket**: el tipo de los tickets que va a generar el plan. Viene
  elegido **Preventivo**, y se puede elegir cualquier otro tipo vigente que el
  usuario vea.
- **Responsable**: quien figura como solicitante de cada ticket y recibe los
  avisos (vea "Quién se entera cuando se genera un ticket", más arriba). Tiene que
  ser un técnico o colaborador con el permiso **Ver** sobre el tipo de ticket
  elegido: la lista ofrece solo a esas personas, y cambia al cambiar el tipo. Si el
  responsable elegido no está habilitado para el tipo nuevo, el formulario lo borra
  y avisa para que se elija otro.
- **Cadencia** y **Unidad**: un número y una unidad, **Días** o **Meses** (por
  ejemplo, "cada 90 días" o "cada 3 meses"). El número no puede superar 3650,
  cualquiera sea la unidad.
- **Anticipación** y **Unidad de anticipación**: cuánto antes de la fecha de cada
  ciclo se genera el ticket. Con 0 se genera el mismo día del ciclo. La
  anticipación tiene que ser menor que la cadencia; para compararlas, un mes cuenta
  como 30 días.
- **Fecha de inicio**: la fecha desde la que se cuenta la cadencia. Como se explica
  más arriba, todos los ciclos futuros se calculan desde esta fecha, nunca desde el
  ticket anterior.

**Título** y **Ubicación** admiten hasta 255 caracteres cada uno. Si alguno se pasa,
el formulario avisa antes de guardar.

## Editar un plan existente

Desde el detalle de un plan, el botón **Editar** abre el mismo formulario que el
alta, ya completo con los datos actuales. Se puede cambiar todo lo del alta
(título, instrucciones, objetivo, prioridad, tipo de ticket, responsable, cadencia
y anticipación) **y además activar o desactivar el plan** con la casilla **Plan
activo**. El botón **Guardar** aplica todos los cambios juntos.

La **fecha de inicio no se edita**: no aparece en el formulario de edición. Es un
dato que solo se define al crear el plan.

Si se cambia la cadencia o la anticipación, la próxima ejecución se recalcula
**hacia adelante desde hoy**, nunca hacia atrás, y **sin generar los ciclos que
quedaron en el medio**. Por ejemplo, un plan mensual que pasa a ser trimestral no
genera de golpe los tickets de los meses que ya pasaron: vuelve a contar desde el
momento de la edición.

Si el plan apunta a un equipo que se dio de baja o se eliminó del inventario
después de crear el plan, el selector de equipo lo sigue mostrando (con la
aclaración correspondiente) para no perder de vista cuál era el objetivo original,
aunque ya no aparezca en la lista de equipos activos.

Lo mismo pasa con la **prioridad**, el **tipo de ticket** y el **responsable**: si la
prioridad o el tipo se dieron de baja después de crear el plan, o el responsable
dejó de estar habilitado para el tipo del plan, el selector lo sigue mostrando como
**Prioridad dada de baja**, **Tipo de ticket dado de baja** o **Responsable no
habilitado**. Sin esa opción, el selector no tendría cómo mostrar el valor guardado
y mostraría el primero de la lista: la pantalla diría una cosa y el plan seguiría
teniendo otra. Lo guardado no se altera, pero conviene elegir un reemplazo vigente
antes de guardar.

Un plan cuyo tipo de ticket se dio de baja **no genera tickets** hasta que se le
elija otro tipo (o se reactive ese tipo): el sistema no crea tickets de un tipo
dado de baja. Si se **cambia el tipo** del plan, el responsable tiene que estar
habilitado para el tipo nuevo, aunque sea el mismo que ya tenía.

## El listado de planes

La pantalla **Mantenimiento preventivo** muestra los planes de los tipos de ticket
que el usuario ve, con las columnas **Título**, **Tipo de ticket**, **Objetivo**,
**Cadencia**, **Anticipación**, **Próxima ejecución**, **Última generación** y
**Estado** (**Activo** o **Baja**).

La columna **Última generación** es la forma más rápida de detectar un plan que
nunca funcionó: si dice **Nunca generó**, todavía no hubo ningún ciclo de ese plan,
algo que conviene revisar (por ejemplo, si la fecha de inicio quedó mal cargada).
Cuando sí hubo alguno, se ve la fecha y el resultado del ciclo más reciente.

## Ver las generaciones de un plan

Al hacer clic en una fila del listado se abre el detalle del plan, con el historial
completo de generaciones: la **Fecha programada** de cada ciclo, el **Resultado**
(**Generado**, **Salteado (pendiente)** o **Salteado (atraso)**; vea las secciones
de arriba para lo que significa cada uno) y el **Ticket generado**, si lo hubo.
Desde ahí también se puede editar el plan (vea "Editar un plan existente", más
arriba) o darlo de baja con **Dar de baja**, que pide confirmación.
