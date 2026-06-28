---
name: auth-access
description: "Trigger: auth, autenticación, autorización, access control, login, JWT, RBAC, seguridad, acceso, permissions, roles. Implement authN/authZ with Clean Architecture — providers are infrastructure."
license: Apache-2.0
metadata:
  author: gentleman-programming
  version: "1.0"
---

## Activation Contract

Apply these rules when implementing authentication, authorization, access control, login flows, or permission checks. Keeps auth logic clean and provider-independent.

## Hard Rules

### Separation: AuthN ≠ AuthZ

| Concept | What | Where |
|---------|------|-------|
| **AuthN** (Authentication) | Who are you? Verify identity | Infrastructure (port in application) |
| **AuthZ** (Authorization) | Can you do this? Check permissions | Application + Domain |
| **Session/Token** | Proof of identity | Infrastructure |
| **Current user** | Who is making the request | Presentation (resolved per request) |

### Port/Adapter Pattern for Auth

```typescript
// application/ports/auth-port.ts — PURE interface, no framework
interface AuthPort {
  verify(token: string): Result<UserIdentity, AuthError>
  login(credentials: Credentials): Result<SessionToken, AuthError>
}

// domain/value-objects/user-identity.ts — who the user IS
class UserIdentity {
  private constructor(
    readonly id: UserId,
    readonly roles: ReadonlyArray<Role>,
  ) {}

  static from(id: UserId, roles: Role[]): UserIdentity {
    return new UserIdentity(id, Object.freeze([...roles]))
  }

  hasRole(role: Role): boolean {
    return this.roles.some(r => r.equals(role))
  }
}
```

### Non-Negotiable Rules

1. **Auth providers are infrastructure** — JWT, OAuth, session cookies, Passport.js, Firebase Auth ALL live in `infrastructure/`. Define a port in `application/`, implement in `infrastructure/`.
2. **Current user is resolved at the presentation boundary** — middleware extracts token, calls AuthPort.verify(), injects `UserIdentity` into the use case.
3. **Authorization checks happen in APPLICATION, not infrastructure** — use cases check roles/permissions BEFORE executing. Never trust the token alone.
4. **Pass `UserIdentity` to use cases as a parameter** — never as a global/static. Constructor injection for the port, method injection for the identity.
5. **Role/permission logic lives in DOMAIN** — `UserIdentity.hasRole()`, `Permission.can()` are domain concepts. Not strings scattered through code.

### Application Auth Flow

```typescript
class DeleteUserUseCase {
  constructor(private readonly authPort: AuthPort) {}

  execute(token: string, userIdToDelete: UserId): Result<void, ApplicationError> {
    // 1. Authenticate (infrastructure via port)
    const identity = this.authPort.verify(token)
    if (identity.isErr()) return err(new UnauthorizedError('Invalid token'))

    // 2. Authorize (application/domain logic)
    if (!identity.value.hasRole(Role.Admin)) {
      return err(new ForbiddenError('Only admins can delete users'))
    }

    // 3. Execute
    return this.userRepo.delete(userIdToDelete)
  }
}
```

### Infrastructure Auth Implementation

```typescript
// infrastructure/auth/jwt-auth.ts
class JwtAuth implements AuthPort {
  constructor(private readonly jwtService: JwtService) {}

  verify(token: string): Result<UserIdentity, AuthError> {
    try {
      const payload = this.jwtService.verify(token)
      return ok(UserIdentity.from(
        UserId.from(payload.sub),
        payload.roles.map(Role.from),
      ))
    } catch (e) {
      return err(new AuthError('Invalid or expired token'))
    }
  }
}
```

### Presentation Auth Middleware

```typescript
// presentation/middleware/auth.middleware.ts
function authMiddleware(authPort: AuthPort) {
  return (req: Request, res: Response, next: NextFunction) => {
    const token = req.headers.authorization?.replace('Bearer ', '')
    if (!token) return res.status(401).json({ error: 'missing_token' })

    const identity = authPort.verify(token)
    if (identity.isErr()) return res.status(401).json({ error: 'invalid_token' })

    req.currentUser = identity.value // Injected for use cases
    next()
  }
}
```

### Decision Gates

| Need | Action |
|------|--------|
| Verify identity | Call `AuthPort.verify()` from application layer |
| Check if user can do X | Use case checks `UserIdentity.roles` or `Permission` before proceeding |
| New auth provider (OAuth, SAML, magic link) | Implement `AuthPort` in `infrastructure/`. Application stays unchanged. |
| Role/permission change | Update `Role` or `Permission` domain types. No infrastructure changes. |
| Token refresh | Infrastructure concern. Implement in auth adapter, expose via `AuthPort`. |

### Password Handling (CRITICAL)

- NEVER store plain-text passwords
- NEVER log passwords or tokens
- Password hashing (bcrypt, argon2) lives in `infrastructure/auth/`
- Password validation rules live in `domain/value-objects/Password` VO
- Login rate limiting is infrastructure (middleware or gateway)

### Token Storage Rules

- Session tokens: httpOnly + secure + sameSite cookies. NEVER localStorage.
- JWTs: short expiry (15min access + 7day refresh max). NEVER store sensitive data in payload.
- API keys: hash before storing. Show once on creation.

## Execution Steps

1. Define `UserIdentity` and `Role` in domain (Value Objects).
2. Define `AuthPort` interface in application layer (verify, login methods).
3. Implement `AuthPort` in infrastructure (JWT, OAuth, etc. — tool-specific).
4. Create auth middleware in presentation that extracts token, calls verify, injects identity.
5. Add authorization checks in each use case that needs them (role/permission check BEFORE business logic).
6. Verify: infrastructure auth can be swapped without touching domain or application.

## Output Contract

Return: auth port interface, infrastructure implementation, UserIdentity VO, middleware, use case auth flow, and verification that swapping providers requires zero domain/application changes.

## References

- `clean-arch/SKILL.md` — auth providers go in infrastructure, ports in application
- `error-handling/SKILL.md` — AuthError, UnauthorizedError, ForbiddenError patterns
- `value-objects/SKILL.md` — UserId, Role, Password as VOs
