import { ILogger } from '../../shared/domain/ports/i-logger.port';
import { CalcularSlaHabilVenceService } from '../../calendario-laboral/domain/services/calcular-sla-habil-vence.service';
import { ResolverHorarioLaboralUsuarioService } from '../../calendario-laboral/domain/services/resolver-horario-laboral-usuario.service';
import { IFeriadosLaboralesRepository } from '../../calendario-laboral/domain/ports/i-feriados-laborales.repository';
import {
  ITramoTecnicoRepository,
  SituacionTicketGuardado,
} from '../domain/ports/i-tramo-tecnico.repository';
import {
  evaluarCumplido,
  medirSegundosHabiles,
  MotivoFinTramo,
  planificarTramo,
  TramoAbierto,
} from '../domain/tramo-tecnico';

/**
 * SincronizarTramoTecnicoService — abre y cierra los tramos del técnico al guardar un ticket
 * (odd/tasks/tiempo-tecnico.md, T3, S4-S7, diseño L9).
 *
 * Es el único escritor de `tramos_tecnico_ticket`. Lo invoca `TicketRepositoryConTramos.save`,
 * por donde pasan todas las escrituras del responsable y del estado de un ticket, dentro de la
 * MISMA transacción: si el guardado del ticket se revierte, el tramo también.
 *
 * Al cerrar, mide los segundos hábiles en el horario del técnico (el propio o, si no tiene, el del
 * tenant: S2) con los feriados, sin contar las esperas al cliente (S7), y fija la meta del ticket
 * en ese momento (S4). Los tiempos quedan fijos con el horario vigente al cerrar.
 *
 * Una medición que falla (feriados de master caídos, un error del cálculo) no bloquea el cambio
 * del ticket: el tramo se cierra con `habil_s` NULL y se loguea. No aplica a un error de la base
 * del tenant (cambios de estado, horario del técnico), que ya abortó la transacción: ese se propaga.
 */
export class SincronizarTramoTecnicoService {
  constructor(
    private readonly tramoRepo: ITramoTecnicoRepository,
    private readonly horarioResolver: Pick<
      ResolverHorarioLaboralUsuarioService,
      'obtenerParaUsuario'
    >,
    private readonly feriadosRepo: Pick<IFeriadosLaboralesRepository, 'obtener'>,
    private readonly calculo: Pick<CalcularSlaHabilVenceService, 'msHabilesEntre'>,
    private readonly logger: Pick<ILogger, 'error'>,
    private readonly ahora: () => Date = () => new Date(),
  ) {}

  /**
   * Lee la situación del ticket ANTES de guardarlo, tomando el lock de su fila.
   *
   * @param ticketId Id del ticket.
   * @returns La situación, o `null` si el ticket es nuevo.
   */
  leerPrevio(ticketId: string): Promise<SituacionTicketGuardado | null> {
    return this.tramoRepo.leerSituacion(ticketId);
  }

  /**
   * Aplica el plan de tramos después de guardar el ticket.
   *
   * @param ticketId Id del ticket ya guardado.
   * @param previo Lo que devolvió `leerPrevio` antes del guardado.
   * @throws Error si el ticket no existe después de guardarlo, o si el tramo a cerrar ya no
   *   estaba abierto: con la fila del ticket bloqueada, las dos cosas son un bug.
   */
  async sincronizar(ticketId: string, previo: SituacionTicketGuardado | null): Promise<void> {
    const actual = await this.tramoRepo.leerSituacion(ticketId);
    if (actual === null) {
      throw new Error(
        `Tramos del técnico: el ticket "${ticketId}" no existe después de guardarlo.`,
      );
    }
    if (
      previo !== null &&
      previo.asignadoId === actual.asignadoId &&
      previo.estadoId === actual.estadoId
    ) {
      return;
    }

    const abierto = await this.tramoRepo.obtenerAbierto(ticketId);
    const plan = planificarTramo(previo, actual, abierto);
    if (plan.cerrar === null && plan.abrir === null) return;

    // Un solo instante para todo el guardado: el tramo que se cierra por reasignación termina
    // justo donde empieza el del nuevo técnico.
    const instante = this.ahora();
    // El estado anterior al guardado mide el tramo si no hubo ningún cambio desde que abrió.
    const estadoPrevio = previo?.estadoCodigo ?? null;
    if (plan.cerrar !== null) {
      await this.cerrar(
        ticketId,
        plan.cerrar.tramo,
        plan.cerrar.motivo,
        instante,
        actual.slaMetaS,
        estadoPrevio,
      );
    }
    if (plan.abrir !== null) {
      const tramo = await this.tramoRepo.abrir({
        ticketId,
        tecnicoId: plan.abrir.tecnicoId,
        inicioAt: instante,
      });
      if (plan.abrir.cerrarAlAbrir !== null) {
        await this.cerrar(
          ticketId,
          tramo,
          plan.abrir.cerrarAlAbrir,
          instante,
          actual.slaMetaS,
          estadoPrevio,
        );
      }
    }
  }

  private async cerrar(
    ticketId: string,
    tramo: TramoAbierto,
    motivo: MotivoFinTramo,
    instante: Date,
    metaS: number | null,
    estadoPrevio: string | null,
  ): Promise<void> {
    // Un reloj que retrocede no puede dejar un fin anterior al inicio (CHECK de la base).
    const finAt = instante.getTime() < tramo.inicioAt.getTime() ? tramo.inicioAt : instante;
    const habilS = await this.medir(ticketId, tramo, finAt, estadoPrevio);
    const cerrado = await this.tramoRepo.cerrar({
      id: tramo.id,
      finAt,
      motivo,
      habilS,
      metaS,
      cumplido: evaluarCumplido(motivo, habilS, metaS),
    });
    if (!cerrado) {
      throw new Error(
        `Tramos del técnico: el tramo "${tramo.id}" del ticket "${ticketId}" ya no estaba abierto.`,
      );
    }
  }

  private async medir(
    ticketId: string,
    tramo: TramoAbierto,
    finAt: Date,
    estadoPrevio: string | null,
  ): Promise<number | null> {
    if (finAt.getTime() <= tramo.inicioAt.getTime()) return 0;
    // Fuera del try: las dos lecturas van a la base del tenant, y un error ahí ya abortó la
    // transacción. Tragarlo solo cambiaría la causa real por el fallo del UPDATE del tramo.
    const cambios = await this.tramoRepo.listarCambiosEstado(ticketId, finAt);
    const { calendario } = await this.horarioResolver.obtenerParaUsuario(tramo.tecnicoId);
    try {
      const feriados = await this.feriadosRepo.obtener();
      return medirSegundosHabiles(
        tramo.inicioAt,
        finAt,
        cambios,
        (desde, hasta) => this.calculo.msHabilesEntre(desde, hasta, calendario, feriados),
        estadoPrevio,
      );
    } catch (error) {
      const mensaje = error instanceof Error ? error.message : 'error desconocido';
      this.logger.error(
        `TRAMO_TECNICO_MEDICION_FALLO | ticket=${ticketId} | tramo=${tramo.id} | ${mensaje}`,
      );
      return null;
    }
  }
}
