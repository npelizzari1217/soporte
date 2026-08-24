import type { IntervaloUnidad } from '../entities/plan-preventivo.entity';

/** Insumo mínimo de un plan para el cálculo de ciclos: solo el ancla y la cadencia. */
export interface PlanCicloBase {
  /** Ancla INMUTABLE de la recurrencia. Cada fecha se deriva de ESTE valor, nunca del ciclo anterior. */
  fechaInicio: Date;
  intervaloValor: number;
  intervaloUnidad: IntervaloUnidad;
}

/** Insumo de `ciclosPendientes`: el plan base + su puntero actual. */
export interface PlanCicloConPuntero extends PlanCicloBase {
  proximaEjecucionEn: Date;
}

/** Resultado de `ciclosPendientes` para UN plan en UNA corrida del barrido. */
export interface ResultadoCiclosPendientes {
  /**
   * Fecha del ciclo vencido MÁS RECIENTE — candidato a generar ticket.
   * `null` si no había ningún ciclo vencido (`proximaEjecucionEn > hoy`) o
   * si se alcanzó el TOPE de iteraciones (ADR-PV3: en ese caso solo se
   * re-ancla, sin generar).
   */
  candidato: Date | null;
  /**
   * Ciclos vencidos ANTERIORES al candidato — a registrar como
   * `SALTEADO_ATRASO`, sin ticket (ADR-PV3). Cuando se alcanza el TOPE,
   * esta lista contiene EXACTAMENTE el ciclo vencido más antiguo (una
   * única fila), nunca la ráfaga completa.
   */
  salteados: Date[];
  /** Próximo valor de `proxima_ejecucion_en` a persistir. */
  proximaEjecucionEn: Date;
  /** `true` cuando se alcanzó el TOPE y se aplicó el re-anclaje aritmético (caso patológico). */
  reanclado: boolean;
}

const MS_POR_DIA = 24 * 60 * 60 * 1000;

/**
 * CalcularCicloService — cálculo puro de dominio de la recurrencia de un
 * plan de mantenimiento preventivo (ADR-PV2, ADR-PV3). Sin dependencias de
 * infraestructura ni framework, sin lectura del reloj del sistema: `hoy`
 * SIEMPRE viaja como parámetro explícito.
 *
 * Regla que no se puede romper: toda fecha de ciclo se deriva de
 * `fechaInicio + k×cadencia` (`fechaCiclo`) — NUNCA se encadena sumando la
 * cadencia a la fecha del ciclo anterior. Encadenar acumula deriva en
 * `MESES`: `31/01 +1 mes (clamp) = 28/02`, y sumarle otro mes a `28/02` da
 * `28/03`, cuando el ciclo k=2 real es `31/03` (ADR-PV2).
 *
 * Ref spec: sdd/preventivo/spec, Requirements "Recurrencia por tiempo,
 * anclada a fecha inmutable" y "Recuperación de corrida perdida sin
 * ráfaga". Ref design: ADR-PV2, ADR-PV3. Tarea: 3.3/3.4/3.5.
 */
export class CalcularCicloService {
  /** Tope de iteraciones por plan y corrida (ADR-PV3) — evita iteración sin cota en el caso patológico. */
  static readonly TOPE_PREVENTIVO = 366;

  /**
   * Fecha programada del ciclo `k` (`k=0` es `fechaInicio` misma),
   * derivada SIEMPRE del ancla — nunca encadenada.
   *
   * `MESES` usa aritmética de calendario con clamp al último día del mes
   * destino (igual criterio que la mayoría de los motores de fechas):
   * `31/01` + 1 mes → `28/02` (Feb no tiene 31); + 2 meses → `31/03` (desde
   * el ancla, no desde `28/02`).
   */
  fechaCiclo(plan: PlanCicloBase, k: number): Date {
    if (plan.intervaloUnidad === 'DIAS') {
      return new Date(plan.fechaInicio.getTime() + k * plan.intervaloValor * MS_POR_DIA);
    }
    return this.sumarMesesClamped(plan.fechaInicio, k * plan.intervaloValor);
  }

  /**
   * Enumera los ciclos vencidos (`<= hoy`) desde `proximaEjecucionEn` en
   * adelante, acotado por `tope` iteraciones. El más reciente es el
   * `candidato`; el resto son `salteados` (ADR-PV3). Si `tope` se agota sin
   * alcanzar `hoy` (caso patológico: ancla vieja + cadencia corta), no hay
   * `candidato` — solo una fila de salteo sobre el ciclo vencido más
   * antiguo y un re-anclaje aritmético del puntero.
   */
  ciclosPendientes(
    plan: PlanCicloConPuntero,
    hoy: Date,
    tope: number = CalcularCicloService.TOPE_PREVENTIVO,
  ): ResultadoCiclosPendientes {
    if (plan.proximaEjecucionEn.getTime() > hoy.getTime()) {
      return {
        candidato: null,
        salteados: [],
        proximaEjecucionEn: plan.proximaEjecucionEn,
        reanclado: false,
      };
    }

    const vencidos: Date[] = [];
    let k = this.kDeFecha(plan, plan.proximaEjecucionEn);
    let iteraciones = 0;

    while (iteraciones < tope) {
      const fecha = this.fechaCiclo(plan, k);
      if (fecha.getTime() > hoy.getTime()) {
        return {
          candidato: vencidos[vencidos.length - 1] ?? null,
          salteados: vencidos.slice(0, -1),
          proximaEjecucionEn: fecha,
          reanclado: false,
        };
      }
      vencidos.push(fecha);
      k += 1;
      iteraciones += 1;
    }

    // TOPE agotado sin alcanzar `hoy`: re-anclaje aritmético, una única fila
    // de salteo sobre el ciclo vencido más antiguo (ADR-PV3). Sin candidato:
    // este caso NO genera ticket.
    return {
      candidato: null,
      salteados: [plan.proximaEjecucionEn],
      proximaEjecucionEn: this.reanclarAritmetico(plan, hoy),
      reanclado: true,
    };
  }

  /**
   * Índice `k` del ciclo cuya fecha es exactamente `fecha`, asumiendo que
   * `fecha` ya proviene de `fechaCiclo` (invariante mantenida por quien
   * persiste `proxima_ejecucion_en` — nunca se escribe a mano). `MESES` usa
   * diferencia calendario (año*12+mes), insensible al clamp del día.
   */
  private kDeFecha(plan: PlanCicloBase, fecha: Date): number {
    if (plan.intervaloUnidad === 'DIAS') {
      const diffDias = Math.round((fecha.getTime() - plan.fechaInicio.getTime()) / MS_POR_DIA);
      return diffDias / plan.intervaloValor;
    }
    const diffMeses =
      (fecha.getUTCFullYear() - plan.fechaInicio.getUTCFullYear()) * 12 +
      (fecha.getUTCMonth() - plan.fechaInicio.getUTCMonth());
    return diffMeses / plan.intervaloValor;
  }

  /** Re-anclaje aritmético del puntero (ADR-PV3): `fechaInicio + ceil((hoy - fechaInicio)/cadencia) × cadencia`. */
  private reanclarAritmetico(plan: PlanCicloBase, hoy: Date): Date {
    if (plan.intervaloUnidad === 'DIAS') {
      const diffDias = (hoy.getTime() - plan.fechaInicio.getTime()) / MS_POR_DIA;
      const k = Math.ceil(diffDias / plan.intervaloValor);
      return this.fechaCiclo(plan, k);
    }
    const diffMeses =
      (hoy.getUTCFullYear() - plan.fechaInicio.getUTCFullYear()) * 12 +
      (hoy.getUTCMonth() - plan.fechaInicio.getUTCMonth());
    const k = Math.ceil(diffMeses / plan.intervaloValor);
    return this.fechaCiclo(plan, k);
  }

  /** Suma `meses` a `anchor` con clamp al último día del mes destino (UTC, sin desplazamiento de horario). */
  private sumarMesesClamped(anchor: Date, meses: number): Date {
    const anio = anchor.getUTCFullYear();
    const mes = anchor.getUTCMonth();
    const dia = anchor.getUTCDate();

    const totalMeses = mes + meses;
    const anioDestino = anio + Math.floor(totalMeses / 12);
    const mesDestino = ((totalMeses % 12) + 12) % 12;
    const diasEnMesDestino = new Date(Date.UTC(anioDestino, mesDestino + 1, 0)).getUTCDate();
    const diaDestino = Math.min(dia, diasEnMesDestino);

    return new Date(
      Date.UTC(
        anioDestino,
        mesDestino,
        diaDestino,
        anchor.getUTCHours(),
        anchor.getUTCMinutes(),
        anchor.getUTCSeconds(),
        anchor.getUTCMilliseconds(),
      ),
    );
  }
}
