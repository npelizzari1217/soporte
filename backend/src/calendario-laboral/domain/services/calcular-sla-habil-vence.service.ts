/**
 * CalcularSlaHabilVenceService — cálculo puro de dominio del vencimiento de
 * SLA sobre HORAS HÁBILES (sdd/sla-habil, WU-1), en contraste con
 * `CalcularSlaVenceService` (reloj 24/7, S2/S3).
 *
 * Sin dependencias de infraestructura ni framework — dominio puro. El
 * calendario y los feriados llegan como parámetros: este servicio no conoce
 * puertos, repositorios ni Prisma (el cableado es WU-3/WU-4).
 *
 * ─── Representación de dominio (deliberadamente propia, no la de Prisma) ──
 *
 * `VentanaLaboral` espeja el modelo `CalendarioLaboralDiaCliente`
 * (`prisma_tenant/schema.prisma:1315-1323`, sdd/horario-laboral-por-cliente):
 * `aperturaMinuto`/`cierreMinuto` en
 * minutos desde medianoche HORA LOCAL ARGENTINA, o ambos `null` = día
 * cerrado. `CalendarioLaboralSemanal` es una tupla de exactamente 7
 * ventanas, indexada 0 (domingo) a 6 (sábado) — la misma convención que
 * `diaSemana` en el modelo de Prisma — para que un calendario incompleto o
 * con un día de más sea un error de TIPOS, no un bug en runtime.
 *
 * Los feriados se representan como `ReadonlySet<string>` de claves de día
 * calendario LOCAL `'YYYY-MM-DD'` (no `Date`). Motivo: la columna
 * `Feriado.fecha` es `@db.Date` y Prisma la devuelve como medianoche UTC del
 * día calendario (ver `prisma_master/schema.prisma:495-509`) — un `Date`
 * real, pero que NO representa un instante real: representa un día. Pasarlo
 * por este servicio como `Date` obligaría a decidir, en el peor lugar
 * posible, si hay que desplazarlo a Argentina (no hay que hacerlo: ya está
 * en el día correcto) o no. Una clave de string ya resuelta por el mapper de
 * infraestructura (WU-4) elimina esa ambigüedad en la frontera del dominio.
 *
 * ─── Zona horaria ──────────────────────────────────────────────────────────
 *
 * `creadoEn` y el `Date` devuelto son INSTANTES UTC reales
 * (`@db.Timestamptz`). Los minutos del calendario son hora local argentina
 * (UTC-3 fijo, sin horario de verano — `shared/domain/zona-horaria-argentina.ts`).
 * Este servicio usa `desplazarAArgentina` únicamente para LEER componentes
 * locales (día de semana, minuto del día) de un instante real — el uso que
 * su propio docstring permite — y nunca lo aplica a la clave de feriado, que
 * ya llega resuelta como string.
 *
 * Ref: sdd/sla-habil (WU-1). Reglas de negocio 1-4 del work unit.
 */
import {
  desplazarAArgentina,
  OFFSET_ARGENTINA_MS,
} from '../../../shared/domain/zona-horaria-argentina';

/**
 * Ventana horaria de un día del calendario laboral, en minutos desde
 * medianoche hora local argentina. Ambos `null` = día cerrado. La ventana es
 * `[aperturaMinuto, cierreMinuto)` — cierre exclusivo, igual que el CHECK
 * `calendario_laboral_dias_cliente_ventana_check` de la base.
 */
export interface VentanaLaboral {
  readonly aperturaMinuto: number | null;
  readonly cierreMinuto: number | null;
}

/**
 * Calendario laboral semanal completo: 7 ventanas, índice = día de semana
 * (0 = domingo … 6 = sábado), igual a `CalendarioLaboralDiaCliente.diaSemana`.
 */
export type CalendarioLaboralSemanal = readonly [
  VentanaLaboral, // 0 — domingo
  VentanaLaboral, // 1 — lunes
  VentanaLaboral, // 2 — martes
  VentanaLaboral, // 3 — miércoles
  VentanaLaboral, // 4 — jueves
  VentanaLaboral, // 5 — viernes
  VentanaLaboral, // 6 — sábado
];

/**
 * Conjunto de feriados: claves de día calendario LOCAL `'YYYY-MM-DD'`. Un
 * feriado cierra el día completo sin importar la ventana del calendario
 * (regla de negocio 3 del WU).
 */
export type FeriadosLaborales = ReadonlySet<string>;

/**
 * Cota de la búsqueda de una ventana hábil abierta, en días. Evita un `while`
 * sin fin cuando el calendario no tiene ningún día abierto, o cuando la
 * cantidad de feriados consecutivos excede cualquier escenario real. También
 * acota la cantidad de ventanas que una sola llamada puede cruzar al
 * consumir `horas` — 400 ventanas hábiles alcanzan y sobran para cualquier
 * SLA configurable en este sistema.
 */
const LIMITE_DIAS_BUSQUEDA = 400;

/**
 * Cota del rango que `msHabilesEntre` acepta recorrer, en días (~10 años).
 * Un rango mayor lanza: ningún reloj SLA ni métrica real lo necesita, y la cota
 * evita recorrer sin fin un calendario sin ventanas.
 */
const LIMITE_DIAS_RANGO = 3_700;

/** Milisegundos por día calendario (Argentina no tiene horario de verano). */
const MS_POR_DIA = 86_400_000;

/** Milisegundos por minuto — evita el número mágico repetido en los cálculos. */
const MS_POR_MINUTO = 60_000;

interface DiaLocal {
  readonly anio: number;
  readonly mes: number;
  readonly dia: number;
}

export class CalcularSlaHabilVenceService {
  /**
   * Calcula la fecha de vencimiento de SLA a partir del instante de creación
   * del ticket y las horas hábiles configuradas, sobre el calendario laboral
   * y los feriados dados.
   *
   * @param creadoEn  Instante UTC de creación del ticket (ancla fija).
   * @param horas     Horas hábiles configuradas para la prioridad. Debe ser
   *                  un número finito > 0 — mismo criterio que
   *                  `CalcularSlaVenceService`.
   * @param calendario Calendario laboral semanal (7 ventanas, domingo a sábado).
   * @param feriados  Feriados vigentes, como claves de día local `'YYYY-MM-DD'`.
   * @throws Error si `horas` no es un número finito positivo.
   * @throws Error si la búsqueda de una ventana hábil abierta excede
   *               {@link LIMITE_DIAS_BUSQUEDA} días (calendario sin ningún
   *               día abierto, o feriados consecutivos fuera de cualquier
   *               escenario real).
   */
  venceAt(
    creadoEn: Date,
    horas: number,
    calendario: CalendarioLaboralSemanal,
    feriados: FeriadosLaborales,
  ): Date {
    if (!Number.isFinite(horas) || horas <= 0) {
      throw new Error(`CalcularSlaHabilVenceService: horas debe ser > 0, se recibió: ${horas}.`);
    }

    return this.sumarMsHabiles(creadoEn, horas * 3_600_000, calendario, feriados);
  }

  /**
   * Suma `ms` milisegundos HÁBILES a `desde`: avanza por las ventanas
   * `[apertura, cierre)` abiertas, saltando días cerrados y feriados. Con
   * `ms = 0` devuelve `desde` sin alinearlo a una ventana.
   *
   * @throws Error si `ms` no es un número finito >= 0.
   * @throws Error si la búsqueda excede {@link LIMITE_DIAS_BUSQUEDA}.
   */
  sumarMsHabiles(
    desde: Date,
    ms: number,
    calendario: CalendarioLaboralSemanal,
    feriados: FeriadosLaborales,
  ): Date {
    if (!Number.isFinite(ms) || ms < 0) {
      throw new Error(`CalcularSlaHabilVenceService: ms debe ser >= 0, se recibió: ${ms}.`);
    }
    if (ms === 0) {
      return desde;
    }

    let restanteMs = ms;
    let cursor = this.buscarInicioVentanaAbierta(desde, calendario, feriados);

    for (let cruces = 0; cruces <= LIMITE_DIAS_BUSQUEDA; cruces++) {
      const finVentana = this.finDeVentanaActual(cursor, calendario);
      const disponibleMs = finVentana.getTime() - cursor.getTime();

      if (restanteMs <= disponibleMs) {
        return new Date(cursor.getTime() + restanteMs);
      }

      restanteMs -= disponibleMs;
      cursor = this.buscarInicioVentanaAbierta(finVentana, calendario, feriados);
    }

    throw new Error(
      `CalcularSlaHabilVenceService: se excedieron ${LIMITE_DIAS_BUSQUEDA} ventanas hábiles ` +
        'consumiendo el SLA — revisar la configuración de horas o del calendario.',
    );
  }

  /**
   * Milisegundos HÁBILES transcurridos en `[desde, hasta)`. Suma
   * `min(cierre, hasta) - cursor` por cada ventana abierta que el rango toca.
   * Un rango sin ninguna ventana abierta suma 0 sin lanzar; `hasta <= desde`
   * devuelve 0.
   *
   * @throws Error si el rango excede {@link LIMITE_DIAS_RANGO} días.
   */
  msHabilesEntre(
    desde: Date,
    hasta: Date,
    calendario: CalendarioLaboralSemanal,
    feriados: FeriadosLaborales,
  ): number {
    if (hasta.getTime() <= desde.getTime()) {
      return 0;
    }
    if (hasta.getTime() - desde.getTime() > LIMITE_DIAS_RANGO * MS_POR_DIA) {
      throw new Error(
        `CalcularSlaHabilVenceService: el rango excede ${LIMITE_DIAS_RANGO} días ` +
          `(${desde.toISOString()} a ${hasta.toISOString()}).`,
      );
    }

    let totalMs = 0;
    let cursor = desde;
    for (let cruces = 0; cruces <= LIMITE_DIAS_RANGO; cruces++) {
      const inicio = this.buscarInicioVentanaAbierta(cursor, calendario, feriados, hasta);
      if (inicio === null || inicio.getTime() >= hasta.getTime()) {
        return totalMs;
      }
      const finVentana = this.finDeVentanaActual(inicio, calendario);
      totalMs += Math.min(finVentana.getTime(), hasta.getTime()) - inicio.getTime();
      cursor = finVentana;
    }

    throw new Error(
      `CalcularSlaHabilVenceService: se excedieron ${LIMITE_DIAS_RANGO} ventanas midiendo el rango.`,
    );
  }

  /**
   * Busca, a partir de `desde`, el instante en que arranca (o ya está
   * corriendo, si `desde` cae dentro de una ventana abierta) el cómputo de
   * horas hábiles.
   *
   * Con `tope`, la búsqueda se acota a ese instante y devuelve `null` si no
   * hay ninguna ventana abierta que arranque antes: el tramo no suma tiempo
   * en lugar de lanzar. Sin `tope`, lanza al agotar {@link LIMITE_DIAS_BUSQUEDA}.
   */
  private buscarInicioVentanaAbierta(
    desde: Date,
    calendario: CalendarioLaboralSemanal,
    feriados: FeriadosLaborales,
  ): Date;
  private buscarInicioVentanaAbierta(
    desde: Date,
    calendario: CalendarioLaboralSemanal,
    feriados: FeriadosLaborales,
    tope: Date,
  ): Date | null;
  private buscarInicioVentanaAbierta(
    desde: Date,
    calendario: CalendarioLaboralSemanal,
    feriados: FeriadosLaborales,
    tope?: Date,
  ): Date | null {
    const base = this.diaLocalDe(desde);
    const msDelDia = this.msDelDiaLocal(desde);

    for (let offset = 0; offset <= LIMITE_DIAS_BUSQUEDA; offset++) {
      const candidato = this.sumarDias(base, offset);
      const diaSemana = this.diaSemanaDe(candidato);
      const claveDia = this.claveDiaDe(candidato);
      if (tope && this.medianocheLocal(candidato).getTime() >= tope.getTime()) {
        return null; // El día ya empieza pasado el tope: no hay ventana útil.
      }
      const { aperturaMinuto, cierreMinuto } = calendario[diaSemana];

      // Se comparan los campos directamente, no a través de una variable
      // booleana: TypeScript no propaga el estrechamiento a través de una
      // variable intermedia, y hacerlo así obligaría a afirmar no-nulo abajo.
      if (aperturaMinuto === null || cierreMinuto === null || feriados.has(claveDia)) {
        continue;
      }

      const aperturaMs = aperturaMinuto * MS_POR_MINUTO;
      const cierreMs = cierreMinuto * MS_POR_MINUTO;

      if (offset === 0) {
        if (msDelDia >= aperturaMs && msDelDia < cierreMs) {
          return desde; // Ya dentro de la ventana — consume desde su propio instante (regla 2).
        }
        if (msDelDia >= cierreMs) {
          continue; // La ventana de hoy ya cerró — sigue buscando desde el día siguiente.
        }
        // msDelDia < aperturaMs: todavía no abrió hoy — arranca en la apertura de hoy.
      }

      return new Date(this.medianocheLocal(candidato).getTime() + aperturaMs);
    }

    if (tope) {
      return null;
    }

    throw new Error(
      `CalcularSlaHabilVenceService: no se encontró ningún día hábil abierto dentro de ` +
        `${LIMITE_DIAS_BUSQUEDA} días desde ${desde.toISOString()} — el calendario no tiene ` +
        'ninguna ventana abierta, o los feriados configurados cubren ese rango completo.',
    );
  }

  /**
   * Dado un instante que YA está dentro de una ventana abierta (precondición
   * garantizada por quien llama), devuelve el instante de cierre de esa
   * ventana.
   */
  private finDeVentanaActual(dentroDeVentana: Date, calendario: CalendarioLaboralSemanal): Date {
    const dia = this.diaLocalDe(dentroDeVentana);
    const diaSemana = this.diaSemanaDe(dia);
    const { cierreMinuto } = calendario[diaSemana];

    // La precondición se VERIFICA en vez de afirmarse con `!`: si alguna vez
    // se llama con un instante que no está dentro de una ventana abierta, el
    // error nombra el bug en lugar de producir un vencimiento silenciosamente
    // corrido a la medianoche local.
    if (cierreMinuto === null) {
      throw new Error(
        'CalcularSlaHabilVenceService: se pidió el fin de ventana de un día cerrado ' +
          `(${dentroDeVentana.toISOString()}) — el cursor quedó fuera de una ventana abierta.`,
      );
    }

    return new Date(this.medianocheLocal(dia).getTime() + cierreMinuto * MS_POR_MINUTO);
  }

  /** Componentes de día calendario LOCAL (Argentina) de un instante real. */
  private diaLocalDe(instante: Date): DiaLocal {
    const local = desplazarAArgentina(instante);
    return {
      anio: local.getUTCFullYear(),
      mes: local.getUTCMonth(),
      dia: local.getUTCDate(),
    };
  }

  /** Milisegundos transcurridos desde la medianoche LOCAL de un instante real. */
  private msDelDiaLocal(instante: Date): number {
    const local = desplazarAArgentina(instante);
    return (
      local.getUTCHours() * 3_600_000 +
      local.getUTCMinutes() * MS_POR_MINUTO +
      local.getUTCSeconds() * 1_000 +
      local.getUTCMilliseconds()
    );
  }

  /**
   * Suma días calendario a un día local, dejando que `Date.UTC` normalice
   * el desborde de mes/año — evita reimplementar aritmética de calendario.
   */
  private sumarDias(dia: DiaLocal, offset: number): DiaLocal {
    const normalizado = new Date(Date.UTC(dia.anio, dia.mes, dia.dia + offset));
    return {
      anio: normalizado.getUTCFullYear(),
      mes: normalizado.getUTCMonth(),
      dia: normalizado.getUTCDate(),
    };
  }

  /** Día de semana (0 = domingo … 6 = sábado) de un día local ya normalizado. */
  private diaSemanaDe(dia: DiaLocal): number {
    return new Date(Date.UTC(dia.anio, dia.mes, dia.dia)).getUTCDay();
  }

  /** Clave de día calendario local `'YYYY-MM-DD'`, para consultar feriados. */
  private claveDiaDe(dia: DiaLocal): string {
    const anio = String(dia.anio).padStart(4, '0');
    const mes = String(dia.mes + 1).padStart(2, '0');
    const diaDelMes = String(dia.dia).padStart(2, '0');
    return `${anio}-${mes}-${diaDelMes}`;
  }

  /**
   * Instante UTC real de la medianoche LOCAL (Argentina) de un día
   * calendario. Como Argentina es UTC-3 fijo, la medianoche local de un día
   * es las 03:00 UTC de ese mismo día — de ahí restar el offset (negativo)
   * en vez de sumarlo directamente.
   */
  private medianocheLocal(dia: DiaLocal): Date {
    const medianocheComoSiFueraUtc = Date.UTC(dia.anio, dia.mes, dia.dia, 0, 0, 0, 0);
    return new Date(medianocheComoSiFueraUtc - OFFSET_ARGENTINA_MS);
  }
}
