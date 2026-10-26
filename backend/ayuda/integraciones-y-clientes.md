---
slug: integraciones-y-clientes
titulo: Clientes, correo, API pública y webhooks
visibleParaSolicitante: true
---

# Clientes, correo, API pública y webhooks

Este artículo cubre dos pantallas de configuración:

- **Clientes**, donde el administrador de la plataforma (ROOT) da de alta cada
  organización y configura su correo, su logo y qué funciones tiene habilitadas.
- **Integraciones**, donde el administrador de cada cliente crea las claves para
  que otros sistemas operen con los tickets y configura los avisos automáticos a
  esos sistemas.

## La pantalla Clientes (solo ROOT)

Se abre desde el ítem **Clientes** de la sección **ROOT** del menú. Esa sección
solo aparece para el administrador de la plataforma; cualquier otro usuario que
llegue a la pantalla ve un aviso de que solo ROOT puede administrar clientes.

La tabla muestra **Nombre**, **CUIT**, **Base de datos**, **Estado** (**Activo** o
**Inactivo**), **Correo** (**Correo configurado** o **Correo no configurado**) y
**Acciones**.

### Alta y datos del cliente

- **Nuevo cliente** pide **Nombre**, **Razón social (opcional)**, **CUIT
  (opcional)** y los datos del primer administrador del cliente: **Email del
  admin**, **Nombre del admin**, **Apellido del admin** y **Contraseña del admin**.
- **Ver** muestra los datos del cliente.
- **Editar** permite cambiar **Nombre**, **Razón social** y **CUIT**. La base de
  datos no se puede cambiar.
- **Desactivar** deja al cliente inactivo, previa confirmación. Es reversible con
  **Activar**, y la base de datos del cliente no se elimina.

### Correo

El botón **Correo** configura la cuenta desde la que salen todos los avisos de ese
cliente. **Sin esta configuración, el cliente no envía ningún correo**: ni avisos
de tickets, ni encuestas, ni recuperación de contraseña. Los avisos se detallan en
el artículo sobre las notificaciones por correo.

Los campos son los datos del servidor de correo saliente que da el proveedor de
la cuenta:

- **Host** y **Puerto**.
- **TLS/SSL**: si la conexión es segura.
- **Usuario** y **Contraseña**. La contraseña es obligatoria la primera vez;
  después se puede dejar vacía para conservar la guardada.
- **Remitente**: la dirección que se ve como origen de los correos.

Al **Guardar**, el sistema guarda los datos y prueba la conexión:

- Si la prueba funciona, se lee **Verificado el** con la fecha y la hora.
- Si falla, la configuración queda guardada igual y se lee **Verificación
  fallida** con el motivo, para corregirlo.

**Probar conexión** repite la prueba sin modificar los datos. **Quitar
configuración** borra la cuenta, previa confirmación: el cliente deja de enviar
correos hasta que se vuelva a configurar.

### Encuesta

El botón **Encuesta** habilita o deshabilita la encuesta de satisfacción con la
casilla **Encuesta de satisfacción habilitada**. Está explicado en el artículo
sobre la encuesta de satisfacción.

### API

El botón **API** muestra si la API pública del cliente está **Habilitada** o
**Deshabilitada**, y permite cambiarlo con **Habilitar API** o **Deshabilitar
API**, siempre con confirmación.

- Con la API habilitada, el administrador del cliente puede crear claves desde
  **Integraciones**.
- Al deshabilitarla, **todas las claves del cliente dejan de funcionar en el
  acto**, y tampoco se envían avisos de webhook. Las claves no se borran: si la API
  se vuelve a habilitar, las que no fueron revocadas vuelven a funcionar.

### Formulario

El botón **Formulario** configura el formulario público, que permite pedir ayuda
sin tener usuario, desde un enlace o desde el código QR de un equipo:

- **Slug**: identifica al cliente en la dirección pública. Admite solo minúsculas,
  números y guiones, y no se puede cambiar una vez que se emitió el primer QR de un
  equipo.
- **Formulario público habilitado**: con la casilla desmarcada, el enlace deja de
  funcionar. Si el cliente no tiene correo configurado, solo pueden pedir ayuda los
  usuarios con sesión iniciada.

### Logo

El botón **Logo** permite subir la imagen del cliente con **Elegir archivo** y
**Subir**. Acepta PNG, JPEG o WebP de hasta 512 KB. **Quitar logo** vuelve al
ícono genérico. En los dos casos, los usuarios ven el cambio en su próximo inicio
de sesión.

## La pantalla Integraciones

Se abre desde **Admin > Integraciones**. La usan el **Administrador** del cliente
y el administrador de la plataforma. Para crear claves o configurar webhooks, ROOT
tiene que haber habilitado antes la API del cliente.

### Claves de la API pública

Una clave permite que un sistema externo consulte, cree o comente tickets sin
usar el usuario de una persona. La tabla de claves muestra **Nombre**,
**Permisos**, **Creada**, **Último uso** (**Nunca** si no se usó), **Estado**
(**Activa** o **Revocada**) y la acción **Revocar**.

Para crear una clave, use **Nueva clave**:

- **Nombre**: hasta 100 caracteres. Conviene que identifique al sistema que la va a
  usar.
- Los permisos, al menos uno: **Ver tickets**, **Crear tickets** y **Comentar
  tickets**. Dé solo los que el sistema necesita.

Al crearla aparece el cuadro **Clave creada** con la clave completa y el botón
**Copiar clave**. **Es la única vez que se muestra**: guárdela en un lugar seguro
antes de cerrar con **Ya la guardé**. Si se pierde, hay que revocarla y crear otra.

**Revocar** deja la clave sin efecto en el acto, previa confirmación, y no se
puede deshacer.

Algunos detalles de cómo opera una clave:

- Actúa sobre los tickets de los tipos del módulo **TICKETS**, no sobre los de
  **EDILICIA**.
- Un comentario hecho con una clave cuenta como respuesta del cliente, no del
  soporte: no registra la primera respuesta del SLA, y sí le llega como aviso a
  quien pidió el ticket.

La propia pantalla indica la dirección de la API y cómo debe enviar la clave el
sistema externo.

### Webhooks

Un webhook hace lo inverso: el sistema de soporte **avisa** a una dirección de otro
sistema cada vez que ocurre algo con un ticket. Se configura en la sección
**Webhooks**:

- **URL de destino**: tiene que empezar con https, apuntar a una dirección pública
  y no llevar usuario ni contraseña.
- Los eventos que se avisan:

  | Evento | Cuándo se avisa |
  |---|---|
  | **Ticket creado** | Al crearse un ticket |
  | **Cambio de estado** | Cuando el ticket pasa a Resuelto, Cerrado o Esperando al cliente |
  | **Ticket asignado** | Al asignarse el ticket, a mano o por la regla del tipo |
  | **Comentario público** | Al agregarse un comentario público. Los internos no se avisan |

- **Activo**: con la casilla desmarcada no se registran avisos nuevos, y los
  pendientes esperan hasta que se vuelva a activar.

Al guardar el webhook por primera vez aparece el **Secreto de firma**. El sistema
externo lo usa para comprobar que cada aviso viene del sistema de soporte. Igual
que una clave, **se muestra una sola vez**. **Regenerar secreto** crea uno nuevo,
previa confirmación: el anterior deja de valer en el acto, así que hay que cargar
el nuevo en el sistema externo.

Como las claves, los webhooks solo avisan sobre tickets de los tipos del módulo
**TICKETS**.

### El registro de entregas

Debajo de la configuración, **Registro de entregas** muestra cada aviso con
**Fecha**, **Evento**, **Ticket**, **Estado**, **Intentos**, **Último código /
error** y **Próximo intento / entrega**. El estado de cada aviso es
**Pendiente**, **Entregada** o **Fallida**.

Si el sistema externo no responde bien, el aviso se reintenta solo, con esperas
cada vez más largas: hasta 10 intentos en unas 24 horas. Si ninguno funciona, la
entrega queda **Fallida** y se lee **Sin más reintentos**.
