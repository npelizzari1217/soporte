---
slug: ayuda-y-articulos
titulo: El módulo de Ayuda y quién ve cada artículo
tipoTicket: null
visibleParaSolicitante: true
---

# El módulo de Ayuda y quién ve cada artículo

El módulo de Ayuda guarda artículos que explican cómo se usa el sistema. Es el
lugar donde vive esta misma página.

## Los permisos del módulo

Los permisos de Ayuda se identifican con el prefijo `KB`. Cinco de ellos son los
esperables y hacen exactamente lo que su nombre indica:

| Permiso | Qué habilita |
|---|---|
| `KB:LECTURA` | Entrar al módulo y abrir un artículo |
| `KB:ALTAS` | Crear un artículo nuevo |
| `KB:MODIFICACION` | Editar el título, el contenido y el tipo de ticket |
| `KB:BORRADO` | Eliminar un artículo |
| `KB:PUBLICAR` | Publicar y despublicar |

Sin `KB:LECTURA` no se entra al módulo, aunque se tengan los demás permisos.

## Publicar cambia la visibilidad

Un artículo tiene dos estados de visibilidad, que se ven como una etiqueta en el
listado y en el detalle:

- **Interno**: solo lo ve el personal.
- **Publicado**: además lo ven los solicitantes.

`KB:PUBLICAR` es el permiso que habilita los botones **Publicar** y
**Despublicar**. Es lo único que ese permiso controla: quien puede editar un
artículo no puede, por eso solo, cambiar quién lo ve.

**Todo artículo nuevo nace Interno.** Publicarlo es siempre un paso aparte y
deliberado.

## `KB:VER_TODOS` no abre una pantalla: filtra filas

Este es el permiso que más se malinterpreta. `KB:VER_TODOS` no habilita ninguna
pantalla ni ningún botón. Lo que hace es **ampliar qué artículos se ven**.

- **Sin `KB:VER_TODOS`**, el listado y el detalle muestran únicamente los
  artículos **publicados** y **no eliminados**. Un artículo interno, para esa
  persona, simplemente no existe: no aparece en el listado y, si intenta abrirlo
  con el enlace directo, el sistema responde que no lo encuentra.
- **Con `KB:VER_TODOS`** se ven además los internos.

## La trampa: `KB:ALTAS` sin `KB:VER_TODOS`

Como todo artículo nuevo nace Interno, dar de alta sin `KB:VER_TODOS` produce una
situación absurda: la persona escribe el artículo, el sistema lo guarda bien, y
acto seguido **no puede verlo**. No aparece en el listado, y al intentar abrirlo
el sistema informa que no se pudo cargar. El artículo está, pero es invisible
para su propio autor.

Si alguien va a escribir en Ayuda, necesita `KB:ALTAS` **y** `KB:VER_TODOS`
juntos. Ninguna de las plantillas de rol produce esa combinación rota por su
cuenta: solo aparece cuando la grilla se ajustó a mano.

Como referencia, esto trae cada plantilla:

| Rol | Permisos de Ayuda en la plantilla |
|---|---|
| Usuario | `LECTURA` |
| Colaborador | `LECTURA`, `VER_TODOS` |
| Técnico | `LECTURA`, `VER_TODOS`, `ALTAS`, `MODIFICACION`, `BORRADO`, `PUBLICAR` |
| Administrador | Plantilla vacía, pero puede todo |

Un Colaborador, entonces, ve todos los artículos pero no puede crear ninguno.

## Un detalle sobre los artículos eliminados

Quien tiene `KB:VER_TODOS` también ve en el listado los artículos ya eliminados.
Al intentar abrirlos, el sistema responde que no los encuentra. Es esperable: el
artículo está dado de baja, y el listado lo muestra solo como rastro.
