import { ITenantTransactionRunner } from '../../../shared/infrastructure/persistence/tenant-transaction-runner';
import { IDomainEventPublisher } from '../../../shared/domain/ports/i-domain-event-publisher';
import { diaArgentino, medianocheArgentina } from '../../../shared/domain/zona-horaria-argentina';
import { IPreventivoGeneracionRepository } from '../../domain/ports/i-preventivo-generacion.repository';
import { PreventivoRecordatorioEvent } from '../../domain/events/preventivo-recordatorio.event';

const MS_POR_DIA = 24 * 60 * 60 * 1000;

/**
 * EnviarRecordatoriosPreventivoUseCase — recordatorio al responsable 1 día
 * antes de la fecha objetivo de un ticket preventivo
 * (odd/preventivo-anticipacion S4). Lo corre el barrido diario
 * (`PreventivoSweepScheduler`) por tenant, después de la generación.
 *
 * "Mañana" y "hoy" son días ARGENTINOS (`diaArgentino`), no UTC: entre las
 * 21:00 y las 23:59 ART el día UTC ya es el siguiente.
 *
 * Una sola vez: el reclamo marca `recordatorio_enviado_at` en la MISMA
 * transacción y el aviso se encola con `alCommitear()`, así que sale solo si
 * la marca quedó committeada. Si después falla el envío del correo, el
 * recordatorio no se reintenta (a lo sumo una vez, no al menos una): el
 * listener lo loguea.
 *
 * Los tickets generados HOY quedan afuera (`generadosAntesDe` = 00:00 ART de
 * hoy): ya recibieron el correo de generación, que trae la fecha objetivo.
 * Con anticipación de 0 o 1 día, entonces, no hay recordatorio.
 */
export class EnviarRecordatoriosPreventivoUseCase {
  constructor(
    private readonly generacionRepo: Pick<IPreventivoGeneracionRepository, 'reclamarRecordatorios'>,
    private readonly txRunner: ITenantTransactionRunner,
    private readonly eventPublisher: Pick<IDomainEventPublisher, 'publish'>,
  ) {}

  /**
   * @param ahora Instante de la corrida; por defecto, el reloj del sistema.
   * @returns No retorna valor. Un fallo del reclamo se propaga: lo aísla el barrido por tenant.
   */
  async execute(ahora: Date = new Date()): Promise<void> {
    const hoy = diaArgentino(ahora);
    const manana = new Date(hoy.getTime() + MS_POR_DIA);
    const inicioDeHoy = medianocheArgentina(hoy);

    await this.txRunner.run(async () => {
      const reclamados = await this.generacionRepo.reclamarRecordatorios(manana, inicioDeHoy);
      for (const reclamado of reclamados) {
        this.txRunner.alCommitear(() => {
          this.eventPublisher.publish(new PreventivoRecordatorioEvent(reclamado));
        });
      }
    });
  }
}
