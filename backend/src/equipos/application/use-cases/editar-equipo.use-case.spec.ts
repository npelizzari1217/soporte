import { describe, it, expect, vi } from 'vitest';
import { EditarEquipoUseCase } from './editar-equipo.use-case';
import { EquipoInformaticoEntity } from '../../domain/entities/equipo-informatico.entity';
import { ModeloEquipoEntity } from '../../../insumos/domain/entities/modelo-equipo.entity';
import {
  EquipoDadoDeBajaError,
  EquipoNoEncontradoError,
  ModeloEquipoDeshabilitadoError,
  ModeloEquipoInexistenteError,
  NumeroSerieDuplicadoError,
} from '../../domain/errors/equipos.errors';
import type { IEquipoInformaticoRepository } from '../../domain/ports/i-equipo-informatico.repository';
import type { IModeloEquipoRepository } from '../../../insumos/domain/ports/i-modelo-equipo.repository';
import {
  equipoDadoDeBaja,
  equipoVigente,
  txRunnerDeSpec,
} from '../../testing/equipos-unit.fixtures';

/**
 * T12.1 [U][RED] — EditarEquipoUseCase: numeroSerie duplicado →
 * NumeroSerieDuplicadoError; equipo inexistente → EquipoNoEncontradoError.
 * La ubicación es TEXTO LIBRE (no se valida) — el use case ya no inyecta
 * `ubicacionRepo`.
 *
 * baja-equipo-completo (R11, R8): la lectura es `bloquearParaModificar` dentro de la
 * transacción y un equipo dado de baja se rechaza sin guardar nada.
 *
 * Ref spec: sdd/flujos-especializados/spec F3-Q1.
 */
describe('EditarEquipoUseCase', () => {
  const makeEquipo = equipoVigente;

  type EquipoRepoFake = Pick<
    IEquipoInformaticoRepository,
    'bloquearParaModificar' | 'findByNumeroSerie' | 'save'
  >;

  /** Repo de equipos tipado: `bloquearParaModificar` devuelve el equipo dado y registra el orden. */
  function makeEquipoRepo(
    equipo: EquipoInformaticoEntity | null,
    extra: Partial<EquipoRepoFake> = {},
    llamadas: string[] = [],
  ) {
    return {
      bloquearParaModificar: vi.fn(async () => {
        llamadas.push('bloquearParaModificar');
        return equipo;
      }),
      findByNumeroSerie: vi.fn(async () => null),
      save: vi.fn(async () => {}),
      ...extra,
    } satisfies EquipoRepoFake;
  }

  function makeUseCase(
    equipoRepo: EquipoRepoFake,
    modeloRepo: Pick<IModeloEquipoRepository, 'findById'> = makeModeloRepo(),
    llamadas: string[] = [],
  ) {
    return new EditarEquipoUseCase(equipoRepo, txRunnerDeSpec(llamadas), modeloRepo);
  }

  /** Catálogo que nunca resuelve un modelo — los casos que no tocan `modeloEquipoId` no lo consultan. */
  function makeModeloRepo(modelo: ModeloEquipoEntity | null = null) {
    return { findById: vi.fn(async () => modelo) } satisfies Pick<
      IModeloEquipoRepository,
      'findById'
    >;
  }

  describe('guards del equipo (LE)', () => {
    it('falla con EquipoNoEncontradoError si el equipo no existe', async () => {
      const equipoRepo = makeEquipoRepo(null);
      const result = await makeUseCase(equipoRepo).execute({ equipoId: 'no-existe', nombre: 'X' });
      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(EquipoNoEncontradoError);
      expect(equipoRepo.save).not.toHaveBeenCalled();
    });

    it('falla con EquipoNoEncontradoError si el equipo tiene borrado lógico', async () => {
      const borrado = makeEquipo();
      borrado.softDelete();
      const equipoRepo = makeEquipoRepo(borrado);
      const result = await makeUseCase(equipoRepo).execute({ equipoId: borrado.id, nombre: 'X' });
      expect(result.getError()).toBeInstanceOf(EquipoNoEncontradoError);
      expect(equipoRepo.save).not.toHaveBeenCalled();
    });

    it('un equipo dado de baja falla con EquipoDadoDeBajaError y no guarda nada', async () => {
      const baja = equipoDadoDeBaja();
      const equipoRepo = makeEquipoRepo(baja);
      const result = await makeUseCase(equipoRepo).execute({ equipoId: baja.id, nombre: 'X' });
      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(EquipoDadoDeBajaError);
      expect(equipoRepo.save).not.toHaveBeenCalled();
      expect(baja.nombre).toBe('Original');
    });

    it('lee el equipo con bloquearParaModificar DENTRO de la transacción, antes de guardar', async () => {
      const llamadas: string[] = [];
      const equipo = makeEquipo();
      const equipoRepo = makeEquipoRepo(
        equipo,
        {
          save: vi.fn(async () => {
            llamadas.push('save');
          }),
        },
        llamadas,
      );

      await makeUseCase(equipoRepo, makeModeloRepo(), llamadas).execute({
        equipoId: equipo.id,
        nombre: 'Editado',
      });

      expect(llamadas).toEqual(['tx:inicio', 'bloquearParaModificar', 'save', 'tx:fin']);
    });
  });

  it('edita nombre/marca (PATCH semántico) y persiste', async () => {
    const equipo = makeEquipo();
    const equipoRepo = makeEquipoRepo(equipo);

    const result = await makeUseCase(equipoRepo).execute({
      equipoId: equipo.id,
      nombre: 'Editado',
    });
    expect(result.isOk()).toBe(true);
    expect(result.getValue().nombre).toBe('Editado');
    expect(equipoRepo.save).toHaveBeenCalledTimes(1);
  });

  it('falla con NumeroSerieDuplicadoError si el nuevo numeroSerie pertenece a OTRO equipo', async () => {
    const equipo = makeEquipo();
    const otroEquipoConEseSerie = makeEquipo({ numeroSerie: 'SN-OTRO' });
    const equipoRepo = makeEquipoRepo(equipo, {
      findByNumeroSerie: vi.fn(async () => otroEquipoConEseSerie),
    });

    const result = await makeUseCase(equipoRepo).execute({
      equipoId: equipo.id,
      numeroSerie: 'SN-OTRO',
    });
    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(NumeroSerieDuplicadoError);
    expect(equipoRepo.save).not.toHaveBeenCalled();
  });

  it('permite mantener el mismo numeroSerie del propio equipo (no es duplicado consigo mismo)', async () => {
    const equipo = makeEquipo({ numeroSerie: 'SN-MISMO' });
    const equipoRepo = makeEquipoRepo(equipo, { findByNumeroSerie: vi.fn(async () => equipo) });

    const result = await makeUseCase(equipoRepo).execute({
      equipoId: equipo.id,
      numeroSerie: 'SN-MISMO',
    });
    expect(result.isOk()).toBe(true);
  });

  /**
   * La carrera concurrente sobre el índice único parcial vuelve como P2002 y
   * tiene que salir como el mismo 422 de negocio que el chequeo previo, no
   * como un 500. El guardarraíl se decide por "el caller mandó numeroSerie",
   * que es `!== undefined`: con truthiness, un `numeroSerie: ''` —que el
   * chequeo previo SÍ consulta— re-lanzaba el P2002 y lo convertía en 500.
   */
  it('mapea P2002 a NumeroSerieDuplicadoError incluso con numeroSerie vacío', async () => {
    const equipo = makeEquipo({ numeroSerie: 'SN-ORIG' });
    const equipoRepo = makeEquipoRepo(equipo, {
      save: vi.fn().mockRejectedValue(Object.assign(new Error('unique'), { code: 'P2002' })),
    });

    const result = await makeUseCase(equipoRepo).execute({ equipoId: equipo.id, numeroSerie: '' });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(NumeroSerieDuplicadoError);
  });

  /**
   * `modeloEquipoId` es NULLABLE a propósito, así que el PATCH tiene que
   * distinguir las dos ausencias: `undefined` no toca el modelo asignado,
   * `null` lo desvincula. Colapsadas en una sola, editar el nombre de un equipo
   * le borraría el modelo de catálogo sin que nadie lo pida.
   */
  describe('modeloEquipoId — PATCH semántico', () => {
    const MODELO_ID = '01900000-0000-7000-8000-0000000000aa';
    const OTRO_MODELO_ID = '01900000-0000-7000-8000-0000000000bb';

    it('editar otro campo NO toca el modelo asignado', async () => {
      const equipo = makeEquipo({ modeloEquipoId: MODELO_ID });
      const modeloRepo = makeModeloRepo();
      const useCase = makeUseCase(makeEquipoRepo(equipo), modeloRepo);

      const result = await useCase.execute({ equipoId: equipo.id, nombre: 'Editado' });

      expect(result.getValue().modeloEquipoId).toBe(MODELO_ID);
      // `undefined` = "no lo toques": no hay nada que validar contra el catálogo.
      expect(modeloRepo.findById).not.toHaveBeenCalled();
    });

    it('reasigna el modelo cuando llega otro id ACTIVO del catálogo', async () => {
      const equipo = makeEquipo({ modeloEquipoId: MODELO_ID });
      const modeloActivo = ModeloEquipoEntity.create(
        { marca: 'BROTHER', modelo: 'HL-L2350DW', activo: true },
        OTRO_MODELO_ID,
      );
      const useCase = makeUseCase(makeEquipoRepo(equipo), makeModeloRepo(modeloActivo));

      const result = await useCase.execute({
        equipoId: equipo.id,
        modeloEquipoId: OTRO_MODELO_ID,
      });

      expect(result.isOk()).toBe(true);
      expect(result.getValue().modeloEquipoId).toBe(OTRO_MODELO_ID);
    });

    it('desvincula el modelo cuando llega null', async () => {
      const equipo = makeEquipo({ modeloEquipoId: MODELO_ID });
      const modeloRepo = makeModeloRepo();
      const useCase = makeUseCase(makeEquipoRepo(equipo), modeloRepo);

      const result = await useCase.execute({ equipoId: equipo.id, modeloEquipoId: null });

      expect(result.getValue().modeloEquipoId).toBeNull();
      // `null` = "desvinculalo": tampoco hay catálogo que consultar.
      expect(modeloRepo.findById).not.toHaveBeenCalled();
    });
  });

  /**
   * La edición tiene el mismo agujero que el alta: un id inexistente sale como
   * un 409 genérico de la FK y un modelo DESHABILITADO se asigna sin ruido
   * alguno, porque la fila existe y la FK la acepta.
   */
  describe('modeloEquipoId — validación contra el catálogo', () => {
    const MODELO_ID = '01900000-0000-7000-8000-0000000000aa';

    function ejecutar(modelo: ModeloEquipoEntity | null) {
      const equipo = makeEquipo();
      const equipoRepo = makeEquipoRepo(equipo);
      const useCase = makeUseCase(equipoRepo, makeModeloRepo(modelo));

      return {
        equipoRepo,
        promesa: useCase.execute({ equipoId: equipo.id, modeloEquipoId: MODELO_ID }),
      };
    }

    it('falla con ModeloEquipoInexistenteError cuando el id no está en el catálogo', async () => {
      const { equipoRepo, promesa } = ejecutar(null);

      const result = await promesa;

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(ModeloEquipoInexistenteError);
      expect(result.getError().code).toBe('MODELO_EQUIPO_INEXISTENTE');
      expect(result.getError().message).toContain('modeloEquipoId');
      expect(equipoRepo.save).not.toHaveBeenCalled();
    });

    /**
     * El caso que la FK NO puede atrapar: la fila existe. Sin este chequeo la
     * edición acepta el dato equivocado en silencio.
     */
    it('falla con ModeloEquipoDeshabilitadoError cuando el modelo está deshabilitado', async () => {
      const deshabilitado = ModeloEquipoEntity.create(
        { marca: 'HP', modelo: 'LaserJet Pro M404', activo: false },
        MODELO_ID,
      );
      const { equipoRepo, promesa } = ejecutar(deshabilitado);

      const result = await promesa;

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(ModeloEquipoDeshabilitadoError);
      expect(result.getError().code).toBe('MODELO_EQUIPO_DESHABILITADO');
      expect(result.getError()).not.toBeInstanceOf(ModeloEquipoInexistenteError);
      expect(result.getError().message).toContain('modeloEquipoId');
      expect(equipoRepo.save).not.toHaveBeenCalled();
    });

    /**
     * Hermano invertido: con un modelo ACTIVO la edición tiene que pasar. Sin
     * este caso, un guard que rechace TODO modelo quedaría verde.
     */
    it('edita y persiste cuando el modelo existe y está ACTIVO', async () => {
      const activo = ModeloEquipoEntity.create(
        { marca: 'HP', modelo: 'LaserJet Pro M404', activo: true },
        MODELO_ID,
      );
      const { equipoRepo, promesa } = ejecutar(activo);

      const result = await promesa;

      expect(result.isOk()).toBe(true);
      expect(result.getValue().modeloEquipoId).toBe(MODELO_ID);
      expect(equipoRepo.save).toHaveBeenCalledTimes(1);
    });

    it('falla con ModeloEquipoInexistenteError cuando el modelo tiene baja lógica', async () => {
      const borrado = ModeloEquipoEntity.reconstitute(
        { marca: 'HP', modelo: 'LaserJet Pro M404', activo: true },
        MODELO_ID,
        new Date(),
        new Date(),
        new Date(),
      );
      const { equipoRepo, promesa } = ejecutar(borrado);

      const result = await promesa;

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(ModeloEquipoInexistenteError);
      expect(equipoRepo.save).not.toHaveBeenCalled();
    });
  });
});
