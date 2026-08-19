---
slug: ayuda-y-articulos
titulo: El módulo de Ayuda y quién ve cada artículo
visibleParaSolicitante: true
---

# El módulo de Ayuda y quién ve cada artículo

El módulo de Ayuda guarda artículos que explican cómo se usa el sistema. Es el
lugar donde vive esta misma página.

## La Ayuda es una sola para todo el sistema

Los artículos **no son de cada cliente**: son únicos y globales. Todos los
clientes leen exactamente los mismos textos, y una corrección se ve en todos
lados a la vez.

De ahí sale la regla de quién puede escribirla: **crear, editar, eliminar y
publicar artículos es exclusivo del administrador global** de la plataforma. Un
administrador de cliente, por más permisos que tenga dentro de su cliente, no ve
los botones de gestión — editar la Ayuda sería cambiar lo que leen los demás
clientes.

Antes cada cliente tenía su propia copia de los artículos y había que publicarlos
uno por uno. Eso se terminó.

## Los permisos que sí gobiernan algo

Quedan dos, y los dos son de LECTURA:

| Permiso | Qué habilita |
|---|---|
| `KB:LECTURA` | Entrar al módulo y abrir un artículo |
| `KB:VER_TODOS` | Ver además los artículos internos (sin publicar) |

Sin `KB:LECTURA` la Ayuda no aparece en el menú y no se entra al módulo.

## Las casillas de escritura ya no hacen nada

En la grilla de permisos siguen apareciendo cuatro casillas en la fila **Ayuda**:
`ALTAS`, `MODIFICACION`, `BORRADO` y `PUBLICAR`. **Marcarlas no tiene ningún
efecto.** Quedaron dibujadas por una cuestión técnica, pero la escritura la
decide el administrador global y nada más.

Es la trampa de este módulo, y conviene tenerla presente: si alguien pide poder
escribir en la Ayuda, marcarle `ALTAS` no va a cambiar nada. Hay que pedírselo al
administrador global.

## Publicar cambia la visibilidad

Un artículo tiene dos estados de visibilidad, que se ven como una etiqueta en el
listado y en el detalle:

- **Interno**: solo lo ve quien tiene `KB:VER_TODOS`.
- **Publicado**: lo ve cualquiera que tenga `KB:LECTURA`.

**Todo artículo nuevo nace Interno.** Publicarlo es siempre un paso aparte y
deliberado, y el botón lo tiene únicamente el administrador global.

Publicar es una decisión que **queda**: los artículos que se mantienen desde el
código actualizan su texto cuando cambia el sistema, pero nunca vuelven a ocultar
lo que alguien decidió publicar.

## `KB:VER_TODOS` no abre una pantalla: filtra filas

Este es el permiso que más se malinterpreta. `KB:VER_TODOS` no habilita ninguna
pantalla ni ningún botón. Lo que hace es **ampliar qué artículos se ven**.

- **Sin `KB:VER_TODOS`**, el listado y el detalle muestran únicamente los
  artículos **publicados** y **no eliminados**. Un artículo interno, para esa
  persona, simplemente no existe: no aparece en el listado y, si intenta abrirlo
  con el enlace directo, el sistema responde que no lo encuentra.
- **Con `KB:VER_TODOS`** se ven además los internos.

Como referencia, esto es lo que cada plantilla de rol trae en la fila Ayuda y que
realmente tiene efecto:

| Rol | Permisos de Ayuda con efecto |
|---|---|
| Usuario | `LECTURA` |
| Colaborador | `LECTURA`, `VER_TODOS` |
| Técnico | `LECTURA`, `VER_TODOS` |
| Administrador | Plantilla vacía, pero lee todo |

La plantilla de Técnico marca además las cuatro casillas de escritura; como se
explicó arriba, no cambian nada.

## Un detalle sobre los artículos eliminados

Quien tiene `KB:VER_TODOS` también ve en el listado los artículos ya eliminados.
Al intentar abrirlos, el sistema responde que no los encuentra. Es esperable: el
artículo está dado de baja, y el listado lo muestra solo como rastro.
