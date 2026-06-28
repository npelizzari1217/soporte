---
name: data-access
description: "Trigger: data access, acceso a datos, online, offline, cache, sync, local DB, SQLite, base de datos local, API, repository remoto, conectividad, persistencia, netinfo. Abstract data access so the same use case works via direct DB (backend), remote API (web), or local cache (mobile)."
license: Apache-2.0
metadata:
  author: gentleman-programming
  version: "1.0"
---

## Activation Contract

Apply when determining HOW a use case accesses data — whether it talks to a database directly, fetches from a remote API, reads from a local cache, or syncs between them. Decouples data access strategy from business logic.

## Hard Rules

### Architecture: One Port, Multiple Strategies

```
                    ┌──────────────────┐
                    │   Use Case       │
                    │ (business logic) │
                    └────────┬─────────┘
                             │ calls
                             ▼
                    ┌──────────────────┐
                    │ RepositoryPort   │
                    │  (interface)     │
                    └────────┬─────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
              ▼              ▼              ▼
    ┌─────────────────┐ ┌──────────┐ ┌──────────────┐
    │ DirectDBRepo    │ │RemoteRepo│ │CachedRepo    │
    │ (backend: ORM)  │ │(web:HTTP)│ │(mobile:sync) │
    └─────────────────┘ └──────────┘ └──────────────┘
```

The **Use Case does NOT know** which implementation it receives. This is wired by DI per platform.

### Recommended Stack (default para proyectos nuevos)

| Capa | DB | ORM / Driver | Licencia |
|------|----|-------------|----------|
| **Backend (API server)** | PostgreSQL | **Prisma ORM** | Apache 2.0 ✅ Gratuito |
| **Mobile (offline cache)** | SQLite | **expo-sqlite** (simple) o **WatermelonDB** (sync pesado) | MIT ✅ Gratuito |
| **Web / Desktop** | — | HTTP API → backend | ✅ |
| **Tests** | In-memory | Mock implementando el mismo port | ✅ |

**Prisma es gratis.** El ORM es open source (Apache 2.0). Lo que Prisma cobra son productos cloud (Accelerate, Pulse) que **no necesitás** para un proyecto estándar. Tu API va directo a PostgreSQL sin ningún intermediario pago.

### Data Access Strategy (config per project)

```yaml
# [PROJECT-SPECIFIC] — Fill when copying to a project
# ============================================================
# backend-orm: prisma (default) | drizzle | typeorm
# backend-db: postgresql (default) | mysql | sqlite
# local-db (mobile): expo-sqlite (default) | watermelondb | mmkv
# web-strategy: remote (default) — nunca accede directo a DB
# mobile-strategy: cached-offline-first (default) | remote-only
# backend-strategy: direct (siempre directo, es el backend)
# sync-trigger: on-startup (default) | periodic | pull-to-refresh
# conflict-resolution: last-write-wins (default) | server-wins | manual-merge
# offline-cache-policy: ttl-based (default, 30min) | size-based (50mb) | infinite
# ============================================================
```

### Strategy 1: Direct DB (Backend only — Prisma)

```prisma
// schema.prisma — Archivo ÚNICO que define la DB. 
// Prisma generate crea el cliente type-safe automáticamente.
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model Student {
  id        String   @id @default(uuid())
  email     String   @unique
  name      String
  status    String   @default("active")
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

```typescript
// infrastructure/repositories/prisma-student.repo.ts
// Runs ON THE SERVER. Prisma → PostgreSQL. Type-safe total.
import { PrismaClient } from '@prisma/client'
import { Student } from '@/domain/entities/student'
import { StudentMapper } from './mappers/student.mapper'

class PrismaStudentRepository implements StudentRepositoryPort {
  constructor(
    private readonly db: PrismaClient,
    private readonly mapper: StudentMapper,
  ) {}

  async findById(id: StudentId): Result<Student, RepositoryError> {
    try {
      const row = await this.db.student.findUnique({ where: { id: id.value } })
      if (!row) return err(new NotFoundError())
      return ok(this.mapper.toDomain(row))
    } catch (e) {
      return err(new DatabaseError('Error fetching student', e))
    }
  }

  async save(student: Student): Result<void, RepositoryError> {
    try {
      const data = this.mapper.toPersistence(student)
      await this.db.student.upsert({
        where: { id: data.id },
        create: data,
        update: data,
      })
      return ok(undefined)
    } catch (e) {
      return err(new DatabaseError('Error saving student', e))
    }
  }

  async findByEmail(email: Email): Result<Student, RepositoryError> {
    try {
      const row = await this.db.student.findUnique({ where: { email: email.value } })
      if (!row) return err(new NotFoundError())
      return ok(this.mapper.toDomain(row))
    } catch (e) {
      return err(new DatabaseError('Error fetching student by email', e))
    }
  }
}
```

```typescript
// infrastructure/repositories/mappers/student.mapper.ts
// Mapa entre Prisma (DB) y dominio (VOs/Entities). Capa de transformación EXPLÍCITA.
import { Student as PrismaStudent } from '@prisma/client'
import { Student } from '@/domain/entities/student'
import { StudentId, Email, StudentName, StudentStatus } from '@/domain/value-objects'

class StudentMapper {
  /** Prisma → Domain */
  toDomain(row: PrismaStudent): Result<Student, MapperError> {
    const id = StudentId.from(row.id)
    const email = Email.create(row.email)
    const name = StudentName.create(row.name)
    const status = StudentStatus.from(row.status)

    // Si algún VO falla, el mapper falla — nunca pasa datos inválidos al dominio
    const errors = [id, email, name, status].filter(r => r.isErr())
    if (errors.length > 0) return err(new MapperError('Invalid data from DB', errors))

    return ok(new Student(
      id.value, email.value, name.value, status.value,
      row.createdAt, row.updatedAt,
    ))
  }

  /** Domain → Prisma */
  toPersistence(student: Student): PrismaStudent {
    // Esta dirección siempre es segura porque el dominio garantiza datos válidos
    return {
      id: student.id.value,
      email: student.email.value,
      name: student.name.value,
      status: student.status.value,
      createdAt: student.createdAt,
      updatedAt: student.updatedAt,
    }
  }
}
```

### Strategy 2: Remote API (Web / Mobile online)

```typescript
// infrastructure/repositories/remote-student.repo.ts
// Runs ON THE CLIENT. Talks to the backend API.
class RemoteStudentRepository implements StudentRepositoryPort {
  constructor(private readonly http: HttpClient) {}

  async findById(id: StudentId): Result<Student, RepositoryError> {
    try {
      const response = await this.http.get(`/api/v1/students/${id.value}`)
      if (response.status === 404) return err(new NotFoundError())
      return ok(this.mapper.toDomain(response.data))
    } catch (e) {
      return err(new NetworkError('Error fetching student from API', e))
    }
  }

  async save(student: Student): Result<void, RepositoryError> {
    try {
      await this.http.post(`/api/v1/students`, this.mapper.toDTO(student))
      return ok(undefined)
    } catch (e) {
      return err(new NetworkError('Error saving student via API', e))
    }
  }
}
```

### Strategy 3: Local DB (Mobile — expo-sqlite)

```typescript
// infrastructure/repositories/local-student.repo.ts
// Runs ON THE MOBILE. expo-sqlite → archivo local SQLite.
import * as SQLite from 'expo-sqlite'

class LocalStudentRepository implements StudentRepositoryPort {
  private db: SQLite.WebSQLDatabase

  constructor() {
    this.db = SQLite.openDatabaseSync('app-cache.db')
    this.ensureTable()
  }

  private ensureTable(): void {
    this.db.runSync(`
      CREATE TABLE IF NOT EXISTS students (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL,
        name TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active',
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL,
        syncedAt TEXT
      )
    `)
  }

  async findById(id: StudentId): Result<Student, RepositoryError> {
    try {
      const row = this.db.getFirstSync(
        'SELECT * FROM students WHERE id = ?',
        [id.value],
      )
      if (!row) return err(new NotFoundError())
      return ok(this.mapper.toDomain(row))
    } catch (e) {
      return err(new DatabaseError('Error reading local cache', e))
    }
  }

  async save(student: Student): Result<void, RepositoryError> {
    try {
      const data = this.mapper.toPersistence(student)
      this.db.runSync(
        `INSERT OR REPLACE INTO students (id, email, name, status, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [data.id, data.email, data.name, data.status, data.createdAt, data.updatedAt],
      )
      return ok(undefined)
    } catch (e) {
      return err(new DatabaseError('Error writing local cache', e))
    }
  }
}
```

> Para sincronización pesada (offline-first real con conflictos), usar **WatermelonDB** que tiene sync engine integrado. Para cache simple (leer datos de referencia, mantener último estado), `expo-sqlite` alcanza y sobra.

### Strategy 4: Cached / Offline-First (Mobile — wrapper)

```typescript
// infrastructure/repositories/cached-student.repo.ts
// Wraps RemoteRepo + LocalRepo. Decide estrategia según conectividad.
class CachedStudentRepository implements StudentRepositoryPort {
  constructor(
    private readonly remote: RemoteStudentRepository,
    private readonly local: LocalStudentRepository,
    private readonly sync: SyncEngine,
    private readonly connectivity: ConnectivityChecker,
  ) {}

  async findById(id: StudentId): Result<Student, RepositoryError> {
    // Cache-First: try local first, then remote
    const local = await this.local.findById(id)
    if (local.isOk()) return ok(local.value)

    // Fallback to remote
    const remote = await this.remote.findById(id)
    if (remote.isErr()) return err(remote.error)

    // Save to local cache for next time
    await this.local.save(remote.value)
    return ok(remote.value)
  }

  async save(student: Student): Result<void, RepositoryError> {
    if (this.connectivity.isOnline()) {
      // Online: save to server + update local cache
      const result = await this.remote.save(student)
      if (result.isErr()) return err(result.error)
      await this.local.save(student)
      return ok(undefined)
    }

    // Offline: save locally, queue for sync
    await this.local.save(student)
    await this.sync.enqueue({
      type: 'SAVE_STUDENT',
      payload: { student, timestamp: Date.now() },
    })
    return ok(undefined)
  }
}
```

### Sync Engine (Mobile Offline Queue)

```typescript
// infrastructure/sync/sync-engine.ts
class SyncEngine {
  private queue: SyncOperation[] = []

  async enqueue(op: SyncOperation): Promise<void> {
    await this.localDB.save('sync_queue', op)
  }

  async process(): Promise<void> {
    const pending = await this.localDB.findAll('sync_queue')
    for (const op of pending) {
      try {
        await this.execute(op)
        await this.localDB.delete('sync_queue', op.id)
      } catch (e) {
        // Retry on next sync. Store error count.
        op.retries++
        if (op.retries > 5) {
          await this.localDB.save('sync_failures', op)
          await this.localDB.delete('sync_queue', op.id)
        }
      }
    }
  }
}
```

### Schema Harmony: Prisma ↔ Domain ↔ SQLite Local

El mismo dato viaja por tres representaciones. Es crucial entender cómo se mapean:

```
Prisma Schema (DB)         Domain VOs/Entities         expo-sqlite (mobile cache)
─────────────────          ──────────────────          ─────────────────────────
model Student {            class Student {              CREATE TABLE students (
  id    String @id           id: StudentId    ← VO        id TEXT PRIMARY KEY,
  email String @unique       email: Email      ← VO        email TEXT NOT NULL,
  name  String               name: StudentName ← VO        name TEXT NOT NULL,
  status String              status: Status    ← VO        status TEXT,
  createdAt DateTime         createdAt: Date               createdAt TEXT,
  updatedAt DateTime         updatedAt: Date               updatedAt TEXT,
}                                                       )
```

**Mapper** (explicito, en infra):
- `toDomain(prismaRow) → Student` — valida que los datos crudos sean VO válidos
- `toPersistence(student) → prismaData` — seguro, el dominio ya validó
- `toLocal(student) → sqliteRow` — serializa VOs a strings (SQLite no entiende VOs)
- `fromLocal(sqliteRow) → Student` — rehidrata VOs desde strings

**Regla**: Los VOs (StudentId, Email, etc.) son el **formato canónico**. Prisma y SQLite son representaciones secundarias. Nunca trabajes con strings crudos en el dominio.

### Connectivity Detection

```typescript
// infrastructure/sync/connectivity.ts
interface ConnectivityChecker {
  isOnline(): boolean
  onOnline(callback: () => void): void
  onOffline(callback: () => void): void
}

// The sync engine listens to connectivity changes:
//   - Goes offline → operations queue locally
//   - Comes online → process queue + refresh stale caches
//   - App opens → process queue + refresh stale caches
```

### Strategy Decision Tree

| Context | Where code runs | Strategy | ORM/Driver | Repository Implementation |
|---------|----------------|----------|------------|--------------------------|
| Backend (API server) | Your server | **Direct** | **Prisma** → PostgreSQL | `PrismaXxxRepository` |
| Web (SPA) | Browser | **Remote** | fetch / axios | `RemoteXxxRepository` (HTTP) |
| Web (SSR: Next, Nuxt) | Server + Browser | **Direct** en server, **Remote** en client | Prisma + fetch | Both, wired per env |
| Mobile (Expo) online | Device | **Cached** | expo-sqlite + HTTP | `CachedXxxRepository` |
| Mobile (Expo) offline | Device | **Local-only** | expo-sqlite | `CachedXxxRepository` fallback |
| Mobile (offline-first pesado) | Device | **Sync offline** | WatermelonDB | Sync engine incluido |
| Desktop (Tauri/Eletron) | Device | **Remote** + cache opcional | expo-sqlite o similar | Same pattern as mobile |
| Tests | Node | **Mock** | In-memory | `InMemoryXxxRepository` |

### Repository Wiring per Platform (DI)

```typescript
// ============================================================
// [PROJECT-SPECIFIC] — Framework DI pattern per project
// ============================================================

// api/src/di.ts  (Backend — Prisma → PostgreSQL)
const prisma = new PrismaClient()
const studentMapper = new StudentMapper()
container.register(StudentRepositoryPort, new PrismaStudentRepository(prisma, studentMapper))

// web/src/di.ts  (Web SPA — HTTP API)
const http = new HttpClient({ baseUrl: '/api/v1' })
container.register(StudentRepositoryPort, new RemoteStudentRepository(http))

// mobile/src/di.ts  (Mobile — offline-first cache)
const remote = new RemoteStudentRepository(http)
const local = new LocalStudentRepository()
const sync = new SyncEngine(local)
const connectivity = new ExpoConnectivityChecker()
container.register(StudentRepositoryPort, new CachedStudentRepository(remote, local, sync, connectivity))
```

### Conflict Resolution Strategies

| Strategy | How It Works | When to Use |
|----------|-------------|-------------|
| **last-write-wins** | Last timestamp wins. Older op discarded. | Simple data (preferences, status flags) |
| **server-wins** | Server always overrides local | Financial data, inventory stock |
| **client-wins** | Local overrides server | User drafts, local notes |
| **manual-merge** | Flag conflict, user decides | Complex edits (odontogramas, documentos) |

### Local Cache Invalidation

- **TTL-based**: data expires after N minutes. Re-fetch from remote when stale.
- **Size-based**: max N MB of cache. Evict least recently used when full.
- **Explicit invalidation**: on mutation, mark related cache keys as stale.

```typescript
// domain/value-objects/cache-policy.ts
type CachePolicy =
  | { type: 'ttl'; ttlMs: number }
  | { type: 'infinite' }
  | { type: 'size-max'; maxBytes: number }
```

### Decision Gates

| Question | What to Do |
|----------|-----------|
| ¿Es un endpoint de API? | DirectDB repository (backend). Expone datos via controller. |
| ¿Es una web SPA? | Remote repository (HTTP calls al backend). |
| ¿Es una mobile app? | Cached repository (local primero, remoto después, sync engine). |
| ¿Datos críticos (factura, stock)? | Server-wins conflict resolution. Online required for writes? Show warning. |
| ¿Datos de referencia (catálogo, provincias)? | Cache with long TTL (24h). Refresh on app open. |
| ¿El usuario está offline? | Queue writes, show "pending sync" indicator, auto-sync when online. |
| ¿Primera carga de la app? | Fetch from remote → populate local cache → show UI. Loading state required. |
| ¿El cache está corrupto? | Clear local cache → re-fetch from remote → repopulate. Log incident. |

### Offline Rules for Mobile

1. **Reads are NEVER blocked** by connectivity — serve from cache immediately, refresh in background.
2. **Writes in offline mode** are queued and shown as "pending" with a visual indicator (yellow dot, clock icon).
3. **On reconnect**: process queue in order, show success/failure per item via toast.
4. **Conflicts**: flag the affected records, let user resolve or apply server-wins.
5. **Storage quota**: warn user at 80% of local DB quota. Fail gracefully at 100%.
6. **Sync on startup**: always sync when app opens after >1h closed.

### What NOT to Cache Locally

- Passwords, tokens (store in secure storage, not local DB)
- Large media files (use file-storage with its own cache)
- Data the user must always see fresh (current stock, appointment availability)

## Execution Steps

1. Determine the platform (backend, web SPA, web SSR, mobile, desktop).
2. Choose the strategy per the decision table (direct, remote, cached).
3. Implement the RepositoryPort interface in application layer (already done via `repository-pattern`).
4. Create the platform-specific implementation in `infrastructure/repositories/`.
5. Wire the correct implementation in the DI container per platform.
6. For cached/mobile: add SyncEngine + ConnectivityChecker + local DB adapter.
7. For offline: add visual indicators for pending operations and connectivity status.
8. Verify: switching from direct to remote to cached requires ZERO changes in use cases.

## Output Contract

Return: repository implementations per platform, sync engine (if applicable), connectivity checker, local DB adapter, DI wiring, offline indicators, and verification that use cases are completely unaware of the data access strategy.

## References

- `repository-pattern/SKILL.md` — base pattern this skill extends
- `clean-arch/SKILL.md` — repositories are infrastructure, ports in application
- `error-handling/SKILL.md` — NetworkError, DatabaseError, SyncError patterns
- `file-storage/SKILL.md` — media files use separate cache rules
- `auth-access/SKILL.md` — tokens stored in secure storage, never in local DB
- `ui-patterns/SKILL.md` — loading/error states for network-aware components, offline indicators
