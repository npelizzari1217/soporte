---
slug: pedido-publico-qr
titulo: Pedir soporte con el link o el QR, sin cuenta
visibleParaSolicitante: true
---

# Pedir soporte con el link o el QR, sin cuenta

Cada cliente puede tener un **formulario público de pedidos**: una página donde
cualquier persona pide soporte sin tener usuario en el sistema. Lo habilita el
administrador global de la plataforma, cliente por cliente.

Se llega al formulario de dos maneras:

- Con el **link de soporte** del cliente, que abre el formulario sin un equipo
  elegido.
- Escaneando el **QR de un equipo**, que abre el formulario con ese equipo ya
  indicado. El QR se genera e imprime desde la ficha del equipo, en **Equipos**.

## Dónde encontrar el link de soporte

Si el formulario del cliente está habilitado, en la barra superior aparece el
botón **Link de soporte** para cualquier usuario del cliente. Abre un diálogo con
el link y el botón **Copiar**. Cualquier persona que tenga el link puede pedir
soporte, y sus pedidos llegan a ese cliente.

Si el botón no aparece, el formulario de su cliente no está habilitado.

## Cómo se hace el pedido

1. Abra el link o escanee el QR. Se abre la página **Pedido de soporte**, con el
   nombre del cliente y, si llegó por un QR, el del equipo.
2. Complete **Tu nombre**, **Tu email**, **Teléfono (opcional)**, **Asunto** y
   **¿Qué pasa?**, y presione **Enviar pedido**.
3. La página le indica que revise su correo. Si el mensaje no llega, busque en
   la carpeta de correo no deseado.
4. Abra el correo y su link de confirmación. **El link vence a las 24 horas** y
   sirve una sola vez.
5. En la página que se abre, presione **Confirmar pedido**. Abrir la página no
   alcanza: el pedido se registra recién al presionar el botón.
6. La página muestra **Pedido registrado** con el número de su pedido, y además
   le llega un correo con ese número.

**Hasta que usted confirme, no se crea nada.** Si recibe un correo de
confirmación por un pedido que no hizo, ignórelo.

## Qué correos recibe después

Usted no tiene usuario en el sistema, así que sigue su pedido por correo, en la
dirección que cargó en el formulario. Recibe un aviso cuando:

- alguien del equipo escribe un comentario público en su pedido;
- el pedido pasa a **Esperando al cliente**, a **Resuelto** o a **Cerrado**.

Estos correos no traen un link al ticket, porque no hay una cuenta con la cual
abrirlo. Si el pedido queda **Esperando al cliente**, el equipo de soporte lo
retoma a mano: usted no puede comentarlo desde el sistema.

## Si algo no funciona

- **"Este formulario no está disponible o el link no es válido."**: el link está
  mal copiado, o el formulario del cliente no está habilitado.
- **Demasiados pedidos seguidos**: con un mismo correo se pueden enviar hasta
  tres pedidos cada 15 minutos. Pasado ese límite, la página pide esperar unos
  minutos.
- **"El link no es válido o venció."**: el link de confirmación ya se usó, pasó
  más de 24 horas, o está incompleto. Haga el pedido de nuevo.
- **El cliente todavía no puede registrar pedidos**: la página lo avisa y su link
  de confirmación sigue siendo válido. Vuelva a abrirlo más tarde, dentro de las
  24 horas.

## Cuando el formulario pide iniciar sesión

Si el cliente todavía no tiene configurado su propio correo de salida, el
formulario no puede enviar el correo de confirmación. En ese caso, al abrir el
link o escanear el QR, el sistema le pide **iniciar sesión** con su usuario.

Después de ingresar, el sistema lo lleva directo a la página del pedido, sin que
tenga que volver a escanear: se abre el diálogo **Nuevo ticket de soporte** con
el equipo del QR ya elegido. Si ya tenía la sesión iniciada, llega directamente.
En esta vía la prioridad la elige usted.

- Si el equipo del QR no se encuentra, puede pedir soporte igual y elegir el
  equipo a mano.
- Si el QR es de otra organización, la página lo avisa: hay que ingresar con un
  usuario de esa organización.
- Si su usuario no tiene permiso para crear tickets de soporte, la página también
  lo avisa.
- Si cierra el diálogo, la página ofrece **Ir al listado de tickets** y
  **Pedir soporte de nuevo**.

## Cómo llega el pedido al equipo de soporte

Para el equipo de soporte, el pedido confirmado es un ticket de soporte técnico,
igual a los que se crean con **Nuevo ticket de soporte** en **Equipos**:

- Su prioridad es siempre **Media**; quien pide no la elige.
- Si se pidió desde el QR de un equipo, queda vinculado a ese equipo, y el
  detalle lo muestra en la tarjeta **Equipo en mantenimiento**.
- Si su tipo tiene una regla de asignación automática, nace **Asignado**, como
  cualquier otro ticket.
- En el detalle, **Solicitante** muestra el nombre que la persona escribió en el
  formulario, y **Teléfono**, el teléfono, si lo dejó.

Como el solicitante no es un usuario del sistema, el ticket lo ven quienes
tienen **Ver todos** sobre su tipo, su responsable y los técnicos de sus tareas.
