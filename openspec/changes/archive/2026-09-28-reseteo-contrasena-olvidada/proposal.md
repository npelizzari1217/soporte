# Proposal: Reseteo de contraseña por olvido (self-service)

## Intent

Un usuario que olvidó su contraseña hoy no puede recuperar el acceso por sí mismo: `POST /auth/change-password` exige la actual, y las únicas vías son el reset por admin (ciclo `2026-09-21-reset-de-contrasena-por-admin`) o `backend/scripts/reset-password.ts`. Es la parte pendiente de la carencia de contraseñas (`docs/roadmap-comercial.md:448-450,468-469`): tokens de un solo uso con vencimiento, entregados por email.

## Decisión de producto citada

`docs/roadmap-comercial.md`, "Decisiones de producto ya cerradas" (`:162`), **no tiene viñeta** sobre este tema: el ítem vive en "Carencia detectada fuera de los seis puntos" (`:437-469`), que no es uno de los seis puntos. No hay viñeta que convertir en requerimiento; las decisiones que rigen son las del dueño listadas abajo.

## Decisiones cerradas por el dueño (2026-09-28)

| # | Decisión |
|---|---|
| 1 | Con **exactamente 1** membresía activa, el mail sale por el SMTP de ese tenant (`TenantContext` mínimo, precedente `sla-sweep.scheduler.ts:46`). Con **0 o 2+**: misma respuesta genérica, **sin mail**, solo traza en log. Sin fallback de plataforma, sin selector de cliente |
| 2 | Todo usuario activo puede auto-resetearse, **incluido ROOT**. Consecuencia aceptada: quien tenga 0 o 2+ membresías (p. ej. un ROOT sin membresías) no recibe mail y debe usar el reset por admin o el script |
| 3 | Mail de confirmación tras el reset exitoso, contenido mínimo ("tu contraseña fue restablecida; si no fuiste vos, contactá a tu administrador"), con la misma resolución de tenant |
| 4 | Sin fase `research` |
| 5 | TTL del token (sugerido 60 min), límites exactos de rate limiting y nombres de rutas: los fija `sdd-design` |

## Reglas no negociables

1. Anti-enumeración: respuesta idéntica exista o no el email, más defensa de timing (patrón `DUMMY_HASH`, `login.use-case.ts:22-39`).
2. Token de 32 bytes; solo se persiste su SHA-256.
3. Uso único vía CAS; emitir un token nuevo revoca los vigentes del usuario.
4. Hasheo **solo** vía `usuario.hashPassword()`.
5. Revocar sesiones tras el reset sin propagar el fallo (`try/catch` + `logger.error`).
6. El link se arma **solo** desde `APP_BASE_URL`.
7. El plaintext nunca se loguea.

## Preguntas de `rules.proposal`

- **¿Espeja otra capa?** Sí: el schema Zod de nueva contraseña espeja el `min(8)` del backend; los DTOs de las dos rutas nuevas se espejan en `frontend/src/features/auth/schemas.ts`.
- **¿Alternativas con comportamiento distinto?** Sí, cerradas por el dueño (decisiones 1-3): fallback de plataforma, selector previo y exclusión de ROOT quedaron descartados.
- **¿Cambia lo que ve o hace el usuario?** Sí: link en el login y dos pantallas públicas nuevas. **`backend/ayuda/mi-cuenta-contrasena.md:31-35` queda FALSO** ("no hay un botón de olvidé mi contraseña"): se corrige en el mismo work unit del frontend, excepción vigente a la pausa del 2026-09-07. El artículo nuevo es deuda anotada en commit y PR.

## Scope

### In Scope
- Modelo de token en `prisma_master` + migración, entidad, puerto y repo Prisma (molde `EncuestaToken`).
- Caso de uso "solicitar reset" y caso de uso "confirmar reset", con plantillas de mail (link y confirmación).
- Dos rutas públicas en `AuthController` con throttling propio (por email / por token).
- Frontend: link en `LoginForm.tsx`, dos páginas en `(auth)`, dos BFF, formularios, hooks, schemas.
- Corrección de `mi-cuenta-contrasena.md:31-35`.
- Tests unit y e2e (`usarLockMasterTest()` si truncan `soporte_master_test`).

### Out of Scope
- SMTP de plataforma (`docs/roadmap-comercial.md:83`); selector de cliente.
- Cambios al reset por admin, `AdminClienteGuard` o `scripts/reset-password.ts`.
- Artículos nuevos de Ayuda (pausa; solo deuda).

## Capabilities

### New Capabilities
- `auth-reseteo-por-olvido`: solicitud y confirmación del reset por email, anti-enumeración, ciclo de vida del token, resolución de tenant del mail y mail de confirmación.

### Modified Capabilities
- Ninguna. `usuarios-reset-password` rige el reset por admin y no cambia.

## Approach

Replicar el patrón CSAT (`EmitirEncuestaUseCase`, `CsatThrottlerGuard`) dentro de `auth/`: el caso de uso inyecta `EMAIL_SENDER` y llama `send()` dentro de `tenantContext.run(...)` solo con 1 membresía activa. La confirmación hace CAS sobre el token, luego `hashPassword()` → `save()` → revocación no propagante → mail de confirmación.

## Affected Areas

| Área | Impacto |
|---|---|
| `backend/prisma_master/schema.prisma` + migración | New |
| `backend/src/auth/{domain,application,infrastructure}/` | New |
| `backend/src/auth/interface/controllers/auth.controller.ts`, `dtos/auth.dto.ts`, `auth.module.ts` | Modified |
| `frontend/src/app/(auth)/`, `frontend/src/app/api/auth/`, `frontend/src/features/auth/` | New/Modified |
| `backend/ayuda/mi-cuenta-contrasena.md` | Modified |

## Risks

| Riesgo | Prob. | Mitigación |
|---|---|---|
| Enumeración por respuesta o timing | Alta | Regla 1; tests de igualdad de respuesta; blanco de mutación en `sdd-verify` |
| Hash inconsistente con el login | Media | Regla 4; blanco de mutación |
| Sin mail para 0/2+ membresías o tenant sin SMTP | Alta (por diseño) | Aceptado (decisiones 1-2); traza en log |
| Migración en `soporte_master` real | Media | Revisar `DEPLOY-VPS-runbook.md` |
| ~1350-1775 líneas vs. presupuesto de 400 | Alta | Entrega en cadena de PRs: `auto-chain`, `stacked-to-main`, presupuesto de 400 líneas por slice |

## Rollback Plan

`git revert` de cada PR de la cadena, en orden inverso. La tabla de tokens queda huérfana e inofensiva (migración aditiva); si se quiere, una migración de `DROP TABLE`. Las contraseñas cambiadas siguen siendo válidas (mismo `IHashProvider`). Revertir el frontend restaura el texto previo de la Ayuda.

## Dependencies

- `TenantAwareEmailSender`, `IRefreshTokenRepository`, `IHashProvider`, SMTP configurado por cliente.

## Success Criteria

- [ ] Usuario con 1 membresía activa recibe el link, resetea y se loguea con la clave nueva; recibe el mail de confirmación.
- [ ] Email inexistente, 0 o 2+ membresías: respuesta idéntica, sin mail, traza en log.
- [ ] Token reusado, vencido o revocado: rechazado; dos confirmaciones concurrentes resetean una sola vez.
- [ ] Sesiones revocadas tras el reset; un fallo de revocación no rompe la respuesta.
- [ ] Ningún log contiene plaintext ni token crudo.
- [ ] Gates de backend y frontend en verde; Ayuda corregida y deuda anotada.
