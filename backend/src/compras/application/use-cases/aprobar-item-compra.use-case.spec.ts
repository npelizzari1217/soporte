/**
 * PR-16 [UNIT] — RED→GREEN: `AprobarItemCompraUseCase`.
 *
 * Todos los puertos/colaboradores mockeados (`vi.fn`) — sin DB. Cubre:
 * - S8: aprobar un ítem PENDIENTE -> `estadoAprobacion='APROBADO'`, persiste
 *   el ítem y registra `OperacionCompra{ITEM_APROBADO}` DENTRO de la tx.
 * - 404: compra inexistente -> `CompraNoEncontradaError`, sin tocar la tx.
 * - 404: ítem inexistente (id equivocado o soft-deleted) ->
 *   `ItemCompraNoEncontradoError`, sin tocar la tx.
 * - S10 (mitad "segunda decisión = aprobar"): re-decidir un ítem ya
 *   decidido (aprobado o rechazado previamente) falla con
 *   `ItemCompraYaDecididoError`, SIN mutar `estadoAprobacion`/
 *   `decididoPorId`/`decididoEn`, y SIN registrar bitácora (spy con 0
 *   llamadas) — la otra mitad ("segunda decisión = rechazar") vive en
 *   `rechazar-item-compra.use-case.spec.ts`.
 * - S35: exactamente 1 `OperacionCompra` por aprobación exitosa, con el
 *   `tipo` correcto (`ITEM_APROBADO`).
 * - Hueco de spec resuelto por el maintainer: §4.2 (S5) SÍ reserva "compra
 *   cancelada" para el ABM de ítems, pero §4.3 (S8) nunca lo dijo para la
 *   decisión. PR-16 documentó esa ausencia como intencional; el maintainer
 *   la cerró — aprobar sobre una compra cancelada también falla con
 *   `CompraCanceladaError`, SIN mutar y SIN bitácora, igual que el ABM.
 *
 * Ref spec: sdd/redisenio-modulo-compras/spec §4.2 (S5), §4.3 (S8, S10),
 * §4.10 (S35). Ref design: ADR-C2, ADR-C4, ADR-C6. Tarea: PR-16 + guard de
 * remediación (compra cancelada en decisión por ítem).
 */
import { AprobarItemCompraUseCase, AprobarItemCompraDto } from './aprobar-item-compra.use-case';
import { CompraEntity, CompraProps } from '../../domain/entities/compra.entity';
import { ItemCompraEntity, ItemCompraCreateProps } from '../../domain/entities/item-compra.entity';
import {
  CompraCanceladaError,
  CompraNoEncontradaError,
  ItemCompraNoEncontradoError,
  ItemCompraYaDecididoError,
} from '../../domain/errors/compras.errors';

const COMPRA_ID = 'compra-1';
const ITEM_ID = 'item-1';

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

function crearCompraConItem(
  item: ItemCompraEntity,
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
    [item],
    COMPRA_ID,
    new Date('2026-01-01'),
    new Date('2026-01-01'),
    null,
  );
}

function baseDto(overrides: Partial<AprobarItemCompraDto> = {}): AprobarItemCompraDto {
  return {
    compraId: COMPRA_ID,
    itemId: ITEM_ID,
    usuarioId: 'usuario-decisor',
    ...overrides,
  };
}

describe('AprobarItemCompraUseCase', () => {
  function makeCollaborators() {
    const compraRepo = {
      findByIdConItems: vi.fn(),
      guardarItem: vi.fn().mockResolvedValue(undefined),
    };
    const registrarOperacionCompra = { registrar: vi.fn().mockResolvedValue(undefined) };
    // txRunner.run ejecuta el callback DIRECTAMENTE (sin Prisma real) — pero
    // preserva la semántica "corre dentro de la tx" para los tests.
    const txRunner = { run: vi.fn((fn: () => Promise<unknown>) => fn()) };

    const useCase = new AprobarItemCompraUseCase(
      compraRepo as never,
      registrarOperacionCompra as never,
      txRunner as never,
    );

    return { useCase, compraRepo, registrarOperacionCompra, txRunner };
  }

  it('S8: aprueba un ítem PENDIENTE — muta estadoAprobacion, persiste y registra ITEM_APROBADO dentro de la tx', async () => {
    const c = makeCollaborators();
    const item = ItemCompraEntity.create(crearItemPropsValidas(), ITEM_ID);
    const compra = crearCompraConItem(item);
    c.compraRepo.findByIdConItems.mockResolvedValue(compra);

    const result = await c.useCase.execute(baseDto());

    expect(result.isOk()).toBe(true);
    const aprobado = result.getValue();
    expect(aprobado.estadoAprobacion).toBe('APROBADO');
    expect(aprobado.decididoPorId).toBe('usuario-decisor');
    expect(aprobado.decididoEn).not.toBeNull();

    expect(c.txRunner.run).toHaveBeenCalledTimes(1);
    expect(c.compraRepo.guardarItem).toHaveBeenCalledWith(item);
  });

  it('S35: registra exactamente 1 OperacionCompra de tipo ITEM_APROBADO en la aprobación exitosa', async () => {
    const c = makeCollaborators();
    const item = ItemCompraEntity.create(crearItemPropsValidas(), ITEM_ID);
    const compra = crearCompraConItem(item);
    c.compraRepo.findByIdConItems.mockResolvedValue(compra);

    await c.useCase.execute(baseDto());

    expect(c.registrarOperacionCompra.registrar).toHaveBeenCalledTimes(1);
    const operacion = c.registrarOperacionCompra.registrar.mock.calls[0][0];
    expect(operacion.tipo).toBe('ITEM_APROBADO');
    expect(operacion.compraId).toBe(COMPRA_ID);
    expect(operacion.itemCompraId).toBe(ITEM_ID);
    expect(operacion.usuarioId).toBe('usuario-decisor');
  });

  it('compra inexistente -> CompraNoEncontradaError, sin tocar la tx', async () => {
    const c = makeCollaborators();
    c.compraRepo.findByIdConItems.mockResolvedValue(null);

    const result = await c.useCase.execute(baseDto());

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(CompraNoEncontradaError);
    expect(c.txRunner.run).not.toHaveBeenCalled();
    expect(c.compraRepo.guardarItem).not.toHaveBeenCalled();
    expect(c.registrarOperacionCompra.registrar).not.toHaveBeenCalled();
  });

  it('itemId no corresponde a ningún ítem de la compra -> ItemCompraNoEncontradoError', async () => {
    const c = makeCollaborators();
    const item = ItemCompraEntity.create(crearItemPropsValidas(), ITEM_ID);
    const compra = crearCompraConItem(item);
    c.compraRepo.findByIdConItems.mockResolvedValue(compra);

    const result = await c.useCase.execute(baseDto({ itemId: 'no-existe' }));

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(ItemCompraNoEncontradoError);
    expect(c.txRunner.run).not.toHaveBeenCalled();
  });

  it('el ítem existe pero está soft-deleted -> ItemCompraNoEncontradoError (no se decide sobre un ítem eliminado)', async () => {
    const c = makeCollaborators();
    const item = ItemCompraEntity.create(crearItemPropsValidas(), ITEM_ID);
    item.softDelete();
    const compra = crearCompraConItem(item);
    c.compraRepo.findByIdConItems.mockResolvedValue(compra);

    const result = await c.useCase.execute(baseDto());

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(ItemCompraNoEncontradoError);
    expect(c.txRunner.run).not.toHaveBeenCalled();
  });

  describe('S10: re-decidir un ítem ya decidido (segunda decisión = APROBAR)', () => {
    it.each([
      ['aprobar->aprobar', 'aprobar' as const],
      ['rechazar->aprobar', 'rechazar' as const],
    ])(
      '%s: falla con ItemCompraYaDecididoError, SIN mutar y SIN registrar bitácora',
      async (_nombre, primeraDecision) => {
        const c = makeCollaborators();
        const item = ItemCompraEntity.create(crearItemPropsValidas(), ITEM_ID);
        // Primera decisión aplicada DIRECTAMENTE sobre la entidad (no vía caso
        // de uso) — deja el ítem en el estado "ya decidido" que S10 exige.
        item[primeraDecision]('usuario-original');
        const estadoPrevio = item.estadoAprobacion;
        const decididoPorIdPrevio = item.decididoPorId;
        const decididoEnPrevio = item.decididoEn;
        const compra = crearCompraConItem(item);
        c.compraRepo.findByIdConItems.mockResolvedValue(compra);

        const result = await c.useCase.execute(baseDto());

        // 1. Devuelve el error.
        expect(result.isFail()).toBe(true);
        expect(result.getError()).toBeInstanceOf(ItemCompraYaDecididoError);

        // 2. NO muta: el estado POSTERIOR a la llamada queda igual al previo.
        expect(item.estadoAprobacion).toBe(estadoPrevio);
        expect(item.decididoPorId).toBe(decididoPorIdPrevio);
        expect(item.decididoEn).toBe(decididoEnPrevio);

        // 3. NO registra bitácora — 0 llamadas, no solo "no fue el tipo esperado".
        expect(c.registrarOperacionCompra.registrar).toHaveBeenCalledTimes(0);
        expect(c.compraRepo.guardarItem).not.toHaveBeenCalled();
        expect(c.txRunner.run).not.toHaveBeenCalled();
      },
    );
  });

  it('S5 (extendido a la decisión): compra cancelada -> CompraCanceladaError, SIN mutar y SIN registrar bitácora', async () => {
    const c = makeCollaborators();
    const item = ItemCompraEntity.create(crearItemPropsValidas(), ITEM_ID);
    const estadoPrevio = item.estadoAprobacion;
    const decididoPorIdPrevio = item.decididoPorId;
    const decididoEnPrevio = item.decididoEn;
    const compra = crearCompraConItem(item, {
      canceladaEn: new Date('2026-02-01'),
      canceladoPorId: 'usuario-cancelador',
      motivoCancelacion: 'Ya no se necesita',
    });
    c.compraRepo.findByIdConItems.mockResolvedValue(compra);

    const result = await c.useCase.execute(baseDto());

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(CompraCanceladaError);

    // NO muta: el ítem queda exactamente como estaba.
    expect(item.estadoAprobacion).toBe(estadoPrevio);
    expect(item.decididoPorId).toBe(decididoPorIdPrevio);
    expect(item.decididoEn).toBe(decididoEnPrevio);

    // NO registra bitácora — una decisión rechazada no es un evento del timeline.
    expect(c.registrarOperacionCompra.registrar).toHaveBeenCalledTimes(0);
    expect(c.compraRepo.guardarItem).not.toHaveBeenCalled();
    expect(c.txRunner.run).not.toHaveBeenCalled();
  });
});
