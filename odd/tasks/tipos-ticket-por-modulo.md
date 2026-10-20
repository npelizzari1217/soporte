# Tipos de ticket utilizables y acotados por módulo

Rama: `fix/tipos-ticket-por-modulo`. El módulo sigue siendo la unidad que decide qué ve y
atiende un técnico (decisión del dueño, L3). Este documento hace que un tipo nuevo sea usable en
el alta de su módulo y que cada usuario vea solo los tipos de sus módulos.

## Specs

- **S0** — El combo "Cualquier asignado" del listado de tickets ofrece solo agentes asignables
  (rol `TECNICO` o `COLABORADOR`, mismo criterio que `ListarTecnicosAsignablesUseCase`), nunca
  usuarios finales. (L1)
- **S1** — "un tecnico ve todos los tipos de ticket y deberia ver solo lo que le compete": el combo
  "Tipo" del listado `/tickets` ofrece solo los tipos cuyo `modulo` está entre los módulos del
  usuario. ROOT y ADMINISTRADOR (todos los módulos) siguen viendo todos.
- **S2** — "asi como esta no sirve de nada dar de alta mas tipos de no se puede utilizar": el alta
  de Edilicia (reparación) permite elegir el tipo entre los tipos ACTIVOS de módulo `EDILICIA`,
  excluido `PREVENTIVO` (lo genera solo el barrido preventivo). Sin elección, el tipo es `EDILICIA`
  como hasta hoy. El backend acepta un `tipoId` opcional y rechaza con error de dominio un tipo
  inexistente, inactivo, de otro módulo o `PREVENTIVO`.
- **S3** — El alta genérica `POST /tickets` rechaza un `tipoId` cuyo `modulo` no sea `TICKETS`
  (hoy solo valida existencia y actividad). Es el espejo en el backend del filtro que ya aplica
  la pantalla.
- **S4** — Al crear o cambiar el módulo de un tipo solo se puede elegir `TICKETS` o `EDILICIA`,
  los únicos módulos cuyas altas usan un tipo elegible. `COMPRAS` y `EQUIPOS` no crean tickets
  con tipo elegible. Un tipo que ya tenga uno de esos módulos puede seguir editándose sin cambiar
  el módulo, y el selector lo muestra como valor vigente en vez de caer a otra opción.

## Tasks

- [x] T0 — S0 — inline — `6baf546d`
- [x] T1 — S1 — inline — `06e2bab6`
- [x] T2 — S3 — inline — `e5d2ca98` (opcional `moduloRequerido`: el preventivo y la API de integraciones reusan el caso de uso con otros módulos)
- [x] T3 — S2 — inline — `184f7447`
- [x] T4 — S4 — inline — `b4376fbc`; fixture e2e de T2 en `143edc5c`

## Log

- **L1** (2026-10-21, dueño): "En ticket cuando vay al listado puedo filtrar poc cualquier
  asignado, ese combo box solo debe mostrar a los tecnicos ya que los usuarios nunca pueden ser
  asignados a una tarea"
- **L2** (2026-10-21, dueño): "Encuentro dos problemas, el primero es que asi como esta no sirve
  de nada dar de alta mas tipos de no se puede utilizar, y por otro lado veo que un tecnico ve
  todos los tipos de ticket y deberia ver solo lo que le compete"
- **L3** (2026-10-21, dueño): eligió "Por módulo, como hoy" frente a "Por tipo de ticket".
- **L4** (evidencia): `MANTENIMIENTO` ya existe sembrado con módulo `EDILICIA`
  (`tenant-seeder.adapter.ts:157`), y el alta edilicia fija `TIPO_CODIGO_EDILICIA`
  (`crear-ticket-edilicio.use-case.ts:141`). Ninguna máquina de estados se registra por código:
  todos los tipos usan `BaseTicketStateMachine`. Los tipos custom derivan su prefijo de numeración.
- **L5** (evidencia de cierre): frontend `vitest` 274 archivos / 2363 tests en verde; backend
  unitario en verde salvo 3 specs que necesitan Postgres (`scripts/resetear-2fa-root`,
  `scripts/rotar-email-crypto-key.proceso`, `orden-de-arranque`), ajenos al cambio; `typecheck` y
  `lint` limpios en los dos paquetes. **Pendiente:** los `*.integration.spec.ts` y `*.e2e.spec.ts`
  no corrieron (sin Postgres en el entorno). Revisión estática: los 29 `POST /tickets` de los e2e
  usan SOPORTE (módulo TICKETS desde `20260817120000`), `createTipoTicketAislado` (TICKETS) o un id
  inexistente; el único con EQUIPOS se ajustó en `143edc5c`.
- **L6** (decisión): S3 va como `moduloRequerido` opcional, no dentro de `CrearTicketUseCase`,
  porque el barrido preventivo (`PREVENTIVO`, módulo EDILICIA) y la API de integraciones v1 reusan
  el caso de uso. La API de integraciones queda sin restricción de módulo a propósito: es un
  contrato externo.
