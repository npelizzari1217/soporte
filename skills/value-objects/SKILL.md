---
name: value-objects
description: "Trigger: value object, VO, tipos fuertes, domain primitive, self-validating, valor, value type. Model immutable self-validating Value Objects for domain-driven TypeScript."
license: Apache-2.0
metadata:
  author: gentleman-programming
  version: "1.0"
---

## Activation Contract

Create or refactor to Value Objects whenever a primitive (`string`, `number`, `boolean`) carries domain meaning — an email, a price, a status, an ID. VOs eliminate primitive obsession and make the domain explicit.

## Hard Rules

### Structure

```typescript
class Email {
  private constructor(private readonly value: string) {}

  static create(raw: string): Result<Email, Error> {
    if (!raw.includes('@')) return err(new Error('Invalid email'))
    return ok(new Email(raw))
  }

  get(): string {
    return this.value
  }

  equals(other: Email): boolean {
    return this.value === other.value
  }
}
```

### Non-Negotiable Rules

1. **Immutable** — `readonly` fields. No setters. No `mutate()` methods. Once created, never changes.
2. **Self-validating** — validation happens INSIDE the VO, at construction time. Use a factory method (`create()`, `from()`) that returns `Result` or throws typed errors. Never allow an invalid VO to exist.
3. **Compared by value** — implement `equals()`. Two VOs with the same value ARE the same object. No reference equality.
4. **No behavior unrelated to the value** — a `Money` VO can have `add()`, `subtract()`, `times()`. It does NOT have `formatForDisplay()` — that belongs in presentation.
5. **Primitive obsession is a code smell** — if you see `string` for an email, `number` for a price, `string` for a status, replace with a VO.

### Decision Gates

| Primitive type | Domain meaning | Create VO |
|---------------|----------------|-----------|
| `string` | email, phone, URL, name, slug, status | YES |
| `number` | age, price, quantity, rating, percentage | YES |
| `boolean` | flag with invariants (e.g., isVerified with expiration) | YES |
| `string` | free-text description, title that has no validation rules | NO |
| `number` | counter, index, plain integer with no constraints | NO |

### When to Use Factory vs Constructor

| Approach | When |
|----------|------|
| `static create()` | Validation needed. Returns `Result` or throws. Default choice. |
| `constructor(value)` | Trusted internal use only (e.g., deserialization from a trusted source, reconstructing from DB). Mark `private` or limit visibility. |
| `static fromDB()` | Reconstructing from persistence. Input is already validated. |

### Serialization Contract

Every VO MUST provide:
- `get()` or `value()` → returns the raw primitive (for DB, API responses, logging)
- `equals(other)` → value comparison
- `toString()` → human-readable string (for display, never use for logic)

### Validation Rules

- Validate in the factory. Do NOT validate in controllers or use cases.
- Keep validation focused: what makes this value valid? Not business rules that belong in entities.
- Example: `Age` validates `>= 0 && <= 150`. It does NOT validate "user must be 18+ to purchase" — that's entity/use case logic.

### Shared Kernel

VOs that cross bounded contexts (Email, Money, UserId) live in a shared package or module. Every context uses the SAME VO definition. No duplication.

## Execution Steps

1. Identify a primitive that carries domain meaning.
2. Create the VO class with `private readonly value`, private constructor, and `static create()` factory.
3. Add validation in the factory.
4. Add `equals()`, `get()`, `toString()`.
5. Replace all usages of the raw primitive with the VO.
6. Update tests: test VALID creation, INVALID creation, equality, and serialization.

## Output Contract

Return: the VO files created, the primitives they replaced, validation rules enforced, and any shared VOs promoted to the shared kernel.

## References

- `clean-arch/SKILL.md` — VOs belong in `domain/`, layer rules apply
- `value-objects/assets/` — optional templates for common VOs (Email, Money, DateRange)
