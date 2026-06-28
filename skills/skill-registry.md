# Skill Registry — soporte

<!-- VENDORIZADO en el repo: los SKILL.md viven en ./skills/ y los Path de la tabla son RELATIVOS a la raíz del repo, para que viajen con el git clone a cualquier máquina. NO regenerar con `gentle-ai skill-registry refresh` (eso escribe en .atl/ con paths absolutos y NO está versionado). Si cambian las skills, re-vendorizar: copiar ~/.config/opencode/skills/. a ./skills/ y volver a relativizar los Path. -->

## Contract

**Delegator use only.** This registry is an index, not a summary. Any agent that launches subagents reads it to select relevant skills, then passes exact `SKILL.md` paths for the subagent to read before work.

`SKILL.md` remains the source of truth. Do not inject generated summaries or compact rules by default; pass paths so subagents load the full runtime contract and preserve author intent.

## Skills

| Skill | Trigger / description | Scope | Path |
| --- | --- | --- | --- |
| `api-design` | Trigger: API, REST, RESTful, endpoint, endpoint design, controller, route, HTTP, web service, API contract, OpenAPI, Swagger. Design consistent RESTful APIs with contracts, validation, and standard responses. | user | `skills/api-design/SKILL.md` |
| `audit-log` | Trigger: audit, auditoría, historial, history, log de cambios, tracking, trail, cambio, registro historico, who changed, changelog. Track entity changes with actor, action, before/after values, and timestamp. | user | `skills/audit-log/SKILL.md` |
| `auth-access` | Trigger: auth, autenticación, autorización, access control, login, JWT, RBAC, seguridad, acceso, permissions, roles. Implement authN/authZ with Clean Architecture — providers are infrastructure. | user | `skills/auth-access/SKILL.md` |
| `branch-pr` | Create Gentle AI pull requests with issue-first checks. Trigger: creating, opening, or preparing PRs for review. | user | `skills/branch-pr/SKILL.md` |
| `chained-pr` | Trigger: PRs over 400 lines, stacked PRs, review slices. Split oversized changes into chained PRs that protect review focus. | user | `skills/chained-pr/SKILL.md` |
| `clean-arch` | Trigger: clean architecture, clean arch, capas, capas de dominio, hexagonal, arquitectura limpia, domain-driven, DDD, layers. Apply pure Clean Architecture dependency rules — no tool-specific bindings. | user | `skills/clean-arch/SKILL.md` |
| `cognitive-doc-design` | Design docs that reduce cognitive load. Trigger: writing guides, READMEs, RFCs, onboarding, architecture, or review-facing docs. | user | `skills/cognitive-doc-design/SKILL.md` |
| `comment-writer` | Write warm, direct collaboration comments. Trigger: PR feedback, issue replies, reviews, Slack messages, or GitHub comments. | user | `skills/comment-writer/SKILL.md` |
| `data-access` | Trigger: data access, acceso a datos, online, offline, cache, sync, local DB, SQLite, base de datos local, API, repository remoto, conectividad, persistencia, netinfo. Abstract data access so the same use case works via direct DB (backend), remote API (web), or local cache (mobile). | user | `skills/data-access/SKILL.md` |
| `error-handling` | Trigger: error handling, errores, Result type, manejo de errores, domain errors, error mapping, try catch. Handle errors consistently with Result types and domain-driven error patterns. | user | `skills/error-handling/SKILL.md` |
| `expo-tamagui` | Trigger: Expo, React Native, Tamagui, NativeWind, mobile, iOS, Android, app, UI cross-platform, estilo compartido. Build cross-platform UI with shared styles — one design system for mobile, web, and desktop. | user | `skills/expo-tamagui/SKILL.md` |
| `file-storage` | Trigger: file, archivo, upload, subir, imagen, PDF, imagen, storage, almacenamiento, S3, file system, multimedia, documento adjunto. Handle file uploads, storage, serving, and cleanup with Clean Architecture. | user | `skills/file-storage/SKILL.md` |
| `go-testing` | Trigger: Go tests, go test coverage, Bubbletea teatest, golden files. Apply focused Go testing patterns. | user | `skills/go-testing/SKILL.md` |
| `issue-creation` | Create Gentle AI issues with issue-first checks. Trigger: creating GitHub issues, bug reports, or feature requests. | user | `skills/issue-creation/SKILL.md` |
| `judgment-day` | Trigger: judgment day, dual review, adversarial review, juzgar. Run blind dual review, fix confirmed issues, then re-judge. | user | `skills/judgment-day/SKILL.md` |
| `messaging-notifications` | Trigger: email, notificación, push notification, websocket, mensajería, SMS, sendgrid, mail, SES, twilio, real-time, chat. Abstract messaging and notifications behind ports — providers are swappable infrastructure. | user | `skills/messaging-notifications/SKILL.md` |
| `nestjs-modules` | Trigger: NestJS, Nest, módulo, module, controller, provider, @Module, decorator, inyección de dependencias, DI. Structure NestJS modules following Clean Architecture — modules are wiring, not layers. | user | `skills/nestjs-modules/SKILL.md` |
| `reporting-documents` | Trigger: report, PDF, boletin, boletín, factura, recibo, documento, odontograma, certificado, pdf generation, reporte, planilla, remito. Generate structured documents (PDFs, spreadsheets) with templates and data aggregation. | user | `skills/reporting-documents/SKILL.md` |
| `repository-pattern` | Trigger: repository, repositorio, persistencia, data access, DAO, ORM, storage, database, DB. Abstract data persistence behind domain interfaces — infrastructure stays replaceable. | user | `skills/repository-pattern/SKILL.md` |
| `scheduling-calendar` | Trigger: schedule, calendar, agenda, cita, turno, appointment, horario, disponibilidad, fecha, reserva, time slot, recurring, recurrencia. Manage appointments, time slots, availability, and conflict detection. | user | `skills/scheduling-calendar/SKILL.md` |
| `skill-creator` | Trigger: new skills, agent instructions, documenting AI usage patterns. Create LLM-first skills with valid frontmatter. | user | `skills/skill-creator/SKILL.md` |
| `tauri-v2` | Trigger: Tauri, Tauri v2, desktop, escritorio, empaquetar, nativo, Rust, WebView, tray, menú, sistema. Package a web app into a lightweight Tauri v2 desktop shell — native APIs, tiny installer, no Electron bloat. | user | `skills/tauri-v2/SKILL.md` |
| `ui-patterns` | Trigger: UI, button, botón, formulario, form, input, list, browser, combobox, select, tabla, table, modal, dialog, componente, layout. Apply framework-agnostic UI patterns — copy into each project and bind to its framework. | user | `skills/ui-patterns/SKILL.md` |
| `value-objects` | Trigger: value object, VO, tipos fuertes, domain primitive, self-validating, valor, value type. Model immutable self-validating Value Objects for domain-driven TypeScript. | user | `skills/value-objects/SKILL.md` |
| `work-unit-commits` | Plan commits as reviewable work units. Trigger: implementation, commit splitting, chained PRs, or keeping tests and docs with code. | user | `skills/work-unit-commits/SKILL.md` |

## Loading protocol

1. Match task context and target files against the `Trigger / description` column.
2. Pass only the matching `Path` values to the subagent under `## Skills to load before work`.
3. Instruct the subagent to read those exact `SKILL.md` files before reading, writing, reviewing, testing, or creating artifacts.
4. If no matching skill exists, proceed without project skill injection and report `skill_resolution: none`.
