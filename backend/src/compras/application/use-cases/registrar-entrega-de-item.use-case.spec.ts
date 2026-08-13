/**
 * PR-17 [UNIT] — RED→GREEN: `RegistrarEntregaDeItemUseCase`.
 *
 * Todos los puertos/colaboradores mockeados (`vi.fn`) — sin DB. Cubre:
 * - S19: entregar dentro de lo comprado -> OK.
 * - S20: entregar más de lo comprado -> `CantidadEntregadaExcedeCompradaError`.
 * - S21: retroceder respecto de lo ya registrado -> `CantidadEntregadaRetrocedeError`.
 * - S35: exactamente 1 `OperacionCompra` de tipo `ENTREGA_REGISTRADA` por
 *   mutación exitosa.
 * - Corolario de S35: si la mutación falla, la bitácora queda en 0 llamadas.
 * - 404: compra inexistente / ítem inexistente (id equivocado o soft-deleted).
 * - Regla transversal: TODO dentro de `txRunner.run(...)` (find + mutate +
 *   guardarItem + registrarOperacion, atómico — patrón de
 *   `AgregarItemCompraUseCase`).
 *
 * `ItemCompraEntity.registrarEntrega()` ya resuelve la aritmética en
 * centésimas y los guards (S19-S21) — este spec verifica que el caso de uso
 * TRADUCE ese `Result`, no que reimplementa la regla.
 *
 * Ref spec: sdd/redisenio-modulo-compras/spec §4.6 (S19-S21), §4.10 (S35).
 * Ref design: ADR-C1, ADR-C2, ADR-C3, ADR-C4. Tarea: PR-17.
 */
import {
  RegistrarEntregaDeItemUseCase,
  RegistrarEntregaDeItemDto,
} from './registrar-entrega-de-item.use-case';
import { CompraEntity } from '../../domain/entities/compra.entity';
import { ItemCompraEntity } from '../../domain/entities/item-compra.entity';
import {
  CompraNoEncontradaError,
  ItemCompraNoEncontradoError,
  CantidadEntregadaExcedeCompradaError,
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

/** Compra con un único ítem APROBADO con `cantidadComprada` ya registrada (default 10 pedidas, 6 compradas). */
function compraConItemComprado(
  cantidad = 10,
  cantidadComprada = 6,
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
  item.registrarCompra(cantidadComprada);
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

  it('S19: entrega dentro de lo comprado -> OK, persiste y registra bitácora dentro de la tx', async () => {
    const { compra, item } = compraConItemComprado(10, 6);
    const c = makeCollaborators(compra);

    const result = await c.useCase.execute(baseDto(compra, item, { cantidadEntregada: 3 }));

    expect(result.isOk()).toBe(true);
    const itemResultado = result.getValue();
    expect(itemResultado.cantidadEntregada).toBe(3);
    expect(itemResultado.entregado).toBe(false);
    expect(c.txRunner.run).toHaveBeenCalledTimes(1);
    expect(c.compraRepo.guardarItem).toHaveBeenCalledWith(itemResultado);
  });

  it('S20: entregar más de lo comprado -> CantidadEntregadaExcedeCompradaError, sin persistir ni registrar bitácora', async () => {
    const { compra, item } = compraConItemComprado(10, 6);
    const c = makeCollaborators(compra);

    const result = await c.useCase.execute(baseDto(compra, item, { cantidadEntregada: 8 }));

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(CantidadEntregadaExcedeCompradaError);
    expect(c.compraRepo.guardarItem).not.toHaveBeenCalled();
    expect(c.registrarOperacion.registrar).not.toHaveBeenCalled();
  });

  it('S21: retroceder respecto de lo ya registrado -> CantidadEntregadaRetrocedeError, sin persistir ni registrar bitácora', async () => {
    const { compra, item } = compraConItemComprado(10, 6);
    item.registrarEntrega(4);
    const c = makeCollaborators(compra);

    const result = await c.useCase.execute(baseDto(compra, item, { cantidadEntregada: 2 }));

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(CantidadEntregadaRetrocedeError);
    expect(item.cantidadEntregada).toBe(4);
    expect(c.compraRepo.guardarItem).not.toHaveBeenCalled();
    expect(c.registrarOperacion.registrar).not.toHaveBeenCalled();
  });

  it('S35: registra exactamente 1 OperacionCompra de tipo ENTREGA_REGISTRADA por mutación exitosa', async () => {
    const { compra, item } = compraConItemComprado(10, 6);
    const c = makeCollaborators(compra);

    await c.useCase.execute(baseDto(compra, item, { cantidadEntregada: 3 }));

    expect(c.registrarOperacion.registrar).toHaveBeenCalledTimes(1);
    const operacion = c.registrarOperacion.registrar.mock.calls[0][0];
    expect(operacion.tipo).toBe('ENTREGA_REGISTRADA');
    expect(operacion.compraId).toBe(compra.id);
    expect(operacion.itemCompraId).toBe(item.id);
    expect(operacion.usuarioId).toBe('usuario-uuid');
  });

  it('compra inexistente -> CompraNoEncontradaError, sin tocar bitácora', async () => {
    const { compra, item } = compraConItemComprado(10, 6);
    const c = makeCollaborators(null);

    const result = await c.useCase.execute(baseDto(compra, item, { cantidadEntregada: 3 }));

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(CompraNoEncontradaError);
    expect(c.compraRepo.guardarItem).not.toHaveBeenCalled();
    expect(c.registrarOperacion.registrar).not.toHaveBeenCalled();
  });

  it('ítem inexistente (id equivocado) -> ItemCompraNoEncontradoError, sin tocar bitácora', async () => {
    const { compra, item } = compraConItemComprado(10, 6);
    const c = makeCollaborators(compra);

    const result = await c.useCase.execute(
      baseDto(compra, item, { itemId: 'item-inexistente', cantidadEntregada: 3 }),
    );

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(ItemCompraNoEncontradoError);
    expect(c.registrarOperacion.registrar).not.toHaveBeenCalled();
  });

  it('ítem soft-deleted se trata como inexistente -> ItemCompraNoEncontradoError', async () => {
    const { compra, item } = compraConItemComprado(10, 6);
    item.softDelete();
    const c = makeCollaborators(compra);

    const result = await c.useCase.execute(baseDto(compra, item, { cantidadEntregada: 3 }));

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(ItemCompraNoEncontradoError);
  });
});
