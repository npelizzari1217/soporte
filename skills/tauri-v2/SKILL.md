---
name: tauri-v2
description: "Trigger: Tauri, Tauri v2, desktop, escritorio, empaquetar, nativo, Rust, WebView, tray, menú, sistema. Package a web app into a lightweight Tauri v2 desktop shell — native APIs, tiny installer, no Electron bloat."
license: Apache-2.0
metadata:
  author: gentleman-programming
  version: "1.0"
---

## Activation Contract

Apply when creating or modifying a Tauri v2 desktop wrapper for an existing web/mobile app (Expo web build, Next.js, or plain React). The web app is the UI — Tauri is the native shell.

## Hard Rules

### Architecture

```
/src-tauri/              # Rust backend (Tauri)
├── src/
│   ├── lib.rs           # Plugin registration, setup
│   ├── commands/        # #[tauri::command] handlers
│   ├── tray/            # System tray (if used)
│   └── menu/            # Native menu bar (if used)
├── capabilities/        # Tauri v2 capability permissions
├── icons/               # App icons (.ico, .icns, .png)
├── Cargo.toml
└── tauri.conf.json      # Tauri config

/web-dist/               # Built web app (Expo web build output)
                         # Pointed to by tauri.conf.json > build > devUrl / frontendDist
```

### Tauri Is a Shell, NOT the App

- **Business logic lives in the web app** (React/Expo), NOT in Rust.
- **Rust is for native APIs only**: file system, notifications, system tray, shortcuts, window management.
- **No Rust web server** — Tauri embeds a WebView, not a server. Use Tauri commands to communicate, not HTTP.
- **IPC via `invoke()`**: the web app calls Rust commands via `@tauri-apps/api` `invoke()`, never directly.

### Tauri Commands Pattern

```rust
// src-tauri/src/commands/file_commands.rs
#[tauri::command]
fn read_file(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| e.to_string())
}
```

```typescript
// Web app side
import { invoke } from '@tauri-apps/api/core'

const content = await invoke<string>('read_file', { path: '/home/user/file.txt' })
```

Rules:
- Commands are thin — delegate to Rust std lib or plugins. No business logic.
- Command args and return types are simple: primitives, `String`, `Vec`, `struct` with serde. Complex data stays in the web app.
- Errors return `Result<T, String>`. The web app handles presentation of errors.

### Capabilities (Tauri v2)

Tauri v2 uses a capability-based permission system:

```json
// src-tauri/capabilities/default.json
{
  "identifier": "default",
  "description": "Default capabilities",
  "windows": ["main"],
  "permissions": [
    "core:default",
    "dialog:default",
    "fs:default",
    "shell:allow-open"
  ]
}
```

- Grant MINIMUM permissions. Start restrictive, add as needed.
- Each plugin requires explicit permission. No wildcard `*` permissions in production.
- Use `tauri::scope::FsScope` for file system access restrictions instead of global permissions.

### Frontend Integration

```typescript
// Use a hook to wrap invoke calls
function useTauri() {
  const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

  return {
    isTauri,
    async readFile(path: string): Promise<string> {
      if (!isTauri) throw new Error('Not running in Tauri')
      return invoke('read_file', { path })
    },
  }
}
```

- **Feature-detect, don't hardcode**. The web app should work in browser AND Tauri. Use `__TAURI_INTERNALS__` check. If running in browser, fall back to web APIs or show a message.
- **No Tauri-specific imports in shared components**. Wrap Tauri calls in hooks or services that the rest of the app doesn't know about.

### Non-Negotiable Rules

1. **No React components in Rust**. Tauri commands return data. The web app renders it. Period.
2. **No bundling the backend**. Rust runs natively — no Node.js, no Electron. The web build is static files served by the WebView.
3. **No DOM manipulation from Rust**. Use `invoke()` + frontend state. Don't use `eval()` or `window.executeJavaScript()`.
4. **No hardcoded paths** in Rust commands. Accept paths as arguments from the frontend.
5. **No heavy Rust dependencies**. Prefer Tauri plugins (official or community) over custom Rust code. If a plugin exists for dialog, filesystem, notification — use it.
6. **Config in `tauri.conf.json`**, not in Rust source: window title, size, min size, identifier, security settings.
7. **Build for size**: strip debug symbols in release, use UPX compression for the installer (`.msi`, `.dmg`, `.AppImage`).

### Tauri Plugins (Preferred Over Custom Rust)

| Need | Official Plugin |
|------|----------------|
| File dialogs | `@tauri-apps/plugin-dialog` |
| File system access | `@tauri-apps/plugin-fs` |
| System notifications | `@tauri-apps/plugin-notification` |
| Shell/Open URLs | `@tauri-apps/plugin-shell` |
| Clipboard | `@tauri-apps/plugin-clipboard-manager` |
| Auto-updater | `@tauri-apps/plugin-updater` |

### Testing

- **Rust commands**: test with `tauri::test::mock_invoke()` or plain Rust unit tests. Test error paths.
- **Web app Tauri hooks**: mock `invoke()` in Jest/Vitest. Test both Tauri and browser paths.
- **Integration**: build the web app, point Tauri to the build output, and run `tauri dev` for manual verification.

## Decision Gates

| Need | Approach |
|------|----------|
| New native API call | `#[tauri::command]` in `commands/` module, `invoke()` on web side |
| File dialog | `@tauri-apps/plugin-dialog`, NOT custom Rust |
| System tray | `tauri::tray::TrayIconBuilder` in `lib.rs` |
| Native menu | `tauri::menu::MenuBuilder` in `lib.rs` |
| Keyboard shortcuts | `tauri::GlobalShortcut` plugin |
| Auto-update | `@tauri-apps/plugin-updater` |

## Execution Steps

1. Add the Rust command or plugin registration in `src-tauri/src/lib.rs`.
2. Add the capability permission in `src-tauri/capabilities/`.
3. Add the frontend hook or service in a `tauri/` directory (isolated from shared UI).
4. Wire the UI to the hook. Verify the feature-detect pattern works in both Tauri and browser.
5. Test the command (Rust unit test + frontend mock).
6. Build: `tauri build` and verify installer size.

## Output Contract

Return: Rust commands added, frontend hooks created, permissions configured, any Tauri plugin used, and whether the web-only fallback was tested.

## References

- `clean-arch/SKILL.md` — Tauri is infrastructure. Domain and application never import `@tauri-apps/*`.
- `expo-tamagui/SKILL.md` — the web build that Tauri wraps comes from Expo, don't duplicate UI.
