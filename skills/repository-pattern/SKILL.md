---
name: repository-pattern
description: "Trigger: repository, repositorio, persistencia, data access, DAO, ORM, storage, database, DB. Abstract data persistence behind domain interfaces — infrastructure stays replaceable."
license: Apache-2.0
metadata:
  author: gentleman-programming
  version: "1.0"
---

## Activation Contract

Apply when adding data persistence (a new entity to store, a new query to run) or when an existing repository leaks infrastructure details into the domain.

## Hard Rules

### Interface Lives in Domain

```typescript
// domain/repositories/user-repository.ts
export interface UserRepository {
  findById(id: UserId): Promise<User | null>
  findByEmail(email: Email): Promise<User | null>
  save(user: User): Promise<void>
  delete(id: UserId): Promise<void>
}
```

- The interface is defined in `domain/`. Zero imports from infrastructure or ORM.
- Method names speak the domain language: `findByEmail()`, `findActiveSubscribers()`, not `queryByEmail()`.
- Parameters and return types are domain entities or value objects. Never ORM models, never primitives-only DTOs.

### Implementation Lives in Infrastructure

- Concrete repository goes in `infrastructure/repositories/`.
- The implementation maps between ORM/document models and domain entities.
- ORM models are PRIVATE to the infrastructure layer — never exported to domain or application.

```typescript
// infrastructure/repositories/postgres-user-repository.ts
export class PostgresUserRepository implements UserRepository {
  constructor(private readonly db: DbClient) {}

  async findById(id: UserId): Promise<User | null> {
    const row = await this.db.user.findUnique({ where: { id: id.get() } })
    return row ? this.toDomain(row) : null
  }

  private toDomain(row: UserModel): User {
    return User.reconstruct({
      id: UserId.fromDB(row.id),
      email: Email.create(row.email).unwrap(),
      // ...
    })
  }
}
```

### One Repository Per Aggregate Root

- A repository per aggregate root (User, Order, Invoice), NOT per database table.
- If `User` and `Profile` are part of the same aggregate, one `UserRepository` handles both.
- If a table exists purely for reporting/analytics, it does NOT get a repository — use a query interface instead (CQRS-light).

### Non-Negotiable Rules

1. **No ORM types in domain**: `Prisma.UserWhereInput`, `DrizzleUpdateSet` never appear in domain or application.
2. **No leaky queries**: If a repository returns specific columns as a tuple/record, that's a DTO — put it in `application/` and use a separate query interface.
3. **Save is an upsert**: `save()` handles both create and update. The repository decides based on existence check or DB-specific `ON CONFLICT`.
4. **Transactions are application concern**: the use case controls the transaction boundary, not the repository. Pass a unit-of-work or transaction manager into the repository.
5. **Read models are NOT repositories**: If the data is read-only and denormalized for a specific screen, use a lightweight query object, not a full repository.

### Testing

- **Domain/application tests**: mock `UserRepository` interface. Zero DB needed.
- **Infrastructure tests**: test the concrete implementation against a real DB (via testcontainers or in-memory variant). Test mapping, edge cases, and query correctness.
- **Integration tests**: test the repository through a use case with a real DB to verify the full round-trip.

## Decision Gates

| Need | Pattern |
|------|---------|
| Store aggregate root | Repository interface in `domain/`, impl in `infrastructure/` |
| Read-only screen data | Query interface in `application/`, lightweight impl |
| Complex reporting with joins | Separate read model + query object. CQRS-light. Don't force into a repository. |
| Cross-aggregate transaction | Unit of work passed through use case. Repositories share the same DB transaction. |

## Execution Steps

1. Define the repository interface in `domain/repositories/` with domain types.
2. Add the use case in `application/` that depends on the interface (constructor injection).
3. Implement the concrete repository in `infrastructure/repositories/` with ORM mapping.
4. Wire the implementation in the DI container (infrastructure concern).
5. Write tests: mock for use case tests, real DB for infrastructure tests.

## Output Contract

Return: interface file path, implementation file path, mapping logic, any ORM types that were prevented from leaking into domain, and test strategy.

## References

- `clean-arch/SKILL.md` — repositories are ports in domain, implementations in infrastructure
- `value-objects/SKILL.md` — VOs used as repository method params and return types
