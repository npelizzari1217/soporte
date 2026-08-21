# Roadmap comercial — seis funciones para vender el producto

Análisis del 2026-08-19. Compara el sistema contra Zendesk, Freshservice, GLPI y
Jira Service Management, y prioriza qué falta para competir.

**Estado: aprobado, sin empezar.** Se arranca por el punto 1 y la gestión del
punto 6 en paralelo.

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
| 2 | Reparación ↔ Compra | Media | 3-5 días | pendiente |
| 3 | Encuesta de satisfacción | Media | 4-6 días | pendiente |
| 4 | Mantenimiento preventivo recurrente | Media | 5-8 días | pendiente |
| 5 | Horario laboral en el SLA | Media-alta | 6-10 días | pendiente |
| 6 | Ticket por email entrante | Alta | 2-3 semanas | **DIFERIDO** por decisión del 2026-08-20 |

Estimado restante: **~18-29 días** de trabajo concentrado sobre los puntos 2 a 5
(el 40 original incluía el 1, ya entregado, y el 6, diferido).

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

**Antes del punto 2, dos cosas cortas:**

- **Permisos en la matriz** (minutos, no es código): nadie tiene la acción
  `TICKETS:ASIGNAR`, así que el combo de asignación aparece vacío aunque haya
  técnicos y colaboradores elegibles. El ADMINISTRADOR de Cic Lanus además no
  tiene ningún permiso de módulo.
- **Cambio de contraseña** (ver la sección siguiente): es un agujero de producto,
  no una comodidad.

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
| **123 errores de tipos** escondidos tras la exclusión `**/*.spec.ts` de `backend/tsconfig.json` | `pnpm typecheck` NO mira los tests. El mecanismo que los deja entrar sigue vivo y ya mordió dos veces: builders de controller con dependencias faltantes, y specs que no compilarían |
| **Render de fechas del frontend**: 3 sitios muestran ISO crudo y hay **cero ocurrencias de `timeZone`** en todo `frontend/src` | Los 4 sitios que formatean con `Intl.DateTimeFormat("es-AR")` dependen de que el navegador esté en huso argentino. Además hay 4 copias del mismo `formatFecha` |
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
