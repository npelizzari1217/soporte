# Apply progress: sla-primera-respuesta-y-pausa

## WU-1 — Estado ESPERANDO_CLIENTE, constantes y guardia (completa)

Modo: estandar (sin TDD estricto). Tareas 1.1 a 1.10 marcadas en `tasks.md`. Rama `feat/sla-primera-respuesta-y-pausa-wu01`, base el tracker `feat/sla-primera-respuesta-y-pausa`.

### Archivos

- Migracion M1 `backend/prisma_tenant/migrations/20261007120000_estado_esperando_cliente/` (`migration.sql` con `ON CONFLICT (codigo) DO NOTHING`, `rollback.sql`).
- `backend/src/tickets/domain/state-machine/estados.constants.ts`: `ESTADOS_RELOJ_CORRE`, `ESTADOS_NO_DESTINO_CORRECTIVO`, `afectaRelojSla`.
- `base-ticket-state-machine.ts`: arcos EN_PROCESO→ESPERANDO_CLIENTE y ESPERANDO_CLIENTE→EN_PROCESO/RESUELTO/CANCELADO.
- `transicionar-estado.use-case.ts`: `saltoCorrectivo` excluye `ESTADOS_NO_DESTINO_CORRECTIVO`.
- `tenant-seeder.adapter.ts`: estado sembrado con `orden` 35.
- Tests: `estados.constants.spec.ts` (nuevo), `base-ticket-state-machine.spec.ts`, `transicionar-estado.use-case.spec.ts`, `tenant-seeder.adapter.spec.ts`, `tenant-seeder.adapter.integration.spec.ts`, `crear-cliente.e2e.spec.ts`; comentarios de "6 estados" actualizados en `tickets.e2e.spec.ts`, `ticket-state-machine.factory.spec.ts`, `i-ticket-state-machine.ts`, `prisma-estado.repository.ts`.

### Work Unit Evidence

| Evidence | Valor |
|---|---|
| Test focal | `pnpm vitest run src/tickets src/catalogos src/clientes`: 108 archivos, 999 tests verdes |
| Runtime harness | Integracion `tenant-seeder.adapter.integration.spec.ts` sobre tenant efimero migrado con `migrate deploy`: M1 deja el estado una vez, reaplicar M1 y `seed()` dos veces no lo duplican; `crear-cliente.e2e.spec.ts` verifica los 7 codigos en orden |
| Rollback | `rollback.sql` de M1 (probado en una transaccion descartada sobre `soporte_tenant_test`); constantes y guardia sin consumidores externos |
| Lint / tipos | `pnpm lint` y `pnpm typecheck` sin errores; ratchet de casts 626 (base 626) |

### Decisiones tomadas en apply

- `afectaRelojSla` se implementa como `corre(anterior) !== corre(nuevo) || nuevo === 'RESUELTO'`. Consecuencias: EN_PROCESO→CANCELADO es verdadero (corre→detenido), ESPERANDO_CLIENTE→CANCELADO y RESUELTO→CERRADO son falsos (ambos detenidos).
- `ESTADOS_RELOJ_CORRE = {NUEVO, ASIGNADO, EN_PROCESO}`.
- El `rollback.sql` reubica tambien `operaciones_ticket.estado_anterior_id/estado_nuevo_id` en EN_PROCESO, ademas de `tickets.estado_id`: ambas son FK a `estados` y sin eso el `DELETE` fallaria con historial.
- El test de M1 vive en el spec de integracion del seeder (ya levanta un tenant efimero migrado) y ejecuta el `migration.sql` real. El caso existente `seed()` borra antes la fila de ESPERANDO_CLIENTE para que pruebe el seed y no la migracion (mismo patron que PREVENTIVO).
- Los "5 specs que cuentan 6 estados": seeder unit, seeder integration, `crear-cliente.e2e`, maquina base y comentario de `tickets.e2e`.
- Frontend (`estado-transitions.ts`, badge) queda en WU-9b, como indica `tasks.md`.
- Ayuda: `ayuda/tickets-listado.md` lista los estados del ticket; no se vuelve falsa (el estado no es alcanzable desde la UI hasta WU-9b). Deuda anotada en el commit.

### Deuda

- Ayuda: estado "Esperando al cliente" en tickets (escritura suspendida).
- M1 no se despliega sin las WU-3 (cadena completa).

## WU-2 — Motor de tiempo habil y medidores (parte 1 de 2: motor, tareas 2.1 a 2.4)

Modo: estandar (sin TDD estricto). Rama `feat/sla-primera-respuesta-y-pausa-wu02`, base `feat/sla-primera-respuesta-y-pausa-wu01`. La WU se partio en dos commits apilados por presupuesto de 400 lineas: este es el motor; los medidores (2.5 a 2.7) van en `...-wu02b`.

### Archivos

- `backend/src/calendario-laboral/domain/services/calcular-sla-habil-vence.service.ts`: `sumarMsHabiles`, `msHabilesEntre`, `LIMITE_DIAS_RANGO = 3_700`; `venceAt` delega en `sumarMsHabiles(creadoEn, horas * 3_600_000)`; `buscarInicioVentanaAbierta` con `tope` opcional (sobrecarga: con `tope` devuelve `null`, sin `tope` lanza como antes).
- Test: `calcular-sla-habil-vence.service.spec.ts` (bloque nuevo; los tests de `venceAt` existentes sin cambios).

### Work Unit Evidence

| Evidence | Valor |
|---|---|
| Test focal | `pnpm vitest run src/calendario-laboral` |
| Runtime harness | N/A: dominio puro, sin frontera de runtime |
| Rollback | Funciones nuevas; `venceAt` conserva su contrato (tests previos intactos) |

### Decisiones tomadas en apply

- `tope` es un `Date`: la busqueda devuelve `null` si el dia candidato empieza en o despues del tope, o si agota la cota. `msHabilesEntre` ademas valida upfront que el rango no pase de 3.700 dias (lanza), y acota las iteraciones.
- `sumarMsHabiles` exige `ms` finito y `>= 0` (no entero): `venceAt` con horas fraccionarias sigue funcionando como antes. Con `ms = 0` devuelve `desde` sin alinear a ventana.
- Sin redondeo en el motor; el redondeo a segundos por tramo queda en `RelojSla` (WU-3b).
- El limite de 400 ventanas se prueba con un calendario de 7 dias abiertos: 400 pasan y 402 lanzan.

### Deuda

- Ayuda: ninguna (no visible para el usuario).

## WU-2 — parte 2 de 2: medidores (tareas 2.5 a 2.7)

Rama `feat/sla-primera-respuesta-y-pausa-wu02b`, base `feat/sla-primera-respuesta-y-pausa-wu02`. Con esta parte la WU-2 queda completa.

- `backend/src/sla/domain/services/`: `medidor-tiempo-sla.ts` (`MedidorTiempoSla { entre; sumar }`), `medidor-habil.ts` (servicio, calendario y feriados vigentes por constructor), `medidor-corrido.ts` (tiempo de pared). Test: `medidores-sla.spec.ts`.
- Evidencia: `pnpm vitest run src/calendario-laboral src/sla/domain` verde; dominio puro, sin runtime harness (N/A). Rollback: archivos nuevos sin consumidores.
- Ayuda: ninguna deuda.
