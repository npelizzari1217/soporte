# jd-tiempo-tecnico — correcciones del judgment-day de tiempo-tecnico

Corrige las advertencias y sugerencias del judgment-day del 2026-10-26 sobre `78388820..8ba22465`
(ver `odd/tasks/tiempo-tecnico.md`, L16). Rama `fix/jd-tiempo-tecnico`.

## Specs

- **S1 — JD-B-003: una medición que falla no bloquea el ticket.** "si esa lectura falla, el catch
  devuelve null con la transacción ya abortada y el cambio de estado sale en 500 (rollback, sin
  pérdida de datos) en vez de cerrar el tramo con `habil_s` NULL". Las lecturas de la base del tenant
  que necesita la medición se hacen fuera del `try`; dentro queda solo lo que no aborta la
  transacción (feriados de master, cálculo).
- **S2 — JD-A-002: estado al inicio de un ticket sin historial.** "un ticket importado sin historial
  de `CAMBIO_ESTADO` cuenta como tiempo corrido una espera al cliente previa al tramo". Sin cambio
  anterior al inicio, el estado al inicio es el `estado_anterior` del primer cambio dentro del tramo;
  sin ningún cambio, el estado del ticket antes del guardado que cierra el tramo.
- **S3 — JD-B-002: la transacción del save no consulta master.** "la transacción del save suma
  lecturas (incluye feriados de master) bajo el timeout de 5 s".
- **S4 — JD-A-001: dashboard por técnico coherente.** "en el dashboard por técnico, el alcance por
  fila mira el asignado actual, no el del tramo".
- **S5 — JD-B-005: guardado del horario por técnico aislado.** "la mutación de guardado del horario
  por técnico es compartida entre técnicos".
- **S6 — Runbook.** "runbook con comentarios de estado vencidos (líneas ~1590 y ~1614)".
- **S7 — JD-A-005.** "reset del form del técnico al guardar el del tenant".
- **S8 — JD-A-003 / JD-B-006.** "el cumplimiento cuenta tramos y no tickets".

## Tasks

- [x] T1 — S1 (bugfix, TDD)
- [x] T2 — S2 (bugfix, TDD)
- [x] T3 — S6 (docs)
- [x] T4 — S3
- [x] T5 — S4
- [x] T6 — S5, S7 (frontend)
- [x] T7 — S8

## Log

- **L1 — Pedido del dueño (2026-10-26):** "Vamos a corregir todo, comencemos con las mas importantes
  luego col las frases y continuamos con lo que queda. Me vas a avisar los avances que tienes"
- **L2 — T1 (JD-B-003).** RED: "un error de la base del tenant al leer el horario se propaga y no cierra
  el tramo" falló con `promise resolved "undefined" instead of rejecting`. GREEN: `obtenerParaUsuario`
  sale del `try` en `medir()`; la falla de feriados (master) sigue cerrando con `habil_s` NULL.
  `src/tiempo-tecnico` 108/108, lint y typecheck limpios.
- **L3 — T2 (JD-A-002).** RED: dos tests del servicio ("la espera al cliente previa al primer cambio no
  suma", "sin ningún cambio durante el tramo, mide con el estado que tenía el ticket") fallaron con
  `habilS` 10800 y 7200 en vez de 3600 y 0. GREEN: `medirSegundosHabiles` toma el estado al inicio del
  `estado_anterior` del primer cambio posterior o, sin cambios, del estado previo al guardado que cierra;
  `listarCambiosEstado` lee `estadoAnterior`. Test de integración nuevo; sin la lectura en Prisma da
  10800 (verificado revirtiendo el repo). Los escritores de `CAMBIO_ESTADO` ya registran el estado
  anterior; los `null` del código son de `ASIGNACION`. `src/tiempo-tecnico` verde, lint y typecheck limpios.
- **L4 — T3 (runbook).** Reescritas las dos frases de estado vencidas de "Horario laboral por usuario"
  y "Tramos del técnico" con lo que sí entró: la sección "Horario por técnico" y el bloque "Tiempo del
  técnico" con el dashboard. `runbook-migraciones.spec.ts` verde.
- **L5 — Decisiones del dueño (2026-10-26).** B-002: "Caché de feriados (Recomendado)" — los feriados
  se guardan en memoria unos minutos; un feriado nuevo tarda hasta ~5 min en contar. A-001: "Siempre
  sus tramos (Recomendado)" — el técnico ve en su fila todos los tramos que resolvió, aunque hoy el
  ticket esté asignado a otro. Cumplimiento: "Contar tramos (actual)" — cada resolución es una
  evaluación; solo se aclara en la UI que son resoluciones, no tickets.
- **L6 — T6: B-005 tal como lo planteó el juez no se reproduce.** `elegir()` hace `guardarMutation.reset()`
  y el técnico nuevo no hereda el "guardando". El defecto real: ese `reset()` descarta los callbacks del
  `mutate`, y el fallo del guardado del técnico anterior queda sin aviso. RED: `toast.error` 0 llamadas.
  A-005 RED: el lunes editado volvía a quedar marcado tras el refetch. Fix: los avisos pasan a las
  opciones del hook; el form sincroniza con `keepDirtyValues` y sus `setValue` llevan `shouldDirty: true`
  (sin eso RHF no sabía qué estaba editado).
- **L7 — T6 cerrada.** Frontend completo: lint y type-check limpios, 290 archivos / 2680 tests verdes.
- **L8 — T5 (JD-A-001).** RED: "TECNICO: su fila de cumplimiento cuenta todos sus tramos" falló con
  `expected { …(4) } to not have property "alcance"`. GREEN: la fila propia de un TECNICO no lleva el
  alcance por fila; `tecnico_id = actorId` ya la limita. El caso COLABORADOR con alcance sigue igual.
  `src/dashboard` 62/62.
- **L9 — T4 (JD-B-002).** `FeriadosGlobalesCache` en `calendario-laboral`: copia en memoria de los
  feriados de master, TTL 5 min, invalidada por `PrismaFeriadoGlobalRepository` al crear, editar o
  borrar. Los feriados propios del cliente se siguen leyendo siempre. Tests de la caché (vigencia,
  vencimiento, invalidación, lecturas simultáneas, fallo no guardado), de la lectura compartida y de la
  invalidación por escritura (y no al fallar). Pendiente: suite completa del backend.
- **L10 — T7 (JD-A-003 / JD-B-006).** Por L5 se siguen contando tramos. La columna pasa a "Resoluciones
  evaluadas" y debajo de la tabla se aclara: "Cada resolución se evalúa por separado: un ticket
  reabierto y vuelto a resolver suma dos." Con la lista vacía no aparece. `src/features/dashboard` 39/39.
  Ayuda (suspendida): anotar el cambio de nombre de la columna para la tanda final.
- **L11 — Verify independiente: blocker en S7 (regresión de T6).** `reset(..., { keepDirtyValues: true })`
  deja los campos guardados marcados como editados: tras guardar y "Volver al horario del cliente", la
  grilla decía "usa el horario del cliente" con el lunes viejo. RED: dos tests ("después de guardar,
  datos nuevos del servidor reemplazan también los días editados"; "volver al horario del cliente
  muestra el del cliente aunque hubiera ediciones sin guardar"). GREEN: el form recuerda el submit y,
  sin error del servidor, la respuesta reemplaza la grilla entera; la `key` de la sección incluye el
  origen. RDD: assess medio, `reviewDue: false` → sin revisión nativa; verify cubre.
  Frontend completo: lint y type-check limpios, 290 archivos / 2683 tests verdes.
