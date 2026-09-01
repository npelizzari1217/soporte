# Exploración — `zona-horaria-por-tenant`

**Fecha:** 2026-09-01 · **Fase:** explore (solo lectura) · **Estado:** lista para propose

---

## Contexto y decisión ya tomada

El equipo trabaja repartido entre **Argentina y España**, de forma permanente. Hoy la
aplicación muestra hora de Buenos Aires a todos los usuarios, con la zona hardcodeada.

**Decisión de producto tomada (no se reabre):** la zona de visualización la fija el
**tenant** (una zona operativa por cliente), no cada usuario. Motivo: es un sistema de SLA
y turnos; con zona por usuario, "vence a las 17" deja de nombrar un instante acordado.

El offset fijo `-3h` se reemplaza por **zona IANA**. Funciona hoy solo porque Argentina no
tiene horario de verano desde 2009; `Europe/Madrid` es UTC+1 o UTC+2 según el mes, así que
un offset fijo con zona configurable se rompe en silencio el último domingo de octubre.

---

## Q1 — Inventario de zona horaria / offset / presentación hardcodeada

| Ruta:línea | Qué hace | Clase |
|---|---|---|
| `frontend/src/shared/lib/formato-fecha.ts:42` `ZONA_ARGENTINA` | Zona IANA fija usada por `formateadorInstante()` / `formateadorDiaArgentino()` para todo instante en pantalla | instante |
| `frontend/src/shared/lib/formato-fecha.ts:59` `OFFSET_ARGENTINA_MS` | Offset fijo −3h, usado solo por `hoyFechaCalendario()` (prefill de `<input type="date">`); debe coincidir con el "hoy" que valida el backend | instante ("hoy") |
| `backend/src/shared/domain/zona-horaria-argentina.ts:18` `OFFSET_ARGENTINA_MS` | Offset fijo compartido por `desplazarAArgentina()`, consumido por CSV y por `fecha-argentina.ts` de compras | instante |
| `backend/src/compras/domain/services/fecha-argentina.ts:40` `hoyArgentina()` | **No es presentación**: prellena `fechaOrden`/`fechaRecepcion`/`fechaEntrega` (`item-compra.entity.ts:456,493,531`) y **rechaza fechas futuras** (`item-compra.entity.ts:618`) | validación de dominio dependiente de zona |
| `backend/src/compras/application/use-cases/exportar-compras.use-case.ts` | Deriva el sufijo del nombre de archivo CSV de `hoyArgentina()` | instante (nombre de archivo) |
| `backend/src/shared/infrastructure/csv/csv.ts:17,174,191` | `diaArgentinoCsv()` / `fechaHoraCsv()` usan `desplazarAArgentina()` | instante |
| `backend/src/shared/application/armar-export-csv.ts:81` | Sufijo de fecha del CSV compartido vía `desplazarAArgentina()` | instante |
| `backend/prisma_master/schema.prisma:437-495` `CalendarioLaboralDia` / `Feriado` | Módulo `sla-habil`, **no implementado en runtime**. `aperturaMinuto`/`cierreMinuto` documentados como "minutos desde la medianoche LOCAL", con una sola configuración global para todos los tenants (ADR-1) | config global latente |
| `backend/src/sla/domain/services/calcular-sla-vence.service.ts` | Cálculo de SLA en uso: reloj 24/7 sin horario laboral. **No depende de zona**, no está afectado | sin dependencia de zona |

**Call sites de `formato-fecha.ts`:** 27 archivos (18 componentes + 9 tests). Todos los
componentes son `"use client"`. **Ningún Server Component formatea instantes hoy.**

---

## Q2 — Clasificación de columnas de fecha

Total: **25 `@db.Timestamptz`** (instante, se convierte) y **16 `@db.Date`** (calendario,
**no** se convierte) entre los dos schemas.

### `prisma_tenant` — `@db.Timestamptz`
`Estado` / `Prioridad` / `TipoTicket` / `Sector` / `TipoOperacion`.createdAt/updatedAt/deletedAt;
`CicloCliente`.createdAt/updatedAt/deletedAt; `Ticket`.slaVenceAt, fechaCierre, createdAt,
updatedAt, deletedAt; `EncuestaSatisfaccion`.respondidaEn, createdAt, updatedAt, deletedAt;
`OperacionTicket`, `Archivo`, `ArchivoTicket`, `ArchivoOperacion`, `ArchivoEquipo`,
`TicketEdilicia`, `ComentarioReparacion`, `ReparacionCompra`, `SubtareaEdilicia`.completadaEn,
`EquipoInformatico`, `ComponenteEquipo`, `TicketSoporte`, `Compra`.canceladaEn,
`ItemCompra`.decididoEn, `OperacionCompra`, `PlanPreventivo`, `PreventivoGeneracion`.

### `prisma_tenant` — `@db.Date` (NO se convierte)
`CicloCliente`.fechaInicio, fechaFin; `EquipoInformatico`.fechaAdquisicion, fechaValoracion,
fechaValorResidual; `Compra`.fechaSolicitud; `ItemCompra`.fechaCotizacion, fechaOrden,
fechaRecepcion, fechaEntrega; `PlanPreventivo`.fechaInicio, proximaEjecucionEn;
`PreventivoGeneracion`.fechaProgramada.

### `prisma_master` — `@db.Timestamptz`
`Cliente` (incluye smtpConfigUpdatedAt, smtpVerificadoAt), `CicloVigente`, `TipoComponente`,
`Usuario`, `Membresia`, `RefreshToken`.expiresAt/revokedAt, `EncuestaToken`.expiresAt/usedAt/revokedAt,
`Role`, `UsuarioClientePermiso`, `KbArticulo`, `CalendarioLaboralDia`, `Feriado`.

### `prisma_master` — `@db.Date` (NO se convierte)
`CicloVigente`.fechaInicio, fechaFin; `Feriado`.fecha — el schema ya advierte: *"TRAMPA —
Prisma la devuelve como medianoche UTC. Aplicarle `desplazarAArgentina` CORRE EL DÍA PARA
ATRÁS"*.

---

## Q3 — Cómo llega el tenant al request (backend)

Cadena de tres piezas, en orden de ejecución:

1. `backend/src/shared/tenancy/tenant-scope.middleware.ts` — `TenantScopeMiddleware`, corre
   antes que los guards. Llama `TenantContext.initScope(next)`, que ejecuta el pipeline
   dentro de un `AsyncLocalStorage.run()`. Existe porque `enterWith()` dentro de un guard no
   propagaba el contexto de forma confiable entre continuaciones async.
2. `backend/src/auth/infrastructure/guards/tenant.guard.ts` — `TenantGuard`, después de
   `JwtAuthGuard`. Lee `user.cliente_id` del JWT, hace la única query del guard
   (`IClienteRepository.findById`), valida `activo && !isDeleted()`, resuelve
   `PrismaService.getTenantClient(dbName)` y llama `TenantContext.bind({...})`.
3. `backend/src/shared/tenancy/tenant-context.ts` — `TenantContext`, wrapper de
   `AsyncLocalStorage`. Hoy expone `prismaClient`, `dbName`, `clienteId`, `enTransaccion?`,
   `postCommitCallbacks?`. **No tiene campo de zona horaria.** Es el punto natural para
   agregar `zonaHoraria` sin repetir la query a `clientes`.

No hay header `X-Tenant-Id`: por ADR-4, el switch de tenant vía reemisión de JWT es el único
mecanismo, incluido ROOT.

---

## Q4 — Precedente: cómo se lee hoy la configuración por cliente

El SMTP por cliente es el camino completo, de columna a caso de uso:

1. Columnas en `Cliente` (`prisma_master/schema.prisma:94-102`), todo-o-nada vía CHECK raw SQL.
2. `cliente.mapper.ts` — `ClienteMapper.toPersistence()` **excluye** las 9 columnas SMTP con
   un `Omit`, para que una edición comercial no las pise sin querer.
3. Repositorio separado: `prisma-cliente-email-config.repository.ts`, con selects explícitos.
   Nunca pasa por `ClienteMapper` ni por `PrismaClienteRepository.save()`.
4. Puerto de dominio: `clientes/domain/ports/i-cliente-email-config.repository.ts`.
5. Casos de uso separados por operación (`configurar-`, `ver-`, `probar-`, `quitar-correo-cliente`).
6. Consumidor: `notificaciones/infrastructure/email/tenant-aware-email-sender.ts`, que lee la
   config por `clienteId` al momento de enviar.

**Patrón aplicable a la zona:** si es un solo campo simple, el precedente liviano es
`csatHabilitado` (campo suelto en `Cliente`, getter en la entidad, método `configurarX()`
dedicado con su propio `touch()`), no el aparato completo de SMTP. En ambos casos la
constante es: **una acción separada de `editar()`**.

---

## Q5 — De dónde saca la zona el frontend (Next.js App Router)

- `frontend/src/app/(dashboard)/layout.tsx` — Server Component async. Lee la cookie `at`
  (httpOnly) con `cookies()`, decodifica el JWT con `decodeJwtPayload` (sin verificar firma;
  el middleware ya autorizó) y pasa `initialUser: JwtPayload` a `<Providers>`.
- `frontend/src/shared/api/types.ts` — `JwtPayload` ya incluye `cliente_id`,
  `cliente_nombre`, `is_global_admin`, `modulos`, `membresias`. **Es el precedente exacto:**
  el backend ya empaqueta un atributo del tenant en el JWT y el Server Component ya lo
  hidrata sin fetch adicional.
- `frontend/src/shared/providers/providers.tsx` — `ThemeProvider > QueryProvider >
  SessionProvider(initialUser) > IdleTimeoutProvider`. No hay `TenantProvider` ni
  `TimezoneProvider` dedicado; la info de tenant vive en `SessionContext`.
- **El formateo ocurre solo en cliente.** Los 18 componentes son `"use client"`.
- `frontend/src/app/layout.tsx` (root) usa `<Providers>` **sin** `initialUser`: cubre `/login`
  y rutas públicas, donde todavía no hay tenant resuelto.

**Mecanismo de menor fricción:** agregar la zona al payload del JWT, junto a
`cliente_nombre`. Alternativa a evaluar en propose: exponerla en el payload de cada respuesta
de API que ya trae fechas.

---

## Q6 — Exportación CSV

Las dos puntas usan hoy la **misma** fuente de offset:

- `csv.ts` — `diaArgentinoCsv()` y `fechaHoraCsv()` llaman `desplazarAArgentina()`.
  `fechaCsv()` (columnas `@db.Date`) **no** desplaza, que es lo correcto.
- `formato-fecha.ts:9-12` declara el invariante explícito: *"lo que se ve en pantalla queda
  byte a byte igual a la exportación CSV del mismo campo"*. Se sostiene hoy solo porque
  ambas capas leen la misma constante fija.

**Si el frontend pasa a zona por tenant y el CSV mantiene el offset fijo, el invariante se
rompe**: la pantalla mostraría hora de Madrid y el CSV descargado seguiría en hora de Buenos
Aires para el mismo tenant. El CSV vive en `backend/src/shared/infrastructure`, así que
incluirlo contradice el alcance "solo presentación" si "presentación" se lee como "frontend".

La paridad es un invariante **documentado, no testeado**: las suites son separadas
(backend / frontend) y no hay ninguna prueba cruzada.

---

## Q7 — Cobertura de tests existente

**Matriz principal:** `frontend/src/shared/lib/formato-fecha.test.ts` (250 líneas).

- Guardia cruzada instante/calendario (`reportarClasificacion`) — 4 tests.
- Salida literal de `formatearInstante` / `formatearInstanteComoDiaArgentino` — 3 tests,
  incluido el cruce de medianoche UTC↔ART.
- `formatearFechaCalendario` nunca corre el día — 3 tests, más un `TrampaDate` que explota si
  se construye un `Date`.
- Opciones de `Intl.DateTimeFormat` siempre explícitas (zona nunca implícita) — espía el
  constructor.
- `hoyFechaCalendario` — 6 tests de bordes de milisegundo alrededor de las 03:00 UTC.
- `aFechaInput` — 4 tests de idempotencia y no-parseo.
- **Matriz de 4 zonas**: `describe.each(["Pacific/Kiritimati", "Pacific/Midway", "UTC",
  "America/Argentina/Buenos_Aires"])`, cada bloque con un **canario** que confirma que
  `process.env.TZ` cambió efectivamente la zona ambiente.

**Backend relacionado:** `csv.spec.ts`; `fecha-argentina.spec.ts` (incluye el caso 23:00 ART
= 02:00 UTC del día siguiente); `item-compra.entity.spec.ts` (rechazo de fecha futura).

**Qué se rompe:** toda la matriz de zonas y los tests que hardcodean `"17/08/2026 14:30"`
esperando Buenos Aires. Los tests de `hoyArgentina()` y `csv.spec.ts` dependen de la misma
constante fija.

**Qué falta:** una matriz equivalente con **una zona con DST real** (`Europe/Madrid`) que
cruce el cambio de horario. Ninguna de las 4 zonas actuales tiene DST observable en el rango
testeado: el riesgo que motiva este cambio no tiene hoy ningún test que lo atraparía.

---

## Q8 — Ayuda

Barrido de los 8 archivos de `backend/ayuda/*.md` por `hora|Argentina|zona|UTC|reloj`: **cero
menciones** de huso horario. Los dos matches en `mantenimiento-preventivo.md` son falsos
positivos ("ahora" como adverbio, "zona" como área física).

`tickets-listado.md` menciona "fecha de creación" y "fecha de cierre" sin comprometerse a un
huso, así que no queda desactualizado.

**Conclusión:** ningún artículo queda mintiendo por el cambio de zona en sí. Sí corresponde
evaluar en propose/design si el nuevo flujo de configuración de zona necesita un artículo
propio.

---

## Q9 — Tenants existentes y comportamiento con la columna en NULL

**Conteo (verificado por el orquestador, no por esta fase):**

```
docker exec soporte-postgres-master psql -U soporte -d soporte_master \
  -c "SELECT nombre, db_name, activo FROM clientes;"
→ 1 fila: "Demo Soporte" (activo)
```

⚠️ Esa consulta corre contra la base **local de Docker, no contra producción**. La memoria del
proyecto registra **dos** tenants productivos. El conteo real de producción queda **sin
verificar** y hay que confirmarlo antes del rollout.

`PrismaTenantEnumerator.listActiveTenants()` es el único punto que enumera todos los tenants
activos (usado por los schedulers de SLA y preventivo): es el lugar natural para verificar en
runtime si alguno quedaría con zona NULL.

**Opciones de comportamiento (decide el usuario en propose):**

1. **NULL = fallback a `America/Argentina/Buenos_Aires`.** Cero cambio de comportamiento el
   día del deploy. Riesgo: un tenant creado sin setear el campo queda en zona argentina en
   silencio.
2. **NULL = fail-closed.** Fuerza un backfill obligatorio antes del deploy. Más seguro contra
   la mala configuración silenciosa, pero exige coordinar el backfill como parte del release.
3. **Migración con backfill explícito y columna `NOT NULL` desde el día 1.** Nunca existe un
   estado NULL observable. Coherente con el patrón todo-o-nada que el repo ya usa. Es una
   migración de una columna nueva, no de las 25 existentes.
4. **Nullable con fallback ad-hoc en cada call site.** Antipatrón: el repo centralizó
   `OFFSET_ARGENTINA_MS` en una única constante justamente para evitar que dos capas apliquen
   criterios distintos. Mencionada solo para descartarla.

---

## Riesgos

1. **`hoyArgentina()` no es presentación.** Es una regla de dominio (`item-compra.entity.ts:618`
   rechaza fechas futuras; `:456,493,531` prellenan fechas de etapa). Cambiar solo la capa de
   presentación deja este validador anclado a Argentina para todos los tenants: un usuario en
   Madrid podría ver rechazada una fecha que para él es "hoy". **Es el hallazgo que más
   condiciona el alcance.**
2. **`CalendarioLaboralDia` (`sla-habil`, no implementado)** modela una sola configuración
   global con minutos "desde la medianoche LOCAL". Si se retoma después de este cambio,
   hereda la misma ambigüedad. No bloquea hoy, porque el SLA en uso es 24/7.
3. **El invariante pantalla = CSV byte a byte** se rompe si el CSV no sigue la zona del
   tenant. Necesita decisión explícita.
4. **Cero cobertura con una zona con DST real.** El riesgo que motiva el cambio no tiene test.
5. **Conteo de tenants de producción sin verificar** (ver Q9).

---

## Listo para propose

Sí, con cuatro decisiones que `sdd-propose` debe resolver explícitamente:

- **(a)** ¿`hoyArgentina()` y la validación de fecha futura en compras entran en el alcance, o
  quedan como deuda declarada?
- **(b)** ¿El CSV del backend sigue la zona del tenant, o mantiene el offset fijo? ¿Qué pasa
  con el invariante byte a byte?
- **(c)** Cuál de las cuatro opciones de comportamiento en NULL (Q9).
- **(d)** Confirmar el conteo real de tenants de producción antes de cerrar el rollout.
