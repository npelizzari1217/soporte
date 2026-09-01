# Tareas: zona horaria por tenant

TDD estricto: dentro de cada work unit, el orden `RED → GREEN → REFACTOR` es obligatorio y
el RED se corre y se ve fallar **por la razón correcta** antes de escribir implementación.

Comandos: backend `pnpm test` / `pnpm typecheck` / `pnpm lint`; frontend `pnpm test` /
`pnpm type-check` / `pnpm lint`. Recordatorio: `pnpm typecheck` del backend **no** cubre
`*.spec.ts`, así que correr la suite no reemplaza al typecheck.

> **RE-PLANIFICACIÓN (enmienda de dos capas).** WU-0 y WU-1 ya están entregados y el
> `design.md` verificó que la enmienda no los toca: quedan `[x]` y no se re-planifican. Todo
> lo demás se reordena para absorber D10–D15.

## Corte de PR

El corte a 400 líneas revisables lo hace el orquestador agrupando commits; este documento
declara **por commit** las líneas revisables estimadas y los archivos de código que van al
revisor, para que ese agrupamiento se pueda hacer sin volver a medir.

**Calibración de las estimaciones.** WU-0 + WU-1 se estimaron en ~370 líneas revisables y
salieron **572**: la diferencia fue remediación de 4 hallazgos reales de revisión (tests
extra, comentarios con comando de verificación). Los números de abajo ya llevan ese
sobrecosto aplicado (~1.5×), así que son estimaciones de *entrega revisada*, no de
implementación inicial.

**Excepciones de tamaño vigentes.** El techo de la sesión es 400 líneas revisables. Dos
commits lo pasan y los dos tienen excepción aprobada por el usuario el 2026-09-01: **C2a
(+20)**, porque separar el campo obligatorio de su único punto de asignación dejaba un commit
en rojo; y **C2c (+50)**, porque partirlo rompía el rollback atómico de pantalla + Ayuda.

**Archivos de código al revisor**: cuenta `*.ts`/`*.tsx` sin `.test.`/`.spec.`. No cuentan
tests, `.md`, `.sql` ni `schema.prisma`. El tope del proyecto es ~5; **queda un solo commit
por encima (C6b, con 6)** y está marcado y justificado. El otro que se pasaba, C4a con 20, se
partió en la cadena strangler C4a-1 … C4a-7, todos de 1 a 3 archivos.

---

## Correcciones al plan anterior (verificadas contra el repositorio)

Tres son defectos que dejarían un commit en rojo o un repo incoherente; no son ajustes de
estilo.

1. **C6a no podía borrar `hoyArgentina()`.** `item-compra.entity.ts` la usa en 4 puntos
   (líneas 20, 456, 493, 531, 618) y solo deja de usarla en C6b. Borrarla en C6a deja el
   typecheck en rojo entre dos commits. **C6a pasa a ser un renombre puro** que conserva las
   dos funciones; `hoyArgentina()` muere en C6b, que es donde deja de tener consumidores.
2. **El radio del CSV es menor del declarado y se puede partir.** `armarExportCsv` sí lo
   consumen **cuatro** exportadores (`exportar-compras`, `exportar-tickets`,
   `exportar-equipos`, `exportar-reparaciones`), pero `fechaHoraCsv`/`diaArgentinoCsv` los
   consume **solo `exportar-tickets.use-case.ts`** (líneas 157 y 158);
   `exportar-compras.use-case.ts` importa `fechaCsv` y `montoCsv`, que por D9 no reciben
   zona. Eso permite partir WU-5b en dos commits que respetan el tope de archivos.
3. **`compras.module.ts` no necesita wiring.** `SharedModule` es `@Global()` y exporta sus
   providers, así que basta con que C5a agregue el token del reloj a su `exports`. Un commit
   menos de superficie en WU-6.

Además, la referencia colgada a `fecha-argentina.ts` aparece en **cinco** lugares, no en uno:
`compras/domain/errors/compras.errors.ts:391`, `shared/domain/zona-horaria.ts:207`,
`compras/domain/entities/item-compra.entity.ts:63` y `:611`, y
`compras/application/use-cases/exportar-compras.use-case.spec.ts:214`. Las cinco se corrigen
en **C6a**, que es el commit que borra el archivo.

---

## WU-0 — Fixture compartido y su alcance desde las dos suites — ENTREGADO

Depende de: nada. Habilita WU-1, WU-4 y WU-5.

- [x] 0.1 RED: `backend/src/shared/domain/fixture-paridad.spec.ts` y
      `frontend/src/shared/lib/fixture-paridad.test.ts` cargando
      `shared-fixtures/formato-fecha-paridad.json`, afirmando los bloques `zonasValidas`,
      `zonasInvalidas` y `casos`.
- [x] 0.2 GREEN: `shared-fixtures/formato-fecha-paridad.json` con las zonas válidas
      (incluidos alias y offsets numéricos, ampliado en revisión), las inválidas y los
      `casos` con los dos cruces de DST de `Europe/Madrid` de 2026.
- [x] 0.3 Verificación explícita de alcance. **Resuelto**: el `import` estático de JSON
      resuelve en Vitest en las dos suites, pero rompe `pnpm typecheck` del backend con
      `TS2732` (`resolveJsonModule` deshabilitado). Quedó `readFileSync` + `JSON.parse`.
- [x] 0.4 Los dos typecheck en verde (exit 0) con el fixture fuera del `rootDir`.

**Commit C0** — `99191fd` `test(shared-fixtures): fixture de paridad de zonas alcanzable desde las dos suites`
· PR #94.

---

## WU-1 — Value Object `ZonaHoraria` — ENTREGADO

Depende de: WU-0.

- [x] 1.1 RED: `zona-horaria.spec.ts` recorriendo `zonasValidas`/`zonasInvalidas`. El caso
      `America/Argentina/Buenos_Aires` es el centinela anti-catálogo.
- [x] 1.2 RED: `hoyEnZona(zona, ahora)` a ambos lados del cambio de horario de
      `Europe/Madrid` y el caso 00:30 en Madrid que en UTC todavía es D−1.
- [x] 1.3 RED: centinela de tope `ZONA_HORARIA_MAX_LENGTH === 64`, separado del test de
      `'x'.repeat(MAX + 1)`, que ahora asertá `/excede \d+ caracteres/` para distinguir "cae
      por largo" de "cae por invalidez".
- [x] 1.4 GREEN: `backend/src/shared/domain/zona-horaria.ts` con `esZonaValida`,
      `ZonaHoraria.crear`/`.desdePersistencia`/`.valor`/`.equals`, `hoyEnZona` y
      `partesEnZona` con `formatToParts`, nunca `format()`.
- [x] 1.5 `zona-horaria-argentina.ts` intacto: todavía tiene consumidores vivos.

**Limitación conocida documentada en WU-1**: `equals()` compara por string crudo, no por
equivalencia semántica. Normalizar vía `resolvedOptions().timeZone` reintroduciría la trampa
del catálogo por otra puerta. Si un work unit futuro necesita comparación semántica, es una
decisión de diseño nueva.

**Commit C1** — `96a1a68` `feat(shared): value object ZonaHoraria con validación IANA por construcción`
· PR #95.

---

## WU-2 — Módulo `clientes`: columna, ABM y Ayuda

Depende de: WU-1. C2c puede ir en paralelo con WU-3.

> **RE-CORTE DE C2a/C2b (2026-09-01).** El corte anterior dejaba `ClienteProps.zonaHoraria`
> obligatoria en C2a y su único punto de asignación en C2b, o sea C2a con el `pnpm typecheck`
> en rojo: `crear-cliente.use-case.ts:139` construye `ClienteEntity.create()` sin la zona y es
> el **único** caller de producción. Es la misma familia de defecto que este documento ya había
> corregido para C6a/C6b, no detectada acá. C2a absorbe el alta (la vieja 2.7 y la porción de
> 2.8 que toca `CreateClienteDto`) para que el campo quede obligatorio de punta a punta en un
> commit verde; C2b se queda con el endpoint de configuración.
>
> Verificado además que el fixup masivo de specs **no existe**: 32 specs construyen
> `ClienteEntity.create`, y **0** de ellos llaman a `.save(` o `toPersistence`, así que ninguno
> llega al mapper. El radio real era un solo archivo de producción.

- [x] 2.1 RED: spec de `ClienteEntity` — `configurarZonaHoraria()` cambia el valor y hace
      `touch()`; `ClienteProps.zonaHoraria` es obligatoria (sin `?`, sin `??` de default).
      Rompe a propósito el precedente de `csatHabilitado?` del mismo archivo: es D1.
- [x] 2.2 RED: spec del mapper — `toPersistence()` incluye la columna (fuera del `Omit`) y
      `toDomain()` la reconstruye vía `ZonaHoraria.desdePersistencia`.
- [x] 2.3 RED: spec de integración contra `soporte_master_test` — ninguna fila con
      `zona_horaria` NULL ni inválida después de migrar. Si trunca, `usarLockMasterTest()`
      antes del `describe`.
- [x] 2.4 RED: spec del alta — `CreateClienteDto` **exige** la zona; un alta sin zona es 422.
      No se defaultea a Buenos Aires: la decisión cerrada es que la zona va explícita en el alta.
- [x] 2.5 GREEN: `backend/prisma_master/migrations/20260901120000_add_cliente_zona_horaria/migration.sql`
      con el `ADD COLUMN VARCHAR(64) NOT NULL DEFAULT 'America/Argentina/Buenos_Aires'` en un
      solo statement; `schema.prisma` con la columna y la advertencia de `Feriado.fecha`
      reescrita nombrando el símbolo nuevo (D9), sin cambiar su sentido.
- [x] 2.6 GREEN: `cliente.entity.ts` (prop + getter + `configurarZonaHoraria()`) y
      `cliente.mapper.ts`.
- [x] 2.7 GREEN: campo obligatorio en `CreateClienteDto` importando `ZONA_HORARIA_MAX_LENGTH`
      del VO, y `crear-cliente.use-case.ts` pasando la zona del DTO a `ClienteEntity.create()`.
      Sin esto el commit queda en rojo: es el único caller de producción de `create()`.

  > **Nota de cierre de C2a (2026-09-01, apply).** El radio real de la obligatoriedad fue
  > mayor al declarado en el re-corte: además de `crear-cliente.use-case.ts` (el único
  > caller de PRODUCCIÓN de `ClienteEntity.create()`, como estaba verificado), **16 sitios
  > de fixtures de test en 16 archivos** construían `ClienteEntity.create()` sin zona y
  > llamaban a `clienteRepo.save()` sobre un `PrismaClienteRepository` REAL — eso SÍ ejercita
  > `ClienteMapper.toPersistence()` y rompía en runtime (`Cannot read properties of
  > undefined (reading 'valor')`). Se verificó con `rg -P` de límite de palabra
  > (`(?<![A-Za-z])ClienteEntity\.create\(`) + lectura directa de dos archivos antes de
  > tocar nada. Además, `pnpm typecheck` **sí cubre `*.spec.ts`** en este repo (contradice
  > una nota anterior de este documento) y exigió agregar `zonaHoraria` a otros ~24 sitios
  > de fixtures que construyen `ClienteEntity`/`ClienteProps` sin ejercitar el mapper. Y dos
  > callers de producción más aparte de `crear-cliente.use-case.ts`: `test/preventivo.e2e.spec.ts`
  > (fixture de test) y `prisma_master/seeds/demo-seed.ts` (script de seed real, llama al
  > use case completo). Todos corregidos con el mismo fix mecánico de una línea
  > (`zonaHoraria: ZonaHoraria.crear('America/Argentina/Buenos_Aires')`), sin tocar ningún
  > archivo de tareas 2.8+. **Líneas revisables reales: ~508** (322 inserciones + 4 borrados
  > en archivos trackeados + 182 de 3 archivos nuevos), contra la estimación de ~420 con la
  > excepción de +20 ya aprobada — **~88 líneas por encima de esa excepción**. Archivos de
  > código no-test: 6 (`demo-seed.ts`, `crear-cliente.use-case.ts`, `cliente.entity.ts`,
  > `cliente.mapper.ts`, `clientes.controller.ts`, `cliente.dto.ts`) contra los 4 declarados
  > — dentro del tope de ~5 del proyecto por 1. `pnpm test` (355/355 archivos, 3825/3825
  > tests), `pnpm typecheck` y `pnpm lint` en verde, verificados corriendo los tres
  > explícitamente.

**Commit C2a-back** — `feat(clientes): columna zona horaria del tenant, exigida en el alta`
· **~555 líneas reales** (estimado ~420) · 6 archivos de código
· **`size:exception` (+155) aprobada el 2026-09-01**
· rollback: la columna y el campo obligatorio del alta se van juntos.

> **AGUJERO DETECTADO EN APPLY (2026-09-01).** El re-corte anterior dejó un **tercer
> consumidor** del campo sin asignar a ningún work unit: `crear-cliente-dialog.tsx` del
> frontend, que se usa desde `clientes-admin-view.tsx` y no manda `zonaHoraria`
> (`rg zonaHoraria frontend/src` → cero). Con el campo obligatorio en el borde, el 100% de
> las altas desde la UI de ROOT devuelven 400. Lo detectó el hook de pre-commit, no el plan.
>
> Se cierra partiendo C2a en dos commits encadenados en vez de engordar uno solo a ~655
> líneas y 9 archivos de código, que rompería el tope OBLIGATORIO de 5 archivos.
> **Ventana asumida**: entre el merge de C2a-back y el de C2a-front, el alta desde la UI
> queda rota. La cadena todavía no está en `main` y el repo tiene un solo desarrollador.

- [x] 2.7a RED: test del diálogo de alta — sin zona elegida el submit no dispara, y con zona
      elegida el payload la incluye. Recorre `zonasValidas`/`zonasInvalidas` del mismo fixture
      compartido, para que el veredicto del borde del frontend sea idéntico al del VO.
- [x] 2.7b GREEN: `crear-cliente-dialog.tsx` (campo de zona, obligatorio, sin default
      preseleccionado), más `schemas.ts` y `types.ts` de `features/clientes`. Sin `z.enum`:
      `z.string().refine(esZonaValida)`, igual que declara 2.13 para el diálogo de config.

  > **Nota de cierre de C2a-front (2026-09-01, apply).** El campo es un `<Input>` de texto
  > plano dentro del mismo `FIELDS` genérico del diálogo (no un `<select>`): la tarea dice
  > "campo de zona", no "select", y esa distinción es intencional — el `<select>` con catálogo
  > mezclado con el valor vigente del tenant es exactamente lo que 2.12/2.13 (C2c) resuelve
  > para el diálogo de EDICIÓN, donde sí hace falta prellenar. Acá, un texto libre validado por
  > `esZonaValida` evita por completo la trampa de `Intl.supportedValuesOf('timeZone')` (ese
  > catálogo ni siquiera lista `America/Argentina/Buenos_Aires`), sin construir ningún catálogo.
  > `esZonaValida` se escribió en `frontend/src/shared/lib/formato-fecha.ts`, NO en
  > `schemas.ts` como se anticipaba: el lint del proyecto (`no-restricted-syntax`) prohíbe
  > instanciar `Intl.DateTimeFormat` fuera de ese módulo, hallazgo real detectado corriendo
  > `pnpm lint` (no en el diseño). `schemas.ts` la importa. Radio real: **4 archivos de
  > código**, no los 3 declarados (`crear-cliente-dialog.tsx`, `schemas.ts`, `types.ts` +
  > `shared/lib/formato-fecha.ts`), dentro del tope de 5 del proyecto. Además se corrigieron
  > dos tests preexistentes que asumían `zonaHoraria` ausente y quedaron en rojo por el mismo
  > motivo que el hallazgo original de C2a-back (un campo nuevo obligatorio con radio mayor al
  > declarado): `clientes-admin-view.test.tsx` (agrega la selección de zona al flujo de alta) y
  > `schemas.test.ts` (agrega `zonaHoraria` al fixture `CLIENTE_VALIDO`). **Líneas revisables
  > reales: ~152** (50 de código en los 4 archivos no-test + 102 de test: 3 en
  > `clientes-admin-view.test.tsx`, 1 en `schemas.test.ts`, 98 del `crear-cliente-dialog.test.tsx`
  > nuevo) contra la estimación de ~100 — por encima, pero muy por debajo del corte de 400
  > líneas del PR y dentro del tope de 5 archivos de código. `pnpm test` (165/165 archivos,
  > 1107/1107 tests), `pnpm type-check` y `pnpm lint` en verde, verificados corriendo los tres
  > explícitamente. La Ayuda (`backend/ayuda/zona-horaria.md`) queda para C2c (2.14) como ya
  > estaba planeado: este commit no toca `backend/`.

**Commit C2a-front** — `feat(clientes): exigir la zona operativa en el alta desde la UI`
· ~152 líneas reales (estimado ~100) · 4 archivos de código (declarados 3; ver nota de cierre)
· rollback: vuelve el alta sin zona y el backend la rechaza.

> Numeración `2.7a`/`2.7b` a propósito, para no volver a renumerar todo el WU: la
> renumeración anterior es justamente lo que dejó pasar este consumidor.

- [ ] 2.8 RED: spec del caso de uso — admin global cambia la zona y persiste; actor sin
      `is_global_admin` se rechaza antes de llegar al caso de uso; candidato `Europe/Madriz`
      devuelve 422 y el tenant conserva su zona (spec de controller).
- [ ] 2.9 GREEN: `configurar-zona-horaria-cliente.use-case.ts` espejando
      `configurar-csat-cliente.use-case.ts`; `ConfigurarZonaHorariaClienteDto`;
      `PATCH /clientes/:id/zona-horaria` espejando `PATCH /clientes/:id/csat`; wiring en
      `clientes.module.ts`.

- [ ] 2.9a RED: spec del controller — `GET /clientes` y las respuestas de alta/edición
      incluyen `zonaHoraria` con el valor real del tenant, no un default.
- [ ] 2.9b GREEN: `zonaHoraria` en `ClienteResponseDto` y en `toResponseDto()`
      (`clientes.controller.ts`), espejando cómo viaja `csatHabilitado`.

> **CAMINO DE LECTURA — agujero detectado por el revisor en C2a (2026-09-01).** El campo se
> exigía al crear, se persistía y tenía getter en la entidad, pero **nunca salía por la API**:
> ni `ClienteResponseDto` ni `toResponseDto()` lo declaraban. La tarea 2.12 pide que el select
> del diálogo "siempre incluya el valor vigente del tenant" — ese valor tiene que venir de algún
> lado. Sin esto, C2c arranca roto. `csatHabilitado` ya sentó el precedente contrario: viaja en
> el listado justamente para que su diálogo prellene con el valor real.

**Commit C2b** — `feat(clientes): endpoint para configurar la zona operativa del tenant`
· ~250 líneas · 3 archivos de código · rollback: quita el endpoint, la columna sobrevive.

- [ ] 2.10 RED: test del schema Zod recorriendo `zonasValidas`/`zonasInvalidas` del mismo
      fixture — veredicto idéntico al del VO para cada candidato.
- [ ] 2.11 RED: centinela de tope en `frontend/src/features/clientes/limites.ts` que fije el
      64 contra un valor independiente, no derivado de la propia constante.
- [ ] 2.12 RED: test del diálogo — el select siempre incluye el valor vigente del tenant
      aunque no esté en `Intl.supportedValuesOf('timeZone')`, y al reabrir sincroniza con
      `reset(valoresVigentes)`. El fixture debe contener el valor fuera de catálogo.
- [ ] 2.13 GREEN: `limites.ts`, `schemas.ts` (`z.string().refine(esZonaValida)`, nunca
      `z.enum`), `types.ts` y `configurar-zona-horaria-dialog.tsx` espejando
      `configurar-csat-dialog.tsx`, con el aviso de re-lectura histórica antes de guardar.
- [ ] 2.14 GREEN: `backend/ayuda/zona-horaria.md` (frontmatter `slug` + `titulo`).
      **Explica las DOS capas** (enmienda): el reloj de negocio, que es del tenant y gobierna
      SLA, vencimientos, CSV y prefill; y la vista personal, que es solo lectura de pantalla.
      Más: dónde se configura la operativa, la propagación de hasta 15 minutos por el refresh
      del token, y que los instantes históricos se re-leen en la zona nueva. Una Ayuda que
      describa una sola capa miente desde el día uno. **Va en este commit.**

**Commit C2c** — `feat(clientes): configurar la zona operativa desde el ABM`
· ~450 líneas · 4 archivos de código · **`size:exception` (+50) aprobada el 2026-09-01**
· rollback: quita la pantalla y el artículo juntos.

---

## WU-3 — Propagación en runtime

Depende de: C2a (la columna existe).

- [ ] 3.1 RED: spec de integración de `TenantGuard` — bindea `zonaHoraria` en
      `TenantContextData` y ejecuta **exactamente un** `findById` por request (espiar el
      repositorio; el assert es sobre el conteo, no sobre el status).
- [ ] 3.2 GREEN: campo en `tenant-context.ts`, bindeo en `tenant.guard.ts`,
      `ScopeResuelto.zonaHoraria` en `resolver-scope.ts`.

**Commit C3a** — `feat(auth): zona del tenant en el contexto de request`
· ~220 líneas · 3 archivos de código · rollback: campo sin lector.

- [ ] 3.3 RED: spec de los tres emisores — `login`, `refresh-token` y `switch-tenant` emiten
      `zona_horaria` desde el mismo `resolverScope`, y `null` cuando `cliente_id` es `null`
      (token master de root), igual que `cliente_nombre`.
- [ ] 3.4 GREEN: claim en `i-token.service.ts` (`JwtPayload`), propagación en los tres casos
      de uso, y `zona_horaria: string | null` en `frontend/src/shared/api/types.ts`. El JSDoc
      de `JwtPayload` declara explícitamente que ese claim es la zona **del tenant** y que la
      zona de **vista** del usuario NO viaja en el token (D11).

**Commit C3b** — `feat(auth): claim zona_horaria en el JWT`
· ~240 líneas · 5 archivos de código · rollback: el claim deja de emitirse, nadie lo lee.

- [ ] 3.5 RED: spec que exija que un token con `v: 2` sea rechazado con 401 por
      `JwtAuthGuard`.
- [ ] 3.6 GREEN: `VERSION_PAYLOAD_JWT` de 2 a 3. **Único bump del cambio** (D11): la capa de
      vista no agrega claims, así que no hay un segundo 401 global.

**Commit C3c** — `feat(auth)!: sube VERSION_PAYLOAD_JWT a 3` · ~60 líneas · 1 archivo de
código · **Costura propia a propósito**: al deployar, todos los tokens vivos reciben 401 y
refrescan. No se mezcla con nada. Rollback: volver a 2.

---

## WU-4 — Frontend: la zona del tenant entra por parámetro (patrón strangler)

Depende de: C3b. Puede ir en paralelo con WU-5 y WU-6.
**Alcance acotado por la enmienda**: sigue siendo **una sola zona** (la del tenant). La tarea
de "hacer visible la zona" se movió a WU-8, donde el indicador nace con las dos zonas en vez
de nacer con una y reescribirse.

### La superficie real es de 9 archivos, no de 18

Verificado leyendo los 18 `import` de `@/shared/lib/formato-fecha`: **nueve de esos archivos
importan únicamente `formatearFechaCalendario` o `aFechaInput`**, que por D9 **nunca reciben
zona**. Esos nueve no cambian en WU-4, y forzarlos a pasar por el hook sería churn que además
debilita el guard de D9 — la ausencia del parámetro deja de ser visible si la función viaja
igual que las que sí lo llevan.

Los que sí migran son nueve, en dos familias con riesgo y verificación distintos:

| Familia | Archivo | Call sites |
|---|---|---|
| Instantes (`formatearInstante`) | `tickets/components/ticket-header.tsx` | 3 |
| | `tickets/components/ticket-timeline.tsx` | 2 |
| | `compras/components/compra-bitacora-section.tsx` | 2 |
| | `edilicia/components/comentarios-dialog.tsx` | 2 |
| | `equipos/components/equipo-componentes-section.tsx` | 4 |
| | `clientes/components/configurar-correo-dialog.tsx` | 2 |
| "Hoy" de calendario (`hoyFechaCalendario`) | `compras/components/registrar-avance-dialog.tsx` | 1 |
| | `equipos/components/equipo-create-dialog.tsx` | 1 |
| | `equipos/components/equipo-edit-dialog.tsx` | 1 |

Total: **18 call sites en 9 archivos**. `formatearInstanteComoDiaArgentino` no tiene ningún
consumidor en `features/` — solo la suite —, pero igual necesita su versión con zona porque
la tabla de D7 la nombra como una de las tres funciones que alimenta el spec de paridad.

### Por qué el strangler NO viola D5

D5 rechaza una zona **con valor por default**, y la razón que da es concreta: un default
habilita resolución implícita y deja pasar en silencio un call site sin migrar. Acá no hay
nada de eso. La función vieja conserva su zona **hardcodeada y explícita** (el `-3` fijo que
ya tiene), no gana ningún parámetro opcional, está marcada `@deprecated`, y el commit de
borrado cierra la ventana dentro de la misma cadena. En ningún paso intermedio existe un
parámetro opcional ni una zona tomada del ambiente. Lo que el strangler compra es lo que
faltaba para respetar `work-unit-commits`: las dos familias coexisten en todos los pasos, así
que **el typecheck y la suite quedan en verde en cada commit** y cada uno es revertible solo.

### Nombres: el módulo puro lleva sufijo, el hook expone los canónicos

Las funciones nuevas del módulo puro se llaman `formatearInstanteEnZona`,
`formatearInstanteComoDiaEnZona` y `hoyEnZonaFechaCalendario`; el hook las re-expone ya
ligadas a la zona del tenant como `formatearInstante`, `formatearInstanteComoDia` y
`hoyDelTenant`. Tres razones:

1. **El nombre distinto es el guard de la migración.** En cualquier commit intermedio,
   `rg "formatearInstante\(" frontend/src/features` cuenta exactamente lo que falta. Si la
   función nueva reusara el nombre viejo, el estado de la migración sería invisible.
2. **Simetría con el backend.** `hoyEnZona` ya se entregó así en el VO (WU-1).
3. **Evita un segundo commit de 11 archivos** cuyo único contenido sería renombrar de vuelta.

Desde el componente el call site queda `formatearInstante(iso)` — la forma que dibuja el
contrato de D13 —, porque la zona ya está ligada por el hook. Y `hoyDelTenant` nace con el
nombre definitivo de D14 desde acá, así que WU-8 no lo vuelve a tocar.

**Orden de argumentos**: la zona va **primero** (`formatearInstanteEnZona(zona, iso)`), como
exige D5 y como lo dibuja el contrato de D13.

---

- [ ] 4.1 RED: **canario invertido** en `formato-fecha.test.ts` — la salida de las funciones
      nuevas DEBE cambiar al cambiar el argumento de zona y NO DEBE cambiar al mover
      `process.env.TZ`. El canario vigente **no se toca todavía**: sigue describiendo una
      conducta viva (la de las funciones viejas) hasta C4a-7. Los dos conviven, cada uno
      apuntando a su familia.
- [ ] 4.2 RED: `frontend/src/shared/lib/formato-fecha.paridad.test.ts` recorriendo los
      `casos` del fixture para `formatearInstanteEnZona`, `formatearInstanteComoDiaEnZona` y
      `hoyEnZonaFechaCalendario` (D7). Alimenta el módulo puro, nunca el hook: la garantía
      byte a byte contra el CSV se mide sobre funciones sin React de por medio.
- [ ] 4.3 RED: verificar que `formatearFechaCalendario` y `aFechaInput` **no aceptan** un
      parámetro de zona, ni siquiera en su variante nueva — no existe variante nueva para
      ellas. La ausencia de la firma es el guard (D9). Conservar intactos el `TrampaDate` y
      la guardia cruzada `reportarClasificacion`.
- [ ] 4.4 GREEN: agregar a `formato-fecha.ts`, **al lado** de las viejas y sin borrar
      ninguna, `formatearInstanteEnZona(zona, iso)`,
      `formatearInstanteComoDiaEnZona(zona, iso)` y `hoyEnZonaFechaCalendario(zona)`,
      construyendo el `Intl.DateTimeFormat` **por llamada**.
- [ ] 4.5 GREEN: marcar `formatearInstante`, `formatearInstanteComoDiaArgentino` y
      `hoyFechaCalendario` con `@deprecated` nombrando **el commit que las borra** (C4a-7) y
      la función que las reemplaza. Un `@deprecated` sin fecha de muerte es decoración.

**Commit C4a-1** — `feat(frontend): funciones de formato de instante con zona explícita`
· ~290 líneas · 1 archivo de código · rollback: borra las funciones nuevas, nadie las llama
todavía.

- [ ] 4.6 RED: **test anti-caché del formateador** — llamar al hook dos veces con zonas
      distintas dentro del mismo render tree debe dar salidas distintas. Un
      `useMemo(() => new Intl.DateTimeFormat(...))` reintroducido tiene que poner esto en
      rojo. Es el riesgo que deja verde la matriz de zonas con la implementación rota.
- [ ] 4.7 RED: test de ruta sin tenant — sin `initialUser`, y con token master de root
      (`zona_horaria: null`), el hook entrega `ZONA_SIN_TENANT = "UTC"` declarado
      explícitamente, nunca la zona del navegador. Con su hermano invertido: con
      `zona_horaria` presente, esa gana.
- [ ] 4.8 GREEN: `frontend/src/shared/hooks/use-formato-fecha.ts` — única juntura con
      `SessionContext`, resuelve `user?.zona_horaria ?? ZONA_SIN_TENANT` en un solo lugar y
      expone `formatearInstante`, `formatearInstanteComoDia` y `hoyDelTenant` ya ligados. La
      única memoización permitida es la del string de la zona, nunca un `Intl.DateTimeFormat`.

**Commit C4a-2** — `feat(frontend): hook useFormatoFecha liga la zona del tenant`
· ~210 líneas · 1 archivo de código · rollback: el hook desaparece, las funciones puras
sobreviven. **Desde acá WU-8 puede arrancar**: C8a solo necesita este hook.

- [ ] 4.9 RED→GREEN: migrar los instantes de **tickets** — `ticket-header.tsx` (3 call sites)
      y `ticket-timeline.tsx` (2). Los tests de esos componentes pasan a afirmar sobre la
      zona inyectada, no sobre la hora argentina literal.

**Commit C4a-3** — `refactor(tickets): los instantes de la pantalla usan la zona del tenant`
· ~90 líneas · 2 archivos de código. **Va primero de la migración a propósito**: tickets es
la superficie de mayor densidad de instantes y la que WU-8 vuelve a tocar con la doble
lectura, así que su forma final se revisa temprano. Rollback: esos dos componentes vuelven a
la función vieja, que sigue existiendo.

- [ ] 4.10 RED→GREEN: migrar los instantes de **bitácora y comentarios** —
      `compras/components/compra-bitacora-section.tsx` (2) y
      `edilicia/components/comentarios-dialog.tsx` (2).

**Commit C4a-4** — `refactor(compras,edilicia): los instantes de bitácora usan la zona del tenant`
· ~85 líneas · 2 archivos de código. **Criterio del grupo**: los dos renderizan el mismo tipo
de campo — el `createdAt` de una entrada de log append-only —, así que comparten forma de
assert y el revisor razona un solo patrón. Rollback: idem C4a-3.

- [ ] 4.11 RED→GREEN: migrar los instantes restantes — `equipos/components/equipo-componentes-section.tsx`
      (4 call sites, el archivo más denso) y `clientes/components/configurar-correo-dialog.tsx`
      (2).

**Commit C4a-5** — `refactor(equipos,clientes): los instantes restantes usan la zona del tenant`
· ~100 líneas · 2 archivos de código. **Criterio del grupo**: es el resto de la familia de
instantes; se cierra acá para que el `rg` de burndown quede en cero antes de tocar la otra
familia. Rollback: idem C4a-3.

- [ ] 4.12 RED: el prefill con reloj congelado devuelve el día de la zona del tenant, no el
      del proceso Node. Actualizar el mock de `registrar-avance-dialog.test.tsx:25-26`, que
      hoy mockea `hoyFechaCalendario`, y el comentario de `equipo-create-dialog.test.tsx:130`,
      que nombra `OFFSET_ARGENTINA_MS`.
- [ ] 4.13 GREEN: migrar los tres call sites de `hoyFechaCalendario()` a `hoyDelTenant()` del
      hook — `compras/components/registrar-avance-dialog.tsx:63`,
      `equipos/components/equipo-create-dialog.tsx` y
      `equipos/components/equipo-edit-dialog.tsx:119`.

**Commit C4a-6** — `refactor(compras,equipos): el prefill de fecha usa el día del tenant`
· ~130 líneas · 3 archivos de código. **Criterio del grupo**: es la otra familia — prefill,
no display. Tiene otro riesgo (D14: el caso de las 00:30), otro test y otro consumidor
posterior. Va último de la migración porque WU-8 le agrega el `max` y la nota al pie encima:
dejarlo contiguo a C8c minimiza el churn. Rollback: idem C4a-3.

- [ ] 4.14 Verificar burndown en cero: `rg "formatearInstante\(|formatearInstanteComoDiaArgentino|hoyFechaCalendario" frontend/src/features`
      sin resultados, y ningún `eslint-disable` de la regla de la ventana en pie.
- [ ] 4.15 GREEN: borrar de `formato-fecha.ts` las tres funciones viejas y
      `OFFSET_ARGENTINA_MS` (`formato-fecha.ts:59`), más la regla de lint de la ventana.
      Borrar del spec el canario viejo y los tests de las funciones muertas.
- [ ] 4.16 Reescribir el encabezado del módulo (`formato-fecha.ts:9-12`), que hoy afirma el
      invariante universal "pantalla = CSV byte a byte": pasa a la forma condicionada de D15
      (`pantalla EN VISTA DE TENANT = CSV, byte a byte`). Un assert correcto con un
      comentario falso arriba es documentación caducada.

**Commit C4a-7** — `refactor(frontend): elimina el formateo con offset fijo del frontend`
· ~135 líneas · 1 archivo de código · **cierra la ventana de convivencia**. Rollback:
restaura las funciones viejas; los call sites ya migrados no se enteran.

### La ventana de convivencia: riesgo y mitigación

**El riesgo.** Entre C4a-1 y C4a-7 las dos familias existen. Un call site nuevo —traído por
otra rama que aterrice en el medio— puede llamar a la función vieja y embarcar un `-3h`
hardcodeado que nadie ve, porque la función vieja **sigue pasando sus propios tests**. Es el
modo de falla clásico del strangler: la ventana no duele mientras dura, duele cuando alguien
escribe código nuevo adentro.

**La mitigación, en tres capas.** Las tres se entregan en C4a-1 y mueren en C4a-7:

1. **Regla de lint que falla en duro.** `no-restricted-syntax` marcando como **error**
   cualquier llamada a las tres funciones viejas. Los 18 call sites existentes llevan un
   `eslint-disable-next-line` con el número de commit que los migra. `pnpm lint` sale en cero
   errores en este repo (AGENTS.md), así que **un call site nuevo rompe el lint en el acto**,
   mientras que los viejos quedan explícitamente marcados.
2. **Los `eslint-disable` son el contador de burndown.** Cada commit de migración baja el
   número y lo declara en su mensaje; la tarea 4.14 exige cero antes de borrar. El estado de
   la migración es greppable, no un supuesto.
3. **La ventana es agrupable en un solo PR.** C4a-3 a C4a-6 no dependen entre sí —tocan
   archivos disjuntos—, así que el orquestador puede mandarlos juntos si prefiere cerrar la
   ventana en una sola pasada de revisión.

**Riesgo residual declarado**: si C4a-7 se posterga, los `eslint-disable` se vuelven ruido
permanente y el `@deprecated` empieza a mentir sobre su propia fecha de muerte. La cadena se
cierra o no se abre.

---

## WU-5 — CSV en la zona del tenant

Depende de: C3a. Puede ir en paralelo con WU-4.

- [ ] 5.1 RED: spec del puerto y su implementación — `hoy()` devuelve el día calendario de la
      zona del `TenantContext` activo, `zona()` devuelve la `ZonaHoraria` del tenant, y fuera
      de scope fallan con un error que nombra el problema (nada de `catch` mudo).
- [ ] 5.2 GREEN: `backend/src/shared/application/ports/i-reloj-tenant.ts` (puerto + token DI,
      con `hoy(): Date` y `zona(): ZonaHoraria`),
      `backend/src/shared/infrastructure/reloj-tenant.ts` (implementación que lee
      `TenantContext`) y provisión en `shared.module.ts`. **El token va en `exports:`**:
      `SharedModule` es `@Global()`, así que con eso queda disponible en compras, tickets,
      equipos y reparaciones sin tocar ningún `*.module.ts` de feature.

**Commit C5a** — `feat(shared): puerto de reloj y zona del tenant`
· ~210 líneas · 3 archivos de código · rollback: puerto sin consumidores.

- [ ] 5.3 RED: `backend/src/shared/infrastructure/csv/csv.paridad.spec.ts` recorriendo los
      `casos` del fixture para `fechaHoraCsv` y `diaArgentinoCsv` (D7). Los valores esperados
      son los mismos strings que consume el spec de paridad del frontend. El **encabezado del
      spec** enuncia el invariante en su forma condicionada (D15) —
      `pantalla EN VISTA DE TENANT = CSV, byte a byte` — y por qué sigue siendo válido bajo
      dos capas: estos asserts nunca pasaron por la capa de vista.
- [ ] 5.4 RED: reescribir los specs de `exportar-tickets` a la **conducta esperada**, no al
      estado actual. Hoy afirman sobre el desplazamiento fijo de −3h (encabezado del spec
      líneas 11-12 y el comentario de la línea 164): un test que consagra el estado actual es
      la forma de verde falso nº 1 del `AGENTS.md`. Los asserts pasan a ser sobre la zona
      inyectada, con `Europe/Madrid` como caso hermano del argentino.
- [ ] 5.5 GREEN: `csv.ts` — `diaArgentinoCsv` y `fechaHoraCsv` reciben `ZonaHoraria` y dejan
      de importar `desplazarAArgentina`; `fechaCsv` intacto (D9). `exportar-tickets.use-case.ts`
      inyecta `IRelojTenant` y pasa la zona en sus dos call sites (líneas 157-158) —
      **es su único consumidor en todo el backend**, verificado.

**Commit C5b** — `refactor(shared): el csv de instantes usa la zona del tenant`
· ~330 líneas · 2 archivos de código · rollback: vuelve al offset fijo sin tocar el sufijo ni
los otros tres exportadores.

- [ ] 5.6 RED: caso de `Compra.fechaSolicitud` (`@db.Date`) con tenant en `Europe/Madrid` —
      el día exportado es el día almacenado. `fechaCsv` sigue sin recibir zona: la ausencia
      del parámetro es el guard (D9).
- [ ] 5.7 RED: paridad del sufijo del archivo con la zona del tenant, reemplazando el test de
      regresión que hoy compara contra `hoyArgentina()`
      (`exportar-compras.use-case.spec.ts:212-240`).
- [ ] 5.8 GREEN: `armar-export-csv.ts` — el sufijo sale de `hoyEnZona` con la zona recibida
      por parámetro; muere `sufijoFechaArgentina()` y su import de `desplazarAArgentina`.
- [ ] 5.9 GREEN: los **cuatro** exportadores que consumen `armarExportCsv` —
      `exportar-compras`, `exportar-tickets`, `exportar-equipos`, `exportar-reparaciones` —
      inyectan el puerto y pasan la zona. Ajustar sus specs.

**Commit C5c** — `refactor(shared): el sufijo de export usa la zona del tenant`
· ~290 líneas · 5 archivos de código · rollback: vuelve al sufijo con offset fijo.

---

## WU-6 — El dominio de compras recibe `hoyTenant` (D6)

Depende de: C5a. **Aislado a propósito**: es el radio mecánico más grande del backend.

- [ ] 6.1 RED: renombrar `fecha-argentina.spec.ts` a `fecha-tenant.spec.ts` sin quitarle
      cobertura: en este commit el módulo todavía exporta las dos funciones.
- [ ] 6.2 GREEN: **renombre puro** de `backend/src/compras/domain/services/fecha-argentina.ts`
      a `fecha-tenant.ts`, conservando `soloFecha()` **y** `hoyArgentina()`. No se borra
      ninguna función acá: `item-compra.entity.ts` todavía la usa en 4 puntos y borrarla
      dejaría el typecheck en rojo entre dos commits.
- [ ] 6.3 GREEN: corregir las **cinco** referencias que el renombre vuelve colgadas —
      `compras/domain/errors/compras.errors.ts:391`, `shared/domain/zona-horaria.ts:207`,
      `compras/domain/entities/item-compra.entity.ts:63` y `:611`, y
      `compras/application/use-cases/exportar-compras.use-case.spec.ts:214`. Van acá y no en
      C7: si se posterga, el repo queda con referencias rotas entre commits.

**Commit C6a** — `refactor(compras): renombra fecha-argentina a fecha-tenant`
· ~130 líneas · 5 archivos de código · rollback: renombre inverso.

- [ ] 6.4 RED: `item-compra.entity.spec.ts` con `hoyTenant` inyectado — un tenant en
      `Europe/Madrid` a las 00:30 del día D **no** ve rechazada la fecha D como futura; un
      tenant en `America/Argentina/Buenos_Aires` sigue rechazando una fecha posterior a su
      "hoy", igual que antes del cambio. Los dos casos, no uno.
- [ ] 6.5 RED: spec de cada uno de los cuatro casos de uso — la rama sin fecha explícita usa
      el reloj inyectado, la rama con fecha explícita no lo consulta.
- [ ] 6.6 GREEN: `item-compra.entity.ts` — `registrarOrden(cantidad, hoyTenant, fecha =
      hoyTenant)` y hermanos, `editarFechaEtapa(etapa, fecha, hoyTenant)`,
      `validarFechaEtapa(etapa, fecha, hoyTenant)` puro. El default deja de ser una llamada a
      servicio y pasa a ser el parámetro anterior.
- [ ] 6.7 GREEN: los cuatro casos de uso (`registrar-orden-de-item`,
      `registrar-recepcion-de-item`, `registrar-entrega-de-item`,
      `editar-fecha-etapa-de-item`) inyectan `IRelojTenant`. **Sin cambios en
      `compras.module.ts`**: el token viene de `SharedModule`, que es `@Global()` — verificar
      en el arranque de la suite, no asumirlo.
- [ ] 6.8 GREEN: muere `hoyArgentina()` de `fecha-tenant.ts` y con ella su import de
      `desplazarAArgentina`; ajustar `fecha-tenant.spec.ts`, que queda con la cobertura de
      `soloFecha()` — truncado puro, sin zona.
- [ ] 6.9 GREEN: ajustar los ~11 archivos de spec que construyen ítems y llaman a estos
      métodos (`item-compra.entity.spec.ts`, `compra.entity.spec.ts`,
      `compras.controller.spec.ts`, `cancelar-compra`, `cerrar-item-con-faltante`,
      `listar-compras` y los cuatro specs de los casos de uso).

**Commit C6b** — `feat(compras): la entidad recibe el día del tenant en lugar de consultar el reloj`
· ~500 líneas · 6 archivos de código — **1 por encima del tope**, declarado: insertar un
parámetro obligatorio en la entidad rompe a sus cuatro llamadores en el mismo typecheck, y
`fecha-tenant.ts` tiene que perder `hoyArgentina()` en el mismo commit o queda una función
muerta importando el módulo que WU-7 borra. Rollback: revierte solo este commit; el puerto y
la columna sobreviven.

- [ ] 6.10 RED: spec de `FechaEtapaFuturaError` — el mensaje contiene el día del tenant en
      formato `DD/MM/AAAA` y nombra el reloj ("el día de hoy en el reloj del tenant"). Assert
      sobre el texto, que es lo que ve el usuario. Actualizar los dos constructores de prueba
      existentes (`compras.errors.spec.ts:229`, `compras.controller.spec.ts:902`).
- [ ] 6.11 GREEN: `FechaEtapaFuturaError(itemId, hoyTenant)` en
      `compras/domain/errors/compras.errors.ts`, leyendo los componentes **UTC** del `Date`
      que la entidad ya recibe — viene truncado a medianoche UTC por contrato de `hoyEnZona`,
      así que el día calendario del tenant sale exacto **sin `Intl` y sin zona**. La entidad
      lo pasa en `item-compra.entity.ts:619`. `validarFechaEtapa` no cambia de firma y el
      dominio no gana ninguna dependencia: D6 intacto. El error nombra el reloj
      genéricamente; el ID IANA lo agrega el frontend, que sí lo tiene (D14, decisión 5).

**Commit C6c** — `feat(compras): el rechazo de fecha futura nombra el día y el reloj del tenant`
· ~110 líneas · 2 archivos de código · rollback: vuelve al mensaje genérico.

---

## WU-7 — Muerte del offset fijo y comentarios que quedaron falsos

Depende de: C5b, C5c y C6b (son los tres únicos importadores de
`zona-horaria-argentina.ts`, verificado) **y de C4a-7**, que es donde muere
`OFFSET_ARGENTINA_MS` del frontend. Sin C4a-7 la tarea 7.2 no puede pasar: el símbolo tiene
nombre distinto en cada lado pero el barrido es uno solo. No depende de WU-8.

- [ ] 7.1 Borrar `backend/src/shared/domain/zona-horaria-argentina.ts` y su spec.
- [ ] 7.2 Verificar `rg "OFFSET_ARGENTINA_MS|desplazarAArgentina"` sin resultados en
      `backend/` y `frontend/` (los `.md` de `openspec/` no cuentan). En el frontend el
      símbolo ya murió en C4a-7; acá se verifica el barrido completo, no se borra de nuevo.
- [ ] 7.3 Reescribir los comentarios que este cambio vuelve falsos, buscándolos por vecindad
      y no solo en el diff: `tickets/interface/dtos/ticket.dto.ts:215`,
      `tickets/application/use-cases/transicionar-estado.use-case.ts:164` y el assert
      hermano de su spec (`:199`), el encabezado de `exportar-tickets.use-case.spec.ts`, el
      JSDoc de `item-compra.entity.ts:38-51` y el de `armar-export-csv.ts:81`.

**Commit C7** — `refactor(shared): elimina el offset fijo de Argentina`
· ~100 líneas · 4 archivos de código · rollback: restaura el archivo.

---

## WU-8 — La capa de vista del usuario (NUEVO, D10–D15)

Depende de: **C4a-2** (el hook existe — no de la cadena strangler completa), C5c (el CSV ya
habla la zona del tenant) y C6c (el mensaje de error ya nombra el día). El corte del strangler
adelantó el arranque de este work unit: C8a solo necesita el hook, no los call sites
migrados. Las dependencias finas quedan declaradas commit por commit más abajo y en el
diagrama de paralelismo. Es **frontend puro**: no agrega columna, ni claim, ni un segundo
bump de `VERSION_PAYLOAD_JWT`. Su reversión total deja el sistema en el estado que describen
D1–D9, que con los dos tenants argentinos de producción es visualmente idéntico al de hoy.

- [ ] 8.1 RED: `zona-vista-storage` — valor ausente, valor inválido (`localStorage`
      manipulado es entrada de usuario), `localStorage` que lanza por cuota o modo privado, y
      SSR sin `window`. Espeja los casos que `shared/auth/idle-storage.test.ts` ya cubre. El
      caso del valor inválido asertá que **no** se propaga un `RangeError` al render.
- [ ] 8.2 RED: default sin preferencia = `zonaTenant`, **nunca**
      `Intl.DateTimeFormat().resolvedOptions().timeZone`. Espiar `resolvedOptions` y afirmar
      que no gobierna el default (D12), con su hermano invertido: con preferencia guardada
      válida, esa gana.
- [ ] 8.3 GREEN: `frontend/src/shared/auth/zona-vista-storage.ts` — clave `zona-vista`,
      lectura que devuelve `null` ante ausencia/invalidez/indisponibilidad y escritura que
      degrada a no-op silencioso, espejando `idle-storage.ts`. El valor leído se valida con la
      misma `esZonaValida` del frontend antes de usarse.
- [ ] 8.4 GREEN: `use-formato-fecha.ts` resuelve **dos** zonas: `zonaTenant` desde
      `SessionContext` y `zonaVista` desde el módulo anterior, en un efecto de cliente —
      nunca durante el render del servidor— con `zonaTenant` como valor de arranque para que
      no haya parpadeo de horas.

**Commit C8a** — `feat(frontend): preferencia local de zona de vista`
· ~300 líneas · 2 archivos de código · rollback: el hook vuelve a una sola zona.

- [ ] 8.5 RED: `lecturaDoble` con zonas **iguales** → `difieren === false` y la lectura de
      vista byte a byte idéntica a `formatearInstante`, sin sufijo ni etiqueta. Es el caso de
      los dos tenants reales: el día del deploy ninguna tabla cambia de ancho.
- [ ] 8.6 RED: `lecturaDoble` con zonas **distintas** → las dos lecturas, con la del tenant
      etiquetada y la de vista sin etiquetar. Assert de **contenido**, no de presencia de un
      `·`.
- [ ] 8.7 RED: assert de ausencia **con su hermano invertido** — no existe variante de doble
      lectura para `formatearFechaCalendario` (D9) y sí existe para `formatearInstante`. Sin
      el par, dos estados distintos renderizan igual.
- [ ] 8.8 RED: indicador global — muestra el reloj del tenant siempre; muestra además la
      vista solo cuando difiere; ofrece la sugerencia descartable del navegador solo cuando
      no hay preferencia guardada, el navegador difiere del tenant y es zona válida; y un
      clic explícito la persiste. El "no se aplica sola" va con su hermano "al aceptarla, sí".
- [ ] 8.9 GREEN: `frontend/src/shared/lib/lectura-doble.ts` — devuelve **partes**
      (`{ vista, tenant, difieren, etiquetaTenant }`), nunca una cadena armada, para que el
      spec de paridad de D7 pueda seguir llamando a `formatearInstante` sin pasar por acá. La
      etiqueta sale de `formatToParts` con `timeZoneName: "short"`, nunca de una tabla de
      abreviaturas; si sale vacía o ilegible, el fallback es el ID IANA completo.
- [ ] 8.10 GREEN: componente de presentación que consume esas partes, e indicador global en
      `frontend/src/components/shell/dashboard-header.tsx` con el control de cambio de zona,
      espejando `theme-toggle.tsx`. Satisface el requisito de visibilidad **una vez**, no una
      vez por celda.
- [ ] 8.11 Medir y fijar en el fixture qué devuelve `timeZoneName: "short"` (locale `es-AR`)
      para `America/Argentina/Buenos_Aires` y `Europe/Madrid` en Node 24. Una forma tipo
      `GMT-3` es aceptable; `ART` era ilustración, no especificación. Fijarlo convierte un
      cambio de ICU en un test rojo y no en un cambio silencioso de copy.

**Commit C8b** — `feat(frontend): doble lectura e indicador global de zona`
· ~420 líneas · 4 archivos de código · rollback: la pantalla vuelve a una sola lectura.

- [ ] 8.12 RED: `hoyDelTenant()` con reloj congelado a las 00:30 de `Europe/Madrid` y tenant
      argentino devuelve el día **argentino** (D−1). Es el caso que motivó D14.
- [ ] 8.13 RED: **la ausencia es el guard** — verificar que el hook no expone
      `hoyDeLaVista()` ni ninguna función de "hoy" parametrizable por zona. Exponer
      `zonaVista` como string y confiar en la disciplina del call site es el mismo error que
      D5 rechazó con la zona por default.
- [ ] 8.14 RED: nota al pie del campo de fecha solo cuando las zonas difieren, con su hermano
      invertido (zonas iguales → no aparece nada). Idem el aviso de exportación.
- [ ] 8.15 GREEN: confirmar que `hoyDelTenant()` sigue cerrada sobre `zonaTenant` ahora que
      el hook resuelve **dos** zonas. Los tres call sites ya la usan desde C4a-6, así que acá
      no se migra nada: lo que se verifica es que la zona sobre la que está cerrada no se
      corrió a `zonaVista` al agregarse la segunda. Ese es exactamente el caso que muta V5.
- [ ] 8.16 GREEN: `max={hoyDelTenant()}` en el `<input type="date">` de compras, **con el
      comentario que declara su alcance**: `registrar-avance-dialog.tsx:124` tiene
      `noValidate`, así que `max` es ayuda visual del selector nativo y **no** bloquea el
      submit. El guard sigue siendo el dominio, y el rechazo del servidor ya nombra el día y
      el reloj desde C6c.
- [ ] 8.17 GREEN: aviso previo a la descarga en
      `frontend/src/shared/components/exportar-csv-button.tsx` cuando
      `zonaVista !== zonaTenant`: el archivo sale en el reloj del tenant. **Un solo archivo
      cubre las cuatro superficies de exportación** — compras, tickets, equipos y
      reparaciones pasan todas por `ExportarCsvButton` (verificado).
- [ ] 8.18 GREEN: completar `backend/ayuda/zona-horaria.md` con cómo se cambia la vista
      personal, que el prefill y el CSV siguen hablando el reloj del tenant, y por qué.

**Commit C8c** — `feat(frontend): el prefill y el aviso de export hablan el reloj del tenant`
· ~350 líneas · 4 archivos de código · **exige C4a-6** (los tres call sites ya usan
`hoyDelTenant()`) y C5c · rollback: vuelve al prefill sin nota y sin aviso.

- [ ] 8.19 GREEN: aplicar la doble lectura a los instantes de tickets y compras —
      `tickets/components/ticket-header.tsx` (3 call sites),
      `tickets/components/ticket-timeline.tsx` (2) y
      `compras/components/compra-bitacora-section.tsx` (2), con sus tests.

**Commit C8d** — `feat(tickets,compras): doble lectura en los instantes de la pantalla`
· ~140 líneas · 3 archivos de código · **exige C4a-3 y C4a-4** (esos mismos archivos ya
migrados) · rollback: esas pantallas vuelven a una sola lectura; el resto no se entera.

- [ ] 8.20 GREEN: mismo cambio en `equipos/components/equipo-componentes-section.tsx` (4 call
      sites), `edilicia/components/comentarios-dialog.tsx` (2) y
      `clientes/components/configurar-correo-dialog.tsx` (2), con sus tests.

**Commit C8e** — `feat(equipos,edilicia,clientes): doble lectura en los instantes de la pantalla`
· ~140 líneas · 3 archivos de código · **exige C4a-4 y C4a-5** · rollback: idem C8d.

---

## Cierre — verificación, no commits

- [ ] V1 `pnpm test`, `pnpm typecheck` y `pnpm lint` en `backend/`; `pnpm test`,
      `pnpm type-check` y `pnpm lint` en `frontend/`. Correr los tests **no** es correr el
      typecheck: los dos gates, explícitos.
- [ ] V2 Mutación: reintroducir un offset fijo de −3h en la ruta de instantes debe poner en
      rojo el bloque `Europe/Madrid` de la paridad, **por la aserción** y no por un
      `TypeError`. Revertir y reconfirmar el verde.
- [ ] V3 Mutación del guard de calendario: aplicar la zona del tenant a una columna
      `@db.Date` debe poner en rojo el caso de `fechaSolicitud`/`Feriado`.
- [ ] V4 Mutación anti-catálogo: cambiar `esZonaValida` para validar contra
      `Intl.supportedValuesOf('timeZone')` debe poner en rojo el caso
      `America/Argentina/Buenos_Aires` en las dos suites.
- [ ] V5 Mutación del prefill: hacer que `hoyDelTenant()` use `zonaVista` debe poner en rojo
      el test de las 00:30. Si no muere, el guard de D14 no está donde se cree.
- [ ] V6 Mutación del CSV: pasar la preferencia de vista al exportador debe poner en rojo la
      paridad. Confirma que el CSV sigue anclado al tenant (D15).
- [ ] V7 Mutación del caché: envolver el `Intl.DateTimeFormat` del hook en un `useMemo` sin
      dependencias debe poner en rojo el test anti-caché (4.6).
- [ ] V8 Mutación de la ventana strangler: agregar un call site nuevo a cualquiera de las
      tres funciones viejas, entre C4a-1 y C4a-7, debe romper `pnpm lint`. Si no rompe, la
      regla de `no-restricted-syntax` no cubre la forma de llamada que se usó.

## Trazabilidad requisito → work unit

Los 13 requisitos de la spec enmendada, con los work units que los cubren.

| Requisito de la spec | Work unit |
|---|---|
| Persistencia sin NULL observable | WU-2a (2.3, 2.4) |
| Validación IANA por construcción de formateador | WU-1, WU-2c (2.9), V4 |
| Configuración de la zona operativa | WU-2b, WU-2c |
| Visualización en la zona de vista, con default de tenant y zona visible | WU-4 (formateo), WU-8b (visibilidad e indicador) |
| Persistencia local de la preferencia de vista | WU-8a (8.1, 8.3) |
| Default de la vista = tenant; navegador como sugerencia descartable | WU-8a (8.2), WU-8b (8.8) |
| Doble lectura solo cuando vista y tenant difieren | WU-8b (8.5–8.7, 8.9), WU-8d, WU-8e |
| CSV en zona del tenant, paridad byte a byte en vista de tenant | WU-5b (5.3), WU-5c, WU-0 (fixture), WU-8c (8.17) |
| Validación de fechas de etapa en compras según zona del tenant | WU-6b |
| El prefill de calendario usa el día del tenant | WU-8c (8.12, 8.13, 8.15) |
| Invariante: la validación de dominio siempre usa el reloj del tenant | WU-6b (veredicto), WU-6c (mensaje), V5 |
| Las `@db.Date` nunca reciben conversión de zona | C4a-1 (4.3), WU-5c (5.6), WU-8b (8.7), V3 |
| Rutas sin tenant resuelto | C4a-2 (4.7) |

## Orden y paralelismo

```
C0 → C1 → C2a → C3a ─┬─ C5a ─┬─ C5b ────────────────────┐
                     │       └─ C5c ───────────┐        │
                     │               C6a → C6b → C6c ───┼──────────────→ C7
        C2b → C2c    └─ C3b → C3c → C4a-1 → C4a-2 ─┬─ C4a-3 ─┐          ↑
                                                   ├─ C4a-4 ─┼─ C4a-7 ──┘
                                                   ├─ C4a-5 ─┤
                                                   └─ C4a-6 ─┘
                                          C4a-2 ──→ C8a → C8b ─┬─ C8c   (tras C4a-6 y C5c)
                                                               ├─ C8d   (tras C4a-3, C4a-4)
                                                               └─ C8e   (tras C4a-4, C4a-5)
```

- Secuencial obligatorio: C0 → C1 → C2a → C3a; C5a antes de C5b, C5c y C6b; C6a antes de C6b
  antes de C6c; C4a-1 antes de C4a-2 antes de los cuatro de migración antes de C4a-7.
- **Los cuatro commits de migración (C4a-3 … C4a-6) son mutuamente independientes**: tocan
  archivos disjuntos y todos compilan contra las dos familias de funciones. Se pueden revisar
  en cualquier orden, o agrupar en un solo PR para cerrar antes la ventana de convivencia.
- **WU-8 se adelantó.** Antes esperaba a WU-4 completo; ahora C8a arranca apenas C4a-2 está
  en `main`. Eso saca el frontend de la capa de vista de detrás de un único PR grande y lo
  deja correr en paralelo con la migración de call sites. Ojo con el orden dentro de cada
  archivo: C8d, C8e y C8c tocan componentes que la migración ya tiene que haber pasado, y
  esas dependencias finas están declaradas en cada commit.
- Paralelizable: C2b/C2c (frontend del ABM) con WU-3; la rama de CSV/compras (C5\*, C6\*) con
  la rama de frontend (C3b → C3c → C4a-\*); C4a-3 … C4a-6 entre sí; C8d con C8e.
- C3c va solo, entre C3b y C4a-1: es el único 401 global del cambio.
- C7 exige C5b, C5c, C6b **y C4a-7**: los tres primeros son los importadores de
  `zona-horaria-argentina.ts`; el cuarto es el que mata `OFFSET_ARGENTINA_MS` del frontend.

## Estimación por commit

| Commit | Líneas revisables | Archivos de código | Estado |
|---|---|---|---|
| C0 | 130 est. / **entregado en 572 junto a C1** | 0 | hecho, PR #94 |
| C1 | ver arriba | 1 | hecho, PR #95 |
| C2a-back | **~555 real** — excepción +155 | 6 | **hecho** |
| C2a-front | ~100 | 3 | pendiente |
| C2b | ~250 | 3 | pendiente |
| C2c | ~450 — **excepción +50** | 4 | pendiente |
| C3a | ~220 | 3 | pendiente |
| C3b | ~240 | 5 | pendiente |
| C3c | ~60 | 1 | pendiente |
| C4a-1 | ~290 | 1 | pendiente |
| C4a-2 | ~210 | 1 | pendiente |
| C4a-3 | ~90 | 2 | pendiente |
| C4a-4 | ~85 | 2 | pendiente |
| C4a-5 | ~100 | 2 | pendiente |
| C4a-6 | ~130 | 3 | pendiente |
| C4a-7 | ~135 | 1 | pendiente |
| C5a | ~210 | 3 | pendiente |
| C5b | ~330 | 2 | pendiente |
| C5c | ~290 | 5 | pendiente |
| C6a | ~130 | 5 | pendiente |
| C6b | ~500 | **6 — excepción declarada** | pendiente |
| C6c | ~110 | 2 | pendiente |
| C7 | ~100 | 4 | pendiente |
| C8a | ~300 | 2 | pendiente |
| C8b | ~420 | 4 | pendiente |
| C8c | ~350 | 4 | pendiente |
| C8d | ~140 | 3 | pendiente |
| C8e | ~140 | 3 | pendiente |

Total pendiente: **~5700 líneas revisables** en 25 commits.

**Por qué WU-4 sube de ~540 a ~1040.** Dos movimientos en direcciones opuestas, y el segundo
pesa más. Baja: la superficie real es de 9 archivos, no de 18 — los otros 9 solo tocan
funciones de calendario que por D9 no reciben zona. Sube: el strangler paga explícitamente la
ventana de convivencia (las funciones nuevas se agregan y las viejas se borran, así que esas
líneas se revisan dos veces), el commit de borrado es trabajo real, y la cobertura queda más
granular al repartirse en siete RED distintos. El intercambio es deliberado: ~500 líneas
revisables más a cambio de que ningún commit pase de 3 archivos de código y de que WU-8
arranque cinco commits antes.
