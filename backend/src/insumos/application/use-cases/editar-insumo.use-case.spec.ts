import { describe, expect, it, vi } from 'vitest';
import { EditarInsumoUseCase } from './editar-insumo.use-case';
import { FamiliaInsumoEntity } from '../../domain/entities/familia-insumo.entity';
import { UnidadMedidaEntity } from '../../domain/entities/unidad-medida.entity';
import { InsumoEntity } from '../../domain/entities/insumo.entity';
import { InsumoCodigoAlternativoEntity } from '../../domain/entities/insumo-codigo-alternativo.entity';
import { CompatibilidadModelo } from '../../domain/entities/compatibilidad-modelo';
import { ModeloEquipoEntity } from '../../domain/entities/modelo-equipo.entity';
import { IInsumoRepository } from '../../domain/ports/i-insumo.repository';

describe('EditarInsumoUseCase', () => {
  type InsumoRepoMock = Pick<
    IInsumoRepository,
    'findById' | 'findConflictosDeCodigoAlternativo' | 'save'
  >;

  function buildInsumo(
    codigosAlternativos: InsumoCodigoAlternativoEntity[] = [],
    id = 'ins-1',
    compatibilidad: CompatibilidadModelo[] = [],
  ): InsumoEntity {
    return InsumoEntity.create(
      {
        codigo: 'TON-001',
        nombre: 'Tóner negro',
        familiaId: 'fam-1',
        unidadMedidaId: 'uni-1',
        stockMinimo: 5,
        activo: true,
        codigosAlternativos,
        compatibilidad,
      },
      id,
    );
  }

  function buildInsumoRepo(insumo: InsumoEntity | null, overrides: Partial<InsumoRepoMock> = {}) {
    return {
      findById: vi.fn().mockResolvedValue(insumo),
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

  // ─── Camino feliz y PATCH de campos simples ───────────────────────────────

  it('edita el nombre sin tocar los demás campos', async () => {
    const insumo = buildInsumo();
    const repo = buildInsumoRepo(insumo);
    const useCase = new EditarInsumoUseCase(
      repo,
      buildFamiliaRepo(),
      buildUnidadRepo(),
      buildModeloRepo(),
    );

    const result = await useCase.execute({ id: 'ins-1', nombre: '  Tóner negro XL  ' });

    expect(result.isOk()).toBe(true);
    expect(result.getValue().nombre).toBe('Tóner negro XL');
    expect(result.getValue().codigo).toBe('TON-001');
    expect(result.getValue().stockMinimo).toBe(5);
    expect(repo.save).toHaveBeenCalledTimes(1);
  });

  it('rechaza con INSUMO_NO_ENCONTRADO si el id no existe', async () => {
    const repo = buildInsumoRepo(null);
    const useCase = new EditarInsumoUseCase(
      repo,
      buildFamiliaRepo(),
      buildUnidadRepo(),
      buildModeloRepo(),
    );

    const result = await useCase.execute({ id: 'inexistente', nombre: 'X' });

    expect(result.isFail()).toBe(true);
    expect(result.getError().code).toBe('INSUMO_NO_ENCONTRADO');
    expect(repo.save).not.toHaveBeenCalled();
  });

  /**
   * `undefined` es el campo ausente del PATCH; `null` es la orden explícita de
   * borrar el punto de reposición. Confundirlos es pérdida de datos: el insumo
   * perdería su stock mínimo en cada edición del nombre.
   */
  it('deja el stock mínimo intacto cuando el PATCH no lo trae', async () => {
    const repo = buildInsumoRepo(buildInsumo());
    const useCase = new EditarInsumoUseCase(
      repo,
      buildFamiliaRepo(),
      buildUnidadRepo(),
      buildModeloRepo(),
    );

    const result = await useCase.execute({ id: 'ins-1', nombre: 'Otro' });

    expect(result.getValue().stockMinimo).toBe(5);
  });

  it('borra el stock mínimo cuando el PATCH lo manda en null', async () => {
    const repo = buildInsumoRepo(buildInsumo());
    const useCase = new EditarInsumoUseCase(
      repo,
      buildFamiliaRepo(),
      buildUnidadRepo(),
      buildModeloRepo(),
    );

    const result = await useCase.execute({ id: 'ins-1', stockMinimo: null });

    expect(result.getValue().stockMinimo).toBeNull();
  });

  // ─── Código: NUNCA editable (issue #166) ───────────────────────────────────

  /**
   * EL GEMELO INVERTIDO que cierra el agujero del WU-3: el #162 dejaba que
   * `EditarInsumoUseCase` cambiara el `codigo` cuando el resultante difería
   * del guardado — esta sección entera ("normaliza el código nuevo",
   * "re-enviar el código actual no dispara la revalidación",
   * "rechaza con INSUMO_CODIGO_DUPLICADO si el código nuevo pertenece a OTRO
   * insumo", "no es choque cuando findByCodigo devuelve el mismo insumo") lo
   * probaba. Issue #166 la reemplaza por esta única prueba: `EditarInsumoDto`
   * ya no declara `codigo`, así que no hay revalidación de unicidad que
   * disparar, ni un `findByCodigo` que llamar —ni siquiera está en el `Pick`
   * del constructor—. Un "código nuevo" ya no es una entrada posible del caso
   * de uso.
   */
  it('el codigo del insumo queda intacto pase lo que pase con el resto del PATCH', async () => {
    const repo = buildInsumoRepo(buildInsumo());
    const useCase = new EditarInsumoUseCase(
      repo,
      buildFamiliaRepo(),
      buildUnidadRepo(),
      buildModeloRepo(),
    );

    const result = await useCase.execute({
      id: 'ins-1',
      nombre: 'Tóner negro renombrado',
      familiaId: 'fam-2',
      unidadMedidaId: 'uni-2',
      stockMinimo: 9,
    });

    expect(result.isOk()).toBe(true);
    expect(result.getValue().codigo).toBe('TON-001');
  });

  // ─── Existe ≠ es elegible, también al reasignar ───────────────────────────

  it('acepta la reasignación a una familia habilitada', async () => {
    const repo = buildInsumoRepo(buildInsumo());
    const useCase = new EditarInsumoUseCase(
      repo,
      buildFamiliaRepo(),
      buildUnidadRepo(),
      buildModeloRepo(),
    );

    const result = await useCase.execute({ id: 'ins-1', familiaId: 'fam-2' });

    expect(result.isOk()).toBe(true);
    expect(result.getValue().familiaId).toBe('fam-2');
  });

  /**
   * Decisión explícita del dueño (issue #162): el código NUNCA cambia, ni
   * siquiera el prefijo, cuando el insumo cambia de familia. El prefijo dice
   * dónde NACIÓ el insumo, no dónde está — un `INS-0003` dentro de una
   * familia de repuestos es esperable y correcto. Este test es el que se
   * pone rojo si alguien intenta "recalcular" el código al reasignar familia.
   */
  it('NO cambia el codigo, ni siquiera el prefijo, cuando el insumo cambia de familia', async () => {
    const repo = buildInsumoRepo(buildInsumo());
    const useCase = new EditarInsumoUseCase(
      repo,
      buildFamiliaRepo(),
      buildUnidadRepo(),
      buildModeloRepo(),
    );

    const result = await useCase.execute({ id: 'ins-1', familiaId: 'fam-2' });

    expect(result.isOk()).toBe(true);
    expect(result.getValue().codigo).toBe('TON-001');
  });

  it('rechaza con FAMILIA_INSUMO_INEXISTENTE si la familia nueva no está en el catálogo', async () => {
    const repo = buildInsumoRepo(buildInsumo());
    const useCase = new EditarInsumoUseCase(
      repo,
      buildFamiliaRepo(null),
      buildUnidadRepo(),
      buildModeloRepo(),
    );

    const result = await useCase.execute({ id: 'ins-1', familiaId: 'fam-9' });

    expect(result.isFail()).toBe(true);
    expect(result.getError().code).toBe('FAMILIA_INSUMO_INEXISTENTE');
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('rechaza con FAMILIA_INSUMO_DESHABILITADA si la familia nueva está deshabilitada', async () => {
    const familia = familiaHabilitada();
    familia.desactivar();
    const repo = buildInsumoRepo(buildInsumo());
    const useCase = new EditarInsumoUseCase(
      repo,
      buildFamiliaRepo(familia),
      buildUnidadRepo(),
      buildModeloRepo(),
    );

    const result = await useCase.execute({ id: 'ins-1', familiaId: 'fam-2' });

    expect(result.isFail()).toBe(true);
    expect(result.getError().code).toBe('FAMILIA_INSUMO_DESHABILITADA');
  });

  /**
   * Assert de ausencia con fixture CARGADO: este mismo catálogo devuelve una
   * familia deshabilitada, que en el test de arriba hace fallar la edición. El
   * verde de acá viene de no haberlo consultado, no de un catálogo vacío.
   */
  it('no consulta el catálogo de familias si el PATCH no reasigna la familia', async () => {
    const familia = familiaHabilitada();
    familia.desactivar();
    const familiaRepo = buildFamiliaRepo(familia);
    const useCase = new EditarInsumoUseCase(
      buildInsumoRepo(buildInsumo()),
      familiaRepo,
      buildUnidadRepo(),
      buildModeloRepo(),
    );

    const result = await useCase.execute({ id: 'ins-1', nombre: 'Otro' });

    expect(result.isOk()).toBe(true);
    expect(familiaRepo.findById).not.toHaveBeenCalled();
  });

  it('acepta la reasignación a una unidad habilitada', async () => {
    const repo = buildInsumoRepo(buildInsumo());
    const useCase = new EditarInsumoUseCase(
      repo,
      buildFamiliaRepo(),
      buildUnidadRepo(),
      buildModeloRepo(),
    );

    const result = await useCase.execute({ id: 'ins-1', unidadMedidaId: 'uni-2' });

    expect(result.isOk()).toBe(true);
    expect(result.getValue().unidadMedidaId).toBe('uni-2');
  });

  it('rechaza con UNIDAD_MEDIDA_INEXISTENTE si la unidad nueva no está en el catálogo', async () => {
    const repo = buildInsumoRepo(buildInsumo());
    const useCase = new EditarInsumoUseCase(
      repo,
      buildFamiliaRepo(),
      buildUnidadRepo(null),
      buildModeloRepo(),
    );

    const result = await useCase.execute({ id: 'ins-1', unidadMedidaId: 'uni-9' });

    expect(result.getError().code).toBe('UNIDAD_MEDIDA_INEXISTENTE');
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('rechaza con UNIDAD_MEDIDA_DESHABILITADA si la unidad nueva está deshabilitada', async () => {
    const unidad = unidadHabilitada();
    unidad.desactivar();
    const repo = buildInsumoRepo(buildInsumo());
    const useCase = new EditarInsumoUseCase(
      repo,
      buildFamiliaRepo(),
      buildUnidadRepo(unidad),
      buildModeloRepo(),
    );

    const result = await useCase.execute({ id: 'ins-1', unidadMedidaId: 'uni-2' });

    expect(result.getError().code).toBe('UNIDAD_MEDIDA_DESHABILITADA');
  });

  it('no consulta el catálogo de unidades si el PATCH no reasigna la unidad', async () => {
    const unidad = unidadHabilitada();
    unidad.desactivar();
    const unidadRepo = buildUnidadRepo(unidad);
    const useCase = new EditarInsumoUseCase(
      buildInsumoRepo(buildInsumo()),
      buildFamiliaRepo(),
      unidadRepo,
      buildModeloRepo(),
    );

    const result = await useCase.execute({ id: 'ins-1', nombre: 'Otro' });

    expect(result.isOk()).toBe(true);
    expect(unidadRepo.findById).not.toHaveBeenCalled();
  });

  // ─── Orden de validación ──────────────────────────────────────────────────

  /**
   * Issue #166 quita dos casos de esta sección ("con la familia deshabilitada
   * Y el código duplicado gana el error de la familia" y "con el código
   * duplicado Y un código alternativo tomado gana el error del código"): el
   * `codigo` ya no es un campo de `EditarInsumoDto`, así que no hay
   * revalidación de unicidad con la que competir por prioridad —el escenario
   * que esos tests fijaban ya no es alcanzable—. El orden que SÍ sigue
   * vigente lo cubren los tests de abajo y el de compatibilidad más adelante.
   */
  // ─── Códigos alternativos: la lista es PATCH ──────────────────────────────

  /**
   * `undefined` y `[]` no significan lo mismo. Confundirlos borra códigos que
   * nadie pidió borrar: bastaría editar el nombre para vaciar la lista.
   * El mock del repo devuelve un conflicto acá, así que el verde no puede venir
   * de un fixture vacío.
   */
  it('deja la lista de códigos alternativos intacta cuando el PATCH no la trae', async () => {
    const existente = InsumoCodigoAlternativoEntity.create(
      { codigo: 'CE285A', fabricante: 'HP' },
      'cod-1',
    );
    const repo = buildInsumoRepo(buildInsumo([existente]), {
      findConflictosDeCodigoAlternativo: vi
        .fn()
        .mockResolvedValue([{ codigo: 'CE285A', fabricante: 'HP', insumoId: 'ins-9' }]),
    });
    const useCase = new EditarInsumoUseCase(
      repo,
      buildFamiliaRepo(),
      buildUnidadRepo(),
      buildModeloRepo(),
    );

    const result = await useCase.execute({ id: 'ins-1', nombre: 'Otro' });

    expect(result.isOk()).toBe(true);
    expect(result.getValue().codigosAlternativos).toEqual([existente]);
    expect(repo.findConflictosDeCodigoAlternativo).not.toHaveBeenCalled();
  });

  it('vacía la lista de códigos alternativos cuando el PATCH la trae vacía', async () => {
    const existente = InsumoCodigoAlternativoEntity.create(
      { codigo: 'CE285A', fabricante: 'HP' },
      'cod-1',
    );
    const repo = buildInsumoRepo(buildInsumo([existente]));
    const useCase = new EditarInsumoUseCase(
      repo,
      buildFamiliaRepo(),
      buildUnidadRepo(),
      buildModeloRepo(),
    );

    const result = await useCase.execute({ id: 'ins-1', codigosAlternativos: [] });

    expect(result.isOk()).toBe(true);
    expect(result.getValue().codigosAlternativos).toEqual([]);
  });

  /**
   * Sin la reutilización, editar el nombre del insumo le cambiaría el id a
   * todos sus códigos alternativos y les borraría la fecha de alta, porque la
   * lista se reemplaza entera en cada guardado del agregado.
   */
  it('reutiliza la entidad existente cuando el par ya figuraba entre sus códigos', async () => {
    const existente = InsumoCodigoAlternativoEntity.create(
      { codigo: 'CE285A', fabricante: 'HP' },
      'cod-1',
    );
    const repo = buildInsumoRepo(buildInsumo([existente]));
    const useCase = new EditarInsumoUseCase(
      repo,
      buildFamiliaRepo(),
      buildUnidadRepo(),
      buildModeloRepo(),
    );

    const result = await useCase.execute({
      id: 'ins-1',
      codigosAlternativos: [
        { codigo: ' ce285a ', fabricante: ' hp ' },
        { codigo: 'Q2612A', fabricante: 'HP' },
      ],
    });

    const codigos = result.getValue().codigosAlternativos;
    expect(codigos).toHaveLength(2);
    expect(codigos[0]).toBe(existente);
    expect(codigos[0]!.id).toBe('cod-1');
    expect(codigos[0]!.createdAt).toBe(existente.createdAt);
    expect(codigos[1]!.id).not.toBe('cod-1');
    expect(codigos[1]!.codigo).toBe('Q2612A');
  });

  /**
   * Los códigos propios del insumo que se edita no son un choque consigo
   * mismo: sin `excluyendoInsumoId`, reenviar la lista sin cambios se
   * rechazaría a sí misma.
   */
  it('consulta el conflicto global excluyendo al insumo que se está editando', async () => {
    const repo = buildInsumoRepo(buildInsumo());
    const useCase = new EditarInsumoUseCase(
      repo,
      buildFamiliaRepo(),
      buildUnidadRepo(),
      buildModeloRepo(),
    );

    await useCase.execute({
      id: 'ins-1',
      codigosAlternativos: [{ codigo: ' ce285a ', fabricante: ' hp ' }],
    });

    expect(repo.findConflictosDeCodigoAlternativo).toHaveBeenCalledWith(
      [{ codigo: 'CE285A', fabricante: 'HP' }],
      'ins-1',
    );
  });

  it('rechaza con CODIGO_ALTERNATIVO_DUPLICADO el par repetido dentro del payload', async () => {
    const repo = buildInsumoRepo(buildInsumo());
    const useCase = new EditarInsumoUseCase(
      repo,
      buildFamiliaRepo(),
      buildUnidadRepo(),
      buildModeloRepo(),
    );

    const result = await useCase.execute({
      id: 'ins-1',
      codigosAlternativos: [{ codigo: 'CE285A' }, { codigo: 'ce285a', fabricante: '  ' }],
    });

    expect(result.isFail()).toBe(true);
    expect(result.getError().code).toBe('CODIGO_ALTERNATIVO_DUPLICADO');
    expect(repo.findConflictosDeCodigoAlternativo).not.toHaveBeenCalled();
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('rechaza con CODIGO_ALTERNATIVO_DUPLICADO el par que ya pertenece a otro insumo', async () => {
    const repo = buildInsumoRepo(buildInsumo(), {
      findConflictosDeCodigoAlternativo: vi
        .fn()
        .mockResolvedValue([{ codigo: 'CE285A', fabricante: 'HP', insumoId: 'ins-9' }]),
    });
    const useCase = new EditarInsumoUseCase(
      repo,
      buildFamiliaRepo(),
      buildUnidadRepo(),
      buildModeloRepo(),
    );

    const result = await useCase.execute({
      id: 'ins-1',
      codigosAlternativos: [{ codigo: 'CE285A', fabricante: 'HP' }],
    });

    expect(result.isFail()).toBe(true);
    expect(result.getError().code).toBe('CODIGO_ALTERNATIVO_DUPLICADO');
    expect(repo.save).not.toHaveBeenCalled();
  });

  // ─── Compatibilidad con modelos de equipo ─────────────────────────────────

  /**
   * Camino feliz, y hermano invertido de los rechazos de modelo de abajo: sin
   * él, un catálogo que rechazara cualquier id dejaría la sección en verde.
   */
  it('agrega la compatibilidad a un insumo que no la tenía', async () => {
    const repo = buildInsumoRepo(buildInsumo());
    const useCase = new EditarInsumoUseCase(
      repo,
      buildFamiliaRepo(),
      buildUnidadRepo(),
      buildModeloRepo(),
    );

    const result = await useCase.execute({
      id: 'ins-1',
      compatibilidad: [{ modeloEquipoId: 'mod-1', rol: ' negro ' }],
    });

    expect(result.isOk()).toBe(true);
    expect(result.getValue().compatibilidad).toEqual([{ modeloEquipoId: 'mod-1', rol: 'NEGRO' }]);
    expect(repo.save).toHaveBeenCalledTimes(1);
  });

  /**
   * `undefined` y `[]` no significan lo mismo. Confundirlos borra compatibilidad
   * que nadie pidió borrar: bastaría editar el nombre para que el insumo dejara
   * de servirle a todos sus modelos. El catálogo de este test tiene CARGADO el
   * rechazo de `mod-1` —el mismo fixture que abajo devuelve
   * `MODELO_EQUIPO_INEXISTENTE`—, así que el verde no puede venir de un mock inerte.
   */
  it('deja la compatibilidad guardada intacta cuando el PATCH no la trae', async () => {
    const guardada: CompatibilidadModelo = { modeloEquipoId: 'mod-1', rol: 'NEGRO' };
    const repo = buildInsumoRepo(buildInsumo([], 'ins-1', [guardada]));
    const modeloRepo = buildModeloRepo({ 'mod-1': null });
    const useCase = new EditarInsumoUseCase(
      repo,
      buildFamiliaRepo(),
      buildUnidadRepo(),
      modeloRepo,
    );

    const result = await useCase.execute({ id: 'ins-1', nombre: 'Otro' });

    expect(result.isOk()).toBe(true);
    expect(result.getValue().compatibilidad).toEqual([guardada]);
    expect(modeloRepo.findById).not.toHaveBeenCalled();
  });

  /** Hermano del anterior: la lista vacía SÍ es la orden explícita de vaciarla. */
  it('vacía la compatibilidad cuando el PATCH la trae vacía', async () => {
    const repo = buildInsumoRepo(
      buildInsumo([], 'ins-1', [{ modeloEquipoId: 'mod-1', rol: 'NEGRO' }]),
    );
    const useCase = new EditarInsumoUseCase(
      repo,
      buildFamiliaRepo(),
      buildUnidadRepo(),
      buildModeloRepo(),
    );

    const result = await useCase.execute({ id: 'ins-1', compatibilidad: [] });

    expect(result.isOk()).toBe(true);
    expect(result.getValue().compatibilidad).toEqual([]);
  });

  it('rechaza con MODELO_EQUIPO_INEXISTENTE si el modelo nuevo no está en el catálogo', async () => {
    const repo = buildInsumoRepo(buildInsumo());
    const useCase = new EditarInsumoUseCase(
      repo,
      buildFamiliaRepo(),
      buildUnidadRepo(),
      buildModeloRepo({ 'mod-9': null }),
    );

    const result = await useCase.execute({
      id: 'ins-1',
      compatibilidad: [{ modeloEquipoId: 'mod-9' }],
    });

    expect(result.isFail()).toBe(true);
    expect(result.getError().code).toBe('MODELO_EQUIPO_INEXISTENTE');
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('rechaza con MODELO_EQUIPO_DESHABILITADO si el modelo nuevo está deshabilitado', async () => {
    const modelo = modeloHabilitado('mod-1');
    modelo.desactivar();
    const repo = buildInsumoRepo(buildInsumo());
    const useCase = new EditarInsumoUseCase(
      repo,
      buildFamiliaRepo(),
      buildUnidadRepo(),
      buildModeloRepo({ 'mod-1': modelo }),
    );

    const result = await useCase.execute({
      id: 'ins-1',
      compatibilidad: [{ modeloEquipoId: 'mod-1' }],
    });

    expect(result.isFail()).toBe(true);
    expect(result.getError().code).toBe('MODELO_EQUIPO_DESHABILITADO');
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('trata el modelo con baja lógica como inexistente', async () => {
    const modelo = modeloHabilitado('mod-1');
    modelo.softDelete();
    const repo = buildInsumoRepo(buildInsumo());
    const useCase = new EditarInsumoUseCase(
      repo,
      buildFamiliaRepo(),
      buildUnidadRepo(),
      buildModeloRepo({ 'mod-1': modelo }),
    );

    const result = await useCase.execute({
      id: 'ins-1',
      compatibilidad: [{ modeloEquipoId: 'mod-1' }],
    });

    expect(result.getError().code).toBe('MODELO_EQUIPO_INEXISTENTE');
  });

  /**
   * La lista se reemplaza entera, así que toda edición reenvía también los
   * modelos viejos. Si se revalidaran, deshabilitar un modelo del catálogo
   * dejaría sin poder editar —ni siquiera el nombre— a todos los insumos que ya
   * eran compatibles con él, y la única salida sería borrar una compatibilidad
   * que nadie pidió borrar.
   */
  it('deja reenviar un modelo que el insumo YA tenía aunque hoy esté deshabilitado', async () => {
    const deshabilitado = modeloHabilitado('mod-1');
    deshabilitado.desactivar();
    const repo = buildInsumoRepo(
      buildInsumo([], 'ins-1', [{ modeloEquipoId: 'mod-1', rol: null }]),
    );
    const useCase = new EditarInsumoUseCase(
      repo,
      buildFamiliaRepo(),
      buildUnidadRepo(),
      buildModeloRepo({ 'mod-1': deshabilitado }),
    );

    const result = await useCase.execute({
      id: 'ins-1',
      nombre: 'Tóner renombrado',
      compatibilidad: [{ modeloEquipoId: 'mod-1' }],
    });

    expect(result.isOk()).toBe(true);
    expect(result.getValue().nombre).toBe('Tóner renombrado');
    expect(result.getValue().compatibilidad).toEqual([{ modeloEquipoId: 'mod-1', rol: null }]);
  });

  /**
   * El hermano invertido del caso de arriba: la excepción vale SOLO para lo que
   * el insumo ya tenía. Declarar un modelo deshabilitado por primera vez sigue
   * siendo un rechazo, si no el guard no protegería nada.
   */
  it('sigue rechazando un modelo deshabilitado que el insumo NO tenía', async () => {
    const deshabilitado = modeloHabilitado('mod-2');
    deshabilitado.desactivar();
    const repo = buildInsumoRepo(
      buildInsumo([], 'ins-1', [{ modeloEquipoId: 'mod-1', rol: null }]),
    );
    const useCase = new EditarInsumoUseCase(
      repo,
      buildFamiliaRepo(),
      buildUnidadRepo(),
      buildModeloRepo({ 'mod-2': deshabilitado }),
    );

    const result = await useCase.execute({
      id: 'ins-1',
      compatibilidad: [{ modeloEquipoId: 'mod-1' }, { modeloEquipoId: 'mod-2' }],
    });

    expect(result.getError().code).toBe('MODELO_EQUIPO_DESHABILITADO');
  });

  it('no consulta el catálogo por un modelo que el insumo ya tenía declarado', async () => {
    const repo = buildInsumoRepo(
      buildInsumo([], 'ins-1', [{ modeloEquipoId: 'mod-1', rol: null }]),
    );
    const modeloRepo = buildModeloRepo();
    const useCase = new EditarInsumoUseCase(
      repo,
      buildFamiliaRepo(),
      buildUnidadRepo(),
      modeloRepo,
    );

    await useCase.execute({
      id: 'ins-1',
      compatibilidad: [{ modeloEquipoId: 'mod-1' }, { modeloEquipoId: 'mod-2' }],
    });

    expect(modeloRepo.findById).not.toHaveBeenCalledWith('mod-1');
    expect(modeloRepo.findById).toHaveBeenCalledWith('mod-2');
  });

  it('rechaza con COMPATIBILIDAD_DUPLICADA el mismo modelo repetido en el payload', async () => {
    const repo = buildInsumoRepo(buildInsumo());
    const modeloRepo = buildModeloRepo();
    const useCase = new EditarInsumoUseCase(
      repo,
      buildFamiliaRepo(),
      buildUnidadRepo(),
      modeloRepo,
    );

    const result = await useCase.execute({
      id: 'ins-1',
      compatibilidad: [
        { modeloEquipoId: 'mod-1', rol: 'NEGRO' },
        { modeloEquipoId: 'mod-1', rol: 'CIAN' },
      ],
    });

    expect(result.isFail()).toBe(true);
    expect(result.getError().code).toBe('COMPATIBILIDAD_DUPLICADA');
    expect(modeloRepo.findById).not.toHaveBeenCalled();
    expect(repo.save).not.toHaveBeenCalled();
  });

  /**
   * "con el código duplicado Y la compatibilidad duplicada gana el error del
   * código" (#162) se quita por el mismo motivo que las dos de "Orden de
   * validación" más arriba: sin `codigo` en `EditarInsumoDto`, no hay
   * revalidación de código con la que la compatibilidad duplicada pueda
   * competir por prioridad.
   */
});
