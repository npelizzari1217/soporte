---
name: error-handling
description: "Trigger: error handling, errores, Result type, manejo de errores, domain errors, error mapping, try catch. Handle errors consistently with Result types and domain-driven error patterns."
license: Apache-2.0
metadata:
  author: gentleman-programming
  version: "1.0"
---

## Activation Contract

Apply these rules whenever you write error handling, create error types, or map errors between layers. Eliminates inconsistent error handling, silent failures, and error swallowing.

## Hard Rules

### Layered Error Model

```
Domain       → DomainError (business rule violations, validation failures)
Application  → ApplicationError (use case failures, "not found", "not authorized")
Infrastructure → InfrastructureError (DB connection failed, HTTP timeout, file not found)
Presentation → Maps application errors to HTTP/graphQL responses. NEVER exposes infrastructure errors.
```

### Result Type (REQUIRED)

Every operation that can fail MUST return a `Result<T, E>` instead of throwing:

```typescript
type Result<T, E = Error> = Ok<T, E> | Err<T, E>

class Ok<T, E> {
  readonly value: T
  constructor(value: T) { this.value = value }
  isOk(): this is Ok<T, E> { return true }
  isErr(): this is Err<T, E> { return false }
}

class Err<T, E> {
  readonly error: E
  constructor(error: E) { this.error = error }
  isOk(): this is Ok<T, E> { return false }
  isErr(): this is Err<T, E> { return true }
}
```

### Non-Negotiable Rules

1. **NEVER throw in domain or application layers** — `throw` is for infrastructure and framework boundaries ONLY. Use Result types for all expected failures.
2. **Domain errors are part of the domain model** — `EmailInvalid`, `InsufficientFunds`, `OrderAlreadyShipped` are domain concepts. Define them alongside entities.
3. **Map errors at layer boundaries** — infrastructure errors NEVER cross into application. Application errors NEVER cross into presentation as-is.
4. **Every `catch` MUST map or re-wrap** — no bare `catch(e) { throw e }`. Either handle, map to a domain/application error, or let it crash (at the top level only).
5. **Error types carry context** — include what failed, why, and relevant identifiers. No generic `Error('something went wrong')`.

### Domain Error Patterns

```typescript
// Value Object with self-validation returns Result
class Email {
  private constructor(private readonly value: string) {}

  static create(raw: string): Result<Email, EmailInvalidError> {
    if (!raw.includes('@')) return err(new EmailInvalidError(raw))
    if (raw.length > 254) return err(new EmailInvalidError(raw, 'too long'))
    return ok(new Email(raw))
  }
}

// Entity method returns Result
class BankAccount {
  withdraw(amount: Money): Result<void, InsufficientFundsError> {
    if (amount.greaterThan(this.balance)) {
      return err(new InsufficientFundsError(this.balance, amount))
    }
    this.balance = this.balance.subtract(amount)
    return ok(undefined)
  }
}
```

### Application Error Mapping

```typescript
class CreateUserUseCase {
  execute(dto: CreateUserDTO): Result<UserResponse, ApplicationError> {
    const email = Email.create(dto.email)
    if (email.isErr()) return err(new ValidationError(email.error.message))

    const user = this.userRepo.save(email.value)
    // Infrastructure error mapped at boundary
    if (user.isErr()) return err(new InfrastructureError('Failed to save user'))

    return ok(this.mapper.toResponse(user.value))
  }
}
```

### Presentation Error Mapping

```typescript
// Controller catches EVERYTHING and maps to consistent responses
function handleResult<T>(result: Result<T, Error>): Response {
  if (result.isOk()) return { status: 200, body: result.value }

  const error = result.error
  if (error instanceof ValidationError) return { status: 400, body: { error: 'validation_error', details: error.message } }
  if (error instanceof NotFoundError) return { status: 404, body: { error: 'not_found', details: error.message } }
  if (error instanceof InfrastructureError) return { status: 503, body: { error: 'service_unavailable' } }

  // Unhandled = 500, log and return generic
  return { status: 500, body: { error: 'internal_error' } }
}
```

### Decision Gates

| Situation | Action |
|-----------|--------|
| Expected failure (invalid input, business rule) | Return `Result<_, DomainError>` or `Result<_, ApplicationError>` |
| Unexpected failure (network timeout, disk full) | Map to `InfrastructureError` at boundary, let framework handle if unrecoverable |
| Validation error | Domain VOs validate themselves. Return `ValidationError` from domain. |
| "Not found" | Application layer returns `NotFoundError`. NEVER from domain. |
| Auth failure | Application returns `UnauthorizedError`. Presentation maps to 401. |

### Error Logging Rules

- Log infrastructure errors with full context (stack, identifiers, operation)
- Log application errors at WARN level (expected but noteworthy)
- Do NOT log domain validation errors as errors — they're expected. DEBUG level max.
- NEVER log sensitive data (passwords, tokens, PII) in error messages.

## Execution Steps

1. Identify the layer where the error originates (domain, application, infrastructure, presentation).
2. Create or reuse an error type in the appropriate layer.
3. For expected failures: return `Result<T, ErrorType>` — never throw.
4. For infrastructure boundaries: catch external errors and map to `InfrastructureError`.
5. At the presentation boundary: map every possible error type to a consistent response format.
6. Verify: no `throw` in domain/application, no infrastructure error leaks to presentation.

## Output Contract

Return: error types created, Result usage introduced, error mapping layers established, any violations found (throws in domain, error leaks between layers).

## References

- `clean-arch/SKILL.md` — layers define where errors live
- `value-objects/SKILL.md` — VOs self-validate and return Result
- `api-design/SKILL.md` — error responses in API contracts
