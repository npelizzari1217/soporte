import {
  CambioEstadoTramo,
  MotivoFinTramo,
  SituacionTicketTramo,
  TramoAbierto,
} from '../tramo-tecnico';

/** Situación de un ticket guardado, con lo que el tramo necesita al cerrarse. */
export interface SituacionTicketGuardado extends SituacionTicketTramo {
  readonly estadoId: string;
  /** `tickets.sla_meta_s`: meta de SLA en segundos, o `null` si el ticket no tiene (S4). */
  readonly slaMetaS: number | null;
}

/** Un tramo completo, abierto o cerrado. */
export interface TramoTecnico {
  readonly id: string;
  readonly ticketId: string;
  readonly tecnicoId: string;
  readonly inicioAt: Date;
  readonly finAt: Date | null;
  readonly motivoFin: MotivoFinTramo | null;
  readonly habilS: number | null;
  readonly metaS: number | null;
  readonly cumplido: boolean | null;
}

/** Datos con que se cierra un tramo. */
export interface CierreTramo {
  readonly id: string;
  readonly finAt: Date;
  readonly motivo: MotivoFinTramo;
  readonly habilS: number | null;
  readonly metaS: number | null;
  readonly cumplido: boolean | null;
}

/**
 * ITramoTecnicoRepository — persistencia de los tramos del técnico (`tramos_tecnico_ticket`,
 * base del tenant; odd/tasks/tiempo-tecnico.md, T3) y las lecturas del ticket que necesitan.
 *
 * Todos los métodos usan el cliente del tenant activo: dentro de
 * `ITenantTransactionRunner.run()` participan de la transacción que guarda el ticket.
 *
 * Definido en la capa de dominio: sin imports de Prisma ni NestJS.
 */
export interface ITramoTecnicoRepository {
  /**
   * Lee responsable, estado y meta del ticket tomando el lock de su fila (`FOR NO KEY UPDATE`)
   * hasta el fin de la transacción, para que dos guardados del mismo ticket no decidan sus tramos
   * sobre la misma foto. Fuera de una transacción el lock se libera enseguida.
   *
   * @param ticketId Id del ticket.
   * @returns La situación, o `null` si el ticket todavía no existe (alta).
   */
  leerSituacion(ticketId: string): Promise<SituacionTicketGuardado | null>;

  /**
   * @param ticketId Id del ticket.
   * @returns El tramo abierto del ticket (hay a lo sumo uno), o `null`.
   */
  obtenerAbierto(ticketId: string): Promise<TramoAbierto | null>;

  /**
   * Abre un tramo. Falla con la violación del índice único parcial si el ticket ya tiene uno
   * abierto: el caller lo cierra antes.
   *
   * @returns El tramo abierto.
   */
  abrir(props: { ticketId: string; tecnicoId: string; inicioAt: Date }): Promise<TramoAbierto>;

  /**
   * Cierra un tramo, solo si sigue abierto (la condición viaja en el mismo `UPDATE`).
   *
   * @returns `false` si no había un tramo abierto con ese id.
   */
  cerrar(cierre: CierreTramo): Promise<boolean>;

  /**
   * Cambios de estado del ticket (`CAMBIO_ESTADO` no borrados, con estado nuevo) hasta `hasta`
   * inclusive, en orden cronológico.
   *
   * @param ticketId Id del ticket.
   * @param hasta Instante final, inclusive.
   * @returns Los cambios, con el código del estado al que pasó el ticket.
   */
  listarCambiosEstado(ticketId: string, hasta: Date): Promise<CambioEstadoTramo[]>;

  /**
   * @param ticketId Id del ticket.
   * @returns Todos los tramos del ticket, del más viejo al más nuevo.
   */
  listarPorTicket(ticketId: string): Promise<TramoTecnico[]>;
}

/** Token de inyección de dependencias para ITramoTecnicoRepository en NestJS. */
export const TRAMO_TECNICO_REPOSITORY = Symbol('TRAMO_TECNICO_REPOSITORY');
