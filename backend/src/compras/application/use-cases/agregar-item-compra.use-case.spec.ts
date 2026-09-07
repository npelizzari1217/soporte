/**
 * PR-14 [UNIT] — RED→GREEN: `AgregarItemCompraUseCase`.
 *
 * Todos los puertos/colaboradores mockeados (`vi.fn`) — sin DB. Cubre:
 * - S4: el ítem nace PENDIENTE con cantidades en 0 y la cabecera recalcula
 *   (si estaba APROBADO/RECHAZADO vuelve a PENDIENTE — resuelto en la
 *   entidad, este caso de uso no re-implementa nada).
 * - S5: agregar sobre una compra cancelada -> `CompraCanceladaError`.
 * - S35: exactamente 1 `OperacionCompra` de tipo `ITEM_AGREGADO` por
 *   mutación exitosa.
 * - Regla transversal: TODO dentro de `txRunner.run(...)` (find + mutate +
 *   guardar + guardarItem + registrarOperacion, atómico).
 *
 * Ref spec: sdd/redisenio-modulo-compras/spec §4.2 (S4, S5), §4.10 (S35).
 * Ref design: ADR-C1, ADR-C2, ADR-C4. Tarea: PR-14.
 */
import { AgregarItemCompraUseCase, AgregarItemCompraDto } from './agregar-item-compra.use-case';
import { CompraEntity } from '../../domain/entities/compra.entity';
import { CompraNoEncontradaError, CompraCanceladaError } from '../../domain/errors/compras.errors';
import { InsumoEntity } from '../../../insumos/domain/entities/insumo.entity';
import { InsumoNoEncontradoError } from '../../../insumos/domain/errors/insumos.errors';

const INSUMO_ID = '00000000-0000-4000-8000-0000000000aa';

/** Insumo del catálogo del tenant, vigente y habilitado salvo que se diga otra cosa. */
function insumoDelCatalogo(
  opciones: { activo?: boolean; conBajaLogica?: boolean } = {},
): InsumoEntity {
  const props = {
    codigo: 'TON-001',
    nombre: 'Tóner negro',
    familiaId: 'familia-1',
    unidadMedidaId: 'unidad-1',
    stockMinimo: null,
    activo: opciones.activo ?? true,
    codigosAlternativos: [],
    compatibilidad: [],
  };
  const ahora = new Date('2026-01-01T00:00:00.000Z');
  return InsumoEntity.reconstitute(
    props,
    INSUMO_ID,
    ahora,
    ahora,
    opciones.conBajaLogica === true ? ahora : null,
  );
}

function baseDto(overrides: Partial<AgregarItemCompraDto> = {}): AgregarItemCompraDto {
  return {
    compraId: 'compra-uuid',
    usuarioId: 'usuario-uuid',
    descripcion: 'Resma de papel A4',
    cantidad: 10,
    proveedor: 'Proveedor SA',
    monto: 1500,
    moneda: 'ARS',
    fechaCotizacion: new Date('2026-08-13'),
    observaciones: null,
    ...overrides,
  };
}

function compraActiva(): CompraEntity {
  return CompraEntity.create(
    {
      numero: 'COM-2026-00001',
      fechaSolicitud: new Date('2026-08-01'),
      motivo: 'Compra de insumos',
      descripcion: null,
      solicitanteId: 'solicitante-uuid',
      cicloId: 'ciclo-uuid',
    },
    'compra-uuid',
  );
}

describe('AgregarItemCompraUseCase', () => {
  function makeCollaborators(
    compra: CompraEntity | null = compraActiva(),
    insumo: InsumoEntity | null = insumoDelCatalogo(),
  ) {
    const compraRepo = {
      findByIdConItems: vi.fn().mockResolvedValue(compra),
      guardar: vi.fn().mockResolvedValue(undefined),
      guardarItem: vi.fn().mockResolvedValue(undefined),
    };
    const registrarOperacion = { registrar: vi.fn().mockResolvedValue(undefined) };
    const txRunner = { run: vi.fn((fn: () => Promise<unknown>) => fn()) };
    const insumoRepo = { findById: vi.fn().mockResolvedValue(insumo) };

    const useCase = new AgregarItemCompraUseCase(
      compraRepo as never,
      insumoRepo as never,
      registrarOperacion as never,
      txRunner as never,
    );

    return { useCase, compraRepo, insumoRepo, registrarOperacion, txRunner };
  }

  it('S4: agrega el ítem PENDIENTE con cantidades en 0 y persiste cabecera + ítem dentro de la tx', async () => {
    const c = makeCollaborators();

    const result = await c.useCase.execute(baseDto());

    expect(result.isOk()).toBe(true);
    const compra = result.getValue();
    expect(compra.items).toHaveLength(1);
    const item = compra.items[0];
    expect(item.estadoAprobacion).toBe('PENDIENTE');
    expect(item.cantidadOrdenada).toBe(0);
    expect(item.cantidadRecibida).toBe(0);
    expect(item.cantidadEntregada).toBe(0);
    expect(item.descripcion).toBe('Resma de papel A4');

    expect(c.txRunner.run).toHaveBeenCalledTimes(1);
    expect(c.compraRepo.findByIdConItems).toHaveBeenCalledWith('compra-uuid');
    expect(c.compraRepo.guardar).toHaveBeenCalledWith(compra);
    expect(c.compraRepo.guardarItem).toHaveBeenCalledWith(item);
  });

  it('S4: agregar sobre una compra APROBADA la vuelve PENDIENTE (T2, cabecera 100% derivada)', async () => {
    const compra = compraActiva();
    const primerItem = compra.agregarItem({
      descripcion: 'Ítem existente',
      cantidad: 5,
      proveedor: 'Proveedor SA',
      monto: 100,
      moneda: 'ARS',
      fechaCotizacion: new Date('2026-08-01'),
      observaciones: null,
    });
    expect(primerItem.isOk()).toBe(true);
    const itemExistente = compra.items[0];
    itemExistente.aprobar('aprobador-uuid');
    expect(compra.estado).toBe('APROBADO');

    const c = makeCollaborators(compra);
    const result = await c.useCase.execute(baseDto());

    expect(result.isOk()).toBe(true);
    expect(result.getValue().estado).toBe('PENDIENTE');
  });

  it('S35: registra exactamente 1 OperacionCompra de tipo ITEM_AGREGADO por mutación exitosa', async () => {
    const c = makeCollaborators();

    const result = await c.useCase.execute(baseDto());
    const compra = result.getValue();
    const item = compra.items[0];

    expect(c.registrarOperacion.registrar).toHaveBeenCalledTimes(1);
    const operacion = c.registrarOperacion.registrar.mock.calls[0][0];
    expect(operacion.tipo).toBe('ITEM_AGREGADO');
    expect(operacion.compraId).toBe(compra.id);
    expect(operacion.itemCompraId).toBe(item.id);
    expect(operacion.usuarioId).toBe('usuario-uuid');
  });

  it('S5: agregar sobre una compra cancelada -> CompraCanceladaError, sin persistir ni registrar bitácora', async () => {
    const compra = compraActiva();
    compra.cancelar('cancelador-uuid', 'Ya no se necesita');

    const c = makeCollaborators(compra);
    const result = await c.useCase.execute(baseDto());

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(CompraCanceladaError);
    expect(c.compraRepo.guardar).not.toHaveBeenCalled();
    expect(c.compraRepo.guardarItem).not.toHaveBeenCalled();
    expect(c.registrarOperacion.registrar).not.toHaveBeenCalled();
  });

  it('compra inexistente -> CompraNoEncontradaError, sin persistir ni registrar bitácora', async () => {
    const c = makeCollaborators(null);

    const result = await c.useCase.execute(baseDto());

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(CompraNoEncontradaError);
    expect(c.compraRepo.guardar).not.toHaveBeenCalled();
    expect(c.registrarOperacion.registrar).not.toHaveBeenCalled();
  });

  it('compra soft-deleted se trata como inexistente -> CompraNoEncontradaError', async () => {
    const compra = compraActiva();
    compra.softDelete();

    const c = makeCollaborators(compra);
    const result = await c.useCase.execute(baseDto());

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(CompraNoEncontradaError);
  });

  describe('insumos-entrega-3: el ítem puede declarar qué insumo del catálogo compra', () => {
    it('declarar un insumo elegible lo deja escrito en el ítem, tras verificarlo contra el catálogo', async () => {
      const c = makeCollaborators();

      const result = await c.useCase.execute(baseDto({ insumoId: INSUMO_ID }));

      expect(result.isOk()).toBe(true);
      expect(result.getValue().items[0].insumoId).toBe(INSUMO_ID);
      expect(c.insumoRepo.findById).toHaveBeenCalledWith(INSUMO_ID);
    });

    /**
     * Sin esta verificación el id inventado llega intacto al INSERT y la FK lo
     * rechaza con `P2003`, que el filtro traduce a un 409 genérico —"la
     * operación afecta datos relacionados"— que no nombra qué id está mal.
     */
    it('un insumoId inexistente da InsumoNoEncontradoError sin persistir ni asentar bitácora', async () => {
      const c = makeCollaborators(compraActiva(), null);

      const result = await c.useCase.execute(baseDto({ insumoId: INSUMO_ID }));

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(InsumoNoEncontradoError);
      expect(result.getError().message).toContain(INSUMO_ID);
      expect(c.compraRepo.guardarItem).not.toHaveBeenCalled();
      expect(c.registrarOperacion.registrar).not.toHaveBeenCalled();
    });

    /**
     * La COMPRA gana: el insumo se verifica recién después de resolverla.
     *
     * Con el orden invertido —que es como nació este caso de uso—, un alta
     * sobre una compra inexistente con un insumo dado de baja contestaba "ese
     * insumo no existe" y mandaba a corregir el campo equivocado. El costo de
     * la corrección es que la verificación del catálogo pasó a ocurrir con la
     * transacción abierta; el error correcto vale más que esa ventana.
     *
     * Es el mismo criterio que `EditarItemCompraUseCase` ya argumentaba en su
     * JSDoc, y este test es lo que impide que los dos vuelvan a divergir.
     */
    /**
     * El hermano del caso de abajo, y el que faltaba: la compra CANCELADA es
     * un guard del agregado, no del repositorio, así que corre más tarde. Con
     * la verificación del catálogo solo detrás del 404, este caso seguía
     * contestando "ese insumo no existe" sobre una compra a la que no se le
     * puede agregar nada — y el usuario corregía el insumo para descubrir
     * recién entonces que la compra estaba cancelada.
     */
    it('con la compra CANCELADA Y el insumo inválido gana CompraCanceladaError, y el catálogo ni se consulta', async () => {
      const compra = compraActiva();
      compra.cancelar('cancelador-uuid', 'Ya no se necesita');
      const c = makeCollaborators(compra, null);

      const result = await c.useCase.execute(baseDto({ insumoId: INSUMO_ID }));

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(CompraCanceladaError);
      expect(c.insumoRepo.findById).not.toHaveBeenCalled();
    });

    it('con la compra inexistente Y el insumo inválido gana CompraNoEncontradaError, y el catálogo ni se consulta', async () => {
      const c = makeCollaborators(null, null);

      const result = await c.useCase.execute(baseDto({ insumoId: INSUMO_ID }));

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(CompraNoEncontradaError);
      expect(c.insumoRepo.findById).not.toHaveBeenCalled();
    });

    /**
     * Hermano del anterior con la fila PRESENTE: la baja lógica no la ve la FK
     * —la fila está—, así que sin este caso el guard que la atrapa podría
     * borrarse sin que ningún test se ponga rojo.
     */
    it('un insumo con baja lógica cuenta como inexistente, aunque su fila siga en la tabla', async () => {
      const c = makeCollaborators(compraActiva(), insumoDelCatalogo({ conBajaLogica: true }));

      const result = await c.useCase.execute(baseDto({ insumoId: INSUMO_ID }));

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(InsumoNoEncontradoError);
      expect(c.compraRepo.guardarItem).not.toHaveBeenCalled();
    });

    /**
     * Decisión 1 del diseño llevada al alta: deshabilitar significa "no se
     * compra más de esto" para la carga MANUAL de stock, y el ítem de compra
     * no es un asiento de stock. Bloquearlo acá además obligaría a contestar
     * con `InsumoDeshabilitadoError`, cuyo mensaje habla de una entrada de
     * stock que quien carga el ítem no está haciendo.
     */
    it('un insumo DESHABILITADO se puede declarar: el guard de habilitado es de la entrada de stock, no del ítem', async () => {
      const c = makeCollaborators(compraActiva(), insumoDelCatalogo({ activo: false }));

      const result = await c.useCase.execute(baseDto({ insumoId: INSUMO_ID }));

      expect(result.isOk()).toBe(true);
      expect(result.getValue().items[0].insumoId).toBe(INSUMO_ID);
    });

    it('el ítem de texto libre, sin insumo, no consulta el catálogo y nace con insumoId=null', async () => {
      const c = makeCollaborators();

      const result = await c.useCase.execute(baseDto());

      expect(result.isOk()).toBe(true);
      expect(result.getValue().items[0].insumoId).toBeNull();
      expect(c.insumoRepo.findById).not.toHaveBeenCalled();
    });
  });
});
