import { describe, it, expect, vi } from 'vitest';
import { CrearEquipoUseCase } from './crear-equipo.use-case';
import { EquipoInformaticoEntity } from '../../domain/entities/equipo-informatico.entity';
import { ModeloEquipoEntity } from '../../../insumos/domain/entities/modelo-equipo.entity';
import {
  ModeloEquipoDeshabilitadoError,
  ModeloEquipoInexistenteError,
  NumeroSerieDuplicadoError,
} from '../../domain/errors/equipos.errors';

/**
 * T12.1 [U][RED] — CrearEquipoUseCase: numeroSerie duplicado →
 * NumeroSerieDuplicadoError. La ubicación pasó de FK (catálogo) a TEXTO LIBRE
 * — ya no se valida contra el catálogo, por eso el use case ya no inyecta
 * `ubicacionRepo` ni produce `UbicacionInvalidaError`.
 *
 * Ref spec: sdd/flujos-especializados/spec F3-Q1.
 */
describe('CrearEquipoUseCase', () => {
  function makeDeps(overrides: Partial<Record<string, unknown>> = {}) {
    const equipoRepo = {
      findByNumeroSerie: vi.fn().mockResolvedValue(null),
      save: vi.fn().mockResolvedValue(undefined),
    };
    const txRunner = { run: vi.fn((fn: () => Promise<unknown>) => fn()) };
    const modeloRepo = { findById: vi.fn().mockResolvedValue(null) };
    return { equipoRepo, txRunner, modeloRepo, ...overrides };
  }

  it('crea el equipo cuando numeroSerie es válido (o ausente)', async () => {
    const { equipoRepo, txRunner, modeloRepo } = makeDeps();
    const useCase = new CrearEquipoUseCase(
      equipoRepo as never,
      txRunner as never,
      modeloRepo as never,
    );

    const result = await useCase.execute({
      nombre: 'Notebook A',
      numeroSerie: null,
      marca: null,
      modelo: null,
      fechaAdquisicion: null,
      ubicacion: null,
    });

    expect(result.isOk()).toBe(true);
    expect(equipoRepo.save).toHaveBeenCalledTimes(1);
  });

  it('falla con NumeroSerieDuplicadoError si ya existe otro equipo con el mismo numeroSerie', async () => {
    const equipoExistente = EquipoInformaticoEntity.create({
      nombre: 'Ya existe',
      numeroSerie: 'SN-DUP',
      marca: null,
      modelo: null,
      fechaAdquisicion: null,
      ubicacion: null,
      importe: null,
      fechaValoracion: null,
      observaciones: null,
      valorResidual: null,
      fechaValorResidual: null,
    });
    const { equipoRepo, txRunner, modeloRepo } = makeDeps({
      equipoRepo: {
        findByNumeroSerie: vi.fn().mockResolvedValue(equipoExistente),
        save: vi.fn(),
      },
    });
    const useCase = new CrearEquipoUseCase(
      equipoRepo as never,
      txRunner as never,
      modeloRepo as never,
    );

    const result = await useCase.execute({
      nombre: 'Notebook B',
      numeroSerie: 'SN-DUP',
      marca: null,
      modelo: null,
      fechaAdquisicion: null,
      ubicacion: null,
    });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(NumeroSerieDuplicadoError);
    expect(equipoRepo.save).not.toHaveBeenCalled();
  });

  it('crea el equipo (ubicacion es texto libre, no se valida)', async () => {
    const { equipoRepo, txRunner, modeloRepo } = makeDeps();
    const useCase = new CrearEquipoUseCase(
      equipoRepo as never,
      txRunner as never,
      modeloRepo as never,
    );

    const result = await useCase.execute({
      nombre: 'Notebook D',
      numeroSerie: null,
      marca: null,
      modelo: null,
      fechaAdquisicion: null,
      ubicacion: 'Piso 3',
    });

    expect(result.isOk()).toBe(true);
    // texto libre normalizado a mayúscula por la entidad, sin lookup de catálogo.
    expect(result.getValue().ubicacion).toBe('PISO 3');
    expect(equipoRepo.save).toHaveBeenCalledTimes(1);
  });

  /** El alta sin modelo de catálogo —el clon armado en casa— sigue siendo válida. */
  it('deja modeloEquipoId en null cuando el alta no lo trae', async () => {
    const { equipoRepo, txRunner, modeloRepo } = makeDeps();
    const useCase = new CrearEquipoUseCase(
      equipoRepo as never,
      txRunner as never,
      modeloRepo as never,
    );

    const result = await useCase.execute({
      nombre: 'Clon armado en casa',
      numeroSerie: null,
      marca: null,
      modelo: null,
      fechaAdquisicion: null,
      ubicacion: null,
    });

    expect(result.getValue().modeloEquipoId).toBeNull();
  });

  /**
   * `modeloEquipoId` es una FK al catálogo `modelos_equipo`. Sin verificarlo
   * acá, un id inexistente llega a Prisma y vuelve como un 409 genérico que no
   * nombra el campo, y —peor— un modelo DESHABILITADO se asigna sin error
   * alguno: la FK no puede atraparlo porque la fila existe.
   */
  describe('modeloEquipoId — validación contra el catálogo', () => {
    const MODELO_ID = '01900000-0000-7000-8000-0000000000aa';

    function modeloEnCatalogo(activo: boolean): ModeloEquipoEntity {
      return ModeloEquipoEntity.create(
        { marca: 'HP', modelo: 'LaserJet Pro M404', activo },
        MODELO_ID,
      );
    }

    function ejecutar(modeloRepo: { findById: ReturnType<typeof vi.fn> }, equipoRepo: unknown) {
      const useCase = new CrearEquipoUseCase(
        equipoRepo as never,
        { run: vi.fn((fn: () => Promise<unknown>) => fn()) } as never,
        modeloRepo as never,
      );
      return useCase.execute({
        nombre: 'Impresora del catálogo',
        numeroSerie: null,
        marca: null,
        modelo: null,
        fechaAdquisicion: null,
        ubicacion: null,
        modeloEquipoId: MODELO_ID,
      });
    }

    /**
     * Hermano invertido del caso deshabilitado: sin este, un guard que rechace
     * TODO modelo quedaría verde y el catálogo sería inutilizable.
     */
    it('crea el equipo y le asigna el modelo cuando existe y está ACTIVO', async () => {
      const { equipoRepo } = makeDeps();
      const modeloRepo = { findById: vi.fn().mockResolvedValue(modeloEnCatalogo(true)) };

      const result = await ejecutar(modeloRepo, equipoRepo);

      expect(result.isOk()).toBe(true);
      expect(result.getValue().modeloEquipoId).toBe(MODELO_ID);
      expect(equipoRepo.save).toHaveBeenCalledTimes(1);
    });

    it('falla con ModeloEquipoInexistenteError cuando el id no está en el catálogo', async () => {
      const { equipoRepo } = makeDeps();
      const modeloRepo = { findById: vi.fn().mockResolvedValue(null) };

      const result = await ejecutar(modeloRepo, equipoRepo);

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(ModeloEquipoInexistenteError);
      expect(result.getError().code).toBe('MODELO_EQUIPO_INEXISTENTE');
      // El mensaje nombra el campo: sin eso el usuario no sabe qué corregir.
      expect(result.getError().message).toContain('modeloEquipoId');
      expect(equipoRepo.save).not.toHaveBeenCalled();
    });

    /**
     * El caso que la FK NO puede atrapar: la fila existe, así que sin este
     * chequeo el alta guarda un modelo deshabilitado en silencio y contradice
     * la regla del catálogo (deshabilitar = no se puede elegir más).
     */
    it('falla con ModeloEquipoDeshabilitadoError cuando el modelo existe pero está deshabilitado', async () => {
      const { equipoRepo } = makeDeps();
      const modeloRepo = { findById: vi.fn().mockResolvedValue(modeloEnCatalogo(false)) };

      const result = await ejecutar(modeloRepo, equipoRepo);

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(ModeloEquipoDeshabilitadoError);
      expect(result.getError().code).toBe('MODELO_EQUIPO_DESHABILITADO');
      // Distinguir los dos casos es el punto: un solo error para ambos deja al
      // usuario sin saber si el id está mal o si el modelo hay que habilitarlo.
      expect(result.getError()).not.toBeInstanceOf(ModeloEquipoInexistenteError);
      expect(result.getError().message).toContain('modeloEquipoId');
      expect(equipoRepo.save).not.toHaveBeenCalled();
    });

    /** Un modelo con baja lógica tampoco es elegible, aunque la fila siga en la tabla. */
    it('falla con ModeloEquipoInexistenteError cuando el modelo tiene baja lógica', async () => {
      const { equipoRepo } = makeDeps();
      const modeloBorrado = ModeloEquipoEntity.reconstitute(
        { marca: 'HP', modelo: 'LaserJet Pro M404', activo: true },
        MODELO_ID,
        new Date(),
        new Date(),
        new Date(),
      );
      const modeloRepo = { findById: vi.fn().mockResolvedValue(modeloBorrado) };

      const result = await ejecutar(modeloRepo, equipoRepo);

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(ModeloEquipoInexistenteError);
      expect(equipoRepo.save).not.toHaveBeenCalled();
    });

    /** El alta sin modelo no debe pagar un viaje al catálogo. */
    it('no consulta el catálogo cuando el alta no trae modeloEquipoId', async () => {
      const { equipoRepo, txRunner, modeloRepo } = makeDeps();
      const useCase = new CrearEquipoUseCase(
        equipoRepo as never,
        txRunner as never,
        modeloRepo as never,
      );

      await useCase.execute({
        nombre: 'Clon armado en casa',
        numeroSerie: null,
        marca: null,
        modelo: null,
        fechaAdquisicion: null,
        ubicacion: null,
        modeloEquipoId: null,
      });

      expect(modeloRepo.findById).not.toHaveBeenCalled();
    });
  });
});
