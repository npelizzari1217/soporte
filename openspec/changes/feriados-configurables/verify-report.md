```yaml
schema: gentle-ai.verify-result/v1
evidence_revision: sha256:9344b1aa156b5794e4aa7ade14d4a419499f98622c26a2f142ad2cc5ff8c42b0
verdict: pass_with_warnings
blockers: 0
critical_findings: 0
requirements: 13/13
scenarios: 21/21
test_command: "backend: pnpm vitest run src/calendario-laboral src/sla src/tickets; frontend: pnpm vitest run src/features/feriados src/shared/nav; root: node scripts/check-roadmap-fresco.mjs"
test_exit_code: 0
test_output_hash: sha256:0cfa9411eb2de82163bdcaa3f0c1f5297a041560caf8d6246fe1c9a08458cc68
build_command: "backend: pnpm lint && pnpm typecheck; frontend: pnpm lint && pnpm type-check"
build_exit_code: 0
build_output_hash: sha256:af46087fa728552bdfa222bb361e7b6d1844e9982d49c542050cf789a8f7b507
```

## Reporte de verificación

**Cambio**: feriados-configurables (issue #216)
**Versión**: N/A
**Modo**: Estándar (feature; TDD estricto no activo)
**Candidato**: `feat/feriados-configurables-wu8c` en `0dbe02d`, comparado contra `main` (`4a39017`): 89 archivos, +7734/-81. El `evidence_revision` es un sha256 sobre `git rev-parse HEAD` más `git diff main...HEAD`.

### Completitud

| Métrica | Valor |
|--------|-------|
| Tareas totales | 49 |
| Tareas completas | 49 |
| Tareas incompletas | 0 |

`gentle-ai sdd-status feriados-configurables` reportó `next: verify`, `apply: all_done`, 49/49.

### Ejecución de build y tests

**Build**: Aprobado

```text
backend  pnpm lint        -> eslint . , exit 0, sin hallazgos
backend  pnpm typecheck   -> tsc --noEmit -p tsconfig.typecheck.json, exit 0
frontend pnpm lint        -> "No ESLint warnings or errors", exit 0
frontend pnpm type-check  -> tsc --noEmit, exit 0
```

**Tests**: 794 aprobados / 0 fallidos / 0 omitidos (focalizados)

```text
backend  pnpm vitest run src/calendario-laboral src/sla src/tickets -> 83 files, 723 tests passed, exit 0 (real Postgres, soporte-postgres-master)
frontend pnpm vitest run src/features/feriados src/shared/nav     -> 7 files, 71 tests passed, exit 0
root     node scripts/check-roadmap-fresco.mjs                     -> "El roadmap esta fresco.", exit 0
```

El orquestador también reportó las suites completas en verde sobre este árbol: backend 5360 tests y frontend 1490 tests. Esta fase no las volvió a correr.

**Cobertura**: No disponible (umbral 0 en `openspec/config.yaml`).

### Matriz de cumplimiento de spec

**feriados-globales** (5 requerimientos, 7 escenarios)

| Requerimiento | Escenario | Código | Test | Resultado |
|---|---|---|---|---|
| Escrituras solo-ROOT | Un actor no-ROOT intenta una escritura | `feriados.controller.ts:68` (class `JwtAuthGuard`), `:99`, `:122`, `:147` (`GlobalAdminGuard` per method) | `feriados.e2e.spec.ts > Guard matrix > [CRITICAL] POST/PATCH/DELETE con token no-ROOT -> 403`; `feriados.controller.spec.ts > %s exige ROOT` | COMPLIANT |
| Escrituras solo-ROOT | ROOT realiza una escritura | mismo controller + `crear/editar/eliminar-feriado-global.use-case.ts` | `feriados.e2e.spec.ts > ROOT crea (201) ... read-back`, `ROOT edita`, `ROOT elimina (204) y deja de aparecer` | COMPLIANT |
| Lectura autenticada | Cualquier usuario autenticado lee | `feriados.controller.ts:83-90` (sin guard de método) | `feriados.e2e.spec.ts > GET /feriados con token no-ROOT -> 200`; `feriados.controller.spec.ts > GET NO declara GlobalAdminGuard` | COMPLIANT |
| Lectura autenticada | Sin token | clase `JwtAuthGuard` | `feriados.e2e.spec.ts > GET /feriados sin token -> 401` | COMPLIANT |
| Feriados sembrados sin cambios | Las filas sembradas se mantienen | sin `prisma_master` en el diff | `feriados.e2e.spec.ts:365 > las 46 filas sembradas ... permanecen` | PARTIAL: el test cuenta 46 filas pero no verifica `fecha`/`descripcion` (W2) |
| Integridad de lectura de la fecha | Ida y vuelta de una fecha guardada | `fecha-calendario.ts:55-57` (`aDateUtc`), `prisma-calendario-laboral.mapper.ts:85` (`claveDiaUtcDe`) | `feriados.e2e.spec.ts > ROOT crea ... MISMA fecha calendario`; `prisma-calendario-laboral.mapper.spec.ts > claveDiaUtcDe` | COMPLIANT (ver W1: el guard depende de la zona horaria) |
| Vista de lista ordenada por fecha | La lista se renderiza ordenada con badge verde | `feriados-globales-admin-view.tsx`, `origen-feriado-badge.tsx:18-21`, `badge.tsx` `success-light` | `feriados-globales-admin-view.test.tsx > renderiza la lista ordenada ... badge verde`; `origen-feriado-badge.test.tsx > GLOBAL ... success-light`; orden en el backend en `feriados.e2e.spec.ts > GET /feriados devuelve la lista ordenada` | COMPLIANT |

**feriados-cliente** (8 requerimientos, 14 escenarios)

| Requerimiento | Escenario | Código | Test | Resultado |
|---|---|---|---|---|
| Admin por cliente administra; los demás leen | ADMINISTRADOR de A administra los feriados de A | `feriados-cliente.controller.ts:78` (clase `JwtAuthGuard, TenantGuard`), `:100/:117/:138` (`AdminClienteGuard`) | `feriados-cliente.e2e.spec.ts > A crea un feriado propio -> 201`, `ROOT con cliente_id=A -> POST 201`; editar/eliminar en `editar-/eliminar-feriado-cliente.use-case.spec.ts` y `prisma-feriado-cliente.repository.integration.spec.ts > CRUD` | COMPLIANT (editar/eliminar por un admin no se ejerce por HTTP, W3) |
| Admin por cliente administra; los demás leen | Un rol no-admin intenta una escritura | mismo | `feriados-cliente.e2e.spec.ts > Rol no-admin de A > POST/PATCH/DELETE -> 403`, `GET -> 200` | COMPLIANT |
| Aislamiento entre clientes | El cliente A nunca ve los feriados de B | `prisma-feriado-cliente.repository.ts:19-21` (`TenantContext.getClient()`) | `feriados-cliente.e2e.spec.ts > A crea ...; B NO lo lista (y viceversa)`, `:id de B -> 404 al PATCH/DELETE desde A; la fila de B no cambia` | COMPLIANT |
| Rechazo de global / unicidad por inquilino | Colisiona con un feriado global | `crear-feriado-cliente.use-case.ts:64-67`, `editar-feriado-cliente.use-case.ts:76-79`, `feriados-globales-master.checker.ts:27-33` | `feriados-cliente.e2e.spec.ts > fecha ya global (2026-12-25) -> 422`; both use-case specs `FeriadoFechaEsGlobalError ... sin llamar` | COMPLIANT |
| Rechazo de global / unicidad por inquilino | Colisiona con su propio feriado | `@unique fecha` + P2002 mapping (`crear-feriado-cliente.use-case.ts:71-78`) | `feriados-cliente.e2e.spec.ts > fecha duplicada dentro del propio listado de A -> 422` | COMPLIANT |
| Unión de SLA HABIL | Salta los feriados globales y los propios del cliente | `prisma-feriados-laborales.repository.ts:61-81` | `aplicar-sla-habil-feriados.e2e.spec.ts > [CRITICAL] crea con union ...` (asserts `2031-04-11T21:00Z`) | COMPLIANT |
| Unión de SLA HABIL | Nunca salta el feriado de otro cliente | mismo (cliente del inquilino solo desde el contexto bindeado) | mismo e2e (el 04-10 de B se cuenta como día laborable); integración `incluye la UNION` | COMPLIANT |
| Unión de SLA HABIL | La repriorización aplica la misma unión | `aplicar-sla.listener.ts:56-70` -> mismo repository | mismo e2e (verifica `2031-04-14T21:00Z`) | COMPLIANT |
| Unión de SLA HABIL | Los tickets ya abiertos no se recalculan | ningún camino de escritura dispara un recálculo | mismo e2e (un feriado del cliente A agregado después deja `sla_vence_at` sin cambios) | COMPLIANT (un feriado global agregado después no se ejerce, S2) |
| Falla cerrado | Un contexto de inquilino no bindeado falla cerrado | `prisma-feriados-laborales.repository.ts:62-65` | `prisma-feriados-laborales.repository.spec.ts > lanza FeriadosSinTenantContextError y nunca consulta Prisma`; integration `lanza ... sin TenantContext bindeado` | COMPLIANT |
| Falla cerrado | El cálculo de SLA fallido se loguea | `aplicar-sla.listener.ts:45-53`, `:63-69`; wiring en `sla.module.ts:155-158` | `aplicar-sla.listener.spec.ts > [D10] onTicketCreado/onTicketReprioritizado ... ILogger.error ... sin objeto crudo`, `[CRITICAL] ... NUNCA se propaga` | COMPLIANT |
| Vista combinada con badges | La lista combinada se renderiza con badges distintos | `combinar-feriados.ts:30-40`, `feriados-list-view.tsx:74-103`, `origen-feriado-badge.tsx:18-21`, `globals.css` `--info*` en claro y oscuro | `feriados-list-view.test.tsx > combina ambas listas ordenadas ... badge`, `ADMINISTRADOR ve Acciones solo en la fila CLIENTE`; `origen-feriado-badge.test.tsx` | COMPLIANT (sin chequeo visual en un navegador real, W5) |
| Integridad de fecha (tabla del inquilino) | Ida y vuelta de una fecha de cliente guardada | `prisma-feriado-cliente.mapper.ts`, `claveDiaUtcDe` compartida | `feriados-cliente.e2e.spec.ts > la fecha creada se lee de vuelta idéntica`; `prisma-feriado-cliente.repository.integration.spec.ts > round-trip de fecha` | COMPLIANT (ver W1) |
| Cierre del roadmap | El chequeo de frescura pasa | `docs/roadmap-comercial.md` Punto 5 (por cláusula Cumplida/Desviación) | `node scripts/check-roadmap-fresco.mjs` -> exit 0 | COMPLIANT |

**Resumen de cumplimiento**: 21/21 escenarios tienen un test que los cubre y que pasó en runtime. Uno es PARTIAL (el escenario de filas sembradas, W2). Tres llevan notas (W1, W3, S2).

**Regla del roadmap (`soporte/CLAUDE.md`)**: ambas specs citan `docs/roadmap-comercial.md`, "Decisiones de producto ya cerradas", Punto 5.
- "feriados nacionales AR precargados más excepciones por cliente" se convirtió en requerimientos con escenarios.
- "calendario por cliente 9-18 lun-vie" se declara de antemano como una desviación, con su motivo.
- "próxima ventana hábil" se cita como ya entregada.

El roadmap ahora declara cada cláusula (Cumplida, Cumplida, Desviación), y el chequeo de frescura pasa.

### Mutaciones adversariales

Cada mutación se aplicó en el working tree, se corrieron los tests focalizados, y el archivo se restauró con `git checkout --`. `git status` quedó limpio después de cada una. El único archivo sin trackear es el ya preexistente `openspec/changes/feriados-configurables/.gentle-ai-instance`.

| # | Mutación | Resultado | Test(s) que fallan |
|---|---|---|---|
| M1 | Unión: reemplazar `tenantClient.feriadoCliente.findMany()` por `[]` | CAPTURADA (4) | `aplicar-sla-habil-feriados.e2e.spec.ts > [CRITICAL] crea con union ...`; integration `incluye la UNION ...`; unit `devuelve la union ...`, `mapea la medianoche UTC ... ambas fuentes` |
| M2 | Falla cerrado: `throw FeriadosSinTenantContextError` -> `return new Set()` | CAPTURADA (2) | unit `lanza FeriadosSinTenantContextError y nunca consulta Prisma`; integration `lanza ... sin TenantContext bindeado` |
| M3 | Quitar `AdminClienteGuard` de `POST /feriados-cliente` | CAPTURADA (2) | `feriados-cliente.controller.spec.ts > POST ... declara AdminClienteGuard`; `feriados-cliente.e2e.spec.ts > Rol no-admin de A > [CRITICAL] POST -> 403` |
| M3b/M4 | Quitar el guard de escritura de `DELETE` en ambos controllers | CAPTURADA (4) | both `controller.spec.ts > DELETE ... declara ...Guard`; `feriados-cliente.e2e > DELETE -> 403`; `feriados.e2e > DELETE con token no-ROOT -> 403` |
| M5 | Eliminar `logger.error` en `onTicketCreado` | CAPTURADA (2) | `aplicar-sla.listener.spec.ts > [D10] onTicketCreado ... ILogger.error ...`, `... loguea "error desconocido"` |
| M6 | Eliminar `logger.error` en `onTicketReprioritizado` | CAPTURADA (1) | `aplicar-sla.listener.spec.ts > [D10] onTicketReprioritizado ... ILogger.error ...` |
| M7 | Saltear el chequeo de `esGlobal` al editar del lado del cliente | CAPTURADA (1) | `editar-feriado-cliente.use-case.spec.ts > falla con FeriadoFechaEsGlobalError ...` |
| M7b | Saltear el chequeo de `esGlobal` al crear del lado del cliente | CAPTURADA (2) | `crear-feriado-cliente.use-case.spec.ts > falla con FeriadoFechaEsGlobalError ...`; `feriados-cliente.e2e > fecha ya global -> 422` |
| M8 | `claveDiaUtcDe`: getters UTC -> getters locales (trampa de `@db.Date`) | **SOBREVIVIÓ bajo el TZ por defecto (Europe/Madrid, UTC+2): 147/147 en verde. CAPTURADA bajo `TZ=America/Argentina/Buenos_Aires`: 18 fallos** | bajo ART: `feriados.e2e > ... MISMA fecha calendario`, `feriados-cliente.e2e > ... sin corrimiento UTC-3`, `prisma-calendario-laboral.mapper.spec.ts > claveDiaUtcDe ...`, `prisma-feriado-cliente.repository.integration.spec.ts > round-trip ...`, y 14 más. Ver W1 |
| M9 | Frontend: renderizar acciones en filas GLOBAL | CAPTURADA (3) | `feriados-list-view.test.tsx > ADMINISTRADOR ve Acciones solo en la fila CLIENTE ...` (+2) |
| M10 | Frontend: badge de CLIENTE -> `success-light` | CAPTURADA (2) | `origen-feriado-badge.test.tsx > CLIENTE ... info variant`, `... never share a variant class` |
| M11 | Frontend: mostrar la columna de escritura a los no-admin | CAPTURADA (2) | `feriados-list-view.test.tsx > un rol no admin (TECNICO) no ve ninguna accion ...` (+1) |
| M12 | Nav: `/feriados` visible solo para ROOT | CAPTURADA (2) | `nav-config.test.ts > TECNICO sin permisos -> ve /feriados`, `ADMINISTRADOR -> tambien ve /feriados`. El primer intento editó un comentario y se rehizo sobre la línea real de la propiedad |
| M13 | `combinarFeriados` devuelve la lista sin ordenar | CAPTURADA (3) | `combinar-feriados.test.ts > fechas intercaladas ... ordenadas`; `feriados-list-view.test.tsx > combina ambas listas ordenadas ...` (+1) |

En el árbol sin mutar, la misma corrida del alcance de backend bajo `TZ=America/Argentina/Buenos_Aires` pasó: 24 archivos, 156 tests.

### Revisión de aislamiento del inquilino

- `feriados_cliente` se toca en exactamente dos lugares:
  - `prisma-feriado-cliente.repository.ts:24-45`, a través de `TenantContext.getClient()`, que lanza cuando no está bindeado (`tenant-context.ts:91-97`).
  - `prisma-feriados-laborales.repository.ts:62-70`, que lanza `FeriadosSinTenantContextError` cuando no está bindeado.
- Ningún código lo lee fuera de un contexto bindeado. Ningún script, seed o código master referencia la tabla.
- Los casos de uso del inquilino (`Crear/EditarFeriadoCliente`) reciben solo `IFeriadoClienteRepository` (del inquilino) y `Pick<IFeriadosGlobalesChecker,'esGlobal'>`. El checker es de master de solo lectura, con un único `findUnique ... select id` (`feriados-globales-master.checker.ts:27-33`).
- `IFeriadoGlobalRepository` se inyecta solo en los cuatro casos de uso globales, que están detrás de `GlobalAdminGuard`. Ningún caso de uso acotado al inquilino puede escribir en master.
- `FeriadosClienteController` bindea el inquilino desde el JWT (`TenantGuard`) y no tiene `clienteId` como parámetro. La corrida e2e confirma que un `:id` entre inquilinos devuelve 404 y que la fila de B queda intacta.

### Corrección (evidencia estática)

| Requerimiento | Estado | Notas |
|---|---|---|
| Escrituras globales solo-ROOT | Implementado | `JwtAuthGuard` a nivel de clase, `GlobalAdminGuard` por método de escritura |
| Lectura autenticada | Implementado | |
| Filas sembradas sin cambios | Implementado | Sin migración de master en el diff |
| Integridad de fecha (ambas tablas) | Implementado | Un único camino de conversión: `aDateUtc` al escribir, `claveDiaUtcDe` al leer |
| Separación admin/lectura del cliente | Implementado | `AdminClienteGuard` solo por método de escritura |
| Aislamiento | Implementado | Estructural, a través de `TenantContext` |
| Deduplicación global / dentro de la misma lista | Implementado | `esGlobal` al crear y editar. Los duplicados dentro de la misma lista dependen solo de P2002 (W4) |
| Unión de SLA | Implementado | `Set` unión, firma del port sin cambios |
| Falla cerrado + logging | Implementado | Lanza excepción ante un contexto no bindeado. El listener solo loguea un mensaje, nunca el objeto de error crudo |
| Vista combinada + badges | Implementado | Merge del lado del cliente. Las filas GLOBAL nunca llevan acciones |
| Cierre del roadmap | Implementado | |

### Coherencia (diseño)

| Decisión | ¿Se siguió? | Notas |
|---|---|---|
| D1 tabla del inquilino | Sí | Timestamp de migración `20260924130000` en lugar de `20260925120000`. Es la migración de inquilino más reciente, así que el orden es correcto |
| D2 implementación única de la trampa UTC | Sí | Se promovió `claveDiaUtcDe`, usada por ambos mappers y por la unión |
| D3 lanzar excepción en falla cerrado | Sí | |
| D4 checker de solo lectura, crear + editar | Parcial | Sin pre-chequeo dentro de la misma lista (solo P2002), pero apply-progress WU4a dice "Deviations: None" (W4) |
| D5/D6 guards, sin chequeo inline | Sí | |
| D7 mapeo HTTP | Sí | |
| D8 frontend | Desviado (aceptado) | `/feriados` en lugar de `/admin/feriados`; ver más abajo |
| D9 fuente espejo | Sí | `limites.ts` con un test centinela |
| D10 logging del listener vía `ILogger` | Sí | |

**Desviaciones declaradas: juicio**

| Desviación | Veredicto | Motivo |
|---|---|---|
| Pantalla del cliente en `/feriados` en lugar de `/admin/feriados` | ACEPTAR | La spec otorga acceso de lectura a todos los roles del cliente. `admin/layout.tsx` bloquearía a los no-admin. Las escrituras quedan gateadas por `esAdminCliente` dentro de la vista, lo que M11 confirma. La visibilidad en el nav está testeada, lo que M12 confirma |
| Módulo `api.ts` de funciones planas | ACEPTAR | Necesario para que `combinarFeriados` pueda combinar dos endpoints. No tiene hooks adentro y no evita ningún patrón |
| `FeriadoFormDialog` compartido (renombrado en `58be13a`) | ACEPTAR | Los hooks de mutación se inyectan y se llaman dentro del diálogo, así que se respetan las reglas de hooks. Los tests de ambas pantallas están en verde |
| Timestamp de la migración | ACEPTAR | Aditiva, y la más reciente de la cadena del inquilino |
| Enmienda de spec sobre el barrido | ACEPTAR | Se verificó que `findVencibles` (`prisma-sla-ticket-query.repository.ts:31-42`) solo compara `slaVenceAt < now` y nunca lee feriados |
| Logging del listener agregado al alcance | ACEPTAR | Sin él, la excepción de falla cerrado sería silenciosa. Está cubierto por los tests de D10 y por M5/M6 |

### Hallazgos

**CRÍTICO**: Ninguno.

**ADVERTENCIA**:
- **W1: Los tests de integridad de fecha dependen de la zona horaria del runner.** La suite no fija una zona horaria. En esta máquina (Europe/Madrid, UTC+2), la medianoche UTC nunca cruza un límite de día, así que la mutación M8 (getters locales en `claveDiaUtcDe`) sobrevive los 147 tests de `calendario-laboral` tests bajo `TZ=America/Argentina/Buenos_Aires` la misma mutación falla en 18 tests. El código es correcto. La debilidad está en el harness de tests, y es previa a este cambio: el mapper viene de `sla-habil`. El efecto es que los escenarios "Date read-back integrity" de ambas specs no están realmente guardados en esta máquina. Recomendación: fijar `TZ` en `backend/vitest.config.ts` o en el script de test (por ejemplo `America/Argentina/Buenos_Aires`) como seguimiento.
- **W2: El escenario de filas sembradas solo está parcialmente cubierto.** `feriados.e2e.spec.ts:365` verifica la cantidad (46) pero no `fecha`/`descripcion` que nombra la spec. La evidencia estática cubre el hueco: el diff no toca ni `prisma_master` ni ninguna migración.
- **W3: La edición y el borrado de feriados de cliente por un admin no se ejercen por HTTP.** Están cubiertos por tests unitarios de casos de uso, por el test de integración del repositorio (Postgres real) y por tests de metadata de guards. No se ejercen a través del e2e por un ADMINISTRADOR.
- **W4: La desviación de D4 no está declarada.** El diseño dice que el duplicado dentro de la misma lista se pre-chequea y que además se captura P2002. La implementación solo captura P2002. El comportamiento cumple la spec, que el e2e confirma con un 422. apply-progress WU4a dice "Deviations: None" mientras su propio texto dice "no separate pre-check".
- **W5: Ítem abierto.** No hay chequeo visual en un navegador real de los badges verde y azul pálido en los temas claro y oscuro. Solo se verifican las clases de variante y los ratios de contraste calculados.
- **W6: Ítem abierto.** La nota de deuda de Ayuda todavía no está en ningún cuerpo de PR, porque no hay PRs abiertas. Está en los cuerpos de los commits. Los Success Criteria de la propuesta la exigen en el cuerpo de la PR.

**SUGERENCIA**:
- S1: Los casos e2e 403 de `PATCH`/`DELETE` no-ROOT y no-admin usan UUIDs aleatorios. M3b/M4 muestran que igual distinguen 403 de 404. Apuntar a una fila existente también probaría "ninguna fila cambió".
- S2: El e2e de "tickets ya abiertos" agrega un feriado de cliente después del hecho. Agregar un feriado global después también cubriría la otra mitad de la redacción de ese escenario. Ningún camino de código recalcula en ninguna de las dos escrituras.

### Veredicto

**PASS WITH WARNINGS**

Las 49 tareas están hechas. Los 13 requerimientos y los 21 escenarios tienen tests de runtime que pasan, y las compuertas de lint, tipos y tests focalizados están en verde. 13 de 14 sondas de mutación fueron capturadas. La sobreviviente, M8, solo sobrevive en una zona horaria con offset UTC positivo, lo cual es una debilidad del harness de tests y no un defecto de código, así que es W1 y no un bloqueante.
