/**
 * WU-23 [UNIT] — RED→GREEN: `EditarFechaEtapaDeItemUseCase` (R4/S55).
 */
import {
  EditarFechaEtapaDeItemUseCase,
  EditarFechaEtapaDeItemDto,
} from './editar-fecha-etapa-de-item.use-case';
import { CompraEntity } from '../../domain/entities/compra.entity';
import { ItemCompraEntity } from '../../domain/entities/item-compra.entity';
import {
  CompraCanceladaError,
  CompraNoEncontradaError,
  ItemCompraNoEncontradoError,
  FechaEtapasFueraDeOrdenError,
} from '../../domain/errors/compras.errors';

function compraConItemEnCurso(): { compra: CompraEntity; item: ItemCompraEntity } {
  const compra = CompraEntity.create(
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
  compra.agregarItem({
    descripcion: 'Resma de papel A4',
    cantidad: 10,
    proveedor: 'Proveedor SA',
    monto: 1500,
    moneda: 'ARS',
    fechaCotizacion: new Date('2026-08-01'),
    observaciones: null,
  });
  const item = compra.items[0];
  item.aprobar('aprobador-uuid');
  item.registrarOrden(10, new Date('2026-08-10'));
  item.registrarRecepcion(8, new Date('2026-08-12'));
  return { compra, item };
}

function baseDto(
  compra: CompraEntity,
  item: ItemCompraEntity,
  overrides: Partial<EditarFechaEtapaDeItemDto> = {},
): EditarFechaEtapaDeItemDto {
  return {
    compraId: compra.id,
    itemId: item.id,
    usuarioId: 'usuario-uuid',
    etapa: 'RECEPCION',
    fecha: new Date('2026-08-11'),
    ...overrides,
  };
}

describe('EditarFechaEtapaDeItemUseCase', () => {
  function makeCollaborators(compra: CompraEntity | null) {
    const compraRepo = {
      findByIdConItems: vi.fn().mockResolvedValue(compra),
      guardarItem: vi.fn().mockResolvedValue(undefined),
    };
    const registrarOperacion = { registrar: vi.fn().mockResolvedValue(undefined) };
    const txRunner = { run: vi.fn((fn: () => Promise<unknown>) => fn()) };

    const useCase = new EditarFechaEtapaDeItemUseCase(
      compraRepo as never,
      registrarOperacion as never,
      txRunner as never,
    );

    return { useCase, compraRepo, registrarOperacion, txRunner };
  }

  it('edita la fecha de una etapa ya registrada, preservando el orden', async () => {
    const { compra, item } = compraConItemEnCurso();
    const c = makeCollaborators(compra);

    const result = await c.useCase.execute(
      baseDto(compra, item, { fecha: new Date('2026-08-11') }),
    );

    expect(result.isOk()).toBe(true);
    expect(result.getValue().fechaRecepcion).toEqual(new Date('2026-08-11'));
    expect(c.txRunner.run).toHaveBeenCalledTimes(1);
  });

  it('S55: edición que deja las fechas fuera de orden -> FechaEtapasFueraDeOrdenError, sin persistir', async () => {
    const { compra, item } = compraConItemEnCurso();
    const c = makeCollaborators(compra);

    const result = await c.useCase.execute(
      baseDto(compra, item, { etapa: 'ORDEN', fecha: new Date('2026-08-13') }),
    );

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(FechaEtapasFueraDeOrdenError);
    expect(c.compraRepo.guardarItem).not.toHaveBeenCalled();
    expect(c.registrarOperacion.registrar).not.toHaveBeenCalled();
  });

  it('S35: registra exactamente 1 OperacionCompra de tipo ITEM_EDITADO', async () => {
    const { compra, item } = compraConItemEnCurso();
    const c = makeCollaborators(compra);

    await c.useCase.execute(baseDto(compra, item));

    expect(c.registrarOperacion.registrar).toHaveBeenCalledTimes(1);
    expect(c.registrarOperacion.registrar.mock.calls[0][0].tipo).toBe('ITEM_EDITADO');
  });

  it('compra inexistente -> CompraNoEncontradaError', async () => {
    const { compra, item } = compraConItemEnCurso();
    const c = makeCollaborators(null);

    const result = await c.useCase.execute(baseDto(compra, item));

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(CompraNoEncontradaError);
  });

  it('ítem inexistente -> ItemCompraNoEncontradoError', async () => {
    const { compra, item } = compraConItemEnCurso();
    const c = makeCollaborators(compra);

    const result = await c.useCase.execute(baseDto(compra, item, { itemId: 'inexistente' }));

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(ItemCompraNoEncontradoError);
  });

  it('compra cancelada -> CompraCanceladaError, sin abrir la tx', async () => {
    const { compra, item } = compraConItemEnCurso();
    // cantidadOrdenada > 0 impide cancelar de verdad (R13) — se simula el
    // estado persistido, mismo criterio que los otros use cases de etapa.
    const compraCancelada = CompraEntity.reconstitute(
      {
        numero: compra.numero,
        fechaSolicitud: compra.fechaSolicitud,
        motivo: compra.motivo,
        descripcion: null,
        solicitanteId: compra.solicitanteId,
        cicloId: compra.cicloId,
        canceladaEn: new Date('2026-08-20'),
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

    const result = await c.useCase.execute(baseDto(compraCancelada, item));

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(CompraCanceladaError);
    expect(c.txRunner.run).not.toHaveBeenCalled();
  });
});
