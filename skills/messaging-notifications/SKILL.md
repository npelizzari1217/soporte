---
name: messaging-notifications
description: "Trigger: email, notificación, push notification, websocket, mensajería, SMS, sendgrid, mail, SES, twilio, real-time, chat. Abstract messaging and notifications behind ports — providers are swappable infrastructure."
license: Apache-2.0
metadata:
  author: gentleman-programming
  version: "1.0"
---

## Activation Contract

Apply these rules when sending emails, push notifications, SMS, real-time messages (WebSocket), or in-app notifications. Ensures messaging providers can be swapped without touching business logic.

## Hard Rules

### Channel Separation

Each messaging channel has its OWN port. Never use a monolithic `NotificationService`:

```typescript
application/ports/
  email-sender.port.ts       # Transactional emails (citas, facturas, boletines)
  push-sender.port.ts        # Push notifications (mobile app)
  realtime-messenger.port.ts # WebSocket chat (web ↔ mobile)
  in-app-notifier.port.ts    # In-app notification center
  sms-sender.port.ts         # SMS alerts (future-proof)
```

### Email Port (example)

```typescript
// application/ports/email-sender.port.ts
interface EmailSenderPort {
  send(email: EmailMessage): Result<void, EmailError>
}

interface EmailMessage {
  to: Email
  subject: string
  body: EmailBody
  attachments?: Attachment[]
}

type EmailBody =
  | { type: 'text'; content: string }
  | { type: 'html'; content: string }
  | { type: 'template'; name: string; data: Record<string, unknown> }
```

### Real-Time Messenger Port (web ↔ mobile)

```typescript
// application/ports/realtime-messenger.port.ts
interface RealtimeMessengerPort {
  sendToUser(userId: UserId, message: ChatMessage): Result<void, MessagingError>
  sendToRoom(roomId: RoomId, message: ChatMessage): Result<void, MessagingError>
  createRoom(participants: UserId[]): Result<RoomId, MessagingError>
}

interface ChatMessage {
  id: MessageId
  senderId: UserId
  content: string
  type: 'text' | 'image' | 'file'
  timestamp: Date
}
```

### Non-Negotiable Rules

1. **Providers are infrastructure** — SendGrid, SES, Firebase Push, Pusher, Socket.IO are ALL adapter implementations. Application only knows the port interface.
2. **Templates live in infrastructure** — email templates, push notification templates are `.hbs` files or similar. Application references them by name with data.
3. **NEVER hardcode provider config in application code** — `SENDGRID_API_KEY`, `AWS_REGION` are env vars read by infrastructure adapters. Zero provider config in domain/application.
4. **Transactional emails are fire-and-forget with retry** — sending an email NEVER blocks the response. Queue it. If it fails, retry with backoff. Report failure asynchronously.
5. **Real-time messaging is persisted in application** — WebSocket is transport. Messages MUST be stored in DB. Socket.IO disconnects, messages don't disappear.
6. **Notification preferences live in domain** — "user wants email but not push" is a domain concept (`NotificationPreference` VO on `User` entity).

### Email Use Case Pattern

```typescript
class SendAppointmentReminderUseCase {
  constructor(
    private readonly emailSender: EmailSenderPort,
    private readonly appointmentRepo: AppointmentRepository,
  ) {}

  execute(appointmentId: AppointmentId): Result<void, ApplicationError> {
    const appointment = this.appointmentRepo.findById(appointmentId)
    if (appointment.isErr()) return err(new NotFoundError())

    const patient = appointment.value.patient

    const email: EmailMessage = {
      to: patient.email,
      subject: `Recordatorio: ${appointment.value.date.formatted()}`,
      body: {
        type: 'template',
        name: 'appointment-reminder',
        data: {
          patientName: patient.name,
          date: appointment.value.date.formatted(),
          doctorName: appointment.value.doctorName,
          location: appointment.value.location,
        },
      },
    }

    return this.emailSender.send(email)
  }
}
```

### Email Template Organization

```
infrastructure/
  email-templates/
    appointment-reminder/
      subject.hbs      # "Recordatorio: {{date}}"
      body.hbs         # Full HTML email
      preview.txt      # Plain text fallback
    invoice/
      subject.hbs
      body.hbs
```

### Real-Time Chat Architecture

```
┌──────────┐     WebSocket      ┌──────────────┐
│   Web    │ ◄──────────────►   │              │
│  (React) │                    │  Server (WS) │
└──────────┘                    │              │
                                │  Adapter     │
┌──────────┐     WebSocket      │  (Socket.IO) │
│  Mobile  │ ◄──────────────►   │              │
│  (Expo)  │                    └──────┬───────┘
└──────────┘                           │
                             Port: RealtimeMessengerPort
                                       │
                              ┌────────▼───────┐
                              │  Application    │
                              │  (casos de uso) │
                              └────────┬───────┘
                                       │
                              ┌────────▼───────┐
                              │  Infrastructure │
                              │  (DB persist)   │
                              └─────────────────┘
```

### Push Notification Port

```typescript
// application/ports/push-sender.port.ts
interface PushSenderPort {
  send(deviceToken: DeviceToken, notification: PushNotification): Result<void, PushError>
  broadcast(topic: string, notification: PushNotification): Result<void, PushError>
}

interface PushNotification {
  title: string
  body: string
  data?: Record<string, unknown>  // Deep link payload
  badge?: number
}
```

### Notification Preferences (Domain)

```typescript
// domain/value-objects/notification-preference.ts
class NotificationPreferences {
  private constructor(
    readonly emailEnabled: boolean,
    readonly pushEnabled: boolean,
    readonly smsEnabled: boolean,
  ) {}

  static default(): NotificationPreferences {
    return new NotificationPreferences(true, true, false)
  }

  canSend(channel: NotificationChannel): boolean {
    switch (channel) {
      case 'email': return this.emailEnabled
      case 'push': return this.pushEnabled
      case 'sms': return this.smsEnabled
    }
  }
}
```

### Decision Gates

| Situation | Action |
|-----------|--------|
| Send transactional email | Queue → `EmailSenderPort.send()` with template reference |
| User wants chat with doctor | `RealtimeMessengerPort.createRoom()` → persist messages → send via WebSocket |
| Send push to mobile | `PushSenderPort.send()` with device token from user profile |
| User changes notification prefs | Update `NotificationPreferences` VO on user entity |
| New email provider (SendGrid → SES) | New adapter implementing `EmailSenderPort`. Zero app changes. |
| Bulk notification (comunicado a todos los padres) | Queue per-user jobs, respect each user's `NotificationPreferences` |
| Email bounces | Webhook → infrastructure adapter → notify application → flag user email |

### Retry and Error Handling

- Email/Push/SMS failures: retry 3 times with exponential backoff (1min, 5min, 30min)
- After all retries exhausted: log with full context, notify admin (don't silently drop)
- Real-time messaging failures: never retry messages — sender sees "delivered" only when recipient confirms receipt (at-least-once delivery semantics)
- Rate-limited by provider: queue and throttle, never drop

### Security Rules

- Never expose user email/phone in WebSocket messages
- Chat messages: validate content length, sanitize HTML, scan for malicious links
- Device tokens: store encrypted in DB, never log them
- Email sender: validate recipient email exists and has not bounced before sending

## Execution Steps

1. Identify the messaging channel (email, push, real-time, in-app, SMS).
2. Define the port interface in `application/ports/`.
3. Implement the adapter in `infrastructure/` for the chosen provider.
4. Create the use case that calls the port.
5. Add templates in the infrastructure template directory (for templated channels).
6. Wire notification preferences from user domain entity.
7. Verify: provider can be swapped by changing only the adapter file. Application never references the provider.

## Output Contract

Return: port interfaces, infrastructure adapters, templates, use cases, real-time wiring, and verification that swapping providers requires zero application changes.

## References

- `clean-arch/SKILL.md` — ports in application, adapters in infrastructure
- `error-handling/SKILL.md` — EmailError, MessagingError patterns with retry
- `file-storage/SKILL.md` — attachment handling in emails
- `value-objects/SKILL.md` — Email, DeviceToken, MessageId as VOs
- `reporting-documents/SKILL.md` — send generated documents via email
