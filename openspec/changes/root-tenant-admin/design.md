# Design — `root-tenant-admin`

> SDD phase: **DESIGN**. Define el HOW arquitectónico: decisiones numeradas (Dz),
> firmas concretas, archivos afectados, matriz de tests y trazabilidad.
> Fuentes: `proposal.md` (D1-D7, O1-O6, R1-R7) + `spec/root-tenant-admin.spec.md` (R1-R7 Gherkin).
> Proyecto: `soporte` — backend NestJS + Prisma + PostgreSQL (Clean/Screaming, database-per-tenant),
> frontend Next.js App Router. strict_tdd (RED→GREEN).
> Fecha: 2026-07-31.

---

## 0. Principio rector (heredado del proposal §3.1)

Root = **capacidad de plataforma** (eje "identidad de plataforma": columna `is_global_admin`,
`GlobalAdminGuard`, `X-Tenant-Id`). RBAC = **authz dentro del tenant** (eje `roles`/`usuarios_roles`/
`@RequirePermissions`). Los dos ejes NO se cruzan en ninguna capa. "root" es TERMINOLOGÍA de negocio
sobre la columna existente — CERO rename, CERO cambio de contrato JWT (O1/O5 cerradas).

Toda pieza respeta la regla de dependencia (`clean-arch`): dominio/aplicación sin `@nestjs/*` ni
Prisma; errores con `Result<T, DomainError>` (NUNCA `throw` en dominio/aplicación); use cases plain
class instanciados por `useFactory`; tipado estricto sin `any`/`as any`.

---

## 1. Decisiones de diseño (Dz)

### Dz1 — `isRoot()` como alias de dominio, sin campo nuevo (resuelve R1; O1/O5 ya cerradas)

**Decisión.** Agregar el método de dominio `UsuarioEntity.isRoot(): boolean` que retorna
`this.isGlobalAdmin`. Mismo valor, sin nueva prop, sin nueva columna, sin nuevo claim JWT.
`UsuarioProps.isGlobalAdmin` se mantiene; el getter `isGlobalAdmin` se mantiene (retrocompat total
con `toUsuarioResponse`, mappers, guards y JWT). "root" vive como terminología en el método de
dominio y en la UI.

**Por qué.** O1/O5 están cerradas a favor de terminología (blast radius mínimo, cero revocación de
tokens). Un alias de lectura en el agregado `UsuarioEntity` es el punto correcto para anclar el
vocabulario de negocio sin tocar persistencia ni transporte (`clean-arch`: comportamiento sobre la
entidad, no dominio anémico). No se crea un Value Object `Root` porque `isGlobalAdmin` es un boolean
sin invariantes propias más allá del default `false` — un VO sería sobreingeniería (`value-objects`
decision gate: boolean sin invariantes → NO VO).

**Tradeoff.** Persiste la disonancia `is_global_admin` (técnico/DB/JWT) vs `isRoot()` (negocio). Se
mitiga con docblock explícito en el método mapeando ambos nombres y con disciplina de naming en UI.

---

### Dz2 — Endpoint dedicado `POST /usuarios/root` con doble authz (resuelve O3; R2, R7)

**Decisión.** Ruta dedicada `POST /usuarios/root`, SEPARADA del alta normal. Cadena de guards:
`@UseGuards(JwtAuthGuard, TenantGuard)` (a nivel controller, ya vigente) + `@UseGuards(GlobalAdminGuard)`
a nivel de método (reemplaza `@RequirePermissions('usuario:gestionar')` que usa el alta normal).
Defensa en profundidad: `CrearRootUseCase` **revalida `actor.isRoot` en aplicación**, independiente
del guard (R7).

**Por qué NO meter un flag en `POST /usuarios`.** Ese endpoint está gateado por
`usuario:gestionar`, que ADMINISTRADOR posee. Aceptar `isGlobalAdmin=true` ahí haría que la
superficie de MÁXIMO riesgo (crear un superusuario de plataforma, R1 CRÍTICO) comparta guard con el
alta rutinaria — un error de authz escalaría privilegios. Una ruta separada permite un guard
distinto (`GlobalAdminGuard`, evaluación O(1) sobre el JWT) y deja el path existente intacto:
`POST /usuarios` sigue forzando `isGlobalAdmin=false` sin excepción (R2 escenario CRÍTICO 3).

**Por qué `POST /usuarios/root` y no `POST /roots`.** Root NO es un agregado separado — es un
`UsuarioEntity` con una capacidad. No hay `GET /roots` ni colección "roots" en DB. `/usuarios/root`
grita "creá un usuario de tipo root" bajo el recurso `usuarios` (screaming architecture del dominio
`auth`), sin inventar una entidad inexistente (`api-design`: naming RESTful, sin recurso fantasma).

**Contrato (`api-design` + `error-handling`).**
- `201 Created` → `UsuarioResponseDto` (mismo envelope que el alta normal; `isGlobalAdmin=true`).
- `403 Forbidden` → actor no-root (guard **o** revalidación de aplicación → `RootRequeridoError`).
- `409 Conflict` → email ya existe (`UsuarioConflictError`).
- `400 Bad Request` → validación de transporte (class-validator sobre `CreateRootDto`).

**Rol RBAC del nuevo root.** Se crea SIN rol (`roles: []`) — refuerza la ortogonalidad (R1: "ser
root no implica ADMINISTRADOR"). Si luego se le quiere dar un rol, se usa `POST /usuarios/:id/roles`.
`CreateRootDto` NO incluye campo `rol` → superficie mínima, sin tocar ni duplicar `ROLES_VALIDOS`.

---

### Dz3 — Bootstrap por seed TS idempotente desde env (resuelve O2; R3, R7)

**Decisión.** Script de seed `prisma_master/seeds/root-bootstrap.seed.ts`, ejecutado por el script
npm `seed:root` (post-`migrate:master` en el deploy). Lee de `.env`:
`ROOT_ADMIN_EMAIL`, `ROOT_ADMIN_PASSWORD`, `ROOT_ADMIN_NOMBRE`, `ROOT_ADMIN_APELLIDO`,
`ROOT_ADMIN_CLIENTE_ID` (tenant de origen del root — `usuarios.cliente_id` es NOT NULL). Idempotente
vía `upsert` por `email` (UNIQUE): CREA la fila si no existe (password argon2id, `is_global_admin=true`,
`activo=true`, sin roles), o ACTUALIZA solo `is_global_admin=true` si ya existe (no pisa password ni
otras columnas). Si falta cualquier env obligatoria → **falla ruidosamente** (throw con mensaje
claro), NO no-op silencioso.

**Por qué seed TS y no migración SQL.** El bootstrap actual
(`20260630000000_set_global_admin_nestor/migration.sql`) es un `UPDATE` atado al email hardcodeado
`nestor@sesitec.com.ar` que es no-op silencioso si la fila no preexiste — exactamente la fragilidad
que R3 elimina. Una migración SQL NO puede (a) hashear argon2id, (b) leer credenciales de env de
forma limpia, (c) crear la fila desde cero sin hardcodear. El precedente del repo ya usa seeds TS
(`seed:tenant` → `ts-node prisma_tenant/seeds/tenant-seed.ts`) — reutilizamos ese patrón:
`ts-node`, `dotenv/config`, `Argon2HashProvider` real + Prisma master client (`upsert`).

**Por qué no comando Nest CLI.** Requeriría bootstrapear el `AppModule` o sumar `nestjs-command`
(dependencia nueva) para algo que el seed TS resuelve sin acoplarse al ciclo HTTP. Se descarta para
no ampliar el árbol de dependencias (regla de menor superficie).

**Idempotencia + seguridad (R3, CLAUDE.md §9).** `upsert` es la garantía de "sin duplicados"; el
`update` mínimo (`{ isGlobalAdmin: true }`) garantiza "no altera otras columnas". Cero literales de
email/password en el código (R3 escenario "credenciales nunca hardcodeadas"): todo por env,
documentado en `.env.example` + README.

**Migración vieja.** `20260630000000_set_global_admin_nestor` NO se borra (romper el historial de
migraciones es peligroso en todas las tenant/master DBs ya migradas); ya es un `UPDATE` idempotente
no-op. Queda como histórico, superada en intención por el seed. Se documenta el reemplazo.

---

### Dz4 — Fix de aislamiento en `asignar-rol` imitando `baja-usuario` (resuelve R4; D4, D7)

**Decisión.** `AsignarRolDto` (DTO de aplicación) suma `clienteId: string` (resuelto server-side
desde `TenantContext`, NUNCA del body — D7). `AsignarRolUseCase.execute`, tras cargar el usuario,
valida `usuario.clienteId !== dto.clienteId → Result.fail(new UsuarioNoEncontradoError(id))` — MISMA
respuesta que "no existe" para evitar info leakage cross-tenant (patrón idéntico a
`baja-usuario.use-case.ts:69-71`). El controller resuelve `clienteId` de
`this.tenantContext.get()!.clienteId` (como `crearUsuario`/`baja`), no del body.

**Por qué esta forma.** Alinea con el patrón ya probado del proyecto (consistencia > invención). El
constructor del use case NO cambia (mismas deps `usuarioRepo`, `roleRepo`) → wiring `useFactory`
intacto. El caso root cross-tenant funciona automáticamente: cuando un root manda `X-Tenant-Id`,
`TenantGuard.resolveCrossTenant` bindea `clienteId = tenant objetivo`, el usuario objetivo pertenece
a ese tenant → el check pasa (R4 escenario "root asigna cross-tenant").

**Tradeoff.** Devolver 404 (no 403) al asignar sobre otro tenant oculta la existencia del usuario —
elegido deliberadamente (anti-enumeración), consistente con `baja-usuario`. El spec R4 acepta 403 O
404; elegimos 404 por coherencia interna.

---

### Dz5 — `X-Tenant-Id` centralizado en `apiFetch` vía holder module-level sincronizado (resuelve O4; R5, R7)

**Decisión.** Un holder module-level `frontend/src/shared/api/tenant-header.ts` expone
`setTenantHeader(clienteId | null)` / `getTenantHeader()`. `apiFetch` (en `rawFetch`) lee
`getTenantHeader()` y setea `X-Tenant-Id` SOLO si hay valor y la request no trae ya el header
explícito. Un `useEffect` puente DENTRO de `TenantContextProvider` sincroniza el holder:
`setTenantHeader(isGlobalAdmin && clienteId ? clienteId : null)`.

**Por qué holder module-level y no un wrapper/provider por hook.** `apiFetch` es una función de
módulo (no un hook) — no puede leer React context directamente. Un `useApiFetch` que cierre sobre el
context obligaría a tocar CADA call site (tickets, compras, equipos, reparaciones…), es decir
"parche hook por hook", justo lo que D5 prohíbe. El holder es UN punto de inyección en la capa de
transporte; el efecto puente es el ÚNICO lugar que decide el criterio `isGlobalAdmin && clienteId`.
Este patrón replica el singleton module-level `refreshPromise` que `client.ts` YA usa — consistente
con el código existente.

**Garantías de seguridad (R5/R7).**
- **Un no-root NUNCA envía el header**: el puente solo setea `clienteId` cuando `isGlobalAdmin &&
  clienteId`; para un no-root el holder queda SIEMPRE `null`.
- **Precedencia**: `rawFetch` solo inyecta si `!headers.has('x-tenant-id')` → las requests que ya
  mandan header explícito (p.ej. el fetch de ciclos en `tenant-context.tsx:87`) no se pisan.
- **Defensa backend intacta**: `TenantGuard` sigue respondiendo 403 a cualquier no-root que mande el
  header (`tenant.guard.ts:73-77`) — no se relaja (R5 escenario CRÍTICO 4).
- **Limpieza**: el efecto retorna `setTenantHeader(null)` en cleanup/unmount (logout, cambio de
  sesión) para no filtrar el tenant entre sesiones.

**Tradeoff.** Estado mutable module-level es menos "puro" que context, PERO es la única forma de
centralizar sin tocar cada hook, y queda acotado por un único efecto atado al context (fuente de
verdad sigue siendo `TenantContext`). Los headers explícitos hoy presentes en `useCrearUsuario`/
`useUsuariosAdmin` se vuelven redundantes pero se MANTIENEN (no regresión); limpieza opcional diferida.

---

### Dz6 — Dedupe de `ROLES_VALIDOS` DIFERIDO a Fase 2 (resuelve O6)

**Decisión.** NO centralizar `ROLES_VALIDOS` en este change.

**Por qué.** (1) El backend expone `ROLES_VALIDOS` como `const` + `@IsIn` (validación de transporte);
el frontend `ROL_OPTIONS` lleva `{ value, label }` (labels = concern de UI que NO pertenece al
backend). Unificarlos exige un paquete compartido o un espejo de constantes con build config nuevo —
superficie ajena a root. (2) El endpoint root (`CreateRootDto`) NO usa `ROLES_VALIDOS` (root nace sin
rol, Dz2) → este change NO introduce duplicación nueva. Bajo impacto, ortogonal a la figura root →
Fase 2 (proposal §7), reduciendo blast radius.

---

## 2. Firmas TypeScript concretas

### 2.1 Dominio — `usuario.entity.ts` (MODIFY)

```ts
/**
 * isRoot — alias de negocio de isGlobalAdmin (terminología "root", R1/Dz1).
 * Mismo valor que isGlobalAdmin; sin campo nuevo, sin columna nueva, sin claim JWT nuevo.
 * "root" = capacidad de plataforma; NUNCA se deriva del rol RBAC (ortogonalidad, D6).
 */
isRoot(): boolean {
  return this.isGlobalAdmin;
}
```

### 2.2 Dominio — `auth.errors.ts` (MODIFY, add)

```ts
/**
 * RootRequeridoError — el actor no es root e intentó crear un root.
 * → HTTP 403. Autorización de aplicación (defensa en profundidad, R7/Dz2).
 */
export class RootRequeridoError extends DomainError {
  readonly code = 'AUTH_ROOT_REQUERIDO';
  constructor() {
    super('Solo un usuario root puede crear otro usuario root.');
  }
}
```

### 2.3 Aplicación — `crear-root.use-case.ts` (CREATE)

```ts
/** DTO de entrada para CrearRootUseCase. */
export interface CrearRootDto {
  email: string;
  nombre: string;
  apellido: string;
  password: string;
  /** Tenant de origen — resuelto server-side desde TenantContext (D7), NUNCA del body. */
  clienteId: string;
  /** Identidad del actor — authz de aplicación independiente del guard (defensa en profundidad, R7). */
  actor: { id: string; isRoot: boolean };
}

/**
 * CrearRootUseCase — crea un usuario con isGlobalAdmin=true.
 * Único camino de aplicación que eleva el flag (POST /usuarios lo fuerza false).
 * AuthZ en DOS lugares: GlobalAdminGuard (presentación) + actor.isRoot acá (aplicación).
 */
export class CrearRootUseCase {
  constructor(
    private readonly usuarioRepo: IUsuarioRepository,
    private readonly hashProvider: IHashProvider,
  ) {}

  async execute(dto: CrearRootDto): Promise<Result<UsuarioEntity, DomainError>> {
    // 1. AuthZ de aplicación — independiente del guard (R7). Si el guard se removiera, esto rechaza.
    if (!dto.actor.isRoot) {
      return Result.fail(new RootRequeridoError());
    }
    // 2. Unicidad del email
    const existing = await this.usuarioRepo.findByEmail(dto.email);
    if (existing) {
      return Result.fail(new UsuarioConflictError(dto.email));
    }
    // 3. Entidad root: isGlobalAdmin=true, SIN rol RBAC (ortogonalidad, R1)
    const entity = UsuarioEntity.create({
      email: dto.email,
      nombre: dto.nombre,
      apellido: dto.apellido,
      passwordHash: '', // placeholder — sobreescrito por hashPassword()
      clienteId: dto.clienteId,
      activo: true,
      isGlobalAdmin: true,
      roles: [],
    });
    // 4. Hash argon2id
    await entity.hashPassword(dto.password, this.hashProvider);
    // 5. Persistir
    await this.usuarioRepo.create(entity);
    return Result.ok(entity);
  }
}
```

### 2.4 Aplicación — `asignar-rol.use-case.ts` (MODIFY)

```ts
export interface AsignarRolDto {
  usuarioId: string;
  rolCodigo: string;
  /** Resuelto server-side desde TenantContext (D7) — valida tenant del objetivo (R4/Dz4). */
  clienteId: string;
}

// dentro de execute(), inmediatamente después de cargar el usuario (paso 1):
//   const usuario = await this.usuarioRepo.findById(dto.usuarioId);
//   if (!usuario) return Result.fail(new UsuarioNoEncontradoError(dto.usuarioId));
//   // 1.b) Guard cross-tenant — mismo patrón que baja-usuario (info leak → misma resp. que "no existe")
//   if (usuario.clienteId !== dto.clienteId) {
//     return Result.fail(new UsuarioNoEncontradoError(dto.usuarioId));
//   }
```
Constructor y wiring `useFactory` **sin cambios** (mismas deps).

### 2.5 Presentación — `auth.dto.ts` (MODIFY, add)

```ts
/**
 * CreateRootDto — body de POST /usuarios/root. NO incluye `rol`:
 * el root nace sin rol RBAC (ortogonalidad). clienteId NUNCA del body (D7).
 */
export class CreateRootDto {
  @IsEmail() email!: string;
  @IsString() @IsNotEmpty() nombre!: string;
  @IsString() @IsNotEmpty() apellido!: string;
  @IsString() @MinLength(8) password!: string;
}
```

### 2.6 Presentación — `usuarios.controller.ts` (MODIFY, add endpoint + fix asignarRol)

```ts
/**
 * POST /usuarios/root — crea un usuario root. SOLO roots (GlobalAdminGuard).
 * Defensa en profundidad: el use case revalida actor.isRoot (R7).
 */
@Post('root')
@UseGuards(GlobalAdminGuard)
@HttpCode(HttpStatus.CREATED)
async crearRoot(
  @Body() dto: CreateRootDto,
  @CurrentUser() user: JwtPayload,
): Promise<UsuarioResponseDto> {
  const clienteId = this.tenantContext.get()!.clienteId; // server-side, NUNCA del body
  const result = await this.crearRootUseCase.execute({
    email: dto.email,
    nombre: dto.nombre,
    apellido: dto.apellido,
    password: dto.password,
    clienteId,
    actor: { id: user.sub, isRoot: user.is_global_admin === true },
  });
  if (result.isFail()) {
    const error = result.getError();
    if (error instanceof RootRequeridoError) throw new ForbiddenException(error.message);
    if (error instanceof UsuarioConflictError) throw new ConflictException(error.message);
    throw new BadRequestException('No se pudo crear el usuario root');
  }
  return toUsuarioResponse(result.getValue());
}

// asignarRol() — pasar clienteId resuelto server-side (Dz4):
//   const clienteId = this.tenantContext.get()!.clienteId;
//   const result = await this.asignarRolUseCase.execute({ usuarioId: id, rolCodigo: dto.rolCodigo, clienteId });
```
Nuevos imports: `ForbiddenException`, `GlobalAdminGuard`, `CreateRootDto`, `CrearRootUseCase`,
`RootRequeridoError`.

### 2.7 Wiring — `auth.module.ts` (MODIFY, add provider)

```ts
{
  provide: CrearRootUseCase,
  useFactory: (usuarioRepo: IUsuarioRepository, hashProvider: IHashProvider) =>
    new CrearRootUseCase(usuarioRepo, hashProvider),
  inject: [USUARIO_REPOSITORY, HASH_PROVIDER],
},
```
`GlobalAdminGuard` ya está en `providers` — no requiere cambio. `UsuariosController` suma
`crearRootUseCase` al constructor.

### 2.8 Infraestructura — `prisma_master/seeds/root-bootstrap.seed.ts` (CREATE)

```ts
import 'dotenv/config';
import { Argon2HashProvider } from '../../src/auth/infrastructure/argon2-hash.provider';
// Prisma master client (mismo que usa PrismaService.getMasterClient()).

/** Lee env obligatoria o falla ruidosamente (R3: nada hardcodeado, sin no-op silencioso). */
function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v || v.trim() === '') {
    throw new Error(`[root-bootstrap] Falta la variable de entorno obligatoria: ${name}`);
  }
  return v;
}

export async function bootstrapRoot(): Promise<void> {
  const email = requireEnv('ROOT_ADMIN_EMAIL');
  const password = requireEnv('ROOT_ADMIN_PASSWORD');
  const nombre = requireEnv('ROOT_ADMIN_NOMBRE');
  const apellido = requireEnv('ROOT_ADMIN_APELLIDO');
  const clienteId = requireEnv('ROOT_ADMIN_CLIENTE_ID');

  const passwordHash = await new Argon2HashProvider().hash(password);

  // Idempotente: upsert por email (UNIQUE).
  //  - create: fila nueva con is_global_admin=true, activo=true, sin roles.
  //  - update: SOLO is_global_admin=true (no pisa password/nombre/otras columnas).
  await masterClient.usuario.upsert({
    where: { email },
    create: { email, nombre, apellido, passwordHash, clienteId, activo: true, isGlobalAdmin: true },
    update: { isGlobalAdmin: true },
  });
}

// Ejecutable directo (ts-node): if (require.main === module) bootstrapRoot()...
```
`package.json` script: `"seed:root": "ts-node prisma_master/seeds/root-bootstrap.seed.ts"`.

### 2.9 Frontend — `shared/api/tenant-header.ts` (CREATE)

```ts
/**
 * Holder module-level del X-Tenant-Id activo (Dz5/R5). Único punto que apiFetch lee para
 * inyectar el header. Solo un root con cliente seleccionado lo puebla; para un no-root es SIEMPRE null.
 */
let currentTenantId: string | null = null;
export function setTenantHeader(clienteId: string | null): void { currentTenantId = clienteId; }
export function getTenantHeader(): string | null { return currentTenantId; }
```

### 2.10 Frontend — `shared/api/client.ts` (MODIFY, dentro de `rawFetch`)

```ts
// tras construir `headers`, antes del fetch:
const tenantId = getTenantHeader();
if (tenantId && !headers.has('x-tenant-id')) {
  headers.set('x-tenant-id', tenantId); // no pisa header explícito (precedencia, R5)
}
```

### 2.11 Frontend — `shared/providers/tenant-context.tsx` (MODIFY, add bridge effect)

```ts
useEffect(() => {
  // Sincroniza el holder de transporte con el criterio de seguridad (R5): solo root con cliente.
  setTenantHeader(isGlobalAdmin && clienteId ? clienteId : null);
  return () => setTenantHeader(null); // limpieza en logout/unmount — no filtrar tenant entre sesiones
}, [isGlobalAdmin, clienteId]);
```

### 2.12 Frontend — `features/admin/hooks/use-crear-root.ts` (CREATE) + `types.ts` (MODIFY)

```ts
// types.ts
export type NuevoRootInput = { nombre: string; apellido: string; email: string; password: string };

// use-crear-root.ts — X-Tenant-Id lo inyecta el holder centralizado; no se pasa header explícito.
export function useCrearRoot() {
  const qc = useQueryClient();
  return useMutation<Usuario, ApiError, NuevoRootInput>({
    mutationFn: (dto) => apiFetch<Usuario>('usuarios/root', { method: 'POST', json: dto }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'usuarios'] }),
  });
}
```

### 2.13 Frontend — `features/admin/components/UsuariosPage.tsx` (MODIFY, R6/Dz2 UI)

- `const { isGlobalAdmin } = useSession();`
- En el `FormModal`: renderizar un `Switch` "Root (acceso global)" **solo si `isGlobalAdmin`**
  (`ui-patterns`: Switch para boolean; gate por sesión igual que `ClienteSelector` con
  `if (!isGlobalAdmin) return null`). Estado local `esRoot: boolean` (default `false`).
- `handleSubmit`: si `esRoot` → `crearRoot.mutateAsync({ nombre, apellido, email, password })`
  (POST /usuarios/root); si no → `crearUsuario.mutateAsync(form)` (POST /usuarios, root=false).
- Un no-root nunca ve el toggle → ningún camino de UI setea el flag (R6 escenario CRÍTICO).

---

## 3. Flujo de datos e integración

```
ROOT-CREA-ROOT (R2/R7)
UI Switch(root)=ON → useCrearRoot → apiFetch('usuarios/root', POST)
  → BFF proxy (Bearer + x-tenant-id passthrough)
  → [JwtAuthGuard → TenantGuard → GlobalAdminGuard]  (presentación, guard #1)
  → UsuariosController.crearRoot (clienteId de TenantContext, actor de JWT.sub)
  → CrearRootUseCase.execute: actor.isRoot? (aplicación, authz #2) → unicidad → entidad(isGlobalAdmin=true, roles=[])
  → hashProvider.hash → usuarioRepo.create → 201 UsuarioResponseDto

ASIGNAR-ROL AISLADO (R4)
POST /usuarios/:id/roles → controller pasa clienteId=TenantContext
  → AsignarRolUseCase: load usuario → usuario.clienteId !== clienteId ? 404(UsuarioNoEncontrado) : asigna
  (root cross-tenant: TenantGuard bindea clienteId=target → check pasa)

X-TENANT-ID CENTRALIZADO (R5)
TenantContext(clienteId,isGlobalAdmin) --efecto--> setTenantHeader(root&&cliente ? id : null)
  apiFetch(cualquier vista) --lee--> getTenantHeader() --si null NO inyecta--> request sin header (no-root)
  --si id y sin header explícito--> X-Tenant-Id=id (root) → backend resuelveCrossTenant

BOOTSTRAP (R3)
deploy: migrate:master → seed:root (ts-node) → upsert(master.usuarios) por email desde env (idempotente)
```

---

## 4. Nota de migración / DB

- **CERO rename de columna** (`is_global_admin` intacta) y **CERO migración de schema** — O1/O5
  cerradas. La columna `is_global_admin` ya existe (`20260629120000_add_is_global_admin`). El claim
  JWT `is_global_admin` e `ITokenService` NO cambian → cero revocación de tokens.
- **Único toque a DATOS**: el seed `root-bootstrap` (upsert idempotente sobre `master.usuarios`),
  ejecutado explícitamente por `seed:root` post-migrate. Seguro de re-correr en cualquier entorno.
- **Migración vieja** `20260630000000_set_global_admin_nestor`: se mantiene en el historial (no se
  borra — romper el historial es inseguro en DBs ya migradas); ya es un `UPDATE` idempotente no-op,
  superada en intención por el seed.
- **Nuevas envs** (documentar en `.env.example` + README): `ROOT_ADMIN_EMAIL`, `ROOT_ADMIN_PASSWORD`,
  `ROOT_ADMIN_NOMBRE`, `ROOT_ADMIN_APELLIDO`, `ROOT_ADMIN_CLIENTE_ID`.

---

## 5. Matriz de tests (strict TDD, RED→GREEN) — test → escenario del spec

| # | Archivo de test | Escenario del spec (Gherkin) | Tipo |
|---|---|---|---|
| R1-a | `backend/.../domain/entities/usuario.entity.spec.ts` | R1 "isRoot() alias de isGlobalAdmin" (true→true) | unit |
| R1-b | `usuario.entity.spec.ts` | R1 "Rol ADMINISTRADOR no implica root" [CRITICAL] (isGlobalAdmin=false→isRoot=false) | unit |
| R1-c | `backend/.../guards/tenant.guard.spec.ts` | R1 "Ser root no implica ADMINISTRADOR" (flag sin rol → cross-tenant concedido) | unit |
| R2-a | `backend/.../use-cases/crear-root.use-case.spec.ts` | R2 "Root crea exitosamente otro root" (isGlobalAdmin=true, roles=[]) | unit |
| R2-b | `crear-root.use-case.spec.ts` | R2 "ADMINISTRADOR no-root → RootRequeridoError" [CRITICAL] (authz de aplicación) | unit RED→GREEN |
| R2-c | `backend/.../controllers/usuarios.controller.spec.ts` | R2 "ADMINISTRADOR no-root recibe 403" [CRITICAL] (GlobalAdminGuard) | integration |
| R2-d | `backend/.../use-cases/crear-usuario.use-case.spec.ts` | R2 "alta normal siempre root=false" [CRITICAL] (incluso si actor es root) | unit |
| R3-a | `backend/prisma_master/seeds/root-bootstrap.seed.spec.ts` | R3 "crea el primer root si no existe" | integration |
| R3-b | `root-bootstrap.seed.spec.ts` | R3 "idempotente en re-run" [CRITICAL] (sin duplicar, flag sigue true) | integration |
| R3-c | `root-bootstrap.seed.spec.ts` | R3 "actualiza flag si existe sin root" (no altera otras columnas) | integration |
| R3-d | `root-bootstrap.seed.spec.ts` | R3 "credenciales nunca hardcodeadas" (falta env → throw; lee de env) | unit |
| R4-a | `backend/.../use-cases/asignar-rol.use-case.spec.ts` | R4 "fuga cross-tenant existía antes del fix" [CRITICAL][RED] | unit RED |
| R4-b | `asignar-rol.use-case.spec.ts` | R4 "asignar a usuario de otro tenant rechazado (404)" [CRITICAL] | unit |
| R4-c | `asignar-rol.use-case.spec.ts` | R4 "asignar mismo tenant sigue funcionando" (sin regresión) | unit |
| R4-d | `asignar-rol.use-case.spec.ts` | R4 "root asigna cross-tenant vía X-Tenant-Id" (clienteId=target) | unit |
| R5-a | `frontend/.../shared/api/client.spec.ts` | R5 "root con cliente → X-Tenant-Id en tickets" [CRITICAL] (holder inyecta) | unit |
| R5-b | `client.spec.ts` | R5 "aplica a compras/equipos/reparaciones" (path arbitrario hereda header) | unit |
| R5-c | `client.spec.ts` + `tenant-header.spec.ts` | R5 "NO-root nunca envía X-Tenant-Id" [CRITICAL] (holder null) | unit |
| R5-d | `backend/.../guards/tenant.guard.spec.ts` | R5 "backend rechaza cross-tenant de no-root (403)" [CRITICAL] | unit |
| R6-a | `frontend/.../admin/components/UsuariosPage.spec.tsx` | R6 "root ve toggle; ON → POST /usuarios/root con isGlobalAdmin=true" | component |
| R6-b | `UsuariosPage.spec.tsx` | R6 "ADMINISTRADOR no-root NO ve el toggle" [CRITICAL] | component |
| R7-a | `crear-root.use-case.spec.ts` | R7 "doble validación: app rechaza sin depender del guard" [CRITICAL] (= R2-b) | unit |
| R7-b | `tenant.guard.spec.ts` | R7 "auditoría cross-tenant sin regresión" (log actor/tenant/timestamp) | unit |

Notas de test: `precedencia` del header (holder no pisa header explícito) → caso extra en
`client.spec.ts`. `cleanup` del holder en unmount → caso en `tenant-context.spec.tsx`.

---

## 6. Archivos a crear / modificar

**Backend — CREATE**
- `backend/src/auth/application/use-cases/crear-root.use-case.ts`
- `backend/prisma_master/seeds/root-bootstrap.seed.ts`
- Tests: `crear-root.use-case.spec.ts`, `root-bootstrap.seed.spec.ts`

**Backend — MODIFY**
- `backend/src/auth/domain/entities/usuario.entity.ts` (+`isRoot()`)
- `backend/src/auth/domain/errors/auth.errors.ts` (+`RootRequeridoError`)
- `backend/src/auth/application/use-cases/asignar-rol.use-case.ts` (+`clienteId` + tenant check)
- `backend/src/auth/interface/dtos/auth.dto.ts` (+`CreateRootDto`)
- `backend/src/auth/interface/controllers/usuarios.controller.ts` (+`POST /usuarios/root`; fix `asignarRol`)
- `backend/src/auth/auth.module.ts` (+wiring `CrearRootUseCase`; +dep en `UsuariosController`)
- `backend/package.json` (+script `seed:root`)
- `.env.example` + README (nuevas `ROOT_ADMIN_*`)
- Tests existentes a extender: `usuario.entity.spec.ts`, `asignar-rol.use-case.spec.ts`,
  `usuarios.controller.spec.ts`, `tenant.guard.spec.ts`, `crear-usuario.use-case.spec.ts`

**Frontend — CREATE**
- `frontend/src/shared/api/tenant-header.ts`
- `frontend/src/features/admin/hooks/use-crear-root.ts`
- Tests: `tenant-header.spec.ts`, `use-crear-root` cobertura en `UsuariosPage.spec.tsx`

**Frontend — MODIFY**
- `frontend/src/shared/api/client.ts` (inyección desde holder en `rawFetch`)
- `frontend/src/shared/providers/tenant-context.tsx` (efecto puente)
- `frontend/src/features/admin/components/UsuariosPage.tsx` (Switch root gateado + branch submit)
- `frontend/src/features/admin/types.ts` (+`NuevoRootInput`)
- Tests: `client.spec.ts`, `tenant-context.spec.tsx`, `UsuariosPage.spec.tsx`

---

## 7. Forecast de blast radius (para `sdd-tasks`)

- **Archivos de producción**: ~9 backend (2 create + 7 modify) + ~6 frontend (2 create + 4 modify) = **~15**.
- **Archivos de test**: ~7 nuevos/extendidos backend + ~3 frontend = **~10**.
- **Líneas de producción estimadas**: backend ~195 + frontend ~90 = **~285**. Con tests (~400+) el
  total supera holgadamente **400 líneas** → **Chained PRs recomendado: SÍ**.

**Slicing sugerido (PRs encadenados, `work-unit-commits`):**
- **PR-A — Seguridad backend base (independiente)**: Dz1 (`isRoot()`, R1) + Dz4 (fix `asignar-rol`,
  R4) + tests. Alto valor, bajo riesgo, sin dependencias. ~100 líneas prod.
- **PR-B — Creación de root + bootstrap (depende de PR-A por `isRoot`)**: Dz2 (`CrearRootUseCase`,
  endpoint, `RootRequeridoError`, wiring, R2/R7) + Dz3 (seed bootstrap, R3) + tests. ~120 líneas prod.
- **PR-C — Frontend (depende de PR-B por el endpoint)**: Dz5 (X-Tenant-Id centralizado, R5) + Dz2-UI
  (Switch root, R6) + tests. ~90 líneas prod.

Orden de dependencia: A → B → C. Dz6 (dedupe `ROLES_VALIDOS`) NO entra (Fase 2).

---

## 8. Trazabilidad (Dz → Requirement → Riesgo del proposal)

| Decisión | Requirement(s) | Riesgo mitigado |
|---|---|---|
| Dz1 `isRoot()` alias, sin campo/rename | R1 (O1/O5) | R4 (rename evitado), R6 (naming consistente) |
| Dz2 endpoint dedicado + doble authz | R2, R7 | R1 (escalada de privilegios: guard + app + ruta separada) |
| Dz3 seed idempotente desde env | R3, R7 | R3 (bootstrap frágil/no idempotente/secretos hardcodeados) |
| Dz4 fix aislamiento asignar-rol | R4 (D4, D7) | R2a (fuga cross-tenant en asignar-rol) |
| Dz5 X-Tenant-Id centralizado + holder | R5, R7 | R2b (propagación errónea), R7 (regresión vistas operativas) |
| Dz6 dedupe diferido | O6 → Fase 2 | R6 (residual; se acepta, superficie mínima) |

---

## 9. Riesgos residuales / supuestos a validar en apply

- **Actor de aplicación desde JWT**: `CrearRootUseCase` valida `actor.isRoot` derivado de
  `JwtPayload.is_global_admin`. Es defensa en profundidad real (código independiente del guard), pero
  ambos leen el mismo claim → un JWT stale con flag viejo (R5) refleja el estado del token, no de DB.
  Consistente con la semántica "cambios de flag surten efecto tras re-login" del proyecto. Si se
  quisiera bloqueo inmediato, habría que cargar el actor de DB (fuera de scope, Fase 2).
- **`ROOT_ADMIN_CLIENTE_ID`**: el root de bootstrap necesita un tenant de origen (`cliente_id` NOT
  NULL). Se asume que existe un cliente válido para asignarlo; documentar cuál en el runbook de deploy.
- **Holder module-level en SSR**: `apiFetch`/holder son browser-only (`"use client"`). Validar en
  apply que ningún Server Component invoque `apiFetch` esperando el header (no debería — el BFF y las
  vistas operativas son client-side).
- **Precedencia de header**: confirmar en test que un header `X-Tenant-Id` explícito nunca es pisado
  por el holder (evita romper el fetch de ciclos en `tenant-context.tsx:87`).
