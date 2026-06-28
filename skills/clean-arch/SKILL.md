---
name: clean-arch
description: "Trigger: clean architecture, clean arch, capas, capas de dominio, hexagonal, arquitectura limpia, domain-driven, DDD, layers. Apply pure Clean Architecture dependency rules — no tool-specific bindings."
license: Apache-2.0
metadata:
  author: gentleman-programming
  version: "1.0"
---

## Activation Contract

Apply these rules when creating, refactoring, or reviewing code that touches business logic or application structure. The rules are tool-agnostic — adapt them to any framework or ORM.

## Hard Rules

### Layer Structure

```
src/
├── domain/          # Enterprise + core business logic. ZERO external deps.
├── application/     # Use cases / interactors / commands. Orchestrates domain.
├── infrastructure/  # Implementations: DB, HTTP, queue, file system, external APIs.
└── presentation/    # Entry points: controllers, resolvers, CLI commands, event handlers.
```

### Dependency Rule (NON-NEGOTIABLE)

- `domain/` imports NOTHING outside itself (no frameworks, no ORM, no HTTP)
- `application/` imports `domain/` ONLY
- `infrastructure/` imports `domain/` and `application/` ONLY
- `presentation/` imports `application/` ONLY

Violation: any file in `domain/` with an import from outside `domain/`. REJECT it.

### Domain Rules

- **Entities**: pure objects with identity and behavior. No getters/setters boilerplate.
- **Value Objects**: immutable, self-validating, compared by value. Create one for every primitive that carries meaning (Email, Money, UserId).
- **Domain Events**: plain objects recording something that happened. Named in past tense (`OrderPlaced`).
- **Repository Interfaces**: defined in `domain/` as contracts. No implementation detail (no `save()`, use `store()` or `persist()`).
- **No anemic domain**: behavior lives ON the entity, not in services.

### Application Rules

- **Use Cases**: one class per use case. Single method `execute()` or `invoke()`.
- **Ports**: interfaces that infrastructure implements (repository ports, notifier ports, etc.). Defined in `application/` or `domain/`.
- **DTOs**: plain objects crossing layer boundaries. Defined in `application/`. Never expose domain entities outside `application/`.
- **No infrastructure import in application code**. If it touches a framework, it belongs in `infrastructure/`.

### Infrastructure Rules

- **Implements** the ports defined in `domain/` and `application/`. No business logic — only technical wiring.
- Repositories, ORM models, HTTP clients, queues all live here.

### Presentation Rules

- Translates HTTP/CLI/GraphQL input to application DTOs, delegates to use cases, translates responses.
- Zero business logic. Zero domain knowledge leaks. If it has an `if` that is business-related, move it.

### Cross-Cutting

- **Shared kernel**: types, interfaces, and VOs that MUST be shared across layers live in `domain/`.
- **Dependency injection**: wiring is infrastructure concern. Use constructor injection in all layers, no service locators.
- **Testing**: domain tests have ZERO infrastructure. Application tests mock ports. Infrastructure tests use real adapters or testcontainers.

## Decision Gates

| Situation | Action |
|-----------|--------|
| New business concept | Create Entity + Value Objects in `domain/` first |
| New external integration | Define port in `application/`, implement in `infrastructure/` |
| Framework added | `infrastructure/` only. Never in `domain/` or `application/` |
| Use case grows complex | Split into smaller use cases. One class = one reason to change |
| Entity has too many fields | Extract Value Objects. Group related fields into VO |

## Execution Steps

1. Identify the layer the change belongs to using the Dependency Rule.
2. If it's new business logic: write domain types first, then application use case, then infrastructure, then presentation.
3. If it's a new external integration: write the port interface first, then implement it.
4. Verify no dependency rule is violated before considering the task done.

## Output Contract

Return: files created per layer, any dependency violations found and fixed, and whether the change touched business logic (domain/application) or was purely technical (infrastructure/presentation).

## References

- `clean-arch/assets/` — optional code templates for entities, VOs, use cases
