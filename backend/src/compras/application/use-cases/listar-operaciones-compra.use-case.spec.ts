/**
 * PR-19 [UNIT] — RED→GREEN: `ListarOperacionesCompraUseCase` (§4.10, S37, H3).
 *
 * Puertos mockeados (`vi.fn()`) — sin DB. Cubre:
 * - Retorna la bitácora de una compra vía
 *   `IOperacionCompraRepository.listarPorCompra` — el ÚNICO método de
 *   lectura que ese puerto expone (S37: append-only por firma, sin
 *   `update`/`delete`).
 * - `CompraNoEncontradaError` si la compra no existe, SIN llamar a
 *   `listarPorCompra` (fail-fast antes de tocar la bitácora).
 * - `CompraNoEncontradaError` si la compra existe pero está soft-deleted.
 *
 * Ref spec: sdd/redisenio-modulo-compras/spec §4.10 (S37). Ref design:
 * ADR-C2, ADR-C4. Ref tasks: PR-19, H3.
 */
import { ListarOperacionesCompraUseCase } from './listar-operaciones-compra.use-case';
import { CompraEntity, CompraProps } from '../../domain/entities/compra.entity';
import { CompraNoEncontradaError } from '../../domain/errors/compras.errors';
import { OperacionCompra } from '../../domain/ports/i-operacion-compra.repository';

const COMPRA_ID = 'compra-1';

function crearCompra(overrides: Partial<CompraProps> = {}): CompraEntity {
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
    [],
    COMPRA_ID,
    new Date('2026-01-01'),
    new Date('2026-01-01'),
    null,
  );
}

function crearOperacion(overrides: Partial<OperacionCompra> = {}): OperacionCompra {
  return {
    id: 'operacion-1',
    compraId: COMPRA_ID,
    itemCompraId: null,
    tipo: 'CREACION',
    usuarioId: 'usuario-1',
    detalle: 'Compra creada.',
    datos: null,
    createdAt: new Date('2026-01-01'),
    ...overrides,
  };
}

describe('ListarOperacionesCompraUseCase', () => {
  function makeCollaborators() {
    const compraRepo = { findByIdConItems: vi.fn() };
    const operacionRepo = { listarPorCompra: vi.fn().mockResolvedValue([]) };
    const useCase = new ListarOperacionesCompraUseCase(compraRepo as never, operacionRepo as never);
    return { useCase, compraRepo, operacionRepo };
  }

  it('retorna la bitácora completa de la compra vía listarPorCompra', async () => {
    const c = makeCollaborators();
    c.compraRepo.findByIdConItems.mockResolvedValue(crearCompra());
    const operaciones = [
      crearOperacion(),
      crearOperacion({ id: 'operacion-2', tipo: 'ITEM_AGREGADO' }),
    ];
    c.operacionRepo.listarPorCompra.mockResolvedValue(operaciones);

    const result = await c.useCase.execute({ compraId: COMPRA_ID });

    expect(result.isOk()).toBe(true);
    expect(result.getValue()).toEqual(operaciones);
    expect(c.operacionRepo.listarPorCompra).toHaveBeenCalledWith(COMPRA_ID);
  });

  it('compra inexistente -> CompraNoEncontradaError, sin tocar la bitácora', async () => {
    const c = makeCollaborators();
    c.compraRepo.findByIdConItems.mockResolvedValue(null);

    const result = await c.useCase.execute({ compraId: 'no-existe' });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(CompraNoEncontradaError);
    expect(c.operacionRepo.listarPorCompra).not.toHaveBeenCalled();
  });

  it('compra soft-deleted -> CompraNoEncontradaError, sin tocar la bitácora', async () => {
    const c = makeCollaborators();
    const compra = crearCompra();
    compra.softDelete();
    c.compraRepo.findByIdConItems.mockResolvedValue(compra);

    const result = await c.useCase.execute({ compraId: COMPRA_ID });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(CompraNoEncontradaError);
    expect(c.operacionRepo.listarPorCompra).not.toHaveBeenCalled();
  });
});
