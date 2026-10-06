import { IRelojSlaRepository } from '../../domain/ports/i-reloj-sla.repository';
import { RelojSla } from '../../domain/entities/reloj-sla';
import { CalcularSlaHabilVenceService } from '../../../calendario-laboral/domain/services/calcular-sla-habil-vence.service';
import { ICalendarioLaboralSemanalRepository } from '../../../calendario-laboral/domain/ports/i-calendario-laboral-semanal.repository';
import { IFeriadosLaboralesRepository } from '../../../calendario-laboral/domain/ports/i-feriados-laborales.repository';
import { ILogger } from '../../../shared/domain/ports/i-logger.port';

export type ResultadoConsolidacion = 'consolidado' | 'conflicto' | 'sin_ticket';

/**
 * ConsolidarRelojSlaUseCase — pliega las transiciones `CAMBIO_ESTADO` posteriores al cursor y escribe el
 * reloj con CAS de versión (sdd/sla-primera-respuesta-y-pausa, ADR-3, sla-reloj-activo R4).
 *
 * El calendario y los feriados se cargan ANTES de leer: ninguna lectura de MASTER queda entre la
 * lectura del reloj y su escritura. Si el CAS falla (entró otra transición) reintenta una vez; si vuelve
 * a fallar, el ticket queda pendiente para el barrido (`SLA_RELOJ_CONFLICTO`). Repetir el pliegue sin
 * operaciones nuevas no cambia nada.
 */
export class ConsolidarRelojSlaUseCase {
  constructor(
    private readonly repo: IRelojSlaRepository,
    private readonly calculo: CalcularSlaHabilVenceService,
    private readonly calendarioRepo: Pick<ICalendarioLaboralSemanalRepository, 'obtener'>,
    private readonly feriadosRepo: Pick<IFeriadosLaboralesRepository, 'obtener'>,
    private readonly logger: Pick<ILogger, 'error'>,
  ) {}

  async execute(ticketId: string): Promise<ResultadoConsolidacion> {
    const [calendario, feriados] = await Promise.all([
      this.calendarioRepo.obtener(),
      this.feriadosRepo.obtener(),
    ]);

    for (let intento = 0; intento < 2; intento += 1) {
      const fila = await this.repo.leer(ticketId);
      if (!fila) return 'sin_ticket';
      const historialSinSecuencia =
        fila.acumuladoS === null ? await this.repo.historialSinSecuencia(ticketId) : [];
      const transiciones = await this.repo.transicionesDesde(ticketId, fila.seqHasta);
      const reloj = RelojSla.plegar({
        fila,
        medidor: RelojSla.medidorPara(fila.slaRegla, this.calculo, calendario, feriados),
        historialSinSecuencia,
        transiciones,
      });
      if (await this.repo.guardarSiVersion(ticketId, fila.version, reloj)) return 'consolidado';
    }

    this.logger.error(`SLA_RELOJ_CONFLICTO | ticket=${ticketId}`);
    return 'conflicto';
  }
}
