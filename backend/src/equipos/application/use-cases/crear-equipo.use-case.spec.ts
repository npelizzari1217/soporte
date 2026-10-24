import { describe, it, expect, vi, type Mock } from 'vitest';
import { CrearEquipoUseCase } from './crear-equipo.use-case';
import { EquipoInformaticoEntity } from '../../domain/entities/equipo-informatico.entity';
import { ModeloEquipoEntity } from '../../../insumos/domain/entities/modelo-equipo.entity';
import {
  ModeloEquipoDeshabilitadoError,
  ModeloEquipoInexistenteError,
  NumeroSerieDuplicadoError,
} from '../../domain/errors/equipos.errors';
import type { IEquipoInformaticoRepository } from '../../domain/ports/i-equipo-informatico.repository';
import type { LectorCatalogoModelos } from '../services/validar-modelo-equipo.service';
import type { ITenantTransactionRunner } from '../../../shared/infrastructure/persistence/tenant-transaction-runner';
import type { IValoracionEquipoRepository } from '../../domain/ports/i-valoracion-equipo.repository';

const ACTOR = '01900000-0000-7000-8000-0000000000e2';

/**
 * T12.1 [U][RED] — CrearEquipoUseCase: numeroSerie duplicado →
 * NumeroSerieDuplicadoError. La ubicación pasó de FK (catálogo) a TEXTO LIBRE
 * — ya no se valida contra el catálogo, por eso el use case ya no inyecta
 * `ubicacionRepo` ni produce `UbicacionInvalidaError`.
 *
 * Ref spec: sdd/flujos-especializados/spec F3-Q1.
 */
describe('CrearEquipoUseCase', () => {
  type EquipoRepoDoble = {
    findByNumeroSerie: Mock<IEquipoInformaticoRepository['findByNumeroSerie']>;
    save: Mock<IEquipoInformaticoRepository['save']>;
  };

  /** Runner que ejecuta la unidad de trabajo en línea, sin transacción real. */
  function makeTxRunner(): ITenantTransactionRunner {
    return {
      run: async <T>(fn: () => Promise<T>): Promise<T> => fn(),
      alCommitear: (fn: () => void) => fn(),
    };
  }

  function makeDeps(overrides: { equipoRepo?: EquipoRepoDoble } = {}) {
    const equipoRepo: EquipoRepoDoble = overrides.equipoRepo ?? {
      findByNumeroSerie: vi
        .fn<IEquipoInformaticoRepository['findByNumeroSerie']>()
        .mockResolvedValue(null),
      save: vi.fn<IEquipoInformaticoRepository['save']>().mockResolvedValue(undefined),
    };
    const txRunner = makeTxRunner();
    const modeloRepo = {
      findById: vi.fn<LectorCatalogoModelos['findById']>().mockResolvedValue(null),
    };
    const valoracionRepo = {
      registrar: vi.fn<IValoracionEquipoRepository['registrar']>().mockResolvedValue(undefined),
    };
    return { equipoRepo, txRunner, modeloRepo, valoracionRepo };
  }

  it('crea el equipo cuando numeroSerie es válido (o ausente)', async () => {
    const { equipoRepo, txRunner, modeloRepo } = makeDeps();
    const useCase = new CrearEquipoUseCase(
      equipoRepo,
      txRunner,
      modeloRepo,
      makeDeps().valoracionRepo,
    );

    const result = await useCase.execute({
      usuarioId: ACTOR,
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
        findByNumeroSerie: vi
          .fn<IEquipoInformaticoRepository['findByNumeroSerie']>()
          .mockResolvedValue(equipoExistente),
        save: vi.fn<IEquipoInformaticoRepository['save']>(),
      },
    });
    const useCase = new CrearEquipoUseCase(
      equipoRepo,
      txRunner,
      modeloRepo,
      makeDeps().valoracionRepo,
    );

    const result = await useCase.execute({
      usuarioId: ACTOR,
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
      equipoRepo,
      txRunner,
      modeloRepo,
      makeDeps().valoracionRepo,
    );

    const result = await useCase.execute({
      usuarioId: ACTOR,
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
      equipoRepo,
      txRunner,
      modeloRepo,
      makeDeps().valoracionRepo,
    );

    const result = await useCase.execute({
      usuarioId: ACTOR,
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

    function ejecutar(modeloRepo: LectorCatalogoModelos, equipoRepo: EquipoRepoDoble) {
      const useCase = new CrearEquipoUseCase(
        equipoRepo,
        makeTxRunner(),
        modeloRepo,
        makeDeps().valoracionRepo,
      );
      return useCase.execute({
        usuarioId: ACTOR,
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
      const modeloRepo = {
        findById: vi
          .fn<LectorCatalogoModelos['findById']>()
          .mockResolvedValue(modeloEnCatalogo(true)),
      };

      const result = await ejecutar(modeloRepo, equipoRepo);

      expect(result.isOk()).toBe(true);
      expect(result.getValue().modeloEquipoId).toBe(MODELO_ID);
      expect(equipoRepo.save).toHaveBeenCalledTimes(1);
    });

    it('falla con ModeloEquipoInexistenteError cuando el id no está en el catálogo', async () => {
      const { equipoRepo } = makeDeps();
      const modeloRepo = {
        findById: vi.fn<LectorCatalogoModelos['findById']>().mockResolvedValue(null),
      };

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
      const modeloRepo = {
        findById: vi
          .fn<LectorCatalogoModelos['findById']>()
          .mockResolvedValue(modeloEnCatalogo(false)),
      };

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
      const modeloRepo = {
        findById: vi.fn<LectorCatalogoModelos['findById']>().mockResolvedValue(modeloBorrado),
      };

      const result = await ejecutar(modeloRepo, equipoRepo);

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(ModeloEquipoInexistenteError);
      expect(equipoRepo.save).not.toHaveBeenCalled();
    });

    /** El alta sin modelo no debe pagar un viaje al catálogo. */
    it('no consulta el catálogo cuando el alta no trae modeloEquipoId', async () => {
      const { equipoRepo, txRunner, modeloRepo } = makeDeps();
      const useCase = new CrearEquipoUseCase(
        equipoRepo,
        txRunner,
        modeloRepo,
        makeDeps().valoracionRepo,
      );

      await useCase.execute({
        usuarioId: ACTOR,
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

  /**
   * odd/tasks/historial-valor-residual.md (S2): el alta con valor residual y fecha arranca el
   * historial del equipo, dentro de la misma transacción del save y con el actor del POST.
   */
  describe('historial del valor residual', () => {
    const dia = (iso: string): Date => new Date(`${iso}T00:00:00.000Z`);
    const ALTA = {
      usuarioId: ACTOR,
      nombre: 'Notebook con valor',
      numeroSerie: null,
      marca: null,
      modelo: null,
      fechaAdquisicion: null,
      ubicacion: null,
      importe: 1000,
      fechaValoracion: dia('2026-10-01'),
    };

    it('registra la valoración del alta dentro de la transacción, después del save', async () => {
      const llamadas: string[] = [];
      const equipoRepo: EquipoRepoDoble = {
        findByNumeroSerie: vi
          .fn<IEquipoInformaticoRepository['findByNumeroSerie']>()
          .mockResolvedValue(null),
        save: vi.fn<IEquipoInformaticoRepository['save']>().mockImplementation(async () => {
          llamadas.push('save');
        }),
      };
      const valoracionRepo = {
        registrar: vi
          .fn<IValoracionEquipoRepository['registrar']>()
          .mockImplementation(async () => {
            llamadas.push('registrar');
          }),
      };
      const txRunner: ITenantTransactionRunner = {
        run: async <T>(fn: () => Promise<T>): Promise<T> => {
          llamadas.push('tx:inicio');
          const valor = await fn();
          llamadas.push('tx:fin');
          return valor;
        },
        alCommitear: (fn: () => void) => fn(),
      };
      const useCase = new CrearEquipoUseCase(
        equipoRepo,
        txRunner,
        makeDeps().modeloRepo,
        valoracionRepo,
      );

      const result = await useCase.execute({
        ...ALTA,
        valorResidual: 700,
        fechaValorResidual: dia('2026-10-24'),
      });

      expect(result.isOk()).toBe(true);
      expect(valoracionRepo.registrar).toHaveBeenCalledWith({
        equipoId: result.getValue().id,
        fecha: dia('2026-10-24'),
        importe: 700,
        usuarioId: ACTOR,
      });
      expect(llamadas).toEqual(['tx:inicio', 'save', 'registrar', 'tx:fin']);
    });

    it('no registra nada si el alta no trae valor residual, aunque traiga importe', async () => {
      const { equipoRepo, txRunner, modeloRepo, valoracionRepo } = makeDeps();
      const useCase = new CrearEquipoUseCase(equipoRepo, txRunner, modeloRepo, valoracionRepo);

      const result = await useCase.execute(ALTA);

      expect(result.isOk()).toBe(true);
      expect(valoracionRepo.registrar).not.toHaveBeenCalled();
    });

    it('no registra nada si el valor residual llega sin fecha', async () => {
      const { equipoRepo, txRunner, modeloRepo, valoracionRepo } = makeDeps();
      const useCase = new CrearEquipoUseCase(equipoRepo, txRunner, modeloRepo, valoracionRepo);

      await useCase.execute({ ...ALTA, valorResidual: 700, fechaValorResidual: null });

      expect(valoracionRepo.registrar).not.toHaveBeenCalled();
    });

    it('un numeroSerie duplicado no registra nada', async () => {
      const { txRunner, modeloRepo, valoracionRepo } = makeDeps();
      const equipoRepo: EquipoRepoDoble = {
        findByNumeroSerie: vi
          .fn<IEquipoInformaticoRepository['findByNumeroSerie']>()
          .mockResolvedValue(
            EquipoInformaticoEntity.create({
              ...ALTA,
              numeroSerie: 'SN-DUP',
              observaciones: null,
              valorResidual: null,
              fechaValorResidual: null,
            }),
          ),
        save: vi.fn<IEquipoInformaticoRepository['save']>(),
      };
      const useCase = new CrearEquipoUseCase(equipoRepo, txRunner, modeloRepo, valoracionRepo);

      const result = await useCase.execute({
        ...ALTA,
        numeroSerie: 'SN-DUP',
        valorResidual: 700,
        fechaValorResidual: dia('2026-10-24'),
      });

      expect(result.getError()).toBeInstanceOf(NumeroSerieDuplicadoError);
      expect(valoracionRepo.registrar).not.toHaveBeenCalled();
    });
  });
});
