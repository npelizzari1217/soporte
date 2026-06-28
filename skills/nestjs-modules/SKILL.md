---
name: nestjs-modules
description: "Trigger: NestJS, Nest, módulo, module, controller, provider, @Module, decorator, inyección de dependencias, DI. Structure NestJS modules following Clean Architecture — modules are wiring, not layers."
license: Apache-2.0
metadata:
  author: gentleman-programming
  version: "1.0"
---

## Activation Contract

Apply when creating or modifying NestJS modules, controllers, or providers. NestJS modules are dependency injection wiring — they belong in `presentation/` and `infrastructure/`, NEVER in `domain/` or `application/`.

## Hard Rules

### Module Placement

| NestJS Element | Clean Arch Layer | Folder |
|---------------|------------------|--------|
| `@Controller()` | Presentation | `src/presentation/controllers/` |
| `@Resolver()` (GraphQL) | Presentation | `src/presentation/resolvers/` |
| `@Module()` | Wiring only | Same folder as what it wires |
| `@Injectable()` service | Application (use cases) | `src/application/use-cases/` |
| Repository impl | Infrastructure | `src/infrastructure/repositories/` |
| DTO / Pipe / Guard | Presentation | `src/presentation/` |
| `@Entity()` / ORM model | Infrastructure | `src/infrastructure/models/` |

### Module Structure

```typescript
// presentation/controllers/users.module.ts
@Module({
  imports: [CqrsModule],
  controllers: [UsersController],
  providers: [
    // Wire use cases as providers — they're not NestJS services, they're domain use cases
    { provide: CreateUserUseCase, useClass: CreateUserUseCase },
    { provide: USERS_REPOSITORY, useClass: PostgresUsersRepository },
  ],
})
export class UsersModule {}
```

- **Controllers** are thin: parse request → call use case → return response. Zero business logic.
- **Use cases** are plain TypeScript classes with `execute()`. They do NOT use NestJS decorators (`@Injectable()` is optional — prefer plain classes). They receive dependencies via constructor.
- **Repository implementations** use NestJS `@Injectable()` because they live in infrastructure.
- **Pipes, Guards, Interceptors** belong in `presentation/`. They are framework concerns, not business logic.

### Dependency Injection Rules

| Inject | Where declared | Where provided |
|--------|---------------|----------------|
| Use case class | `application/` | Module in `presentation/` |
| Repository interface (token) | `domain/` | Module in `presentation/` or `infrastructure/` |
| Repository implementation | `infrastructure/` | Module in `presentation/` |
| Controller | `presentation/` | Same module |
| Infrastructure client (DB, HTTP) | `infrastructure/` | Module in `infrastructure/` |

### Non-Negotiable Rules

1. **No `@Injectable()` in domain**. Domain entities and VOs are pure classes. Zero NestJS decorators.
2. **Use cases are NOT NestJS services**. They don't extend anything. They don't use NestJS decorators. They're plain classes with `execute()`.
3. **Repository injection uses tokens**, not classes, to keep domain free of NestJS imports:
   ```typescript
   // domain/repositories/user-repository.ts
   export const USERS_REPOSITORY = Symbol('USERS_REPOSITORY')

   export interface UserRepository { ... }
   ```
4. **Modules import modules**, not services. Cross-module use cases are accessed via their module's public providers.
5. **Dynamic modules** for config, DB, and external clients. Static modules for everything else.
6. **Circular imports are a design smell**: if Module A needs Module B and vice versa, extract the shared dependency into a new module.

### Testing

- **Controllers**: test with `@nestjs/testing` Test.createTestingModule(). Mock use cases.
- **Use cases**: test as plain classes. No NestJS testing needed. Instantiate with mocked ports.
- **Infrastructure**: test with real DB via `@nestjs/testing` + testcontainers.

## Decision Gates

| Need | Structure |
|------|-----------|
| New feature | New module in `presentation/`. Wires controller + use case + repo |
| Cross-module use case | Export the use case in `exports: []` of the source module |
| External service client | `@Global()` module or dedicated `InfrastructureModule` |
| Config | `ConfigModule.forRoot()` with validated env schema |

## Execution Steps

1. Identify the layer: controller → `presentation/`, use case → `application/`, repo → `infrastructure/`.
2. Create the module in `presentation/modules/`. Wire controller, use cases, and repository implementations.
3. Create or update the parent module to import the new module.
4. Verify: controller imports nothing from infrastructure. Domain imports nothing from NestJS.

## Output Contract

Return: files created per layer, module wiring, any decorator violations removed from domain/application, and verification that dependency direction is correct.

## References

- `clean-arch/SKILL.md` — layer rules that modules must respect
- `repository-pattern/SKILL.md` — repository interfaces in domain, impls in infra
- `value-objects/SKILL.md` — VOs used across all layers
