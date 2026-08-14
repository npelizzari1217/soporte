/**
 * PR-17 [UNIT] — RED→GREEN: `RegistrarCompraDeItemUseCase`.
 *
 * Todos los puertos/colaboradores mockeados (`vi.fn`) — sin DB. Cubre:
 * - S15: compra parcial (`cantidadComprada < cantidad`) OK — `comprado`
 *   sigue `false`.
 * - S16: registrar sobre un ítem NO aprobado -> `ItemCompraNoAprobadoError`.
 * - S17: registrar más de lo pedido -> `CantidadCompradaExcedeSolicitadaError`.
 * - S18: retroceder respecto de lo ya registrado -> `CantidadCompradaRetrocedeError`.
 * - S35: exactamente 1 `OperacionCompra` de tipo `COMPRA_REGISTRADA` por
 *   mutación exitosa.
 * - Corolario de S35: si la mutación falla, la bitácora queda en 0 llamadas.
 * - 404: compra inexistente / ítem inexistente (id equivocado o soft-deleted).
 * - Regla transversal: TODO dentro de `txRunner.run(...)` (find + mutate +
 *   guardarItem + registrarOperacion, atómico — patrón de
 *   `AgregarItemCompraUseCase`).
 *
 * `ItemCompraEntity.registrarCompra()` ya resuelve la aritmética en
 * centésimas y los guards (S16-S18) — este spec verifica que el caso de uso
 * TRADUCE ese `Result`, no que reimplementa la regla.
 *
 * Ref spec: sdd/redisenio-modulo-compras/spec §4.5 (S15-S18), §4.10 (S35).
 * Ref design: ADR-C1, ADR-C2, ADR-C3, ADR-C4. Tarea: PR-17.
 */
import {
  RegistrarCompraDeItemUseCase,
  RegistrarCompraDeItemDto,
} from './registrar-compra-de-item.use-case';
import { CompraEntity } from '../../domain/entities/compra.entity';
import { ItemCompraEntity } from '../../domain/entities/item-compra.entity';
import {
  CompraCanceladaError,
  CompraNoEncontradaError,
  ItemCompraNoEncontradoError,
  ItemCompraNoAprobadoError,
  CantidadCompradaExcedeSolicitadaError,
  CantidadCompradaRetrocedeError,
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

/** Compra con un único ítem APROBADO de `cantidad` dada (default 10). */
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

/** Compra con un único ítem PENDIENTE (sin decidir) — para S16. */
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
  overrides: Partial<RegistrarCompraDeItemDto> = {},
): RegistrarCompraDeItemDto {
  return {
    compraId: compra.id,
    itemId: item.id,
    usuarioId: 'usuario-uuid',
    cantidadComprada: 4,
    ...overrides,
  };
}

describe('RegistrarCompraDeItemUseCase', () => {
  function makeCollaborators(compra: CompraEntity | null) {
    const compraRepo = {
      findByIdConItems: vi.fn().mockResolvedValue(compra),
      guardarItem: vi.fn().mockResolvedValue(undefined),
    };
    const registrarOperacion = { registrar: vi.fn().mockResolvedValue(undefined) };
    const txRunner = { run: vi.fn((fn: () => Promise<unknown>) => fn()) };

    const useCase = new RegistrarCompraDeItemUseCase(
      compraRepo as never,
      registrarOperacion as never,
      txRunner as never,
    );

    return { useCase, compraRepo, registrarOperacion, txRunner };
  }

  it('S15: registra una compra parcial — cantidadComprada < cantidad, comprado sigue false', async () => {
    const { compra, item } = compraConItemAprobado(10);
    const c = makeCollaborators(compra);

    const result = await c.useCase.execute(baseDto(compra, item, { cantidadComprada: 4 }));

    expect(result.isOk()).toBe(true);
    const itemResultado = result.getValue();
    expect(itemResultado.cantidadComprada).toBe(4);
    expect(itemResultado.comprado).toBe(false);
    expect(c.txRunner.run).toHaveBeenCalledTimes(1);
    expect(c.compraRepo.guardarItem).toHaveBeenCalledWith(itemResultado);
  });

  it('S16: registrar compra sobre un ítem NO aprobado -> ItemCompraNoAprobadoError, sin persistir ni registrar bitácora', async () => {
    const { compra, item } = compraConItemPendiente();
    const c = makeCollaborators(compra);

    const result = await c.useCase.execute(baseDto(compra, item, { cantidadComprada: 4 }));

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(ItemCompraNoAprobadoError);
    expect(c.compraRepo.guardarItem).not.toHaveBeenCalled();
    expect(c.registrarOperacion.registrar).not.toHaveBeenCalled();
  });

  it('S17: registrar más de lo pedido -> CantidadCompradaExcedeSolicitadaError, sin persistir ni registrar bitácora', async () => {
    const { compra, item } = compraConItemAprobado(10);
    const c = makeCollaborators(compra);

    const result = await c.useCase.execute(baseDto(compra, item, { cantidadComprada: 15 }));

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(CantidadCompradaExcedeSolicitadaError);
    expect(c.compraRepo.guardarItem).not.toHaveBeenCalled();
    expect(c.registrarOperacion.registrar).not.toHaveBeenCalled();
  });

  it('S18: retroceder respecto de lo ya registrado -> CantidadCompradaRetrocedeError, sin persistir ni registrar bitácora', async () => {
    const { compra, item } = compraConItemAprobado(10);
    item.registrarCompra(5);
    const c = makeCollaborators(compra);

    const result = await c.useCase.execute(baseDto(compra, item, { cantidadComprada: 3 }));

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(CantidadCompradaRetrocedeError);
    expect(item.cantidadComprada).toBe(5);
    expect(c.compraRepo.guardarItem).not.toHaveBeenCalled();
    expect(c.registrarOperacion.registrar).not.toHaveBeenCalled();
  });

  it('S35: registra exactamente 1 OperacionCompra de tipo COMPRA_REGISTRADA por mutación exitosa', async () => {
    const { compra, item } = compraConItemAprobado(10);
    const c = makeCollaborators(compra);

    await c.useCase.execute(baseDto(compra, item, { cantidadComprada: 4 }));

    expect(c.registrarOperacion.registrar).toHaveBeenCalledTimes(1);
    const operacion = c.registrarOperacion.registrar.mock.calls[0][0];
    expect(operacion.tipo).toBe('COMPRA_REGISTRADA');
    expect(operacion.compraId).toBe(compra.id);
    expect(operacion.itemCompraId).toBe(item.id);
    expect(operacion.usuarioId).toBe('usuario-uuid');
  });

  it('compra inexistente -> CompraNoEncontradaError, sin tocar bitácora', async () => {
    const { compra, item } = compraConItemAprobado(10);
    const c = makeCollaborators(null);

    const result = await c.useCase.execute(baseDto(compra, item, { cantidadComprada: 4 }));

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(CompraNoEncontradaError);
    expect(c.compraRepo.guardarItem).not.toHaveBeenCalled();
    expect(c.registrarOperacion.registrar).not.toHaveBeenCalled();
  });

  it('ítem inexistente (id equivocado) -> ItemCompraNoEncontradoError, sin tocar bitácora', async () => {
    const { compra, item } = compraConItemAprobado(10);
    const c = makeCollaborators(compra);

    const result = await c.useCase.execute(
      baseDto(compra, item, { itemId: 'item-inexistente', cantidadComprada: 4 }),
    );

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(ItemCompraNoEncontradoError);
    expect(c.registrarOperacion.registrar).not.toHaveBeenCalled();
  });

  it('ítem soft-deleted se trata como inexistente -> ItemCompraNoEncontradoError', async () => {
    const { compra, item } = compraConItemAprobado(10);
    item.softDelete();
    const c = makeCollaborators(compra);

    const result = await c.useCase.execute(baseDto(compra, item, { cantidadComprada: 4 }));

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(ItemCompraNoEncontradoError);
  });

  it('compra cancelada -> CompraCanceladaError, sin mutar el ítem, sin persistir y sin abrir la tx', async () => {
    const { compra, item } = compraConItemAprobado(10);
    const cancelacion = compra.cancelar('usuario-cancelador', 'Ya no se necesita');
    expect(cancelacion.isOk()).toBe(true); // precondición del test: la cancelación en sí es válida
    const c = makeCollaborators(compra);

    const result = await c.useCase.execute(baseDto(compra, item, { cantidadComprada: 4 }));

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(CompraCanceladaError);
    expect(item.cantidadComprada).toBe(0);
    expect(c.compraRepo.guardarItem).not.toHaveBeenCalled();
    expect(c.registrarOperacion.registrar).not.toHaveBeenCalled();
    expect(c.txRunner.run).not.toHaveBeenCalled();
  });
});
