# Zona Horaria Tenant Specification

## Purpose

Definir la zona horaria operativa como atributo del **tenant**: cómo se persiste sin
NULL observable, cómo se valida un candidato IANA, quién la configura, y cómo la
respetan por igual las tres capas — pantalla, exportación CSV y validación de dominio
de compras —, preservando como invariante que las columnas de calendario puro
(`@db.Date`) nunca reciben conversión de zona.

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

### Requirement: Visualización en pantalla en la zona del tenant, con la zona visible

El sistema DEBE renderizar todo instante (columna `@db.Timestamptz`) en pantalla
usando la zona horaria del tenant resuelto, y DEBE hacer visible esa zona al
usuario en la interfaz. Ninguna pantalla DEBE formatear un instante con la zona
implícita del navegador ni con una constante fija.

#### Scenario: Mismo instante, hora local distinta por tenant

- GIVEN el mismo `Ticket.fechaCierre` (instante UTC), leído por un tenant en
  `America/Argentina/Buenos_Aires` y por otro en `Europe/Madrid`
- WHEN cada uno lo ve en pantalla
- THEN cada uno lee su propia hora de reloj local para ese mismo instante, y la
  zona usada es visible en la interfaz

#### Scenario: Cruce de DST en Europe/Madrid

- GIVEN un `slaVenceAt` fijado justo antes del cambio de horario de octubre en
  `Europe/Madrid`
- WHEN se formatea en pantalla antes y después del cruce
- THEN la hora mostrada refleja el offset correcto de cada lado (UTC+2 antes,
  UTC+1 después), sin usar un offset fijo

### Requirement: Exportación CSV en la zona del tenant, paridad byte a byte con pantalla

El sistema DEBE formatear toda columna de instante en un CSV exportado con la
misma zona del tenant usada en pantalla, y el texto resultante DEBE coincidir
byte a byte con lo que la pantalla muestra para ese mismo campo y ese mismo
tenant. Las columnas `@db.Date` del CSV DEBEN permanecer sin conversión.

#### Scenario: Paridad byte a byte pantalla-CSV

- GIVEN un tenant en `Europe/Madrid` y un `Ticket.fechaCierre` mostrado en pantalla
  como texto formateado
- WHEN se exporta el mismo campo del mismo ticket a CSV
- THEN el texto de la celda CSV es idéntico, byte a byte, al texto mostrado en
  pantalla

#### Scenario: Columna de calendario en el CSV no se desplaza

- GIVEN un tenant en `Europe/Madrid` y `Compra.fechaSolicitud` (`@db.Date`)
- WHEN se exporta a CSV
- THEN el día exportado es el mismo día almacenado, sin aplicar ninguna zona

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

### Requirement: Las columnas `@db.Date` nunca reciben conversión de zona

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

### Requirement: Rutas sin tenant resuelto no formatean con zona de tenant

En `/login` y en cualquier ruta pública sin tenant resuelto, el sistema NUNCA DEBE
resolver una zona horaria de forma implícita (navegador o ambiente). Si una de esas
pantallas necesitara mostrar un instante, DEBE hacerlo en UTC explícito.

#### Scenario: Pantalla de login sin tenant

- GIVEN un usuario no autenticado en `/login`
- WHEN la pantalla necesitara mostrar algún instante
- THEN lo muestra en UTC explícito, nunca en la zona implícita del navegador ni en
  la de un tenant sin resolver
