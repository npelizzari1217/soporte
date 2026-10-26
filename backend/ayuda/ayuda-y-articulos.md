---
slug: ayuda-y-articulos
titulo: El módulo de Ayuda y quién ve cada artículo
visibleParaSolicitante: true
---

# El módulo de Ayuda y quién ve cada artículo

El módulo de **Ayuda** guarda artículos que explican cómo se usa el sistema. Es el
lugar donde vive esta misma página. El listado tiene un buscador por título, y al
hacer clic en un artículo se abre su contenido completo.

## La Ayuda es una sola para todo el sistema

Los artículos **no son de cada cliente**: son únicos y globales. Todos los
clientes leen exactamente los mismos textos, y una corrección se ve en todos lados
a la vez.

De ahí sale la regla de quién puede escribirla: **crear, editar, eliminar y
publicar artículos es exclusivo del administrador de la plataforma** (ROOT). Un
administrador de cliente, por más permisos que tenga dentro de su cliente, no ve
los botones de gestión: editar la Ayuda cambiaría lo que leen los demás clientes.

## Los permisos que sí gobiernan algo

En la matriz de permisos, la fila **Ayuda** tiene dos casillas con efecto, y las
dos son de lectura:

| Casilla | Qué habilita |
|---|---|
| **LECTURA** | Leer el listado y abrir un artículo |
| **VER_TODOS** | Ver además los artículos internos (sin publicar) |

El ítem **Ayuda** del menú aparece para todos los usuarios, pero sin la casilla
**LECTURA** el listado no se puede cargar: la pantalla avisa que no se pudieron
cargar los artículos.

## Las casillas de escritura no tienen efecto

En la fila **Ayuda** de la matriz aparecen también las casillas **ALTAS**,
**MODIFICACION**, **BORRADO** y **PUBLICAR**. **Marcarlas no tiene ningún
efecto**: la escritura la decide el administrador de la plataforma y nada más.

Conviene tenerlo presente: si alguien pide poder escribir en la Ayuda, marcarle
**ALTAS** no cambia nada. Hay que pedírselo al administrador de la plataforma.

## Publicar cambia la visibilidad

Un artículo tiene dos estados de visibilidad, que se ven como una etiqueta en la
columna **Visibilidad** del listado y en el detalle:

- **Interno**: solo lo ve quien tiene la casilla **VER_TODOS**.
- **Publicado**: lo ve cualquiera que tenga la casilla **LECTURA**.

Un artículo creado con **Nuevo artículo** nace **Interno**. Publicarlo es siempre
un paso aparte y deliberado: el botón **Publicar** (y su contrario,
**Despublicar**) está en el detalle del artículo, pide confirmación y lo tiene
únicamente el administrador de la plataforma.

Publicar es una decisión que **se conserva**. Algunos artículos, como este, se
mantienen junto con el sistema y su texto se actualiza con cada versión; esa
actualización nunca cambia si el artículo está publicado o es interno.

## VER_TODOS no abre una pantalla: amplía los artículos que se ven

Este es el permiso que más se malinterpreta. **VER_TODOS** no habilita ninguna
pantalla ni ningún botón. Lo que hace es **ampliar qué artículos se ven**.

- **Sin VER_TODOS**, el listado y el detalle muestran únicamente los artículos
  **publicados** y **no eliminados**. Un artículo interno, para esa persona,
  simplemente no existe: no aparece en el listado y, si intenta abrirlo con el
  enlace directo, el sistema responde que no lo encuentra.
- **Con VER_TODOS** se ven además los internos.

Como referencia, esto es lo que cada plantilla de rol trae en la fila **Ayuda** y
que realmente tiene efecto:

| Rol | Casillas de Ayuda con efecto |
|---|---|
| Usuario | **LECTURA** |
| Colaborador | **LECTURA**, **VER_TODOS** |
| Técnico | **LECTURA**, **VER_TODOS** |
| Administrador | Plantilla vacía, pero lee todo |

La plantilla de Técnico marca además las cuatro casillas de escritura; como se
explicó arriba, no cambian nada. El funcionamiento de las plantillas está en el
artículo sobre permisos y roles.

## Un detalle sobre los artículos eliminados

**Eliminar** un artículo pide confirmación y no se puede deshacer. Quien tiene la
casilla **VER_TODOS** sigue viendo en el listado los artículos eliminados, pero al
intentar abrirlos el sistema responde que no los encuentra. Es esperable: el
artículo está dado de baja, y el listado lo muestra solo como rastro.
