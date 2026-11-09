import { ILogger } from '../../domain/ports/i-logger.port';

/**
 * De dónde vino una falta de conexión a la base (odd/saturacion-conexiones, L5):
 * - `servidor`: Postgres sin conexiones libres (`53300`).
 * - `pool`: el pool propio llegó a su tope y venció la espera.
 * - `transaccion`: una transacción no consiguió conexión en su `maxWait`.
 */
export type OrigenSaturacion = 'servidor' | 'pool' | 'transaccion';

/** Episodio que disparó un aviso: cuántas saturaciones, cuándo y de qué origen. */
export interface ResumenSaturacion {
  eventos: number;
  desde: Date;
  hasta: Date;
  porOrigen: Record<OrigenSaturacion, number>;
}

/** Lo que ve un ROOT en pantalla. */
export interface EstadoSaturacion {
  /** Saturaciones de los últimos 10 minutos. */
  eventosRecientes: number;
  ultimoAviso: (ResumenSaturacion & { avisadoEn: Date }) | null;
}

/**
 * Recibe cada aviso; puede ser asíncrono (un correo). Si devuelve `false`, el aviso no se pudo
 * entregar y no consume la hora de espera: el próximo episodio vuelve a intentarlo.
 */
export type SuscriptorSaturacion = (
  resumen: ResumenSaturacion,
) => void | boolean | Promise<void | boolean>;

/** Token de inyección del monitor (singleton del proceso). */
export const MONITOR_SATURACION = Symbol('MONITOR_SATURACION');

const VENTANA_MS = 10 * 60_000;
const UMBRAL = 5;
const ENFRIAMIENTO_MS = 60 * 60_000;
/** Tope de memoria ante una avalancha: el umbral es 5, así que 10.000 sobra para el conteo. */
const TOPE_EVENTOS = 10_000;

interface Evento {
  instante: number;
  origen: OrigenSaturacion;
}

/**
 * MonitorSaturacion — cuenta las saturaciones de la base y avisa cuando se repiten
 * (odd/saturacion-conexiones, S3): 5 en una ventana de 10 minutos disparan un aviso, con un
 * máximo de uno por hora para no inundar a ROOT.
 *
 * Vive en memoria del proceso: el backend es un solo proceso (NSSM), y un reinicio que borra el
 * conteo no pierde nada importante, porque el correo ya salió y el log conserva cada evento
 * (`SATURACION_CONEXIONES`). No depende de ningún módulo: el filtro de errores registra y los
 * interesados (el correo a ROOT) se suscriben.
 */
export class MonitorSaturacion {
  /** En orden de llegada: se descartan siempre desde el más viejo, sin recorrer la ventana. */
  private readonly eventos: Evento[] = [];
  private ultimoAviso: (ResumenSaturacion & { avisadoEn: Date }) | null = null;
  /** Desde cuándo corre la hora de espera; `null` si el último aviso no se pudo entregar. */
  private enfriamientoDesde: number | null = null;
  private readonly suscriptores: SuscriptorSaturacion[] = [];

  /**
   * @param logger Donde queda la falla de un suscriptor.
   * @param reloj Fuente de la hora actual; inyectable para los tests.
   */
  constructor(
    private readonly logger: Pick<ILogger, 'error'>,
    private readonly reloj: () => Date = () => new Date(),
  ) {}

  /** @param suscriptor Se invoca con cada aviso; sus fallas no afectan a los demás. */
  suscribir(suscriptor: SuscriptorSaturacion): void {
    this.suscriptores.push(suscriptor);
  }

  /**
   * Registra una saturación y, si corresponde, dispara el aviso. Nunca lanza: lo llama el
   * filtro de errores mientras responde al usuario.
   *
   * @param origen De dónde vino la falta de conexión.
   */
  registrar(origen: OrigenSaturacion): void {
    const ahora = this.reloj().getTime();
    this.descartarViejos(ahora);
    this.eventos.push({ instante: ahora, origen });
    if (this.eventos.length > TOPE_EVENTOS) this.eventos.shift();

    const enfriado =
      this.enfriamientoDesde === null || ahora - this.enfriamientoDesde >= ENFRIAMIENTO_MS;
    if (this.eventos.length < UMBRAL || !enfriado) return;

    const resumen = this.resumir(this.eventos);
    this.ultimoAviso = { ...resumen, avisadoEn: new Date(ahora) };
    this.enfriamientoDesde = ahora;
    // Un suscriptor que falla (SMTP caído) no frena a los demás ni a quien registra, pero su falla
    // queda en el log: el aviso no salió y alguien tiene que enterarse.
    for (const suscriptor of this.suscriptores) {
      try {
        const resultado = suscriptor(resumen);
        if (resultado instanceof Promise) {
          resultado
            .then((entregado) => this.liberarSiNoEntrego(entregado, ahora))
            .catch((error: unknown) => this.loguearFalla(error));
        } else {
          this.liberarSiNoEntrego(resultado, ahora);
        }
      } catch (error: unknown) {
        this.loguearFalla(error);
      }
    }
  }

  /** @returns Saturaciones recientes y el último aviso, para la pantalla de ROOT. */
  estado(): EstadoSaturacion {
    this.descartarViejos(this.reloj().getTime());
    return { eventosRecientes: this.eventos.length, ultimoAviso: this.ultimoAviso };
  }

  /**
   * Un aviso que no salió (sin SMTP, sin destinatarios) libera la hora de espera, salvo que otro
   * episodio ya la haya vuelto a tomar.
   */
  private liberarSiNoEntrego(entregado: void | boolean, avisadoEn: number): void {
    if (entregado === false && this.enfriamientoDesde === avisadoEn) this.enfriamientoDesde = null;
  }

  private loguearFalla(error: unknown): void {
    this.logger.error(
      `ALERTA_SATURACION_SUSCRIPTOR_FALLO | error=${error instanceof Error ? error.message : String(error)}`,
    );
  }

  private descartarViejos(ahora: number): void {
    while (this.eventos.length > 0 && ahora - this.eventos[0].instante >= VENTANA_MS) {
      this.eventos.shift();
    }
  }

  private resumir(eventos: Evento[]): ResumenSaturacion {
    const porOrigen: Record<OrigenSaturacion, number> = { servidor: 0, pool: 0, transaccion: 0 };
    for (const evento of eventos) porOrigen[evento.origen] += 1;
    return {
      eventos: eventos.length,
      desde: new Date(eventos[0].instante),
      hasta: new Date(eventos[eventos.length - 1].instante),
      porOrigen,
    };
  }
}
