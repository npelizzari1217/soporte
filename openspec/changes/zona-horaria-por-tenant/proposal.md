# Propuesta: zona horaria por tenant

## Intent

El equipo trabaja repartido entre Argentina y España de forma permanente, y la aplicación
muestra hora de Buenos Aires a todos. Dos daños concretos, hoy:

- Un ticket cerrado a las 18:00 en Madrid se lee "13:00". Un `slaVenceAt` que dice "vence
  17:00" nombra dos horas de reloj distintas según quién lo mire: en un sistema de SLA y
  turnos, el instante acordado deja de ser uno solo.
- Un usuario en Madrid que carga una compra a las 00:30 del día D ve su fecha **rechazada
  como futura**: `item-compra.entity.ts:618` valida contra `hoyArgentina()`, y para ese
  validador todavía es D−1. No es presentación: es una regla de negocio anclada a un país.

**Éxito:** cada tenant declara su zona operativa y las tres capas la respetan de forma
idéntica; una fecha de calendario sigue sin moverse nunca.

## Scope

### In Scope

- Columna `zonaHoraria` en `master.clientes`, **`NOT NULL` con backfill en la misma
  migración**: nunca existe un NULL observable.
- Value Object `ZonaHoraria` (IANA) autovalidado en `backend/src/shared/domain/`, más el
  espejo Zod del frontend.
- Propagación en runtime: `TenantContextData` (backend) y claim del JWT (frontend).
- Las tres capas gobernadas por la zona del tenant: pantalla
  (`frontend/src/shared/lib/formato-fecha.ts`), CSV
  (`backend/src/shared/infrastructure/csv/csv.ts`) y validación de dominio
  (`hoyArgentina()` en compras).
- Muerte de `OFFSET_ARGENTINA_MS` en sus dos copias (frontend y `shared/domain`).
- ABM de la zona en el módulo `clientes` + artículo de Ayuda en el mismo work unit.
- Cobertura con `Europe/Madrid`, zona con DST real, cruzando el cambio de horario.

### Out of Scope

- **Las 16 columnas `@db.Date` no se tocan.** Son días de calendario puros, sin huso.
  Aplicarles conversión de zona **es** el incidente `corregir-fecha-cierre-tickets` que
  este repo ya sufrió. La propuesta preserva ese límite como invariante, no lo revisa.
- Zona por usuario. Decidida en contra: rompe el instante acordado del SLA.
- `CalendarioLaboralDia` / módulo `sla-habil` — deuda declarada, ver abajo.
- Reformateo del copy de Ayuda preexistente que no queda falso.

## Capabilities

### New Capabilities

- `zona-horaria-tenant`: la zona operativa como atributo del cliente — dónde se declara,
  quién la configura, cómo viaja, y qué capas la obedecen.

### Modified Capabilities

- None. Las tres capacidades vigentes (`preventivo-edicion-plan`,
  `preventivo-permisos-rol`, `preventivo-objetivo-en-ticket`) no describen formateo de
  fechas, CSV ni validación de compras.

## Approach

### Por qué muere el offset fijo

`OFFSET_ARGENTINA_MS = -3h` funciona **solo** porque Argentina no tiene horario de verano
desde 2009. `Europe/Madrid` es UTC+1 o UTC+2 según el mes: un offset fijo con zona
configurable se rompe en silencio el último domingo de octubre. La zona IANA es la única
representación que sobrevive al DST.

Las dos copias del offset son **un par acoplado, no duplicación accidental**:
`formato-fecha.ts:44-58` documenta que el offset del frontend existe para que el prefill de
`<input type="date">` coincida con lo que `hoyArgentina()` valida en el backend. Mover una
sola punta produce un 422 por algo que se veía bien en pantalla. Es la evidencia más
directa de que el alcance tenía que ser completo.

### Las cinco decisiones de diseño

| Decisión | Elección | Por qué |
|---|---|---|
| Dónde vive en `Cliente` | Campo suelto + getter + `configurarZonaHoraria()` con su propio `touch()` | Precedente `csatHabilitado` (`cliente.entity.ts:169-172,214-217`): un flag de configuración va como **acción separada de `editar()`**, que solo parchea nombre/razón social/CUIT. El aparato completo de SMTP (repositorio propio, `Omit` en el mapper) lo justifican 9 columnas con invariante todo-o-nada; acá hay una sola columna. |
| Cómo viaja al backend | Campo `zonaHoraria` en `TenantContextData` | `TenantGuard` **ya hace** el `findById` a `clientes` para resolver la base: agregar el campo cuesta **cero queries nuevas**. Re-consultar por call site paga N queries por request y admite que dos capas del mismo request lean valores distintos. |
| Cómo viaja al frontend | Claim del JWT, junto a `cliente_nombre` | Precedente exacto y ya probado: el Server Component `(dashboard)/layout.tsx` decodifica el token e hidrata `SessionContext` **sin fetch adicional**. La alternativa —exponerla en el payload de cada respuesta— repite el valor en cada DTO de cada endpoint, que es la duplicación que la constante centralizada existía para evitar. |
| Validación | VO `ZonaHoraria` en `shared/domain/`, contra `Intl.supportedValuesOf('timeZone')` | Una zona inválida guardada rompe el formateo de **todo** el tenant. Por AGENTS.md, un primitivo inválido llegando a la entidad es violación de precondición del caller → `throw`, no `Result`; el borde (DTO + Zod espejo) valida antes y devuelve 422. Vive en `shared/domain` porque lo consumen `clientes`, `compras` y el CSV. |
| Quién la configura | ABM de `clientes`, misma superficie que CSAT | Es configuración operativa del tenant, no preferencia de usuario. Ya existe el camino completo verificado: `clientes.controller.ts` → `configurar-csat-cliente.use-case.ts` → `cliente.mapper.ts`. |

### Consecuencia aceptada del JWT

El claim se arma en tres lugares (`login.use-case.ts:175`, `refresh-token.use-case.ts:132`,
`switch-tenant.use-case.ts:79`), todos desde `resolverScope`. Por lo tanto **un cambio de
zona no impacta una sesión abierta hasta que el token se renueve**. Es aceptable: cambiar
la zona operativa es una acción de setup, rara, no una preferencia que se toquetea; y el
refresh ya existe. Se documenta en la Ayuda en vez de agregar maquinaria de invalidación.

### Rutas públicas y `/login`

El `layout.tsx` raíz monta `<Providers>` **sin** `initialUser`: ahí no hay tenant y por lo
tanto no hay zona. La regla es **no formatear instantes de tenant sin tenant resuelto**, en
línea con el test vigente que exige que las opciones de `Intl.DateTimeFormat` sean siempre
explícitas: la zona nunca se resuelve de forma implícita al navegador. Si alguna pantalla
pública necesitara mostrar un instante, se declara UTC explícito.

Queda una superficie a resolver en `design`: la encuesta pública
(`csat/interface/controllers/encuesta-publica.controller.ts`) está scopeada por token, no
por sesión JWT — hay que decidir de dónde saca su zona.

### Ayuda

El cambio altera lo que el usuario ve: las horas en pantalla cambian de significado, y
aparece una configuración nueva. **Alguien que leyó la Ayuda ayer haría algo mal hoy**, así
que corresponde un artículo nuevo en `backend/ayuda/` sobre la zona operativa y dónde se
configura, dentro del mismo work unit que el ABM.

## Affected Areas

| Área | Impacto | Descripción |
|---|---|---|
| `backend/prisma_master/schema.prisma` + migración | Modified | Columna `zonaHoraria` `NOT NULL` con backfill |
| `backend/src/clientes/` (domain, application, infrastructure, interface) | Modified | Getter, `configurarZonaHoraria()`, caso de uso, mapper, DTO, controller |
| `backend/src/shared/domain/zona-horaria-argentina.ts` | Removed | Reemplazado por el VO `ZonaHoraria` |
| `backend/src/shared/tenancy/tenant-context.ts` | Modified | Campo `zonaHoraria` en `TenantContextData` |
| `backend/src/auth/infrastructure/guards/tenant.guard.ts` | Modified | Bindea la zona (sin query nueva) |
| `backend/src/auth/application/use-cases/` (login, refresh, switch) + `resolver-scope.ts` | Modified | Claim de zona en el JWT |
| `backend/src/shared/infrastructure/csv/csv.ts`, `shared/application/armar-export-csv.ts` | Modified | Zona del tenant en lugar del offset fijo |
| `backend/src/compras/domain/services/fecha-argentina.ts` + `item-compra.entity.ts` | Modified | `hoyArgentina()` pasa a depender de la zona del tenant |
| `frontend/src/shared/lib/formato-fecha.ts` | Modified | Zona por parámetro; muere `OFFSET_ARGENTINA_MS` |
| `frontend/src/shared/api/types.ts`, `providers/`, `(dashboard)/layout.tsx` | Modified | Claim nuevo y su hidratación |
| `backend/ayuda/` | New | Artículo de zona operativa |

## Risks

| Riesgo | Probabilidad | Mitigación |
|---|---|---|
| Una `@db.Date` recibe conversión de zona por arrastre y corre un día | Media | El invariante queda escrito en la spec; se preserva la guardia cruzada instante/calendario y el `TrampaDate` que ya explota si se construye un `Date` |
| El invariante "pantalla = CSV byte a byte" se rompe: es **documentado, no testeado**, y las suites son separadas | Alta | La spec lo declara como requisito verificable; `design` decide si se cubre con un fixture compartido o un test cruzado |
| El catálogo de `Intl.supportedValuesOf('timeZone')` puede diferir entre Node y navegador, o rechazar alias legítimos (`Asia/Calcutta`) | Media | **Medir** en `design` antes de fijar el validador; sin eso la regla de "schema Zod espejo" no se puede cumplir |
| 27 call sites de `formato-fecha.ts` (18 componentes + 9 tests) migran a una zona por parámetro | Media | Corte por work unit entregable; los componentes son todos `"use client"` y leen del mismo `SessionContext` |
| Los 18 componentes cliente formatean con la zona de un token viejo tras un cambio de zona | Baja | Aceptado explícitamente arriba; se documenta en la Ayuda |
| **Conteo real de tenants de producción SIN VERIFICAR** | Alta | Docker local tiene 1 (`Demo Soporte`); la memoria del proyecto registra 2 productivos. **Se confirma contra producción antes del rollout, no en esta fase.** El backfill de la migración depende de ese conteo |

## Deuda declarada (no se implementa acá)

`CalendarioLaboralDia` (módulo `sla-habil`, `schema.prisma:437-495`) modela **una sola
configuración global** con `aperturaMinuto`/`cierreMinuto` documentados como "minutos desde
la medianoche LOCAL". No bloquea hoy porque el SLA en uso
(`calcular-sla-vence.service.ts`) es reloj 24/7 y no depende de zona. Si `sla-habil` se
retoma, hereda esta misma ambigüedad multiplicada por tenant.

## Rollback Plan

1. **Antes del deploy de la migración:** revertir la rama. Sin estado persistido.
2. **Después:** los tres commits de capa (frontend, CSV, compras) son reversibles por
   separado —`work-unit-commits`— y ninguno depende de que los otros estén aplicados: la
   zona ya está en la base y en el contexto, cada capa solo elige si la lee.
3. **La columna se deja.** Un `DROP COLUMN` no aporta nada y perdería el backfill. Con las
   tres capas revertidas, la columna queda escrita y sin lector, igual que hoy.
4. **Reversión total con datos:** poner todos los tenants en
   `America/Argentina/Buenos_Aires` restaura exactamente el comportamiento actual, sin
   tocar código.

## Dependencies

- Confirmar el conteo real de tenants de producción antes del rollout (bloquea el backfill,
  no las fases de diseño).
- Ninguna dependencia externa nueva: `Intl` es de la plataforma en los dos runtimes.

## Success Criteria

- [ ] Un tenant con `Europe/Madrid` ve el mismo instante que un tenant con
      `America/Argentina/Buenos_Aires`, cada uno en su hora de reloj local.
- [ ] Un usuario en Madrid carga una compra a las 00:30 y la fecha **no** se rechaza como
      futura.
- [ ] La exportación CSV de un campo coincide byte a byte con lo que la pantalla muestra
      para ese mismo campo y ese mismo tenant.
- [ ] Existe cobertura con `Europe/Madrid` que cruza el cambio de horario y que **falla**
      si se reintroduce un offset fijo.
- [ ] Ninguna columna `@db.Date` cambia de valor observable en ningún tenant.
- [ ] `rg "OFFSET_ARGENTINA_MS"` no devuelve resultados.
- [ ] La Ayuda describe la zona operativa y dónde se configura.
