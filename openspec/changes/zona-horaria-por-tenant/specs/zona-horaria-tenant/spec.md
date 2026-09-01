# Zona Horaria Tenant Specification

## Purpose

Definir la zona horaria operativa como atributo del **tenant**: cómo se persiste sin
NULL observable, cómo se valida un candidato IANA, quién la configura, y cómo la
respetan por igual las tres capas — pantalla, exportación CSV y validación de dominio
de compras —, preservando como invariante que las columnas de calendario puro
(`@db.Date`) nunca reciben conversión de zona.

> ## ENMIENDA — dos capas de reloj
>
> **Motivo verificado.** Los dos tenants activos de producción son argentinos
> (`Cic Lanus`, `Santa Cruz`). España es dónde está el equipo, no un cliente: con zona
> solo-por-tenant, una persona en Madrid seguía leyendo hora argentina y el ciclo no le
> resolvía nada.
>
> **El modelo pasa a tener dos capas.** El **reloj de NEGOCIO** sigue siendo del
> **tenant** — gobierna SLA, vencimientos, validación de fechas del dominio, CSV y
> prefill de calendario — y es el único que este documento definía hasta acá. Se le
> agrega una capa de **VISTA**, del **usuario**, que es exclusivamente lectura de
> pantalla: en qué zona cada persona LEE lo que ve. La vista nunca gobierna nada que el
> servidor decida.
>
> **Invariante que no se negocia.** La validación de dominio se hace SIEMPRE en el
> reloj del tenant, nunca en el de la vista. Si validara contra la zona del que mira,
> dos usuarios obtendrían veredictos distintos sobre el mismo dato.
>
> Los requisitos con `[MODIFICADO — enmienda]` en el título cambian de significado
> respecto de la versión anterior de este archivo. Los marcados `[NUEVO — enmienda]`
> son requisitos que no existían. El resto queda **sin tocar**.

## Requirements

### Requirement: Persistencia sin NULL observable

La columna `zonaHoraria` en `master.clientes` DEBE ser `NOT NULL`, con backfill en la
misma migración que la agrega. Ningún tenant, ni antes ni después de la migración,
DEBE exponer un valor NULL para este campo.

#### Scenario: Backfill en el mismo commit de migración

- GIVEN un tenant existente antes de la migración
- WHEN la migración corre
- THEN la columna `zonaHoraria` queda `NOT NULL` y ese tenant tiene un valor IANA
  válido, sin ningún paso manual posterior

#### Scenario: Alta de un tenant nuevo

- GIVEN el alta de un cliente nuevo
- WHEN se crea el registro
- THEN `zonaHoraria` queda con un valor IANA válido desde la primera fila

### Requirement: Validación de zona IANA por construcción de formateador

El sistema DEBE validar un candidato de zona horaria intentando construir un
`Intl.DateTimeFormat` con ese valor (try/catch), y NUNCA DEBE validar por
pertenencia a `Intl.supportedValuesOf('timeZone')`. La validación de dominio del
backend y el schema Zod espejo del frontend DEBEN aplicar exactamente la misma
regla, para el mismo candidato.

#### Scenario: Alias no listado mora válido igual

- GIVEN el candidato `America/Argentina/Buenos_Aires` — ausente de
  `Intl.supportedValuesOf('timeZone')` en Node 24, pero que sí construye un
  formateador válido
- WHEN se valida como zona del tenant
- THEN se acepta

#### Scenario: Zona inventada se rechaza

- GIVEN el candidato `America/Nunca_Existio`
- WHEN se valida
- THEN se rechaza, porque construir `Intl.DateTimeFormat` con ese valor lanza

#### Scenario: Backend y frontend no pueden divergir sobre el mismo candidato

- GIVEN un lote de candidatos ambiguos (`America/Argentina/Buenos_Aires`,
  `Asia/Calcutta`, una zona inventada)
- WHEN cada candidato se valida con la regla del backend y, por separado, con el
  schema Zod del frontend
- THEN el veredicto aceptar/rechazar es idéntico en las dos capas para cada
  candidato

### Requirement: Configuración de la zona operativa

Solo un actor con administración global de la plataforma (`is_global_admin = true`,
mismo criterio que `csatHabilitado`) DEBE poder configurar la zona operativa de un
tenant, como acción separada de la edición comercial del cliente. Un candidato
inválido DEBE rechazarse en el borde (422) y NUNCA DEBE llegar a la entidad de
dominio.

#### Scenario: Admin global configura una zona válida

- GIVEN un actor con `is_global_admin = true` y un tenant en
  `America/Argentina/Buenos_Aires`
- WHEN configura `Europe/Madrid` como nueva zona operativa
- THEN el tenant queda persistido en `Europe/Madrid`

#### Scenario: Actor sin administración global

- GIVEN un usuario autenticado sin `is_global_admin`
- WHEN intenta configurar la zona operativa de un tenant
- THEN la operación se rechaza por autorización, sin llegar al caso de uso

#### Scenario: Candidato inválido nunca llega a la entidad

- GIVEN el candidato `Europe/Madriz` (typo)
- WHEN se envía como nueva zona operativa
- THEN el borde devuelve 422 y el tenant conserva su zona anterior

### Requirement: Visualización en pantalla en la zona de vista, con default de tenant y zona visible `[MODIFICADO — enmienda]`

> **Enmienda.** Antes, la pantalla renderizaba siempre en la zona del tenant. Ahora
> renderiza en la zona de **vista** efectiva del usuario, que — sin preferencia
> guardada — DEBE ser la del tenant (ver "Default de la vista", más abajo). El
> requisito de visibilidad se mantiene y se refuerza: la interfaz DEBE mostrar la zona
> de vista y, cuando difiera de la del tenant, también la del tenant.

El sistema DEBE renderizar todo instante (columna `@db.Timestamptz`) en pantalla
usando la zona de vista efectiva del usuario, y DEBE hacer visible esa zona — y la
del tenant cuando difiera — al usuario en la interfaz, mediante un indicador global.
Ninguna pantalla DEBE resolver la zona de vista de forma implícita a partir del
navegador como valor por defecto, ni usar una constante fija.

#### Scenario: Mismo instante, hora local distinta por tenant (sin preferencia de vista propia)

- GIVEN el mismo `Ticket.fechaCierre` (instante UTC), leído por un usuario del
  tenant `America/Argentina/Buenos_Aires` sin preferencia de vista guardada, y por
  un usuario de otro tenant en `Europe/Madrid`, también sin preferencia propia
- WHEN cada uno lo ve en pantalla
- THEN cada uno lee la hora de reloj de la zona de SU tenant — porque es su vista
  por defecto — y la zona usada es visible en la interfaz

#### Scenario: Cruce de DST en Europe/Madrid

- GIVEN un `slaVenceAt` fijado justo antes del cambio de horario de octubre en
  `Europe/Madrid`
- WHEN se formatea en pantalla antes y después del cruce
- THEN la hora mostrada refleja el offset correcto de cada lado (UTC+2 antes,
  UTC+1 después), sin usar un offset fijo

### Requirement: Persistencia local de la preferencia de vista `[NUEVO — enmienda]`

La preferencia de zona de vista del usuario DEBE persistirse únicamente en
`localStorage` del navegador. NUNCA DEBE persistirse en el backend (ni en `Usuario`
ni en ninguna otra tabla), NI viajar en el JWT ni en ningún payload de respuesta del
servidor. Un valor leído de `localStorage` DEBE validarse con la misma regla de zona
IANA que el resto del sistema antes de usarse; ante ausencia, valor inválido, o
`localStorage` no disponible, el sistema DEBE degradar de forma silenciosa a "sin
preferencia guardada", sin lanzar ni propagar una excepción.

#### Scenario: La preferencia sobrevive logout/login

- GIVEN una preferencia de vista guardada en `localStorage`
- WHEN el usuario cierra sesión, su sesión expira, o se ve forzado a refrescar el
  token (incluido el 401 global por el bump de versión del payload del JWT), y
  vuelve a loguearse
- THEN la preferencia de vista sigue siendo la guardada, sin que el backend la haya
  transportado en ningún momento

#### Scenario: Valor corrupto en localStorage se descarta sin romper el render

- GIVEN un valor manipulado en `localStorage` bajo la clave de zona de vista, que no
  es una zona IANA válida
- WHEN el sistema resuelve la zona de vista efectiva
- THEN el valor se descarta y el sistema se comporta como si no hubiera preferencia
  guardada, sin lanzar un error de tipo `RangeError` durante el render

#### Scenario: El backend nunca recibe la preferencia de vista

- GIVEN un usuario con una preferencia de vista distinta a la zona de su tenant
- WHEN se inspecciona cualquier request al backend — el JWT, los DTOs enviados, las
  respuestas recibidas
- THEN ningún payload contiene la zona de vista del usuario

### Requirement: Default de la vista: la zona del tenant; el navegador es sugerencia descartable `[NUEVO — enmienda]`

Sin preferencia guardada en `localStorage`, la zona de vista DEBE tomar como valor
por defecto la zona OPERATIVA DEL TENANT, y NUNCA DEBE resolverse implícitamente a
partir de la zona del navegador. Si la zona del navegador difiere de la del tenant y
es una zona válida, el sistema DEBE ofrecerla como sugerencia descartable, y solo un
clic explícito del usuario DEBE persistirla como preferencia de vista.

#### Scenario: Sin preferencia guardada, la vista es la del tenant, no la del navegador

- GIVEN un usuario sin preferencia de vista guardada, con el navegador configurado
  en una zona distinta a la de su tenant
- WHEN el sistema resuelve la zona de vista efectiva
- THEN usa la zona del tenant, no la zona del navegador

#### Scenario: La sugerencia del navegador no se aplica sola

- GIVEN el escenario anterior (navegador en zona distinta a la del tenant, sin
  preferencia guardada)
- WHEN se renderiza la interfaz
- THEN el sistema muestra una sugerencia descartable para cambiar a la zona del
  navegador, pero la vista efectiva sigue siendo la del tenant hasta que el usuario
  la acepta explícitamente

#### Scenario: Aceptar la sugerencia persiste la preferencia

- GIVEN la sugerencia descartable visible
- WHEN el usuario hace clic explícito para aceptarla
- THEN la zona del navegador se guarda como preferencia de vista en `localStorage`
  y pasa a regir la vista efectiva

### Requirement: Doble lectura en pantalla, solo cuando vista y tenant difieren `[NUEVO — enmienda]`

Cuando la zona de vista efectiva coincide con la zona del tenant, la pantalla DEBE
mostrar una sola lectura, byte a byte idéntica a la que mostraría si la capa de
vista no existiera — sin sufijo ni etiqueta de zona. Cuando difieren, la pantalla
DEBE mostrar las dos lecturas para todo instante (`@db.Timestamptz`): la de la vista
como lectura primaria sin etiquetar, y la del tenant como lectura secundaria
etiquetada con su zona.

#### Scenario: Zonas iguales — salida idéntica a la de hoy

- GIVEN un tenant y una vista efectiva en la misma zona (el caso de los dos
  tenants de producción)
- WHEN se formatea un instante en pantalla
- THEN el texto es byte a byte igual al que se mostraba sin la capa de vista, sin
  ningún sufijo ni etiqueta

#### Scenario: Zonas distintas — doble lectura con el tenant etiquetado

- GIVEN un tenant en `America/Argentina/Buenos_Aires` y una vista efectiva en
  `Europe/Madrid`
- WHEN se formatea el mismo instante en pantalla
- THEN se muestran las dos horas de reloj, y la que corresponde al tenant lleva la
  etiqueta de su zona; la de la vista no lleva etiqueta

### Requirement: Exportación CSV en la zona del tenant, paridad byte a byte con pantalla en vista de tenant `[MODIFICADO — enmienda]`

> **Enmienda.** El CSV lo genera el backend, que no conoce la preferencia de vista, y
> sigue saliendo siempre en la zona del tenant. Por eso el invariante deja de ser
> universal ("pantalla = CSV byte a byte") y pasa a enunciarse condicionado:
> **pantalla EN VISTA DE TENANT = CSV, byte a byte.**

El sistema DEBE formatear toda columna de instante en un CSV exportado con la zona
del TENANT — nunca con la zona de vista del usuario que exporta. El texto resultante
DEBE coincidir byte a byte con lo que la pantalla muestra para ese mismo campo y ese
mismo tenant CUANDO la vista efectiva del usuario está en la zona del tenant. Cuando
la vista efectiva del usuario difiere de la del tenant, el sistema DEBE advertir,
antes de iniciar la exportación, que el archivo sale en la zona del tenant y no en
la de su vista. Las columnas `@db.Date` del CSV DEBEN permanecer sin conversión.

#### Scenario: Paridad byte a byte pantalla-CSV, con la vista en la zona del tenant

- GIVEN un tenant en `Europe/Madrid`, un usuario cuya vista efectiva coincide con
  la de su tenant (sin preferencia distinta guardada), y un `Ticket.fechaCierre`
  mostrado en pantalla como texto formateado
- WHEN se exporta el mismo campo del mismo ticket a CSV
- THEN el texto de la celda CSV es idéntico, byte a byte, al texto mostrado en
  pantalla

#### Scenario: Columna de calendario en el CSV no se desplaza

- GIVEN un tenant en `Europe/Madrid` y `Compra.fechaSolicitud` (`@db.Date`)
- WHEN se exporta a CSV
- THEN el día exportado es el mismo día almacenado, sin aplicar ninguna zona

#### Scenario: El CSV no cambia con la vista del usuario que exporta

- GIVEN un mismo ticket y un mismo tenant, exportado por dos usuarios con vistas
  efectivas distintas (`Europe/Madrid` y `America/Argentina/Buenos_Aires`)
- WHEN cada uno exporta el mismo campo a CSV
- THEN el contenido de la celda es idéntico para los dos, byte a byte

#### Scenario: Aviso antes de exportar si la vista difiere del tenant

- GIVEN un usuario con vista efectiva en `Europe/Madrid` y un tenant en
  `America/Argentina/Buenos_Aires`
- WHEN inicia la exportación a CSV
- THEN el sistema le advierte, antes de la descarga, que el archivo saldrá en la
  zona del tenant y no en la de su vista

### Requirement: Validación de dominio de fechas de etapa en compras según zona del tenant

El "hoy" que usa la validación de fechas de etapa en compras (`hoyArgentina` y el
rechazo de fecha futura) DEBE calcularse con la zona horaria operativa del tenant,
no con un offset fijo de Argentina.

#### Scenario: Usuario en Madrid a las 00:30 del día D

- GIVEN un tenant configurado en `Europe/Madrid`, hora local 00:30 del día D (que
  en UTC/Argentina todavía es D−1)
- WHEN un usuario carga una fecha de etapa de compra con valor D
- THEN la fecha NO se rechaza como futura

#### Scenario: Usuario en Buenos Aires conserva el comportamiento actual

- GIVEN un tenant configurado en `America/Argentina/Buenos_Aires`
- WHEN un usuario carga una fecha de etapa posterior al "hoy" de esa zona
- THEN la fecha se rechaza como futura, igual que antes del cambio

### Requirement: El prefill de fecha de calendario usa el día del tenant, nunca el de la vista `[NUEVO — enmienda]`

Todo prefill de un campo de fecha de calendario que dependa de "hoy" (los
`<input type="date">` de compras y equipos, y cualquier otro con el mismo patrón)
DEBE calcularse con el día calendario del TENANT. NUNCA DEBE existir, para este uso,
una función de "hoy" basada en la zona de vista del usuario.

#### Scenario: Prefill en Madrid muestra el día del tenant, no el de la vista

- GIVEN un tenant en `America/Argentina/Buenos_Aires` y un usuario con vista
  efectiva en `Europe/Madrid`, hora local de vista 00:30 del día D (en el tenant
  todavía es D−1)
- WHEN se abre un formulario que precarga la fecha de "hoy"
- THEN el campo se precarga con el día D−1 — el "hoy" del tenant — y no con D, que
  es el "hoy" de la vista de Madrid

#### Scenario: Tenant y vista coinciden — sin cambio de comportamiento

- GIVEN un tenant y una vista efectiva ambos en `America/Argentina/Buenos_Aires`
- WHEN se abre el mismo formulario
- THEN el prefill es el mismo que antes de la enmienda, sin ningún cambio
  observable

### Requirement: Invariante — la validación de dominio SIEMPRE usa el reloj del tenant, nunca el de la vista `[NUEVO — enmienda]`

Toda validación de dominio que dependa de "hoy" — incluida la validación de fecha
futura en compras — DEBE calcularse exclusivamente con el reloj del TENANT. El
dominio NUNCA DEBE recibir, consultar ni verse afectado, directa ni
indirectamente, por la zona de vista de la persona que hace la petición. Cuando el
servidor rechaza una fecha por ser posterior a "hoy", el mensaje de error DEBE
nombrar tanto el día contra el que se validó como el reloj (el del tenant) al que
corresponde.

#### Scenario: Mismo dato, distinta vista, mismo veredicto

- GIVEN dos usuarios del mismo tenant — uno con vista efectiva en
  `America/Argentina/Buenos_Aires` y otro con vista efectiva en `Europe/Madrid` —
  validando la misma fecha de etapa de una misma compra
- WHEN cada uno intenta guardarla
- THEN los dos obtienen exactamente el mismo veredicto (los dos la aceptan o los
  dos la rechazan), porque la validación ignora la vista de quien la ejecuta

#### Scenario: Rechazo comprensible — usuario en Madrid a las 00:30 con tenant argentino

- GIVEN un tenant configurado en `America/Argentina/Buenos_Aires` y un usuario con
  vista efectiva en `Europe/Madrid`, hora local de vista 00:30 del día D (en el
  tenant todavía es D−1)
- WHEN el usuario carga una fecha de etapa de compra con valor D y la envía
- THEN el servidor la rechaza como futura — comportamiento correcto, porque el
  negocio es argentino — Y el mensaje de error nombra el día D−1 y aclara que
  corresponde al reloj del tenant, no al de la vista de quien la cargó

### Requirement: Las columnas `@db.Date` nunca reciben conversión de zona `[MODIFICADO — se agrega un escenario]`

Ninguna capa (pantalla, CSV, validación de dominio) DEBE aplicar offset ni
conversión de zona horaria a una columna `@db.Date`, sin importar la zona
operativa del tenant.

#### Scenario: Un feriado en medianoche UTC no corre de día

- GIVEN `Feriado.fecha` almacenado como medianoche UTC del día D, y un tenant en
  `Europe/Madrid`
- WHEN el sistema lee y muestra esa fecha en cualquier capa
- THEN el día mostrado sigue siendo D — nunca D−1 ni D+1 por aplicarle la zona del
  tenant

#### Scenario: Reintroducir la conversión sobre una `@db.Date` hace fallar la cobertura

- GIVEN una implementación que aplicara la zona del tenant a una columna
  `@db.Date`
- WHEN corre la cobertura de este requisito
- THEN el test falla, porque detecta que el día observable cambió

#### Scenario: La doble lectura nunca alcanza a una columna `@db.Date` `[NUEVO — enmienda]`

- GIVEN una columna `@db.Date` (por ejemplo `Compra.fechaSolicitud`) y un usuario
  cuya vista efectiva difiere de la del tenant
- WHEN el sistema la muestra en cualquier capa
- THEN se muestra una sola fecha, sin doble lectura ni sufijo de zona — la doble
  lectura solo existe para columnas de instante (`@db.Timestamptz`)

### Requirement: Rutas sin tenant resuelto no formatean con zona de tenant

En `/login` y en cualquier ruta pública sin tenant resuelto, el sistema NUNCA DEBE
resolver una zona horaria de forma implícita (navegador o ambiente). Si una de esas
pantallas necesitara mostrar un instante, DEBE hacerlo en UTC explícito.

#### Scenario: Pantalla de login sin tenant

- GIVEN un usuario no autenticado en `/login`
- WHEN la pantalla necesitara mostrar algún instante
- THEN lo muestra en UTC explícito, nunca en la zona implícita del navegador ni en
  la de un tenant sin resolver
