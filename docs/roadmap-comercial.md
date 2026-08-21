# Roadmap comercial — seis funciones para vender el producto

Análisis del 2026-08-19. Compara el sistema contra Zendesk, Freshservice, GLPI y
Jira Service Management, y prioriza qué falta para competir.

**Estado: en ejecución.** El punto 1 está en producción desde el 2026-08-20. El
resto se reordenó el 2026-08-21 bajo una decisión nueva del usuario: **los datos
de producción son descartables** en esta etapa. Es menos trabajo destruirlos y
regenerarlos que convertirlos, así que se prioriza construir el software sólido
sin cargar el peso de las migraciones.

Eso agregó una **Fase 0 de fundación** antes de seguir con los seis puntos, y
cambió las estimaciones — ver "Fase 0" y "El plan de carriles" más abajo.

## El marco

Esto **no es un sistema de tickets**: es una suite de operaciones (tickets + SLA
+ inventario de equipos + mantenimiento edilicio + compras con aprobación +
ayuda), multi-tenant y ya en producción con dos clientes.

Eso cambia contra quién se compite:

| Producto | Dónde gana | Dónde le ganamos |
|---|---|---|
| Zendesk | Multicanal, portal, automatizaciones, encuestas | No hace inventario, ni edilicia, ni compras |
| Freshservice | ITSM completo, CMDB, cambios y problemas | No hace mantenimiento edilicio ni pedidos con aprobación |
| **GLPI** | **Gratis, inventario fuerte, muy instalado en la región** | Complejo de operar; sin compras ni edilicia integradas |
| Jira Service Management | Flexibilidad de flujos, integraciones | Sobredimensionado para una PyME |

**GLPI es el competidor real, no Zendesk.** El argumento no puede ser precio:
tiene que ser cubrir compras y edilicia en el mismo lugar, y usarse sin
consultor.

## Los seis puntos

| # | Qué | Dificultad | Estimado | Estado |
|---|---|---|---|---|
| 1 | Exportar a Excel/CSV | Baja | 1-2 días | **HECHO** — en producción desde el 2026-08-20 (`a9bb3fa`) |
| 2 | Reparación ↔ Compra | Media | 3-4 días | pendiente — decisiones de producto cerradas |
| 3 | Encuesta de satisfacción | Media | 4-6 días | pendiente |
| 4 | Mantenimiento preventivo recurrente | Media | 5-8 días | pendiente — decisiones de producto cerradas |
| 5 | Horario laboral en el SLA | Media | 4-6 días | pendiente — decisiones de producto cerradas |
| 6 | Ticket por email entrante | Alta | 2-3 semanas | **DIFERIDO** por decisión del 2026-08-20 |

Estimado restante sobre los puntos 2 a 5: **~16-24 días en serie**. Los puntos 2
y 5 bajaron respecto de la estimación original porque la política de datos
descartables les saca el peso de la migración — al punto 5 le saca "el problema
mayor", que era recalcular `slaVenceAt` histórico.

Con **dos carriles en paralelo** (ver "El plan de carriles"): **~9-14 días de
wall-clock**. Sumando la Fase 0, el total del proyecto queda en **~12,5-19 días**
contra los ~21-30 que costaría en serie.

> Ojo con leer eso como un ahorro. El total **no baja: se reasigna.** Lo que se
> caía de migración volvió a entrar como fundación. Lo que se gana no es
> velocidad, es que lo que quede parado no tenga grietas abajo.

> **Mantené esta columna al día.** Un roadmap sin estado obliga a reconstruir de
> memoria qué se entregó, y esa reconstrucción falla: el punto 1 estuvo en
> producción varias semanas mientras el documento seguía diciendo "pendiente".

## Entregado fuera de los seis puntos

Trabajo que no estaba planificado y que salió de operar el sistema. Se anota acá
para que el roadmap refleje el esfuerzo real, no solo el previsto.

| Qué | Cuándo | Por qué apareció |
|---|---|---|
| Fecha de cierre de tickets: instante real en vez de día truncado | 2026-08-20 (`5a6be20`) | Perseguir una anomalía de zona horaria que resultó falsa; destapó dos defectos reales, uno de ellos con tiempos de resolución NEGATIVOS en el dashboard |
| Configuración de correo SMTP **por cliente** | 2026-08-20 (`d2d90a4`) | Decisión de producto: cada cliente manda con su identidad, nada genérico. Reemplazó el envío global |
| Asignar tickets también a COLABORADOR | 2026-08-20 (`d2d90a4`) | Los colaboradores cumplen funciones de técnico |
| Rotación de la clave del admin, reparada y versionada | 2026-08-20 (`d2d90a4`) | La herramienta existente estaba rota y **reportaba éxito igual** |
| `deploy.ps1`: auto-actualización, orden de correo y chequeo de exit codes | 2026-08-20 (`d2d90a4`) | Cuatro incidentes de deploy en un día, todos por la misma causa |

## Fase 0 — Fundación

Apareció el 2026-08-21 con la decisión de datos descartables. La lógica es
simple: si no vamos a migrar datos, todo el esfuerzo va a que el software quede
bien parado. Pero eso **no sale gratis** — el total no baja, se reasigna: se caen
~4 días de migración y entran ~5-6 de fundación.

| Carril | Qué | Estado |
|---|---|---|
| A | **Saneamiento de tipos del backend** — 119 errores escondidos tras la exclusión `**/*.spec.ts` | 6 work units, **hecho**, pendiente merge |
| B | **Render de fechas del frontend** — 6 copias de `Intl.DateTimeFormat` sin `timeZone` | 7 work units, **hecho**, pendiente merge |
| — | **Cambio de contraseña** (ver más abajo) | sin empezar |

**Lo que destapó el carril A**, y que justifica el ciclo entero: el renombre del
enum `SOPORTE → TICKETS` nunca llegó a los tests; un campo retirado de una
interfaz seguía vivo en fixtures, con un comentario que afirmaba lo contrario;
una aserción que comparaba `undefined` contra ausente y por eso pasaba sin probar
nada; cinco fixtures construyendo una entidad que no puede existir.

**Lo que destapó el carril B**: un bug de huso horario ya diagnosticado y
corregido en Compras seguía intacto en Equipos, y cinco sitios usaban el
normalizador de `<input type="date">` como formateador de pantalla.

Los dos carriles dejaron **un gate instalado y probado rompiéndolo a propósito**:
`pnpm typecheck` ahora falla si un test tiene un error de tipo, y `pnpm lint`
falla si aparece una séptima copia del formateador de fechas.

### El plan de carriles

`sdd-apply` no admite dos instancias sobre el mismo cambio, pero el ledger es
**por cambio** y `sdd-attempt handoff` contempla worktrees enlazados. Así que dos
carriles se ejecutan en paralelo, **cada uno en su propio worktree**.

Esto último no es opcional y el motivo no es de git: `acquire` congela el árbol
de referencia, y un commit hecho mientras otro carril tiene un intento abierto le
corrompe la contabilidad de líneas y le bloquea el `settle`.

**El techo son dos carriles, no cuatro** — cada uno exige verificación propia
antes de integrar, y con cuatro el orquestador se vuelve el cuello de botella.

Con dos carriles, los puntos 2 a 5 pasan de ~21-30 días en serie a **~12,5-19 de
wall-clock**. Pero antes de abrir cada ola hay que **aterrizar las migraciones de
Prisma en serie**: `schema.prisma` es un archivo solo y dos carriles
escribiéndolo es conflicto garantizado.

### Decisiones de producto ya cerradas (2026-08-21)

Para no re-litigarlas al empezar cada punto:

- **Punto 2** — "bloqueada" es un estado **derivado** (tiene ≥1 compra vinculada
  sin recibir), **no** frena `porcentajeAvance`, y **sí** se ve en el listado con
  chip y filtro. El tiempo bloqueado se descuenta del tiempo de reparación que se
  le muestra al cliente.
- **Punto 4** — el preventivo genera un **ticket** con `tipoTicket` propio
  "Preventivo", **excluido de las métricas de SLA**. Solicitante: un usuario de
  sistema por tenant, sembrado por el seed.
- **Punto 5** — calendario **por cliente** con default 9-18 lun-vie; feriados
  nacionales AR precargados en el seed más excepciones por cliente; un ticket
  abierto fuera de horario arranca el reloj en la **próxima ventana hábil**.

### 1 · Exportar a Excel/CSV — Baja

Reusar los casos de uso de listado que ya existen, con sus filtros, y volcar a
CSV.

- El permiso ya está previsto: la acción `IMPRESION` existe en `ACCIONES_PISO`
  (`backend/src/shared/domain/acciones.ts`) y está **deliberadamente sin usar**
  en los seis módulos. Es el gancho listo.
- Cuidado: BOM de UTF-8 (sin eso Excel muestra `Reparación` como `ReparaciÃ³n`).
- Cuidado: no bufferear en memoria; exportar en streaming.

### 2 · Reparación ↔ Compra — Media

Conectar una reparación con la compra que la está frenando. Responde la pregunta
que **ninguno de los cuatro competidores** puede responder, porque ninguno tiene
compras: *¿por qué esta reparación lleva tres semanas?*

- Técnicamente simple: reparaciones y compras viven en la **misma base del
  tenant**, no hay problema cruzado.
- Relación **N:N** (una reparación puede esperar varias compras; una compra
  puede destrabar varias reparaciones).
- **El trabajo real es de producto, no de modelo**: hoy una reparación no tiene
  estado, sólo `porcentajeAvance`. Decidir ANTES de codificar qué significa
  "bloqueada": ¿es un estado nuevo?, ¿frena el avance?, ¿se ve en el listado?
- Origen: el usuario pidió comentarios en reparaciones y el ejemplo que dio fue
  "falta un repuesto". Hoy eso es texto libre.

### 3 · Encuesta de satisfacción (CSAT) — Media

Al cerrar el ticket, mail con enlace de calificación. Ya existen SMTP, listeners
y plantillas en `backend/src/notificaciones/`.

- **El endpoint es público, sin autenticación**: el que responde no se loguea.
  En multi-tenant eso exige un token firmado que codifique tenant + ticket, de
  un solo uso y con vencimiento. Es la única superficie sin auth del sistema.
- Sumar la métrica al dashboard.

### 4 · Mantenimiento preventivo recurrente — Media

Generar tareas automáticas ("revisar la caldera cada 6 meses"). Sin esto, el
módulo de equipos es un inventario, no un plan de mantenimiento.

- **La infraestructura ya existe y está probada en producción**: `@nestjs/schedule`
  con `@Cron`, y `SlaSweepScheduler`
  (`backend/src/sla/infrastructure/schedulers/sla-sweep.scheduler.ts`) ya recorre
  todos los clientes activos vía `ITenantEnumerator` con aislamiento por tenant.
  Copiar ese patrón.
- **El riesgo es la idempotencia**: si el servicio reinicia o el cron corre dos
  veces, no puede duplicar la tarea. Necesita marca de última generación y un
  test que corra el generador dos veces y verifique que crea una sola.
- Decidir qué entidad se genera: ¿ticket?, ¿reparación edilicia?, ¿ambas?

### 5 · Horario laboral en el SLA — Media-alta

Hoy el SLA son horas corridas: un ticket abierto viernes 18:00 vence el sábado.

- Calendario de atención por cliente + feriados; vencimiento sobre horas hábiles.
- La aritmética de fechas es traicionera (noches, fines de semana, feriados,
  cambio de horario). Exige tests parametrizados fuertes.
- **El problema mayor es la migración**: los tickets existentes tienen
  `slaVenceAt` con la regla vieja. Recalcular cambia números históricos de
  cumplimiento que quizá ya se le mostraron a un cliente; no recalcular deja dos
  reglas conviviendo. **Decidirlo antes de empezar.**

### 6 · Ticket por email entrante — Alta

La más valiosa y la más cara. Hoy hay envío (SMTP) pero **no recepción**. Sin
esto cada persona tiene que aprender a entrar a una app; con esto manda un mail
como siempre.

- **Ruteo de tenant**: llega un mail, ¿de qué cliente es? En un producto de un
  solo cliente este problema no existe. Se resuelve con direcciones por cliente.
- **Identidad**: el remitente puede no estar registrado. ¿Rechazar, crear,
  dejar pendiente?
- **Conversación**: una respuesta debe sumarse como comentario, no crear un
  ticket nuevo (`Message-ID`/`References`). Es donde estas integraciones fallan.
- **Bucles**: un autorespondedor de vacaciones puede generar tickets infinitos.
- **Infraestructura fuera del código**: casilla o proveedor de correo entrante.
  En un VPS Windows, un webhook de proveedor es más confiable que un poller IMAP.

## Orden acordado

> Actualizado el 2026-08-20. Lo tachado ya no aplica; se deja visible para que se
> entienda por qué el orden es el que es.

1. ~~**Arrancar en paralelo**: el punto 1 y la gestión de infraestructura de
   correo del punto 6~~ — **el punto 1 está entregado**. La infraestructura de
   correo entrante quedó **diferida**: se decidió que cada cliente configure su
   propia cuenta SMTP, lo que resuelve el ENVÍO. La RECEPCIÓN (que alguien abra
   un ticket mandando un mail) sigue sin construirse y es lo que queda del
   punto 6.
2. **Punto 2 — el diferencial. Es el siguiente.**
3. Punto 4 — reusa infraestructura probada.
4. Punto 3.
5. Punto 5.
6. Punto 6 — diferido.

**Antes del punto 2 va la Fase 0** (ver más abajo).

> **Corrección del 2026-08-21.** Acá decía que "el ADMINISTRADOR de Cic Lanus no
> tiene ningún permiso de módulo". **No es un bug y se baja del roadmap.**
> `PRESETS_ROL.ADMINISTRADOR: []` es deliberado y está documentado en
> `backend/src/auth/domain/presets-rol.ts:87`: `resolverScope` materializa TODOS
> los pares válidos en el payload del JWT (ADR-P6, `resolver-scope.ts:137`). Y el
> endpoint que alimenta la grilla devuelve `celdas: []` junto a
> `esAdministrador: true` a propósito, para que el frontend la pinte toda
> tildada. Lo que se reportó fue, casi seguro, alguien mirando esa grilla vacía.
>
> Lo de `TICKETS:ASIGNAR` sí era real, pero **ya está en el preset TECNICO**
> (`presets-rol.ts:62`): se resuelve regenerando el tenant, sin tocar código. Ojo
> con un matiz: la política de datos descartables se acordó para el entorno
> local. **Producción no se regenera** — sigue en el VPS con dos clientes reales,
> así que ahí hay que cargarlo a mano o decidir explícitamente regenerar.
>
> Queda anotada una hipótesis SIN VERIFICAR: el bypass del ADMINISTRADOR vive
> solo en el token, no en la tabla `usuario_cliente_permisos`. Cualquier consulta
> del tipo "quiénes tienen el permiso X" excluye administradores en silencio. Hoy
> no muerde porque las consultas que existen filtran por rol, pero es una costura.

## Carencia detectada fuera de los seis puntos

### Cambio de contraseña — Baja dificultad, prioridad alta

**Hoy ningún usuario puede cambiar su propia contraseña.** No hay pantalla ni
endpoint: buscado en `backend/src` y `frontend/src` (`cambiar-password`,
`change-password`, `CambiarPassword`), cero resultados.

Apareció el 2026-08-20 al intentar rotar la clave del admin de producción. La
única herramienta que existía (`rotate-admin-pw.ps1`, sin versionar en el VPS)
estaba rota: dependía de un script borrado y **reportaba éxito igual**.

No es una comodidad, es un agujero de producto:

- Una credencial expuesta no se puede rotar sin acceso al servidor.
- Un usuario que sospecha que alguien vio su clave no tiene qué hacer.
- Es de las primeras cosas que va a preguntar un cliente con área de sistemas, y
  la respuesta "hay que pedírselo al proveedor" no sobrevive esa conversación.

Alcance mínimo: que un usuario autenticado cambie su propia contraseña
validando la actual. El reseteo por olvido (con email) es un problema distinto y
más grande — necesita tokens de un solo uso con vencimiento — y puede ir después.

## Deuda técnica conocida

Ninguna bloquea el roadmap. Se anota acá porque una deuda que solo vive en la
cabeza de alguien deja de existir cuando esa persona no está.

**Ordenada por lo que puede hacer más daño:**

| Qué | Por qué importa |
|---|---|
| **Regeneración reproducible del entorno**: `demo-seed.ts` solo aplica preset al rol TECNICO, y **la creación del contenedor de Postgres no está documentada en ninguna parte** | Es el cimiento del que cuelga toda la política de datos descartables. Destruir y regenerar sale más barato que migrar **solo si el generador está sano y regenerar es un comando**. Falló dos veces el 2026-08-21: el seed reproduciría el hueco de permisos, y al perderse la base local el README arranca en "cuando haya una instancia de Postgres disponible" — justo después del paso que faltaba |
| **301 `as never`/`as any` en 83 specs**, diferidos a propósito | El gate de tipos nuevo **NO los frena**: `as never` compila igual. Sin una regla de lint que los prohíba en specs, la deuda se reconstruye sola |
| ~~123 errores de tipos escondidos tras la exclusión `**/*.spec.ts`~~ | **RESUELTO** el 2026-08-21 (Fase 0, carril A). El gate quedó instalado y probado: un error de tipo en un spec ahora rompe `pnpm typecheck` |
| ~~Render de fechas del frontend~~ | **RESUELTO** el 2026-08-21 (Fase 0, carril B). Un solo módulo formatea fechas, con regla de lint que impide una séptima copia |
| **Rotación de `EMAIL_CRYPTO_KEY`**: no existe herramienta | Rotarla sin re-cifrar convierte TODA contraseña SMTP guardada en basura indescifrable. El payload lleva prefijo `v1:` justamente para permitir una migración de re-cifrado, pero esa migración no está escrita |
| Sin e2e dedicado para las 4 rutas de `/correo` | La cobertura del guard es estructural (a nivel clase). Es la superficie más sensible del módulo |
| `SmtpEmailSender.send()` loguea el `error.message` crudo de nodemailer | Algunos servidores SMTP devuelven el usuario dentro de la respuesta 535 |
| Postgres de producción con `TimeZone = America/Sao_Paulo` | Hoy coincide con Argentina solo porque Brasil abolió el horario de verano en 2019 |
| `rotate-jwt.ps1` e `install-cert-soporte.ps1` sin versionar, solo en el VPS | Si el VPS se pierde, esos scripts se pierden con él. Ya pasó con `rotate-admin-pw.ps1`, que además estaba roto |
| Corridas de tests **interrumpidas** dejan bases huérfanas en el Postgres local | No es un bug de los specs: cuando terminan, limpian bien. Hay que barrer cada tanto, cruzando siempre contra el registro de clientes antes de dropear |

## Nota

El multi-tenant ya está resuelto y funcionando con dos clientes. Eso es lo caro
de un SaaS y ya está hecho: sumar el cliente número diez no cuesta trabajo de
infraestructura.
