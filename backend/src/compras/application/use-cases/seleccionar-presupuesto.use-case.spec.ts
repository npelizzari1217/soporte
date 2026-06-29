import {
  SeleccionarPresupuestoUseCase,
  SeleccionarPresupuestoDto,
} from './seleccionar-presupuesto.use-case';
import { ITenantTransactionRunner } from '../../../shared/infrastructure/persistence/tenant-transaction-runner';
import { IPresupuestoRepository } from '../../domain/ports/i-presupuesto.repository';
import { PresupuestoEntity } from '../../domain/entities/presupuesto.entity';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makePresupuesto(
  id: string,
  seleccionado = false,
  ticketCompraId = 'ticket-compra-001',
): PresupuestoEntity {
  return PresupuestoEntity.reconstitute(
    {
      ticketCompraId,
      proveedor: `Proveedor ${id}`,
      montoTotal: 1000,
      moneda: 'ARS',
      fechaCotizacion: new Date('2026-01-15'),
      seleccionado,
      observaciones: null,
    },
    id,
    new Date(),
    new Date(),
    null,
  );
}

// ─── Suite principal ──────────────────────────────────────────────────────────

describe('SeleccionarPresupuestoUseCase', () => {
  let useCase: SeleccionarPresupuestoUseCase;

  const mockPresupuestoRepo = {
    findById: vi.fn(),
    findByTicketCompraId: vi.fn(),
    findSelectedByTicketCompraId: vi.fn(),
    save: vi.fn<Promise<void>, [PresupuestoEntity]>(),
    delete: vi.fn(),
  } satisfies vi.Mocked<IPresupuestoRepository>;

  const mockTxRunner: ITenantTransactionRunner = {
    run: vi.fn().mockImplementation((fn: () => Promise<unknown>) => fn()),
  };

  const validDto: SeleccionarPresupuestoDto = {
    presupuestoId: 'presupuesto-nuevo-001',
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Default: presupuesto nuevo existe, no hay presupuesto previamente seleccionado
    mockPresupuestoRepo.findById.mockResolvedValue(makePresupuesto('presupuesto-nuevo-001'));
    mockPresupuestoRepo.findSelectedByTicketCompraId.mockResolvedValue(null);
    mockPresupuestoRepo.save.mockResolvedValue(undefined);
    (mockTxRunner.run as vi.Mock).mockImplementation((fn: () => Promise<unknown>) => fn());

    useCase = new SeleccionarPresupuestoUseCase(mockPresupuestoRepo, mockTxRunner);
  });

  // ─── Presupuesto not found ────────────────────────────────────────────────────

  describe('presupuesto not found', () => {
    it('retorna fallo si el presupuesto a seleccionar no existe', async () => {
      mockPresupuestoRepo.findById.mockResolvedValue(null);

      const result = await useCase.execute(validDto);

      expect(result.isFail()).toBe(true);
      expect(result.getError().code).toBe('PRESUPUESTO_NO_ENCONTRADO');
    });

    it('no llama a txRunner si el presupuesto no existe', async () => {
      mockPresupuestoRepo.findById.mockResolvedValue(null);

      await useCase.execute(validDto);

      expect(mockTxRunner.run).not.toHaveBeenCalled();
    });
  });

  // ─── Swap atómico ─────────────────────────────────────────────────────────────

  describe('swap atómico de selección', () => {
    it('selecciona el nuevo presupuesto (seleccionado = true)', async () => {
      const presupuestoNuevo = makePresupuesto('presupuesto-nuevo-001', false);
      mockPresupuestoRepo.findById.mockResolvedValue(presupuestoNuevo);

      await useCase.execute(validDto);

      const savedPresupuestos = mockPresupuestoRepo.save.mock.calls.map((c) => c[0]);
      const nuevoGuardado = savedPresupuestos.find((p) => p.id === 'presupuesto-nuevo-001');
      expect(nuevoGuardado).toBeDefined();
      expect(nuevoGuardado!.seleccionado).toBe(true);
    });

    it('deselecciona el presupuesto anterior cuando existe', async () => {
      const presupuestoAnterior = makePresupuesto('presupuesto-anterior-001', true);
      mockPresupuestoRepo.findSelectedByTicketCompraId.mockResolvedValue(presupuestoAnterior);

      await useCase.execute(validDto);

      const savedPresupuestos = mockPresupuestoRepo.save.mock.calls.map((c) => c[0]);
      const anteriorGuardado = savedPresupuestos.find((p) => p.id === 'presupuesto-anterior-001');
      expect(anteriorGuardado).toBeDefined();
      expect(anteriorGuardado!.seleccionado).toBe(false);
    });

    it('persiste ambos presupuestos en la misma tx cuando hay presupuesto anterior', async () => {
      const presupuestoAnterior = makePresupuesto('presupuesto-anterior-001', true);
      mockPresupuestoRepo.findSelectedByTicketCompraId.mockResolvedValue(presupuestoAnterior);

      await useCase.execute(validDto);

      expect(mockTxRunner.run).toHaveBeenCalledTimes(1);
      expect(mockPresupuestoRepo.save).toHaveBeenCalledTimes(2);
    });

    it('persiste solo el nuevo presupuesto en la tx cuando no hay anterior', async () => {
      mockPresupuestoRepo.findSelectedByTicketCompraId.mockResolvedValue(null);

      await useCase.execute(validDto);

      expect(mockTxRunner.run).toHaveBeenCalledTimes(1);
      expect(mockPresupuestoRepo.save).toHaveBeenCalledTimes(1);
    });

    it('el swap ocurre DENTRO del callback del runner', async () => {
      const callOrder: string[] = [];
      const presupuestoAnterior = makePresupuesto('presupuesto-anterior-001', true);
      mockPresupuestoRepo.findSelectedByTicketCompraId.mockResolvedValue(presupuestoAnterior);
      (mockTxRunner.run as vi.Mock).mockImplementation(async (fn: () => Promise<unknown>) => {
        callOrder.push('tx:start');
        const r = await fn();
        callOrder.push('tx:end');
        return r;
      });
      let saveCount = 0;
      mockPresupuestoRepo.save.mockImplementation(() => {
        callOrder.push(`save:${++saveCount}`);
        return Promise.resolve();
      });

      await useCase.execute(validDto);

      const txStart = callOrder.indexOf('tx:start');
      const txEnd = callOrder.indexOf('tx:end');
      expect(callOrder.indexOf('save:1')).toBeGreaterThan(txStart);
      expect(callOrder.indexOf('save:1')).toBeLessThan(txEnd);
      expect(callOrder.indexOf('save:2')).toBeGreaterThan(txStart);
      expect(callOrder.indexOf('save:2')).toBeLessThan(txEnd);
    });

    it('no coexisten dos presupuestos con seleccionado=true para el mismo ticketCompraId', async () => {
      const presupuestoAnterior = makePresupuesto('presupuesto-anterior-001', true);
      mockPresupuestoRepo.findSelectedByTicketCompraId.mockResolvedValue(presupuestoAnterior);

      await useCase.execute(validDto);

      const savedPresupuestos = mockPresupuestoRepo.save.mock.calls.map((c) => c[0]);
      const seleccionados = savedPresupuestos.filter((p) => p.seleccionado === true);
      expect(seleccionados).toHaveLength(1);
      expect(seleccionados[0].id).toBe('presupuesto-nuevo-001');
    });

    it('no llama a deseleccionar si el presupuesto seleccionado es el mismo que el nuevo', async () => {
      // Si el presupuesto ya estaba seleccionado, no debería des-seleccionarse a sí mismo
      const mismoPresupuesto = makePresupuesto('presupuesto-nuevo-001', true);
      mockPresupuestoRepo.findById.mockResolvedValue(mismoPresupuesto);
      mockPresupuestoRepo.findSelectedByTicketCompraId.mockResolvedValue(mismoPresupuesto);

      await useCase.execute(validDto);

      // Solo se guarda una vez (el mismo presupuesto con seleccionado=true)
      expect(mockPresupuestoRepo.save).toHaveBeenCalledTimes(1);
    });
  });

  // ─── Happy path ───────────────────────────────────────────────────────────────

  describe('happy path', () => {
    it('retorna Result.ok con el presupuesto seleccionado', async () => {
      const result = await useCase.execute(validDto);

      expect(result.isOk()).toBe(true);
    });

    it('el presupuesto retornado tiene seleccionado = true', async () => {
      const result = await useCase.execute(validDto);

      expect(result.getValue().seleccionado).toBe(true);
    });
  });
});
