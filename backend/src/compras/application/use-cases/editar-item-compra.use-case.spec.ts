/**
 * PR-15 [UNIT] — RED→GREEN: `EditarItemCompraUseCase` (§4.2 S12-S14, §4.4).
 *
 * Todos los puertos mockeados (`vi.fn`) — sin DB. Cubre:
 * - S12: editar `cantidad`/`monto`/`moneda` con el ítem PENDIENTE → OK.
 * - S13: lo mismo con el ítem APROBADO **o** RECHAZADO → `ItemCompraCongeladoError`,
 *   SIN persistir ni registrar bitácora (corolario: spy con 0 llamadas).
 * - S14: `descripcion`/`proveedor`/`fechaCotizacion`/`observaciones` siguen
 *   editables con el ítem ya decidido (APROBADO) — el congelamiento es de
 *   los 3 campos numéricos/moneda, no del ítem entero.
 * - Toda mutación exitosa corre dentro de `txRunner.run(...)` y registra
 *   EXACTAMENTE 1 `OperacionCompra` de tipo `ITEM_EDITADO` (S35).
 * - Compra inexistente/soft-deleted → `CompraNoEncontradaError`, sin tx.
 * - Ítem inexistente/de otra compra → `ItemCompraNoEncontradoError` (vía
 *   `CompraEntity.editarItem`), sin tx.
 *
 * Ref spec: sdd/redisenio-modulo-compras/spec §4.2 (S12-S14), §4.10 (S35).
 * Ref design: ADR-C2, ADR-C3, ADR-C4. Tarea: PR-15.
 */
import { EditarItemCompraUseCase, EditarItemCompraDto } from './editar-item-compra.use-case';
import { CompraEntity, CompraCreateProps } from '../../domain/entities/compra.entity';
import { CompraAgregarItemProps } from '../../domain/entities/compra.entity';
import {
  CompraNoEncontradaError,
  ItemCompraCongeladoError,
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

/** Construye una `CompraEntity` con UN ítem agregado, retorna la compra y el id del ítem. */
function crearCompraConItem(itemOverrides: Partial<CompraAgregarItemProps> = {}): {
  compra: CompraEntity;
  itemId: string;
} {
  const compra = CompraEntity.create(crearPropsCompraValidas(), 'compra-1');
  compra.agregarItem(datosItemValido(itemOverrides));
  const itemId = compra.items[0].id;
  return { compra, itemId };
}

function baseDto(overrides: Partial<EditarItemCompraDto> = {}): EditarItemCompraDto {
  return {
    compraId: 'compra-1',
    itemId: 'item-1',
    usuarioId: 'usuario-editor-1',
    ...overrides,
  };
}

describe('EditarItemCompraUseCase', () => {
  function makeCollaborators() {
    const compraRepo = {
      findByIdConItems: vi.fn(),
      guardar: vi.fn().mockResolvedValue(undefined),
      guardarItem: vi.fn().mockResolvedValue(undefined),
    };
    const registrarOperacion = { registrar: vi.fn().mockResolvedValue(undefined) };
    const txRunner = { run: vi.fn((fn: () => Promise<unknown>) => fn()) };

    const useCase = new EditarItemCompraUseCase(
      compraRepo as never,
      registrarOperacion as never,
      txRunner as never,
    );

    return { useCase, compraRepo, registrarOperacion, txRunner };
  }

  it('S12: edita cantidad/monto/moneda de un ítem PENDIENTE — OK, persiste y registra 1 bitácora ITEM_EDITADO', async () => {
    const c = makeCollaborators();
    const { compra, itemId } = crearCompraConItem();
    c.compraRepo.findByIdConItems.mockResolvedValue(compra);

    const result = await c.useCase.execute(
      baseDto({ itemId, cantidad: 5, monto: 200000, moneda: 'USD' }),
    );

    expect(result.isOk()).toBe(true);
    const item = result.getValue();
    expect(item.cantidad).toBe(5);
    expect(item.monto).toBe(200000);
    expect(item.moneda).toBe('USD');

    expect(c.txRunner.run).toHaveBeenCalledTimes(1);
    expect(c.compraRepo.guardar).toHaveBeenCalledWith(compra);
    expect(c.compraRepo.guardarItem).toHaveBeenCalledWith(item);
    expect(c.registrarOperacion.registrar).toHaveBeenCalledTimes(1);
    const opRegistrada = c.registrarOperacion.registrar.mock.calls[0][0];
    expect(opRegistrada.compraId).toBe('compra-1');
    expect(opRegistrada.itemCompraId).toBe(itemId);
    expect(opRegistrada.tipo).toBe('ITEM_EDITADO');
    expect(opRegistrada.usuarioId).toBe('usuario-editor-1');
  });

  it('S13: editar cantidad/monto/moneda de un ítem APROBADO → ItemCompraCongeladoError, sin persistir ni registrar bitácora', async () => {
    const c = makeCollaborators();
    const { compra, itemId } = crearCompraConItem();
    compra.items[0].aprobar('aprobador-1');
    c.compraRepo.findByIdConItems.mockResolvedValue(compra);

    const result = await c.useCase.execute(baseDto({ itemId, cantidad: 10 }));

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(ItemCompraCongeladoError);
    expect(c.txRunner.run).not.toHaveBeenCalled();
    expect(c.compraRepo.guardar).not.toHaveBeenCalled();
    expect(c.compraRepo.guardarItem).not.toHaveBeenCalled();
    expect(c.registrarOperacion.registrar).not.toHaveBeenCalled();
  });

  it('S13: editar cantidad/monto/moneda de un ítem RECHAZADO → ItemCompraCongeladoError, sin persistir ni registrar bitácora', async () => {
    const c = makeCollaborators();
    const { compra, itemId } = crearCompraConItem();
    compra.items[0].rechazar('aprobador-1');
    c.compraRepo.findByIdConItems.mockResolvedValue(compra);

    const result = await c.useCase.execute(baseDto({ itemId, monto: 999 }));

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(ItemCompraCongeladoError);
    expect(c.txRunner.run).not.toHaveBeenCalled();
    expect(c.registrarOperacion.registrar).not.toHaveBeenCalled();
  });

  it('S14: descripcion/proveedor/fechaCotizacion/observaciones siguen editables con el ítem APROBADO', async () => {
    const c = makeCollaborators();
    const { compra, itemId } = crearCompraConItem();
    compra.items[0].aprobar('aprobador-1');
    c.compraRepo.findByIdConItems.mockResolvedValue(compra);

    const nuevaFecha = new Date('2026-02-01');
    const result = await c.useCase.execute(
      baseDto({
        itemId,
        descripcion: 'Notebook Dell Latitude (actualizado)',
        proveedor: 'Otro proveedor SA',
        fechaCotizacion: nuevaFecha,
        observaciones: 'Cambio de proveedor por stock',
      }),
    );

    expect(result.isOk()).toBe(true);
    const item = result.getValue();
    expect(item.descripcion).toBe('Notebook Dell Latitude (actualizado)');
    expect(item.proveedor).toBe('Otro proveedor SA');
    expect(item.fechaCotizacion).toBe(nuevaFecha);
    expect(item.observaciones).toBe('Cambio de proveedor por stock');
    expect(c.registrarOperacion.registrar).toHaveBeenCalledTimes(1);
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
