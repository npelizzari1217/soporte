# Proposal: frontend-fundacion

## Intent / Why

El proyecto Soporte tiene un backend NestJS funcional (1448 tests verdes, recién archivado) pero CERO frontend. No se puede construir ninguna feature de negocio (tickets, compras, reparaciones, equipos) sin antes establecer la fundación: scaffolding, autenticación, capa de datos y design system. Este change crea esa base — el esqueleto sobre el que cada dominio se montará después — sin escribir todavía ninguna pantalla de negocio.

Éxito = un usuario puede loguearse contra el backend real, quedar autenticado vía cookie httpOnly, navegar a un dashboard protegido, y los próximos changes solo agregan features sin tocar infraestructura.

## What changes

- Scaffolding `frontend/` (Next.js App Router + TS + Tailwind v4 CSS-first + Shadcn).
- BFF: catch-all proxy `app/api/[...path]/route.ts` + route handlers de auth (login/refresh/logout) con cookies httpOnly.
- Middleware de protección de rutas con `jose` (Edge Runtime).
- Capa API: `apiFetch` tipado (normaliza DTOs y errores `{statusCode,message}`, maneja 401→refresh con cola/retry) + provider de TanStack Query v5.
- Sesión: `SessionProvider` que decodifica el JWT del cookie y expone `{ user, roles, permisos }` para authz de UI.
- Design system: tokens Tailwind v4 `@theme` (dark por defecto, `--radius-lg:8px` cards, `--radius-md:6px` botones/inputs), Shadcn init, atoms base obligatorios: variantes de `Skeleton`, `EmptyState`, `Button` con estado Loading+disabled+spinner.
- App shell: RootLayout + Providers, DashboardLayout con nav + guard de auth, página `/login` funcional end-to-end.
- Estructura Screaming Architecture: `features/` por dominio (placeholders vacíos), `components/ui`, `shared/api`, `shared/hooks`, `shared/providers`.

## Approach

1. **BFF catch-all proxy**: el browser nunca ve el token; Next agrega el accessToken server-side desde cookie httpOnly. SIN CORS — TanStack pega same-origin a `/api`. Route handlers dedicados gestionan las cookies de auth.
2. **Front normaliza, backend INTACTO**: `apiFetch` adapta las respuestas crudas y errores de NestJS. No se reabre el backend.
3. **TanStack Query v5 + apiFetch**: mapea trivialmente los 3 estados obligatorios de la constitución (Skeleton / EmptyState / botón Loading).
4. **Next.js servidor Node** (no static export): requerido por route handlers + middleware.

## Out of scope

- UI de tickets, compras, reparaciones y equipos — cada flujo es su propio change posterior.
- Cualquier modificación al backend NestJS.

## Impact / Risks

- CORS innecesario gracias al BFF (riesgo eliminado, no mitigado).
- `jose` obligatorio en middleware (Edge no admite `jsonwebtoken`).
- Cola de refresh en 401: evita rotar el refresh token en requests paralelos — punto sensible a testear.
- Tailwind v4 CSS-first: documentación y ejemplos online escasos (más nuevo).
