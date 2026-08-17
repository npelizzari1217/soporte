/**
 * WU-23 [UNIT] — RED→GREEN: `RegistrarOrdenDeItemUseCase`.
 *
 * Cubre: S42 (orden parcial OK), S45 (exceso -> CantidadOrdenadaExcedeSolicitadaError),
 * S46 (retroceso -> CantidadOrdenadaRetrocedeError), S47 (no aprobado ->
 * ItemCompraNoAprobadoError), S35 (bitácora ORDEN_REGISTRADA), 404s, compra
 * cancelada.
 *
 * Ref spec: sdd/compras-tres-etapas-y-sectores/spec R1, R2 (S42, S45-S47).
 */
import {
  RegistrarOrdenDeItemUseCase,
  RegistrarOrdenDeItemDto,
} from './registrar-orden-de-item.use-case';
import { CompraEntity } from '../../domain/entities/compra.entity';
import { ItemCompraEntity } from '../../domain/entities/item-compra.entity';
import {
  CompraCanceladaError,
  CompraNoEncontradaError,
  ItemCompraNoEncontradoError,
  ItemCompraNoAprobadoError,
  CantidadOrdenadaExcedeSolicitadaError,
  CantidadOrdenadaRetrocedeError,
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

function compraConItemAprobado(cantidad = 10): { compra: CompraEntity; item: ItemCompraEntity } {
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
  return { compra, item };
}

function compraConItemPendiente(): { compra: CompraEntity; item: ItemCompraEntity } {
  const compra = compraBase();
  compra.agregarItem({
    descripcion: 'Resma de papel A4',
    cantidad: 10,
    proveedor: 'Proveedor SA',
    monto: 1500,
    moneda: 'ARS',
    fechaCotizacion: new Date('2026-08-01'),
    observaciones: null,
  });
  return { compra, item: compra.items[0] };
}

function baseDto(
  compra: CompraEntity,
  item: ItemCompraEntity,
  overrides: Partial<RegistrarOrdenDeItemDto> = {},
): RegistrarOrdenDeItemDto {
  return {
    compraId: compra.id,
    itemId: item.id,
    usuarioId: 'usuario-uuid',
    cantidadOrdenada: 4,
    fecha: new Date('2026-08-02'),
    ...overrides,
  };
}

describe('RegistrarOrdenDeItemUseCase', () => {
  function makeCollaborators(compra: CompraEntity | null) {
    const compraRepo = {
      findByIdConItems: vi.fn().mockResolvedValue(compra),
      guardarItem: vi.fn().mockResolvedValue(undefined),
    };
    const registrarOperacion = { registrar: vi.fn().mockResolvedValue(undefined) };
    const txRunner = { run: vi.fn((fn: () => Promise<unknown>) => fn()) };

    const useCase = new RegistrarOrdenDeItemUseCase(
      compraRepo as never,
      registrarOperacion as never,
      txRunner as never,
    );

    return { useCase, compraRepo, registrarOperacion, txRunner };
  }

  it('S42: registra una orden parcial — cantidadOrdenada < cantidad', async () => {
    const { compra, item } = compraConItemAprobado(10);
    const c = makeCollaborators(compra);

    const result = await c.useCase.execute(baseDto(compra, item, { cantidadOrdenada: 4 }));

    expect(result.isOk()).toBe(true);
    expect(result.getValue().cantidadOrdenada).toBe(4);
    expect(c.txRunner.run).toHaveBeenCalledTimes(1);
  });

  it('S47: ordenar sobre un ítem NO aprobado -> ItemCompraNoAprobadoError, sin persistir ni registrar bitácora', async () => {
    const { compra, item } = compraConItemPendiente();
    const c = makeCollaborators(compra);

    const result = await c.useCase.execute(baseDto(compra, item, { cantidadOrdenada: 4 }));

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(ItemCompraNoAprobadoError);
    expect(c.compraRepo.guardarItem).not.toHaveBeenCalled();
    expect(c.registrarOperacion.registrar).not.toHaveBeenCalled();
  });

  it('S45: ordenar más de lo pedido -> CantidadOrdenadaExcedeSolicitadaError, sin persistir', async () => {
    const { compra, item } = compraConItemAprobado(10);
    const c = makeCollaborators(compra);

    const result = await c.useCase.execute(baseDto(compra, item, { cantidadOrdenada: 15 }));

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(CantidadOrdenadaExcedeSolicitadaError);
    expect(c.compraRepo.guardarItem).not.toHaveBeenCalled();
  });

  it('S46: retroceder respecto de lo ya registrado -> CantidadOrdenadaRetrocedeError, sin persistir', async () => {
    const { compra, item } = compraConItemAprobado(10);
    item.registrarOrden(6, new Date('2026-08-02'));
    const c = makeCollaborators(compra);

    const result = await c.useCase.execute(baseDto(compra, item, { cantidadOrdenada: 3 }));

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(CantidadOrdenadaRetrocedeError);
    expect(item.cantidadOrdenada).toBe(6);
  });

  it('S35: registra exactamente 1 OperacionCompra de tipo ORDEN_REGISTRADA', async () => {
    const { compra, item } = compraConItemAprobado(10);
    const c = makeCollaborators(compra);

    await c.useCase.execute(baseDto(compra, item, { cantidadOrdenada: 4 }));

    expect(c.registrarOperacion.registrar).toHaveBeenCalledTimes(1);
    expect(c.registrarOperacion.registrar.mock.calls[0][0].tipo).toBe('ORDEN_REGISTRADA');
  });

  it('compra inexistente -> CompraNoEncontradaError', async () => {
    const { compra, item } = compraConItemAprobado(10);
    const c = makeCollaborators(null);

    const result = await c.useCase.execute(baseDto(compra, item, { cantidadOrdenada: 4 }));

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(CompraNoEncontradaError);
  });

  it('ítem inexistente -> ItemCompraNoEncontradoError', async () => {
    const { compra, item } = compraConItemAprobado(10);
    const c = makeCollaborators(compra);

    const result = await c.useCase.execute(
      baseDto(compra, item, { itemId: 'item-inexistente', cantidadOrdenada: 4 }),
    );

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(ItemCompraNoEncontradoError);
  });

  it('compra cancelada -> CompraCanceladaError, sin abrir la tx', async () => {
    const { compra, item } = compraConItemAprobado(10);
    const cancelacion = compra.cancelar('usuario-cancelador', 'Ya no se necesita');
    expect(cancelacion.isOk()).toBe(true); // precondición: sin orden emitida, la cancelación en sí es válida
    const c = makeCollaborators(compra);

    const result = await c.useCase.execute(baseDto(compra, item, { cantidadOrdenada: 4 }));

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(CompraCanceladaError);
    expect(c.txRunner.run).not.toHaveBeenCalled();
  });
});
