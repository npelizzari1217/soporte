---
name: api-design
description: "Trigger: API, REST, RESTful, endpoint, endpoint design, controller, route, HTTP, web service, API contract, OpenAPI, Swagger. Design consistent RESTful APIs with contracts, validation, and standard responses."
license: Apache-2.0
metadata:
  author: gentleman-programming
  version: "1.0"
---

## Activation Contract

Apply these rules when designing API endpoints, controllers, routes, request/response contracts, or API documentation. Ensures every API in the project follows the same consistent patterns.

## Hard Rules

### RESTful Resource Naming

```
GET    /users              → List users
POST   /users              → Create user
GET    /users/:id          → Get user by ID
PATCH  /users/:id          → Partial update user
DELETE /users/:id          → Delete user
GET    /users/:id/orders   → Sub-resource: user's orders

NO verbs in URLs:  /getUsers ✗  /createUser ✗  /deleteUserById ✗
NO /api prefix unless behind a gateway that requires it
NO trailing slashes:  /users/ ✗
```

### Standard Response Envelope

**Success (single):**
```json
{
  "data": { "id": "abc", "email": "user@example.com" }
}
```

**Success (list):**
```json
{
  "data": [{ "id": "abc", "email": "user@example.com" }],
  "pagination": {
    "page": 1,
    "pageSize": 20,
    "total": 142,
    "totalPages": 8
  }
}
```

**Error:**
```json
{
  "error": {
    "code": "validation_error",
    "message": "Email is invalid",
    "details": [{ "field": "email", "issue": "must contain @" }]
  }
}
```

### HTTP Status Code Rules

| Code | When | Example |
|------|------|---------|
| 200 | Success with body | GET, PATCH |
| 201 | Created | POST |
| 204 | Success, no body | DELETE |
| 400 | Validation error / bad request | Invalid input |
| 401 | Unauthenticated | Missing/invalid token |
| 403 | Authenticated but not authorized | Wrong role |
| 404 | Resource not found | Invalid ID |
| 409 | Conflict | Duplicate email |
| 422 | Unprocessable entity | Business rule violation |
| 429 | Rate limited | Too many requests |
| 500 | Unexpected error | NEVER leak details |
| 503 | Service unavailable | Downstream failure |

NEVER return 200 with `{ error: ... }`. Use the correct status code.

### Request Validation

Validation happens at TWO levels:

1. **Transport validation (presentation)** — shape of the request. Use DTOs/Schemas with Zod, class-validator, or similar.
2. **Domain validation (domain)** — business rules. Value Objects self-validate.

```typescript
// presentation/dtos/create-user.dto.ts — transport validation
const CreateUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(2).max(100),
  age: z.number().int().min(0).max(150),
})
type CreateUserDTO = z.infer<typeof CreateUserSchema>

// Controller validates transport, then delegates
function createUser(req: Request, res: Response) {
  const parsed = CreateUserSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({
      error: { code: 'validation_error', details: parsed.error.flatten() }
    })
  }

  const result = this.createUserUseCase.execute(parsed.data)
  return handleResult(result, res)
}
```

### Controller Structure

Controllers are THIN — validate request, call use case, map response. NO business logic.

```typescript
class UsersController {
  constructor(private readonly createUserUseCase: CreateUserUseCase) {}

  async create(req: Request, res: Response): Promise<void> {
    // 1. Validate transport
    const dto = validate(CreateUserSchema, req.body)
    // 2. Call use case
    const result = await this.createUserUseCase.execute(dto)
    // 3. Map to HTTP response
    respond(res, StatusCode.Created, result)
  }
}
```

### Pagination, Filtering, Sorting

**Request:**
```
GET /users?page=1&pageSize=20&sort=createdAt:desc&filter=status:active
```

**Response:**
```json
{
  "data": [],
  "pagination": {
    "page": 1,
    "pageSize": 20,
    "total": 142,
    "totalPages": 8
  }
}
```

Rules:
- `page` starts at 1 (not 0)
- `pageSize` has a MAX (default 20, max 100)
- Sort format: `field:direction` (default `createdAt:desc`)
- Filter format: `field:value` separated by `,` for AND, or use `field:value1,value2` for OR

### API Versioning

- Use URL prefix versioning: `/v1/users`, `/v2/users`
- Never remove a version without a deprecation notice (at least 1 major cycle)
- Internal breaking changes get a new version
- Backward-compatible additions do NOT require a version bump

### OpenAPI / Documentation

Every endpoint MUST be documented. Keep the spec close to the code:
- Use `zod-to-openapi` or `@nestjs/swagger` decorators
- Document: summary, parameters, request body, response schemas, error codes
- Keep the spec file in `presentation/openapi/` or co-located with controllers

### Decision Gates

| Situation | Action |
|-----------|--------|
| New resource | Create CRUD endpoints with RESTful naming |
| Complex query | Use GET with query parameters, NOT POST with body |
| Mutation with side effects | Use POST (not PATCH) — PATCH is for partial updates only |
| File upload | POST with `multipart/form-data`. Return file ID/URL. |
| Bulk operation | POST to `/resources/bulk` with array body, or use async job pattern |
| Webhook/callback | POST to callback URL, include event type + payload, retry on failure |

## Execution Steps

1. Design the resource URL and HTTP method following RESTful naming.
2. Define the request DTO with transport validation (Zod or similar).
3. Define the response type (success + error envelopes).
4. Create the controller: validate → call use case → map result → respond.
5. Document the endpoint in OpenAPI.
6. Verify: no business logic in controller, correct status codes, consistent envelope.

## Output Contract

Return: controller, DTOs, response types, OpenAPI documentation, and verification that the endpoint follows all API design rules (naming, status codes, envelope, validation layers).

## References

- `error-handling/SKILL.md` — Result type for use case responses, error mapping at presentation
- `clean-arch/SKILL.md` — controllers are presentation layer, use cases are application layer
- `auth-access/SKILL.md` — auth middleware protects endpoints
