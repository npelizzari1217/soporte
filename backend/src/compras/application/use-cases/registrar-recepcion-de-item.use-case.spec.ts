/**
 * WU-23 [UNIT] — RED→GREEN: `RegistrarRecepcionDeItemUseCase`.
 *
 * Todos los puertos/colaboradores mockeados (`vi.fn`) — sin DB. Cubre:
 * - S42: recepción parcial (`cantidadRecibida < cantidadOrdenada`) OK.
 * - S43: recibir más de lo ordenado -> `CantidadRecibidaExcedeOrdenadaError`.
 * - S46: retroceder respecto de lo ya registrado -> `CantidadRecibidaRetrocedeError`.
 * - S35: exactamente 1 `OperacionCompra` de tipo `RECEPCION_REGISTRADA` por
 *   mutación exitosa.
 * - Corolario de S35: si la mutación falla, la bitácora queda en 0 llamadas.
 * - 404: compra inexistente / ítem inexistente (id equivocado o soft-deleted).
 * - Compra cancelada: guard de remediación, ANTES de tocar el ítem.
 *
 * `ItemCompraEntity.registrarRecepcion()` ya resuelve la aritmética en
 * centésimas y los guards — este spec verifica que el caso de uso TRADUCE
 * ese `Result`, no que reimplementa la regla.
 *
 * Ref spec: sdd/compras-tres-etapas-y-sectores/spec R1, R2 (S42, S43, S46).
 */
import {
  RegistrarRecepcionDeItemUseCase,
  RegistrarRecepcionDeItemDto,
} from './registrar-recepcion-de-item.use-case';
import { CompraEntity } from '../../domain/entities/compra.entity';
import { ItemCompraEntity } from '../../domain/entities/item-compra.entity';
import {
  CompraCanceladaError,
  CompraNoEncontradaError,
  ItemCompraNoEncontradoError,
  CantidadRecibidaExcedeOrdenadaError,
  CantidadRecibidaRetrocedeError,
} from '../../domain/errors/compras.errors';

function compraBase(): CompraEntity {
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

/** Compra con un único ítem APROBADO con `cantidadOrdenada` ya registrada (default 10 pedidas, 8 ordenadas). */
function compraConItemOrdenado(
  cantidad = 10,
  cantidadOrdenada = 8,
): { compra: CompraEntity; item: ItemCompraEntity } {
  const compra = compraBase();
  compra.agregarItem({
    descripcion: 'Resma de papel A4',
    cantidad,
    proveedor: 'Proveedor SA',
    monto: 1500,
    moneda: 'ARS',
    fechaCotizacion: new Date('2026-08-01'),
    observaciones: null,
  });
  const item = compra.items[0];
  item.aprobar('aprobador-uuid');
  item.registrarOrden(cantidadOrdenada, new Date('2026-08-02'));
  return { compra, item };
}

function baseDto(
  compra: CompraEntity,
  item: ItemCompraEntity,
  overrides: Partial<RegistrarRecepcionDeItemDto> = {},
): RegistrarRecepcionDeItemDto {
  return {
    compraId: compra.id,
    itemId: item.id,
    usuarioId: 'usuario-uuid',
    cantidadRecibida: 4,
    fecha: new Date('2026-08-03'),
    ...overrides,
  };
}

describe('RegistrarRecepcionDeItemUseCase', () => {
  function makeCollaborators(compra: CompraEntity | null) {
    const compraRepo = {
      findByIdConItems: vi.fn().mockResolvedValue(compra),
      guardarItem: vi.fn().mockResolvedValue(undefined),
    };
    const registrarOperacion = { registrar: vi.fn().mockResolvedValue(undefined) };
    const txRunner = { run: vi.fn((fn: () => Promise<unknown>) => fn()) };

    const useCase = new RegistrarRecepcionDeItemUseCase(
      compraRepo as never,
      registrarOperacion as never,
      txRunner as never,
    );

    return { useCase, compraRepo, registrarOperacion, txRunner };
  }

  it('S42: registra una recepción parcial — cantidadRecibida < cantidadOrdenada', async () => {
    const { compra, item } = compraConItemOrdenado(10, 8);
    const c = makeCollaborators(compra);

    const result = await c.useCase.execute(baseDto(compra, item, { cantidadRecibida: 4 }));

    expect(result.isOk()).toBe(true);
    const itemResultado = result.getValue();
    expect(itemResultado.cantidadRecibida).toBe(4);
    expect(itemResultado.comprado).toBe(false);
    expect(c.txRunner.run).toHaveBeenCalledTimes(1);
    expect(c.compraRepo.guardarItem).toHaveBeenCalledWith(itemResultado);
  });

  it('S43: recibir más de lo ordenado -> CantidadRecibidaExcedeOrdenadaError, sin persistir ni registrar bitácora', async () => {
    const { compra, item } = compraConItemOrdenado(10, 8);
    const c = makeCollaborators(compra);

    const result = await c.useCase.execute(baseDto(compra, item, { cantidadRecibida: 9 }));

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(CantidadRecibidaExcedeOrdenadaError);
    expect(c.compraRepo.guardarItem).not.toHaveBeenCalled();
    expect(c.registrarOperacion.registrar).not.toHaveBeenCalled();
  });

  it('S46: retroceder respecto de lo ya registrado -> CantidadRecibidaRetrocedeError, sin persistir ni registrar bitácora', async () => {
    const { compra, item } = compraConItemOrdenado(10, 8);
    item.registrarRecepcion(5, new Date('2026-08-03'));
    const c = makeCollaborators(compra);

    const result = await c.useCase.execute(baseDto(compra, item, { cantidadRecibida: 3 }));

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(CantidadRecibidaRetrocedeError);
    expect(item.cantidadRecibida).toBe(5);
    expect(c.compraRepo.guardarItem).not.toHaveBeenCalled();
    expect(c.registrarOperacion.registrar).not.toHaveBeenCalled();
  });

  it('S35: registra exactamente 1 OperacionCompra de tipo RECEPCION_REGISTRADA por mutación exitosa', async () => {
    const { compra, item } = compraConItemOrdenado(10, 8);
    const c = makeCollaborators(compra);

    await c.useCase.execute(baseDto(compra, item, { cantidadRecibida: 4 }));

    expect(c.registrarOperacion.registrar).toHaveBeenCalledTimes(1);
    const operacion = c.registrarOperacion.registrar.mock.calls[0][0];
    expect(operacion.tipo).toBe('RECEPCION_REGISTRADA');
    expect(operacion.compraId).toBe(compra.id);
    expect(operacion.itemCompraId).toBe(item.id);
  });

  it('compra inexistente -> CompraNoEncontradaError, sin tocar bitácora', async () => {
    const { compra, item } = compraConItemOrdenado(10, 8);
    const c = makeCollaborators(null);

    const result = await c.useCase.execute(baseDto(compra, item, { cantidadRecibida: 4 }));

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(CompraNoEncontradaError);
  });

  it('ítem inexistente (id equivocado) -> ItemCompraNoEncontradoError', async () => {
    const { compra, item } = compraConItemOrdenado(10, 8);
    const c = makeCollaborators(compra);

    const result = await c.useCase.execute(
      baseDto(compra, item, { itemId: 'item-inexistente', cantidadRecibida: 4 }),
    );

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(ItemCompraNoEncontradoError);
  });

  it('compra cancelada -> CompraCanceladaError, sin mutar el ítem, sin persistir y sin abrir la tx', async () => {
    const { compra, item } = compraConItemOrdenado(10, 8);
    // Con cantidadOrdenada > 0, cancelar realmente fallaría por R13 — se
    // simula el estado persistido vía reconstitute para probar el guard de
    // esta capa de aplicación, mismo criterio que RegistrarEntregaDeItemUseCase.
    const compraCancelada = CompraEntity.reconstitute(
      {
        numero: compra.numero,
        fechaSolicitud: compra.fechaSolicitud,
        motivo: compra.motivo,
        descripcion: null,
        solicitanteId: compra.solicitanteId,
        cicloId: compra.cicloId,
        canceladaEn: new Date('2026-08-05'),
        canceladoPorId: 'usuario-cancelador',
        motivoCancelacion: 'Ya no se necesita',
      },
      [item],
      compra.id,
      compra.createdAt,
      compra.createdAt,
      null,
    );
    const c = makeCollaborators(compraCancelada);

    const result = await c.useCase.execute(baseDto(compraCancelada, item, { cantidadRecibida: 4 }));

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(CompraCanceladaError);
    expect(item.cantidadRecibida).toBe(0);
    expect(c.compraRepo.guardarItem).not.toHaveBeenCalled();
    expect(c.registrarOperacion.registrar).not.toHaveBeenCalled();
    expect(c.txRunner.run).not.toHaveBeenCalled();
  });
});
