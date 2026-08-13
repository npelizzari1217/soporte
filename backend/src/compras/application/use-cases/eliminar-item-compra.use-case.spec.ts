/**
 * PR-15 [UNIT] — RED→GREEN: `EliminarItemCompraUseCase` (§4.2 S6-S7).
 *
 * Todos los puertos mockeados (`vi.fn`) — sin DB. Cubre:
 * - S6: eliminar (soft delete) un ítem PENDIENTE o RECHAZADO → OK.
 * - S7: eliminar un ítem APROBADO → `ItemCompraAprobadoNoEliminableError`,
 *   SIN persistir ni registrar bitácora (corolario: spy con 0 llamadas).
 * - Toda eliminación exitosa corre dentro de `txRunner.run(...)` y registra
 *   EXACTAMENTE 1 `OperacionCompra` de tipo `ITEM_ELIMINADO` (S35).
 * - Los ítems eliminados quedan con `deletedAt` seteado (soft delete, no
 *   DELETE físico) y no cuentan para la derivación de estado (`n` = ítems
 *   no eliminados) — verificado indirectamente vía `item.isDeleted()`.
 * - Compra inexistente/soft-deleted → `CompraNoEncontradaError`, sin tx.
 * - Ítem inexistente en la compra → `ItemCompraNoEncontradoError`, sin tx.
 *
 * Ref spec: sdd/redisenio-modulo-compras/spec §4.2 (S6-S7), §4.10 (S35).
 * Ref design: ADR-C2, ADR-C4. Tarea: PR-15.
 */
import { EliminarItemCompraUseCase, EliminarItemCompraDto } from './eliminar-item-compra.use-case';
import { CompraEntity, CompraCreateProps } from '../../domain/entities/compra.entity';
import { CompraAgregarItemProps } from '../../domain/entities/compra.entity';
import {
  CompraNoEncontradaError,
  ItemCompraAprobadoNoEliminableError,
  ItemCompraNoEncontradoError,
} from '../../domain/errors/compras.errors';

function crearPropsCompraValidas(overrides: Partial<CompraCreateProps> = {}): CompraCreateProps {
  return {
    numero: 'COM-2026-00001',
    fechaSolicitud: new Date('2026-01-10'),
    motivo: 'Renovación de equipos de la sucursal norte',
    descripcion: null,
    solicitanteId: 'usuario-1',
    cicloId: 'ciclo-1',
    ...overrides,
  };
}

function datosItemValido(overrides: Partial<CompraAgregarItemProps> = {}): CompraAgregarItemProps {
  return {
    descripcion: 'Notebook Dell Latitude',
    cantidad: 2,
    proveedor: 'Proveedor SA',
    monto: 150000,
    moneda: 'ARS',
    fechaCotizacion: new Date('2026-01-15'),
    observaciones: null,
    ...overrides,
  };
}

function crearCompraConItem(itemOverrides: Partial<CompraAgregarItemProps> = {}): {
  compra: CompraEntity;
  itemId: string;
} {
  const compra = CompraEntity.create(crearPropsCompraValidas(), 'compra-1');
  compra.agregarItem(datosItemValido(itemOverrides));
  const itemId = compra.items[0].id;
  return { compra, itemId };
}

function baseDto(overrides: Partial<EliminarItemCompraDto> = {}): EliminarItemCompraDto {
  return {
    compraId: 'compra-1',
    itemId: 'item-1',
    usuarioId: 'usuario-editor-1',
    ...overrides,
  };
}

describe('EliminarItemCompraUseCase', () => {
  function makeCollaborators() {
    const compraRepo = {
      findByIdConItems: vi.fn(),
      guardar: vi.fn().mockResolvedValue(undefined),
      guardarItem: vi.fn().mockResolvedValue(undefined),
    };
    const registrarOperacion = { registrar: vi.fn().mockResolvedValue(undefined) };
    const txRunner = { run: vi.fn((fn: () => Promise<unknown>) => fn()) };

    const useCase = new EliminarItemCompraUseCase(
      compraRepo as never,
      registrarOperacion as never,
      txRunner as never,
    );

    return { useCase, compraRepo, registrarOperacion, txRunner };
  }

  it('S6: elimina (soft delete) un ítem PENDIENTE — OK, persiste y registra 1 bitácora ITEM_ELIMINADO', async () => {
    const c = makeCollaborators();
    const { compra, itemId } = crearCompraConItem();
    c.compraRepo.findByIdConItems.mockResolvedValue(compra);

    const result = await c.useCase.execute(baseDto({ itemId }));

    expect(result.isOk()).toBe(true);
    const item = compra.items.find((i) => i.id === itemId)!;
    expect(item.isDeleted()).toBe(true);

    expect(c.txRunner.run).toHaveBeenCalledTimes(1);
    expect(c.compraRepo.guardar).toHaveBeenCalledWith(compra);
    expect(c.compraRepo.guardarItem).toHaveBeenCalledWith(item);
    expect(c.registrarOperacion.registrar).toHaveBeenCalledTimes(1);
    const opRegistrada = c.registrarOperacion.registrar.mock.calls[0][0];
    expect(opRegistrada.compraId).toBe('compra-1');
    expect(opRegistrada.itemCompraId).toBe(itemId);
    expect(opRegistrada.tipo).toBe('ITEM_ELIMINADO');
    expect(opRegistrada.usuarioId).toBe('usuario-editor-1');
  });

  it('S6: elimina (soft delete) un ítem RECHAZADO — OK', async () => {
    const c = makeCollaborators();
    const { compra, itemId } = crearCompraConItem();
    compra.items[0].rechazar('aprobador-1');
    c.compraRepo.findByIdConItems.mockResolvedValue(compra);

    const result = await c.useCase.execute(baseDto({ itemId }));

    expect(result.isOk()).toBe(true);
    expect(compra.items.find((i) => i.id === itemId)!.isDeleted()).toBe(true);
    expect(c.registrarOperacion.registrar).toHaveBeenCalledTimes(1);
  });

  it('S7: eliminar un ítem APROBADO → ItemCompraAprobadoNoEliminableError, sin persistir ni registrar bitácora', async () => {
    const c = makeCollaborators();
    const { compra, itemId } = crearCompraConItem();
    compra.items[0].aprobar('aprobador-1');
    c.compraRepo.findByIdConItems.mockResolvedValue(compra);

    const result = await c.useCase.execute(baseDto({ itemId }));

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(ItemCompraAprobadoNoEliminableError);
    expect(compra.items.find((i) => i.id === itemId)!.isDeleted()).toBe(false);
    expect(c.txRunner.run).not.toHaveBeenCalled();
    expect(c.compraRepo.guardar).not.toHaveBeenCalled();
    expect(c.compraRepo.guardarItem).not.toHaveBeenCalled();
    expect(c.registrarOperacion.registrar).not.toHaveBeenCalled();
  });

  it('compra inexistente → CompraNoEncontradaError, sin tocar tx', async () => {
    const c = makeCollaborators();
    c.compraRepo.findByIdConItems.mockResolvedValue(null);

    const result = await c.useCase.execute(baseDto());

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(CompraNoEncontradaError);
    expect(c.txRunner.run).not.toHaveBeenCalled();
  });

  it('compra soft-deleted → CompraNoEncontradaError', async () => {
    const c = makeCollaborators();
    const { compra } = crearCompraConItem();
    compra.softDelete();
    c.compraRepo.findByIdConItems.mockResolvedValue(compra);

    const result = await c.useCase.execute(baseDto());

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(CompraNoEncontradaError);
  });

  it('ítem inexistente en la compra → ItemCompraNoEncontradoError, sin tx', async () => {
    const c = makeCollaborators();
    const { compra } = crearCompraConItem();
    c.compraRepo.findByIdConItems.mockResolvedValue(compra);

    const result = await c.useCase.execute(baseDto({ itemId: 'item-inexistente' }));

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(ItemCompraNoEncontradoError);
    expect(c.txRunner.run).not.toHaveBeenCalled();
  });
});
