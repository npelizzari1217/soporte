# Skill Registry

**Delegator use only.** The orchestrator reads this registry to resolve compact rules and injects them into sub-agent prompts.

## User Skills

| Trigger | Skill | Path |
|---------|-------|------|
| clean architecture, clean arch, capas, hexagonal, DDD, layers | clean-arch | ~/.config/opencode/skills/clean-arch/SKILL.md |
| value object, VO, tipos fuertes, domain primitive, valor | value-objects | ~/.config/opencode/skills/value-objects/SKILL.md |
| repository, repositorio, persistencia, data access, ORM | repository-pattern | ~/.config/opencode/skills/repository-pattern/SKILL.md |
| NestJS, Nest, módulo, controller, provider, DI | nestjs-modules | ~/.config/opencode/skills/nestjs-modules/SKILL.md |
| Expo, React Native, Tamagui, mobile, UI, estilo | expo-tamagui | ~/.config/opencode/skills/expo-tamagui/SKILL.md |
| Tauri, desktop, escritorio, nativo, WebView, tray | tauri-v2 | ~/.config/opencode/skills/tauri-v2/SKILL.md |

## Compact Rules

### clean-arch
- `domain/` imports NOTHING outside itself. `application/` imports `domain/` ONLY. `infrastructure/` imports `domain/` + `application/` ONLY. `presentation/` imports `application/` ONLY.
- Entities have behavior — no anemic domain. Value Objects are immutable, self-validating, compared by value.
- Use Cases: one class = one use case. Single `execute()` method. Ports defined in `application/` or `domain/`, implemented in `infrastructure/`.
- DTOs in `application/` for cross-layer data. Never expose domain entities outside `application/`.
- Domain tests have ZERO infrastructure. Application tests mock ports.
- Dependency injection wiring belongs in `infrastructure/`. Constructor injection everywhere.

### value-objects
- `private readonly` fields. No setters. No mutation. Factory method (`static create()`) returns `Result` or throws typed errors.
- Implement `equals()` (value comparison), `get()` (raw primitive), `toString()`.
- Validation INSIDE the VO, not in controllers or use cases. Keep validation focused on the value's invariants, not business rules.
- Shared VOs (Email, Money, UserId) live in a shared package used by every context.

### repository-pattern
- Repository interface defined in `domain/` as a port. Implementation in `infrastructure/`.
- Repository methods speak the domain language: `findByEmail()`, `save()`, not `insertIntoTable()`.
- Return domain entities, not ORM models. The implementation maps between ORM and domain.
- One repository per aggregate root. Do NOT create repositories for every table.
- Tests: mock the interface for domain/application tests. Test the implementation with real DB.

### nestjs-modules
- Controllers in `presentation/`, use cases in `application/`, repo impls in `infrastructure/`. Modules wire them together.
- Use cases are plain classes with `execute()`. No `@Injectable()`, no NestJS decorators in domain.
- Repository injection uses `Symbol` tokens, not classes. `@Inject(USERS_REPOSITORY)` in controllers.
- No `@Injectable()` in domain entities or VOs. Domain is pure TypeScript.
- Circular imports = design smell. Extract shared deps into a new module.

### expo-tamagui
- Design tokens in `tamagui/config.ts`. Never hardcode colors, spacing, or fonts.
- `styled()` with theme tokens for all components. No inline styles. No `useWindowDimensions()` — use responsive props.
- Platform-specific files (`.native.tsx`/`.web.tsx`) only for BEHAVIOR differences, never for visual.
- Shared types from `@compartido` — do NOT redefine domain types in the Expo project.
- Expo Router for navigation. Never use React Navigation directly.

### tauri-v2
- Tauri is a native SHELL, not the app. Business logic stays in the web app.
- IPC via `invoke()` only. No Rust web server, no DOM manipulation from Rust.
- Feature-detect with `__TAURI_INTERNALS__`. The web app must work in both browser and Tauri.
- Prefer official Tauri plugins over custom Rust code (dialog, fs, notification, shell).
- Minimum capability permissions. No wildcard `*` in production.
- No React components in Rust. Rust returns data, web app renders it.

## Project Conventions

*(Add project-specific convention files here when the project is initialized)*
