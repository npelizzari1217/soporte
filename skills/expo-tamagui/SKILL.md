---
name: expo-tamagui
description: "Trigger: Expo, React Native, Tamagui, NativeWind, mobile, iOS, Android, app, UI cross-platform, estilo compartido. Build cross-platform UI with shared styles — one design system for mobile, web, and desktop."
license: Apache-2.0
metadata:
  author: gentleman-programming
  version: "1.0"
---

## Activation Contract

Apply when creating UI components, screens, navigation, or styling for Expo apps using Tamagui or NativeWind. Code targets both mobile and web from a single codebase.

## Hard Rules

### Project Structure

```
app/                          # Expo Router (file-based routing)
├── (tabs)/                   # Tab layout
│   ├── _layout.tsx           # Tab configuration
│   ├── index.tsx             # Home screen
│   └── profile.tsx
├── _layout.tsx               # Root layout (providers, fonts)
└── +not-found.tsx

src/
├── components/               # Reusable UI components
│   ├── ui/                   # Primitive components (Button, Input, Card)
│   └── features/             # Domain-specific components
├── screens/                  # Screen components (thin — layouts only)
├── hooks/                    # Shared hooks
├── providers/                # Context providers (theme, auth, etc.)
├── tamagui/                  # Tamagui config
│   ├── config.ts             # Theme tokens, fonts, sizes
│   └── themes.ts             # Light/dark theme definitions
└── types/                    # Shared types (re-export from @compartido if exists)
```

### Design System Rules

1. **One source of truth for design tokens**: all colors, spacing, typography, and breakpoints in `tamagui/config.ts`. Never hardcode values in components.
2. **Theme-aware components**: use Tamagui's `useTheme()` or `styled()` with theme tokens. No platform-specific color checks. Components work the same on iOS, Android, and web.
3. **Responsive by default**: use Tamagui's responsive props (`$gtSm`, `$gtMd`) for layout changes. Avoid separate mobile/tablet/desktop components.
4. **Platform-specific only when necessary**: if a behavior MUST differ (e.g., haptics), use `Platform.OS` or `.ios.tsx` / `.android.tsx` / `.web.tsx` extensions. This is the EXCEPTION, not the rule.

### Component Patterns

```typescript
// Prefer Tamagui's styled() over custom View/Text
import { styled, YStack, Text } from 'tamagui'

const Card = styled(YStack, {
  name: 'Card',
  backgroundColor: '$background',
  padding: '$4',
  borderRadius: '$4',
  borderWidth: 1,
  borderColor: '$borderColor',
  // Responsive: full width on mobile, max width on desktop
  width: '100%',
  maxWidth: { $gtSm: 400 },
})
```

- **One component per file**. Name matches the export.
- **Primitive components** (`ui/Button`, `ui/Input`) are pure Tamagui `styled()`. No business logic.
- **Feature components** compose primitives + domain logic hooks. Still no direct store access — receive data via props.
- **Screens** are thin: compose feature components, handle navigation. Zero business logic.

### Shared Types & Validation

- Domain types and VOs come from the shared package (`@compartido/dominio` or similar). They are NOT redefined in the Expo project.
- Validation logic from domain VOs is reused on the client for instant feedback before API calls. DO NOT duplicate validation.
- Form state: use Tamagui's `useForm` or a lightweight form library. Validate against shared schema on submit.

### Navigation

- **Expo Router** (`app/` directory). File-based routing.
- Route groups `(tabs)/`, `(auth)/` for layout nesting.
- Deep linking configured for web URLs (ex: `/profile/123`). Mobile and web use the same routes.
- If a screen exists on mobile but not on web (or vice versa), use the file extension convention `.native.tsx` / `.web.tsx`.

### Non-Negotiable Rules

1. **No platform-specific logic in components** for visual differences. Use Tamagui themes and responsive props.
2. **No inline styles**. If you need custom styling, extract to `styled()` or a Tamagui component.
3. **No `useWindowDimensions()`** — use Tamagui's responsive props or `useMedia()` instead.
4. **No raw navigation imports** — use Expo Router's `useRouter()` and `<Link>`.
5. **Shared !== coupled**: domain types imported from @compartido are fine. Domain logic from the backend is NOT imported — call APIs.

### Testing

- **Component tests**: use `@testing-library/react-native` + Tamagui provider wrapper.
- **Screen tests**: mock navigation and API calls. Test rendering with different data states.
- **Visual regression**: use Storybook (if configured) or snapshot tests for UI primitives.

## Decision Gates

| Situation | Approach |
|-----------|----------|
| New screen | Create file in `app/` using Expo Router. Compose feature components |
| New UI primitive | `styled()` in `src/components/ui/` with theme tokens |
| Platform-specific behavior | `.native.tsx` / `.web.tsx` file extension — only for behavior, NOT visual |
| Form with validation | Reuse shared VOs validation from @compartido on the client |
| Navigation change | Use Expo Router. Never use React Navigation directly |

## Execution Steps

1. If new screen: add route file in `app/`. Define layout in `_layout.tsx`.
2. If new component: create in `src/components/`. Use `styled()` with theme tokens.
3. If new shared type: add to the shared package, import in Expo. Do NOT duplicate.
4. Verify: no inline styles, no `useWindowDimensions()`, no platform-specific visual branches.

## Output Contract

Return: files created, platform extension used (if any), whether shared types were reused from @compartido, and any platform-specific workarounds needed.

## References

- `clean-arch/SKILL.md` — domain rules apply to shared types between backend and frontend
- `value-objects/SKILL.md` — shared VOs used for form validation
