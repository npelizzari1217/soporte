# Design: Logo por cliente en el sidebar

> Insumos: [`proposal.md`](./proposal.md) y [`exploration.md`](./exploration.md).
> Este diseño no los repite: decide sobre ellos y corrige lo que verificó FALSO.
> Corre ANTES que `sdd-spec`: la sección **Reglas descubiertas para la spec** es
> la entrada de esa fase.

## Enfoque técnico

Enfoque 1 de la exploración, sin cambios de rumbo: `retrieve()` en el puerto de
storage, tres columnas en `master.Cliente`, autorización de lectura por identidad
inline y propagación por el JWT que `resolverScope` ya arma. Lo que sí cambia son
cuatro piezas de implementación que la lectura del código volvió obligatorias
(sección siguiente).

| Pieza | Capa hexagonal | Por qué ahí |
|---|---|---|
| `IFileStorage.retrieve()` | `shared/domain/ports` | Es un contrato, no una técnica: el dominio declara, disco/S3 implementan |
| `LocalDiskFileStorage.retrieve()` | `shared/infrastructure` | Única implementación; toca `fs` |
| 3 columnas + migración | `infrastructure` (Prisma) | Prisma solo vive en `infrastructure/` |
| `ClienteProps` + `actualizarLogo()`/`quitarLogo()` | `clientes/domain` | El logo es propiedad directa de la entidad, como `csatHabilitado` |
| `ConfigurarLogoCliente` / `QuitarLogoCliente` / `VerLogoCliente` | `clientes/application` | Orquestan entidad + repo + storage; cero framework |
| `validarLogoCliente()` (whitelist + 512 KB) | `clientes/interface/pipes` | Valida el borde HTTP antes del use case, molde de `validar-archivo-adjunto.ts` |
| `ClienteLogoController` | `clientes/interface/controllers` | Traduce HTTP; la autorización vive acá, no en el use case |
| Bloque de logo del sidebar y diálogo | frontend `components/shell` y `features/clientes` | Presentación pura; el dato ya viaja en la sesión |

## Hallazgos que corrigen la propuesta y la exploración

| # | Afirmación previa | Verificado contra el árbol |
|---|---|---|
| H1 | El `GET` del logo vive en `ClientesController` | **FALSO/imposible.** `clientes.controller.ts:158` aplica `@UseGuards(JwtAuthGuard, GlobalAdminGuard)` a nivel de **clase**; en Nest los guards de método son **aditivos**, no reemplazan al de clase, y `GlobalAdminGuard` (`global-admin.guard.ts:23-32`) no tiene bypass por reflector. Un `GET` ahí sería ROOT-only y ningún usuario del inquilino vería su logo |
| H2 | "Cero `@Res()` / cero servir binarios" (exploración §1) | **FALSO.** `equipos.controller.ts:281`, `reparaciones:255`, `compras:743` y `tickets:327` ya usan `@Res({ passthrough: true })` con `res.setHeader(...)`. Hay patrón del repo que seguir |
| H3 | "Ningún hook del frontend maneja `FormData`" | **FALSO.** `use-ticket-mutations.ts:114-128` (`useSubirAdjunto`) ya arma `FormData`; `ApiFetchInit` acepta `body: BodyInit` (`types.ts:110-113`) y el proxy reenvía multipart (`route.ts:67-68`). El diálogo **no estrena** nada |
| H4 | El mapper Prisma espeja 1:1 | **Parcialmente falso.** `cliente.mapper.ts:39-54` devuelve `Omit<PrismaCliente, ...>`: agregar columnas al schema **rompe el typecheck** de `toPersistence` hasta que se las mapee u omita. La decisión no es opcional |
| H5 | Sin logo el sidebar muestra "el `Building2` actual" | **FALSO.** `app-sidebar.tsx` no importa `Building2`: hoy el sidebar **no tiene bloque de marca**. `Building2` vive en `tenant-switcher.tsx:86`. El fallback es un elemento **nuevo** para todos, no el estado de hoy |
| H6 | El binario llega al navegador por el proxy BFF | **Roto hoy.** `app/api/[...path]/route.ts:87` hace `await backendRes.text()` para toda respuesta no-JSON: un PNG decodificado como UTF-8 y re-serializado llega **corrupto**. Sin arreglar esto, el logo no se ve |

## Decisiones

| # | Decisión | Elegido | Alternativas rechazadas | Razón |
|---|---|---|---|---|
| D1 | Dónde vive el `GET` | **`ClienteLogoController` nuevo**, prefijo `clientes`, con sus tres rutas y sus propios guards | (a) Mover `GlobalAdminGuard` de la clase a cada método de `ClientesController` | (a) toca 10 rutas ya autorizadas para habilitar una: un guard omitido por descuido abre un ABM de clientes. El controller nuevo es aditivo y aísla la excepción. Sin colisión de rutas: `:id/logo` no matchea ninguna ruta existente |
| D2 | `VERSION_PAYLOAD_JWT` | **No se bumpea.** Queda en `2` | Bumpear a `3` | El comentario de `i-token.service.ts:1-9` define el bump para cambios **incompatibles** de forma (el ejemplo es el cambio de *significado* de `permisos`). Agregar un campo es aditivo: los consumidores viejos lo ignoran. Bumpear invalidaría **todos** los access tokens vivos: cada uno cae en el 401 del guard y dispara un refresh — recuperable, pero es una tormenta de refresh y un riesgo de deslogueo real para quien tenga el refresh token vencido, a cambio de cero beneficio. El precedente del repo para campos nuevos es normalizar en el decoder, no bumpear (`types.ts:61-66` con `modulos`/`nombre`) |
| D3 | Qué viaja en el JWT | **`cliente_logo_v: number \| null`** — epoch ms de `logoUpdatedAt`, `null` = sin logo | Mandar la URL completa; mandar `logoStorageKey` | La key es detalle de storage y no se expone (skill `file-storage`). Un número es el mínimo que resuelve "¿hay logo?" y "¿cambió?" en el mismo campo |
| D4 | Mapper | **Espejo completo**: las 3 columnas en `toDomain` **y** en `toPersistence` | Omitirlas como `smtp_*` y escribirlas por un repo satélite | El satélite de SMTP se justifica por cifrado e invariante todo-o-nada; el logo no tiene ninguno de los dos. Precio del espejo: si `toDomain` no las hidrata, un `PATCH /clientes/:id` borraría el logo. Por eso el round-trip es test obligatorio, no confianza |
| D5 | Orden de escritura al reemplazar | 1. key nueva (UUID nuevo) → 2. `upload` → 3. persistir fila → 4. `delete` de la key anterior **best-effort** | Borrar primero; reusar la misma key | Un huérfano en disco es más barato que una fila apuntando a la nada. Key nueva por subida: si el borrado falla, el logo nuevo ya es correcto y el viejo no lo pisa |
| D6 | Cómo llega el binario | `<img src="/api/clientes/{id}/logo?v={cliente_logo_v}">` + **arreglo del proxy** (`arrayBuffer()` en vez de `text()`) | `apiFetchBlob` + `URL.createObjectURL` en el sidebar | El proxy ya inyecta el `Bearer` desde la cookie httpOnly, así que un `<img>` queda autenticado sin tocar el token. El blob mete fetching y ciclo de vida de object URLs en un componente de shell. Costo aceptado: un `<img>` no participa del refresh single-flight; un 401 degrada al fallback (regla R7) |
| D7 | Control anti-XSS | Whitelist **exacta** (`Set` de 3 mimes) + `Content-Type` almacenado + `X-Content-Type-Options: nosniff` + `Content-Disposition: inline` | Reusar `validarAdjunto`; sniffing de magic bytes | `validarAdjunto` acepta cualquier `image/*` por prefijo (`validar-archivo-adjunto.ts:36`): **aceptaría `image/svg+xml`**. Por eso es hermano, no reuso. El sniffing de firmas se descarta: `nosniff` + whitelist cerrada + subida exclusiva de ROOT cierran el vector sin un parser parcial que dé falsa confianza |
| D8 | Storage key | `clientes/{clienteId}/{uuid}` — server-side, sin nombre del usuario | Usar el `originalname` del upload | Elimina de raíz el path traversal y la colisión: ningún byte del cliente entra en la ruta |

## Flujo de datos

    ROOT ─POST multipart─→ [proxy BFF] ─→ ClienteLogoController
                                            │ GlobalAdminGuard
                                            │ validarLogoCliente()  ← 422 acá
                                            ↓
                                   ConfigurarLogoCliente
                                    ├→ IFileStorage.upload(key nueva)
                                    ├→ Cliente.actualizarLogo() → repo.save()
                                    └→ IFileStorage.delete(key anterior)  (best-effort)

    login/switch/refresh → resolverScope (findById ya existente)
                             └→ ScopeResuelto.clienteLogoVersion → JwtPayload.cliente_logo_v

    AppSidebar ──<img src=/api/clientes/{id}/logo?v=N>──→ [proxy] ─→ GET (JwtAuthGuard
                                                                     + chequeo inline)
         └── sin v → Building2                                        └→ VerLogoCliente
                                                                          → retrieve()

## Autorización: los dos lugares (regla `rules.design`)

| Ruta | Decoradores del borde | Chequeo inline en el cuerpo |
|---|---|---|
| `POST /clientes/:id/logo` | `@UseGuards(JwtAuthGuard, GlobalAdminGuard)` + `@UseInterceptors(FileInterceptor('logo'))` | Ninguno |
| `DELETE /clientes/:id/logo` | `@UseGuards(JwtAuthGuard, GlobalAdminGuard)` | Ninguno |
| `GET /clientes/:id/logo` | `@UseGuards(JwtAuthGuard)` — **nunca `TenantGuard`** | `if (!user.is_global_admin && user.cliente_id !== id) throw new ForbiddenException(...)` |

El chequeo inline es el control de aislamiento: `TenantGuard` compara contra el
`cliente_id` del token, jamás contra el `:id` de la ruta (`tenant.guard.ts:55-72`).

## Cambios de archivo

| Archivo | Acción | Qué |
|---|---|---|
| `backend/src/shared/domain/ports/i-file-storage.ts` | Modify | `retrieve(key): Promise<Buffer \| null>` |
| `backend/src/shared/infrastructure/storage/local-disk-file-storage.ts` | Modify | `readFile`; `ENOENT` → `null`, nunca excepción |
| `backend/prisma_master/schema.prisma` + migración | Modify | `logo_storage_key`, `logo_mime_type`, `logo_updated_at` (nullable, sin CHECK) |
| `backend/src/clientes/domain/entities/cliente.entity.ts` | Modify | Props, getters, `actualizarLogo()`, `quitarLogo()` |
| `.../infrastructure/persistence/prisma/cliente.mapper.ts` | Modify | Las 3 columnas en `toDomain` y `toPersistence` (D4) |
| `.../application/use-cases/{configurar,quitar,ver}-logo-cliente.use-case.ts` | New | Orquestación + `Result<T, DomainError>` |
| `.../interface/pipes/validar-logo-cliente.ts` | New | Whitelist exacta + 512 KB + tamaño > 0 |
| `.../interface/controllers/cliente-logo.controller.ts` | New | Las 3 rutas, guards de la tabla anterior |
| `backend/src/clientes/clientes.module.ts` | Modify | Wiring (`FILE_STORAGE` ya lo exporta `SharedModule`) |
| `backend/src/auth/application/use-cases/resolver-scope.ts` | Modify | `clienteLogoVersion` en `ScopeResuelto` (cero queries nuevas) |
| `backend/src/auth/domain/ports/i-token.service.ts` | Modify | Campo en `JwtPayload`; `VERSION_PAYLOAD_JWT` **sin tocar** |
| `backend/src/auth/application/use-cases/{login,switch-tenant,refresh-token}.use-case.ts` | Modify | Propagan el campo al firmar |
| `backend/src/auth/test-helpers/payload-de-test.ts` | Modify | Fixture con el campo |
| `frontend/src/app/api/[...path]/route.ts` | Modify | **Passthrough binario** + reenvío de `x-content-type-options` y `cache-control` |
| `frontend/src/shared/api/types.ts` | Modify | Campo + normalización defensiva a `null` |
| `frontend/src/components/shell/app-sidebar.tsx` | Modify | Bloque de logo con fallback |
| `frontend/src/features/clientes/{hooks,components,schemas,limites}` | Modify/New | `useSubirLogoCliente`/`useQuitarLogoCliente` (molde `useSubirAdjunto`), diálogo, espejo Zod |

## Contratos

```ts
// shared/domain/ports/i-file-storage.ts
retrieve(key: string): Promise<Buffer | null>; // ausente → null (simétrico con delete idempotente)

// clientes/domain/entities/cliente.entity.ts — ClienteProps
logoStorageKey?: string | null;
logoMimeType?: string | null;
logoUpdatedAt?: Date | null;

// auth/domain/ports/i-token.service.ts — JwtPayload (VERSION_PAYLOAD_JWT sigue en 2)
cliente_logo_v: number | null; // epoch ms de logoUpdatedAt; null = sin logo
```

```ts
// clientes/interface/pipes/validar-logo-cliente.ts
export const MAX_LOGO_BYTES = 512 * 1024;
export const MIMES_LOGO = new Set(['image/png', 'image/jpeg', 'image/webp']); // cerrada: sin prefijo image/*
```

## Estrategia de test

| Capa | Qué | Cómo |
|---|---|---|
| Unit — dominio | `actualizarLogo()`/`quitarLogo()` setean y limpian las 3 props juntas | `cliente.entity.spec.ts` |
| Unit — pipe | `image/svg+xml` → 422; 512 KB + 1 byte → 422; 0 bytes → 422; los 3 mimes válidos pasan | Test que **debe ponerse en rojo** si se muta la whitelist a prefijo `image/` |
| Unit — controller | Usuario de A pide logo de B → 403; usuario de A pide el suyo → 200; ROOT pide cualquiera → 200; ADMINISTRADOR intenta `POST` → 403 | `cliente-logo.controller.spec.ts`, guards mockeados salvo el chequeo inline |
| Unit — use case | Reemplazo: borra la key anterior; si `delete` falla, la respuesta sigue siendo 200 y la fila apunta a la key nueva | Mocks de `IFileStorage` |
| Integración | Round-trip del mapper: `PATCH /clientes/:id` de datos comerciales **no** borra el logo | Postgres real, `usarLockMasterTest()` si trunca master |
| Frontend | Sidebar con `cliente_logo_v` → `<img>` con `?v=`; sin él → `Building2`; error de carga → `Building2`; diálogo rechaza SVG y >512 KB antes de mandar | Vitest + Testing Library |
| Frontend — proxy | Una respuesta binaria atraviesa el proxy **byte a byte** | Test sobre `app/api/[...path]/route.ts` |

## Threat Matrix

N/A — el cambio no toca routing de comandos, shell, subprocesos, automatización
de VCS/PR, clasificación de archivos ejecutables ni integración de procesos. Los
controles de seguridad de este ciclo (whitelist cerrada, `nosniff`, key
server-side, aislamiento por identidad) están en D1, D7, D8 y en la tabla de
tests, con su caso adversarial cada uno.

## Migración / rollout

Migración aditiva: 3 columnas nullable sin default y sin CHECK. Cero backfill —
un cliente sin logo es el estado válido. Sin feature flag: la funcionalidad es
inerte hasta que ROOT sube el primer archivo. Tokens emitidos antes del rollout
no traen `cliente_logo_v`: el decoder normaliza a `null` y el sidebar muestra el
fallback hasta el próximo login/switch/refresh.

## Corte de entrega

El corte de cuatro unidades de la propuesta se **valida**, con dos correcciones
de contenido. `delivery_strategy: auto-chain`, `chain_strategy: stacked`.

| WU | Contenido | Corrección |
|---|---|---|
| 1 | `retrieve()`, migración, entidad, mapper | **+ test de round-trip del mapper** (D4/H4): sin él, editar un cliente borra su logo |
| 2 | Pipe, `ClienteLogoController` con las 3 rutas y la autorización | **Controller nuevo**, no `ClientesController` (D1/H1) |
| 3 | `resolverScope`, `JwtPayload`, espejo del frontend, sidebar | **+ arreglo binario del proxy BFF** (H6): sin él el logo no se ve y WU3 no se puede verificar de punta a punta |
| 4 | Diálogo de carga en `Admin > Clientes` | Reusa el patrón multipart de `useSubirAdjunto` (H3): es menos trabajo del previsto |

Las cuatro entran holgadas en el presupuesto de 400 líneas. El desglose fino y
el forecast formal son de `sdd-tasks`.

## Reglas descubiertas para la spec

Redactadas por propiedad observable. `sdd-spec` escribe los requisitos desde acá.

1. **Aislamiento de lectura.** Un usuario autenticado del cliente A que pide el
   logo del cliente B recibe **403**, aunque exista. ROOT lo obtiene para
   cualquier cliente. Sin token → 401.
2. **El ROOT lee, el ADMINISTRADOR no escribe.** `POST` y `DELETE` responden 403
   a cualquier usuario sin `is_global_admin`, incluido el ADMINISTRADOR del
   propio inquilino.
3. **Whitelist cerrada.** `image/png`, `image/jpeg` e `image/webp` se aceptan;
   **cualquier otro mime, `image/svg+xml` incluido, se rechaza con 422** aunque
   empiece con `image/`. La respuesta de rechazo llega **sin** que el archivo se
   haya escrito en disco.
4. **Tope y vacío.** Más de 512 KB → 422 antes de escribir. 0 bytes → 422.
5. **Servido seguro.** La respuesta del `GET` trae el `Content-Type` almacenado,
   `X-Content-Type-Options: nosniff` y `Content-Disposition: inline`. Nunca
   expone la storage key ni una ruta del filesystem.
6. **Reemplazo atómico hacia el lector.** Tras un `POST` exitoso, un `GET`
   devuelve **el archivo nuevo** y el binario anterior deja de existir. Si el
   borrado del anterior falla, la operación **igual es exitosa** y el `GET`
   devuelve el nuevo: un huérfano en disco no es un error observable.
7. **Degradación al fallback.** Cuando no hay logo —o cuando su carga falla por
   cualquier motivo, 401 y 404 incluidos— el sidebar muestra el ícono
   `Building2`. Nunca una imagen rota, nunca un hueco en el layout. **El bloque
   de marca es un elemento nuevo del sidebar** (hoy no existe: H5).
8. **Un logo por cliente.** No hay historial, ni galería, ni segunda variante:
   un `GET` devuelve como mucho un archivo.
9. **Token sin el campo.** Una sesión cuyo token fue emitido antes del rollout
   se comporta exactamente como un cliente sin logo, sin error y sin deslogueo.
   Ningún usuario pierde la sesión por este cambio.
10. **Editar un cliente no toca su logo.** Cambiar nombre, razón social, CUIT,
    CSAT o correo deja el logo intacto y visible.
11. **`DELETE` sin logo es idempotente.** Quitar el logo de un cliente que no
    tiene uno responde igual que quitarlo de uno que sí lo tenía (204), sin
    error.
12. **Cliente sin scope.** Un token MASTER (ROOT sin cliente elegido,
    `cliente_id: null`) muestra el fallback: no hay logo que corresponda.
13. **Propagación diferida, declarada.** El logo que ve un usuario es el del
    momento en que se emitió su token: cambia en su próximo login, switch de
    cliente o refresh. Cambiar de cliente en el `TenantSwitcher` lo actualiza
    **sin recargar la página**. Quien acaba de subirlo no lo ve en su propio
    sidebar hasta el siguiente refresh de token — ver Preguntas abiertas.

## Preguntas abiertas

- [ ] **Refresco inmediato para el que sube.** `POST /api/auth/refresh`
      (`route.ts:56`) devuelve `{ ok: true }`, no el payload decodificado, así
      que no hay forma de actualizar `SessionContext` tras la subida sin tocar
      plumbing de sesión. Se deja **fuera de alcance**: el diálogo muestra la
      vista previa del archivo subido, y el sidebar se pone al día en el
      próximo refresh. Si el dueño lo considera inaceptable, es un ciclo aparte.
- [ ] **Alcance del arreglo del proxy.** Cambiar `text()` por `arrayBuffer()`
      mejora también las descargas CSV existentes (mismos bytes, sin recodificar),
      pero puede tocar aserciones de tests del proxy. `sdd-tasks` lo trata como
      trabajo real de WU3, no como un renglón.
