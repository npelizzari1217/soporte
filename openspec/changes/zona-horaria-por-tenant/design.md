# Diseño: zona horaria por tenant

## Enfoque técnico

La zona operativa pasa a ser un atributo del tenant que viaja por **dos canales ya
existentes y sin costo de consulta**: `TenantContextData` en el backend (el `findById` que
`TenantGuard` ya hace) y un claim del JWT en el frontend (el mismo paquete que ya lleva
`cliente_nombre`). El offset fijo muere y se reemplaza por un Value Object `ZonaHoraria`
(IANA) en `shared/domain/`, del que cuelgan las dos únicas primitivas de conversión:
formatear un instante en una zona y calcular el día calendario de una zona.

El punto estructural del cambio es que **el dominio nunca consulta la zona**: recibe el día
calendario del tenant ya resuelto como un `Date`. Con eso, ni `compras/domain/` ni
`shared/domain/` necesitan conocer `AsyncLocalStorage`, y la regla "`domain/` no importa de
`infrastructure/`" (AGENTS.md) se mantiene sin excepciones.

---

## Decisiones de arquitectura

### D1 — Dónde vive la zona en `Cliente`

| Opción | Costo | Decisión |
|---|---|---|
| Campo suelto + getter + `configurarZonaHoraria()` con su propio `touch()` | 1 columna, 1 caso de uso, 1 endpoint | **Elegida** |
| Aparato SMTP (repositorio propio, `Omit` en el mapper, 4 casos de uso) | Rechazada | — |

**Razón.** El `Omit` del mapper (`cliente.mapper.ts:39-54`) existe para que una edición
comercial no borre un secreto cifrado con invariante todo-o-nada de 9 columnas. Acá hay una
columna `NOT NULL` sin secreto y sin invariante compuesto: el precedente exacto es
`csatHabilitado`, que **sí** viaja en `toPersistence()` (`cliente.mapper.ts:62`) y tiene su
método dedicado (`cliente.entity.ts:214-217`). Se copia ese, incluida la constante: acción
**separada de `editar()`**, endpoint `PATCH /clientes/:id/zona-horaria` espejando
`PATCH /clientes/:id/csat` (`clientes.controller.ts:392`).

`ClienteProps.zonaHoraria` es **obligatoria** (no `?`, a diferencia de `csatHabilitado`): la
columna es `NOT NULL` y un `?? ZONA_POR_DEFECTO` en la entidad sería el fallback ad-hoc por
call site que la propuesta descartó. El default de producto se aplica en **un solo lugar**:
el caso de uso de alta, cuando el DTO no trae zona.

### D2 — Validación IANA: por construcción, nunca por catálogo

```ts
// Regla ÚNICA, idéntica en backend y frontend.
try { new Intl.DateTimeFormat("en-CA", { timeZone: candidata }); return true; }
catch { return false; }
```

**Razón, medida en Node v24.20.0.** `Intl.supportedValuesOf('timeZone')` devuelve 418 zonas
y es internamente incoherente: **no** incluye `America/Argentina/Buenos_Aires` — la zona que
este repositorio usa hoy — ni `Asia/Kolkata`, pero sí sus alias `America/Buenos_Aires` y
`Asia/Calcutta`. `Intl.DateTimeFormat` acepta las dos formas y resuelven al mismo instante
(verificado con `2026-01-15T12:00Z`: ambas dan `9:00:00 GMT-3`). Un validador sobre el
catálogo habría rechazado la zona por defecto del propio proyecto. Además el catálogo puede
diferir entre Node y navegador, con lo que la regla de "schema Zod espejo" sería
inverificable.

**Cómo se garantiza que las dos puntas usan la misma regla.** El código es corto y está
copiado (el monorepo no tiene paquete compartido), así que el mecanismo anti-divergencia es
un **fixture versionado** — `shared-fixtures/formato-fecha-paridad.json` — con bloques
`zonasValidas` (incluye `America/Argentina/Buenos_Aires`, `America/Buenos_Aires`,
`Asia/Calcutta`, `Asia/Kolkata`, `Europe/Madrid`) y `zonasInvalidas`. Los dos specs (VO del
backend y schema Zod del frontend) recorren el mismo archivo. Si una punta migra a validar
por catálogo, `America/Argentina/Buenos_Aires` la pone en rojo. Es el patrón que el
repositorio ya usa para `sync-ayuda.spec.ts`: guard, no import.

**Select de la UI.** `Intl.supportedValuesOf('timeZone')` se usa solo como fuente de
**sugerencias**, nunca como validador, y la lista siempre incluye el valor vigente del tenant
aunque no esté en el catálogo — misma variante de "select con valor fuera de catálogo" que
`tipoActualFueraDeCatalogo` ya cerró (AGENTS.md, tabla de formularios). El Zod es
`z.string().refine(esZonaValida)`, nunca `z.enum`: un `z.enum` sería **más estricto** que el
backend y rechazaría datos que el servidor acepta.

### D3 — Cómo llega al runtime del backend

Campo `zonaHoraria: ZonaHoraria` en `TenantContextData` (`shared/tenancy/tenant-context.ts`),
bindeado por `TenantGuard` desde el `findById` que ya ejecuta (`tenant.guard.ts:59`).
**Cero queries nuevas.** Rechazado: re-consultar por call site — paga N queries por request y
admite que dos capas del mismo request lean valores distintos si la zona cambia en el medio.

### D4 — Cómo llega al frontend

Claim `zona_horaria: string | null` en `JwtPayload`, poblado desde `ScopeResuelto` en
`resolver-scope.ts:142-148`, que ya tiene la `ClienteEntity` cargada. Los tres emisores
(`login`, `refresh-token`, `switch-tenant`) leen del mismo `resolverScope`: cero cambios de
forma en ellos. `null` cuando `cliente_id` es `null` (token master de root), igual que
`cliente_nombre`.

**`VERSION_PAYLOAD_JWT` sube de 2 a 3.** Un access token emitido antes del deploy no trae el
claim; sin el bump, un tenant de Madrid vería hasta 15 minutos de horas mal en silencio.
`JwtAuthGuard` rechaza con 401 los `v` viejos y dispara el refresh que ya existe
(`i-token.service.ts:1-9`). **No es maquinaria de invalidación de sesiones**: es el mecanismo
que el repositorio construyó exactamente para un cambio de forma del payload.

### D5 — La forma del reemplazo de `formato-fecha.ts`

| Opción | Problema | Decisión |
|---|---|---|
| Zona como **primer parámetro obligatorio** de cada función de instante + hook `useFormatoFecha()` que la liga | ninguno | **Elegida** |
| Contexto leído dentro del módulo | Vuelve impuras funciones hoy testeables sin React | Rechazada |
| Zona con default | Un call site olvidado formatea en la zona equivocada sin error | Rechazada |

`formato-fecha.ts` sigue siendo funciones puras y sigue construyendo el `Intl.DateTimeFormat`
**por llamada**: con la zona entrando como argumento no queda nada que cachear al `import`.
La restricción documentada en el módulo (`formato-fecha.ts:112-121`) se preserva y se
refuerza — **la única memoización permitida en el hook es la del string de la zona, nunca un
`Intl.DateTimeFormat`**.

`useFormatoFecha()` (`frontend/src/shared/hooks/`) es la única juntura con `SessionContext` y
resuelve `user?.zona_horaria ?? ZONA_SIN_TENANT` en un solo lugar. Los 18 componentes son
`"use client"` y ya consumen contexto.

**Rutas públicas y `/login`.** El `layout.tsx` raíz monta `<Providers>` sin `initialUser`, y
el token master de root tampoco trae zona: en los dos casos el hook entrega
`ZONA_SIN_TENANT = "UTC"`, **declarada explícitamente**, nunca resuelta al navegador. Esto
sostiene el test vigente que espía que las opciones de `Intl.DateTimeFormat` sean siempre
explícitas. Hoy no hay consumidor —la encuesta pública CSAT no formatea ninguna fecha
(verificado: los 7 archivos del módulo no importan `formato-fecha`)—; la regla existe para el
próximo.

**El nuevo canario de la matriz de zonas.** El actual confirma que `process.env.TZ` cambió la
zona ambiente. Con la zona por parámetro se invierte y se vuelve más fuerte: la salida **debe**
cambiar al cambiar el argumento y **no debe** cambiar al mover `process.env.TZ`.

### D6 — `hoyArgentina()` y el dominio (el punto más delicado)

El dominio **no consulta la zona ni el reloj: recibe el día como dato.**

```
Caso de uso ──inyecta──> IRelojTenant.hoy(): Date        (shared/application/ports/)
      │                        └─ impl lee TenantContext  (shared/infrastructure/)
      └──pasa el Date──> ItemCompraEntity.registrarOrden(cantidad, hoyTenant, fecha = hoyTenant)
                                    └─ validarFechaEtapa(etapa, fecha, hoyTenant)   ← puro
```

| Opción | Veredicto |
|---|---|
| El servicio de dominio lee `TenantContext` | **Rechazada** — `domain/` importaría `AsyncLocalStorage` de `shared/tenancy`; viola AGENTS.md y vuelve la entidad no testeable sin scope |
| La entidad recibe la `ZonaHoraria` y calcula "hoy" | **Rechazada** — mete `Intl` y la noción de "ahora" en la entidad; deja el guard dependiente del reloj del proceso |
| **La entidad recibe `hoyTenant: Date`** | **Elegida** |

El default deja de ser una llamada a servicio (`fecha: Date = hoyArgentina()`,
`item-compra.entity.ts:456,493,531`) y pasa a ser el parámetro anterior. La semántica no
cambia: "si no me das fecha, uso hoy". Los cuatro casos de uso ya deciden si hay fecha
explícita (`registrar-orden-de-item.use-case.ts:70-71` y hermanos); solo cambian la rama sin
fecha por el reloj inyectado. `soloFecha()` no se toca: es truncado puro, sin zona.

`hoyArgentina()` desaparece; `fecha-argentina.ts` se renombra a `fecha-tenant.ts` y conserva
solo `soloFecha()`. El cálculo del día en una zona vive en `shared/domain/zona-horaria.ts`
como función pura `hoyEnZona(zona, ahora)` — usa `formatToParts`, nunca `format()`, para no
depender de la puntuación del locale (mismo criterio que `formato-fecha.ts:95-109`).

### D7 — El invariante "pantalla = CSV byte a byte", ahora testeado

Hoy es documentado y no testeado (`formato-fecha.ts:9-12`), con suites separadas. Se cierra
con el **mismo fixture de D2**, consumido por dos specs, uno por suite:

| Spec | Funciones que alimenta |
|---|---|
| `backend/src/shared/infrastructure/csv/csv.paridad.spec.ts` | `fechaHoraCsv`, `diaArgentinoCsv`, y el sufijo de `armar-export-csv.ts` |
| `frontend/src/shared/lib/formato-fecha.paridad.test.ts` | `formatearInstante`, `formatearInstanteComoDiaArgentino`, `hoyFechaCalendario` |

Cada caso del fixture es `{ instante, zona, esperadoInstante, esperadoDia, esperadoHoy }`. Un
test cruzado exigiría que una suite importe de la otra; el monorepo no tiene paquete común y
crearlo excede el alcance. El fixture es el mínimo mecanismo que impide que las dos puntas
diverjan sin poner una suite en rojo, e incluye la **segunda pareja acoplada**: el prefill de
`<input type="date">` y el "hoy" que valida el backend.

Casos obligatorios: `Europe/Madrid` a ambos lados del cambio de horario (último domingo de
marzo y de octubre de 2026), y el cruce de medianoche que ya cubre la matriz vigente.

### D8 — Migración: columna `NOT NULL` con backfill en un solo statement

```sql
-- 20260901120000_add_cliente_zona_horaria
ALTER TABLE "clientes"
  ADD COLUMN "zona_horaria" VARCHAR(64) NOT NULL
  DEFAULT 'America/Argentina/Buenos_Aires';
```

En PostgreSQL 11+ un `ADD COLUMN NOT NULL DEFAULT` no reescribe la tabla y **el backfill es
la propia cláusula**: nunca existe un NULL observable y el resultado **no depende del conteo
real de tenants de producción**, que sigue sin verificar. El `DEFAULT` se conserva como
backstop de las escrituras que no pasan por la aplicación (seeds, scripts); el dominio sigue
siendo la autoridad. Una migración ya aplicada no se edita: por eso columna y backfill van
juntos, no en dos archivos.

`VARCHAR(64)` da margen sobre el ID IANA más largo (`America/Argentina/ComodRivadavia`, 31).
Por la regla de topes espejados del AGENTS.md, `ZONA_HORARIA_MAX_LENGTH = 64` vive en el VO,
el DTO lo importa, y el frontend lo copia con **centinela** en su test —
`frontend/src/features/clientes/limites.ts` es el lugar exacto que ese patrón ya ocupa.

### D9 — Las 16 columnas `@db.Date` no se tocan: la ausencia del parámetro es el guard

`fechaCsv()` y `formatearFechaCalendario()` **no reciben zona**, ni opcional ni con default.
No es un comentario: es que no existe forma de pasarles una. El `TrampaDate` de la suite del
frontend y la guardia cruzada `reportarClasificacion` se conservan intactos. La advertencia
del schema sobre `Feriado.fecha` (`prisma_master/schema.prisma:476,488`) se reescribe
nombrando el símbolo nuevo, sin cambiar su sentido.

---

## Cambios de archivo

| Archivo | Acción | Qué |
|---|---|---|
| `backend/prisma_master/schema.prisma` | Modificar | Columna `zonaHoraria` + doc; actualizar la advertencia de `Feriado.fecha` |
| `backend/prisma_master/migrations/20260901120000_add_cliente_zona_horaria/migration.sql` | Crear | D8 |
| `backend/src/shared/domain/zona-horaria.ts` | Crear | VO `ZonaHoraria` (`crear`/`desdePersistencia`/`valor`/`equals`), `esZonaValida`, `hoyEnZona`, `partesEnZona`, `ZONA_HORARIA_MAX_LENGTH` |
| `backend/src/shared/domain/zona-horaria-argentina.ts` | Borrar | Reemplazado por el VO |
| `backend/src/shared/application/ports/i-reloj-tenant.ts` | Crear | Puerto `IRelojTenant.hoy(): Date` + token DI |
| `backend/src/shared/infrastructure/reloj-tenant.ts` | Crear | Implementación que lee `TenantContext` |
| `backend/src/shared/tenancy/tenant-context.ts` | Modificar | Campo `zonaHoraria` en `TenantContextData` |
| `backend/src/shared/shared.module.ts` | Modificar | Provee `IRelojTenant` |
| `backend/src/shared/infrastructure/csv/csv.ts` | Modificar | `diaArgentinoCsv`/`fechaHoraCsv` reciben `ZonaHoraria`; `fechaCsv` sin cambios (D9) |
| `backend/src/shared/application/armar-export-csv.ts` | Modificar | Sufijo del archivo vía `hoyEnZona` |
| `backend/src/auth/infrastructure/guards/tenant.guard.ts` | Modificar | Bindea la zona (sin query nueva) |
| `backend/src/auth/domain/ports/i-token.service.ts` | Modificar | Claim `zona_horaria`; `VERSION_PAYLOAD_JWT` → 3 |
| `backend/src/auth/application/use-cases/resolver-scope.ts` | Modificar | `ScopeResuelto.zonaHoraria` |
| `backend/src/auth/application/use-cases/{login,refresh-token,switch-tenant}.use-case.ts` | Modificar | Propagan el claim |
| `backend/src/clientes/domain/entities/cliente.entity.ts` | Modificar | Prop + getter + `configurarZonaHoraria()` |
| `backend/src/clientes/infrastructure/persistence/prisma/cliente.mapper.ts` | Modificar | Mapea la columna (fuera del `Omit`) |
| `backend/src/clientes/application/use-cases/configurar-zona-horaria-cliente.use-case.ts` | Crear | Espeja `configurar-csat-cliente.use-case.ts` |
| `backend/src/clientes/interface/dtos/cliente.dto.ts` | Modificar | `ConfigurarZonaHorariaClienteDto`; zona opcional en `CreateClienteDto` |
| `backend/src/clientes/interface/controllers/clientes.controller.ts` | Modificar | `PATCH /clientes/:id/zona-horaria` |
| `backend/src/clientes/clientes.module.ts` | Modificar | Wiring del caso de uso |
| `backend/src/compras/domain/services/fecha-argentina.ts` | Borrar | Se renombra |
| `backend/src/compras/domain/services/fecha-tenant.ts` | Crear | Solo `soloFecha()` |
| `backend/src/compras/domain/entities/item-compra.entity.ts` | Modificar | `hoyTenant` como parámetro (D6) |
| `backend/src/compras/application/use-cases/{registrar-orden,registrar-recepcion,registrar-entrega,editar-fecha-etapa}-de-item.use-case.ts` | Modificar | Inyectan `IRelojTenant` |
| `backend/src/compras/application/use-cases/exportar-compras.use-case.ts` | Modificar | Sufijo vía zona del tenant |
| `backend/src/compras/compras.module.ts` | Modificar | Wiring del reloj |
| `frontend/src/shared/lib/formato-fecha.ts` | Modificar | Zona por parámetro; muere `OFFSET_ARGENTINA_MS` |
| `frontend/src/shared/hooks/use-formato-fecha.ts` | Crear | Liga la zona de `SessionContext` (D5) |
| `frontend/src/shared/api/types.ts` | Modificar | Claim `zona_horaria` en `JwtPayload` |
| `frontend/src/features/clientes/{schemas,limites,types}.ts` | Modificar | Zod espejo + tope con centinela |
| `frontend/src/features/clientes/components/configurar-zona-horaria-dialog.tsx` | Crear | Espeja `configurar-csat-dialog.tsx`; incluye el aviso de re-lectura histórica |
| 18 componentes de `frontend/src/features/**` | Modificar | Pasan a `useFormatoFecha()` |
| `shared-fixtures/formato-fecha-paridad.json` | Crear | D2 + D7 |
| `backend/src/shared/infrastructure/csv/csv.paridad.spec.ts` | Crear | D7 |
| `frontend/src/shared/lib/formato-fecha.paridad.test.ts` | Crear | D7 |
| `backend/ayuda/zona-horaria.md` | Crear | Zona operativa, dónde se configura, propagación ≤15 min, re-lectura histórica |

---

## Contratos

```ts
// backend/src/shared/domain/zona-horaria.ts — dominio puro (solo Intl, plataforma).
export const ZONA_HORARIA_MAX_LENGTH = 64;
export function esZonaValida(candidata: string): boolean;

export class ZonaHoraria {
  static crear(raw: string): ZonaHoraria;            // valida; throw (precondición del caller)
  static desdePersistencia(raw: string): ZonaHoraria; // valida y nombra el clienteId al fallar
  get valor(): string;
  equals(otra: ZonaHoraria): boolean;
}

/** Día calendario de `zona` a las `ahora`, truncado a medianoche UTC (mismo criterio que `soloFecha`). */
export function hoyEnZona(zona: ZonaHoraria, ahora: Date): Date;
```

`desdePersistencia` **sí valida**, a diferencia del criterio de `validarLargos`
(`cliente.entity.ts:35-59`, que exime a `reconstitute`). La exención de allá existe porque
hay filas legítimas fuera de rango creadas por una puerta vieja; acá **ninguna puerta pudo
escribir una zona inválida** — la columna nace con backfill válido y todo escritor pasa por el
VO. Fallar en el guard nombrando el tenant es preferible a un `RangeError` opaco por cada
render.

```ts
// item-compra.entity.ts — el dominio recibe el día, no la zona ni el reloj.
registrarOrden(cantidadOrdenada: number, hoyTenant: Date, fecha: Date = hoyTenant): Result<void, DomainError>;
```

---

## Estrategia de tests

| Capa | Qué | Cómo |
|---|---|---|
| Unit (dominio) | VO: alias válidos, inválidos, tope de largo; `hoyEnZona` cruzando DST de `Europe/Madrid` | Recorre `shared-fixtures/`; el caso `America/Argentina/Buenos_Aires` es el centinela anti-catálogo |
| Unit (dominio) | `validarFechaEtapa` con `hoyTenant` inyectado | Sin reloj real: el test provee el día. Cubre el caso de la propuesta: 00:30 en Madrid **no** se rechaza como futura |
| Unit (frontend) | Matriz de zonas parametrizada por argumento | Canario invertido: cambia con el parámetro, **no** cambia con `process.env.TZ` |
| Paridad | Pantalla = CSV byte a byte | Fixture compartido, un spec por suite (D7) |
| Espejo | Zod del front contra el VO del backend | Ambos recorren `zonasValidas`/`zonasInvalidas` del mismo fixture |
| Integración | `TenantGuard` bindea la zona sin query adicional | Espía el repositorio: exactamente un `findById` por request |
| Integración | Migración: ninguna fila con `zona_horaria` NULL o inválida | Contra `soporte_master_test` (`usarLockMasterTest()` si trunca) |
| Mutación (verify) | Reintroducir un offset fijo debe poner en rojo el bloque `Europe/Madrid` | Si no muere, el test mide otra cosa |

---

## Threat Matrix

N/A — el cambio no toca routing, comandos de shell, subprocesos, automatización de VCS/PR,
clasificación de archivos ejecutables ni integración de procesos.

---

## Migración / rollout

1. Migración (D8): un statement, backfill incluido, sin ventana con NULL.
2. Backend: VO + `TenantContext` + claim + bump de `VERSION_PAYLOAD_JWT`. Al deployar, los
   tokens `v: 2` reciben 401 y refrescan solos.
3. Las tres capas lectoras (frontend, CSV, compras) son **commits reversibles por separado**:
   la zona ya está en la base y en el contexto, y cada capa solo elige si la lee.
4. ABM + artículo de Ayuda en el mismo work unit del módulo `clientes`.
5. Reversión total con datos: poner todos los tenants en
   `America/Argentina/Buenos_Aires` restaura el comportamiento actual sin tocar código.

**No se diseña** invalidación de sesiones (el refresh de 15 minutos alcanza y el bump del
payload cubre el deploy) ni migración de instantes históricos: se re-leen en la zona nueva y
eso es correcto — el diálogo de configuración lo advierte antes de guardar.

---

## Deuda declarada (no se implementa acá)

`CalendarioLaboralDia` / `Feriado` (módulo `sla-habil`, `prisma_master/schema.prisma:437-495`)
modelan **una sola configuración global** con `aperturaMinuto`/`cierreMinuto` documentados
como "minutos desde la medianoche LOCAL". No bloquea hoy: el SLA en uso
(`calcular-sla-vence.service.ts`) es reloj 24/7 y no depende de zona. Si `sla-habil` se
retoma, hereda esta ambigüedad multiplicada por tenant y necesitará su propia decisión de
alcance (config por tenant o zona de referencia única).

---

## Preguntas abiertas

- [ ] Conteo real de tenants de producción. **No bloquea la implementación** — D8 la hace
      independiente del conteo — pero sí la verificación post-deploy de que cada tenant quedó
      en la zona que le corresponde.
- [ ] Zona por defecto de un cliente nuevo: se asume `America/Argentina/Buenos_Aires` (mismo
      valor del backfill). Si el alta debe exigirla explícitamente, es una línea del DTO.
