/**
 * PR-18 [UNIT] — RED→GREEN: `CerrarItemConFaltanteUseCase`.
 *
 * Todos los puertos/colaboradores mockeados (`vi.fn`) — sin DB. Cubre:
 * - S22: cierre con faltante real -> `cerradoConFaltante=true`,
 *   `comprado`/`entregado` pasan a `true` por la cláusula OR pese a
 *   `cantidadComprada < cantidad`; persiste el ítem y registra
 *   `OperacionCompra{ITEM_CERRADO_CON_FALTANTE}` DENTRO de la tx.
 * - S23: sin faltante real (`cantidadComprada >= cantidad`) ->
 *   `ItemSinFaltanteError`, sin tocar la tx.
 * - S24: sin motivo -> `MotivoCierreFaltanteRequeridoError`, sin tocar la tx.
 * - S25 TERMINALIDAD (las tres partes):
 *   1. cerrar dos veces -> `ItemCompraYaCerradoError` en el segundo intento.
 *   2. `registrarCompra` sobre un ítem ya cerrado con faltante ->
 *      `ItemCompraYaCerradoError` (verificado directo sobre la entidad).
 *   3. `registrarEntrega` sobre un ítem ya cerrado con faltante ->
 *      `ItemCompraYaCerradoError` (verificado directo sobre la entidad).
 * - 404: compra inexistente / ítem inexistente o soft-deleted.
 * - S35: exactamente 1 `OperacionCompra` por cierre exitoso, con el `tipo`
 *   correcto. Corolario: si falla, 0 llamadas.
 *
 * Ref spec: sdd/redisenio-modulo-compras/spec §4.7 (S22-S25), §4.10 (S35).
 * Ref design: ADR-C1, ADR-C2, ADR-C4. Tarea: PR-18.
 */
import {
  CerrarItemConFaltanteUseCase,
  CerrarItemConFaltanteDto,
} from './cerrar-item-con-faltante.use-case';
import { CompraEntity, CompraProps } from '../../domain/entities/compra.entity';
import { ItemCompraEntity, ItemCompraCreateProps } from '../../domain/entities/item-compra.entity';
import {
  CompraCanceladaError,
  CompraNoEncontradaError,
  ItemCompraNoEncontradoError,
  ItemCompraYaCerradoError,
  ItemSinFaltanteError,
  MotivoCierreFaltanteRequeridoError,
} from '../../domain/errors/compras.errors';

const COMPRA_ID = 'compra-1';
const ITEM_ID = 'item-1';

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

/** Crea un ítem APROBADO con `cantidadComprada` registrada (faltante real si < cantidad). */
function crearItemAprobadoConCompra(cantidadComprada: number): ItemCompraEntity {
  const item = ItemCompraEntity.create(crearItemPropsValidas(), ITEM_ID);
  item.aprobar('aprobador-1');
  if (cantidadComprada > 0) {
    item.registrarCompra(cantidadComprada);
  }
  return item;
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

function baseDto(overrides: Partial<CerrarItemConFaltanteDto> = {}): CerrarItemConFaltanteDto {
  return {
    compraId: COMPRA_ID,
    itemId: ITEM_ID,
    usuarioId: 'usuario-cierra',
    motivo: 'Proveedor discontinuó el modelo.',
    ...overrides,
  };
}

describe('CerrarItemConFaltanteUseCase', () => {
  function makeCollaborators() {
    const compraRepo = {
      findByIdConItems: vi.fn(),
      guardarItem: vi.fn().mockResolvedValue(undefined),
    };
    const registrarOperacionCompra = { registrar: vi.fn().mockResolvedValue(undefined) };
    // txRunner.run ejecuta el callback DIRECTAMENTE (sin Prisma real) — pero
    // preserva la semántica "corre dentro de la tx" para los tests.
    const txRunner = { run: vi.fn((fn: () => Promise<unknown>) => fn()) };

    const useCase = new CerrarItemConFaltanteUseCase(
      compraRepo as never,
      registrarOperacionCompra as never,
      txRunner as never,
    );

    return { useCase, compraRepo, registrarOperacionCompra, txRunner };
  }

  it('S22: cierra un ítem con faltante real — comprado y entregado pasan a true por la cláusula OR, persiste y registra ITEM_CERRADO_CON_FALTANTE dentro de la tx', async () => {
    const c = makeCollaborators();
    const item = crearItemAprobadoConCompra(6); // cantidad=10, comprada=6 -> faltante real
    const compra = crearCompraConItem(item);
    c.compraRepo.findByIdConItems.mockResolvedValue(compra);

    const result = await c.useCase.execute(baseDto());

    expect(result.isOk()).toBe(true);
    const cerrado = result.getValue();
    expect(cerrado.cerradoConFaltante).toBe(true);
    expect(cerrado.motivoCierreFaltante).toBe('Proveedor discontinuó el modelo.');
    // La cláusula OR (S22): pese a 6 < 10, comprado/entregado son true.
    expect(cerrado.comprado).toBe(true);
    expect(cerrado.entregado).toBe(true);

    expect(c.txRunner.run).toHaveBeenCalledTimes(1);
    expect(c.compraRepo.guardarItem).toHaveBeenCalledWith(item);
  });

  it('S35: registra exactamente 1 OperacionCompra de tipo ITEM_CERRADO_CON_FALTANTE en el cierre exitoso', async () => {
    const c = makeCollaborators();
    const item = crearItemAprobadoConCompra(6);
    const compra = crearCompraConItem(item);
    c.compraRepo.findByIdConItems.mockResolvedValue(compra);

    await c.useCase.execute(baseDto());

    expect(c.registrarOperacionCompra.registrar).toHaveBeenCalledTimes(1);
    const operacion = c.registrarOperacionCompra.registrar.mock.calls[0][0];
    expect(operacion.tipo).toBe('ITEM_CERRADO_CON_FALTANTE');
    expect(operacion.compraId).toBe(COMPRA_ID);
    expect(operacion.itemCompraId).toBe(ITEM_ID);
    expect(operacion.usuarioId).toBe('usuario-cierra');
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

  it('itemId no corresponde a ningún ítem de la compra -> ItemCompraNoEncontradoError', async () => {
    const c = makeCollaborators();
    const item = crearItemAprobadoConCompra(6);
    const compra = crearCompraConItem(item);
    c.compraRepo.findByIdConItems.mockResolvedValue(compra);

    const result = await c.useCase.execute(baseDto({ itemId: 'no-existe' }));

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(ItemCompraNoEncontradoError);
    expect(c.txRunner.run).not.toHaveBeenCalled();
  });

  it('el ítem existe pero está soft-deleted -> ItemCompraNoEncontradoError', async () => {
    const c = makeCollaborators();
    const item = crearItemAprobadoConCompra(6);
    item.softDelete();
    const compra = crearCompraConItem(item);
    c.compraRepo.findByIdConItems.mockResolvedValue(compra);

    const result = await c.useCase.execute(baseDto());

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(ItemCompraNoEncontradoError);
    expect(c.txRunner.run).not.toHaveBeenCalled();
  });

  it('S23: sin faltante real (cantidadComprada >= cantidad) -> ItemSinFaltanteError, sin tocar la tx', async () => {
    const c = makeCollaborators();
    const item = crearItemAprobadoConCompra(10); // cantidad=10, comprada=10 -> sin faltante
    const compra = crearCompraConItem(item);
    c.compraRepo.findByIdConItems.mockResolvedValue(compra);

    const result = await c.useCase.execute(baseDto());

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(ItemSinFaltanteError);
    expect(c.txRunner.run).not.toHaveBeenCalled();
    expect(c.registrarOperacionCompra.registrar).not.toHaveBeenCalled();
  });

  it('S24: sin motivo -> MotivoCierreFaltanteRequeridoError, sin tocar la tx', async () => {
    const c = makeCollaborators();
    const item = crearItemAprobadoConCompra(6);
    const compra = crearCompraConItem(item);
    c.compraRepo.findByIdConItems.mockResolvedValue(compra);

    const result = await c.useCase.execute(baseDto({ motivo: '' }));

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(MotivoCierreFaltanteRequeridoError);
    expect(c.txRunner.run).not.toHaveBeenCalled();
    expect(c.registrarOperacionCompra.registrar).not.toHaveBeenCalled();
  });

  describe('S25: TERMINALIDAD — cerradoConFaltante es un estado sin retorno', () => {
    it('cerrar un ítem YA cerrado con faltante (segunda vez, vía el caso de uso) -> ItemCompraYaCerradoError, sin tocar la tx', async () => {
      const c = makeCollaborators();
      const item = crearItemAprobadoConCompra(6);
      item.cerrarConFaltante('Primer cierre.'); // ya cerrado ANTES de invocar el caso de uso
      const compra = crearCompraConItem(item);
      c.compraRepo.findByIdConItems.mockResolvedValue(compra);

      const result = await c.useCase.execute(baseDto({ motivo: 'Segundo intento de cierre.' }));

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(ItemCompraYaCerradoError);
      expect(c.txRunner.run).not.toHaveBeenCalled();
      expect(c.registrarOperacionCompra.registrar).not.toHaveBeenCalled();
    });

    it('registrarCompra posterior sobre un ítem cerrado con faltante -> ItemCompraYaCerradoError (verificado directo sobre la entidad, no solo el cierre repetido)', () => {
      const item = crearItemAprobadoConCompra(6);
      item.cerrarConFaltante('Motivo de cierre.');

      const result = item.registrarCompra(8);

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(ItemCompraYaCerradoError);
    });

    it('registrarEntrega posterior sobre un ítem cerrado con faltante -> ItemCompraYaCerradoError (verificado directo sobre la entidad, no solo el cierre repetido)', () => {
      const item = crearItemAprobadoConCompra(6);
      item.cerrarConFaltante('Motivo de cierre.');

      const result = item.registrarEntrega(4);

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(ItemCompraYaCerradoError);
    });
  });

  it('compra cancelada -> CompraCanceladaError, sin mutar el ítem, sin persistir y sin abrir la tx', async () => {
    const c = makeCollaborators();
    const item = crearItemAprobadoConCompra(6); // faltante real: cantidad=10, comprada=6
    const compra = crearCompraConItem(item, {
      canceladaEn: new Date('2026-02-01'),
      canceladoPorId: 'usuario-cancelador',
      motivoCancelacion: 'Ya no se necesita',
    });
    c.compraRepo.findByIdConItems.mockResolvedValue(compra);

    const result = await c.useCase.execute(baseDto());

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(CompraCanceladaError);
    expect(item.cerradoConFaltante).toBe(false);
    expect(item.motivoCierreFaltante).toBeNull();
    expect(c.compraRepo.guardarItem).not.toHaveBeenCalled();
    expect(c.registrarOperacionCompra.registrar).not.toHaveBeenCalled();
    expect(c.txRunner.run).not.toHaveBeenCalled();
  });
});
