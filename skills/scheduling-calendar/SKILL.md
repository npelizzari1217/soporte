---
name: scheduling-calendar
description: "Trigger: schedule, calendar, agenda, cita, turno, appointment, horario, disponibilidad, fecha, reserva, time slot, recurring, recurrencia. Manage appointments, time slots, availability, and conflict detection."
license: Apache-2.0
metadata:
  author: gentleman-programming
  version: "1.0"
---

## Activation Contract

Apply these rules when implementing appointment scheduling, calendar views, time slot management, availability checking, or recurring events. Covers citas odontológicas, horarios escolares, vencimientos de facturas, programación de producción.

## Hard Rules

### Domain Models (domain-agnostic)

```typescript
// domain/entities/appointment.ts
// Un Appointment representa CUALQUIER tipo de evento agendado:
//   - Odontología: cita con el dentista
//   - Medicina general: consulta con el médico
//   - Colegios: clase, examen, reunión de padres
//   - Manufactura: programación de producción, mantenimiento de máquina
//   - Facturación: vencimiento, fecha de pago
class Appointment {
  private constructor(
    readonly id: AppointmentId,
    readonly entityType: EntityType,        // 'patient', 'student', 'production-order', 'client'
    readonly entityId: string,
    readonly resourceId: ResourceId,        // Who/what is being scheduled: doctor, consultorio, teacher, aula, machine, line
    readonly dateRange: DateTimeRange,      // Start + end, always as VO
    readonly status: AppointmentStatus,     // scheduled, confirmed, in_progress, completed, cancelled
    readonly recurringParentId?: RecurringId,
    readonly createdAt: Date,
  ) {}

  reschedule(newRange: DateTimeRange): Result<Appointment, ScheduleError> { ... }
  cancel(reason: string): Result<Appointment, ScheduleError> { ... }
  confirm(): Result<Appointment, ScheduleError> { ... }
}

// domain/value-objects/date-time-range.ts
class DateTimeRange {
  private constructor(
    readonly start: DateTime,
    readonly end: DateTime,
  ) {}

  static create(start: DateTime, end: DateTime): Result<DateTimeRange, RangeError> {
    if (end <= start) return err(new RangeError('End must be after start'))
    return ok(new DateTimeRange(start, end))
  }

  overlapsWith(other: DateTimeRange): boolean {
    return this.start < other.end && this.end > other.start
  }

  duration(): Duration {
    return this.end.difference(this.start)
  }
}
```

### Repository Port

```typescript
// application/ports/appointment-repository.port.ts
interface AppointmentRepositoryPort {
  findConflicts(resourceId: ResourceId, range: DateTimeRange): Result<Appointment[], RepositoryError>
  findByResourceAndDate(resourceId: ResourceId, date: Date): Result<Appointment[], RepositoryError>
  findByEntity(entityType: EntityType, entityId: string): Result<Appointment[], RepositoryError>
  save(appointment: Appointment): Result<void, RepositoryError>
  delete(id: AppointmentId): Result<void, RepositoryError>
}
```

### Non-Negotiable Rules

1. **Time ranges are Value Objects** — `DateTimeRange` with validation (end > start, sane duration). Never pass raw `start: Date, end: Date` pairs around.
2. **Conflict detection is DOMAIN logic** — `AppointmentRepositoryPort.findConflicts()` + `DateTimeRange.overlapsWith()` in the use case. Never let infrastructure decide what conflicts.
3. **Resource is the scheduling unit** — you schedule a `resourceId` (a doctor, a consultorio, a teacher, an aula, a machine, a生产线). The resource is what has availability. Resources are domain-specific, the scheduling PATTERN is not.
4. **Appointments NEVER overlap for the same resource** — unless explicitly designed as group events (taller, curso completo).
5. **Cancellation is NOT deletion** — cancelled appointments are retained for audit. Status changes to `cancelled` with reason. Never `DELETE FROM appointments`.
6. **Recurring events are a PARENT + CHILDREN model** — a parent template generates individual child appointments. Change the parent = propagate to future children. Past children are immutable.

### Scheduling Use Case

```typescript
class ScheduleAppointmentUseCase {
  constructor(
    private readonly appointmentRepo: AppointmentRepositoryPort,
  ) {}

  execute(dto: ScheduleAppointmentDTO): Result<AppointmentId, ApplicationError> {
    const range = DateTimeRange.create(dto.start, dto.end)
    if (range.isErr()) return err(new ValidationError(range.error.message))

    // 1. Check conflicts
    const conflicts = this.appointmentRepo.findConflicts(dto.resourceId, range.value)
    if (conflicts.isErr()) return err(new InfrastructureError('Error checking conflicts'))

    if (conflicts.value.length > 0) {
      return err(new ScheduleConflictError('El recurso ya tiene una cita en ese horario'))
    }

    // 2. Create appointment
    const appointment = Appointment.create({
      entityType: dto.entityType,
      entityId: dto.entityId,
      resourceId: dto.resourceId,
      dateRange: range.value,
      status: AppointmentStatus.Scheduled,
    })
    if (appointment.isErr()) return err(appointment.error)

    // 3. Save
    const saved = this.appointmentRepo.save(appointment.value)
    if (saved.isErr()) return err(new InfrastructureError('Error saving appointment'))

    return ok(appointment.value.id)
  }
}
```

### Recurring Events Model

```typescript
// domain/entities/recurring-template.ts
class RecurringTemplate {
  constructor(
    readonly id: RecurringId,
    readonly resourceId: ResourceId,
    readonly startTime: TimeOfDay,       // 09:00 — when does each instance start
    readonly duration: Duration,         // 60 minutes
    readonly pattern: RecurrencePattern, // daily, weekly, monthly
    readonly dayOfWeek?: number,         // for weekly: 1=Monday
    readonly endDate?: Date,             // when does recurrence stop
  ) {}

  generateInstances(from: Date, to: Date): DateTimeRange[] {
    // Calculate all occurrences within the range
    // Returns individual date ranges
  }
}
```

### Availability Queries

```typescript
class GetAvailableSlotsUseCase {
  execute(resourceId: ResourceId, date: Date, serviceDuration: Duration): Result<TimeSlot[], ApplicationError> {
    // 1. Get resource's working hours (from domain config)
    const workingHours = this.workingHoursRepo.findForResource(resourceId, date)
    // 2. Get existing appointments
    const appointments = this.appointmentRepo.findByResourceAndDate(resourceId, date)
    // 3. Subtract appointments from working hours → available slots
    const available = this.slotCalculator.availableSlots(workingHours, appointments, serviceDuration)
    return ok(available)
  }
}
```

### Domain Mapping (cómo usar el mismo patrón en cada sistema)

| Sistema | Entity | Resource | Statuses |
|---------|--------|----------|----------|
| Odontología / Medicina general | `Patient` | `Doctor`, `Consultorio` | Solicitada → Confirmada → En consulta → Atendida / Cancelada |
| Colegios | `Student`, `Course` | `Teacher`, `Aula` | Programada → En curso → Completada / Cancelada |
| Manufactura | `ProductionOrder` | `Machine`, `Linea` | Planificada → En producción → Completada / Cancelada |
| Facturación | `Invoice` | — (vencimiento fijo) | Vigente → Vencida / Cancelada |

El `Appointment` entity y los use cases son los MISMOS. Solo cambian los values de `entityType` y `resourceId`.

### Decision Gates
| Reschedule | Verify new time has no conflicts, update range, keep audit trail |
| Cancel | Change status to `cancelled`, store reason, keep record |
| Standing weekly cita | Use `RecurringTemplate` → generate individual child appointments |
| Show doctor's agenda | Query `findByResourceAndDate()`, group by day |
| Show patient history | Query `findByEntity('patient', patientId)` |
| Check if a time is free | `GetAvailableSlotsUseCase` returns available ranges |

### Time Zone Rules

- Store ALL dates in UTC. Always.
- Convert to user's/local time zone ONLY at presentation layer.
- `DateTimeRange` stores UTC internally. Presentation formats per locale.
- Clinic/office time zone is a config value, not hardcoded.

### Appointment Status Lifecycle

```
scheduled → confirmed → in_progress → completed
                ↘           ↘
              cancelled    cancelled
```

- Only `scheduled` and `confirmed` count as "occupied" for conflict detection.
- `cancelled` appointments are excluded from conflict checks but visible in history.
- `completed` means the appointment happened (e.g., la cita se realizó, la clase se dictó).
- Transitions are explicit methods on `Appointment` entity: `confirm()`, `cancel(reason)`, `complete()`.

### Duration Rules

- Minimum appointment duration: 15 minutes (configurable per resource type)
- Maximum appointment duration: 4 hours (configurable)
- Buffer between appointments: 5 minutes default (configurable per resource)
- Lunch breaks, non-working days: defined in resource's `WorkingHours` config

## Execution Steps

1. Define `DateTimeRange`, `AppointmentStatus`, `ResourceId`, `AppointmentId` as domain VOs.
2. Create `Appointment` entity with behavior (reschedule, cancel, confirm).
3. Define `AppointmentRepositoryPort` in application layer.
4. Create `ScheduleAppointmentUseCase` with conflict detection.
5. Create `GetAvailableSlotsUseCase` for availability queries.
6. Create `RecurringTemplate` for repeating events.
7. Implement repository adapter in infrastructure.
8. Verify: conflict detection is in domain/application, not in SQL queries.

## Output Contract

Return: Appointment entity, DateTimeRange VO, repository port, use cases (schedule, available slots, recurring), status lifecycle, and verification that conflict detection is pure domain logic.

## References

- `clean-arch/SKILL.md` — scheduling logic in domain/application, DB in infrastructure
- `value-objects/SKILL.md` — DateTimeRange, AppointmentId, ResourceId as VOs
- `error-handling/SKILL.md` — ScheduleConflictError, RangeError patterns
- `audit-log/SKILL.md` — appointment status changes tracked
- `messaging-notifications/SKILL.md` — reminder emails for upcoming appointments
