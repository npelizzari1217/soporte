import { describe, expect, it, vi } from 'vitest';
import { CrearInsumoUseCase } from './crear-insumo.use-case';
import { FamiliaInsumoEntity } from '../../domain/entities/familia-insumo.entity';
import { UnidadMedidaEntity } from '../../domain/entities/unidad-medida.entity';
import { InsumoEntity } from '../../domain/entities/insumo.entity';
import { InsumoCodigoAlternativoEntity } from '../../domain/entities/insumo-codigo-alternativo.entity';
import { IInsumoRepository } from '../../domain/ports/i-insumo.repository';

describe('CrearInsumoUseCase', () => {
  type InsumoRepoMock = Pick<
    IInsumoRepository,
    'findByCodigo' | 'findConflictosDeCodigoAlternativo' | 'save'
  >;

  function buildInsumoRepo(overrides: Partial<InsumoRepoMock> = {}) {
    return {
      findByCodigo: vi.fn().mockResolvedValue(null),
      findConflictosDeCodigoAlternativo: vi.fn().mockResolvedValue([]),
      save: vi.fn().mockResolvedValue(undefined),
      ...overrides,
    };
  }

  function familiaHabilitada(): FamiliaInsumoEntity {
    return FamiliaInsumoEntity.create({ codigo: 'TONER', nombre: 'Tóner', activo: true }, 'fam-1');
  }

  function unidadHabilitada(): UnidadMedidaEntity {
    return UnidadMedidaEntity.create({ codigo: 'UN', nombre: 'Unidad', activo: true }, 'uni-1');
  }

  function buildFamiliaRepo(familia: FamiliaInsumoEntity | null = familiaHabilitada()) {
    return { findById: vi.fn().mockResolvedValue(familia) };
  }

  function buildUnidadRepo(unidad: UnidadMedidaEntity | null = unidadHabilitada()) {
    return { findById: vi.fn().mockResolvedValue(unidad) };
  }

  const dtoBase = {
    codigo: 'TON-001',
    nombre: 'Tóner negro',
    familiaId: 'fam-1',
    unidadMedidaId: 'uni-1',
  };

  // ─── Camino feliz: el hermano invertido de todos los rechazos de abajo ────

  it('crea el insumo cuando la familia y la unidad están habilitadas', async () => {
    const insumoRepo = buildInsumoRepo();
    const useCase = new CrearInsumoUseCase(insumoRepo, buildFamiliaRepo(), buildUnidadRepo());

    const result = await useCase.execute(dtoBase);

    expect(result.isOk()).toBe(true);
    expect(result.getValue().codigo).toBe('TON-001');
    expect(result.getValue().activo).toBe(true);
    expect(insumoRepo.save).toHaveBeenCalledTimes(1);
  });

  it('deja el stock mínimo en null cuando el alta no lo trae', async () => {
    const useCase = new CrearInsumoUseCase(
      buildInsumoRepo(),
      buildFamiliaRepo(),
      buildUnidadRepo(),
    );

    const result = await useCase.execute(dtoBase);

    expect(result.getValue().stockMinimo).toBeNull();
  });

  it('conserva el stock mínimo provisto', async () => {
    const useCase = new CrearInsumoUseCase(
      buildInsumoRepo(),
      buildFamiliaRepo(),
      buildUnidadRepo(),
    );

    const result = await useCase.execute({ ...dtoBase, stockMinimo: 12.5 });

    expect(result.getValue().stockMinimo).toBe(12.5);
  });

  // ─── Normalización ────────────────────────────────────────────────────────

  /**
   * `insumos.codigo` es UNIQUE case-sensitive: sin normalizar acá, `ton-001` y
   * `TON-001` entrarían como dos insumos distintos.
   */
  it('normaliza el código a mayúscula y recorta el nombre antes de persistir', async () => {
    const useCase = new CrearInsumoUseCase(
      buildInsumoRepo(),
      buildFamiliaRepo(),
      buildUnidadRepo(),
    );

    const result = await useCase.execute({
      ...dtoBase,
      codigo: '  ton-001  ',
      nombre: '  Tóner negro  ',
    });

    expect(result.getValue().codigo).toBe('TON-001');
    expect(result.getValue().nombre).toBe('Tóner negro');
  });

  /** El índice es case-sensitive, así que la búsqueda tiene que ir normalizada. */
  it('busca el duplicado con el código YA normalizado', async () => {
    const insumoRepo = buildInsumoRepo();
    const useCase = new CrearInsumoUseCase(insumoRepo, buildFamiliaRepo(), buildUnidadRepo());

    await useCase.execute({ ...dtoBase, codigo: ' ton-001 ' });

    expect(insumoRepo.findByCodigo).toHaveBeenCalledWith('TON-001');
  });

  // ─── Existe ≠ es elegible ─────────────────────────────────────────────────

  it('rechaza con FAMILIA_INSUMO_INEXISTENTE si la familia no está en el catálogo', async () => {
    const insumoRepo = buildInsumoRepo();
    const useCase = new CrearInsumoUseCase(insumoRepo, buildFamiliaRepo(null), buildUnidadRepo());

    const result = await useCase.execute(dtoBase);

    expect(result.isFail()).toBe(true);
    expect(result.getError().code).toBe('FAMILIA_INSUMO_INEXISTENTE');
    expect(insumoRepo.save).not.toHaveBeenCalled();
  });

  /**
   * La FK no puede atrapar este caso: la fila EXISTE. Si la aplicación no lo
   * distingue, el insumo entra apuntando a una familia que el administrador ya
   * sacó de circulación.
   */
  it('rechaza con FAMILIA_INSUMO_DESHABILITADA si la familia existe pero está deshabilitada', async () => {
    const familia = familiaHabilitada();
    familia.desactivar();
    const useCase = new CrearInsumoUseCase(
      buildInsumoRepo(),
      buildFamiliaRepo(familia),
      buildUnidadRepo(),
    );

    const result = await useCase.execute(dtoBase);

    expect(result.isFail()).toBe(true);
    expect(result.getError().code).toBe('FAMILIA_INSUMO_DESHABILITADA');
  });

  /**
   * `findById` no filtra por `deletedAt`, así que la fila con baja lógica
   * vuelve igual. Elegir una familia dada de baja no es una opción distinta de
   * elegir una que nunca existió.
   */
  it('trata la familia con baja lógica como inexistente', async () => {
    const familia = familiaHabilitada();
    familia.softDelete();
    const useCase = new CrearInsumoUseCase(
      buildInsumoRepo(),
      buildFamiliaRepo(familia),
      buildUnidadRepo(),
    );

    const result = await useCase.execute(dtoBase);

    expect(result.getError().code).toBe('FAMILIA_INSUMO_INEXISTENTE');
  });

  it('rechaza con UNIDAD_MEDIDA_INEXISTENTE si la unidad no está en el catálogo', async () => {
    const insumoRepo = buildInsumoRepo();
    const useCase = new CrearInsumoUseCase(insumoRepo, buildFamiliaRepo(), buildUnidadRepo(null));

    const result = await useCase.execute(dtoBase);

    expect(result.isFail()).toBe(true);
    expect(result.getError().code).toBe('UNIDAD_MEDIDA_INEXISTENTE');
    expect(insumoRepo.save).not.toHaveBeenCalled();
  });

  it('rechaza con UNIDAD_MEDIDA_DESHABILITADA si la unidad existe pero está deshabilitada', async () => {
    const unidad = unidadHabilitada();
    unidad.desactivar();
    const useCase = new CrearInsumoUseCase(
      buildInsumoRepo(),
      buildFamiliaRepo(),
      buildUnidadRepo(unidad),
    );

    const result = await useCase.execute(dtoBase);

    expect(result.isFail()).toBe(true);
    expect(result.getError().code).toBe('UNIDAD_MEDIDA_DESHABILITADA');
  });

  it('trata la unidad con baja lógica como inexistente', async () => {
    const unidad = unidadHabilitada();
    unidad.softDelete();
    const useCase = new CrearInsumoUseCase(
      buildInsumoRepo(),
      buildFamiliaRepo(),
      buildUnidadRepo(unidad),
    );

    const result = await useCase.execute(dtoBase);

    expect(result.getError().code).toBe('UNIDAD_MEDIDA_INEXISTENTE');
  });

  // ─── Código único ─────────────────────────────────────────────────────────

  /**
   * `insumos_codigo_key` NO es parcial: el código sigue tomado aunque el
   * insumo que lo ocupa esté deshabilitado.
   */
  it('rechaza con INSUMO_CODIGO_DUPLICADO aunque el insumo que ocupa el código esté deshabilitado', async () => {
    const ocupante = InsumoEntity.create({
      codigo: 'TON-001',
      nombre: 'Tóner viejo',
      familiaId: 'fam-1',
      unidadMedidaId: 'uni-1',
      stockMinimo: null,
      activo: false,
      codigosAlternativos: [],
      compatibilidad: [],
    });
    const insumoRepo = buildInsumoRepo({ findByCodigo: vi.fn().mockResolvedValue(ocupante) });
    const useCase = new CrearInsumoUseCase(insumoRepo, buildFamiliaRepo(), buildUnidadRepo());

    const result = await useCase.execute(dtoBase);

    expect(result.isFail()).toBe(true);
    expect(result.getError().code).toBe('INSUMO_CODIGO_DUPLICADO');
    expect(insumoRepo.save).not.toHaveBeenCalled();
  });

  // ─── Orden de validación ──────────────────────────────────────────────────

  /**
   * El orden es contrato, no casualidad. Sin fijarlo, la primera refactorización
   * lo reordena y el usuario recibe el error de un campo que ya corrigió.
   */
  it('con familia inexistente Y código duplicado gana el error de la familia', async () => {
    const ocupante = InsumoEntity.create({
      codigo: 'TON-001',
      nombre: 'Tóner viejo',
      familiaId: 'fam-1',
      unidadMedidaId: 'uni-1',
      stockMinimo: null,
      activo: true,
      codigosAlternativos: [],
      compatibilidad: [],
    });
    const insumoRepo = buildInsumoRepo({ findByCodigo: vi.fn().mockResolvedValue(ocupante) });
    const useCase = new CrearInsumoUseCase(insumoRepo, buildFamiliaRepo(null), buildUnidadRepo());

    const result = await useCase.execute(dtoBase);

    expect(result.getError().code).toBe('FAMILIA_INSUMO_INEXISTENTE');
    expect(insumoRepo.findByCodigo).not.toHaveBeenCalled();
  });

  it('con unidad inexistente Y código duplicado gana el error de la unidad', async () => {
    const ocupante = InsumoEntity.create({
      codigo: 'TON-001',
      nombre: 'Tóner viejo',
      familiaId: 'fam-1',
      unidadMedidaId: 'uni-1',
      stockMinimo: null,
      activo: true,
      codigosAlternativos: [],
      compatibilidad: [],
    });
    const insumoRepo = buildInsumoRepo({ findByCodigo: vi.fn().mockResolvedValue(ocupante) });
    const useCase = new CrearInsumoUseCase(insumoRepo, buildFamiliaRepo(), buildUnidadRepo(null));

    const result = await useCase.execute(dtoBase);

    expect(result.getError().code).toBe('UNIDAD_MEDIDA_INEXISTENTE');
    expect(insumoRepo.findByCodigo).not.toHaveBeenCalled();
  });

  it('con la familia deshabilitada Y un código alternativo repetido gana el error de la familia', async () => {
    const familia = familiaHabilitada();
    familia.desactivar();
    const insumoRepo = buildInsumoRepo();
    const useCase = new CrearInsumoUseCase(
      insumoRepo,
      buildFamiliaRepo(familia),
      buildUnidadRepo(),
    );

    const result = await useCase.execute({
      ...dtoBase,
      codigosAlternativos: [{ codigo: 'CE285A' }, { codigo: 'CE285A' }],
    });

    expect(result.getError().code).toBe('FAMILIA_INSUMO_DESHABILITADA');
    expect(insumoRepo.findConflictosDeCodigoAlternativo).not.toHaveBeenCalled();
  });

  // ─── Códigos alternativos: normalización ──────────────────────────────────

  it('normaliza código y fabricante de los códigos alternativos', async () => {
    const useCase = new CrearInsumoUseCase(
      buildInsumoRepo(),
      buildFamiliaRepo(),
      buildUnidadRepo(),
    );

    const result = await useCase.execute({
      ...dtoBase,
      codigosAlternativos: [{ codigo: ' ce285a ', fabricante: ' hp ' }],
    });

    const codigos = result.getValue().codigosAlternativos;
    expect(codigos).toHaveLength(1);
    expect(codigos[0]!.codigo).toBe('CE285A');
    expect(codigos[0]!.fabricante).toBe('HP');
  });

  /**
   * El UNIQUE está declarado `NULLS NOT DISTINCT`, pero para Postgres `''` y
   * `NULL` siguen siendo valores distintos: sin colapsar el vacío, el mismo
   * código genérico entra dos veces.
   */
  it('colapsa a null el fabricante vacío o de solo espacios', async () => {
    const useCase = new CrearInsumoUseCase(
      buildInsumoRepo(),
      buildFamiliaRepo(),
      buildUnidadRepo(),
    );

    const result = await useCase.execute({
      ...dtoBase,
      codigosAlternativos: [
        { codigo: 'A-1', fabricante: '' },
        { codigo: 'A-2', fabricante: '   ' },
        { codigo: 'A-3', fabricante: null },
        { codigo: 'A-4' },
      ],
    });

    expect(result.getValue().codigosAlternativos.map((c) => c.fabricante)).toEqual([
      null,
      null,
      null,
      null,
    ]);
  });

  it('consulta el conflicto global con los pares YA normalizados', async () => {
    const insumoRepo = buildInsumoRepo();
    const useCase = new CrearInsumoUseCase(insumoRepo, buildFamiliaRepo(), buildUnidadRepo());

    await useCase.execute({
      ...dtoBase,
      codigosAlternativos: [{ codigo: ' ce285a ', fabricante: ' hp ' }, { codigo: 'q2612a' }],
    });

    expect(insumoRepo.findConflictosDeCodigoAlternativo).toHaveBeenCalledWith(
      [
        { codigo: 'CE285A', fabricante: 'HP' },
        { codigo: 'Q2612A', fabricante: null },
      ],
      undefined,
    );
  });

  // ─── Códigos alternativos: duplicado DENTRO del payload ───────────────────

  it('rechaza con CODIGO_ALTERNATIVO_DUPLICADO el par repetido dentro del payload', async () => {
    const insumoRepo = buildInsumoRepo();
    const useCase = new CrearInsumoUseCase(insumoRepo, buildFamiliaRepo(), buildUnidadRepo());

    const result = await useCase.execute({
      ...dtoBase,
      codigosAlternativos: [
        { codigo: 'CE285A', fabricante: 'HP' },
        { codigo: ' ce285a ', fabricante: ' hp ' },
      ],
    });

    expect(result.isFail()).toBe(true);
    expect(result.getError().code).toBe('CODIGO_ALTERNATIVO_DUPLICADO');
    expect(insumoRepo.save).not.toHaveBeenCalled();
  });

  /**
   * `''`, `'   '`, `null` y `undefined` colapsan todos a `null`, así que estos
   * dos son el MISMO par y tienen que chocar.
   */
  it('detecta el duplicado interno entre el fabricante ausente y el fabricante vacío', async () => {
    const useCase = new CrearInsumoUseCase(
      buildInsumoRepo(),
      buildFamiliaRepo(),
      buildUnidadRepo(),
    );

    const result = await useCase.execute({
      ...dtoBase,
      codigosAlternativos: [{ codigo: 'X-1' }, { codigo: 'x-1', fabricante: '' }],
    });

    expect(result.isFail()).toBe(true);
    expect(result.getError().code).toBe('CODIGO_ALTERNATIVO_DUPLICADO');
  });

  /** Hermano invertido: el mismo código de dos fabricantes distintos convive. */
  it('acepta el mismo código con fabricantes distintos', async () => {
    const useCase = new CrearInsumoUseCase(
      buildInsumoRepo(),
      buildFamiliaRepo(),
      buildUnidadRepo(),
    );

    const result = await useCase.execute({
      ...dtoBase,
      codigosAlternativos: [
        { codigo: 'CE285A', fabricante: 'HP' },
        { codigo: 'CE285A', fabricante: 'GENERICO' },
      ],
    });

    expect(result.isOk()).toBe(true);
    expect(result.getValue().codigosAlternativos).toHaveLength(2);
  });

  /**
   * El duplicado interno se resuelve sin ir a la base. El mock del repo SÍ
   * devuelve un conflicto acá: si el orden se invirtiera, el error sería el del
   * conflicto global y este assert de ausencia se pondría rojo.
   */
  it('resuelve el duplicado interno sin consultar el conflicto global', async () => {
    const insumoRepo = buildInsumoRepo({
      findConflictosDeCodigoAlternativo: vi
        .fn()
        .mockResolvedValue([{ codigo: 'Z-9', fabricante: null, insumoId: 'otro' }]),
    });
    const useCase = new CrearInsumoUseCase(insumoRepo, buildFamiliaRepo(), buildUnidadRepo());

    const result = await useCase.execute({
      ...dtoBase,
      codigosAlternativos: [{ codigo: 'CE285A' }, { codigo: 'CE285A' }],
    });

    expect(result.getError().code).toBe('CODIGO_ALTERNATIVO_DUPLICADO');
    expect(insumoRepo.findConflictosDeCodigoAlternativo).not.toHaveBeenCalled();
  });

  // ─── Códigos alternativos: conflicto global ───────────────────────────────

  it('rechaza con CODIGO_ALTERNATIVO_DUPLICADO el par que ya pertenece a otro insumo', async () => {
    const insumoRepo = buildInsumoRepo({
      findConflictosDeCodigoAlternativo: vi
        .fn()
        .mockResolvedValue([{ codigo: 'CE285A', fabricante: 'HP', insumoId: 'otro-insumo' }]),
    });
    const useCase = new CrearInsumoUseCase(insumoRepo, buildFamiliaRepo(), buildUnidadRepo());

    const result = await useCase.execute({
      ...dtoBase,
      codigosAlternativos: [{ codigo: 'CE285A', fabricante: 'HP' }],
    });

    expect(result.isFail()).toBe(true);
    expect(result.getError().code).toBe('CODIGO_ALTERNATIVO_DUPLICADO');
    expect(result.getError().message).toContain('HP');
    expect(insumoRepo.save).not.toHaveBeenCalled();
  });

  /**
   * Assert de ausencia con fixture CARGADO: este mismo mock devuelve un
   * conflicto en el test de arriba, así que el verde de acá viene de no haber
   * consultado, no de un fixture vacío.
   */
  it('no consulta el conflicto global cuando el alta no trae códigos alternativos', async () => {
    const insumoRepo = buildInsumoRepo({
      findConflictosDeCodigoAlternativo: vi
        .fn()
        .mockResolvedValue([{ codigo: 'CE285A', fabricante: 'HP', insumoId: 'otro-insumo' }]),
    });
    const useCase = new CrearInsumoUseCase(insumoRepo, buildFamiliaRepo(), buildUnidadRepo());

    const result = await useCase.execute(dtoBase);

    expect(result.isOk()).toBe(true);
    expect(result.getValue().codigosAlternativos).toEqual([]);
    expect(insumoRepo.findConflictosDeCodigoAlternativo).not.toHaveBeenCalled();
  });

  it('tampoco lo consulta cuando la lista viene vacía', async () => {
    const insumoRepo = buildInsumoRepo({
      findConflictosDeCodigoAlternativo: vi
        .fn()
        .mockResolvedValue([{ codigo: 'CE285A', fabricante: 'HP', insumoId: 'otro-insumo' }]),
    });
    const useCase = new CrearInsumoUseCase(insumoRepo, buildFamiliaRepo(), buildUnidadRepo());

    const result = await useCase.execute({ ...dtoBase, codigosAlternativos: [] });

    expect(result.isOk()).toBe(true);
    expect(insumoRepo.findConflictosDeCodigoAlternativo).not.toHaveBeenCalled();
  });

  it('persiste el agregado con sus códigos alternativos ya construidos', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const useCase = new CrearInsumoUseCase(
      buildInsumoRepo({ save }),
      buildFamiliaRepo(),
      buildUnidadRepo(),
    );

    await useCase.execute({
      ...dtoBase,
      codigosAlternativos: [{ codigo: 'CE285A', fabricante: 'HP' }],
    });

    const guardado = save.mock.calls[0]![0] as InsumoEntity;
    expect(guardado.codigosAlternativos[0]).toBeInstanceOf(InsumoCodigoAlternativoEntity);
    expect(guardado.codigosAlternativos[0]!.codigo).toBe('CE285A');
  });
});
