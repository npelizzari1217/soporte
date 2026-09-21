# Exploration: logo por cliente en el sidebar

> Ciclo SDD `logo-por-cliente`. Fecha: 2026-09-21.
>
> **Nota de procedencia.** La fase `sdd-explore` produjo este contenido pero no pudo
> persistirlo: ese agente está definido sin ninguna herramienta de escritura
> (`Read`, `Grep`, `Glob`, `WebFetch`, `WebSearch`, `mem_*`), lo que funciona en modo
> `engram` pero no en modo `openspec`. El orquestador lo escribió. Antes de hacerlo
> verificó contra el árbol las cuatro afirmaciones que sostienen el diseño: el
> comportamiento de `TenantGuard`, la lectura de `Cliente` en `resolverScope`, que
> `IFileStorage` tiene una sola implementación, y el precedente de
> `smtpConfigUpdatedAt`. Las cuatro son exactas.

## Current State

### 1. Camino de lectura del binario — NO EXISTE, confirmado

`IFileStorage` (`backend/src/shared/domain/ports/i-file-storage.ts:15-34`) declara únicamente `upload(key, buffer, mime): Promise<string>` (:25) y `delete(key): Promise<void>` (:33). Cero método de lectura. Su única implementación, `LocalDiskFileStorage` (`backend/src/shared/infrastructure/storage/local-disk-file-storage.ts`), implementa exactamente esas dos operaciones sobre `fs.promises` (:19-43) — nada de `readFile`.

El único consumidor hoy es `AdjuntosController` (`backend/src/tickets/interface/controllers/adjuntos.controller.ts`): dos rutas `POST` (`tickets/:id/adjuntos`, `operaciones/:id/adjuntos`, líneas 63 y 100) con `FileInterceptor('archivo')` en `memoryStorage` (comentario :20-22) y `validarAdjunto` (`backend/src/tickets/interface/pipes/validar-archivo-adjunto.ts`) corriendo ANTES del use case. **No hay ningún `GET` de adjuntos**, ni `ServeStaticModule`, ni `StreamableFile`.

> ⚠️ **CORRECCIÓN (2026-09-21, tras `sdd-design`).** Esta sección afirmaba además "cero `@Res()`". **Es FALSO, y el error fue del orquestador**: la verificación se hizo con la regex `@Res\(\)` —paréntesis vacíos literales—, que no puede matchear `@Res({ passthrough: true })`. Con el patrón correcto aparecen **cuatro** usos: `equipos.controller.ts:281`, `reparaciones.controller.ts:255`, `tickets.controller.ts:327` y `compras.controller.ts:743`, todos `@Res({ passthrough: true })` + `res.setHeader(...)` para exportar CSV.
>
> **Es buena noticia**: existe patrón del repo para devolver un cuerpo no-JSON desde un controller, y el endpoint del logo debe seguirlo en vez de inventar uno. Lo que sigue siendo cierto es lo importante: **`IFileStorage` no tiene lectura**, así que el camino para obtener el binario desde el almacenamiento hay que construirlo igual.

**Opciones para el camino de lectura:**

1. **Extender `IFileStorage` con `retrieve(key): Promise<Buffer | null>`** (recomendada). Es un solo storage backend con un solo consumidor de escritura (`AdjuntarArchivoUseCase`) que nunca invoca lectura — agregar un método al puerto no le rompe nada: hay una sola clase que lo implementa. El nuevo endpoint de logo sería el único llamador de `retrieve()`. Bajo esfuerzo, cero riesgo para adjuntos.
2. **Puerto nuevo (`IFileReader`)** separado. Correcto en teoría (ISP), pero acá no hay una razón real de segregación — es el MISMO storage backend, solo que hoy nadie necesitaba leer. Indirección sin beneficio medible.

El skill `file-storage` es explícito: *"Serve files through a controller, never expose raw storage paths"* (:68), con auth y chequeo de permiso ANTES de `retrieve()` (:101-125). El endpoint debe seguir ese molde — nunca un path crudo ni un signed URL a disco.

### 2. Invalidación de caché

Existe un precedente EXACTO en este repo de "columna de versión separada de `updatedAt` para invalidar un caché derivado": `Cliente.smtpConfigUpdatedAt` (`backend/prisma_master/schema.prisma:91-100`). El comentario del schema explica por qué NO reusa `updatedAt`: *"editar `nombre` invalidaría un transporter que seguía bien"*. El mismo razonamiento aplica al logo.

**Opciones:**

1. **Token de versión en la query string** (`?v={epoch de logoUpdatedAt}`), recomendada. Cero negociación HTTP condicional; una `v` distinta fuerza un fetch nuevo. Mismo criterio arquitectónico que `smtpConfigUpdatedAt`: columna de versión dedicada, no derivada de `updatedAt` genérico.
2. **`ETag` con revalidación condicional.** Correcto, pero es infraestructura HTTP que este repo no usa en ningún controller — más esfuerzo sin beneficio claro para un asset que cambia con frecuencia bajísima.
3. **Key con hash del contenido.** Evita el parámetro de query, pero exige hashear el buffer antes de decidir el nombre y limpiar la key vieja. Estrictamente más trabajo para el mismo resultado.

### 3. Sidebar colapsado (`w-16` = 64px)

Confirmado en `frontend/src/components/shell/app-sidebar.tsx:52`: `collapsed ? "w-16" : "w-56"`. El bloque de identidad del usuario vive inmediatamente debajo del botón de colapsar (:68-90): expandido muestra avatar `h-9 w-9` (:76) más nombre y tipo (:81-88); colapsado muestra SOLO el círculo de iniciales, sin texto. El logo debe coronar el sidebar: un bloque nuevo entre el botón de colapsar (:54-66) y el bloque de identidad.

**Opciones:**

1. **Contenedor cuadrado fijo con `object-contain`, mismo tamaño en ambos estados** (recomendada). Igual que el círculo de iniciales, que ya resuelve colapsado/expandido con el MISMO elemento sin condicional de layout — solo cambia si hay texto al lado. Un logo apaisado queda con espacio a los costados, pero no rompe el layout ni exige una segunda variante.
2. **Ocultar el logo cuando está colapsado.** Contradice la intención de coronar el sidebar: el logo desaparecería justo cuando el usuario tiene menos contexto visual.
3. **Pedir una segunda variante cuadrada al subir.** Mejor visualmente, pero exige dos archivos por cliente. Contradice la convención "un archivo por cliente" ya cerrada.

### 4. Cómo llega el dato al frontend — JWT vs. fetch aparte

**Hallazgo clave:** `resolverScope` (`backend/src/auth/application/use-cases/resolver-scope.ts`) — única fuente de autorización de tenant, reusada por `LoginUseCase`, `SwitchTenantUseCase` y `RefreshTokenUseCase` — YA hace `clienteRepo.findById(clienteId)` (:118) y arma el `ScopeResuelto` que puebla el JWT (:142-148) leyendo la fila `Cliente` completa. `IClienteRepository.findById` devuelve la `ClienteEntity` entera, no una proyección parcial. Si los campos de logo se agregan a `ClienteProps`, `resolverScope` los tiene disponibles SIN ninguna query adicional.

| | JWT embebido | Fetch aparte |
|---|---|---|
| Round-trips extra por login/switch | 0 (ya se lee `Cliente`) | 1 |
| Momento de disponibilidad | Inmediato, mismo render que pinta el sidebar | Parpadeo `Building2` → logo |
| Tamaño del payload | +1 string corto, solo del cliente activo | Sin impacto |
| Impacto en el límite de ~4KB de cookie | Marginal: el token ya carga `permisos[]` completo para ROOT/ADMINISTRADOR | N/A |
| Invalidación al cambiar de cliente | Automática: el switch ya re-emite el token | Invalidación manual por `cliente_id` |

**Recomendación: JWT.** El punto de refresco natural (login y switch) ya reconstruye el scope leyendo la fila `Cliente`. Un fetch aparte solo se justificaría si el logo pudiera cambiar SIN re-emisión de token — no es el caso: solo ROOT lo sube, y el usuario afectado lo vería en su próximo login/switch de todos modos, el mismo lag que cualquier otro campo del JWT.

### 5. Aislamiento multi-inquilino — quién puede leer el logo

**Hallazgo que corrige una asunción implícita:** `TenantGuard` (`backend/src/auth/infrastructure/guards/tenant.guard.ts`) NO sirve para autorizar `GET /clientes/:id/logo`. Valida `user.cliente_id` —el cliente al que YA está scopeado el token (:55)— contra `master.clientes` (:59), y bindea el `TenantContext` a la DB de ESE cliente (:65-72). **Nunca compara contra un `:id` de la ruta.** Si el logo se sirviera bajo `TenantGuard`, cualquier usuario autenticado podría leer el logo de CUALQUIER cliente cambiando el `:id` en la URL. Además `Cliente` vive en master, así que el binding de DB tenant ni siquiera hace falta — el mismo motivo por el que `ClientesController` usa solo `JwtAuthGuard + GlobalAdminGuard` (`clientes.controller.ts:158`).

La regla correcta: **`JwtAuthGuard` más un chequeo inline `user.is_global_admin || user.cliente_id === params.id`**. Es el criterio de "un guard de clase no alcanza, hace falta lógica por método" que el repo ya documentó en `ModelosEquipoController`, aplicado acá a comparación de identidad en vez de rol.

No hay caso de uso para lectura anónima: el logo se pide en el sidebar del dashboard, que solo renderiza post-login. El pedido del dueño no menciona la pantalla de login.

### 6. Dónde vive la metadata — master, no tenant

`Archivo` (`backend/prisma_tenant/schema.prisma:373-391`) vive en el schema TENANT con joins `ArchivoTicket`/`ArchivoOperacion` — ese patrón existe porque un adjunto pertenece a una entidad que vive en el tenant. El logo es propiedad DIRECTA del `Cliente`, que vive exclusivamente en `master.clientes`. Aplicar el patrón `archivos` obligaría a un join cross-DB master → tenant, dirección que no tiene ningún precedente en este repo.

**El precedente correcto es `csatHabilitado`: columnas directas en `Cliente`.** Con una salvedad: `csatHabilitado` SÍ vive en `ClienteProps`/`ClienteEntity` (`cliente.entity.ts:94`, método `configurarCsat()` :214-217), pero las columnas `smtp_*` —en la MISMA tabla— NO están en `ClienteProps`: SMTP se modela en un agregado satélite (`ClienteEmailConfigState`, `i-cliente-email-config.repository`). Esa separación se justifica por la complejidad de SMTP: cifrado, verificación externa, invariante todo-o-nada con CHECK SQL. El logo no tiene nada de eso — es key, mime y timestamp. Por eso el paralelo es `csatHabilitado`, no `smtp_*`.

## Affected Areas

### Backend

- `shared/domain/ports/i-file-storage.ts` — agregar `retrieve(key): Promise<Buffer | null>`.
- `shared/infrastructure/storage/local-disk-file-storage.ts` — implementarlo; archivo ausente devuelve `null`, no excepción.
- `prisma_master/schema.prisma` — 3 columnas nullable en `Cliente`: `logo_storage_key`, `logo_mime_type`, `logo_updated_at`. Sin CHECK todo-o-nada: las tres viajan siempre juntas desde el mismo use case.
- `clientes/domain/entities/cliente.entity.ts` — extender `ClienteProps`, getters, `actualizarLogo()` / `quitarLogo()`.
- `clientes/domain/ports/i-cliente.repository.ts` y su implementación Prisma — mapear las columnas nuevas.
- `clientes/interface/controllers/clientes.controller.ts` — `POST /clientes/:id/logo` (multipart, `GlobalAdminGuard`), `GET /clientes/:id/logo` (`JwtAuthGuard` + chequeo inline), y `DELETE` si se quiere quitar sin reemplazar.
- `auth/application/use-cases/resolver-scope.ts` — agregar el dato al `ScopeResuelto`.
- `auth/domain/ports/i-token.service.ts` — campo nuevo en `JwtPayload`; evaluar bump de `VERSION_PAYLOAD_JWT` (:9).
- Pipe de validación hermano de `validar-archivo-adjunto.ts`, con sus propios límites y whitelist — no reusar los de adjuntos.

### Frontend

- `shared/api/types.ts` — espejar el campo en `JwtPayload` (:31-42) y normalizar defensivamente en `decodeJwtPayload` (:61-66), igual que `modulos`/`nombre` para tokens previos al rollout.
- `components/shell/app-sidebar.tsx` — bloque de logo entre el botón de colapsar (:54-66) y el de identidad (:68-90), con fallback a `Building2`.
- `features/clientes/` — diálogo de logo con molde de `configurar-csat-dialog.tsx`, pero con `<input type="file">` y mutation por `FormData`. Ningún hook actual maneja multipart; confirmar al leer `use-clientes-mutations.ts`.
- Tests: `app-sidebar.test.tsx`, `tenant-switcher.test.tsx` necesitan fixtures con el campo nuevo.

## Approaches

1. **Extender `IFileStorage` + columnas en `Cliente` + JWT embebido** (recomendada)
   - Pros: cero queries nuevas de sesión, reusa la infraestructura de guards y tokens, un método más en un puerto de una sola implementación.
   - Cons: agranda levemente el JWT; acopla el refresco del logo al ciclo de vida del token.
   - Effort: Medium
2. **Puerto de storage nuevo + fetch aparte cacheado por `cliente_id`**
   - Pros: separa identidad de assets binarios; el JWT no crece.
   - Cons: round-trip extra por carga de sidebar, invalidación manual al hacer switch, capa de puerto sin necesidad real.
   - Effort: Medium-High
3. **Servir el logo como estático por Next.js/CDN con URL predecible**
   - Cons: viola la regla "nunca exponer el path crudo" del skill y elimina todo control de autorización por inquilino. El `cliente_id` no es secreto. **Descartada.**

## Recommendation

Approach 1: extender `IFileStorage` con `retrieve()`, modelar el logo como 3 columnas directas en `ClienteEntity` (paralelo a `csatHabilitado`, no a `smtp_*`), servirlo por `GET /clientes/:id/logo` con `JwtAuthGuard` más chequeo inline de identidad (**nunca `TenantGuard`**), invalidar caché con un parámetro de versión derivado de `logoUpdatedAt`, y propagar la URL versionada por el JWT que `resolverScope` ya arma.

## Risks

- ~~**Conflicto entre el skill y la convención fijada: SVG.**~~ **RESUELTO el 2026-09-21 por el dueño: SVG queda EXCLUIDO.** Formatos permitidos: **PNG, JPEG y WebP, nada más.**

  El conflicto era real: el skill `file-storage` dice *"Never serve user-uploaded HTML/SVG (XSS risk)"* (:160) y la convención que el orquestador había fijado permitía SVG — un error del orquestador, que lo incluyó sin evaluarlo. Un SVG servido con `Content-Type: image/svg+xml` ejecuta scripts si se abre por navegación directa; no lo hace cargado como `<img src>`, que es el uso previsto, pero la URL no es secreta dentro de la sesión.

  Se descartaron las dos alternativas: sanitizar al subir agrega una dependencia y una superficie a testear donde un sanitizador incompleto da falsa confianza; aceptar el riesgo residual apoyándose en que subir es exclusivo de ROOT deja el agujero abierto. **Excluir el formato elimina el riesgo de raíz en vez de mitigarlo**, y el costo —exportar un vectorial a PNG antes de subirlo— lo paga una vez quien sube, no el sistema en cada request.

  Consecuencia para `sdd-spec` y `sdd-design`: la whitelist de mimes es `image/png`, `image/jpeg`, `image/webp`. El pipe debe rechazar `image/svg+xml` explícitamente, y **eso merece un test que pueda fallar** — es un control de seguridad, no una preferencia.
- **No se verificó el mapper Prisma real de `IClienteRepository`.** Se asumió que espeja 1:1 las columnas por el patrón de `csatHabilitado`. Confirmar en `sdd-design`.
- **No se leyó `use-clientes-mutations.ts`.** Si todas las mutations asumen JSON, el diálogo de logo necesita un patrón nuevo en el frontend.
- **Bump de `VERSION_PAYLOAD_JWT`.** Agregar un campo puede o no considerarse cambio de forma incompatible. Si se bumpea, auditar la invalidación de tokens viejos: `JwtAuthGuard` rechaza con 401 si `v` no coincide.

## Ready for Proposal

Sí. Las decisiones de producto están cerradas: ubicación (coronando el sidebar), quién sube (solo ROOT), formatos (**PNG, JPEG y WebP — SVG excluido**), tope de 512 KB, un archivo por cliente con reemplazo que borra el anterior, y fallback al ícono `Building2` cuando no hay logo.

> ⚠️ **PRECISIÓN sobre el fallback (2026-09-21, tras `sdd-design`).** El orquestador presentó ese fallback como "se mantiene el ícono actual", dando a entender que el bloque ya existía. **No existe**: `app-sidebar.tsx` no importa `Building2` — ese ícono vive en `tenant-switcher.tsx:86`, en el header, y solo se renderiza para usuarios multi-inquilino. El bloque de marca en el sidebar es un **elemento nuevo para todos los usuarios**, con o sin logo cargado.
>
> No reabre la decisión de producto: el dueño eligió coronar el sidebar y el fallback sigue siendo un ícono genérico. Pero **`sdd-spec` debe declararlo como comportamiento NUEVO, no como statu quo**, o escribirá un requisito que describe mal el antes.

Queda **un** punto técnico para `sdd-design`, que no bloquea `sdd-propose`: si agregar el campo al `JwtPayload` exige bump de `VERSION_PAYLOAD_JWT`, y en ese caso qué pasa con los tokens ya emitidos.
