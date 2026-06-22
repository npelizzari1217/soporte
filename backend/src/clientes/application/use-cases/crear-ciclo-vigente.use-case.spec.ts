/**
 * 1.B.5 TEST — CrearCicloVigenteUseCase (RED → GREEN con 1.B.6)
 *
 * Cubre:
 * - 422 cuando el rango de fechas se solapa con un ciclo activo existente
 * - Ciclos soft-deleted NO cuentan en la validación de solapamiento
 * - Ciclos activo=false (no eliminados) NO deben bloquear (S4 — alineado a spec)
 * - Creación exitosa cuando no hay solapamiento
 * - UUIDv7 generado antes del save
 * - Varios escenarios de solapamiento de rangos
 */
import { CrearCicloVigenteUseCase, CrearCicloVigenteDto } from './crear-ciclo-vigente.use-case';
import { ICicloVigenteRepository } from '../../domain/ports/i-ciclo-vigente.repository';
import { CicloVigenteEntity } from '../../domain/entities/ciclo-vigente.entity';
import { CicloVigenteOverlapError } from '../../domain/errors/clientes.errors';

// ─── Mock del repositorio ──────────────────────────────────────────────────────

const makeMockRepo = (): jest.Mocked<ICicloVigenteRepository> => ({
  findById: jest.fn(),
  findAllNonDeleted: jest.fn(),
  findActiveNonDeleted: jest.fn(),
  findAll: jest.fn(),
  save: jest.fn(),
  delete: jest.fn(),
});

const makeCiclo = (
  fechaInicio: string,
  fechaFin: string,
  softDeleted = false,
): CicloVigenteEntity => {
  const ciclo = CicloVigenteEntity.create({
    nombre: 'Existing',
    fechaInicio: new Date(fechaInicio),
    fechaFin: new Date(fechaFin),
    activo: true,
  });
  if (softDeleted) ciclo.softDelete();
  return ciclo;
};

/** Crea un ciclo con activo=false (inactivo, no eliminado). */
const makeCicloInactivo = (fechaInicio: string, fechaFin: string): CicloVigenteEntity => {
  return CicloVigenteEntity.create({
    nombre: 'Inactivo',
    fechaInicio: new Date(fechaInicio),
    fechaFin: new Date(fechaFin),
    activo: false,
  });
};

const dtoFor = (fechaInicio: string, fechaFin: string): CrearCicloVigenteDto => ({
  nombre: 'Nuevo Ciclo',
  fechaInicio: new Date(fechaInicio),
  fechaFin: new Date(fechaFin),
  activo: true,
});

describe('CrearCicloVigenteUseCase', () => {
  let useCase: CrearCicloVigenteUseCase;
  let repo: jest.Mocked<ICicloVigenteRepository>;

  beforeEach(() => {
    repo = makeMockRepo();
    useCase = new CrearCicloVigenteUseCase(repo);
  });

  describe('Escenario: sin solapamiento — creación exitosa', () => {
    beforeEach(() => {
      // Ciclo existente: 2025-01-01 a 2025-12-31
      repo.findActiveNonDeleted.mockResolvedValue([makeCiclo('2025-01-01', '2025-12-31')]);
      repo.save.mockResolvedValue(undefined);
    });

    it('retorna Result.ok con el ciclo creado (2026, sin solapamiento)', async () => {
      const result = await useCase.execute(dtoFor('2026-01-01', '2026-12-31'));
      expect(result.isOk()).toBe(true);
      expect(result.getValue()).toBeInstanceOf(CicloVigenteEntity);
    });

    it('el ciclo creado tiene los datos del DTO', async () => {
      const dto = dtoFor('2026-01-01', '2026-12-31');
      const result = await useCase.execute(dto);
      const ciclo = result.getValue();
      expect(ciclo.nombre).toBe('Nuevo Ciclo');
      expect(ciclo.fechaInicio).toEqual(dto.fechaInicio);
      expect(ciclo.fechaFin).toEqual(dto.fechaFin);
      expect(ciclo.activo).toBe(true);
    });

    it('genera UUIDv7 antes de save', async () => {
      let capturedId: string | undefined;
      repo.save.mockImplementation(async (c: CicloVigenteEntity) => {
        capturedId = c.id;
      });
      const result = await useCase.execute(dtoFor('2026-01-01', '2026-12-31'));
      expect(capturedId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );
      expect(result.getValue().id).toBe(capturedId);
    });

    it('llama a repo.save exactamente una vez', async () => {
      await useCase.execute(dtoFor('2026-01-01', '2026-12-31'));
      expect(repo.save).toHaveBeenCalledTimes(1);
    });
  });

  describe('Escenario: sin ciclos existentes — creación exitosa', () => {
    beforeEach(() => {
      repo.findActiveNonDeleted.mockResolvedValue([]);
      repo.save.mockResolvedValue(undefined);
    });

    it('retorna Result.ok cuando no hay ciclos previos', async () => {
      const result = await useCase.execute(dtoFor('2026-01-01', '2026-12-31'));
      expect(result.isOk()).toBe(true);
    });
  });

  describe('Escenario: solapamiento con ciclo activo → 422', () => {
    beforeEach(() => {
      // Ciclo existente: 2026-01-01 a 2026-12-31
      repo.findActiveNonDeleted.mockResolvedValue([makeCiclo('2026-01-01', '2026-12-31')]);
    });

    it('rechaza cuando nuevo ciclo está completamente dentro del existente', async () => {
      const result = await useCase.execute(dtoFor('2026-03-01', '2026-06-30'));
      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(CicloVigenteOverlapError);
    });

    it('rechaza cuando hay solapamiento parcial al inicio', async () => {
      // Nuevo: 2025-07-01 a 2026-03-31 (solapa con 2026-01-01 a 2026-12-31)
      const result = await useCase.execute(dtoFor('2025-07-01', '2026-03-31'));
      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(CicloVigenteOverlapError);
    });

    it('rechaza cuando hay solapamiento parcial al final', async () => {
      // Nuevo: 2026-06-01 a 2027-06-30 (solapa con 2026-01-01 a 2026-12-31)
      const result = await useCase.execute(dtoFor('2026-06-01', '2027-06-30'));
      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(CicloVigenteOverlapError);
    });

    it('rechaza cuando el nuevo ciclo contiene al existente', async () => {
      // Nuevo: 2025-01-01 a 2027-12-31 (contiene 2026-01-01 a 2026-12-31)
      const result = await useCase.execute(dtoFor('2025-01-01', '2027-12-31'));
      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(CicloVigenteOverlapError);
    });

    it('NO llama a repo.save cuando hay solapamiento', async () => {
      await useCase.execute(dtoFor('2026-03-01', '2026-06-30'));
      expect(repo.save).not.toHaveBeenCalled();
    });
  });

  describe('Escenario: ciclos soft-deleted NO cuentan en la validación', () => {
    beforeEach(() => {
      // findActiveNonDeleted solo devuelve activos no eliminados
      repo.findActiveNonDeleted.mockResolvedValue([]);
      repo.save.mockResolvedValue(undefined);
    });

    it('permite crear ciclo que solapa SOLO con ciclos soft-deleted', async () => {
      // findActiveNonDeleted no devuelve el ciclo eliminado → no hay solapamiento
      const result = await useCase.execute(dtoFor('2026-01-01', '2026-12-31'));
      expect(result.isOk()).toBe(true);
    });

    it('llama a findActiveNonDeleted (no findAll ni findAllNonDeleted) para la validación', async () => {
      await useCase.execute(dtoFor('2026-01-01', '2026-12-31'));
      expect(repo.findActiveNonDeleted).toHaveBeenCalledTimes(1);
      expect(repo.findAll).not.toHaveBeenCalled();
      expect(repo.findAllNonDeleted).not.toHaveBeenCalled();
    });
  });

  describe('Escenario: ciclos activo=false (no eliminados) NO deben bloquear (S4)', () => {
    it('permite crear ciclo que solapa SOLO con un ciclo activo=false no eliminado', async () => {
      // cicloInactivo: activo=false, no soft-deleted, solapa con el nuevo rango
      // findActiveNonDeleted filtra activo=true → no lo devuelve → no hay bloqueo
      // findAllNonDeleted (comportamiento anterior) SÍ lo devolvería → bloqueaba (bug)
      const cicloInactivo = makeCicloInactivo('2026-01-01', '2026-12-31');

      repo.findActiveNonDeleted.mockResolvedValue([]); // activo=false excluido
      repo.findAllNonDeleted.mockResolvedValue([cicloInactivo]); // buggy path — no debe llamarse
      repo.save.mockResolvedValue(undefined);

      const result = await useCase.execute(dtoFor('2026-01-01', '2026-12-31'));
      expect(result.isOk()).toBe(true);
    });

    it('findAllNonDeleted NO es llamado — la validación usa findActiveNonDeleted', async () => {
      repo.findActiveNonDeleted.mockResolvedValue([]);
      repo.save.mockResolvedValue(undefined);

      await useCase.execute(dtoFor('2026-01-01', '2026-12-31'));
      expect(repo.findAllNonDeleted).not.toHaveBeenCalled();
    });
  });
});
