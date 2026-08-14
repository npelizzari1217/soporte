/**
 * PR-19 [UNIT] — RED→GREEN: `ObtenerCompraUseCase` (§4.9, H3).
 *
 * Puerto mockeado (`vi.fn()`) — sin DB. Cubre:
 * - Detalle: retorna la `CompraEntity` completa CON sus ítems (a diferencia
 *   de `ListarComprasUseCase`, acá SÍ se expone el agregado entero — es el
 *   caso de uso de detalle, no de listado).
 * - `CompraNoEncontradaError` si no existe.
 * - `CompraNoEncontradaError` si existe pero está soft-deleted ("no
 *   visible") — `findByIdConItems` incluye soft-deleted por contrato de
 *   puerto, así que el filtro de visibilidad vive acá.
 *
 * Ref spec: sdd/redisenio-modulo-compras/spec §4.9. Ref design: ADR-C1,
 * ADR-C2. Ref tasks: PR-19, H3.
 */
import { ObtenerCompraUseCase } from './obtener-compra.use-case';
import { CompraEntity, CompraProps } from '../../domain/entities/compra.entity';
import { ItemCompraEntity, ItemCompraCreateProps } from '../../domain/entities/item-compra.entity';
import { CompraNoEncontradaError } from '../../domain/errors/compras.errors';

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
    COMPRA_ID,
    new Date('2026-01-01'),
    new Date('2026-01-01'),
    null,
  );
}

describe('ObtenerCompraUseCase', () => {
  function makeCollaborators() {
    const compraRepo = { findByIdConItems: vi.fn() };
    const useCase = new ObtenerCompraUseCase(compraRepo as never);
    return { useCase, compraRepo };
  }

  it('retorna la CompraEntity completa CON sus ítems', async () => {
    const c = makeCollaborators();
    const item = ItemCompraEntity.create(crearItemPropsValidas(), 'item-1');
    const compra = crearCompra([item]);
    c.compraRepo.findByIdConItems.mockResolvedValue(compra);

    const result = await c.useCase.execute({ compraId: COMPRA_ID });

    expect(result.isOk()).toBe(true);
    const encontrada = result.getValue();
    expect(encontrada.id).toBe(COMPRA_ID);
    expect(encontrada.items).toHaveLength(1);
    expect(encontrada.items[0].id).toBe('item-1');
  });

  it('compra inexistente -> CompraNoEncontradaError', async () => {
    const c = makeCollaborators();
    c.compraRepo.findByIdConItems.mockResolvedValue(null);

    const result = await c.useCase.execute({ compraId: 'no-existe' });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(CompraNoEncontradaError);
  });

  it('compra soft-deleted -> CompraNoEncontradaError (no visible)', async () => {
    const c = makeCollaborators();
    const compra = crearCompra([]);
    compra.softDelete();
    c.compraRepo.findByIdConItems.mockResolvedValue(compra);

    const result = await c.useCase.execute({ compraId: COMPRA_ID });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(CompraNoEncontradaError);
  });
});
