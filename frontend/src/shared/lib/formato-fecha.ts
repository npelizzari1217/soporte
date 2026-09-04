/**
 * Cómo el frontend renderiza las fechas que manda el backend. Separa el
 * comportamiento en dos clases —**instante** (un timestamp real; la
 * conversión de huso horario es correcta) y **fecha de calendario** (un día,
 * sin hora; la conversión de huso horario es un bug)— porque tratarlas igual
 * corre un día de calendario para cualquier usuario al oeste de UTC o, en
 * sentido contrario, esconde la hora de un vencimiento real.
 *
 * Refleja el mismo vocabulario de dos clases que el backend ya probó en
 * `shared/infrastructure/csv/csv.ts` (`fechaCsv` / `diaArgentinoCsv` /
 * `fechaHoraCsv`).
 *
 * **La paridad con el CSV vale para las fechas de calendario, no para los
 * instantes.** El CSV los escribe en hora argentina (`fechaHoraCsv`, decisión
 * del backend) y la pantalla los muestra en el reloj de quien mira: para
 * alguien fuera de Argentina, la misma celda dice horas distintas en los dos
 * lados. Es deliberado —el CSV es un documento del servidor, la pantalla es
 * de quien la tiene adelante— y está anotado acá para que nadie lo "arregle"
 * fijándole la zona a la pantalla otra vez.
 *
 * ## Instante vs. fecha de calendario — tabla de clasificación
 *
 * El oráculo es el schema de Prisma, no la memoria (`rg "@db\.Date|@db\.Timestamptz"
 * backend/prisma_tenant/schema.prisma backend/prisma_master/schema.prisma`).
 * Cada call site migrado también lleva un comentario de una línea nombrando
 * su campo del DTO y el tipo de columna, así una clasificación mal hecha se
 * ve en el diff, no solo en esta tabla.
 *
 * | Campo | Tipo de columna | Clase |
 * |---|---|---|
 * | `Ticket.slaVenceAt` / `createdAt` / `updatedAt` / `fechaCierre` | `@db.Timestamptz` | instante |
 * | `OperacionTicket.createdAt`, `OperacionCompra.createdAt` | `@db.Timestamptz` | instante |
 * | `ComponenteEquipo.createdAt` / `updatedAt` / `deletedAt` | `@db.Timestamptz` | instante |
 * | `ClienteCorreo.verificadoAt` | `@db.Timestamptz` | instante |
 * | `CicloTenant` / `CicloVigenteAdmin`.`fechaInicio` / `fechaFin` | `@db.Date` | fecha de calendario |
 * | `Equipo.fechaAdquisicion` / `fechaValoracion` / `fechaValorResidual` | `@db.Date` | fecha de calendario |
 * | `Compra.fechaSolicitud` | `@db.Date` | fecha de calendario |
 * | `ItemCompra.fechaCotizacion` / `fechaOrden` / `fechaRecepcion` / `fechaEntrega` | `@db.Date` | fecha de calendario |
 * | `PlanPreventivo.fechaInicio` / `proximaEjecucionEn` | `@db.Date` | fecha de calendario |
 * | `PreventivoGeneracion.fechaProgramada` | `@db.Date` | fecha de calendario |
 *
 * Cualquier otra columna `DateTime` que no esté en esta lista es
 * `@db.Timestamptz` (instante) — el conjunto de fechas de calendario es
 * chico y cerrado, así que lo que no está en esta tabla es instante por
 * defecto.
 */

/**
 * Zona IANA de Argentina. La usa SOLO `formatearInstanteComoDiaArgentino`,
 * que es el espejo del `diaArgentinoCsv` del backend: ahí el día argentino no
 * es una preferencia de presentación sino el dato que el CSV ya contiene.
 *
 * `formatearInstante` NO la usa: los instantes se leen en el reloj de quien
 * mira.
 */
const ZONA_ARGENTINA = "America/Argentina/Buenos_Aires";

/**
 * Offset fijo de Argentina (UTC-3), usado SOLO por `hoyFechaCalendario`.
 *
 * Es una asimetría DELIBERADA con la zona IANA que se usa en todo el resto
 * de este módulo, no un descuido: `hoyFechaCalendario` calcula "hoy" para
 * precargar `<input type="date">`, y el `hoyArgentina()` del backend
 * (`fecha-argentina.ts`) valida esos mismos prefills contra un offset FIJO,
 * no contra la zona IANA. Un usuario cuya zona de SO/navegador difiera de
 * `America/Argentina/Buenos_Aires` vería, si no fuera así, un prefill que el
 * backend rechaza con 422 — el "hoy" en pantalla no sería el mismo "hoy" que
 * valida el servidor. Las dos reglas dan el mismo resultado desde que
 * Argentina sacó el horario de verano en 2009; se mantienen separadas a
 * propósito, siguiendo el criterio de `features/compras/lib/fecha.ts`
 * (movido a este módulo), que documentaba el mismo incidente.
 */
const OFFSET_ARGENTINA_MS = -3 * 60 * 60 * 1000;

/**
 * Reporta un argumento de fecha mal clasificado (un instante alimentado a
 * una función de fecha de calendario, o al revés).
 *
 * Tira excepción bajo `NODE_ENV === "test"` para que una mala clasificación
 * falle fuerte en CI en vez de correr un día en silencio en producción. En
 * cualquier otro entorno solo hace `console.error` y devuelve, para que un
 * render de React nunca explote para un usuario por un error de
 * clasificación que igual se puede mostrar.
 *
 * Reemplaza el plan anterior de un fallback silencioso a `00:00`: un
 * `timestamptz` real casi nunca cae justo en medianoche UTC, así que esta
 * detección es confiable y los falsos positivos son despreciables.
 */
function reportarClasificacion(mensaje: string): void {
  if (process.env.NODE_ENV === "test") {
    throw new Error(mensaje);
  }
  console.error(mensaje);
}

/** Una cadena ISO sin componente horario ("2026-08-17") parece una fecha de calendario, no un instante. */
function careceDeComponenteHorario(valor: string): boolean {
  return !valor.includes("T") || valor.length === 10;
}

/** Un componente horario presente y que NO sea medianoche UTC exacta parece un instante real, no una fecha de calendario. */
function tieneComponenteHorarioNoMedianoche(valor: string): boolean {
  const coincidencia = /T(\d{2}):(\d{2}):(\d{2})/.exec(valor);
  if (!coincidencia) return false;
  const [, horas, minutos, segundos] = coincidencia;
  return horas !== "00" || minutos !== "00" || segundos !== "00";
}

/**
 * Lee las partes no literales de una fecha formateada en un mapa simple.
 *
 * `Intl.DateTimeFormat.format()` devuelve cadenas con la puntuación del
 * locale (por ejemplo `"17/08/2026, 14:30"` para `es-AR`, con una coma que el
 * literal de la especificación no tiene). Armar la cadena final a partir de
 * `formatToParts` en vez de post-procesar la salida de `format()` deja los
 * separadores exactos bajo el control de este módulo, sin depender de las
 * decisiones de puntuación del locale/ICU.
 */
function partesDeFecha(formateador: Intl.DateTimeFormat, fecha: Date): Record<string, string> {
  return Object.fromEntries(
    formateador.formatToParts(fecha).filter((parte) => parte.type !== "literal").map((parte) => [parte.type, parte.value]),
  );
}

/**
 * `Intl.DateTimeFormat` usado para renderizar un instante con hora/minuto.
 *
 * Se construye POR LLAMADA, nunca cacheado a scope de módulo. Cachearlo a
 * scope de módulo —la opción natural, y la forma que `formato-numero.ts` ya
 * usa para sus opciones— resolvería la zona en el momento del `import`,
 * antes de que cualquier test pueda mutar el entorno ambiente; una matriz de
 * tests de independencia de huso horario pasaría entonces idéntica con una
 * implementación correcta o rota. Esto es una restricción de diseño, no una
 * preferencia de estilo.
 */
function formateadorInstante(): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    // Sin `timeZone` A PROPÓSITO: un instante se lee en el reloj de quien
    // mira. El equipo trabaja repartido entre Argentina y España, y fijar la
    // zona acá le mostraba "13:00" a quien cerró el ticket a las 18:00.
    // El instante es uno solo — lo guarda el backend en UTC (`timestamptz`) y
    // cada navegador lo proyecta en su pared.
  });
}

/** `Intl.DateTimeFormat` usado para renderizar un instante como solo día. Construido por llamada — ver `formateadorInstante`. */
function formateadorDiaArgentino(): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: ZONA_ARGENTINA,
  });
}

/**
 * Renderiza un instante real (`@db.Timestamptz`) como `"17/08/2026 14:30"` —
 * hora y minuto **en el reloj del navegador de quien mira**, año de 4 dígitos
 * con cero a la izquierda, nunca `dateStyle`/`timeStyle`.
 *
 * Dos personas en husos distintos ven cadenas distintas para el mismo
 * instante, y está bien: es el mismo momento leído en dos relojes. Lo que no
 * puede pasar nunca es que una fecha de CALENDARIO se corra un día —
 * `formatearFechaCalendario` es la que protege eso, y no pasa por acá.
 *
 * @param iso Cadena de fecha/hora ISO que manda el backend.
 */
export function formatearInstante(iso: string): string {
  if (careceDeComponenteHorario(iso)) {
    reportarClasificacion(
      `formatearInstante: entrada sin componente horario ("${iso}") — parece una fecha de calendario, no un instante.`,
    );
  }
  const partes = partesDeFecha(formateadorInstante(), new Date(iso));
  return `${partes.day}/${partes.month}/${partes.year} ${partes.hour}:${partes.minute}`;
}

/**
 * Renderiza el DÍA DE CALENDARIO ARGENTINO de un instante real
 * (`@db.Timestamptz`) como `"17/08/2026"` — refleja el `diaArgentinoCsv` del
 * backend.
 *
 * Sale sin ningún caller hoy. Se mantiene igual: la ausencia del equivalente
 * frontend de `diaArgentinoCsv` ya le costó a este proyecto el incidente
 * `corregir-fecha-cierre-tickets` (truncar los componentes UTC de un
 * instante sin correr la zona antes adelanta el día para cualquier cosa que
 * pasó después de las 21:00 hora local), y `tickets/types.ts` prohíbe
 * explícitamente el `.slice(0, 10)` al que un desarrollador recurriría si
 * no, sobre `fechaCierre`.
 *
 * @param iso Cadena de fecha/hora ISO que manda el backend.
 */
export function formatearInstanteComoDiaArgentino(iso: string): string {
  if (careceDeComponenteHorario(iso)) {
    reportarClasificacion(
      `formatearInstanteComoDiaArgentino: entrada sin componente horario ("${iso}") — parece una fecha de calendario, no un instante.`,
    );
  }
  const partes = partesDeFecha(formateadorDiaArgentino(), new Date(iso));
  return `${partes.day}/${partes.month}/${partes.year}`;
}

/**
 * Renderiza una columna de calendario `@db.Date` como `"17/08/2026"`.
 *
 * NUNCA instancia un `Date`: parsear con `Date` más componentes de huso
 * horario local es exactamente la trampa que corre un día de calendario
 * para cualquier usuario al oeste de UTC (el valor viaja a medianoche UTC).
 * Esta función solo corta y reordena los propios dígitos de la cadena ISO —
 * el día que se imprime es siempre el día que mandó el backend, en
 * cualquier huso horario ambiente.
 *
 * @param fecha Valor de columna `@db.Date` (`"YYYY-MM-DD"` o el equivalente
 *   `"YYYY-MM-DDT00:00:00.000Z"` con el que Prisma lo serializa), o `null`/`undefined`.
 */
export function formatearFechaCalendario(fecha: string | null | undefined): string {
  if (!fecha) return "";
  if (tieneComponenteHorarioNoMedianoche(fecha)) {
    reportarClasificacion(
      `formatearFechaCalendario: entrada con componente horario distinto de medianoche UTC ("${fecha}") — parece un instante, no una fecha de calendario.`,
    );
  }
  const [anio, mes, dia] = fecha.slice(0, 10).split("-");
  return `${dia}/${mes}/${anio}`;
}

/**
 * Normaliza cualquier fecha del backend (instante o calendario) al formato
 * que acepta `<input type="date">` (`"YYYY-MM-DD"`).
 *
 * Corta la cadena, nunca la parsea: `new Date(iso)` más componentes locales
 * devuelve el día ANTERIOR para cualquier usuario al oeste de UTC (el valor
 * viaja a medianoche UTC). Los primeros 10 caracteres de la cadena ISO son
 * exactamente la fecha de calendario que quiso decir el backend. Idempotente:
 * una cadena que ya está en `"YYYY-MM-DD"` vuelve sin cambios.
 *
 * Sin guardia a propósito: esta es una utilidad de normalización de input,
 * no un formateador de pantalla, así que no corre el chequeo de
 * clasificación instante/fecha de calendario.
 *
 * @param fecha Cadena de fecha del backend, o `null`/`undefined`.
 */
export function aFechaInput(fecha: string | null | undefined): string {
  if (!fecha) return "";
  return fecha.slice(0, 10);
}

/**
 * Hoy, visto desde Argentina (offset fijo UTC-3 — MISMA regla que el
 * `hoyArgentina()` del backend), formateado `"YYYY-MM-DD"` para
 * `<input type="date">`.
 *
 * Corre el instante UTC actual por el offset fijo ANTES de leer
 * año/mes/día — nunca lee los componentes de huso horario local del
 * navegador. Ver la nota a nivel de módulo sobre `OFFSET_ARGENTINA_MS` para
 * el porqué de que esta función use un offset fijo en vez de la zona IANA
 * que usa el resto de las funciones de acá.
 */
export function hoyFechaCalendario(): string {
  const desplazada = new Date(Date.now() + OFFSET_ARGENTINA_MS);
  const anio = desplazada.getUTCFullYear();
  const mes = String(desplazada.getUTCMonth() + 1).padStart(2, "0");
  const dia = String(desplazada.getUTCDate()).padStart(2, "0");
  return `${anio}-${mes}-${dia}`;
}
