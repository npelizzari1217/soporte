```yaml
schema: gentle-ai.verify-result/v1
evidence_revision: 2d749a0f
verdict: pass-with-warnings
blockers: 0
critical_findings: 0
warnings: 2
suggestions: 4
requirements: 33/33
scenarios: 120/120
test_command: cd backend && pnpm vitest run src/auth test/sso.e2e.spec.ts test/usuarios-reseteo-sso.e2e.spec.ts src/auth/interface/controllers/usuarios-reseteo-tfa.e2e.spec.ts
test_exit_code: 0
test_output_hash: sha256:28fdf2ac502323d94c47308670cb0160ab3ec06af3f6937472b2c8df1f7256fd
build_command: cd backend && pnpm typecheck && pnpm lint
build_exit_code: 0
build_output_hash: sha256:d80fc59e6d9b63aee027209e0d90a65a1d3c7dbb422737189366a7042dc9b3cf
```

# Informe de verificación — `login-sso`

**Cambio**: `login-sso` (SSO con Google y Microsoft, punto 7 de la segunda etapa)
**Rama / revisión**: `feat/login-sso-wu09`, `evidence_revision: 2d749a0f` (punta de la cadena, 16 unidades)
**Modo**: estándar (sin Strict TDD; es una feature). Almacén: `openspec`.
**Veredicto**: **PASS WITH WARNINGS** — 0 bloqueantes, 2 advertencias, 4 sugerencias.

Nota de herramienta: `gentle-ai sdd-verify-validate` no existe en el binario instalado (`unknown command`), así que el sobre YAML no pasó por el validador. Los totales (33 requerimientos, 120 escenarios) salen de contar los encabezados `### Requirement:` y `#### Scenario:` de las seis specs (2+2+1+5+15+8 y 7+12+7+18+50+26).

## Completitud

| Métrica | Valor |
|---|---|
| Tareas totales | 97 |
| Tareas completas | 97 |
| Tareas incompletas | 0 |
| Specs | 6 (4 nuevas/delta `auth-sso-*`, `auth-limite-intentos`, 2 modificadas de 2FA) |
| Diff del ciclo | 102 archivos, +8147 / -55 (`git diff --stat main...HEAD`) |

## Comandos ejecutados

| Comando | Resultado observado |
|---|---|
| `backend: pnpm lint` | exit 0, cero errores |
| `backend: pnpm typecheck` | exit 0 |
| `backend: pnpm vitest run src/auth test/sso.e2e.spec.ts test/usuarios-reseteo-sso.e2e.spec.ts src/auth/interface/controllers/usuarios-reseteo-tfa.e2e.spec.ts` | exit 0, **100 archivos, 1188/1188 tests** (Postgres real en `soporte-postgres-master`) |
| `frontend: JWT_SECRET=dummy pnpm lint` | exit 0, sin advertencias ni errores |
| `frontend: pnpm type-check` | exit 0 |
| `frontend: pnpm vitest run src/app/api/auth/sso src/features/auth src/features/usuarios src/shared` | exit 0, **59 archivos, 471/471 tests** (hash de salida `sha256:217bbc68e29cb81aa95c1d8171b3fdb4aa6883d015aec79825ac8ced31742a9e`) |
| `node scripts/check-casts-en-specs.mjs` (raíz) | exit 0, 617 en 114 archivos (base 617 en 114) |
| Mutación adversarial (regla `rules.verify`): quitar el guard `if (usuario.isGlobalAdmin) this.rechazar(..., 'ROOT', ...)` de `completar-sso.use-case.ts` | **5 tests en rojo** (1 e2e + 4 unit: ROOT por email, ROOT promovido, reserva del limitador, `vincular` no se llama). Se restauró el archivo desde copia y la misma corrida dio 75/75 en verde. `git status` limpio. |

No se corrió la suite completa del backend: la corrida dirigida cubrió todo lo tocado y no hubo nada dudoso. Las suites completas quedaron verdes en WU-6 (8282/8282) y WU-9 (2160/2160) según `apply-progress.md:440`.

Cobertura: umbral 0 en `openspec/config.yaml`, no medida.

## Trazabilidad con la decisión de producto del roadmap

Fuente: `docs/roadmap-comercial.md`, "Decisiones de producto de la segunda etapa", viñeta "Segunda etapa, punto 7 — login con Google o Microsoft (SSO)" (línea 1001) y sus "Precisiones del 2026-10-09". Se verificó cada viñeta contra las specs (cada spec cita la decisión por ruta, como exige `soporte/CLAUDE.md`).

| Viñeta del roadmap | Requerimiento | Escenario verificable | Estado |
|---|---|---|---|
| D1 Solo usuarios existentes, por email verificado; sin alta automática | SL1, SL2, SL15 | Email inexistente: filas no cambian; sin alta | Cubierta |
| D2 Convive con la contraseña; olvido igual; sin "solo SSO"; baja = desactivar membresía | SL7, SL8, SL15 | Vinculado entra con contraseña; sin membresías se rechaza; sin política solo-SSO | Cubierta (SL8 y "sin política" por inspección, ver S3) |
| D3 2FA propio con reglas de hoy; dispositivo 30 días; SSO no es segundo paso | SL11, L1, L7, D3 | Obligado con 2FA, sin 2FA, dispositivo vigente, nunca tokens en el callback | Cubierta |
| D4 Una app por proveedor, en el servidor, nada por cliente | SC1, SC2 | Sin config por cliente; `redirect_uri` derivada; par incompleto = deshabilitado | Cubierta |
| D5 Cualquier cuenta con email verificado por el proveedor; cierra nOAuth | SL3, SL4, SL5 | `email_verified`, `xms_edov === true` estricto, ataque nOAuth | Cubierta (falta confirmación real, V.1) |
| D6 ROOT no entra por SSO | SL6 | ROOT por email; vinculado luego promovido; ROOT con contraseña | Cubierta (mutación confirmada) |
| D7 Vínculo por identificador inmutable; otra cuenta con el mismo email no entra; reseteo por admin con criterio de 2FA | SV1 a SV8 | Ver matriz | Cubierta (con W1 sobre SV1) |
| D8 El selector de cliente no cambia | SL12, L7 | Una y varias membresías | Cubierta |
| D9 Botones solo en el login; el usuario no ve ni desvincula | SC3, SC4, SC5 | Dos, uno y ningún botón; sin autogestión (403 y sin ruta) | Cubierta |
| D10 Fuera: auditoría de logins, alta automática, "solo SSO" | SL15 | Sin alta; sin columna solo-SSO; migración solo crea 2 tablas (+1 índice) | Cubierta |
| P1 Un solo botón: borra vínculos de todos los proveedores y cierra sesiones | SV7, SC5 | Reseteo con dos vínculos; botón único junto a Resetear 2FA | Cubierta |
| P2 Un único mensaje genérico; motivo solo en logs | SL13, I9 | Motivos distintos con respuesta idéntica; el log nombra el motivo | Cubierta |

Resultado: las 12 viñetas (10 de la decisión más las 2 precisiones) son requerimientos con escenario. No hay viñeta sin cubrir ni desviación silenciosa. Lo no implementado (alta automática, "solo SSO", auditoría) está declarado en SL15 y en la tabla de trazabilidad de `auth-sso-login`. La declaración Cumplida o Desviación del roadmap es el paso V.2 (posterior al deploy, fuera de verify).

## Matriz de cumplimiento por requerimiento

Rutas relativas a `backend/` salvo `FE:` (`frontend/src/`). Estado: COMPLIANT = existe test que pasó en esta corrida; INSPECCION = verificado por lectura de código o migración, sin test dedicado.

| Requerimiento | Escenarios | Evidencia (test:línea) | Resultado |
|---|---|---|---|
| SL1 (2) | email existente / inexistente | `src/auth/application/sso/completar-sso.use-case.spec.ts:228,290`; `test/sso.e2e.spec.ts:367,688` | COMPLIANT |
| SL2 (4) | vínculo / mayúsculas / ambiguo / sin email | `completar-sso.use-case.spec.ts:215,223,233`; `test/sso.e2e.spec.ts:395,446`; `src/auth/infrastructure/persistence/prisma/prisma-usuario.repository.email-insensitive.integration.spec.ts`; sin email: `validar-claims-google.spec.ts:47-64`, `validar-claims-microsoft.spec.ts:84` | COMPLIANT |
| SL3 (3) | válido con/sin `hd` / sin verificar / firma, aud, iss, exp, nonce | `src/auth/infrastructure/sso/validar-claims-google.spec.ts:29-73`; `jose-proveedor-oidc.spec.ts:85,109,130`; `test/sso.e2e.spec.ts:454` | COMPLIANT |
| SL4 (6) | válido org / personal / iss≠tid / xms_edov / preferred_username y upn / firma, aud, exp, nonce | `src/auth/infrastructure/sso/validar-claims-microsoft.spec.ts:33-94`; `jose-proveedor-oidc.spec.ts:101,109`; `test/sso.e2e.spec.ts:463,732` | COMPLIANT (cuenta personal real: V.1) |
| SL5 (3) | Google personal / Workspace / nOAuth | `validar-claims-google.spec.ts:73`; `validar-claims-microsoft.spec.ts:58`; `test/sso.e2e.spec.ts:732` | COMPLIANT |
| SL6 (3) | ROOT email / promovido / ROOT con contraseña | `completar-sso.use-case.spec.ts:253,258`; `test/sso.e2e.spec.ts:713`; contraseña: `src/auth/application/use-cases/login.use-case.spec.ts` (suite verde, ruta sin cambio funcional) | COMPLIANT |
| SL7 (3) | inactivo / eliminado / sin membresías | `completar-sso.use-case.spec.ts:238,247,265`; `test/sso.e2e.spec.ts:419-445` (incluye borrado lógico, línea 118) | COMPLIANT |
| SL8 (2) | entra con contraseña / olvido igual | Suites de `login` y `solicitar-reset-password` verdes con diff de una línea de mock; sin test SSO dedicado | INSPECCION (S3) |
| SL9 (6) | request correcta / replay / concurrentes / sin cookie / vencido / proveedor cruzado | `src/auth/application/sso/iniciar-sso.use-case.spec.ts:53,63,74`; `src/auth/infrastructure/sso/prisma-sso-estado.repository.integration.spec.ts:60-109`; `test/sso.e2e.spec.ts:282,295,313,326,341`; `jose-proveedor-oidc.spec.ts:162`; FE: `app/api/auth/sso/[proveedor]/callback/route.test.ts:77` | COMPLIANT |
| SL10 (2) | destino permitido / externo | FE: `callback/route.test.ts:139`, `iniciar/route.test.ts:64`, `features/auth/hooks/use-login.test.tsx:144,621`; `test/sso.e2e.spec.ts:359` | COMPLIANT |
| SL11 (5) | 2FA activo / enrolar / dispositivo / sin 2FA / sin tokens | `completar-sso.use-case.spec.ts:439-495`; `src/auth/application/evaluar-segundo-paso.service.spec.ts:81-139`; `test/sso.e2e.spec.ts:490-543` | COMPLIANT |
| SL12 (2) | varias membresías / una | `completar-sso.use-case.spec.ts:467`; `test/sso.e2e.spec.ts:544,560` | COMPLIANT |
| SL13 (3) | respuestas idénticas / motivo en log / cancelación | `test/sso.e2e.spec.ts:419-445` (cuerpo idéntico y log); `completar-sso.use-case.spec.ts:270,282`; FE: `features/auth/components/AvisoMotivo.test.tsx:35,43`, `callback/route.test.ts:56` | COMPLIANT |
| SL14 (3) | cookie de un uso / atributos / dispositivo solo por cookie | FE: `app/api/auth/sso/paso/route.test.ts:33,50,57`, `iniciar/route.test.ts:43,56`, `callback/route.test.ts:99,107,122`, `use-login.test.tsx:563-690` | COMPLIANT |
| SL15 (3) | sin alta / sin solo-SSO / sin auditoría | alta: `completar-sso.use-case.spec.ts:290`, `test/sso.e2e.spec.ts:688`; solo-SSO y auditoría: migración `prisma_master/migrations/20261010120000_login_sso/migration.sql` (solo 2 tablas y 1 índice) | COMPLIANT (2 por INSPECCION, S3) |
| SV1 (5) | duplicado usuario-proveedor / mismo sujeto / ambos / proveedor inválido / borrado | `src/auth/infrastructure/sso/prisma-identidad-sso.repository.integration.spec.ts:61-106`; CHECK en la migración | COMPLIANT en los 5 escenarios; **ver W1** (campo email) |
| SV2 (3) | primer ingreso Google / Microsoft / rechazado no vincula | `completar-sso.use-case.spec.ts:395,406`; `test/sso.e2e.spec.ts:367,419-445` | COMPLIANT |
| SV3 (1) | email cambiado | `completar-sso.use-case.spec.ts:215`; `test/sso.e2e.spec.ts:367` | COMPLIANT |
| SV4 (2) | otra cuenta mismo email / otro proveedor | `completar-sso.use-case.spec.ts:428`; `test/sso.e2e.spec.ts:384`; `prisma-identidad-sso.repository.integration.spec.ts:61` | COMPLIANT |
| SV5 (2) | sujetos distintos a la vez / mismo sujeto | `test/sso.e2e.spec.ts:631,644`; `prisma-identidad-sso.repository.integration.spec.ts:52,86` | COMPLIANT |
| SV6 (1) | cuenta ya vinculada a otro usuario | `test/sso.e2e.spec.ts:402`; `prisma-identidad-sso.repository.integration.spec.ts:69` | COMPLIANT |
| SV7 (5) | dos vínculos / sin vínculos / falla de revocación / revinculación / no toca otras credenciales | `src/auth/application/sso/resetear-vinculo-sso.use-case.spec.ts:78,115,123`; `test/usuarios-reseteo-sso.e2e.spec.ts:181,194` | COMPLIANT |
| SV8 (7) | ROOT a cualquiera / admin solo-suyo / multicliente / inactiva en otro / objetivo ROOT / indistinguibles / sin sesión o rol | `resetear-vinculo-sso.use-case.spec.ts:86,96`; `src/auth/application/politica-reseteo-usuario.spec.ts`; `test/usuarios-reseteo-sso.e2e.spec.ts:181,218,225,237,268`; `src/auth/interface/controllers/usuarios.controller.spec.ts` | COMPLIANT |
| SC1 (3) | sin config por cliente / URL derivada / una app para todos | `src/auth/infrastructure/sso/configuracion-sso.spec.ts:23,71`; "sin config por cliente" por esquema | COMPLIANT (1 por INSPECCION, S3) |
| SC2 (4) | sin variables / par incompleto / proveedor deshabilitado / uno sí y otro no | `configuracion-sso.spec.ts:10,54,60`; `iniciar-sso.use-case.spec.ts:87`; `test/sso.e2e.spec.ts:273`; `jose-proveedor-oidc.spec.ts:156` | COMPLIANT |
| SC3 (4) | ambos / uno / ninguno / sin filtración | `src/auth/application/sso/listar-proveedores-sso.use-case.spec.ts:22-32`; `test/sso.e2e.spec.ts:267` | COMPLIANT |
| SC4 (4) | dos / uno / ninguno / otras pantallas | FE: `features/auth/components/botones-sso.test.tsx:8,21`, `app/(auth)/login/page.test.tsx:188,203,222,237`; "otras pantallas": `rg sso frontend/src` solo toca login, dialog de usuarios y BFF | COMPLIANT (1 por INSPECCION, S3) |
| SC5 (3) | sin autogestión / botón admin / reseteo desde la UI | `test/usuarios-reseteo-sso.e2e.spec.ts:268`; FE: `features/usuarios/components/editar-usuario-dialog.test.tsx:256-298` | COMPLIANT |
| I9 (7) | 5 rechazos / bloqueado con token válido / éxito reinicia / otra IP / state inválido / inicio sin límite / clave cabe | `completar-sso.use-case.spec.ts:301-393`; `test/sso.e2e.spec.ts:663,678`; "inicio sin límite" porque `iniciar-sso.use-case.ts` no inyecta el limitador | COMPLIANT (6); "clave cabe" indirecta, ver S4 |
| L1 (modificado, 6) y L7 (6) | orden del login, selector con ticket | `src/auth/application/use-cases/login.use-case.spec.ts`, `src/auth/application/tfa/continuar-login.use-cases.spec.ts`, `evaluar-segundo-paso.service.spec.ts`; FE: `use-login.test.tsx:190-293` | COMPLIANT |
| D3 (renombrado y modificado, 7) | dispositivo omite el desafío, no el primer factor | `evaluar-segundo-paso.service.spec.ts:115,130`; `test/sso.e2e.spec.ts:518` | COMPLIANT |

**Resumen**: 113 escenarios con test que pasó, 6 verificados por inspección o no regresión (SL8 x2, SL15 x2, SC1 x1, SC4 x1) y 1 cubierto de forma indirecta (I9 "la clave cabe"). Cero FAILING, cero UNTESTED. Los totales del sobre cuentan los 120 como cumplidos con esas salvedades.

## Coherencia con el diseño (ADR)

| ADR | Seguido | Notas |
|---|---|---|
| ADR-1 OIDC en el backend, tabla `sso_estados`, cookie de enlace | Sí | CAS único antes de cualquier llamada saliente; solo hashes; proveedor cruzado y binding ajeno dejan la fila consumible (`prisma-sso-estado.repository.integration.spec.ts:93,101`). |
| ADR-2 `jose` 6 + `fetch`, endpoints fijados | Sí | `jose ^6.2.12`; `jose-proveedor-oidc.ts`; criterio 5 del spike registrado (tarea 9.5). |
| ADR-3 validadores por proveedor, token de configuración DI | Sí | `validar-claims-*.spec.ts`. |
| ADR-4 tabla `usuarios_identidades_sso` | **Parcial** | Unicidades, CHECK y cascada correctas. Se descartó `email_al_vincular` y la spec SV1 sigue exigiéndolo (W1). `subject` quedó en VARCHAR(255), el diseño decía 200: sin efecto. |
| ADR-5 búsqueda insensible con rechazo de ambigüedad | Sí | `lower(email) = lower($1) LIMIT 2` con índice; `findByEmail` intacto. |
| ADR-6 `EvaluarSegundoPasoService` extraído | Sí | `evaluar-segundo-paso.service.ts`; `login.use-case.ts` -31/+10 y su spec verde. |
| ADR-7 orden de rechazos, limitador, entrega | Sí | La reserva va entre el canje y la resolución (`completar-sso.use-case.spec.ts:312`); libera tras vincular. |
| ADR-8 `DELETE /usuarios/:id/sso` y política compartida | Sí | `politica-reseteo-usuario.ts` usado por el reseteo de 2FA y el de SSO. |
| ADR-9 BFF y frontend | Sí | `paso` es POST (nota de reconciliación del diseño); cookie `sso_paso` de 120 s. |
| ADR-10 configuración leída al usar | Sí | `configuracion-sso.spec.ts:60`. |
| Arquitectura hexagonal | Sí | Sin imports de `@prisma/client` en `application/` ni `domain/`. |

## Ítems conocidos

| # | Ítem | Veredicto |
|---|---|---|
| 1 | `findManyByEmailInsensitive` no filtra `deleted_at` (`src/auth/infrastructure/persistence/prisma/prisma-usuario.repository.ts:53-57`) | **Aceptable, con sugerencia (S1).** SL7 exige rechazar al eliminado y `completar-sso.use-case.ts:154` lo rechaza como INACTIVO con la falla genérica, igual que el login con contraseña (`login.use-case.ts:154`, que tampoco filtra en la consulta). El caso de un eliminado y un activo con emails que difieren solo en mayúsculas da AMBIGUO: falla cerrada, nunca concede acceso, y `usuarios.email` es `@unique` exacto, así que exige dos filas con variantes de mayúsculas. SL2 dice "más de un usuario", sin excluir eliminados. No es defecto. Sí conviene decidirlo y fijarlo con un test. |
| 2 | WU-8b no invalida la query y su toast de 404 nombra el reseteo SSO (`frontend/src/features/usuarios/components/editar-usuario-dialog.tsx:121-127`, `use-usuarios-tenant-mutations.ts:123-127`) | **Aceptable (S2).** La lista no muestra nada de SSO, así que no hay nada que refrescar, y el patrón real del reseteo de 2FA tampoco invalida. El mensaje del 404 es neutro y no revela el motivo, que es lo que exige SV8. La desviación respecto del texto de la tarea 15.1 está documentada en `apply-progress.md:426`; queda el texto de la tarea desactualizado. |
| 3 | `MENSAJE_SSO_ERROR` idéntico para todo motivo (SL13) | **Confirmado.** Es una constante única (`frontend/src/features/auth/components/AvisoMotivo.tsx:28`), usada por `AvisoMotivo` y por el toast de `use-login.ts:278`. Backend: `SsoRechazadoError` siempre dice el mismo texto sea cual sea el `motivo` (`sso.errors.ts`), y el controlador responde siempre 401. Todos los fallos del BFF van a `/login?motivo=sso-error` sin `razon` ni `detalle`, y un test confirma que parámetros extra no cambian el mensaje (`AvisoMotivo.test.tsx:43`). El 404 de proveedor deshabilitado lo traduce el BFF al mismo `sso-error`. |
| 4 | Movidos: 9 → 10.5 y "solo hashes" cubierto por el test de `iniciar` de WU-5a | **Confirmados.** Estado vencido: `test/sso.e2e.spec.ts:326`; proveedor cruzado: `:341`; `siguiente` de más de 300: `:359`. Solo hashes: `iniciar-sso.use-case.spec.ts:63`, además `sso.e2e.spec.ts:282` y `prisma-sso-estado.repository.integration.spec.ts:60`. Todos pasaron en esta corrida. |
| 5 | V.1 manual en staging y V.2 | **V.1 PENDIENTE (W2). No se marca como pasado.** V.2 queda fuera de verify (ver Seguimientos). |

## Hallazgos

### CRITICAL
Ninguno.

### WARNING
- **W1** — La spec `auth-sso-vinculo` SV1 (`openspec/changes/login-sso/specs/auth-sso-vinculo/spec.md`, requerimiento SV1) exige que el vínculo guarde "el email con que se vinculó (solo informativo)". La migración (`backend/prisma_master/migrations/20261010120000_login_sso/migration.sql:25-34`) y ADR-4 descartaron `email_al_vincular`. Es una desviación de la spec que ninguna spec declara. La nota de reconciliación del diseño dice "no spec requirement reads it", pero SV1 lo pide guardar, no leer. No hay escenario que lo pruebe y no afecta ningún comportamiento ni la decisión de producto del roadmap. Resolución: enmendar SV1 para sacar el email (el motivo del diseño, dato personal sin lector, es razonable) o agregar la columna.
- **W2** — V.1 sin ejecutar: nadie ha visto un id_token real de Microsoft con `email`, `xms_edov` y `oid`, ni de una cuenta personal. La defensa contra nOAuth (SL4, SL5) depende de que Entra emita `xms_edov` y está probada solo contra un IdP falso (`backend/src/testing/idp-falso.ts`). Falta además el procedimiento confirmado del manifiesto de Entra (tarea 16.3). No bloquea el archive según `tasks.md`, pero sí el despliegue en producción.

### SUGGESTION
- **S1** — Decidir si `findManyByEmailInsensitive` debe excluir eliminados (`prisma-usuario.repository.ts:57`, agregar `AND deleted_at IS NULL`) y fijarlo con un test de integración. Hoy un eliminado y un activo con variantes de mayúsculas del mismo email dejan al activo en AMBIGUO.
- **S2** — Corregir el texto de la tarea 15.1 (`tasks.md:241`), que dice "invalida la query" y "el mismo mensaje del 2FA", o dejar la nota de desviación junto a la tarea.
- **S3** — Seis escenarios están verificados solo por inspección (SL8 x2, SL15 "sin política" y "sin auditoría", SC1 "sin config por cliente", SC4 "otras pantallas"). Un test de esquema que liste las tablas de la migración y otro que busque `sso` fuera de las pantallas permitidas los volvería regresión automática.
- **S4** — Agregar una aserción dedicada a I9 "la clave cabe en el almacén": `sso:MICROSOFT:` (14) + sha256 hex (64) + `:` + IP (hasta 45) = 124 caracteres contra `VarChar(200)` (`schema.prisma:609`). Hoy solo lo cubre de forma indirecta el e2e con el limitador persistido.

## Seguimientos

1. **V.1 (PENDIENTE, a cargo del dueño)**: crear las app registrations, cargar variables en staging y probar una cuenta real de Google, una de trabajo de Microsoft y una personal de Microsoft. Comprobar que llegan `email`, `xms_edov` y `oid`, que se crea el vínculo, que el segundo ingreso reconoce por sujeto, el 2FA propio y el selector con dos membresías. Registrar el resultado y el procedimiento del manifiesto de Entra. Si las cuentas personales no emiten esos claims, quedan rechazadas por diseño y se declaran como Desviación ("cuentas personales"). Resultado registrado: ninguno todavía.
2. **V.2 (fuera de verify, posterior al deploy)**: marcar el punto 7 como Entregado en `docs/roadmap-comercial.md`, declarar Cumplida o Desviación en la viñeta y correr `node scripts/check-roadmap-fresco.mjs`.
3. Resolver W1 (enmienda de spec o columna) antes del archive, para que la spec principal no herede una exigencia que el código no cumple.
4. Deuda de Ayuda anotada: "Resetear vínculo SSO" y los botones de login (la escritura de artículos está suspendida en el repo).
5. Decidir S1 a S4 a criterio del dueño.

## Veredicto

**PASS WITH WARNINGS.** Calidad (lint, tipos, casts) en verde en backend, frontend y raíz; 1188/1188 y 471/471 tests dirigidos; la mutación del guard ROOT se detecta. Las 12 viñetas de la decisión de producto están cubiertas por requerimientos con escenarios. Se puede archivar tras resolver W1; la salida a producción requiere V.1.

## Adenda — resolución de W1 (2026-10-10)

Por decisión del dueño, W1 se resuelve **enmendando la spec**, sin agregar la columna. El requerimiento SV1 de `specs/auth-sso-vinculo/spec.md` ya no exige guardar el email con que se vinculó, y declara la desviación con su motivo (ADR-4). La enmienda no cambia código ni tests, así que la evidencia de `evidence_revision: 2d749a0f` sigue vigente. Los conteos del encabezado reflejan el estado verificado; con esta adenda queda abierta solo **W2** (V.1 pendiente), que no bloquea el archive.
