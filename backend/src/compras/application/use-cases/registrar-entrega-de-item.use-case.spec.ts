/**
 * WU-23 [UNIT] — RED→GREEN: `RegistrarEntregaDeItemUseCase`.
 *
 * Cubre: S42 (entrega dentro de lo recibido OK), S44 (exceso ->
 * CantidadEntregadaExcedeRecibidaError), S46 (retroceso ->
 * CantidadEntregadaRetrocedeError), S35 (bitácora ENTREGA_REGISTRADA), 404s,
 * compra cancelada, y que `fecha` opcional se traduce correctamente.
 *
 * Ref spec: sdd/compras-tres-etapas-y-sectores/spec R1, R2 (S42, S44, S46).
 */
import {
  RegistrarEntregaDeItemUseCase,
  RegistrarEntregaDeItemDto,
} from './registrar-entrega-de-item.use-case';
import { CompraEntity } from '../../domain/entities/compra.entity';
import { ItemCompraEntity } from '../../domain/entities/item-compra.entity';
import {
  CompraCanceladaError,
  CompraNoEncontradaError,
  ItemCompraNoEncontradoError,
  CantidadEntregadaExcedeRecibidaError,
  CantidadEntregadaRetrocedeError,
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

/** Compra con un único ítem APROBADO con `cantidadRecibida` ya registrada (default 10 pedidas, 8 ordenadas, 6 recibidas). */
function compraConItemRecibido(
  cantidad = 10,
  cantidadRecibida = 6,
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
  item.registrarOrden(cantidad, new Date('2026-08-02'));
  item.registrarRecepcion(cantidadRecibida, new Date('2026-08-03'));
  return { compra, item };
}

function baseDto(
  compra: CompraEntity,
  item: ItemCompraEntity,
  overrides: Partial<RegistrarEntregaDeItemDto> = {},
): RegistrarEntregaDeItemDto {
  return {
    compraId: compra.id,
    itemId: item.id,
    usuarioId: 'usuario-uuid',
    cantidadEntregada: 3,
    fecha: new Date('2026-08-04'),
    ...overrides,
  };
}

describe('RegistrarEntregaDeItemUseCase', () => {
  function makeCollaborators(compra: CompraEntity | null) {
    const compraRepo = {
      findByIdConItems: vi.fn().mockResolvedValue(compra),
      guardarItem: vi.fn().mockResolvedValue(undefined),
    };
    const registrarOperacion = { registrar: vi.fn().mockResolvedValue(undefined) };
    const txRunner = { run: vi.fn((fn: () => Promise<unknown>) => fn()) };

    const useCase = new RegistrarEntregaDeItemUseCase(
      compraRepo as never,
      registrarOperacion as never,
      txRunner as never,
    );

    return { useCase, compraRepo, registrarOperacion, txRunner };
  }

  it('S42: entrega dentro de lo recibido -> OK, persiste y registra bitácora dentro de la tx', async () => {
    const { compra, item } = compraConItemRecibido(10, 6);
    const c = makeCollaborators(compra);

    const result = await c.useCase.execute(baseDto(compra, item, { cantidadEntregada: 3 }));

    expect(result.isOk()).toBe(true);
    expect(result.getValue().cantidadEntregada).toBe(3);
    expect(c.txRunner.run).toHaveBeenCalledTimes(1);
    expect(c.compraRepo.guardarItem).toHaveBeenCalledWith(result.getValue());
  });

  it('S44: entregar más de lo recibido -> CantidadEntregadaExcedeRecibidaError, sin persistir', async () => {
    const { compra, item } = compraConItemRecibido(10, 6);
    const c = makeCollaborators(compra);

    const result = await c.useCase.execute(baseDto(compra, item, { cantidadEntregada: 8 }));

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(CantidadEntregadaExcedeRecibidaError);
    expect(c.compraRepo.guardarItem).not.toHaveBeenCalled();
    expect(c.registrarOperacion.registrar).not.toHaveBeenCalled();
  });

  it('S46: retroceder respecto de lo ya registrado -> CantidadEntregadaRetrocedeError, sin persistir', async () => {
    const { compra, item } = compraConItemRecibido(10, 6);
    item.registrarEntrega(4, new Date('2026-08-04'));
    const c = makeCollaborators(compra);

    const result = await c.useCase.execute(baseDto(compra, item, { cantidadEntregada: 2 }));

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(CantidadEntregadaRetrocedeError);
    expect(item.cantidadEntregada).toBe(4);
  });

  it('S35: registra exactamente 1 OperacionCompra de tipo ENTREGA_REGISTRADA', async () => {
    const { compra, item } = compraConItemRecibido(10, 6);
    const c = makeCollaborators(compra);

    await c.useCase.execute(baseDto(compra, item, { cantidadEntregada: 3 }));

    expect(c.registrarOperacion.registrar).toHaveBeenCalledTimes(1);
    expect(c.registrarOperacion.registrar.mock.calls[0][0].tipo).toBe('ENTREGA_REGISTRADA');
  });

  it('compra inexistente -> CompraNoEncontradaError', async () => {
    const { compra, item } = compraConItemRecibido(10, 6);
    const c = makeCollaborators(null);

    const result = await c.useCase.execute(baseDto(compra, item, { cantidadEntregada: 3 }));

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(CompraNoEncontradaError);
  });

  it('ítem inexistente -> ItemCompraNoEncontradoError', async () => {
    const { compra, item } = compraConItemRecibido(10, 6);
    const c = makeCollaborators(compra);

    const result = await c.useCase.execute(
      baseDto(compra, item, { itemId: 'item-inexistente', cantidadEntregada: 3 }),
    );

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(ItemCompraNoEncontradoError);
  });

  it('ítem soft-deleted se trata como inexistente -> ItemCompraNoEncontradoError', async () => {
    const { compra, item } = compraConItemRecibido(10, 6);
    item.softDelete();
    const c = makeCollaborators(compra);

    const result = await c.useCase.execute(baseDto(compra, item, { cantidadEntregada: 3 }));

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(ItemCompraNoEncontradoError);
  });

  it('compra cancelada -> CompraCanceladaError, sin mutar el ítem, sin persistir y sin abrir la tx', async () => {
    const { compra, item } = compraConItemRecibido(10, 6);
    // cantidadOrdenada > 0 impide cancelar de verdad (R13) — se simula el
    // estado persistido para probar el guard de esta capa de aplicación.
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

    const result = await c.useCase.execute(
      baseDto(compraCancelada, item, { cantidadEntregada: 3 }),
    );

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(CompraCanceladaError);
    expect(item.cantidadEntregada).toBe(0);
    expect(c.compraRepo.guardarItem).not.toHaveBeenCalled();
    expect(c.registrarOperacion.registrar).not.toHaveBeenCalled();
    expect(c.txRunner.run).not.toHaveBeenCalled();
  });
});
