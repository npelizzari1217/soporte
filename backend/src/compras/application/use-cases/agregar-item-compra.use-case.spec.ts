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
  function makeCollaborators(compra: CompraEntity | null = compraActiva()) {
    const compraRepo = {
      findByIdConItems: vi.fn().mockResolvedValue(compra),
      guardar: vi.fn().mockResolvedValue(undefined),
      guardarItem: vi.fn().mockResolvedValue(undefined),
    };
    const registrarOperacion = { registrar: vi.fn().mockResolvedValue(undefined) };
    const txRunner = { run: vi.fn((fn: () => Promise<unknown>) => fn()) };

    const useCase = new AgregarItemCompraUseCase(
      compraRepo as never,
      registrarOperacion as never,
      txRunner as never,
    );

    return { useCase, compraRepo, registrarOperacion, txRunner };
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
});
