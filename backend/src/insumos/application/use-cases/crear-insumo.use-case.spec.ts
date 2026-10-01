import { describe, expect, it, vi } from 'vitest';
import { CrearInsumoUseCase } from './crear-insumo.use-case';
import { Result } from '../../../shared/domain/result';
import { ITenantTransactionRunner } from '../../../shared/infrastructure/persistence/tenant-transaction-runner';
import { FamiliaInsumoEntity } from '../../domain/entities/familia-insumo.entity';
import { UnidadMedidaEntity } from '../../domain/entities/unidad-medida.entity';
import { InsumoEntity } from '../../domain/entities/insumo.entity';
import { InsumoCodigoAlternativoEntity } from '../../domain/entities/insumo-codigo-alternativo.entity';
import { ModeloEquipoEntity } from '../../domain/entities/modelo-equipo.entity';
import { IInsumoRepository } from '../../domain/ports/i-insumo.repository';
import { SecuenciaCodigoInsumoAgotadaError } from '../../domain/errors/insumos.errors';
import { UnidadMedidaNoEnteraError } from '../../domain/errors/unidades-medida.errors';
import { NumeradorInsumo } from '../../domain/services/numerador-insumo.service';

describe('CrearInsumoUseCase', () => {
  type InsumoRepoMock = Pick<IInsumoRepository, 'findConflictosDeCodigoAlternativo' | 'save'>;

  function buildInsumoRepo(overrides: Partial<InsumoRepoMock> = {}) {
    return {
      findConflictosDeCodigoAlternativo: vi.fn().mockResolvedValue([]),
      save: vi.fn().mockResolvedValue(undefined),
      ...overrides,
    };
  }

  function familiaHabilitada(): FamiliaInsumoEntity {
    return FamiliaInsumoEntity.create({ codigo: 'TONER', nombre: 'Tóner', activo: true }, 'fam-1');
  }

  /** Familia de repuestos (`esRepuesto: true`), para la serie `REP-####`. */
  function familiaDeRepuestos(): FamiliaInsumoEntity {
    return FamiliaInsumoEntity.create(
      { codigo: 'CPU', nombre: 'CPU', activo: true, esRepuesto: true },
      'fam-1',
    );
  }

  function unidadHabilitada(): UnidadMedidaEntity {
    return UnidadMedidaEntity.create({ codigo: 'UN', nombre: 'Unidad', activo: true }, 'uni-1');
  }

  function buildFamiliaRepo(familia: FamiliaInsumoEntity | null = familiaHabilitada()) {
    return { findById: vi.fn().mockResolvedValue(familia) };
  }

  function buildUnidadRepo(
    unidad: UnidadMedidaEntity | null = unidadHabilitada(),
    { entera = true }: { entera?: boolean } = {},
  ) {
    return {
      findById: vi.fn().mockResolvedValue(unidad),
      // L0 (ADR-12): la lectura `FOR SHARE` que el alta toma siempre.
      leerParaUso: vi.fn().mockResolvedValue(unidad ? { entera } : null),
    };
  }

  /**
   * `NumeradorInsumo` falso: por default resuelve `INS-0001`. Los tests de
   * autogeneración pisan el mock para devolver otro código o un fallo.
   */
  function buildNumerador(
    overrides: Partial<Pick<NumeradorInsumo, 'generarCodigo'>> = {},
  ): Pick<NumeradorInsumo, 'generarCodigo'> {
    return {
      generarCodigo: vi
        .fn()
        .mockResolvedValue(Result.ok<string, SecuenciaCodigoInsumoAgotadaError>('INS-0001')),
      ...overrides,
    };
  }

  /**
   * Runner falso que ejecuta el callback DIRECTAMENTE, sin Prisma real —
   * mismo criterio que `crear-compra.use-case.spec.ts`. Escrito a mano y no
   * con `vi.fn()`: `Mock<...>` instancia el genérico de
   * `ITenantTransactionRunner.run` en `unknown` y no encaja en el `Pick` del
   * constructor sin un cast.
   */
  function buildTxRunner(): Pick<ITenantTransactionRunner, 'run'> {
    return {
      run: async <T>(fn: () => Promise<T>): Promise<T> => fn(),
    };
  }

  function modeloHabilitado(id: string): ModeloEquipoEntity {
    return ModeloEquipoEntity.create({ marca: 'HP', modelo: `M-${id}`, activo: true }, id);
  }

  /**
   * Catálogo de modelos que responde un modelo HABILITADO para CUALQUIER id,
   * salvo los que el caso declare en `porId`. Que el default sea elegible es lo
   * que hace que cada rechazo de abajo se lea como efecto de su excepción y no
   * de un catálogo que rechaza todo.
   */
  function buildModeloRepo(porId: Record<string, ModeloEquipoEntity | null> = {}) {
    return {
      findById: vi.fn((id: string): Promise<ModeloEquipoEntity | null> => {
        const declarado = porId[id];
        return Promise.resolve(declarado === undefined ? modeloHabilitado(id) : declarado);
      }),
    };
  }

  /**
   * Sin `codigo` (issue #166): `CrearInsumoDto` ya no lo declara, así que
   * ningún fixture de este archivo puede mandarlo. El código SIEMPRE sale del
   * numerador — `buildNumerador()` por default resuelve `INS-0001`.
   */
  const dtoBase = {
    nombre: 'Tóner negro',
    familiaId: 'fam-1',
    unidadMedidaId: 'uni-1',
  };

  // ─── Camino feliz: el hermano invertido de todos los rechazos de abajo ────

  it('crea el insumo cuando la familia y la unidad están habilitadas', async () => {
    const insumoRepo = buildInsumoRepo();
    const useCase = new CrearInsumoUseCase(
      insumoRepo,
      buildFamiliaRepo(),
      buildUnidadRepo(),
      buildModeloRepo(),
      buildNumerador(),
      buildTxRunner(),
    );

    const result = await useCase.execute(dtoBase);

    expect(result.isOk()).toBe(true);
    expect(result.getValue().codigo).toBe('INS-0001');
    expect(result.getValue().activo).toBe(true);
    expect(insumoRepo.save).toHaveBeenCalledTimes(1);
  });

  it('deja el stock mínimo en null cuando el alta no lo trae', async () => {
    const useCase = new CrearInsumoUseCase(
      buildInsumoRepo(),
      buildFamiliaRepo(),
      buildUnidadRepo(),
      buildModeloRepo(),
      buildNumerador(),
      buildTxRunner(),
    );

    const result = await useCase.execute(dtoBase);

    expect(result.getValue().stockMinimo).toBeNull();
  });

  it('conserva el stock mínimo provisto', async () => {
    const useCase = new CrearInsumoUseCase(
      buildInsumoRepo(),
      buildFamiliaRepo(),
      buildUnidadRepo(),
      buildModeloRepo(),
      buildNumerador(),
      buildTxRunner(),
    );

    const result = await useCase.execute({ ...dtoBase, stockMinimo: 12.5 });

    expect(result.getValue().stockMinimo).toBe(12.5);
  });

  // ─── Normalización ────────────────────────────────────────────────────────

  /** El nombre se recorta igual que siempre; el código no depende de él ni del input. */
  it('recorta el nombre antes de persistir', async () => {
    const useCase = new CrearInsumoUseCase(
      buildInsumoRepo(),
      buildFamiliaRepo(),
      buildUnidadRepo(),
      buildModeloRepo(),
      buildNumerador(),
      buildTxRunner(),
    );

    const result = await useCase.execute({
      ...dtoBase,
      nombre: '  Tóner negro  ',
    });

    expect(result.getValue().nombre).toBe('Tóner negro');
  });

  // ─── Existe ≠ es elegible ─────────────────────────────────────────────────

  it('rechaza con FAMILIA_INSUMO_INEXISTENTE si la familia no está en el catálogo', async () => {
    const insumoRepo = buildInsumoRepo();
    const useCase = new CrearInsumoUseCase(
      insumoRepo,
      buildFamiliaRepo(null),
      buildUnidadRepo(),
      buildModeloRepo(),
      buildNumerador(),
      buildTxRunner(),
    );

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
      buildModeloRepo(),
      buildNumerador(),
      buildTxRunner(),
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
      buildModeloRepo(),
      buildNumerador(),
      buildTxRunner(),
    );

    const result = await useCase.execute(dtoBase);

    expect(result.getError().code).toBe('FAMILIA_INSUMO_INEXISTENTE');
  });

  it('rechaza con UNIDAD_MEDIDA_INEXISTENTE si la unidad no está en el catálogo', async () => {
    const insumoRepo = buildInsumoRepo();
    const useCase = new CrearInsumoUseCase(
      insumoRepo,
      buildFamiliaRepo(),
      buildUnidadRepo(null),
      buildModeloRepo(),
      buildNumerador(),
      buildTxRunner(),
    );

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
      buildModeloRepo(),
      buildNumerador(),
      buildTxRunner(),
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
      buildModeloRepo(),
      buildNumerador(),
      buildTxRunner(),
    );

    const result = await useCase.execute(dtoBase);

    expect(result.getError().code).toBe('UNIDAD_MEDIDA_INEXISTENTE');
  });

  // ─── Código: SIEMPRE autogenerado, nunca del cliente (issue #166) ─────────

  /**
   * INVIERTE el test homónimo del #162 ("rechaza con INSUMO_CODIGO_DUPLICADO
   * aunque el insumo que ocupa el código esté deshabilitado"): antes, un
   * código a mano que colisionaba con uno existente rechazaba el alta. Ahora
   * el cliente NO ELIGE código, así que no hay colisión que evaluar — el
   * `findByCodigo` de la unicidad manual ni siquiera está en el `Pick` del
   * constructor. El insumo se crea igual, con el código que el numerador le
   * asigna.
   *
   * EL NOMBRE DICE LO QUE ESTE TEST PRUEBA, y no más: que el alta ya no
   * depende de la unicidad manual. NO ejercita "un código provisto por el
   * cliente", porque a esta altura eso dejó de ser expresable — `CrearInsumoDto`
   * ya no tiene `codigo`. Ese caso vive donde todavía es posible mandarlo: la
   * frontera del DTO (`insumos.dto.spec.ts`) y el e2e contra HTTP real. Un
   * título que prometa el caso del cliente acá sería cobertura falsa.
   */
  it('el alta ya no consulta la unicidad manual: se crea con el codigo del numerador', async () => {
    const useCase = new CrearInsumoUseCase(
      buildInsumoRepo(),
      buildFamiliaRepo(),
      buildUnidadRepo(),
      buildModeloRepo(),
      buildNumerador(),
      buildTxRunner(),
    );

    const result = await useCase.execute(dtoBase);

    expect(result.isOk()).toBe(true);
    expect(result.getValue().codigo).toBe('INS-0001');
  });

  // ─── Código autogenerado (issue #162) ──────────────────────────────────────

  const dtoSinCodigo = {
    nombre: 'Tóner negro',
    familiaId: 'fam-1',
    unidadMedidaId: 'uni-1',
  };

  /**
   * Camino feliz de la autogeneración: sin `codigo` en el alta, el use case
   * le pide el código al numerador y persiste lo que este devuelve — no
   * inventa el formato por su cuenta.
   */
  it('autogenera el código con el numerador cuando el alta no trae codigo', async () => {
    const insumoRepo = buildInsumoRepo();
    const numerador = buildNumerador({
      generarCodigo: vi
        .fn()
        .mockResolvedValue(Result.ok<string, SecuenciaCodigoInsumoAgotadaError>('INS-0007')),
    });
    const useCase = new CrearInsumoUseCase(
      insumoRepo,
      buildFamiliaRepo(),
      buildUnidadRepo(),
      buildModeloRepo(),
      numerador,
      buildTxRunner(),
    );

    const result = await useCase.execute(dtoSinCodigo);

    expect(result.isOk()).toBe(true);
    expect(result.getValue().codigo).toBe('INS-0007');
    expect(insumoRepo.save).toHaveBeenCalledTimes(1);
  });

  /**
   * `esRepuesto` de la familia decide la serie: `true` ⇒ `REP`. El use case
   * no lo infiere de nada más —ni del nombre ni del código—, así que este
   * test se pone rojo si alguien invierte el booleano al pasarlo al
   * numerador.
   */
  it('pide la serie REP al numerador cuando la familia es de repuestos', async () => {
    const numerador = buildNumerador({
      generarCodigo: vi
        .fn()
        .mockResolvedValue(Result.ok<string, SecuenciaCodigoInsumoAgotadaError>('REP-0001')),
    });
    const useCase = new CrearInsumoUseCase(
      buildInsumoRepo(),
      buildFamiliaRepo(familiaDeRepuestos()),
      buildUnidadRepo(),
      buildModeloRepo(),
      numerador,
      buildTxRunner(),
    );

    const result = await useCase.execute(dtoSinCodigo);

    expect(result.isOk()).toBe(true);
    expect(result.getValue().codigo).toBe('REP-0001');
    expect(numerador.generarCodigo).toHaveBeenCalledWith(true);
  });

  it('pide la serie INS al numerador cuando la familia NO es de repuestos', async () => {
    const numerador = buildNumerador();
    const useCase = new CrearInsumoUseCase(
      buildInsumoRepo(),
      buildFamiliaRepo(familiaHabilitada()),
      buildUnidadRepo(),
      buildModeloRepo(),
      numerador,
      buildTxRunner(),
    );

    await useCase.execute(dtoSinCodigo);

    expect(numerador.generarCodigo).toHaveBeenCalledWith(false);
  });

  /**
   * INVIERTE "usa el código provisto por el usuario y NO consulta al
   * numerador" (#162): ahí un código a mano se respetaba tal cual y el
   * numerador ni se llamaba. Issue #166 cierra esa puerta — `CrearInsumoDto`
   * ya no tiene campo `codigo`, así que no hay ningún valor que "usar": el
   * numerador SIEMPRE se consulta, sea cual sea el payload.
   */
  it('SIEMPRE consulta al numerador — ya no existe un código a mano que respetar', async () => {
    const numerador = buildNumerador();
    const useCase = new CrearInsumoUseCase(
      buildInsumoRepo(),
      buildFamiliaRepo(),
      buildUnidadRepo(),
      buildModeloRepo(),
      numerador,
      buildTxRunner(),
    );

    const result = await useCase.execute(dtoBase);

    expect(result.isOk()).toBe(true);
    expect(result.getValue().codigo).toBe('INS-0001');
    expect(numerador.generarCodigo).toHaveBeenCalledTimes(1);
  });

  /**
   * INVIERTE "abre la transacción para autogenerar, pero NO cuando el código
   * viene a mano" (#162): aquel test fijaba una asimetría —transacción solo
   * en el camino autogenerado— que dependía de que existiera un camino
   * manual. Issue #166 borra el camino manual: TODA alta abre la sección
   * crítica (numeración + persistencia) dentro de la misma transacción.
   */
  it('SIEMPRE abre la transacción — ya no existe un camino manual sin ella', async () => {
    let vecesAbierta = 0;
    const txRunner: Pick<ITenantTransactionRunner, 'run'> = {
      run: async <T>(fn: () => Promise<T>): Promise<T> => {
        vecesAbierta += 1;
        return fn();
      },
    };

    const useCase = new CrearInsumoUseCase(
      buildInsumoRepo(),
      buildFamiliaRepo(),
      buildUnidadRepo(),
      buildModeloRepo(),
      buildNumerador(),
      txRunner,
    );

    await useCase.execute(dtoSinCodigo);
    expect(vecesAbierta).toBe(1);

    await useCase.execute(dtoBase);
    expect(vecesAbierta).toBe(2);
  });

  /**
   * `SecuenciaCodigoInsumoAgotadaError` (serie agotada, > 9999) se propaga
   * como cualquier otro `Result.fail`, y NO persiste nada — mismo criterio
   * que `NumeradorCompraAgotadoError` en `CrearCompraUseCase`.
   */
  it('propaga el error del numerador cuando la serie está agotada, sin persistir nada', async () => {
    const error = new SecuenciaCodigoInsumoAgotadaError('INS');
    const insumoRepo = buildInsumoRepo();
    const numerador = buildNumerador({
      generarCodigo: vi.fn().mockResolvedValue(Result.fail(error)),
    });
    const useCase = new CrearInsumoUseCase(
      insumoRepo,
      buildFamiliaRepo(),
      buildUnidadRepo(),
      buildModeloRepo(),
      numerador,
      buildTxRunner(),
    );

    const result = await useCase.execute(dtoSinCodigo);

    expect(result.isFail()).toBe(true);
    expect(result.getError().code).toBe('SECUENCIA_CODIGO_INSUMO_AGOTADA');
    expect(insumoRepo.save).not.toHaveBeenCalled();
  });

  // ─── Orden de validación ──────────────────────────────────────────────────

  /**
   * Issue #166 quita dos casos de esta sección ("con familia/unidad
   * inexistente Y código duplicado gana el error de la familia/unidad"): el
   * alta ya no revalida un código contra el catálogo —`findByCodigo` ni
   * siquiera está en el `Pick` del constructor—, así que la colisión que esos
   * tests fijaban ya no es alcanzable desde `CrearInsumoUseCase`. El orden que
   * SÍ sigue vigente —familia y unidad antes que códigos alternativos y
   * compatibilidad— lo cubren los tests de abajo.
   */
  it('con la familia deshabilitada Y un código alternativo repetido gana el error de la familia', async () => {
    const familia = familiaHabilitada();
    familia.desactivar();
    const insumoRepo = buildInsumoRepo();
    const useCase = new CrearInsumoUseCase(
      insumoRepo,
      buildFamiliaRepo(familia),
      buildUnidadRepo(),
      buildModeloRepo(),
      buildNumerador(),
      buildTxRunner(),
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
      buildModeloRepo(),
      buildNumerador(),
      buildTxRunner(),
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
      buildModeloRepo(),
      buildNumerador(),
      buildTxRunner(),
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
    const useCase = new CrearInsumoUseCase(
      insumoRepo,
      buildFamiliaRepo(),
      buildUnidadRepo(),
      buildModeloRepo(),
      buildNumerador(),
      buildTxRunner(),
    );

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
    const useCase = new CrearInsumoUseCase(
      insumoRepo,
      buildFamiliaRepo(),
      buildUnidadRepo(),
      buildModeloRepo(),
      buildNumerador(),
      buildTxRunner(),
    );

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
      buildModeloRepo(),
      buildNumerador(),
      buildTxRunner(),
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
      buildModeloRepo(),
      buildNumerador(),
      buildTxRunner(),
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
    const useCase = new CrearInsumoUseCase(
      insumoRepo,
      buildFamiliaRepo(),
      buildUnidadRepo(),
      buildModeloRepo(),
      buildNumerador(),
      buildTxRunner(),
    );

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
    const useCase = new CrearInsumoUseCase(
      insumoRepo,
      buildFamiliaRepo(),
      buildUnidadRepo(),
      buildModeloRepo(),
      buildNumerador(),
      buildTxRunner(),
    );

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
    const useCase = new CrearInsumoUseCase(
      insumoRepo,
      buildFamiliaRepo(),
      buildUnidadRepo(),
      buildModeloRepo(),
      buildNumerador(),
      buildTxRunner(),
    );

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
    const useCase = new CrearInsumoUseCase(
      insumoRepo,
      buildFamiliaRepo(),
      buildUnidadRepo(),
      buildModeloRepo(),
      buildNumerador(),
      buildTxRunner(),
    );

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
      buildModeloRepo(),
      buildNumerador(),
      buildTxRunner(),
    );

    await useCase.execute({
      ...dtoBase,
      codigosAlternativos: [{ codigo: 'CE285A', fabricante: 'HP' }],
    });

    const guardado = save.mock.calls[0]![0] as InsumoEntity;
    expect(guardado.codigosAlternativos[0]).toBeInstanceOf(InsumoCodigoAlternativoEntity);
    expect(guardado.codigosAlternativos[0]!.codigo).toBe('CE285A');
  });

  // ─── Compatibilidad con modelos de equipo ─────────────────────────────────

  /**
   * Camino feliz de la compatibilidad, y hermano invertido de TODOS los
   * rechazos de modelo de abajo: sin él, un catálogo que rechazara cualquier id
   * dejaría toda esta sección en verde.
   */
  it('crea el insumo con la compatibilidad declarada cuando el modelo está habilitado', async () => {
    const useCase = new CrearInsumoUseCase(
      buildInsumoRepo(),
      buildFamiliaRepo(),
      buildUnidadRepo(),
      buildModeloRepo(),
      buildNumerador(),
      buildTxRunner(),
    );

    const result = await useCase.execute({
      ...dtoBase,
      compatibilidad: [{ modeloEquipoId: 'mod-1', rol: 'NEGRO' }],
    });

    expect(result.isOk()).toBe(true);
    expect(result.getValue().compatibilidad).toEqual([{ modeloEquipoId: 'mod-1', rol: 'NEGRO' }]);
  });

  /**
   * El rol se normaliza con la función del dominio: `''`, `'   '`, `null` y el
   * campo ausente colapsan todos a `null`. Sin el colapso, la columna guardaría
   * dos formas distintas de decir "sin rol".
   */
  it('normaliza el rol a mayúscula y colapsa a null el vacío, los espacios y el ausente', async () => {
    const useCase = new CrearInsumoUseCase(
      buildInsumoRepo(),
      buildFamiliaRepo(),
      buildUnidadRepo(),
      buildModeloRepo(),
      buildNumerador(),
      buildTxRunner(),
    );

    const result = await useCase.execute({
      ...dtoBase,
      compatibilidad: [
        { modeloEquipoId: 'mod-1', rol: '  cian  ' },
        { modeloEquipoId: 'mod-2', rol: '' },
        { modeloEquipoId: 'mod-3', rol: '   ' },
        { modeloEquipoId: 'mod-4', rol: null },
        { modeloEquipoId: 'mod-5' },
      ],
    });

    expect(result.getValue().compatibilidad.map((c) => c.rol)).toEqual([
      'CIAN',
      null,
      null,
      null,
      null,
    ]);
  });

  /** Hermano invertido del duplicado: dos modelos DISTINTOS conviven sin problema. */
  it('acepta dos modelos distintos con roles distintos', async () => {
    const useCase = new CrearInsumoUseCase(
      buildInsumoRepo(),
      buildFamiliaRepo(),
      buildUnidadRepo(),
      buildModeloRepo(),
      buildNumerador(),
      buildTxRunner(),
    );

    const result = await useCase.execute({
      ...dtoBase,
      compatibilidad: [
        { modeloEquipoId: 'mod-1', rol: 'NEGRO' },
        { modeloEquipoId: 'mod-2', rol: 'CIAN' },
      ],
    });

    expect(result.isOk()).toBe(true);
    expect(result.getValue().compatibilidad.map((c) => c.modeloEquipoId)).toEqual([
      'mod-1',
      'mod-2',
    ]);
  });

  it('rechaza con MODELO_EQUIPO_INEXISTENTE si el modelo no está en el catálogo', async () => {
    const insumoRepo = buildInsumoRepo();
    const useCase = new CrearInsumoUseCase(
      insumoRepo,
      buildFamiliaRepo(),
      buildUnidadRepo(),
      buildModeloRepo({ 'mod-9': null }),
      buildNumerador(),
      buildTxRunner(),
    );

    const result = await useCase.execute({
      ...dtoBase,
      compatibilidad: [{ modeloEquipoId: 'mod-9' }],
    });

    expect(result.isFail()).toBe(true);
    expect(result.getError().code).toBe('MODELO_EQUIPO_INEXISTENTE');
    expect(insumoRepo.save).not.toHaveBeenCalled();
  });

  /**
   * `findById` no filtra por `deletedAt`, así que la fila con baja lógica
   * vuelve igual. Elegir un modelo dado de baja no es una opción distinta de
   * elegir uno que nunca existió.
   */
  it('trata el modelo con baja lógica como inexistente', async () => {
    const modelo = modeloHabilitado('mod-1');
    modelo.softDelete();
    const useCase = new CrearInsumoUseCase(
      buildInsumoRepo(),
      buildFamiliaRepo(),
      buildUnidadRepo(),
      buildModeloRepo({ 'mod-1': modelo }),
      buildNumerador(),
      buildTxRunner(),
    );

    const result = await useCase.execute({
      ...dtoBase,
      compatibilidad: [{ modeloEquipoId: 'mod-1' }],
    });

    expect(result.getError().code).toBe('MODELO_EQUIPO_INEXISTENTE');
  });

  /**
   * La FK no puede atrapar este caso: la fila EXISTE. Sin el chequeo, el insumo
   * queda declarado compatible con un modelo que el administrador ya sacó de
   * circulación, sin error ni log.
   */
  it('rechaza con MODELO_EQUIPO_DESHABILITADO si el modelo existe pero está deshabilitado', async () => {
    const modelo = modeloHabilitado('mod-1');
    modelo.desactivar();
    const insumoRepo = buildInsumoRepo();
    const useCase = new CrearInsumoUseCase(
      insumoRepo,
      buildFamiliaRepo(),
      buildUnidadRepo(),
      buildModeloRepo({ 'mod-1': modelo }),
      buildNumerador(),
      buildTxRunner(),
    );

    const result = await useCase.execute({
      ...dtoBase,
      compatibilidad: [{ modeloEquipoId: 'mod-1' }],
    });

    expect(result.isFail()).toBe(true);
    expect(result.getError().code).toBe('MODELO_EQUIPO_DESHABILITADO');
    expect(insumoRepo.save).not.toHaveBeenCalled();
  });

  /**
   * La PK de `insumos_modelos_equipo` es el par `(insumo, modelo)`: sin este
   * guard las dos filas llegan al `create` anidado y mueren como violación de
   * la PK, que sale como un 500 crudo en vez del 422 que nombra el modelo.
   */
  it('rechaza con COMPATIBILIDAD_DUPLICADA el mismo modelo repetido en el payload', async () => {
    const insumoRepo = buildInsumoRepo();
    const useCase = new CrearInsumoUseCase(
      insumoRepo,
      buildFamiliaRepo(),
      buildUnidadRepo(),
      buildModeloRepo(),
      buildNumerador(),
      buildTxRunner(),
    );

    const result = await useCase.execute({
      ...dtoBase,
      compatibilidad: [
        { modeloEquipoId: 'mod-1', rol: 'NEGRO' },
        { modeloEquipoId: 'mod-1', rol: 'CIAN' },
      ],
    });

    expect(result.isFail()).toBe(true);
    expect(result.getError().code).toBe('COMPATIBILIDAD_DUPLICADA');
    expect(result.getError().message).toContain('mod-1');
    expect(insumoRepo.save).not.toHaveBeenCalled();
  });

  /**
   * Postgres normaliza el `uuid` a minúscula antes de comparar, así que estas
   * dos entradas son la MISMA fila para la PK. Comparando los strings crudos el
   * duplicado se escapa del guard y reaparece como el 500 que el guard existe
   * para evitar.
   */
  it('detecta el duplicado aunque el id del modelo venga con otra capitalización', async () => {
    const useCase = new CrearInsumoUseCase(
      buildInsumoRepo(),
      buildFamiliaRepo(),
      buildUnidadRepo(),
      buildModeloRepo(),
      buildNumerador(),
      buildTxRunner(),
    );

    const result = await useCase.execute({
      ...dtoBase,
      compatibilidad: [
        { modeloEquipoId: '9F1B0C2D-0000-4000-8000-000000000001' },
        { modeloEquipoId: '9f1b0c2d-0000-4000-8000-000000000001' },
      ],
    });

    expect(result.isFail()).toBe(true);
    expect(result.getError().code).toBe('COMPATIBILIDAD_DUPLICADA');
  });

  /**
   * El duplicado interno es un error de carga que no necesita una consulta para
   * diagnosticarse. El catálogo de este test SÍ tiene cargado el rechazo de
   * `mod-1` —es el mismo fixture que arriba devuelve `MODELO_EQUIPO_INEXISTENTE`—,
   * así que el verde de acá viene de no haber consultado, no de un mock inerte.
   */
  it('resuelve el duplicado interno sin consultar el catálogo de modelos', async () => {
    const modeloRepo = buildModeloRepo({ 'mod-1': null });
    const useCase = new CrearInsumoUseCase(
      buildInsumoRepo(),
      buildFamiliaRepo(),
      buildUnidadRepo(),
      modeloRepo,
      buildNumerador(),
      buildTxRunner(),
    );

    const result = await useCase.execute({
      ...dtoBase,
      compatibilidad: [{ modeloEquipoId: 'mod-1' }, { modeloEquipoId: 'mod-1' }],
    });

    expect(result.getError().code).toBe('COMPATIBILIDAD_DUPLICADA');
    expect(modeloRepo.findById).not.toHaveBeenCalled();
  });

  it('no consulta el catálogo de modelos cuando el alta no trae compatibilidad', async () => {
    const modeloRepo = buildModeloRepo({ 'mod-1': null });
    const useCase = new CrearInsumoUseCase(
      buildInsumoRepo(),
      buildFamiliaRepo(),
      buildUnidadRepo(),
      modeloRepo,
      buildNumerador(),
      buildTxRunner(),
    );

    const result = await useCase.execute(dtoBase);

    expect(result.isOk()).toBe(true);
    expect(result.getValue().compatibilidad).toEqual([]);
    expect(modeloRepo.findById).not.toHaveBeenCalled();
  });

  it('tampoco lo consulta cuando la lista de compatibilidad viene vacía', async () => {
    const modeloRepo = buildModeloRepo({ 'mod-1': null });
    const useCase = new CrearInsumoUseCase(
      buildInsumoRepo(),
      buildFamiliaRepo(),
      buildUnidadRepo(),
      modeloRepo,
      buildNumerador(),
      buildTxRunner(),
    );

    const result = await useCase.execute({ ...dtoBase, compatibilidad: [] });

    expect(result.isOk()).toBe(true);
    expect(result.getValue().compatibilidad).toEqual([]);
    expect(modeloRepo.findById).not.toHaveBeenCalled();
  });

  /**
   * La compatibilidad va ÚLTIMA en el orden de validación: un error de catálogo
   * hace irrelevante todo lo que sigue.
   */
  it('con la familia inexistente Y la compatibilidad duplicada gana el error de la familia', async () => {
    const modeloRepo = buildModeloRepo();
    const useCase = new CrearInsumoUseCase(
      buildInsumoRepo(),
      buildFamiliaRepo(null),
      buildUnidadRepo(),
      modeloRepo,
      buildNumerador(),
      buildTxRunner(),
    );

    const result = await useCase.execute({
      ...dtoBase,
      compatibilidad: [{ modeloEquipoId: 'mod-1' }, { modeloEquipoId: 'mod-1' }],
    });

    expect(result.getError().code).toBe('FAMILIA_INSUMO_INEXISTENTE');
    expect(modeloRepo.findById).not.toHaveBeenCalled();
  });

  it('con un código alternativo repetido Y la compatibilidad duplicada gana el error del código', async () => {
    const modeloRepo = buildModeloRepo();
    const useCase = new CrearInsumoUseCase(
      buildInsumoRepo(),
      buildFamiliaRepo(),
      buildUnidadRepo(),
      modeloRepo,
      buildNumerador(),
      buildTxRunner(),
    );

    const result = await useCase.execute({
      ...dtoBase,
      codigosAlternativos: [{ codigo: 'CE285A' }, { codigo: 'CE285A' }],
      compatibilidad: [{ modeloEquipoId: 'mod-1' }, { modeloEquipoId: 'mod-1' }],
    });

    expect(result.getError().code).toBe('CODIGO_ALTERNATIVO_DUPLICADO');
    expect(modeloRepo.findById).not.toHaveBeenCalled();
  });

  it('persiste el agregado con su compatibilidad ya normalizada', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const useCase = new CrearInsumoUseCase(
      buildInsumoRepo({ save }),
      buildFamiliaRepo(),
      buildUnidadRepo(),
      buildModeloRepo(),
      buildNumerador(),
      buildTxRunner(),
    );

    await useCase.execute({
      ...dtoBase,
      compatibilidad: [{ modeloEquipoId: 'mod-1', rol: ' negro ' }],
    });

    const guardado = save.mock.calls[0]![0] as InsumoEntity;
    expect(guardado.compatibilidad).toEqual([{ modeloEquipoId: 'mod-1', rol: 'NEGRO' }]);
  });

  // ─── Seguimiento y L0 (ADR-12) ────────────────────────────────────────────

  it('toma L0 (leerParaUso de la unidad elegida) antes de numerar, siempre', async () => {
    const orden: string[] = [];
    const unidadRepo = buildUnidadRepo();
    unidadRepo.leerParaUso.mockImplementation(async () => {
      orden.push('L0');
      return { entera: false };
    });
    const numerador = buildNumerador({
      generarCodigo: vi.fn(async () => {
        orden.push('LC');
        return Result.ok<string, SecuenciaCodigoInsumoAgotadaError>('INS-0001');
      }),
    });
    const useCase = new CrearInsumoUseCase(
      buildInsumoRepo(),
      buildFamiliaRepo(),
      unidadRepo,
      buildModeloRepo(),
      numerador,
      buildTxRunner(),
    );

    const result = await useCase.execute(dtoBase);

    expect(result.isOk()).toBe(true);
    expect(result.getValue().seguimiento).toBe('NINGUNO');
    expect(unidadRepo.leerParaUso).toHaveBeenCalledWith('uni-1');
    expect(orden).toEqual(['L0', 'LC']);
  });

  it('crea un insumo SERIE con unidad entera', async () => {
    const useCase = new CrearInsumoUseCase(
      buildInsumoRepo(),
      buildFamiliaRepo(),
      buildUnidadRepo(),
      buildModeloRepo(),
      buildNumerador(),
      buildTxRunner(),
    );

    const result = await useCase.execute({ ...dtoBase, seguimiento: 'SERIE' });

    expect(result.isOk()).toBe(true);
    expect(result.getValue().seguimiento).toBe('SERIE');
  });

  it('rechaza SERIE con unidad no entera: UnidadMedidaNoEnteraError, sin numerar ni guardar', async () => {
    const insumoRepo = buildInsumoRepo();
    const numerador = buildNumerador();
    const useCase = new CrearInsumoUseCase(
      insumoRepo,
      buildFamiliaRepo(),
      buildUnidadRepo(unidadHabilitada(), { entera: false }),
      buildModeloRepo(),
      numerador,
      buildTxRunner(),
    );

    const result = await useCase.execute({ ...dtoBase, seguimiento: 'SERIE' });

    expect(result.getError()).toBeInstanceOf(UnidadMedidaNoEnteraError);
    expect(numerador.generarCodigo).not.toHaveBeenCalled();
    expect(insumoRepo.save).not.toHaveBeenCalled();
  });
});
