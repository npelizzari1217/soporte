# Tareas: zona horaria por tenant

TDD estricto: dentro de cada work unit, el orden `RED → GREEN → REFACTOR` es obligatorio y
el RED se corre y se ve fallar **por la razón correcta** antes de escribir implementación.

Comandos: backend `pnpm test` / `pnpm typecheck` / `pnpm lint`; frontend `pnpm test` /
`pnpm type-check` / `pnpm lint`. Recordatorio: `pnpm typecheck` del backend **no** cubre
`*.spec.ts`, así que correr la suite no reemplaza al typecheck.

## Ajustes al design que estas tareas absorben

Verificado contra el repositorio; no reabre ninguna de las 9 decisiones cerradas.

1. **El radio del CSV es de 4 exportadores, no de 1.** `armarExportCsv` lo consumen
   `exportar-compras`, `exportar-tickets`, `exportar-equipos` y `exportar-reparaciones`;
   `fechaHoraCsv`/`diaArgentinoCsv` los consumen `exportar-tickets` (6 referencias) y
   `exportar-compras` (2). La tabla de archivos del design solo nombra compras.
2. **El puerto necesita exponer también la zona.** `IRelojTenant.hoy(): Date` alcanza para
   D6, pero los exportadores necesitan la `ZonaHoraria` misma para pasarla a `fechaHoraCsv`.
   Se agrega `zona(): ZonaHoraria` al mismo puerto: es la extensión mínima coherente con D3
   y D6, y mantiene a `domain/` sin conocer `AsyncLocalStorage`. Si en `apply` esto choca
   con algo, se escala — no se lee `TenantContext` desde el dominio.

---

## WU-0 — Fixture compartido y su alcance desde las dos suites

Depende de: nada. Habilita WU-1, WU-4 y WU-5.

- [x] 0.1 RED: crear `backend/src/shared/domain/fixture-paridad.spec.ts` y
      `frontend/src/shared/lib/fixture-paridad.test.ts`, cada uno cargando
      `shared-fixtures/formato-fecha-paridad.json` y afirmando que trae los bloques
      `zonasValidas`, `zonasInvalidas` y `casos`, con `America/Argentina/Buenos_Aires` y
      `Europe/Madrid` presentes. Correr los dos: fallan porque el archivo no existe.
- [x] 0.2 GREEN: crear `shared-fixtures/formato-fecha-paridad.json` (directorio nuevo en la
      raíz del monorepo) con `zonasValidas` (`America/Argentina/Buenos_Aires`,
      `America/Buenos_Aires`, `Asia/Calcutta`, `Asia/Kolkata`, `Europe/Madrid`),
      `zonasInvalidas` (`America/Nunca_Existio`, `Europe/Madriz`, cadena vacía, cadena de 65
      caracteres) y `casos` con `{ instante, zona, esperadoInstante, esperadoDia,
      esperadoHoy }`, incluyendo los dos cruces de DST de `Europe/Madrid` de 2026 (último
      domingo de marzo y de octubre) y el cruce de medianoche vigente. Ampliado en WU-1
      (hallazgo de revisión) con offsets numéricos y alias (`"+05:00"`, `"UTC"`,
      `"Etc/GMT+5"`) en `zonasValidas`.
- [x] 0.3 **Verificación explícita de alcance** (no es un supuesto): correr
      `pnpm vitest run src/shared/domain/fixture-paridad.spec.ts` en `backend/` y
      `pnpm vitest run src/shared/lib/fixture-paridad.test.ts` en `frontend/`. Si el import
      estático no resuelve fuera del root del paquete, ajustar la config de Vitest
      (`resolve.alias` y/o `server.fs.allow`) o leer el archivo con `readFileSync` +
      `JSON.parse`. Dejar escrito en el spec cuál de las dos vías quedó y por qué.
      **Resuelto**: un `import` estático de JSON SÍ resuelve en Vitest en las dos suites sin
      tocar ninguna config (probado empíricamente con un archivo de sondeo, descartado antes
      del commit), pero rompe `pnpm typecheck` del backend con `TS2732` porque
      `resolveJsonModule` no está habilitado en `tsconfig.json`. Se optó por `readFileSync` +
      `JSON.parse` en los dos specs — no depende de resolución de módulos de TypeScript y no
      toca ninguna config existente por un solo fixture.
- [x] 0.4 Verificar también que el fixture no rompe `pnpm typecheck` (backend) ni
      `pnpm type-check` (frontend): el archivo queda fuera del `rootDir` de los dos paquetes.
      Confirmado: los dos typecheck en verde (exit 0) con `readFileSync` en vez de `import`.

**Commit C0** — `test(shared-fixtures): fixture de paridad de zonas alcanzable desde las dos suites`
· ~130 líneas revisables · rollback: borrar el directorio, nada más lo consume todavía.

---

## WU-1 — Value Object `ZonaHoraria`

Depende de: WU-0.

- [x] 1.1 RED: `backend/src/shared/domain/zona-horaria.spec.ts` recorriendo
      `zonasValidas`/`zonasInvalidas` del fixture. El caso
      `America/Argentina/Buenos_Aires` es el centinela anti-catálogo: si alguien valida por
      `Intl.supportedValuesOf`, este caso se pone rojo.
- [x] 1.2 RED: en el mismo spec, `hoyEnZona(zona, ahora)` a ambos lados del cambio de
      horario de `Europe/Madrid`, y el caso 00:30 en Madrid que en UTC todavía es D−1.
- [x] 1.3 RED: centinela de tope — un test que fije `ZONA_HORARIA_MAX_LENGTH === 64` contra
      el ancho declarado de la columna, separado del test que usa `'x'.repeat(MAX + 1)`.
      Ajustado en revisión: el segundo test asertaba `.toThrow()` sin matcher y no distinguía
      "cae por largo" de "cae por invalidez" (cualquier string de 65 caracteres también es
      una zona inexistente); ahora asertá el mensaje `/excede \d+ caracteres/` para probar
      específicamente que fue el guard de largo el que disparó.
- [x] 1.4 GREEN: `backend/src/shared/domain/zona-horaria.ts` con `esZonaValida`
      (try/catch sobre `new Intl.DateTimeFormat`), `ZonaHoraria.crear` /
      `.desdePersistencia` (valida y nombra el `clienteId` al fallar) / `.valor` /
      `.equals`, `hoyEnZona` y `partesEnZona` usando `formatToParts`, nunca `format()`.
      `partesEnZona` devuelve `Record<ClavePartesEnZona, string>` (claves explícitas, no
      `Record<string, string>`) y tiene su propia cobertura contra `esperadoInstante` del
      fixture, agregada en revisión — antes solo `hoyEnZona` (año/mes/día) la ejercitaba, y
      la mitad hora/minuto/segundo del formateador quedaba sin ningún assert.
- [x] 1.5 No tocar `zona-horaria-argentina.ts` acá: todavía tiene consumidores vivos.

**Hallazgo de diseño descubierto en WU-1, no en el design original**: `equals()` compara por
string crudo, no por zona semánticamente equivalente (`crear('UTC').equals(crear('utc'))` da
`false`). Medido que normalizar vía `Intl.DateTimeFormat(...).resolvedOptions().timeZone`
resuelve la propia zona por defecto del proyecto a su alias
(`America/Argentina/Buenos_Aires` → `America/Buenos_Aires`), así que normalizar o rechazar la
forma no canónica en `validar()` reintroduciría la misma trampa que el centinela
anti-catálogo existe para evitar, por otra puerta. Documentado y testeado como limitación
conocida (comparación por string, no por equivalencia semántica); no hay ningún escritor de
candidatos con case/alias distinto todavía, así que no es un bug con síntoma. Si un futuro
work unit necesita comparar por equivalencia semántica, es una decisión de diseño nueva.

**Commit C1** — `feat(shared): value object ZonaHoraria con validación IANA por construcción`
· ~240 líneas · rollback: el VO no tiene consumidores todavía.

---

## WU-2 — Módulo `clientes`: columna, ABM y Ayuda

Depende de: WU-1. `2c` puede ir en paralelo con WU-3 (backend).

- [ ] 2.1 RED: spec de `ClienteEntity` — `configurarZonaHoraria()` cambia el valor y hace
      `touch()`; `ClienteProps.zonaHoraria` es obligatoria (sin `?`, sin `??` de default).
- [ ] 2.2 RED: spec del mapper — `toPersistence()` incluye la columna (fuera del `Omit`) y
      `toDomain()` la reconstruye vía `ZonaHoraria.desdePersistencia`.
- [ ] 2.3 RED: spec de integración contra `soporte_master_test` — ninguna fila con
      `zona_horaria` NULL ni inválida después de migrar. Si trunca, llamar a
      `usarLockMasterTest()` antes del `describe`.
- [ ] 2.4 GREEN: `backend/prisma_master/migrations/20260901120000_add_cliente_zona_horaria/migration.sql`
      con el `ADD COLUMN VARCHAR(64) NOT NULL DEFAULT 'America/Argentina/Buenos_Aires'` en
      un solo statement; `schema.prisma` con la columna y la advertencia de `Feriado.fecha`
      reescrita nombrando el símbolo nuevo (D9), sin cambiar su sentido.
- [ ] 2.5 GREEN: `cliente.entity.ts` (prop + getter + `configurarZonaHoraria()`) y
      `cliente.mapper.ts`.

**Commit C2a** — `feat(clientes): columna zona horaria del tenant con backfill`
· ~200 líneas · rollback: la columna queda escrita y sin lector.

- [ ] 2.6 RED: spec del caso de uso — admin global cambia la zona y persiste; actor sin
      `is_global_admin` se rechaza antes de llegar al caso de uso; candidato `Europe/Madriz`
      devuelve 422 y el tenant conserva su zona (spec de controller).
- [ ] 2.7 RED: spec del alta — `CreateClienteDto` **exige** la zona (decisión 8: el alta no
      se defaultea a Buenos Aires); un alta sin zona es 422.
- [ ] 2.8 GREEN: `configurar-zona-horaria-cliente.use-case.ts` espejando
      `configurar-csat-cliente.use-case.ts`; `ConfigurarZonaHorariaClienteDto` y campo
      obligatorio en `CreateClienteDto` importando `ZONA_HORARIA_MAX_LENGTH` del VO;
      `PATCH /clientes/:id/zona-horaria` espejando `PATCH /clientes/:id/csat`; wiring en
      `clientes.module.ts`.

**Commit C2b** — `feat(clientes): endpoint para configurar la zona operativa del tenant`
· ~230 líneas · rollback: quita el endpoint, la columna sobrevive.

- [ ] 2.9 RED: test del schema Zod recorriendo `zonasValidas`/`zonasInvalidas` del mismo
      fixture — veredicto idéntico al del VO para cada candidato.
- [ ] 2.10 RED: test del centinela de tope en `frontend/src/features/clientes/limites.ts`
      que fije el 64 contra un valor independiente, no derivado de la propia constante.
- [ ] 2.11 RED: test del diálogo — el select siempre incluye el valor vigente del tenant
      aunque no esté en `Intl.supportedValuesOf('timeZone')`, y al reabrir sincroniza con
      `reset(valoresVigentes)`. El fixture debe contener el valor fuera de catálogo, no
      estar vacío.
- [ ] 2.12 GREEN: `limites.ts`, `schemas.ts` (`z.string().refine(esZonaValida)`, nunca
      `z.enum`), `types.ts` y `configurar-zona-horaria-dialog.tsx` espejando
      `configurar-csat-dialog.tsx`, con el aviso de re-lectura histórica antes de guardar.
- [ ] 2.13 GREEN: `backend/ayuda/zona-horaria.md` (frontmatter `slug` + `titulo`; el sync lo
      descubre solo) — qué es la zona operativa, dónde se configura, la propagación de hasta
      15 minutos por el refresh del token, y que los instantes históricos se re-leen en la
      zona nueva. **Va en este commit, no en una tarea final de documentación.**

**Commit C2c** — `feat(clientes): configurar la zona operativa desde el ABM`
· ~280 líneas · rollback: quita la pantalla y el artículo juntos.

---

## WU-3 — Propagación en runtime

Depende de: WU-2a (la columna existe).

- [ ] 3.1 RED: spec de integración de `TenantGuard` — bindea `zonaHoraria` en
      `TenantContextData` y ejecuta **exactamente un** `findById` por request (espiar el
      repositorio; el assert es sobre el conteo, no sobre el status).
- [ ] 3.2 GREEN: campo en `tenant-context.ts`, bindeo en `tenant.guard.ts`,
      `ScopeResuelto.zonaHoraria` en `resolver-scope.ts`.

**Commit C3a** — `feat(auth): zona del tenant en el contexto de request`
· ~150 líneas · rollback: campo sin lector.

- [ ] 3.3 RED: spec de los tres emisores — `login`, `refresh-token` y `switch-tenant`
      emiten `zona_horaria` desde el mismo `resolverScope`, y `null` cuando `cliente_id` es
      `null` (token master de root), igual que `cliente_nombre`.
- [ ] 3.4 GREEN: claim en `i-token.service.ts` (`JwtPayload`), propagación en los tres
      casos de uso, y `zona_horaria: string | null` en `frontend/src/shared/api/types.ts`.

**Commit C3b** — `feat(auth): claim zona_horaria en el JWT`
· ~160 líneas · rollback: el claim deja de emitirse, nadie lo lee todavía.

- [ ] 3.5 RED: spec que exija que un token con `v: 2` sea rechazado con 401 por
      `JwtAuthGuard`.
- [ ] 3.6 GREEN: `VERSION_PAYLOAD_JWT` de 2 a 3.

**Commit C3c** — `feat(auth)!: sube VERSION_PAYLOAD_JWT a 3` · ~40 líneas ·
**Costura propia a propósito**: al deployar, todos los tokens vivos reciben 401 y refrescan.
No se mezcla con nada. Rollback: volver a 2.

---

## WU-4 — Frontend: la zona entra por parámetro

Depende de: WU-3b. Puede ir en paralelo con WU-5 y WU-6.

- [ ] 4.1 RED: **canario invertido** en `formato-fecha.test.ts` — la salida DEBE cambiar al
      cambiar el argumento de zona y NO DEBE cambiar al mover `process.env.TZ`. El canario
      vigente (que confirma que `process.env.TZ` cambió la zona ambiente) se reemplaza por
      este, no se borra sin reemplazo.
- [ ] 4.2 RED: `frontend/src/shared/lib/formato-fecha.paridad.test.ts` recorriendo los
      `casos` del fixture para `formatearInstante`,
      `formatearInstanteComoDiaArgentino` y `hoyFechaCalendario` (D7).
- [ ] 4.3 RED: **test anti-caché del formateador** — llamar al hook dos veces con zonas
      distintas dentro del mismo render tree debe dar salidas distintas. Un
      `useMemo(() => new Intl.DateTimeFormat(...))` reintroducido tiene que poner esto en
      rojo. Es el riesgo que vuelve verde la matriz de zonas con la implementación rota.
- [ ] 4.4 RED: test de ruta sin tenant — sin `initialUser`, y con token master de root
      (`zona_horaria: null`), el hook entrega `ZONA_SIN_TENANT = "UTC"` declarado
      explícitamente, nunca la zona del navegador.
- [ ] 4.5 RED: verificar que `formatearFechaCalendario` y `aFechaInput` **no aceptan** un
      parámetro de zona — la ausencia de la firma es el guard (D9). Conservar intactos el
      `TrampaDate` y la guardia cruzada.
- [ ] 4.6 GREEN: `formato-fecha.ts` con la zona como primer parámetro obligatorio de cada
      función de instante, construyendo el `Intl.DateTimeFormat` por llamada; muere
      `OFFSET_ARGENTINA_MS` del frontend.
- [ ] 4.7 GREEN: `frontend/src/shared/hooks/use-formato-fecha.ts` — única juntura con
      `SessionContext`, resuelve `user?.zona_horaria ?? ZONA_SIN_TENANT`. La única
      memoización permitida es la del string de la zona.
- [ ] 4.8 GREEN: migrar los 18 componentes que hoy importan `formato-fecha` (compras 6,
      equipos 3, tickets 2, preventivo 2, ciclos 1, ciclos-master 1, edilicia 1, clientes 1)
      a `useFormatoFecha()`, más los 2 tests de componente que ya lo mockean. Es mecánico:
      importar el hook, desestructurar, dejar los call sites iguales.
- [ ] 4.9 Hacer visible la zona usada en la interfaz (requisito de la spec: "y la zona
      usada es visible en la interfaz"), con su test.

**Commit C4a** — `refactor(frontend): la zona del tenant entra por parámetro a formato-fecha`
· ~360 líneas · ~19 archivos de código al revisor. **Candidato natural a PR propio**: la
migración de los 18 call sites no se puede partir sin dejar el typecheck en rojo, porque D5
prohíbe una zona con default que permitiría una migración por etapas. Rollback: revierte el
commit entero; el claim y la columna sobreviven.

---

## WU-5 — CSV en la zona del tenant

Depende de: WU-3a. Puede ir en paralelo con WU-4.

- [ ] 5.1 RED: spec del puerto y su implementación — `hoy()` devuelve el día calendario de
      la zona del `TenantContext` activo, `zona()` devuelve la `ZonaHoraria` del tenant, y
      fuera de scope fallan con un error que nombra el problema (nada de `catch` mudo).
- [ ] 5.2 GREEN: `backend/src/shared/application/ports/i-reloj-tenant.ts` (puerto + token
      DI, con `hoy(): Date` y `zona(): ZonaHoraria`),
      `backend/src/shared/infrastructure/reloj-tenant.ts` (implementación que lee
      `TenantContext`) y provisión en `shared.module.ts`.

**Commit C5a** — `feat(shared): puerto de reloj y zona del tenant`
· ~140 líneas · rollback: puerto sin consumidores.

- [ ] 5.3 RED: `backend/src/shared/infrastructure/csv/csv.paridad.spec.ts` recorriendo los
      mismos `casos` del fixture para `fechaHoraCsv`, `diaArgentinoCsv` y el sufijo de
      `armar-export-csv.ts` (D7). Los valores esperados son los mismos strings que consume
      el spec de paridad del frontend: ahí vive la garantía byte a byte.
- [ ] 5.4 RED: caso de `Compra.fechaSolicitud` (`@db.Date`) con tenant en `Europe/Madrid` —
      el día exportado es el día almacenado. `fechaCsv` sigue sin recibir zona: la ausencia
      del parámetro es el guard (D9).
- [ ] 5.5 GREEN: `csv.ts` — `diaArgentinoCsv` y `fechaHoraCsv` reciben `ZonaHoraria`;
      `fechaCsv` intacto.
- [ ] 5.6 GREEN: `armar-export-csv.ts` — el sufijo del archivo sale de `hoyEnZona` con la
      zona recibida por parámetro; muere `sufijoFechaArgentina`.
- [ ] 5.7 GREEN: los **cuatro** exportadores que consumen `armarExportCsv` —
      `exportar-compras`, `exportar-tickets`, `exportar-equipos`,
      `exportar-reparaciones` — inyectan el puerto y pasan la zona. Ajustar sus specs; los
      de tickets afirman hoy sobre el desplazamiento fijo y hay que reescribirlos a la
      conducta esperada, no al estado actual.

**Commit C5b** — `refactor(shared): el csv y el sufijo de export usan la zona del tenant`
· ~300 líneas · rollback: vuelve al offset fijo sin tocar el resto.

---

## WU-6 — El dominio de compras recibe `hoyTenant` (D6)

Depende de: WU-5a. **Aislado a propósito**: es el radio mecánico más grande.

- [ ] 6.1 RED: renombrar `fecha-argentina.spec.ts` a `fecha-tenant.spec.ts` dejando solo la
      cobertura de `soloFecha()` — truncado puro, sin zona.
- [ ] 6.2 GREEN: `backend/src/compras/domain/services/fecha-tenant.ts` con solo
      `soloFecha()`; borrar `fecha-argentina.ts` y con él `hoyArgentina()`.

**Commit C6a** — `refactor(compras): fecha-tenant conserva solo soloFecha`
· ~60 líneas · rollback: renombre inverso.

- [ ] 6.3 RED: `item-compra.entity.spec.ts` con `hoyTenant` inyectado — un tenant en
      `Europe/Madrid` a las 00:30 del día D **no** ve rechazada la fecha D como futura; un
      tenant en `America/Argentina/Buenos_Aires` sigue rechazando una fecha posterior a su
      "hoy", igual que antes del cambio. Los dos casos, no uno.
- [ ] 6.4 RED: spec de cada uno de los cuatro casos de uso — la rama sin fecha explícita usa
      el reloj inyectado, la rama con fecha explícita no lo consulta.
- [ ] 6.5 GREEN: `item-compra.entity.ts` — `registrarOrden(cantidad, hoyTenant, fecha =
      hoyTenant)` y hermanos, `editarFechaEtapa(etapa, fecha, hoyTenant)`,
      `validarFechaEtapa(etapa, fecha, hoyTenant)` puro. El default deja de ser una llamada
      a servicio y pasa a ser el parámetro anterior.
- [ ] 6.6 GREEN: los cuatro casos de uso (`registrar-orden`, `registrar-recepcion`,
      `registrar-entrega`, `editar-fecha-etapa` `-de-item`) inyectan `IRelojTenant`; wiring
      en `compras.module.ts`.
- [ ] 6.7 GREEN: ajustar los ~11 archivos de spec que construyen ítems y llaman a estos
      métodos (`item-compra.entity.spec.ts`, `compra.entity.spec.ts`,
      `compras.controller.spec.ts`, `cancelar-compra`, `cerrar-item-con-faltante`,
      `listar-compras` y los cuatro specs de los casos de uso).

**Commit C6b** — `feat(compras): la entidad recibe el día del tenant en lugar de consultar el reloj`
· ~330 líneas · ~6 archivos de código al revisor más los specs · rollback: revierte solo
este commit; el puerto y la columna sobreviven.

---

## WU-7 — Muerte del offset fijo y comentarios que quedaron falsos

Depende de: WU-4, WU-5 y WU-6.

- [ ] 7.1 Borrar `backend/src/shared/domain/zona-horaria-argentina.ts` y su spec.
- [ ] 7.2 Verificar `rg "OFFSET_ARGENTINA_MS"` sin resultados en `backend/` y `frontend/`
      (los `.md` de `openspec/` no cuentan).
- [ ] 7.3 Reescribir los comentarios que este cambio vuelve falsos, buscándolos por vecindad
      y no solo en el diff: `tickets/interface/dtos/ticket.dto.ts:215`,
      `tickets/application/use-cases/transicionar-estado.use-case.ts:164`, el encabezado de
      `exportar-tickets.use-case.spec.ts`, el JSDoc de `item-compra.entity.ts:38-51` y la
      restricción documentada en el encabezado de `formato-fecha.ts`.

**Commit C7** — `refactor(shared): elimina el offset fijo de Argentina`
· ~70 líneas · rollback: restaura el archivo.

---

## Cierre — verificación, no commits

- [ ] V1 `pnpm test`, `pnpm typecheck` y `pnpm lint` en `backend/`; `pnpm test`,
      `pnpm type-check` y `pnpm lint` en `frontend/`. Correr los tests **no** es correr el
      typecheck: los dos gates, explícitos.
- [ ] V2 Mutación obligatoria: reintroducir un offset fijo de −3h en la ruta de instantes
      debe poner en rojo el bloque `Europe/Madrid` de la paridad, por la aserción y no por
      un `TypeError`. Revertir y reconfirmar el verde. Si no muere, el test mide otra cosa.
- [ ] V3 Mutación del guard de calendario: aplicar la zona del tenant a una columna
      `@db.Date` debe poner en rojo el caso de `fechaSolicitud`/`Feriado`.
- [ ] V4 Mutación anti-catálogo: cambiar `esZonaValida` para validar contra
      `Intl.supportedValuesOf('timeZone')` debe poner en rojo el caso
      `America/Argentina/Buenos_Aires` en las dos suites.

## Trazabilidad requisito → work unit

| Requisito de la spec | Work unit |
|---|---|
| Persistencia sin NULL observable | WU-2a (2.3, 2.4) |
| Validación IANA por construcción | WU-1, WU-2c (2.9), V4 |
| Configuración de la zona operativa | WU-2b, WU-2c |
| Visualización en pantalla con la zona visible | WU-4 |
| Exportación CSV con paridad byte a byte | WU-5, WU-0 (fixture) |
| Validación de fechas de etapa en compras | WU-6 |
| Las `@db.Date` nunca reciben conversión | WU-4 (4.5), WU-5 (5.4), V3 |
| Rutas sin tenant resuelto | WU-4 (4.4) |

## Orden y paralelismo

```
WU-0 → WU-1 → WU-2a → WU-3a ─┬─ WU-5a → WU-5b ─┐
                              │            └ WU-6a → WU-6b ─┤
        WU-2b → WU-2c         └─ WU-3b → WU-3c → WU-4 ──────┴─→ WU-7 → Cierre
```

- Secuencial obligatorio: WU-0 → WU-1 → WU-2a → WU-3a; WU-5a antes de WU-5b y WU-6.
- Paralelizable: WU-2c (frontend del ABM) con WU-3 (backend); WU-4 con WU-5 y WU-6, una vez
  que WU-3b está en `main`.
- WU-3c va solo, entre WU-3b y WU-4.
