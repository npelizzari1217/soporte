---
name: audit-log
description: "Trigger: audit, auditoría, historial, history, log de cambios, tracking, trail, cambio, registro historico, who changed, changelog. Track entity changes with actor, action, before/after values, and timestamp."
license: Apache-2.0
metadata:
  author: gentleman-programming
  version: "1.0"
---

## Activation Contract

Apply these rules when tracking changes to domain entities — grades changed, appointments rescheduled, invoices cancelled, stock adjusted, odontogram modified. Provides a queryable history with full accountability.

## Hard Rules

### Audit Entry Model

```typescript
class AuditEntry {
  private constructor(
    readonly id: AuditEntryId,
    readonly entityType: string,          // 'student', 'invoice', 'appointment', 'product'
    readonly entityId: string,             // ID of the changed entity
    readonly action: AuditAction,          // 'created', 'updated', 'deleted', 'status_changed'
    readonly actorId: UserId,              // Who did it
    readonly actorType: ActorType,         // 'user', 'system', 'integration'
    readonly changes: Change[],            // What changed
    readonly reason?: string,              // Why (cancellation reason, etc.)
    readonly timestamp: Date,
    readonly metadata?: Record<string, unknown>, // IP, user-agent, correlation-id
  ) {}

  static record(props: AuditRecordProps): Result<AuditEntry, AuditError> {
    // Validate: at least one change or a reason must exist
    // Timestamp is set to now (cannot be backdated)
  }
}

interface Change {
  field: string         // 'grade.value', 'status', 'price.amount'
  oldValue: unknown     // Previous value (null if created)
  newValue: unknown     // New value (null if deleted)
  valueType: string     // 'string', 'number', 'money', 'status'
}
```

### Audit Port (Application Layer)

```typescript
// application/ports/audit-log.port.ts
interface AuditLogPort {
  record(entry: AuditEntry): Result<void, AuditError>
  findByEntity(entityType: string, entityId: string): Result<AuditEntry[], AuditError>
  findByActor(actorId: UserId, options?: AuditQuery): Result<AuditEntry[], AuditError>
  findByDateRange(from: Date, to: Date, options?: AuditQuery): Result<AuditEntry[], AuditError>
  findByAction(entityType: string, action: AuditAction): Result<AuditEntry[], AuditError>
}

interface AuditQuery {
  limit?: number
  offset?: number
  fromDate?: Date
  toDate?: Date
  entityType?: string
}
```

### Non-Negotiable Rules

1. **Audit is a SIDE EFFECT, not primary logic** — recording an audit entry NEVER blocks the operation. If audit fails, log the error but DON'T roll back the primary operation. Use domain events + async handler.
2. **Actor is ALWAYS required** — every audit entry MUST have an actor. Unknown actor = `actorType: 'system'`. Never allow `null` actor.
3. **Only log meaningful changes** — if a field changes from `null` to `null` or `undefined` to `undefined`, skip it. Log only actual value transitions.
4. **Structured changes, not free-text** — `{ field, oldValue, newValue }`, never a string like "El usuario cambió la nota de Juan". That's for display, not audit.
5. **Audit entries are IMMUTABLE** — once written, NEVER update or delete. Correction = a new audit entry that says "corrected field X from A to B".
6. **Sensitive data masking** — NEVER log passwords, tokens, or PII in `oldValue`/`newValue`. Mask or exclude fields marked as `@Sensitive` on the entity.

### Domain Events → Audit Wiring

```typescript
// domain/events/grade-changed.event.ts
class GradeChangedEvent implements DomainEvent {
  constructor(
    readonly studentId: StudentId,
    readonly subject: Subject,
    readonly oldGrade: Grade,
    readonly newGrade: Grade,
    readonly changedBy: UserId,
    readonly reason: string,
    readonly occurredAt: Date,
  ) {}
}

// application/event-handlers/audit-grade-changed.handler.ts
class AuditGradeChangedHandler {
  constructor(private readonly auditLog: AuditLogPort) {}

  handle(event: GradeChangedEvent): void {
    const entry = AuditEntry.record({
      entityType: 'grade',
      entityId: event.studentId.toString(),
      action: AuditAction.Updated,
      actorId: event.changedBy,
      changes: [{
        field: 'grade.value',
        oldValue: event.oldGrade.value(),
        newValue: event.newGrade.value(),
        valueType: 'number',
      }],
      reason: event.reason,
      timestamp: event.occurredAt,
    })

    const result = this.auditLog.record(entry)
    if (result.isErr()) {
      // Log error but DON'T throw — audit failure never blocks the operation
      logger.error('Failed to record audit entry', result.error)
    }
  }
}
```

### Using Audit in Practice

```typescript
class UpdateGradeUseCase {
  constructor(
    private readonly gradeRepo: GradeRepository,
    private readonly eventBus: EventBus,  // Domain events
  ) {}

  execute(dto: UpdateGradeDTO): Result<void, ApplicationError> {
    const grade = this.gradeRepo.findById(dto.gradeId)
    if (grade.isErr()) return err(new NotFoundError('Grade not found'))

    const oldValue = grade.value.value

    const updated = grade.value.update(dto.newValue)
    if (updated.isErr()) return err(updated.error)

    const saved = this.gradeRepo.save(updated.value)
    if (saved.isErr()) return err(new InfrastructureError('Failed to save'))

    // Emit event → audit handler records it asynchronously
    this.eventBus.publish(new GradeChangedEvent(
      grade.value.studentId,
      grade.value.subject,
      oldValue,
      dto.newValue,
      dto.actorId,
      dto.reason,
      new Date(),
    ))

    return ok(undefined)
  }
}
```

### Entity Types to Audit (domain-agnostic — mismos patrones)

| Sistema | Entity Types | Key Events to Track |
|---------|-------------|-------------------|
| Colegios | `student`, `grade`, `attendance`, `enrollment` | Nota cambiada, alumno matriculado/retirado, presente/ausente corregido |
| Facturación | `invoice`, `product`, `stock-movement`, `price` | Factura emitida/anulada, precio modificado, stock ajustado |
| Odontología / Medicina general | `appointment`, `odontogram`, `treatment`, `xray`, `prescription` | Cita reprogramada/cancelada, odontograma modificado, radiografía subida, receta emitida |
| Manufactura | `product`, `stock`, `production-order`, `blueprint` | Plano actualizado, orden de producción cambiada, stock ajustado |

### Audit Query API (Presentation)

```typescript
// GET /api/v1/audit?entityType=grade&entityId=student-123&limit=50
class AuditController {
  constructor(private readonly auditLog: AuditLogPort) {}

  query(req: Request, res: Response): void {
    const result = this.auditLog.findByEntity(req.query.entityType, req.query.entityId)
    if (result.isErr()) return res.status(500).json(...)

    res.json({
      data: result.value.map(entry => ({
        id: entry.id,
        action: entry.action,
        actor: entry.actorId,
        changes: entry.changes,
        reason: entry.reason,
        timestamp: entry.timestamp,
      }))
    })
  }
}
```

### Decision Gates

| Situation | Action |
|-----------|--------|
| Grade value changed | Emit `GradeChangedEvent` → audit records old/new value + reason + who |
| Appointment rescheduled | Emit `AppointmentRescheduledEvent` → audit records old/new date range |
| Invoice cancelled | Emit `InvoiceCancelledEvent` → audit records reason + who authorized |
| Stock adjusted | Emit `StockAdjustedEvent` → audit records old/new quantity + reason |
| User profile updated | Emit `ProfileUpdatedEvent` → audit records which fields changed |
| User views history | Query `AuditLogPort.findByEntity()` for the entity |

### Storage Considerations

- Audit logs grow fast — partition by month or use a time-series approach
- Keep audit data in a SEPARATE table/collection from operational data
- Retention: archive audit logs older than 2 years to cold storage
- Index: `(entityType, entityId, timestamp)` — this is your primary query path
- Consider append-only log (WORM) for compliance — never allow deletion

### What NOT to Audit

- Read operations (GET requests) — unless they access sensitive data
- Internal cron jobs without meaningful state change
- Search queries
- User session data (login/logout timestamps are OK, page views are not)

## Execution Steps

1. Define `AuditEntry`, `Change`, `AuditAction`, `AuditEntryId` in domain.
2. Define `AuditLogPort` interface in application layer.
3. Create domain events for each entity mutation that needs tracking.
4. Create event handlers that call `AuditLogPort.record()`.
5. Wire the handlers in the DI container.
6. Implement the repository/adapter in infrastructure (DB table for audit).
7. Create the audit query controller in presentation.
8. Verify: audit failure never blocks the primary operation, changes are structured, no PII leaked.

## Output Contract

Return: AuditEntry entity, AuditLogPort, domain events and handlers, audit query endpoint, and verification that audit is a non-blocking side effect with structured changes.

## References

- `clean-arch/SKILL.md` — audit port in application, storage in infrastructure
- `value-objects/SKILL.md` — AuditEntryId, AuditAction, UserId as VOs
- `error-handling/SKILL.md` — audit errors logged but never propagated
- `file-storage/SKILL.md` — audit file access (who downloaded/ viewed a file)
