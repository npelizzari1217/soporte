/**
 * enviar-recordatorios-preventivo.use-case.spec.ts — odd/preventivo-anticipacion T3 (S4), unit con
 * dobles. Prueba la ORQUESTACIÓN: qué día se reclama (el argentino de mañana), desde cuándo se
 * consideran "generados hoy", y que el aviso sale post-commit, uno por ticket reclamado. La
 * consulta real (estados, borrado, idempotencia) se prueba en la integración.
 */
import { EnviarRecordatoriosPreventivoUseCase } from './enviar-recordatorios-preventivo.use-case';
import { ITenantTransactionRunner } from '../../../shared/infrastructure/persistence/tenant-transaction-runner';
import { IDomainEventPublisher } from '../../../shared/domain/ports/i-domain-event-publisher';
import { IPreventivoGeneracionRepository } from '../../domain/ports/i-preventivo-generacion.repository';

function build() {
  const generacionRepo = {
    reclamarRecordatorios: vi
      .fn<IPreventivoGeneracionRepository['reclamarRecordatorios']>()
      .mockResolvedValue([]),
  };
  // `alCommitear` del doble encola: así se ve que NADA se publica antes de que `run` termine.
  const pendientes: Array<() => void> = [];
  const txRunner = {
    run: async <T>(fn: () => Promise<T>): Promise<T> => {
      const resultado = await fn();
      pendientes.splice(0).forEach((callback) => callback());
      return resultado;
    },
    alCommitear: vi.fn<ITenantTransactionRunner['alCommitear']>((fn) => {
      pendientes.push(fn);
    }),
  };
  vi.spyOn(txRunner, 'run');
  const eventPublisher = { publish: vi.fn<IDomainEventPublisher['publish']>() };
  const useCase = new EnviarRecordatoriosPreventivoUseCase(
    generacionRepo,
    txRunner,
    eventPublisher,
  );
  return { useCase, generacionRepo, txRunner, eventPublisher };
}

describe('EnviarRecordatoriosPreventivoUseCase (S4)', () => {
  it('reclama los tickets cuya fecha objetivo es MAÑANA en Argentina, generados antes del inicio de HOY', async () => {
    const { useCase, generacionRepo, txRunner } = build();

    await useCase.execute(new Date('2026-06-30T04:00:00.000Z'));

    expect(txRunner.run).toHaveBeenCalledTimes(1);
    expect(generacionRepo.reclamarRecordatorios).toHaveBeenCalledWith(
      new Date('2026-07-01T00:00:00.000Z'),
      // 00:00 ART del 30/06: lo generado desde ahí ya recibió el correo de generación hoy.
      new Date('2026-06-30T03:00:00.000Z'),
    );
  });

  it('a las 22:30 ART el día UTC ya cambió, pero "mañana" sigue siendo el del día argentino', async () => {
    const { useCase, generacionRepo } = build();

    await useCase.execute(new Date('2026-07-01T01:30:00.000Z'));

    expect(generacionRepo.reclamarRecordatorios).toHaveBeenCalledWith(
      new Date('2026-07-01T00:00:00.000Z'),
      new Date('2026-06-30T03:00:00.000Z'),
    );
  });

  it('publica un preventivo.recordatorio por ticket reclamado, al responsable del plan, recién al commitear', async () => {
    const { useCase, generacionRepo, txRunner, eventPublisher } = build();
    generacionRepo.reclamarRecordatorios.mockResolvedValue([
      { ticketId: 't-1', planId: 'p-1', responsableId: 'r-1' },
      { ticketId: 't-2', planId: 'p-2', responsableId: 'r-2' },
    ]);

    await useCase.execute(new Date('2026-06-30T04:00:00.000Z'));

    expect(txRunner.alCommitear).toHaveBeenCalledTimes(2);
    expect(eventPublisher.publish).toHaveBeenCalledTimes(2);
    expect(eventPublisher.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'preventivo.recordatorio',
        ticketId: 't-1',
        planId: 'p-1',
        responsableId: 'r-1',
      }),
    );
    expect(eventPublisher.publish).toHaveBeenCalledWith(
      expect.objectContaining({ ticketId: 't-2', responsableId: 'r-2' }),
    );
    // El reclamo (UPDATE) va antes que cualquier publicación.
    expect(generacionRepo.reclamarRecordatorios.mock.invocationCallOrder[0]).toBeLessThan(
      eventPublisher.publish.mock.invocationCallOrder[0],
    );
  });

  it('sin tickets reclamados no publica nada', async () => {
    const { useCase, eventPublisher, txRunner } = build();

    await useCase.execute(new Date('2026-06-30T04:00:00.000Z'));

    expect(txRunner.alCommitear).not.toHaveBeenCalled();
    expect(eventPublisher.publish).not.toHaveBeenCalled();
  });

  it('si el reclamo falla, no publica nada y el error sube al barrido (que lo aísla por tenant)', async () => {
    const { useCase, generacionRepo, eventPublisher } = build();
    generacionRepo.reclamarRecordatorios.mockRejectedValue(new Error('base caída'));

    await expect(useCase.execute(new Date('2026-06-30T04:00:00.000Z'))).rejects.toThrow(
      'base caída',
    );
    expect(eventPublisher.publish).not.toHaveBeenCalled();
  });
});
