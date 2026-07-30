# Design: Config operativa en runtime — tabla en DB (primer corte SMTP, nivel B)

> Artefacto de `sdd-design`. Store: **openspec** (`openspec/changes/runtime-config-table/`).
> Insumos verificados contra código real: `prisma.service.ts`, `nodemailer-email-sender.adapter.ts`, `i-email-sender.port.ts`, `solicitante-email.resolver.ts`, `notificar-cambio-estado.handler.ts` + `.listener.ts`, `result.ts`, `argon2-hash.provider.ts`, `permiso.entity.ts`, `permissions.guard.ts`, `presupuestos.controller.ts`, `migrate-tenants.runner.ts`, `email-config.ts`, `prisma_master/schema.prisma`, seed RBAC `20260627000000`.
> Esto es el HOW arquitectónico (schema, interfaces, wiring, decisiones). NO tasks, NO implementación completa.
> Insumos de planificación: `proposal.md` (D1-D9) + `spec/runtime-config-table.spec.md` (R1-R9 + §0).

---

## 1. Technical Approach

Un módulo nuevo `configuracion/` (Screaming Architecture) aporta la infraestructura genérica: tabla **`ConfiguracionRuntime`** key-value (Opción A) replicada en `prisma_master` y `prisma_tenant`, cifrado reversible **AES-256-GCM** vía puerto `ISecretCipher`, un **resolver cross-DB** `IConfigResolver` (tenant→global con merge por campo), un **audit log** port-based (`AuditLogPort` + entidad `AuditEntry` inmutable + evento `ConfiguracionCambiada` + listener async reusando `IDomainEventPublisher`), un **CRUD de config** protegido por el permiso nuevo `configuracion:gestionar`, y una **migración fan-out** sobre todas las tenant DBs.

El dominio `tickets/` cambia en un solo punto de contrato: `EmailSenderPort.send()` pasa a recibir la `SmtpConfig` ya resuelta (camino b, D5b), el `NodemailerEmailSender` arma el transporter **por-envío** (muere `fromEnv()`), `email-config.ts`/`SmtpConfigError` se **eliminan**, y `NotificarCambioEstadoHandler` resuelve la config vía `IConfigResolver` ANTES de llamar `send()`. El fail-fast se corre de boot-time a send-time: la app arranca siempre; un envío sin config resoluble devuelve un outcome tipado.

Tres piezas transversales viven en `shared/` por **Scope Rule §2** (consumidas por 2 dominios): el VO `SmtpConfig` (lo produce `configuracion/`, lo consume `tickets/`), el puerto `ISecretCipher` (lo usa el resolver, el write use case y el adapter) y el adapter de cifrado. `IDomainEventPublisher`/`DOMAIN_EVENT_PUBLISHER` YA está en `shared/` (change `notif-email-estado-ticket`) — se reusa tal cual.

Cuatro hallazgos del código que definen el diseño:

1. **`ISecretCipher.decrypt()` no puede validar la clave al boot** (spec R2 + R6 + instrucción de tarea): la clave `CONFIG_ENCRYPTION_KEY` se lee y valida **al usar** (lazy), NO al bootstrap del adapter. Esto CONTRADICE la letra de la decisión D6 del proposal ("validada al bootstrap del adapter de cifrado") — se resuelve a favor del spec (ver §2 Fork F1).
2. **El resolver hace merge por campo, no fallback de bloque** (spec R1 escenario "config incompleta"): `smtp.host` del tenant + `smtp.port`/`smtp.user` de global pueden formar una config completa. La resolución es **campo a campo** (tenant gana, si falta cae a global, si falta en ambos → `CONFIG_INCOMPLETA`).
3. **`AuditEntry` NO extiende `BaseEntity`**: `BaseEntity` inyecta `updatedAt`/`deletedAt` (soft-delete universal). El audit es inmutable por diseño (spec §0, ratificado) — es una entidad plana con solo `id` + `createdAt`.
4. **La unicidad `(categoria, clave)` con soft-delete exige partial unique index** (`WHERE deleted_at IS NULL`), igual que `Cliente.cuit` — Prisma NO lo expresa en `@@unique`, va como raw SQL en la migración.

---

## 2. Architecture Decisions

| # | Decisión | Elegido | Alternativa rechazada | Rationale |
|---|----------|---------|-----------------------|-----------|
| Dz1 | Placement de `SmtpConfig` (VO) | `shared/domain/value-objects/smtp-config.vo.ts` | En `configuracion/domain` (tickets lo importaría) o en `tickets/domain` | Scope Rule §2: producido por `configuracion/`, consumido por `tickets/` en `send()`. 2 dominios ⇒ shared. Evita acoplar `tickets/`→`configuracion/`. |
| Dz2 | Placement de `ISecretCipher` + adapter | Puerto en `shared/domain/ports/i-secret-cipher.ts`; adapter en `shared/infrastructure/crypto/aes-gcm-secret-cipher.adapter.ts` | En `configuracion/` | Usado por resolver, write use case y (potencialmente) otros dominios. Espejo del par `IHashProvider`→`Argon2HashProvider` (que vive en `auth/` porque solo auth lo usa; acá es cross-dominio). |
| Dz3 | Validación de `CONFIG_ENCRYPTION_KEY` | **Lazy, al primer uso** (encrypt/decrypt), NO al boot | Al bootstrap del adapter (D6 literal) | spec R2/R6 exigen que la app arranque SIN clave válida; un secreto mal configurado se traduce a `CONFIG_CIFRADO_INVALIDO` en send-time, no tumba el proceso. **Desviación consciente de D6** (ver Fork F1). |
| Dz4 | Resolución tenant→global | **Merge por campo** (tenant gana campo a campo, cae a global por campo faltante) | Fallback de bloque (todo-tenant o todo-global) | spec R1 "config incompleta": tenant `host` + global `port`/`user` ⇒ completa. El fallback de bloque fallaría ese escenario. |
| Dz5 | `SmtpConfig` como VO self-validating | `SmtpConfig.create(props): Result<SmtpConfig, ConfigIncompletaError>` — valida presencia + cast de tipos | Objeto plano `{host,port,...}` | value-objects skill: centraliza la validación de completitud (R1) y de tipos (`port` numérico). `CONFIG_INCOMPLETA` = fallo de `create()`. |
| Dz6 | Contrato `send(email, config)` | `EmailSenderPort.send(email: EmailMessage, config: SmtpConfig)` — adapter puro | `clienteId` en `EmailMessage` + resolver dentro de `send()` (camino a) | D5b: mantiene el adapter tonto; no acopla infra de email al cross-DB ni al cipher (spec R7). |
| Dz7 | Cifrado del secreto en el evento de audit | El evento `ConfiguracionCambiada` viaja con valores **YA enmascarados** si `esSecreto`; el cleartext NUNCA entra al evento | Enmascarar en el listener/adapter de audit | Seguridad §7: el secreto en claro solo existe en memoria en el write use case; enmascarar en el origen garantiza que ninguna capa posterior (evento, cola, log) lo vea. |
| Dz8 | `AuditEntry` sin `BaseEntity` | Entidad plana inmutable: `id`, `actorId`, `accion`, `categoria`, `clave`, `valorAnterior`, `valorNuevo`, `esSecreto`, `createdAt` | Extender `BaseEntity` | `BaseEntity` fuerza `updatedAt`/`deletedAt`; un audit soft-eliminable/mutable deja de ser evidencia (spec §0, ratificado). |
| Dz9 | Unicidad `(categoria, clave)` | **Partial unique index** raw SQL `WHERE deleted_at IS NULL` | `@@unique([categoria, clave])` de Prisma | Con soft-delete, `@@unique` chocaría con filas borradas. Mismo patrón que `Cliente.cuit` (schema master, línea 41-44). Lookups por `findFirst`, no `findUnique`. |
| Dz10 | Fallo de audit no bloquea | Evento de dominio + listener async; `AuditLogPort.record()` falla ⇒ log ERROR, NO propaga ni revierte | `await` del audit dentro del write use case | spec R5: audit es side-effect. Reusa exactamente el patrón fire-and-forget de `notif-email` (`.emit()`, listener no esperado). |
| Dz11 | `EMAIL_SENDER` wiring | `useClass: NodemailerEmailSender` (adapter sin deps de env) | `useFactory: () => NodemailerEmailSender.fromEnv()` (actual) | El transporter se arma por-envío desde `config`; el adapter ya no lee env ni valida al boot. |
| Dz12 | Módulo `ConfiguracionModule` `@Global`? | **NO global**; exporta `CONFIG_RESOLVER` + `SECRET_CIPHER`; `TicketsModule` lo importa | `@Global()` | Solo `tickets/` (envío) + el propio `configuracion/` (CRUD) consumen el resolver. Import explícito > global implícito (nestjs-modules skill). |

---

## 3. Data Flow

### 3.1 Envío de email (resolución + send, send-time)

```
Ticket transiciona a estado notificable (change notif-email)
  └─► publisher.publish(TicketEstadoCambiado{ ..., tenantId=clienteId })   (post-commit, fire-and-forget)
        └─► [async] NotificarCambioEstadoListener.@OnEvent
              └─► NotificarCambioEstadoHandler.handle(event)          (application, puro, NUNCA throw)
                    a. esEstadoNotificable(codigo)?          ── no ─► outcome: skipped
                    b. configResolver.resolveSmtp(tenantId)  ── fail ─► outcome: no-config (NO_CONFIG|INCOMPLETA|CIFRADO_INVALIDO)
                    c. resolver.resolver(solicitanteId, tenantId) ── fail ─► outcome: no-email
                    d. emailSender.send(EmailMessage, SmtpConfig)  ── fail ─► outcome: send-failed
                    e. ok ─► outcome: sent
              └─► listener loguea el outcome (WARN/ERROR, secreto NUNCA en el log)

  IConfigResolver.resolveSmtp(clienteId):
    1. master.clientes.findFirst({ id: clienteId, activo, deletedAt: null }) → dbName
    2. tenantRows = getTenantClient(dbName).configuracionRuntime.findMany({ categoria:'smtp', deletedAt:null })
    3. globalRows = getMasterClient().configuracionRuntime.findMany({ categoria:'smtp', deletedAt:null })
    4. por cada campo requerido: valor = tenant[campo] ?? global[campo]   (merge por campo, Dz4)
    5. campo esSecreto (pass) → ISecretCipher.decrypt({valor,iv,authTag}) ── fail ─► Result.fail(CONFIG_CIFRADO_INVALIDO)
    6. SmtpConfig.create({...}) ── incompleta ─► Result.fail(CONFIG_INCOMPLETA); vacío total ─► Result.fail(NO_CONFIG)
    7. Result.ok(SmtpConfig)   (pass en claro SOLO acá, en memoria, hasta el transporter)
```

### 3.2 Escritura de config (CRUD, con audit)

```
PUT /configuracion  (@RequirePermissions('configuracion:gestionar'), @CurrentUser)
  └─► ActualizarConfigUseCase.execute({ scope, clienteId, categoria, clave, valor, esSecreto, tipo, actorId })
        1. leer fila actual (valorAnterior) — si esSecreto, NO se descifra: se usa placeholder enmascarado
        2. si esSecreto → ISecretCipher.encrypt(valor) → { valor:ciphertext, iv, authTag }
        3. repo.upsert(ConfiguracionRuntime en la DB del scope: tenant→getTenantClient(dbName), global→getMasterClient())
        4. publisher.publish(new ConfiguracionCambiada{ scope, dbName, categoria, clave,
                 valorAnterior(enmascarado si esSecreto), valorNuevo(enmascarado si esSecreto), esSecreto, actorId })
        5. return Result.ok()
              └─► [async] AuditConfiguracionListener.@OnEvent
                    └─► AuditConfiguracionHandler.handle(event)  → AuditLogPort.record(AuditEntry)
                          (falla ─► log ERROR, NO revierte el cambio ya comiteado — Dz10)
```

### 3.3 Lectura de config (enmascarado)

```
GET /configuracion?scope=tenant  (@RequirePermissions('configuracion:gestionar'))
  └─► LeerConfigUseCase.execute({ scope, clienteId })
        rows = repo.findAll(categoria opcional)
        map: esSecreto ? '********' : valor    (NUNCA descifra para leer — spec R3)
```

---

## 4. Data Model (Prisma)

### 4.1 `ConfiguracionRuntime` — idéntico en `prisma_master` y `prisma_tenant`

```prisma
/// Config operativa key-value (Opción A). `valor` va cifrado si esSecreto (valor+iv+authTag).
/// Unicidad (categoria, clave) enforced via PARTIAL UNIQUE INDEX (WHERE deleted_at IS NULL) en la
/// migración raw SQL — Prisma no expresa partial unique. Lookups por findFirst, NUNCA findUnique.
model ConfiguracionRuntime {
  id             String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  categoria      String    @db.VarChar(50)                 // ej. "smtp"
  clave          String    @db.VarChar(100)                // ej. "host","port","user","pass","from","secure"
  valor          String    @db.Text                        // cleartext si !esSecreto; ciphertext (base64) si esSecreto
  tipo           String    @db.VarChar(20)                 // "string"|"number"|"boolean"|"json" — cast del accesor
  esSecreto      Boolean   @default(false) @map("es_secreto")
  iv             String?   @db.VarChar(64)                 // base64, solo si esSecreto (GCM nonce, 12 bytes)
  authTag        String?   @map("auth_tag") @db.VarChar(64) // base64, solo si esSecreto (GCM tag, 16 bytes)
  actualizadoPor String?   @map("actualizado_por") @db.Uuid // soft-ref a master.usuarios.id (sin FK cross-DB)
  createdAt      DateTime  @default(now()) @map("created_at") @db.Timestamptz
  updatedAt      DateTime  @updatedAt @map("updated_at") @db.Timestamptz
  deletedAt      DateTime? @map("deleted_at") @db.Timestamptz

  @@index([categoria])
  @@map("configuracion_runtime")
}
```

Raw SQL en la migración (idempotente):
```sql
CREATE UNIQUE INDEX IF NOT EXISTS "configuracion_runtime_categoria_clave_key"
  ON "configuracion_runtime" ("categoria", "clave") WHERE "deleted_at" IS NULL;
```

### 4.2 `AuditEntry` — idéntico en ambos schemas (inmutable, sin `updatedAt`/`deletedAt`)

```prisma
/// Log de auditoría inmutable de cambios de config. NO extiende el patrón soft-delete del proyecto
/// (spec §0, desviación deliberada): un audit borrable/mutable deja de ser evidencia. Solo id + createdAt.
/// valorAnterior/valorNuevo van ENMASCARADOS si esSecreto — el cleartext NUNCA se persiste acá.
model AuditEntry {
  id             String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  actorId        String   @map("actor_id") @db.Uuid          // NOT NULL — siempre hay actor
  accion         String   @db.VarChar(50)                     // ej. "config.actualizada"
  categoria      String   @db.VarChar(50)
  clave          String   @db.VarChar(100)
  valorAnterior  String?  @map("valor_anterior") @db.Text     // enmascarado si esSecreto; null si no había fila previa
  valorNuevo     String?  @map("valor_nuevo") @db.Text        // enmascarado si esSecreto
  esSecreto      Boolean  @default(false) @map("es_secreto")
  createdAt      DateTime @default(now()) @map("created_at") @db.Timestamptz

  @@index([categoria, clave])
  @@index([createdAt])
  @@map("audit_entries")
}
```

> **Ratifico las columnas del spec §0** con estos ajustes de infra: `iv`/`authTag` como `VarChar(64)` (base64 de 12/16 bytes cabe holgado), `valor` como `Text` (ciphertext base64 puede exceder 255), `actualizadoPor` renombrado consistente pero es el `actualizadoPor` del §0. `AuditEntry.valorAnterior` es nullable (primer set de una clave no tiene valor previo — el spec no lo contempla explícitamente; se documenta acá).

---

## 5. Interfaces / Contracts (firmas reales)

```typescript
// shared/domain/value-objects/smtp-config.vo.ts   (Dz1)
export interface SmtpConfigProps {
  host: string; port: number; secure: boolean; user: string; pass: string; from: string;
}
export class SmtpConfig {
  private constructor(private readonly props: SmtpConfigProps) {}
  /** Valida completitud + tipos. Falta de campo requerido / port no numérico ⇒ CONFIG_INCOMPLETA. */
  static create(raw: Partial<Record<keyof SmtpConfigProps, unknown>>): Result<SmtpConfig, ConfigIncompletaError>;
  get host(): string; get port(): number; get secure(): boolean;
  get user(): string; get pass(): string; get from(): string;   // pass: cleartext SOLO en memoria
  /** Serialización segura: `pass` SIEMPRE enmascarada — evita fuga por log accidental (JSON.stringify). */
  toSafeLog(): Record<string, unknown>;   // { host, port, secure, user, pass:'********', from }
}

// shared/domain/ports/i-secret-cipher.ts   (Dz2)
export const SECRET_CIPHER = Symbol('SECRET_CIPHER');
export interface CipherPayload { valor: string; iv: string; authTag: string; } // los 3 base64
export interface ISecretCipher {
  /** Cifra AES-256-GCM. Clave inválida/ausente ⇒ Result.fail (se surface como error de infra en el write). */
  encrypt(plaintext: string): Result<CipherPayload, CifradoError>;
  /** Descifra + verifica authTag. NUNCA lanza: clave mala / tampering ⇒ Result.fail(CONFIG_CIFRADO_INVALIDO). */
  decrypt(payload: CipherPayload): Result<string, CifradoError>;
}

// shared/domain/errors/cifrado.errors.ts   (o configuracion/domain/errors)
export class CifradoError extends DomainError {
  readonly code = 'CONFIG_CIFRADO_INVALIDO' as const;
  constructor(message: string) { super(message); }   // message NUNCA interpola el plaintext ni la clave
}

// configuracion/domain/errors/config.errors.ts
export class ConfigIncompletaError extends DomainError { readonly code = 'CONFIG_INCOMPLETA' as const; }
export class NoConfigError extends DomainError { readonly code = 'NO_CONFIG' as const; }
export type ResolveConfigError = ConfigIncompletaError | NoConfigError | CifradoError;

// configuracion/domain/ports/i-config-resolver.ts   (LA pieza central)
export const CONFIG_RESOLVER = Symbol('CONFIG_RESOLVER');
export interface IConfigResolver {
  /** tenant→global (merge por campo), descifra secretos, arma SmtpConfig. NUNCA lanza; nunca filtra el secreto. */
  resolveSmtp(clienteId: string): Promise<Result<SmtpConfig, ResolveConfigError>>;
}

// tickets/domain/ports/i-email-sender.port.ts   (EDITAR — nuevo contrato, Dz6)
export interface EmailSenderPort {
  send(email: EmailMessage, config: SmtpConfig): Promise<Result<void, EmailError>>;
}

// configuracion/domain/entities/audit-entry.entity.ts   (Dz8 — NO extiende BaseEntity)
export interface AuditEntryProps {
  actorId: string; accion: string; categoria: string; clave: string;
  valorAnterior: string | null; valorNuevo: string | null; esSecreto: boolean;
}
export class AuditEntry {
  private constructor(readonly id: string, readonly props: AuditEntryProps, readonly createdAt: Date) {}
  static create(props: AuditEntryProps, id?: string): AuditEntry; // inmutable, createdAt = now()
}

// configuracion/domain/ports/i-audit-log.port.ts
export const AUDIT_LOG = Symbol('AUDIT_LOG');
export class AuditError extends DomainError { readonly code = 'AUDIT_WRITE_FAILED' as const; }
export interface AuditLogPort {
  /** Persiste en la DB del scope. Falla ⇒ Result.fail(AuditError) — el listener loguea, NO propaga (Dz10). */
  record(entry: AuditEntry, scope: ConfigScope): Promise<Result<void, AuditError>>;
}

// configuracion/domain/events/configuracion-cambiada.event.ts
export const CONFIGURACION_CAMBIADA = 'configuracion.cambiada';
export type ConfigScope = { kind: 'tenant'; dbName: string } | { kind: 'global' };
export class ConfiguracionCambiada implements DomainEvent {
  readonly eventName = CONFIGURACION_CAMBIADA;
  constructor(
    readonly scope: ConfigScope,
    readonly actorId: string,
    readonly categoria: string,
    readonly clave: string,
    readonly valorAnterior: string | null,   // YA enmascarado si esSecreto (Dz7)
    readonly valorNuevo: string | null,       // YA enmascarado si esSecreto (Dz7)
    readonly esSecreto: boolean,
    readonly occurredAt: Date,
  ) {}
}
```

### 5.1 Masking (única fuente de verdad)

```typescript
// configuracion/domain/mask-secret.ts
export const SECRET_MASK = '********';
export const maskIfSecret = (valor: string | null, esSecreto: boolean): string | null =>
  esSecreto ? (valor === null ? null : SECRET_MASK) : valor;
```
Usado en 3 puntos: (1) `ActualizarConfigUseCase` al construir el evento (Dz7), (2) `LeerConfigUseCase` en la respuesta de API (R3), (3) implícito en `SmtpConfig.toSafeLog()`. El adapter nodemailer extiende su `sanitizeCausa()` para redactar cualquier ocurrencia literal de `config.pass` en la `causa` del `EmailError` (defensa extra: un rechazo SMTP raramente incluye el password, pero no se confía).

---

## 6. Cifrado — `AesGcmSecretCipher` (infra)

```typescript
// shared/infrastructure/crypto/aes-gcm-secret-cipher.adapter.ts
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGO = 'aes-256-gcm';
const IV_BYTES = 12;   // 96-bit nonce recomendado para GCM
const KEY_BYTES = 32;  // AES-256

@Injectable()
export class AesGcmSecretCipher implements ISecretCipher {
  constructor(private readonly env: NodeJS.ProcessEnv = process.env) {}

  // Clave leída y validada LAZY (Dz3): NO en el constructor → la app arranca sin CONFIG_ENCRYPTION_KEY.
  private loadKey(): Result<Buffer, CifradoError> {
    const raw = this.env.CONFIG_ENCRYPTION_KEY;
    if (!raw) return Result.fail(new CifradoError('CONFIG_ENCRYPTION_KEY ausente'));
    const key = Buffer.from(raw, 'base64');          // formato: base64 de 32 bytes
    if (key.length !== KEY_BYTES) return Result.fail(new CifradoError('CONFIG_ENCRYPTION_KEY longitud inválida'));
    return Result.ok(key);
  }

  encrypt(plaintext: string): Result<CipherPayload, CifradoError> {
    const k = this.loadKey(); if (k.isFail()) return Result.fail(k.getError());
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(ALGO, k.getValue(), iv);
    const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    return Result.ok({ valor: ct.toString('base64'), iv: iv.toString('base64'), authTag: cipher.getAuthTag().toString('base64') });
  }

  decrypt(payload: CipherPayload): Result<string, CifradoError> {
    const k = this.loadKey(); if (k.isFail()) return Result.fail(k.getError());
    try {
      const decipher = createDecipheriv(ALGO, k.getValue(), Buffer.from(payload.iv, 'base64'));
      decipher.setAuthTag(Buffer.from(payload.authTag, 'base64'));
      const pt = Buffer.concat([decipher.update(Buffer.from(payload.valor, 'base64')), decipher.final()]);
      return Result.ok(pt.toString('utf8'));   // 'final()' lanza si el authTag no valida → capturado
    } catch {
      // Clave equivocada, authTag alterado (tampering), payload corrupto → error tipado, sin filtrar detalle crudo.
      return Result.fail(new CifradoError('No se pudo descifrar el secreto (clave inválida o dato alterado)'));
    }
  }
}
```

- **Formato de la clave**: `CONFIG_ENCRYPTION_KEY` = base64 de 32 bytes (`openssl rand -base64 32`). Tier bootstrap-secret (env, como `JWT_SECRET`), NO en DB (§7 CLAUDE.md).
- **Almacenamiento**: `valor` = ciphertext base64, `iv` = base64 (12 bytes), `authTag` = base64 (16 bytes). Los 3 juntos: GCM los necesita para descifrar + detectar tampering.
- **Mapeo de error**: cualquier fallo de `decrypt` (clave ausente/corta, authTag inválido, `final()` throw) → `Result.fail(CifradoError code='CONFIG_CIFRADO_INVALIDO')`. Fluye por el resolver hasta el handler (spec R2 escenario "authTag inválido" y "clave ausente").

---

## 7. Swap de email (refactor `tickets/`)

### 7.1 `NodemailerEmailSender` — transporter por-envío

```typescript
export class NodemailerEmailSender implements EmailSenderPort {
  // SIN constructor(transporter, from). SIN fromEnv(). SIN import de email-config.
  constructor(private readonly transportFactory = nodemailer.createTransport) {} // inyectable para tests

  async send(email: EmailMessage, config: SmtpConfig): Promise<Result<void, EmailError>> {
    try {
      const transporter = this.transportFactory({
        host: config.host, port: config.port, secure: config.secure,
        auth: { user: config.user, pass: config.pass },
      });
      const { subject, text, html } = this.resolveContent(email);
      await transporter.sendMail({ from: config.from, to: email.to.value(), subject, text, html });
      return Result.ok(undefined);
    } catch (err) {
      const rawCausa = err instanceof Error ? err.message : 'Error desconocido al enviar el email';
      // sanitizeCausa: enmascara emails (existente) + REDACTA config.pass si apareciera (nuevo).
      return Result.fail(new EmailError(email.to.mask(), sanitizeCausa(rawCausa, config.pass), 'EMAIL_SEND_FAILED'));
    }
  }
}
```

- `resolveContent()` / `interpolate` / `stripCrlf` / templates: **sin cambios**. `TEMPLATES_ROOT` intacto.
- `sanitizeCausa(causa, pass)`: extiende la firma actual (`sanitizeCausa(causa)`) para redactar cualquier substring `=== pass` con `********` además del masking de emails ya existente (spec R2 "el secreto nunca aparece fuera de memoria"). El adapter NO importa `ISecretCipher` ni `PrismaService` (spec R7 escenario 2 — verificable por auditoría de imports).

### 7.2 `NotificarCambioEstadoHandler` — resuelve config antes de `send()`

Se agrega `IConfigResolver` al constructor y un paso `b` (resolución de config) + un outcome `no-config`:

```typescript
export type NotificacionOutcome =
  | { status: 'skipped' }
  | { status: 'no-config'; motivo: string; codigo: string; ticketId: string }   // NUEVO
  | { status: 'no-email'; motivo: string; solicitanteId: string; ticketId: string }
  | { status: 'send-failed'; destinatarioEnmascarado: string; causa: string; ticketId: string }
  | { status: 'sent'; destinatarioEnmascarado: string; ticketId: string };

export class NotificarCambioEstadoHandler {
  constructor(
    private readonly configResolver: IConfigResolver,   // NUEVO
    private readonly resolver: ISolicitanteEmailResolver,
    private readonly emailSender: EmailSenderPort,
  ) {}

  async handle(event: TicketEstadoCambiado): Promise<NotificacionOutcome> {
    if (!esEstadoNotificable(event.estadoNuevoCodigo)) return { status: 'skipped' };

    const configResult = await this.configResolver.resolveSmtp(event.tenantId);   // NUEVO paso b
    if (configResult.isFail()) {
      return { status: 'no-config', motivo: configResult.getError().message,
               codigo: configResult.getError().code, ticketId: event.ticketId };
    }
    const config = configResult.getValue();

    const resolved = await this.resolver.resolver(event.solicitanteId, event.tenantId);
    if (resolved.isFail()) return { status: 'no-email', /* ...igual que hoy... */ };

    const sendResult = await this.emailSender.send({ /* ...EmailMessage igual que hoy... */ }, config);
    // ...igual que hoy...
  }
}
```

`NotificarCambioEstadoListener`: agrega un `case 'no-config'` al switch → `logger.warn(...)` con `codigo` y `ticketId` (NUNCA el secreto). El resto del listener intacto.

### 7.3 Qué se elimina

- `tickets/infrastructure/email/email-config.ts` — **eliminar** (junto con `EmailConfig` + `SmtpConfigError`). El fail-fast de bootstrap deja de existir (spec R6).
- El setup de env SMTP dummy en `test/setup-env.ts` para specs de wiring puede quedar sin efecto — verificar en tasks que ninguna spec dependa de él tras el swap.

### 7.4 Wiring `tickets.module.ts`

```typescript
// EMAIL_SENDER: adapter puro, sin fromEnv (Dz11)
{ provide: EMAIL_SENDER, useClass: NodemailerEmailSender },

// NotificarCambioEstadoHandler: +CONFIG_RESOLVER en el inject
{
  provide: NotificarCambioEstadoHandler,
  useFactory: (configResolver, resolver, emailSender) =>
    new NotificarCambioEstadoHandler(configResolver, resolver, emailSender),
  inject: [CONFIG_RESOLVER, SOLICITANTE_EMAIL_RESOLVER, EMAIL_SENDER],
},
```
`TicketsModule.imports += [ConfiguracionModule]` (que exporta `CONFIG_RESOLVER` + `SECRET_CIPHER`).

---

## 8. Audit — port + evento + listener async

- **Reusa** `IDomainEventPublisher`/`DOMAIN_EVENT_PUBLISHER` (`shared/`, ya existe) y `EventEmitterModule.forRoot()` (ya en `SharedModule`, `global:true`).
- **Emisión**: `ActualizarConfigUseCase` publica `ConfiguracionCambiada` con valores **ya enmascarados** (Dz7) tras persistir.
- **Listener** (infra, `configuracion/infrastructure/events/audit-configuracion.listener.ts`): `@Injectable()` `@OnEvent(CONFIGURACION_CAMBIADA)` → delega en `AuditConfiguracionHandler` (application, puro) → `AuditLogPort.record(entry, scope)`. Try/catch de última red igual que `notificar-cambio-estado.listener.ts` (nunca propaga).
- **Adapter** `PrismaAuditLog` (`configuracion/infrastructure/persistence/prisma/audit-log.adapter.ts`): elige la DB por `scope` — `scope.kind==='tenant'` → `getTenantClient(scope.dbName).auditEntry.create(...)`; `global` → `getMasterClient().auditEntry.create(...)` (spec R5 "scope dual"). Falla de infra → `Result.fail(AuditError)`.
- **Masking**: garantizado en el origen (Dz7); el adapter persiste tal cual llega. Doble red: el adapter NO recibe cleartext posible.

---

## 9. RBAC — permiso `configuracion:gestionar`

- Migración seed en `prisma_master/migrations/<ts>_seed_rbac_configuracion_gestionar/migration.sql`, patrón idéntico a `20260627000000`:

```sql
INSERT INTO permisos (id, codigo, descripcion) VALUES
  ('b0000000-0000-4000-b000-000000000020', 'configuracion:gestionar', 'Leer y editar la configuración operativa en runtime (SMTP, etc.)')
ON CONFLICT (codigo) DO NOTHING;

INSERT INTO roles_permisos (rol_id, permiso_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permisos p
WHERE r.codigo = 'ADMIN' AND p.codigo = 'configuracion:gestionar'
ON CONFLICT (rol_id, permiso_id) DO NOTHING;
```

- **UUID determinista**: `b0000000-0000-4000-b000-000000000020` propuesto — **confirmar en tasks el siguiente libre** (el ...013 lo tomó `ticket:eliminar`; migraciones posteriores sembraron más permisos; verificar el máximo actual).
- **Guard**: reusa `PermissionsGuard` existente + decorator `@RequirePermissions('configuracion:gestionar')`. Cero cambios en el guard.
- **Límite D9** (documentado, aceptado): otorgar/revocar el permiso surte efecto en el **próximo login/refresh** — el guard evalúa `user.permisos` del JWT, no consulta DB (spec R4 escenario D9). No se corrige acá.

---

## 10. API de gestión de config

`ConfiguracionController` (`configuracion/interface/controllers/configuracion.controller.ts`), guard chain de clase `@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard, TenantGuard)`:

```typescript
@Controller('configuracion')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard, TenantGuard)
export class ConfiguracionController {
  @Get()
  @RequirePermissions('configuracion:gestionar')
  async listar(@Query('scope') scope, @Query('categoria') categoria, @CurrentUser() user): Promise<ConfigResponseDto[]>;
  // → LeerConfigUseCase: esSecreto ⇒ valor '********' (R3); no-secreto ⇒ valor real.

  @Put()
  @RequirePermissions('configuracion:gestionar')
  async actualizar(@Body() dto: ActualizarConfigHttpDto, @CurrentUser() user): Promise<ConfigResponseDto>;
  // → ActualizarConfigUseCase: cifra si esSecreto, upsert, emite ConfiguracionCambiada.
}
```

- `clienteId` = `user.clienteId` (`@CurrentUser() user: JwtPayload`) → `dbName` para scope tenant. `actorId` = `user.id`.
- La respuesta (`ConfigResponseDto`) SIEMPRE enmascara `esSecreto` (nunca descifra para leer — spec R3).
- **Solo categoría `smtp`** cableada (spec R8): el use case valida `categoria === 'smtp'` (o whitelist) y rechaza otras; ningún endpoint lee/escribe otra categoría.

---

## 11. Migración fan-out

| DB | Migración | Contenido |
|----|-----------|-----------|
| master | `prisma_master/migrations/<ts>_add_configuracion_runtime_audit/` | `CREATE TABLE IF NOT EXISTS configuracion_runtime` + `audit_entries` + partial unique index |
| master | `prisma_master/migrations/<ts>_seed_rbac_configuracion_gestionar/` | permiso + asignación ADMIN (idempotente, §9) |
| tenant | `prisma_tenant/migrations/<ts>_add_configuracion_runtime_audit/` | `CREATE TABLE IF NOT EXISTS configuracion_runtime` + `audit_entries` + partial unique index |

- **Aplicación tenant**: `MigrateTenantsRunner.run()` (`backend/scripts/migrate-tenants.runner.ts`) — `SELECT db_name FROM clientes WHERE activo AND deleted_at IS NULL` + `prisma migrate deploy` por tenant, non-aborting. **Correr manualmente/CI tras el deploy** (no en boot).
- **Idempotencia** (DoD §9 CLAUDE.md): `CREATE TABLE IF NOT EXISTS`, `CREATE UNIQUE INDEX IF NOT EXISTS ... WHERE deleted_at IS NULL`, `CREATE INDEX IF NOT EXISTS`. `prisma migrate deploy` ya es idempotente; los guards son la red DoD.
- **Verificación de completitud** (mitiga riesgo del proposal §6): comparar conteo de tenants migrados con `clientes` activos antes de dar DONE.

---

## 12. Placement final (ratifica el proposal §3.8, con correcciones)

| Pieza | Capa | Ubicación **final** | Cambio vs proposal |
|-------|------|---------------------|--------------------|
| `SmtpConfig` (VO) | shared/domain | `shared/domain/value-objects/smtp-config.vo.ts` | **MOVIDO** de `configuracion/` a `shared/` (Dz1, Scope Rule) |
| `ISecretCipher` | shared/domain | `shared/domain/ports/i-secret-cipher.ts` | = |
| `AesGcmSecretCipher` | shared/infra | `shared/infrastructure/crypto/aes-gcm-secret-cipher.adapter.ts` | = |
| `IConfigResolver` | configuracion/domain | `configuracion/domain/ports/i-config-resolver.ts` | = (renombrado `resolveSmtp`) |
| `PrismaConfigResolver` | configuracion/infra | `configuracion/infrastructure/persistence/prisma/config-resolver.adapter.ts` | = |
| `AuditEntry` | configuracion/domain | `configuracion/domain/entities/audit-entry.entity.ts` | NO extiende BaseEntity (Dz8) |
| `AuditLogPort` | configuracion/domain | `configuracion/domain/ports/i-audit-log.port.ts` | = |
| `ConfiguracionCambiada` | configuracion/domain | `configuracion/domain/events/configuracion-cambiada.event.ts` | = |
| `AuditConfiguracionHandler` | configuracion/application | `configuracion/application/event-handlers/audit-configuracion.handler.ts` | = |
| `AuditConfiguracionListener` | configuracion/infra | `configuracion/infrastructure/events/audit-configuracion.listener.ts` | = |
| `PrismaAuditLog` | configuracion/infra | `configuracion/infrastructure/persistence/prisma/audit-log.adapter.ts` | = |
| `LeerConfigUseCase` / `ActualizarConfigUseCase` | configuracion/application | `configuracion/application/use-cases/{leer,actualizar}-config.use-case.ts` | = |
| `ConfiguracionController` + DTOs | configuracion/interface | `configuracion/interface/controllers/configuracion.controller.ts` | = |
| `maskIfSecret` | configuracion/domain | `configuracion/domain/mask-secret.ts` | nuevo (§5.1) |
| `EmailSenderPort` (contrato) | tickets/domain | `tickets/domain/ports/i-email-sender.port.ts` | **EDITAR** `send(msg, config)` |
| `NodemailerEmailSender` | tickets/infra | `tickets/infrastructure/email/nodemailer-email-sender.adapter.ts` | **REFACTOR** transporter por-envío |
| `email-config.ts` + `SmtpConfigError` | tickets/infra | — | **ELIMINAR** |
| `NotificarCambioEstadoHandler` + listener | tickets | (existentes) | **EDITAR** (+resolver, +outcome no-config) |
| `ConfiguracionModule` | módulo | `configuracion/configuracion.module.ts` | nuevo (exporta CONFIG_RESOLVER, SECRET_CIPHER) |
| `tickets.module.ts` | módulo | (existente) | **EDITAR** (imports ConfiguracionModule; EMAIL_SENDER useClass; inject CONFIG_RESOLVER) |

---

## 13. Testing Strategy (Test-First estricto, atómico — `strict_tdd`)

| Requirement / Scenario | Tipo | Seam / cómo |
|---|---|---|
| R1 tenant gana sobre global | Unit | `PrismaConfigResolver` con `getTenantClient`/`getMasterClient` mockeados; tenant completo ⇒ valores tenant. |
| R1 tenant sin fila → global | Unit | tenant `findMany`→[], global completo ⇒ valores global. |
| R1 ni tenant ni global → `NO_CONFIG` | Unit | ambos []; `Result.fail(NoConfigError)`, sin throw. |
| R1 config incompleta (merge por campo) | Unit | tenant `{host}`, global `{host,port}` sin `user` ⇒ `CONFIG_INCOMPLETA`. tenant `{host}` + global `{port,user,pass,from}` ⇒ `ok` (merge). |
| R1/R9 aislamiento cross-DB por clienteId | Unit | mock verifica que `getTenantClient` se llamó con el `dbName` de A resuelto de `clientes`; jamás B. |
| R2 round-trip encrypt→decrypt | Unit | `AesGcmSecretCipher` con `CONFIG_ENCRYPTION_KEY` válida; decrypt(encrypt(x)) === x. |
| R2 authTag inválido → `CONFIG_CIFRADO_INVALIDO` | Unit | alterar `authTag`; `decrypt` ⇒ `Result.fail`, sin throw. |
| R2 clave ausente/inválida → outcome tipado | Unit | env sin clave / clave corta ⇒ `Result.fail(CifradoError)` en decrypt; app no participa del boot. |
| R2 secreto nunca fuera de memoria | Unit + review | `SmtpConfig.toSafeLog()` enmascara `pass`; `sanitizeCausa(causa, pass)` redacta el pass; auditoría de que ningún `Result.fail`/log lo interpola. |
| R3 lectura enmascara secretos | Unit | `LeerConfigUseCase`: fila `esSecreto` ⇒ `'********'`; fila no-secreta ⇒ valor real. |
| R4 con permiso pasa / sin permiso 403 | Unit | `PermissionsGuard` con JWT con/sin `configuracion:gestionar`. |
| R4 permiso stale (D9) | Unit | JWT sin el permiso ⇒ 403 aunque exista en DB (guard no consulta DB). |
| R4 seed idempotente | Integración | re-correr migración ⇒ sin duplicar permiso/asignación (`ON CONFLICT DO NOTHING`). |
| R5 update no-secreto audita valores reales | Unit | `ActualizarConfigUseCase` con `publisher` spy; assert evento con `valorAnterior/Nuevo` reales, `esSecreto:false`. |
| R5 update secreto enmascara en audit | Unit | spy: evento con `valorAnterior/Nuevo === '********'`, cleartext ausente. |
| R5 fallo de audit no revierte | Unit | `AuditConfiguracionHandler` con `AuditLogPort` mock→fail; config persistida intacta, sin throw. |
| R5 scope dual | Unit | `PrismaAuditLog`: `scope=tenant` ⇒ `getTenantClient(dbName)`; `global` ⇒ `getMasterClient`. |
| R6 app arranca sin config SMTP | Integración fina | bootstrap de `TicketsModule`/`ConfiguracionModule` sin env SMTP ni `CONFIG_ENCRYPTION_KEY` ⇒ sin throw. |
| R6 envío sin config no rompe el flujo | Unit | handler con `configResolver` mock→`NO_CONFIG` ⇒ outcome `no-config`, `send` NO llamado, sin throw. |
| R6 hot-reload | Unit | resolver devuelve config nueva en la 2ª llamada ⇒ transporter con host nuevo (sin cache). |
| R7 `send(email, config)` arma transporter por-envío | Unit | `NodemailerEmailSender` con `transportFactory` spy; assert createTransport llamado con `config.*`. |
| R7 adapter no importa cipher/prisma | Review estructural | auditoría de imports de `nodemailer-email-sender.adapter.ts`. |
| R8 solo `smtp` cableado | Review + Unit | `ActualizarConfigUseCase` rechaza `categoria !== 'smtp'`; grep sin otra categoría. |
| R9 aislamiento multi-tenant | Unit | (cubierto por R1 cross-DB). |
| R9 sin cache de transporter | Unit | 2 sends ⇒ 2 llamadas a `transportFactory`. |

Anti-bucle (§5 CLAUDE.md): contrato ANTES del test; el resolver solo mockea 2 colaboradores (Prisma clients + cipher); si un test falla 2 veces, cortar y reportar. Integración fina y deliberada (R4 seed, R6 boot) — no se sobre-mockea DB en la primera iteración unitaria.

---

## 14. Forks NO cubiertos por D1-D9 (para el orquestador → consultar al usuario)

| # | Fork | Resolución tentativa del design | Por qué necesita decisión |
|---|------|----------------------------------|---------------------------|
| **F1** | **Validación de `CONFIG_ENCRYPTION_KEY`: boot vs use-time.** D6 dice "validada al bootstrap del adapter de cifrado"; spec R2/R6 + instrucción de tarea dicen "al usar, no al boot". | **Use-time (lazy)** — Dz3. La app arranca sin clave; secreto mal configurado ⇒ `CONFIG_CIFRADO_INVALIDO` en send-time. | Contradice la LETRA de D6. Se resolvió a favor del spec (más específico y downstream), pero conviene ratificarlo explícitamente. |
| **F2** | **¿Quién puede editar la config GLOBAL (master) vs la del tenant?** El permiso `configuracion:gestionar` habilita el CRUD, pero no distingue scope. Un ADMIN de un tenant, ¿puede escribir la config global que afecta a TODOS los tenants sin config propia? | Propuesta: scope `tenant` para cualquier ADMIN con el permiso; scope `global` restringido a **global admin** (`usuarios.isGlobalAdmin`, ya existe en master). | El spec R4/R5 habla de scope dual pero NO fija quién autoriza el scope global. Es una decisión de seguridad con impacto multi-tenant. |
| **F3** | **Semántica de `clave`: bare (`host`) vs qualified (`smtp.host`).** El spec §0 tiene columnas `categoria` + `clave`; los escenarios R5 escriben `clave:"smtp.host"`. | Design ratifica **`categoria='smtp'` + `clave='host'`** (bare); el `"smtp.host"` del spec es shorthand del compuesto para display/audit. | Inconsistencia menor del spec. Afecta las claves exactas que se persisten y los asserts de los tests de audit. |
| **F4** | **UUID determinista del permiso nuevo.** Propuesto `...000000000020`; el `...013` ya está tomado y hubo seeds posteriores. | Confirmar el siguiente libre en `sdd-tasks` leyendo todas las migraciones de seed RBAC. | Un UUID colisionante rompe el seed; es verificable pero requiere leer el estado actual de `permisos`. |

Ninguno de estos forks bloquea el diseño global; F1 y F2 son los que ameritan confirmación del usuario antes de `sdd-apply` (seguridad-sensibles). F3/F4 se cierran mecánicamente en `sdd-tasks`.

---

## 15. Riesgos (delta sobre proposal §6)

| Riesgo | Mitigación (design) |
|---|---|
| `SmtpConfig.pass` fugado por serialización accidental | `toSafeLog()` enmascara `pass`; el VO nunca se pasa entero a un logger; `sanitizeCausa(causa, pass)` redacta el pass del `EmailError`. |
| Partial unique index olvidado ⇒ claves duplicadas activas | Raw SQL `CREATE UNIQUE INDEX IF NOT EXISTS ... WHERE deleted_at IS NULL` en AMBAS migraciones; test de integración que inserta 2 filas activas misma `(categoria,clave)` ⇒ falla. |
| Merge por campo mal implementado ⇒ config incompleta pasa como válida | `SmtpConfig.create()` valida completitud (todos los campos requeridos) — único punto de verdad; tests de R1 cubren tenant-parcial + global-completa. |
| `ConfiguracionModule` no exporta el token ⇒ `tickets` no resuelve `CONFIG_RESOLVER` al boot | Test de wiring: bootstrap de `TicketsModule` importando `ConfiguracionModule` resuelve `NotificarCambioEstadoHandler` sin error. |
| Fan-out incompleto (tenants sin tabla) | Verificar conteo migrado vs `clientes` activos; migraciones idempotentes re-corribles. |

---

## Open Questions (para `sdd-tasks`)

- [ ] **F1/F2**: confirmar con el usuario vía orquestador (boot-vs-use validation; quién edita config global).
- [ ] Confirmar el claim exacto del JWT para `clienteId`/`id`/`isGlobalAdmin` en `JwtPayload` (mismo que usa `@CurrentUser` en `tickets.controller`).
- [ ] Confirmar el próximo UUID libre para `configuracion:gestionar` (F4).
- [ ] Decidir si `test/setup-env.ts` (env SMTP dummy) se elimina o se mantiene tras borrar `email-config.ts`.

---

## Resolución de forks (decisión del usuario, 2026-07-30) — AUTORITATIVA

Estas resoluciones **anulan** cualquier guía previa en conflicto de este design.

### F1 — Validación de `CONFIG_ENCRYPTION_KEY`: **BOOT fail-fast** (corrige Dz3)
- La **clave de cifrado es infra tier-bootstrap** (mismo trato que `JWT_SECRET` / `DATABASE_URL_MASTER`): se valida **al arrancar la app**. Si falta o es inválida (longitud incorrecta para AES-256) → la app **NO arranca** (throw en el boot, como el precedente de esos secretos).
- Distinción clave: **la CLAVE (env, infra) = boot fail-fast**; **las FILAS de config (datos, tenant/global) = degradan graciosamente en send-time** (D3/spec R6 intactos: envío sin config → outcome tipado; error de descifrado de un valor puntual → `CONFIG_CIFRADO_INVALIDO`).
- Implica: un chequeo de presencia+forma de `CONFIG_ENCRYPTION_KEY` en el bootstrap (ej. en el provider/factory del `ISecretCipher` adapter, o en `shared.module`), con su test.

### F2 — Autoridad de edición por scope: **menor privilegio**
- Config **scope `tenant`**: editable por cualquier usuario con permiso `configuracion:gestionar` (opera sobre la config de SU tenant).
- Config **scope `global`**: editable **solo por `isGlobalAdmin`** (el permiso `configuracion:gestionar` NO alcanza para tocar la global).
- El controller/use case de escritura debe validar el scope contra `isGlobalAdmin` ANTES de permitir editar/crear una fila `global`. Escenario de test: ADMIN-de-tenant con permiso intenta editar global → rechazado (403/forbidden).

### F3 / F4 (mecánicos, se cierran en tasks)
- F3: semántica de `clave` = **bare** (`host`, no `smtp.host`); la categoría da el namespace.
- F4: UUID del permiso `configuracion:gestionar` = próximo libre determinista (confirmar en la migración seed).
