/**
 * PR-18 [UNIT] — RED→GREEN: `CancelarCompraUseCase`.
 *
 * Todos los puertos/colaboradores mockeados (`vi.fn`) — sin DB. Cubre:
 * - S27: cancelar una compra CON ítems pero SIN orden emitida (todos
 *   `cantidadOrdenada=0`) -> OK.
 * - S28: compra ya cerrada (todos los aprobados entregados o cerrados con
 *   faltante) -> `CompraYaCerradaError`, sin tocar la tx.
 * - S29 (WU-21, R13): algún ítem activo con `cantidadOrdenada > 0` ->
 *   `CompraConOrdenEmitidaError`, sin tocar la tx.
 * - S30: compra ya cancelada -> `CompraYaCanceladaError`, sin tocar la tx.
 * - S31 — el borde que NO debe bloquearse: cancelar una compra SIN ÍTEMS
 *   (`items=[]`) está PERMITIDO. La guarda de S29 es EXISTENCIAL
 *   (`itemsActivos().some(...)`) y sobre el conjunto vacío `[].some(...)`
 *   es `false` — no se dispara. Es la asimetría deliberada del spec frente
 *   a los cuantificadores universales de §3 (que sí fuerzan `false` sobre
 *   vacuidad) — este test prueba la lectura EXISTENCIAL, no la unifica con
 *   la universal.
 * - Regla 0: tras cancelar, `compra.estado === 'CANCELADO'` incluso si
 *   TODOS los ítems activos están APROBADOS (Regla 0 tiene prioridad
 *   absoluta sobre la tabla de verdad T1-T5).
 * - 404: compra inexistente.
 * - S35: exactamente 1 `OperacionCompra` de tipo `CANCELACION` (cabecera,
 *   `itemCompraId=null`) por cancelación exitosa. Corolario: si falla, 0
 *   llamadas.
 *
 * Ref spec: sdd/redisenio-modulo-compras/spec §4.8 (S27-S31), §4.10 (S35).
 * Ref design: ADR-C2, ADR-C4. Tarea: PR-18.
 */
import { CancelarCompraUseCase, CancelarCompraDto } from './cancelar-compra.use-case';
import { CompraEntity, CompraProps } from '../../domain/entities/compra.entity';
import { ItemCompraEntity, ItemCompraCreateProps } from '../../domain/entities/item-compra.entity';
import {
  CompraConOrdenEmitidaError,
  CompraNoEncontradaError,
  CompraYaCanceladaError,
  CompraYaCerradaError,
} from '../../domain/errors/compras.errors';

const COMPRA_ID = 'compra-1';

function crearItemPropsValidas(
  overrides: Partial<ItemCompraCreateProps> = {},
): ItemCompraCreateProps {
  return {
    compraId: COMPRA_ID,
    descripcion: 'Notebook Dell Latitude',
    cantidad: 10,
    proveedor: 'Proveedor SA',
    monto: 150000,
    moneda: 'ARS',
    fechaCotizacion: new Date('2026-01-15'),
    observaciones: null,
    ...overrides,
  };
}

function crearCompra(
  items: ItemCompraEntity[],
  overrides: Partial<CompraProps> = {},
): CompraEntity {
  const props: CompraProps = {
    numero: 'COM-2026-00001',
    fechaSolicitud: new Date('2026-01-01'),
    motivo: 'Compra de prueba',
    descripcion: null,
    solicitanteId: 'solicitante-1',
    cicloId: 'ciclo-1',
    canceladaEn: null,
    canceladoPorId: null,
    motivoCancelacion: null,
    ...overrides,
  };
  return CompraEntity.reconstitute(
    props,
    items,
    COMPRA_ID,
    new Date('2026-01-01'),
    new Date('2026-01-01'),
    null,
  );
}

function baseDto(overrides: Partial<CancelarCompraDto> = {}): CancelarCompraDto {
  return {
    compraId: COMPRA_ID,
    usuarioId: 'usuario-cancela',
    motivo: 'El área solicitante desistió de la compra.',
    ...overrides,
  };
}

describe('CancelarCompraUseCase', () => {
  function makeCollaborators() {
    const compraRepo = {
      findByIdConItems: vi.fn(),
      guardar: vi.fn().mockResolvedValue(undefined),
    };
    const registrarOperacionCompra = { registrar: vi.fn().mockResolvedValue(undefined) };
    // txRunner.run ejecuta el callback DIRECTAMENTE (sin Prisma real) — pero
    // preserva la semántica "corre dentro de la tx" para los tests.
    const txRunner = { run: vi.fn((fn: () => Promise<unknown>) => fn()) };

    const useCase = new CancelarCompraUseCase(
      compraRepo as never,
      registrarOperacionCompra as never,
      txRunner as never,
    );

    return { useCase, compraRepo, registrarOperacionCompra, txRunner };
  }

  it('S27: cancela una compra CON ítems pero SIN compras registradas — setea canceladaEn/canceladoPorId/motivoCancelacion, persiste la cabecera y registra CANCELACION dentro de la tx', async () => {
    const c = makeCollaborators();
    const item = ItemCompraEntity.create(crearItemPropsValidas());
    const compra = crearCompra([item]);
    c.compraRepo.findByIdConItems.mockResolvedValue(compra);

    const result = await c.useCase.execute(baseDto());

    expect(result.isOk()).toBe(true);
    const cancelada = result.getValue();
    expect(cancelada.canceladaEn).not.toBeNull();
    expect(cancelada.canceladoPorId).toBe('usuario-cancela');
    expect(cancelada.motivoCancelacion).toBe('El área solicitante desistió de la compra.');
    expect(cancelada.estado).toBe('CANCELADO');

    expect(c.txRunner.run).toHaveBeenCalledTimes(1);
    expect(c.compraRepo.guardar).toHaveBeenCalledWith(compra);
  });

  it('Regla 0: tras cancelar, el estado es CANCELADO aunque TODOS los ítems activos estén APROBADOS', async () => {
    const c = makeCollaborators();
    const item = ItemCompraEntity.create(crearItemPropsValidas());
    item.aprobar('aprobador-1'); // APROBADO, sin orden emitida -> no dispara S29
    const compra = crearCompra([item]);
    c.compraRepo.findByIdConItems.mockResolvedValue(compra);

    const result = await c.useCase.execute(baseDto());

    expect(result.isOk()).toBe(true);
    expect(result.getValue().estado).toBe('CANCELADO');
  });

  it('S35: registra exactamente 1 OperacionCompra de tipo CANCELACION (cabecera, itemCompraId=null) en la cancelación exitosa', async () => {
    const c = makeCollaborators();
    const item = ItemCompraEntity.create(crearItemPropsValidas());
    const compra = crearCompra([item]);
    c.compraRepo.findByIdConItems.mockResolvedValue(compra);

    await c.useCase.execute(baseDto());

    expect(c.registrarOperacionCompra.registrar).toHaveBeenCalledTimes(1);
    const operacion = c.registrarOperacionCompra.registrar.mock.calls[0][0];
    expect(operacion.tipo).toBe('CANCELACION');
    expect(operacion.compraId).toBe(COMPRA_ID);
    expect(operacion.itemCompraId).toBeNull();
    expect(operacion.usuarioId).toBe('usuario-cancela');
  });

  it('S31 — el borde que NO debe bloquearse: cancelar una compra SIN ítems (items=[]) está PERMITIDO (guarda existencial de S29 no se dispara sobre el conjunto vacío)', async () => {
    const c = makeCollaborators();
    const compra = crearCompra([]);
    c.compraRepo.findByIdConItems.mockResolvedValue(compra);

    const result = await c.useCase.execute(baseDto());

    expect(result.isOk()).toBe(true);
    expect(result.getValue().estado).toBe('CANCELADO');
    expect(c.txRunner.run).toHaveBeenCalledTimes(1);
    expect(c.registrarOperacionCompra.registrar).toHaveBeenCalledTimes(1);
  });

  it('compra inexistente -> CompraNoEncontradaError, sin tocar la tx', async () => {
    const c = makeCollaborators();
    c.compraRepo.findByIdConItems.mockResolvedValue(null);

    const result = await c.useCase.execute(baseDto());

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(CompraNoEncontradaError);
    expect(c.txRunner.run).not.toHaveBeenCalled();
    expect(c.registrarOperacionCompra.registrar).not.toHaveBeenCalled();
  });

  it('S28: compra ya cerrada (aprobado entregado en su totalidad) -> CompraYaCerradaError, sin tocar la tx', async () => {
    const c = makeCollaborators();
    const item = ItemCompraEntity.create(crearItemPropsValidas());
    item.aprobar('aprobador-1');
    item.registrarOrden(10, new Date('2026-01-16'));
    item.registrarRecepcion(10, new Date('2026-01-17'));
    item.registrarEntrega(10, new Date('2026-01-18')); // comprado=true, entregado=true -> compra.cerrado=true
    const compra = crearCompra([item]);
    c.compraRepo.findByIdConItems.mockResolvedValue(compra);

    const result = await c.useCase.execute(baseDto());

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(CompraYaCerradaError);
    expect(c.txRunner.run).not.toHaveBeenCalled();
    expect(c.registrarOperacionCompra.registrar).not.toHaveBeenCalled();
  });

  it('S29 (WU-21, R13): algún ítem activo con cantidadOrdenada > 0 -> CompraConOrdenEmitidaError, sin tocar la tx', async () => {
    const c = makeCollaborators();
    const item = ItemCompraEntity.create(crearItemPropsValidas());
    item.aprobar('aprobador-1');
    item.registrarOrden(4, new Date('2026-01-16')); // orden emitida, pero nada recibido todavía
    const compra = crearCompra([item]);
    c.compraRepo.findByIdConItems.mockResolvedValue(compra);

    const result = await c.useCase.execute(baseDto());

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(CompraConOrdenEmitidaError);
    expect(c.txRunner.run).not.toHaveBeenCalled();
    expect(c.registrarOperacionCompra.registrar).not.toHaveBeenCalled();
  });

  it('S30: compra ya cancelada -> CompraYaCanceladaError, sin tocar la tx', async () => {
    const c = makeCollaborators();
    const item = ItemCompraEntity.create(crearItemPropsValidas());
    const compra = crearCompra([item], {
      canceladaEn: new Date('2026-01-05'),
      canceladoPorId: 'otro-usuario',
      motivoCancelacion: 'Cancelación previa.',
    });
    c.compraRepo.findByIdConItems.mockResolvedValue(compra);

    const result = await c.useCase.execute(baseDto());

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(CompraYaCanceladaError);
    expect(c.txRunner.run).not.toHaveBeenCalled();
    expect(c.registrarOperacionCompra.registrar).not.toHaveBeenCalled();
  });
});
