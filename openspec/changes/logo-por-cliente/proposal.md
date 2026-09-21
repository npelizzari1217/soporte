# Proposal: Logo por cliente en el sidebar

> Insumo: [`exploration.md`](./exploration.md) — verificado contra el árbol el 2026-09-21.
> Esta propuesta no repite sus hallazgos: los referencia y decide sobre ellos.

## Intent

El sidebar corona hoy con un ícono genérico: todos los inquilinos ven la misma marca
—ninguna—. En un SaaS multi-inquilino eso cuesta doble: el usuario no tiene señal
visual de en qué cliente está parado, y el producto no se ve como el sistema de su
empresa. El `TenantSwitcher` tampoco lo resuelve: solo existe para quien tiene más de
un cliente.

Este ciclo le da a cada cliente su logo, cargado por ROOT desde `Admin > Clientes` y
mostrado coronando el sidebar de todos los usuarios de ese inquilino.

## Las tres preguntas (regla `rules.proposal`)

| Pregunta | Respuesta |
|---|---|
| ¿Espeja otra capa? | **Sí.** La whitelist de mimes y el tope de 512 KB viven en el pipe de validación del backend y se espejan en el Zod del diálogo. **Fuente única: el backend.** El frontend deriva; nunca al revés |
| ¿Hay alternativas con comportamiento distinto? | **Sí, y ya se eligieron**: ubicación, quién sube, formatos y multiplicidad están cerrados por el dueño (tabla siguiente). Lo técnico está resuelto en la exploración §1-§6 |
| ¿Cambia lo que ve o hace el usuario? | **Sí, en dos pantallas**: el sidebar de todos los usuarios y `Admin > Clientes` para ROOT. Genera **deuda de Ayuda** — ver Riesgos |

## Decisiones cerradas por el dueño

| # | Decisión | Consecuencia para las fases siguientes |
|---|---|---|
| 1 | **Corona el sidebar** (`app-sidebar.tsx`), arriba del bloque de identidad | Bloque nuevo entre el botón de colapsar y el de identidad. Descartados `TenantSwitcher` y "en los dos lugares" |
| 2 | **Solo ROOT sube**, desde `Admin > Clientes` | `GlobalAdminGuard` en el `POST`/`DELETE`. El ADMINISTRADOR del inquilino **no** puede |
| 3 | **PNG, JPEG y WebP. SVG EXCLUIDO** | Decisión de **seguridad** tras el hallazgo de XSS de la exploración. La whitelist es cerrada |
| 4 | **Tope de 512 KB** | Validado antes de escribir, nunca después |
| 5 | **Un archivo por cliente**; subir uno nuevo reemplaza y borra el anterior | Sin historial de versiones ni galería |
| 6 | **Sin logo → fallback al ícono `Building2` actual** | El estado vacío es el comportamiento de hoy, no una pantalla nueva |

## Restricciones NO NEGOCIABLES

Salen de la exploración y están verificadas. No son preferencias:

1. **`TenantGuard` NO autoriza la lectura del logo.** Compara contra el `cliente_id` del
   token, nunca contra el `:id` de la ruta (`tenant.guard.ts:55-72`): bajo `TenantGuard`,
   cualquier usuario autenticado leería el logo de cualquier cliente cambiando la URL. La
   regla es **`JwtAuthGuard` + chequeo inline `user.is_global_admin || user.cliente_id ===
   params.id`**. Esto es aislamiento multi-inquilino, la propiedad crítica del producto.
2. **El rechazo de `image/svg+xml` es un control de seguridad y necesita un test que pueda
   fallar**, no una aserción decorativa. Mutar el pipe debe poner ese test en rojo.
3. **Nunca exponer el path crudo ni servir el binario fuera de un controller** con auth y
   permiso chequeados ANTES de leer (skill `file-storage`).
4. **La metadata va como columnas directas en `Cliente`** (master), paralelo a
   `csatHabilitado` — **no** al agregado satélite de `smtp_*`, que se justifica por cifrado
   e invariantes que el logo no tiene.
5. **La invalidación de caché usa una columna de versión dedicada**, paralelo a
   `smtpConfigUpdatedAt`. **No reusar `updatedAt`**: editar el nombre del cliente
   invalidaría un logo que seguía bien.
6. **Validar tipo y tamaño ANTES de escribir.** Nunca guardar primero y validar después.

## Scope

### In Scope

- `IFileStorage.retrieve(key): Promise<Buffer | null>` y su implementación en
  `LocalDiskFileStorage` (archivo ausente → `null`, no excepción).
- Migración Prisma: 3 columnas nullable en `master.Cliente` (key, mime, versión).
- `ClienteEntity`: props, getters y los comandos de dominio para poner y quitar el logo.
- Pipe de validación propio (whitelist cerrada + 512 KB), **hermano** de
  `validar-archivo-adjunto.ts`, no una reutilización de sus límites.
- `POST`, `GET` y `DELETE` de logo en `ClientesController`, con la autorización de la
  restricción 1 y el reemplazo que borra el archivo anterior.
- Propagación por el `JwtPayload` que `resolverScope` ya arma leyendo la fila `Cliente`
  (cero queries nuevas), y su espejo defensivo en `decodeJwtPayload` del frontend.
- Bloque de logo en `app-sidebar.tsx`, con fallback a `Building2` y mismo tamaño en
  colapsado y expandido.
- Diálogo de carga en `features/clientes/`, con el molde de `configurar-csat-dialog.tsx`.
- Tests en cada unidad: dominio, pipe, autorización del `GET`, sidebar y diálogo.

### Out of Scope

- **SVG**, en cualquier forma: ni sanitizado, ni servido, ni aceptado (decisión 3).
- **Logo en la pantalla de login** (anónima) y en cualquier superficie previa a la sesión.
- **Que el ADMINISTRADOR del inquilino suba su propio logo.**
- **Thumbnails, recorte, redimensionado o variante cuadrada.** Un archivo, servido tal cual.
- **Historial de versiones del logo** y tabla `archivos` del tenant: el logo es propiedad
  directa de `Cliente` y vive en master.
- **Migrar el storage a S3 o CDN**, y cualquier `ServeStaticModule`.
- **Ruta `GET` de adjuntos de tickets**: sigue sin existir. `retrieve()` se agrega al puerto,
  pero este ciclo no le da consumidor a los adjuntos.
- **Artículos de Ayuda**: pausa vigente desde el 2026-09-07. Ver Riesgos.

## Capabilities

### New Capabilities

- `clientes-logo`: quién puede cargar, reemplazar y borrar el logo de un cliente; quién
  puede leerlo y bajo qué aislamiento entre inquilinos; qué formatos y tamaños se aceptan
  y cuáles se rechazan; cómo se propaga al sidebar y qué se muestra cuando no hay logo.

### Modified Capabilities

- Ninguna. `openspec/specs/` hoy contiene `preventivo-*`, `repuestos-autoridad-catalogo`,
  `fechas-sesion-utc`, `modelos-equipo-catalogo` y `usuarios-reset-password`; ninguna
  describe clientes, storage ni el shell del frontend.

## Approach

Enfoque 1 de la exploración: **extender el puerto existente + columnas directas + JWT**.

| Pieza | Enfoque |
|---|---|
| Lectura del binario | Un método más en `IFileStorage`. Una sola implementación y ningún consumidor de escritura que invoque lectura: no rompe a los adjuntos |
| Persistencia | Columnas directas en `Cliente` (master). Sin CHECK todo-o-nada: las tres se escriben siempre juntas desde el mismo caso de uso |
| Autorización de lectura | `JwtAuthGuard` + chequeo inline de identidad. `Cliente` vive en master: el binding de DB tenant ni siquiera hace falta |
| Propagación al frontend | Campo en el `JwtPayload`. `resolverScope` ya lee la fila entera en login/switch/refresh, y el switch de cliente lo refresca solo |
| Invalidación de caché | Parámetro de versión derivado de la columna de versión dedicada. Sin `ETag` ni negociación condicional — infraestructura que este repo no usa en ningún controller |

## Punto abierto — lo cierra `sdd-design`, no esta propuesta

**¿Agregar un campo al `JwtPayload` exige bump de `VERSION_PAYLOAD_JWT`?** Y si se
bumpea, qué pasa con los tokens ya emitidos: `JwtAuthGuard` rechaza con 401 cuando `v`
no coincide, así que un bump desloguea a todo el mundo. La alternativa —no bumpear y
normalizar defensivamente el campo ausente, como ya se hace con `modulos` y `nombre`—
tiene su propio costo. **Esta propuesta lo registra; no lo decide.**

## Affected Areas

| Área | Impacto | Descripción |
|------|---------|-------------|
| `backend/src/shared/domain/ports/i-file-storage.ts` | Modified | `retrieve()` |
| `backend/src/shared/infrastructure/storage/local-disk-file-storage.ts` | Modified | Implementación; ausente → `null` |
| `backend/prisma_master/schema.prisma` | Modified | 3 columnas nullable en `Cliente` + migración |
| `backend/src/clientes/domain/entities/cliente.entity.ts` | Modified | Props, getters, comandos de logo |
| `backend/src/clientes/**/i-cliente.repository.ts` y su mapper Prisma | Modified | Mapeo de las columnas nuevas |
| `backend/src/clientes/interface/controllers/clientes.controller.ts` | Modified | `POST`/`GET`/`DELETE` de logo |
| `backend/src/clientes/interface/pipes/` | New | Pipe de validación propio del logo |
| `backend/src/auth/application/use-cases/resolver-scope.ts` | Modified | Campo en `ScopeResuelto` |
| `backend/src/auth/domain/ports/i-token.service.ts` | Modified | Campo en `JwtPayload`; el bump lo decide `sdd-design` |
| `frontend/src/shared/api/types.ts` | Modified | Espejo del campo + normalización defensiva |
| `frontend/src/components/shell/app-sidebar.tsx` | Modified | Bloque de logo con fallback |
| `frontend/src/features/clientes/**` | Modified | Diálogo de carga + hook multipart |
| `backend/src/tickets/**` | **Sin cambios** | `AdjuntarArchivoUseCase` no toca `retrieve()` |

## Risks

| Riesgo | Prob. | Mitigación |
|---|---|---|
| **Fuga de logo entre inquilinos** si el `GET` se autoriza con `TenantGuard` o sin chequeo de identidad. Es el riesgo central | Alta | Restricción 1, escrita como restricción. `sdd-spec` DEBE producir el escenario "usuario del cliente A pide el logo del cliente B → 403". `sdd-verify` debería dirigir ahí su mutación adversarial |
| **XSS por SVG** | Cerrado | Formato excluido de raíz (decisión 3). El test de rechazo de `image/svg+xml` es obligatorio y debe poder fallar |
| **Primer flujo multipart del frontend.** Ningún hook actual maneja `FormData` | Media | `sdd-design` confirma al leer `use-clientes-mutations.ts`. Si todas asumen JSON, el patrón nuevo se documenta ahí, no se improvisa en `apply` |
| **Bump de `VERSION_PAYLOAD_JWT` desloguea a todos** | Media | Punto abierto arriba. Si se bumpea, auditar la invalidación de tokens viejos |
| **El mapper Prisma de `IClienteRepository` no espeja 1:1**, asunción no verificada de la exploración | Baja | Confirmar en `sdd-design` antes de escribir la migración |
| **Archivo huérfano** si el borrado del anterior falla tras persistir la key nueva | Baja | Definir el orden en `sdd-design`. Un huérfano en disco es más barato que una key apuntando a la nada |
| **Presupuesto de revisión de 400 líneas** | **Alta** | Ver abajo |
| **Deuda de Ayuda** | Media | El cambio altera dos pantallas, así que **genera deuda**: se anota en el mensaje del commit y en el cuerpo del PR. **No se escribe ningún artículo** mientras dure la pausa del 2026-09-07; si alguno queda FALSO, corregirlo |

## Presupuesto de revisión

El cambio **no entra en una unidad**: toca dos capas del backend (storage y clientes),
auth, y dos superficies del frontend, con una migración de por medio. Corte que se
propondría, en este orden de dependencia:

1. **Storage y persistencia**: `retrieve()`, migración, entidad y mapper.
2. **Endpoints**: pipe de validación, `POST`/`GET`/`DELETE` y la autorización inline.
3. **Propagación y sidebar**: `resolverScope`, `JwtPayload`, espejo del frontend y el
   bloque de logo con fallback.
4. **Diálogo de carga** en `Admin > Clientes`.

**El desglose fino es trabajo de `sdd-tasks`**, con su Review Workload Forecast formal y
sus tres líneas guarda. Esta propuesta solo declara que el corte hace falta.

## Rollback Plan

`git revert` de los commits del ciclo, en orden inverso, **más el `migrate` de reversa de
las 3 columnas**. Es el único paso que `git revert` no cubre: las columnas son nullable y
sin default, así que dejarlas puestas tras el revert tampoco rompe nada — el código
revertido simplemente no las lee.

Los binarios ya subidos quedan en disco como huérfanos: no los borra el revert y no los
sirve nadie, porque el endpoint desaparece. Limpiarlos es opcional y manual.

`retrieve()` en `IFileStorage` puede quedarse sin revertir sin consecuencias: agrega un
método al puerto y no cambia el comportamiento de ningún consumidor existente.

## Dependencies

- Ninguna externa ni dependencia nueva de paquete. Se apoya en `IFileStorage`,
  `LocalDiskFileStorage`, `GlobalAdminGuard`, `JwtAuthGuard`, `resolverScope` y
  `FileInterceptor` de NestJS, todos ya en el repo.

## Success Criteria

- [ ] ROOT carga un PNG, JPEG o WebP de hasta 512 KB desde `Admin > Clientes` y el logo
      aparece coronando el sidebar de los usuarios de ese cliente.
- [ ] Un usuario del cliente A que pide el logo del cliente B recibe 403.
- [ ] ROOT puede leer el logo de cualquier cliente.
- [ ] `image/svg+xml` se rechaza, y existe un test que se pone en rojo si el pipe se muta.
- [ ] Un archivo de más de 512 KB se rechaza **antes** de escribirse en disco.
- [ ] Subir un logo nuevo reemplaza al anterior y el archivo viejo deja de existir.
- [ ] Un cliente sin logo muestra el ícono `Building2`, igual que hoy.
- [ ] El logo se ve en el sidebar colapsado y en el expandido, sin romper el layout.
- [ ] Cambiar de cliente en el `TenantSwitcher` actualiza el logo sin recargar la página.
- [ ] Después de reemplazar el logo, el navegador muestra el nuevo y no el cacheado.
- [ ] Un ADMINISTRADOR del inquilino no encuentra forma de subir el logo.
- [ ] `pnpm lint`, `pnpm typecheck` y `pnpm test` en verde en backend; `pnpm lint`,
      `pnpm type-check` y `pnpm test` en verde en frontend.
- [ ] La deuda de Ayuda queda anotada en el commit y en el cuerpo del PR.
