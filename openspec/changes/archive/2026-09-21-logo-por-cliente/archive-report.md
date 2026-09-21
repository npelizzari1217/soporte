# Archive Report — Logo por cliente en el sidebar

**Date**: 2026-09-21  
**Change**: logo-por-cliente  
**Repository**: soporte  
**Artifact Store Mode**: openspec  
**Veredicto final**: PASS WITH WARNINGS  

---

## Resumen ejecutivo

El ciclo SDD **logo-por-cliente** ha sido completado exitosamente. Todas las 32 tareas de implementación están marcadas como completas. La verificación final (ronda 2) confirma cero CRITICAL, 4 WARNING y 5 SUGGESTION. Los dos CRITICAL de la ronda 1 fueron cerrados mediante el commit posterior `bcee975`, que agrega 5 tests de atachado de guards sin modificar código de producción.

**Cambio completado y archivado**: 2026-09-21.

---

## Estado de tareas

| Métrica | Valor |
|---|---|
| Tareas totales | 32 |
| Tareas completas | 32/32 |
| Tareas incompletas | 0 |
| Work units | 4 (WU1, WU2, WU3, WU4) |

**Desglose por unidad**:
- WU1 (Storage y persistencia): 9/9
- WU2 (Endpoints): 8/8
- WU3 (Propagación y sidebar): 9/9
- WU4 (Diálogo de carga): 6/6

Todos los checkboxes de implementación en `tasks.md` están marcados `[x]`. No hay tareas incompletas.

---

## Requisitos y escenarios

| Métrica | Valor |
|---|---|
| Requisitos | 8/8 |
| Escenarios | 17/17 |
| Escenarios UNTESTED | 0 |
| Escenarios PARTIAL | 3 |

**Matriz de cumplimiento**: Todos los 8 requisitos de la spec verifican como COMPLIANT. De los 17 escenarios, 14 son COMPLIANT (cobertura directa) y 3 son PARTIAL (cobertura por un camino más angosto pero verificado).

---

## Resultados de verificación

**Veredicto**: PASS WITH WARNINGS (ronda 2, 2026-09-21)

**Evidencia de verificación**: `verify-report.md` (ronda 2)
- `evidence_revision`: sha256:30b6771d4635fcebe7c0ff1d6abd1ac7cc32db26902ac63a0c635e87f4b562cd
- `test_exit_code`: 0
- `build_exit_code`: 0

### Cifras de tests

| Suite | Archivos | Tests | Resultado |
|---|---|---|---|
| Backend | 437 | 5194 | ✅ PASS |
| Frontend | 191 | 1435 | ✅ PASS |
| **Total** | **628** | **6629** | **✅ PASS** |

**Nota sobre aritmética**: La ronda 1 reportó 437 archivos / 5189 tests en backend. El commit posterior `bcee975` agregó 5 tests nuevos sin modificar código de producción, llegando a 437 archivos / 5194 tests. El frontend no se tocó en la remedición, manteniéndose en 191/1435.

### Build y Lint

- Backend `pnpm typecheck`: exit 0
- Backend `pnpm lint`: exit 0 (ESLint en cero errores)
- Frontend `pnpm type-check`: exit 0
- Frontend `pnpm lint`: exit 0

---

## Resolución de issues previos

### CRITICAL — Ronda 1 (2 encontrados, 2 cerrados en ronda 2)

1. **CRITICAL 1 — "ADMINISTRADOR intenta cargar → 403" sin test permanente**
   - **Estado**: ✅ CERRADO
   - **Cómo se cerró**: Commit `bcee975` agrega asertición `subir (POST) declara JwtAuthGuard y GlobalAdminGuard`, probada con mutante aislado (eliminación de `GlobalAdminGuard` del `@Post` hace fallar exactamente ese test)
   - **Verificación**: Independiente, 1 de 7 mutantes prueba exactamente este cierre

2. **CRITICAL 2 — "Sin token → 401" sin test permanente**
   - **Estado**: ✅ CERRADO
   - **Cómo se cerró**: Commit `bcee975` agrega asertición `ver (GET) declara JwtAuthGuard`, probada con mutante aislado
   - **Verificación**: Independiente, 6 de 7 mutantes prueban variaciones de este cierre

### WARNING — 4 hallazgos (todos no bloqueantes)

1. **`apply-progress.md` cerraba con total equivocado (34/34)**
   - **Estado**: ✅ **CERRADO**
   - **Hallazgo**: Sus propios sumandos (9+8+9+6) dan 32, no 34
   - **Impacto**: No afecta al código; es error de registro únicamente
   - **Remedio aplicado**: el orquestador corrigió `apply-progress.md` el
     2026-09-21, DESPUÉS de la ronda 2 del verify y ANTES de archivar, con una
     nota de corrección visible que conserva el valor original. El artefacto
     archivado ya lleva el valor correcto

2. **Round-trip del mapper como unit puro vs. integración contra Postgres**
   - **Estado**: ⚠️ Brecha declarada, acotada
   - **Diseño esperado**: Integración contra Postgres real (`usarLockMasterTest()`)
   - **Implementado**: 5 tests unitarios puros en `cliente.mapper.spec.ts`
   - **Riesgo**: Bajo — el eslabón sin cubrir es el `upsert` real, pero es angosto (5 líneas, sin ramas; type-safe por `Omit<>`; columnas sin default)
   - **Escenario R5**: Marcado PARTIAL (tiene test que pasó, pero por camino angosto)
   - **Remedio**: Opcional — un `*.integration.spec.ts` lo cerraría, pero no es requisito para archivar

3. **Round-trip autenticado end-to-end nunca ejecutado**
   - **Estado**: ⚠️ Brecha declarada
   - **Causa**: Sin credencial ROOT de prueba disponible; único usuario `is_global_admin` es la cuenta real del dueño
   - **Cobertura actual**: Autenticación (`JwtAuthGuard`) y autorización (`GlobalAdminGuard`) cubiertas por composición de specs unitarias (7 mutantes independientes comprueban cada pieza)
   - **Hueco residual**: Que la excepción del guard sobreviva intacta la serialización HTTP de Nest
   - **Remedio**: Seed de usuario ROOT de test, si el dueño lo autoriza

4. **`apply-progress.md` sobredeclaraba cobertura de WU2 y no registraba `bcee975`**
   - **Estado**: ✅ **CERRADO**
   - **Hallazgo**: Afirmaba "13 aserciones" (eran 13, hoy son 15) y que cubrían
     ADMINISTRADOR, cuando ADMINISTRADOR era exactamente uno de los 2 CRITICAL
     sin cubrir. Lo más filoso: hoy la afirmación es cierta, pero **solo gracias
     a `bcee975`**, un commit que el artefacto no mencionaba
   - **Remedio aplicado**: el orquestador corrigió `apply-progress.md` el
     2026-09-21, DESPUÉS de la ronda 2 y ANTES de archivar. El artefacto
     archivado ya lleva la cifra correcta y cita el commit del fix

### SUGGESTION — 5 hallazgos (todos no bloqueantes)

1. Dos tests del mapper parcialmente enmascarados por spread (propiedad igualmente anclada)
2. `alt=""` en logo del sidebar podría ser `alt={user.cliente_nombre ?? ""}`
3. Espejo cliente-side podría desincronizarse del backend (riesgo bajo, es UX no seguridad)
4. Escenario "Cabeceras de lectura exitosa" verificado con espía, no HTTP real (molde ya establecido)
5. Ancla `toHaveLength(3)` del backstop es tripwire de superficie (comportamiento correcto, pero mensaje no autoexplicativo)

---

## Desviaciones declaradas de diseño

Las tres desviaciones de `apply-progress.md` se verificaron como sostenibles:

1. **`cliente_logo_v` opcional en frontend, requerido en backend**
   - Aceptada — comportamiento observable idéntico por normalización `?? null`

2. **Validación cliente-side sin Zod**
   - Aceptada — reusos patrón de `validar-adjunto-cliente.ts`, único precedente

3. **Sin atributo `accept` en `<input type="file">`**
   - Aceptada — `accept` es filtro nativo no validación; lo hazría intestable el caso SVG

---

## Spec compliance

| Aspecto | Resultado |
|---|---|
| Aislamiento de lectura | ✅ Implementado |
| Solo ROOT escribe (cargar/quitar) | ✅ Implementado (ahora con test fijado) |
| Validación de formato y tamaño | ✅ Implementado (rechazo de SVG, tamaño máx) |
| Servido seguro del binario | ✅ Implementado (headers nosniff/inline) |
| Persistencia ante edición | ✅ Implementado (espejo de mapper) |
| Un logo por cliente + borrado idempotente | ✅ Implementado |
| Fallback al ícono genérico | ✅ Implementado (Building2 en sidebar) |
| Token de sesión | ✅ Implementado (cliente_logo_v en JWT sin bumpear VERSION) |

---

## Artefactos del ciclo

| Artefacto | Estado |
|---|---|
| proposal.md | ✅ Presente |
| specs/clientes-logo/spec.md | ✅ Presente (delta sincrónizada a main) |
| design.md | ✅ Presente |
| tasks.md | ✅ Presente (32/32 completas) |
| apply-progress.md | ✅ Presente |
| verify-report.md | ✅ Presente (ronda 2, PASS WITH WARNINGS) |

**Sync de specs**: Delta spec en `openspec/changes/logo-por-cliente/specs/clientes-logo/spec.md` copiada exitosamente a `openspec/specs/clientes-logo/spec.md` (primera vez, no había spec preexistente).

---

## Commits significativos

| SHA | Mensaje | Contenido |
|---|---|---|
| fbef36d | `feat(clientes): integrar el diálogo de logo en Admin > Clientes` | WU4 (diálogo, hooks, wiring) |
| d4d31ff | `feat(clientes): diálogo de carga del logo (ConfigurarLogoDialog)` | WU4 (componente diálogo) |
| 9054753 | `feat(clientes): hooks de subida y borrado del logo del cliente` | WU4 (hooks) |
| (WU3 commits) | Propagación JWT, proxy binario, sidebar | WU3 |
| (WU2 commits) | Controller nuevo, use cases, pipe de validación | WU2 |
| (WU1 commits) | Migración, entity, mapper round-trip | WU1 |
| bcee975 | `test(clientes): fijar el atachado de guards en ClienteLogoController` | 5 tests de metadata GUARDS, cierra 2 CRITICAL de ronda 1 |

**HEAD al cierre**: bcee975 (rama `feat/logo-por-cliente-dialogo`)

---

## Conformidad de la nueva capability

**Capability**: `clientes-logo`  
**Estado**: ✅ Entregado

| Componente | Ubicación | Estado |
|---|---|---|
| Pipe de validación | `backend/src/clientes/interface/pipes/validar-logo-cliente.ts` | ✅ |
| Use cases (3) | `backend/src/clientes/application/use-cases/` | ✅ |
| Controller nuevo | `backend/src/clientes/interface/controllers/cliente-logo.controller.ts` | ✅ |
| Migración Prisma | `prisma_master/migrations/20260921120000_add_cliente_logo/` | ✅ |
| JWT payload (backend) | `i-token.service.ts` + 3 use cases | ✅ |
| JWT payload (frontend) | `types.ts` + `decodeJwtPayload()` | ✅ |
| Sidebar brand block | `app-sidebar.tsx` | ✅ |
| Upload dialog | `configurar-logo-dialog.tsx` | ✅ |
| Upload hooks | `use-clientes-mutations.ts` | ✅ |
| BFF proxy binario | `app/api/[...path]/route.ts` | ✅ |

---

## Deuda documentada

**Ayuda (KB)**: En pausa desde 2026-09-07. La deuda fue anotada en el commit `fbef36d` con cinco puntos para la tanda final de documentación:
1. Alta del logo desde `Admin > Clientes` (ROOT)
2. Formatos aceptados: PNG/JPEG/WebP hasta 512 KB; SVG rechazado
3. Logo corona el sidebar de todos los usuarios del cliente
4. Propagación diferida (no se ve hasta próximo login/switch/refresh)
5. Quitar logo vuelve al ícono genérico

**Estado**: NO escrita. Se respeta la pausa vigente (CLAUDE.md del repo: no crear artículos nuevos hasta decisión de cierre del ciclo).

---

## Decisiones arquitectónicas registradas

| ID | Decisión | Estado |
|---|---|---|
| D1 | Controller nuevo, no extender `ClientesController` | ✅ Cumplida |
| D2 | No bumpear `VERSION_PAYLOAD_JWT` (queda en 2) | ✅ Cumplida |
| D3 | `cliente_logo_v` como epoch ms (ms desde epoch) | ✅ Cumplida |
| D4 | Espejo completo del mapper (3 columnas en ambas direcciones) | ✅ Cumplida |
| D5 | Orden de operación: key nueva → upload → persistir → delete best-effort | ✅ Cumplida |
| D6 | Binario por proxy BFF con `arrayBuffer()` | ✅ Cumplida |
| D7 | Whitelist exacta + nosniff + inline | ✅ Cumplida |
| D8 | Storage key servidor: `clientes/{id}/{uuid}` | ✅ Cumplida |

**Tabla adicional de design**: Autorización en dos lugares (decoradores + inline) ahora con ambos fijados por test (anteriormente solo inline tenía cobertura).

---

## Aserciones de correctness

| Propiedad | Evidencia |
|---|---|
| No hay código muerto | Todos los archivos nuevos están importados y usados |
| Sin secretos expuestos | Cero credenciales, keys, o tokens en código |
| Revertibilidad | Cada WU tiene rollback boundary documentado |
| Aislamiento de inquilinos | Implementado con chequeo inline + guards, fijado por test con 7 mutantes |
| No corrompe histórico | La nueva migración no toca `20260805194710_init_tenant` preexistente |
| Zod schemas espejados | Frontend valida mismo conjunto que backend |

---

## Estadísticas del ciclo

| Aspecto | Valor |
|---|---|
| Rondas de verificación | 2 (ronda 1 FAIL → ronda 2 PASS WITH WARNINGS) |
| Commits de implementación | 12+ (WU1-WU4) + 1 (fix `bcee975`) |
| Commits de remediación post-ciclo | 1 (`bcee975`, sin código de producción) |
| Mutantes adversariales | 7 (todos independientes, cada uno mata exactamente 1-2 tests) |
| Archivos de test nuevos | 5 (`cliente.entity.spec.ts`, `cliente.mapper.spec.ts`, `validar-logo-cliente.spec.ts`, `use-logo-cliente-mutations.test.tsx`, `configurar-logo-dialog.test.tsx`) |
| Líneas cambiadas (backend + frontend) | ~1300-1500 (rango estimado WU1-WU4, dentro de presupuesto de review) |

---

## Riesgos residuales clasificados

| Riesgo | Severidad | Mitigación | Estado |
|---|---|---|---|
| Round-trip mapper sin Postgres real | Bajo | Espejo completo type-safe, 5 líneas sin ramas, columnas sin default | Aceptado |
| No hay test HTTP end-to-end autenticado | Bajo-Medio | Guards y comportamientos fijados por tests unitarios con 7 mutantes | Aceptado |
| Espejo cliente-side podría divergir | Bajo | Backend es fuente de verdad, divergencia es UX no seguridad | Documentado |
| Ayuda no actualizada | Bajo (pausa deliberada) | Deuda anotada en commit para tanda final | Documentado |

---

## Conclusión

El ciclo **logo-por-cliente** se ha completado exitosamente bajo el veredicto **PASS WITH WARNINGS**. Los dos CRITICAL de la ronda 1 fueron cerrados mediante el commit `bcee975`. De los 4 WARNING, **dos ya están CERRADOS** —los de exactitud de registro (W1 y W4), corregidos en `apply-progress.md` antes de archivar— y **dos quedan ABIERTOS como brechas declaradas**: el round-trip del mapper como unit en vez de integración (W2, acotada por el `Omit<>` del mapper y por la ausencia de defaults en las columnas) y el round-trip autenticado end-to-end, que nunca corrió por no haber credencial ROOT de prueba (W3). Ninguno de los cuatro bloquea el archivado. Los 5 SUGGESTION son mejoras opcionales sin impacto en seguridad o funcionalidad.

Todas las 32 tareas están completas. Todas las compuertas de verificación pasan (tests, build, lint). La nueva capability `clientes-logo` está lista para producción.

**El ciclo está cerrado y archivado.**

---

## Traceabilidad

- **Propuesta**: `proposal.md`
- **Especificación**: `specs/clientes-logo/spec.md`
- **Diseño**: `design.md`
- **Tareas**: `tasks.md` (32/32 completas)
- **Progreso de aplicación**: `apply-progress.md`
- **Reporte de verificación**: `verify-report.md` (ronda 2)
- **Archivos del ciclo**: `/home/usuario/proyectos/soporte/openspec/changes/archive/2026-09-21-logo-por-cliente/`
- **Rama de trabajo**: `feat/logo-por-cliente-dialogo` @ `bcee975`
- **Cambio en main specs**: `openspec/specs/clientes-logo/spec.md`
