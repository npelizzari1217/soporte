---
slug: usuarios-administracion
titulo: Administración de usuarios del cliente
visibleParaSolicitante: false
---

# Administración de usuarios del cliente

La pantalla de usuarios está en **Admin**, pestaña **Usuarios**, y solo la
pueden usar los administradores del cliente. Desde allí se da de alta a las
personas, se modifican sus datos, su rol y sus permisos, se les quita el acceso
y se define si el cliente exige la verificación en dos pasos.

## El listado

La pantalla **Usuarios y membresías** muestra a las personas que tienen acceso
activo a este cliente, con las columnas **Nombre**, **Email**, **Rol** y
**Acciones**. En **Acciones** está todo lo que se puede hacer con cada persona:

- **Editar**
- el selector de rol con su botón **Guardar**
- **Permisos**
- **Horarios** (solo en las filas de técnicos y colaboradores)
- **Desactivar**

## Crear un usuario

Presione **Nuevo usuario**, complete **Email**, **Nombre**, **Apellido**,
**Contraseña** (al menos 8 caracteres) y **Rol**, y presione **Crear**.

- La persona recibe los permisos de la plantilla de su rol. Lo que eso
  significa, y por qué conviene revisarlos después, está en el artículo "Cómo
  funcionan los permisos y los roles".
- Si el email ya pertenece a una persona registrada en el sistema (por ejemplo,
  alguien que trabaja en otro cliente), esa persona pasa a tener acceso también
  a este cliente. En ese caso se conservan su nombre, su apellido y su
  contraseña actuales: los que usted escribió en el formulario no se usan.
- Si la persona ya tiene acceso activo a este cliente, el alta se rechaza. Para
  cambiarle el rol, use el selector de rol de su fila.

## Editar los datos de una persona

El botón **Editar** abre el cuadro **Editar usuario**:

- El **Email** no se puede modificar.
- **Nombre** y **Apellido** son los datos de la persona en todo el sistema: si
  trabaja en más de un cliente, el cambio se ve en todos.
- **Contraseña nueva** y **Repetir contraseña** sirven para asignarle una
  contraseña nueva, por ejemplo si la olvidó y no recibe el email de
  recuperación. Deje los dos campos vacíos para no cambiarla. La contraseña
  nueva debe tener al menos 8 caracteres.

Presione **Guardar** para aplicar los cambios. Si asignó una contraseña nueva,
se cierran todas las sesiones abiertas de esa persona y, si usa la verificación
en dos pasos, se le volverá a pedir el código en todos sus dispositivos.
Comuníquele la contraseña nueva por un medio seguro.

### Resetear 2FA

En el mismo cuadro, el botón **Resetear 2FA** elimina la verificación en dos
pasos de la persona: su app autenticadora, sus códigos de recuperación y sus
dispositivos de confianza. También cierra sus sesiones abiertas. Úselo cuando
la persona perdió el celular y también sus códigos de recuperación.

Si el cliente exige la verificación en dos pasos, la persona deberá
configurarla de nuevo en su próximo ingreso.

### Resetear vínculo SSO

El botón **Resetear vínculo SSO** desvincula la cuenta de Google o de Microsoft
con la que la persona ingresa. Úselo si la persona cambió de cuenta de Google o
de Microsoft. Se cierran sus sesiones abiertas, y la próxima vez que ingrese con
**Continuar con Google** o **Continuar con Microsoft** su cuenta se vincula de
nuevo. No cambia su contraseña ni su verificación en dos pasos.

### Cuándo no se puede resetear

Los dos reseteos piden confirmación. Un administrador del cliente solo puede
hacerlos sobre personas que tienen acceso **únicamente a este cliente**. Si la
persona tiene o tuvo acceso a otro cliente, el sistema muestra un aviso de que
no se pudo resetear, y el reseteo debe hacerlo el administrador de la
plataforma.

## Cambiar el rol

Elija el rol nuevo en el selector de la fila y presione el **Guardar** que está
a su lado (solo se habilita si eligió un rol distinto del actual).

**Cambiar el rol no cambia los permisos de la persona.** Si quiere que reciba
los permisos del rol nuevo, abra **Permisos** y use **Reaplicar plantilla del
rol**. El artículo "Cómo funcionan los permisos y los roles" explica las
consecuencias, en especial al pasar a alguien a Técnico o a dejar de ser
Administrador.

El cambio de rol puede tardar unos minutos en notarse para la persona, o
hacerse efectivo recién cuando vuelva a iniciar sesión.

## Permisos

El botón **Permisos** abre la configuración de permisos de la persona, con las
pestañas **Módulos** y **Tipos de ticket**. Todo su funcionamiento se explica
en el artículo "Cómo funcionan los permisos y los roles".

## Horarios de técnicos y colaboradores

En las filas de las personas con rol Técnico o Colaborador aparece el botón
**Horarios**. Abre el horario semanal propio de esa persona.

### Para qué sirve

El horario de una persona se usa **solo para medir su tiempo de trabajo en los
tickets contra el SLA**: cuántas horas hábiles de su propio horario dedicó a
cada ticket, sin contar los feriados ni el tiempo en que el ticket estuvo a la
espera de una respuesta del solicitante.

Ese horario **no cambia el vencimiento del SLA de los tickets ni a quién se
asignan**.

### Sin horario propio

Mientras la persona no tenga un horario propio, se mide con el horario laboral
del cliente (el que se ve en el menú **Horario laboral**). El cuadro lo indica
con un aviso y muestra ese horario para que usted lo tome como punto de
partida.

Para darle un horario propio, ajuste los días y las horas y presione **Usar
horario propio**. Desde ese momento, los cambios que se hagan en el horario del
cliente ya no la afectan.

### Con horario propio

El cuadro indica que la persona tiene horario propio. Usted puede:

- modificarlo y presionar **Guardar**;
- presionar **Volver al horario del cliente**, que borra el horario propio
  después de una confirmación. La persona vuelve a medirse con el horario del
  cliente.

### Cómo se completa el horario

Marque cada día en que la persona trabaja y complete **Apertura** y **Cierre**.
En **Cierre**, 00:00 significa medianoche, es decir, el final del día. Debe
quedar al menos un día marcado, y la apertura debe ser anterior al cierre.

Cambiar un horario no recalcula los tiempos ya medidos: cada medición queda
fija con el horario que estaba vigente cuando se cerró.

## Desactivar a una persona

El botón **Desactivar** quita a la persona el acceso a este cliente, después de
una confirmación. No se borra la persona del sistema: si trabaja en otros
clientes, conserva su acceso a ellos. Deja de aparecer en el listado.

## Exigir la verificación en dos pasos

Arriba del listado está el recuadro **Verificación en dos pasos**, que muestra
si el cliente la exige: **exigida a todos** o **no exigida**.

- **Exigir a todos** obliga a todas las personas del cliente a usar la
  verificación en dos pasos. Las sesiones abiertas no se cierran: a quien
  todavía no la tenga configurada se le pedirá que la active en su próximo
  ingreso.
- **Dejar de exigir** quita la obligación. Quienes ya la tienen activa pueden
  conservarla.

Los dos botones piden confirmación. Si una persona trabaja en varios clientes y
alguno de ellos la exige, esa persona está obligada a usarla.

Cómo se activa y se usa la verificación en dos pasos se explica en el artículo
"Cómo ingresar al sistema y proteger su cuenta".
