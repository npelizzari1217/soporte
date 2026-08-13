/**
 * PR-19 [UNIT] — RED→GREEN: `ListarComprasUseCase` (§4.9, S32-S34, H3).
 *
 * Todos los puertos mockeados (`vi.fn()`) — sin DB. Cubre:
 * - S33: el DTO de cada fila expone `estado`/`comprado`/`cerrado`/
 *   `totalesPorMoneda` y NO expone `items` (ni ningún campo que los
 *   contenga) — el listado no arrastra el detalle.
 * - Los valores derivados vienen de los getters de `CompraEntity` (que
 *   delegan en `derivarEstadoCompra`, ADR-C1): NO hay una segunda
 *   implementación de la tabla de verdad en este caso de uso.
 * - Paginación: `pagina`/`porPagina` se traducen a `limit`/`offset` sobre
 *   `ICompraRepository.findAllConItems` — el ÚNICO método de lectura que usa
 *   este caso de uso (S32: no se agrega ningún `include`/consulta extra).
 * - Defaults de paginación cuando el DTO no los provee.
 * - Sin compras -> `{ items: [] }`, sin error.
 *
 * Ref spec: sdd/redisenio-modulo-compras/spec §4.9 (S32, S33, S34). Ref
 * design: ADR-C1, ADR-C2. Ref tasks: PR-19, H3.
 */
import { ListarComprasUseCase } from './listar-compras.use-case';
import { CompraEntity, CompraProps } from '../../domain/entities/compra.entity';
import { ItemCompraEntity, ItemCompraCreateProps } from '../../domain/entities/item-compra.entity';

const COMPRA_ID = 'compra-1';

function crearItemPropsValidas(
  overrides: Partial<ItemCompraCreateProps> = {},
): ItemCompraCreateProps {
  return {
    compraId: COMPRA_ID,
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

function crearCompra(
  id: string,
  items: ItemCompraEntity[] = [],
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
    id,
    new Date('2026-01-01'),
    new Date('2026-01-01'),
    null,
  );
}

describe('ListarComprasUseCase', () => {
  function makeCollaborators() {
    const compraRepo = { findAllConItems: vi.fn().mockResolvedValue([]) };
    const useCase = new ListarComprasUseCase(compraRepo as never);
    return { useCase, compraRepo };
  }

  it('S33: el DTO de cada fila expone estado/comprado/cerrado/totalesPorMoneda y NO expone items', async () => {
    const c = makeCollaborators();
    const item = ItemCompraEntity.create(crearItemPropsValidas(), 'item-1');
    item.aprobar('aprobador-1');
    item.registrarCompra(2);
    item.registrarEntrega(2);
    const compra = crearCompra(COMPRA_ID, [item]);
    c.compraRepo.findAllConItems.mockResolvedValue([compra]);

    const result = await c.useCase.execute();

    expect(result.isOk()).toBe(true);
    const [fila] = result.getValue().items;
    expect(fila).toEqual({
      id: COMPRA_ID,
      numero: 'COM-2026-00001',
      fechaSolicitud: compra.fechaSolicitud,
      motivo: 'Compra de prueba',
      estado: 'APROBADO',
      comprado: true,
      cerrado: true,
      totalesPorMoneda: { ARS: 300000 },
    });
    expect(fila).not.toHaveProperty('items');
  });

  it('los valores derivados delegan en los getters de CompraEntity (derivarEstadoCompra) — sin re-derivar acá', async () => {
    const c = makeCollaborators();
    // Sin ítems -> T1 PENDIENTE, comprado/cerrado false (nA=0, excepción de vacuidad).
    const compra = crearCompra(COMPRA_ID, []);
    c.compraRepo.findAllConItems.mockResolvedValue([compra]);

    const result = await c.useCase.execute();

    const [fila] = result.getValue().items;
    expect(fila.estado).toBe(compra.estado);
    expect(fila.comprado).toBe(compra.comprado);
    expect(fila.cerrado).toBe(compra.cerrado);
    expect(fila.estado).toBe('PENDIENTE');
    expect(fila.comprado).toBe(false);
    expect(fila.cerrado).toBe(false);
  });

  it('traduce pagina/porPagina a limit/offset del ÚNICO método de lectura del puerto (S32)', async () => {
    const c = makeCollaborators();

    await c.useCase.execute({ pagina: 3, porPagina: 10 });

    expect(c.compraRepo.findAllConItems).toHaveBeenCalledTimes(1);
    expect(c.compraRepo.findAllConItems).toHaveBeenCalledWith({ limit: 10, offset: 20 });
  });

  it('sin pagina/porPagina explícitos, aplica los defaults (página 1, 20 por página)', async () => {
    const c = makeCollaborators();

    const result = await c.useCase.execute();

    expect(c.compraRepo.findAllConItems).toHaveBeenCalledWith({ limit: 20, offset: 0 });
    expect(result.getValue().pagina).toBe(1);
    expect(result.getValue().porPagina).toBe(20);
  });

  it('sin compras -> items vacío, sin error', async () => {
    const c = makeCollaborators();
    c.compraRepo.findAllConItems.mockResolvedValue([]);

    const result = await c.useCase.execute();

    expect(result.isOk()).toBe(true);
    expect(result.getValue().items).toEqual([]);
  });
});
