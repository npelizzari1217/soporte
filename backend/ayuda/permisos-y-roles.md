---
slug: permisos-y-roles
titulo: Cómo funcionan los permisos y los roles
visibleParaSolicitante: false
---

# Cómo funcionan los permisos y los roles

Este artículo explica la causa de la mayoría de las dudas sobre accesos, así que
conviene leerlo completo: **el rol no otorga permisos por sí solo**. Lo que una
persona puede hacer lo deciden sus permisos, que se configuran aparte.

## Dónde se configuran

Los permisos se configuran en **Admin**, pestaña **Usuarios**, con el botón
**Permisos** de la fila de cada persona. Solo los administradores del cliente
tienen acceso a esa pantalla.

El cuadro que se abre tiene dos pestañas:

- **Módulos**: una grilla con los módulos del sistema (Compras, Equipos,
  Insumos, etc.).
- **Tipos de ticket**: una grilla con cada tipo de ticket del cliente, que
  decide qué puede hacer la persona con los tickets de cada tipo.

Cada pestaña tiene su propio botón **Guardar**, y cada uno guarda solo lo de su
pestaña. Puede pasar de una pestaña a la otra sin perder lo que editó, pero
recuerde guardar las dos si modificó ambas.

## La regla de fondo

Dentro de cada cliente, cada persona tiene su propia grilla de módulos y su
propia grilla de tipos de ticket. Lo que puede hacer sale de esas dos grillas y
de nada más.

La excepción es el rol **Administrador**: un administrador puede hacer todo,
tenga la grilla que tenga. Por eso, al abrir los permisos de un administrador
no aparece ninguna grilla, sino un aviso que indica que la asignación no tiene
efecto. Lo mismo ocurre en la pestaña **Tipos de ticket**: los administradores
operan todos los tipos de ticket sin necesidad de permisos.

Los permisos son **por cliente**. Ser administrador o tener permisos en un
cliente no otorga nada en otro.

## Para qué sirve el rol

Cada rol trae una **plantilla**: un conjunto de permisos sugeridos para ese
perfil, tanto de módulos como de tipos de ticket. Esa plantilla se copia a los
permisos de la persona **una sola vez, al darla de alta**. A partir de ese
momento, la plantilla y los permisos de la persona son independientes: si
después se ajusta la grilla a mano, esos ajustes se conservan.

Consecuencias importantes:

- **Cambiar el rol no cambia lo que la persona puede hacer.** Si cambia a
  alguien de Colaborador a Técnico, cambia el nombre del rol y nada más: sus
  permisos quedan idénticos. Para que reciba los permisos del rol nuevo, use
  **Reaplicar plantilla del rol** (se explica más abajo).
- Un usuario creado directamente como **Administrador** no recibe permisos en
  sus grillas, porque no los necesita. Si más adelante se le asigna otro rol y
  no se reaplica la plantilla, queda **sin ningún permiso**.

## Reaplicar la plantilla del rol

El botón **Reaplicar plantilla del rol** está al pie de la pestaña **Módulos**,
junto a **Guardar**.

Ese botón **reemplaza los permisos de las dos pestañas** —módulos y tipos de
ticket— por la plantilla del rol que la persona tiene en ese momento. Es la
forma de volver al punto de partida, y **se pierden los ajustes manuales** y
los cambios sin guardar de ambas pestañas. Por eso el sistema pide una
confirmación antes de hacerlo.

## La trampa de "ascender" a alguien

Las plantillas no están ordenadas de menor a mayor. Por ejemplo, en la fila
**Compras**:

| Rol | Qué trae la plantilla en Compras |
|---|---|
| Usuario | **LECTURA** |
| Colaborador | **LECTURA**, **ALTAS**, **MODIFICACION**, **BORRADO** y **APROBACION** |
| Técnico | **LECTURA** |
| Administrador | Nada, porque puede hacer todo igual |

Un **Técnico tiene menos permisos de Compras que un Colaborador**. Si a un
colaborador que aprueba compras se le cambia el rol a Técnico y además se
reaplica la plantilla, **pierde APROBACION** y deja de poder aprobar.

## La pestaña Módulos

Cada fila es un módulo y cada casilla es una acción sobre ese módulo:
**LECTURA**, **ALTAS**, **MODIFICACION**, **BORRADO**, **IMPRESION** y
**APROBACION**, más algunas acciones propias de ciertos módulos. Las casillas
que un módulo no admite aparecen deshabilitadas:

- **IMPRESION** está deshabilitada en todas las filas.
- **APROBACION** solo se puede marcar en **Compras**.
- **AJUSTAR** solo existe en **Insumos**.
- **VER_TODOS** y **PUBLICAR** solo existen en **Ayuda**.

### Edilicia

La fila **Edilicia** solo tiene habilitada la casilla **BORRADO**, y hoy esa
casilla no habilita ninguna acción. Lo que una persona puede hacer con las
reparaciones edilicias se decide en la pestaña **Tipos de ticket**, como con
cualquier otro ticket.

### Ayuda

En la fila **Ayuda** solo tienen efecto **LECTURA** (leer los artículos) y
**VER_TODOS** (ver también los artículos que no están publicados para los
solicitantes). Las casillas de escritura aparecen, pero no habilitan nada: la
Ayuda es una sola para todo el sistema y solo la escribe el administrador de
la plataforma. El detalle está en el artículo "El módulo de Ayuda y quién ve
cada artículo".

### Dashboard

La casilla **LECTURA** de la fila **Dashboard** es la que muestra la opción
**Dashboard** en el menú lateral y permite entrar a esa pantalla. Las cifras
del Dashboard se calculan solo con los tickets que la persona puede ver; un
técnico ve solo las cifras de los tickets que tiene asignados.

La plantilla la trae para **Técnico** y **Colaborador**. **Usuario** no la trae.

### Satisfacción

La fila **Satisfacción** tiene una sola casilla habilitada: **LECTURA**. No hay
altas, modificaciones ni bajas porque nadie carga una encuesta a mano: las
respuestas las deja el propio solicitante al contestar la encuesta que recibe
cuando su ticket se cierra.

**LECTURA** decide si la persona ve los resultados de esas encuestas: el
promedio y la cantidad de respuestas en el Dashboard, y el puntaje con su
comentario en el detalle de cada ticket. Sin esa casilla, esos datos
simplemente no aparecen.

Quién ve qué, además de tener la casilla:

- Un **Administrador** ve las respuestas de todos los tickets del cliente.
- Un **Técnico** ve solo las respuestas de los tickets que tiene asignados **en
  este momento**. Si un ticket se reasigna, quien lo atendía deja de ver esa
  respuesta y el técnico nuevo pasa a verla.

La plantilla la trae para **Técnico** y **Colaborador**. **Usuario** no la trae.

### Preventivo

La fila **Preventivo** gobierna el mantenimiento preventivo programado: los
planes de mantenimiento recurrente y los tickets que se generan solos cuando
vence cada ciclo.

| Casilla | Habilita |
|---|---|
| **LECTURA** | Ver los planes y su historial de generación |
| **ALTAS** | Crear planes nuevos |
| **MODIFICACION** | Editar un plan existente |
| **BORRADO** | Dar de baja un plan (deja de generar tickets; no borra los ya generados) |

La plantilla trae las cuatro casillas solo para **Colaborador**, que es el rol
que administra el mantenimiento preventivo. **Técnico** y **Usuario** no las
traen.

### Insumos

La fila **Insumos** gobierna el stock: cuánto hay de cada insumo y quién lo
movió y por qué. La casilla **LECTURA** de esta fila habilita además las
secciones **Repuestos** y el **reporte de stock**: no existe una fila propia
para Repuestos.

Esta fila no gobierna el catálogo de insumos, familias, unidades de medida ni
modelos de equipo: eso lo administra el administrador del cliente desde
**Admin**.

| Casilla | Habilita |
|---|---|
| **LECTURA** | Ver las secciones **Insumos** y **Repuestos**, el reporte de stock, la existencia de cada insumo y su historial de movimientos |
| **ALTAS** | Las operaciones diarias del depósito, como registrar entradas y salidas |
| **AJUSTAR** | Corregir la existencia contra un conteo físico, corregir el número de serie de una pieza y recuperar una pieza descartada |

**ALTAS es el permiso del trabajo diario.** Lo necesita quien retira un tóner
del depósito para instalarlo o quien registra la mercadería que acaba de
llegar.

Hay cuatro tareas que mueven el stock sin pedir esta casilla, porque el permiso
que ya requieren es suficiente:

- **Instalar un repuesto en un equipo**, con **ALTAS** de la fila **Equipos**:
  la salida del depósito se registra sola.
- **Retirar un componente de un equipo**, con **BORRADO** de la fila
  **Equipos**: usted elige si la pieza vuelve al depósito como usada o se
  descarta.
- **Dar de baja un equipo completo**, con **BORRADO** de la fila **Equipos**:
  usted elige si sus piezas vuelven al depósito como usadas o se descartan, y
  el sistema registra el movimiento de cada una.
- **Recibir una compra**, con **MODIFICACION** de la fila **Compras**: la
  mercadería recibida entra al depósito.

**AJUSTAR conviene otorgarla con más cuidado.** Con un ajuste se puede hacer
desaparecer un faltante de los números sin que nada haya salido del depósito.
Por eso está separada del registro diario: quien mueve insumos todos los días
no es necesariamente quien está autorizado a explicar una diferencia. Todo
ajuste, corrección de serie o recuperación exige un motivo escrito, que queda
guardado junto con el nombre de quien lo hizo.

**En la fila Insumos no se pueden marcar MODIFICACION ni BORRADO, y no es un
olvido.** El historial de movimientos no se edita ni se borra. Un movimiento
cargado por error se corrige registrando otro que lo compense, y los dos quedan
a la vista con su fecha y su responsable.

**Ninguna plantilla de rol trae permisos de Insumos.** Una persona recién
creada no tiene acceso al módulo, y reaplicar la plantilla de su rol le quita
los que tuviera. Estas casillas se marcan a mano.

## La pestaña Tipos de ticket

Cada fila es un tipo de ticket del cliente. Los tipos dados de baja aparecen
con la marca **Inactivo**. Las columnas son las acciones que la persona puede
realizar sobre los tickets de ese tipo:

| Columna | Habilita |
|---|---|
| **Ver** | Ver los tickets de ese tipo que la persona solicitó, los que tiene asignados como responsable y aquellos donde es técnico de una tarea |
| **Ver todos** | Ver todos los tickets de ese tipo, de cualquier persona |
| **Crear** | Crear tickets de ese tipo |
| **Modificar** | Modificar los datos de un ticket |
| **Estado** | Cambiar el estado de un ticket |
| **Asignar** | Asignar el responsable de un ticket |
| **Comentar** | Dejar comentarios |
| **Comentario interno** | Ver y dejar comentarios internos, que el solicitante no ve (para dejarlos también hace falta **Comentar**) |
| **Imprimir** | Descargar el ticket para imprimirlo |
| **Borrar** | Borrar un ticket |

**Sin Ver no se otorga nada más.** Mientras la casilla **Ver** de una fila no
esté marcada, el resto de esa fila queda deshabilitado, y al desmarcar **Ver**
se desmarca toda la fila. Si una fila guardada hace tiempo tiene acciones sin
**Ver**, el sistema lo indica en esa fila y no permite guardar hasta que se
marque **Ver** o se quiten las demás acciones.

Plantillas de rol por tipo de ticket:

| Rol | Qué trae en cada tipo |
|---|---|
| Usuario | Ver, Crear, Comentar e Imprimir |
| Colaborador | Lo mismo que Usuario, más Ver todos |
| Técnico | Todo, salvo Borrar |

**Borrar no lo trae ninguna plantilla**: solo se otorga marcándolo a mano.

### Aplicar plantilla del rol en una fila

Cada fila tiene un botón **Aplicar plantilla del rol**, que carga en esa fila lo
que la plantilla del rol de la persona da sobre ese tipo. El cambio no se guarda
hasta que usted presiona **Guardar**.

### Copiar permisos de otro usuario

Al pie de la pestaña está **Copiar permisos de otro usuario**: elija a la
persona en la lista y presione **Copiar**. Después de confirmar, los permisos
por tipo de ticket se **reemplazan** de inmediato por los de esa persona, y se
pierden los cambios sin guardar. Solo se copia esta pestaña: la grilla de
módulos no cambia. Los administradores no aparecen en la lista, porque no
tienen permisos por tipo para copiar.

### Tipos de ticket nuevos

Un tipo de ticket recién creado no lo ve nadie, salvo los administradores,
hasta que alguien recibe **Ver** sobre él en esta pestaña (salvo que al crearlo
se hayan copiado los permisos de otro tipo). Reaplicar plantillas no lo
habilita por sí solo.

## Cuándo se notan los cambios

Los cambios en la pestaña **Módulos** y los cambios de rol no siempre son
instantáneos para la persona afectada: pueden tardar unos minutos en verse, o
hacerse efectivos cuando vuelva a iniciar sesión.
