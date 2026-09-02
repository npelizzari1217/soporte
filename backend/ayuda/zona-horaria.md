---
slug: zona-horaria
titulo: La zona horaria operativa de cada cliente
visibleParaSolicitante: false
---

# La zona horaria operativa de cada cliente

## Qué es

Cada cliente (cada empresa que usa el sistema) tiene una **zona horaria
operativa**: el huso horario que identifica a ese cliente. Es un dato **del
cliente**, no de cada persona que lo usa — todavía no existe una zona horaria
personal por usuario.

## Dónde se configura y quién puede

La zona horaria se configura desde **Admin > Clientes**, con el botón **Zona
horaria** en la fila del cliente correspondiente. Igual que el resto de la
configuración de esa pantalla, es exclusivo del administrador global de la
plataforma (ROOT): ningún administrador de un cliente puede cambiar la zona
horaria de su propio cliente ni la de otro.

## Es obligatoria al dar de alta un cliente

No hay clientes sin zona horaria: se elige de forma explícita al crear el
cliente, y el alta no se completa sin elegir una. No hay un valor por
defecto que se aplique solo — quien da de alta el cliente tiene que
elegirla a propósito.

## Qué NO hace todavía

Esto es lo más importante de este artículo: **hoy, cambiar la zona horaria
de un cliente no cambia nada más.** Todavía no cambia lo que se ve en
pantalla (en tickets, compras, equipos ni en ningún otro listado), y
tampoco cambia los cálculos de vencimientos. El resto del sistema sigue
funcionando exactamente igual que antes de que este dato existiera.

Esta zona horaria es la base sobre la que se va a construir esa lectura más
adelante. Hasta que esa parte esté lista, configurarla es guardar un dato
sin ningún efecto visible todavía — este artículo se va a actualizar cuando
eso cambie.
