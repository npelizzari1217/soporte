# Propuesta: verificación en dos pasos (2FA)

## Intención

Hoy el login es solo email y contraseña, sin límite de intentos. Una contraseña filtrada da acceso total, también a ROOT.

Decisión de producto: `docs/roadmap-comercial.md`, "Decisiones de producto de la segunda etapa" → "Segunda etapa, punto 5 — verificación en dos pasos (2FA)", incluida la sublista "Precisiones del 2026-10-07, al explorar". Cada viñeta y subviñeta se convierte en requerimiento con escenario en la spec. Ninguna queda sin implementar; lo que la viñeta declara fuera de alcance figura abajo.

## Alcance

### Incluido
- TOTP por usuario (app autenticadora) y 10 códigos de recuperación de un solo uso, mostrados una vez.
- Se pide una vez por login, tras la contraseña y antes del selector; refresh y cambio de cliente no lo piden. El selector deja de re-enviar la contraseña.
- Obligatorio para ROOT y para quien tenga alguna membresía en un cliente que lo exija; configuración forzada que cierra el login solo al confirmar que se guardaron los códigos.
- Autogestión: activar; desactivar (solo no obligados); regenerar códigos y cambiar de celular; todo con código válido.
- Política "exigir 2FA" por cliente, a cargo de su ADMINISTRADOR; las sesiones abiertas siguen hasta vencer.
- "Recordar este dispositivo" 30 días (no para ROOT), invalidado por todo cambio de contraseña y por el reseteo de 2FA.
- Reseteo de 2FA: ROOT a cualquiera (incluido otro ROOT); ADMINISTRADOR solo si el usuario no tiene ninguna otra membresía (activa o no, de cliente suspendido o no) y nunca a un ROOT. Script de operador en el VPS para ROOT sin celular ni códigos.
- Límite de intentos: contraseña por usuario+IP (el BFF reenvía la IP del navegador), código por usuario.
- Rotación de clave que cubre el secreto TOTP en este mismo cambio.
- Sin bypass fuera de producción: tests, e2e y seeds con secreto conocido.

### Excluido
- WebAuthn/passkeys, SMS, auditoría de logins, mail al activar o resetear (roadmap).
- Escritura de Ayuda (suspendida desde el 2026-09-07): se anota la deuda en commit y PR — enrolamiento, desafío, ajustes de 2FA en el perfil, toggle de política y reseteo por admin; se corrige todo artículo que quede falso.

## Capacidades

### Nuevas
- `auth-2fa-totp`: secreto, códigos, enrolamiento, autogestión.
- `auth-2fa-login`: desafío, obligatoriedad, configuración forzada, selector con ticket.
- `auth-2fa-dispositivo-confiable`: token, cookie del BFF, invalidación.
- `auth-limite-intentos`: contraseña y código.
- `auth-2fa-politica-cliente`: exigir por cliente.
- `auth-2fa-reseteo`: ROOT, ADMINISTRADOR, script de operador.

### Modificadas
- `usuarios-reset-password` y `auth-reseteo-por-olvido`: invalidan dispositivos confiables; el reset por mail no desactiva el 2FA.
- `email-crypto-key-rotacion`: cubre el secreto TOTP (si diseño elige clave propia, esa rotación es capacidad nueva).

## Enfoque

Recomendación de la exploración, que diseño cierra: TOTP nativo (RFC 6238, vectores oficiales) detrás de `ITotpService`, antireplay por último paso con CAS; desafío opaco de un solo uso en master; tablas propias en master (nunca columnas en `usuarios`, por el upsert de `save()`); `requiere_2fa` en `clientes` por ruta y use case propios bajo `AdminClienteGuard`+`TenantGuard`; limitador que cuenta solo fallos, persistido en master; dispositivo confiable como token opaco en cookie httpOnly del BFF.

Preguntas de `config.yaml`: espeja otra capa (Zod del frontend; backend fuente); hubo alternativas (desafío firmado, otplib, throttler en memoria, descartadas); cambia lo que ve el usuario (deuda de Ayuda).

## Áreas afectadas

| Área | Impacto | Descripción |
|---|---|---|
| `backend/prisma_master/` | Modificado | tablas 2FA, desafío, intentos, `requiere_2fa` |
| `backend/src/auth/` | Modificado | login, use cases, puertos, controller |
| `backend/src/usuarios/`, `clientes/` | Modificado | reseteo, política |
| `backend/scripts/` | Modificado/Nuevo | rotación de clave, recuperación de ROOT |
| `frontend/src/app/api/auth/`, `shared/auth/` | Modificado | BFF, IP, cookie de dispositivo |
| `frontend/src/features/auth/`, administración | Modificado | desafío, enrolamiento QR, perfil, toggle, reseteo |

## Entrega

`auto-chain` sobre `feat/verificacion-dos-pasos`, 19 PRs bajo 400 (plan en `design.md`, "Delivery slices"). La exploración estimaba ~3.0-3.4k líneas en 9-11 PRs; el diseño lo llevó a ~6.250 líneas y el orquestador aceptó el desvío el 2026-10-07.

## Riesgos

| Riesgo | Prob. | Mitigación |
|---|---|---|
| Rotación de clave deja secretos ilegibles | Media | cubrirla en este cambio; descifrado fallido nunca 500 |
| ROOT bloqueado | Media | otro ROOT o script de operador |
| Invalidación de dispositivos tragada por log-and-swallow = bypass | Media | diseño decide propagar el error |
| e2e y seeds de ROOT rompen | Alta | secreto conocido en fixtures |
| Robo de refresh token evita el 2FA (por decisión) | Baja | declararlo en la spec |
| IP falsificable ante el backend | Media | solo el BFF la fija; diseño define confianza |

## Rollback

Migración master aditiva (tablas nuevas, columna con default `false`); el revert deja todo inerte y el login vuelve a contraseña sola. Cada PR se revierte con `git revert`.

## Dependencias

- `uqr` (ya en frontend). Si el script de operador es `.ps1`, entra en la tabla §2.2 de `~/proyectos/CLAUDE.md`.

## Criterios de éxito

- [ ] Cada viñeta y subviñeta del punto 5 con requerimiento, escenario y test.
- [ ] ROOT y usuarios obligados no completan login sin segundo factor.
- [ ] Gates backend y frontend en verde; `check-roadmap-fresco.mjs` pasa con la viñeta declarada.
