import { AsignarEquipoUseCase, AsignarEquipoDto } from './asignar-equipo.use-case';
import { IEquipoInformaticoRepository } from '../../domain/ports/i-equipo-informatico.repository';
import { ITenantTransactionRunner } from '../../../shared/infrastructure/persistence/tenant-transaction-runner';
import { IUsuarioMasterChecker } from '../../../tickets/domain/ports/i-usuario-master.checker';
import { EquipoInformaticoEntity } from '../../domain/entities/equipo-informatico.entity';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeEquipo(id: string, activo: boolean, deletedAt: Date | null): EquipoInformaticoEntity {
  return EquipoInformaticoEntity.reconstitute(
    {
      nombre: `Equipo ${id}`,
      numeroSerie: null,
      marca: null,
      modelo: null,
      fechaAdquisicion: null,
      ubicacionId: null,
      asignadoAId: null,
      activo,
    },
    id,
    new Date(),
    new Date(),
    deletedAt,
  );
}

// ─── Constantes de test ───────────────────────────────────────────────────────

const EQUIPO_ID = 'eq000000-0000-4000-e000-000000000001';
const USUARIO_ID = 'us000000-0000-4000-u000-000000000001';
const CLIENTE_ID = 'cliente-001';

const validDto: AsignarEquipoDto = {
  equipoId: EQUIPO_ID,
  asignadoAId: USUARIO_ID,
  clienteId: CLIENTE_ID,
};

// ─── Suite principal ──────────────────────────────────────────────────────────

describe('AsignarEquipoUseCase', () => {
  let useCase: AsignarEquipoUseCase;

  const mockEquipoRepo = {
    findById: jest.fn(),
    findByNumeroSerie: jest.fn(),
    findAllActive: jest.fn(),
    findByAsignadoAId: jest.fn(),
    save: jest.fn<Promise<void>, [EquipoInformaticoEntity]>(),
    delete: jest.fn(),
  } satisfies jest.Mocked<IEquipoInformaticoRepository>;

  const mockUsuarioChecker = {
    existeEnTenant: jest.fn<Promise<boolean>, [string, string]>(),
    estaActivoEnTenant: jest.fn<Promise<boolean>, [string, string]>(),
  } satisfies jest.Mocked<IUsuarioMasterChecker>;

  const mockTxRunner: ITenantTransactionRunner = {
    run: jest.fn().mockImplementation((fn: () => Promise<unknown>) => fn()),
  };

  beforeEach(() => {
    jest.clearAllMocks();

    mockEquipoRepo.findById.mockResolvedValue(makeEquipo(EQUIPO_ID, true, null));
    mockUsuarioChecker.estaActivoEnTenant.mockResolvedValue(true);
    mockEquipoRepo.save.mockResolvedValue(undefined);
    (mockTxRunner.run as jest.Mock).mockImplementation((fn: () => Promise<unknown>) => fn());

    useCase = new AsignarEquipoUseCase(mockEquipoRepo, mockUsuarioChecker, mockTxRunner);
  });

  // ─── Equipo no encontrado ─────────────────────────────────────────────────

  describe('equipo no encontrado', () => {
    it('retorna fallo cuando el equipo no existe', async () => {
      mockEquipoRepo.findById.mockResolvedValue(null);

      const result = await useCase.execute(validDto);

      expect(result.isFail()).toBe(true);
      expect(result.getError().code).toBe('EQUIPO_INFORMATICO_NO_ENCONTRADO');
    });

    it('retorna fallo cuando el equipo fue soft-deleted', async () => {
      mockEquipoRepo.findById.mockResolvedValue(makeEquipo(EQUIPO_ID, true, new Date()));

      const result = await useCase.execute(validDto);

      expect(result.isFail()).toBe(true);
      expect(result.getError().code).toBe('EQUIPO_INFORMATICO_NO_ENCONTRADO');
    });
  });

  // ─── Cross-DB validation: usuario en master ───────────────────────────────

  describe('validación cross-DB del asignado_a_id (IUsuarioMasterChecker)', () => {
    it('retorna fallo cuando el usuario no existe en master o no pertenece al tenant', async () => {
      mockUsuarioChecker.estaActivoEnTenant.mockResolvedValue(false);

      const result = await useCase.execute(validDto);

      expect(result.isFail()).toBe(true);
      expect(result.getError().code).toBe('ASIGNADO_INVALIDO');
    });

    it('llama a estaActivoEnTenant con el usuarioId y clienteId del DTO', async () => {
      await useCase.execute(validDto);

      expect(mockUsuarioChecker.estaActivoEnTenant).toHaveBeenCalledWith(USUARIO_ID, CLIENTE_ID);
    });

    it('usa estaActivoEnTenant (activo=TRUE requerido), NO solo existeEnTenant', async () => {
      // Simula un usuario que existe pero no está activo — debe fallar
      mockUsuarioChecker.estaActivoEnTenant.mockResolvedValue(false);
      mockUsuarioChecker.existeEnTenant.mockResolvedValue(true); // irrelevante para este use case

      const result = await useCase.execute(validDto);

      expect(result.isFail()).toBe(true);
      // estaActivoEnTenant fue llamado (no solo existeEnTenant)
      expect(mockUsuarioChecker.estaActivoEnTenant).toHaveBeenCalled();
    });

    it('no persiste nada cuando el usuario es inválido', async () => {
      mockUsuarioChecker.estaActivoEnTenant.mockResolvedValue(false);

      await useCase.execute(validDto);

      expect(mockEquipoRepo.save).not.toHaveBeenCalled();
    });
  });

  // ─── Happy path ───────────────────────────────────────────────────────────

  describe('happy path', () => {
    it('retorna Result.ok con el equipo asignado', async () => {
      const result = await useCase.execute(validDto);

      expect(result.isOk()).toBe(true);
    });

    it('el equipo retornado tiene asignadoAId del DTO', async () => {
      const result = await useCase.execute(validDto);

      expect(result.getValue().asignadoAId).toBe(USUARIO_ID);
    });

    it('el save ocurre DENTRO del callback del txRunner', async () => {
      const callOrder: string[] = [];
      (mockTxRunner.run as jest.Mock).mockImplementation(async (fn: () => Promise<unknown>) => {
        callOrder.push('tx:start');
        const r = await fn();
        callOrder.push('tx:end');
        return r;
      });
      mockEquipoRepo.save.mockImplementation(async () => {
        callOrder.push('equipo:save');
      });

      await useCase.execute(validDto);

      expect(callOrder.indexOf('tx:start')).toBeLessThan(callOrder.indexOf('equipo:save'));
      expect(callOrder.indexOf('tx:end')).toBeGreaterThan(callOrder.indexOf('equipo:save'));
    });
  });
});
