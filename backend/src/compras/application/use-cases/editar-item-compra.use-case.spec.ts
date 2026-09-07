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
  InsumoDeItemNoReasignableError,
  ItemCompraCongeladoError,
  ItemCompraNoEncontradoError,
} from '../../domain/errors/compras.errors';
import { InsumoEntity } from '../../../insumos/domain/entities/insumo.entity';
import { InsumoNoEncontradoError } from '../../../insumos/domain/errors/insumos.errors';

const INSUMO_ID = '00000000-0000-4000-8000-0000000000aa';
const OTRO_INSUMO_ID = '00000000-0000-4000-8000-0000000000bb';

/** Insumo del catálogo del tenant, vigente y habilitado. */
function insumoDelCatalogo(id: string = INSUMO_ID): InsumoEntity {
  const ahora = new Date('2026-01-01T00:00:00.000Z');
  return InsumoEntity.reconstitute(
    {
      codigo: 'TON-001',
      nombre: 'Tóner negro',
      familiaId: 'familia-1',
      unidadMedidaId: 'unidad-1',
      stockMinimo: null,
      activo: true,
      codigosAlternativos: [],
      compatibilidad: [],
    },
    id,
    ahora,
    ahora,
    null,
  );
}

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
    const insumoRepo = { findById: vi.fn().mockResolvedValue(insumoDelCatalogo()) };

    const useCase = new EditarItemCompraUseCase(
      compraRepo as never,
      insumoRepo as never,
      registrarOperacion as never,
      txRunner as never,
    );

    return { useCase, compraRepo, insumoRepo, registrarOperacion, txRunner };
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

  describe('insumos-entrega-3: declarar, cambiar y borrar el insumo del ítem', () => {
    /** Ítem aprobado, ordenado y recibido — el estado que congela el insumo. */
    function crearCompraConItemRecibido(insumoId: string | null): {
      compra: CompraEntity;
      itemId: string;
    } {
      const { compra, itemId } = crearCompraConItem({ insumoId });
      const item = compra.items[0];
      item.aprobar('aprobador-1');
      expect(item.registrarOrden(2, new Date('2026-02-01')).isOk()).toBe(true);
      expect(item.registrarRecepcion(2, new Date('2026-02-10')).isOk()).toBe(true);
      expect(item.cantidadRecibida).toBe(2);
      return { compra, itemId };
    }

    it('asigna el insumo a un ítem que no lo declaraba, tras verificarlo contra el catálogo', async () => {
      const c = makeCollaborators();
      const { compra, itemId } = crearCompraConItem();
      c.compraRepo.findByIdConItems.mockResolvedValue(compra);

      const result = await c.useCase.execute(baseDto({ itemId, insumoId: INSUMO_ID }));

      expect(result.isOk()).toBe(true);
      expect(result.getValue().insumoId).toBe(INSUMO_ID);
      expect(c.insumoRepo.findById).toHaveBeenCalledWith(INSUMO_ID);
      expect(c.compraRepo.guardarItem).toHaveBeenCalledWith(result.getValue());
    });

    it('un insumoId inexistente da InsumoNoEncontradoError sin abrir la transacción, persistir ni asentar bitácora', async () => {
      const c = makeCollaborators();
      c.insumoRepo.findById.mockResolvedValue(null);
      const { compra, itemId } = crearCompraConItem();
      c.compraRepo.findByIdConItems.mockResolvedValue(compra);

      const result = await c.useCase.execute(baseDto({ itemId, insumoId: INSUMO_ID }));

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(InsumoNoEncontradoError);
      expect(result.getError().message).toContain(INSUMO_ID);
      expect(c.txRunner.run).not.toHaveBeenCalled();
      expect(c.compraRepo.guardarItem).not.toHaveBeenCalled();
      expect(c.registrarOperacion.registrar).not.toHaveBeenCalled();
    });

    it('insumoId=null borra el vínculo sin consultar el catálogo: no hay id que verificar', async () => {
      const c = makeCollaborators();
      const { compra, itemId } = crearCompraConItem({ insumoId: INSUMO_ID });
      c.compraRepo.findByIdConItems.mockResolvedValue(compra);

      const result = await c.useCase.execute(baseDto({ itemId, insumoId: null }));

      expect(result.isOk()).toBe(true);
      expect(result.getValue().insumoId).toBeNull();
      expect(c.insumoRepo.findById).not.toHaveBeenCalled();
    });

    /**
     * El formulario reenvía el shape completo, así que toda edición vuelve a
     * mandar el insumo que el ítem ya tenía. Revalidarlo convertiría una baja
     * del catálogo en una trampa: nadie podría corregirle ni la descripción a
     * un ítem cuyo insumo se dio de baja después. Mismo criterio que
     * `resolverCompatibilidad` con los modelos ya declarados.
     */
    it('reenviar el MISMO insumoId no consulta el catálogo, ni siquiera si el insumo ya no está', async () => {
      const c = makeCollaborators();
      c.insumoRepo.findById.mockResolvedValue(null);
      const { compra, itemId } = crearCompraConItem({ insumoId: INSUMO_ID });
      c.compraRepo.findByIdConItems.mockResolvedValue(compra);

      const result = await c.useCase.execute(
        baseDto({ itemId, insumoId: INSUMO_ID, descripcion: 'Tóner negro (corregido)' }),
      );

      expect(result.isOk()).toBe(true);
      expect(result.getValue().descripcion).toBe('Tóner negro (corregido)');
      expect(result.getValue().insumoId).toBe(INSUMO_ID);
      expect(c.insumoRepo.findById).not.toHaveBeenCalled();
    });

    /**
     * El mismo reenvío pero con OTRA capitalización, que es el caso que el
     * `.toLowerCase()` de la comparación existe para cubrir.
     *
     * La columna es `uuid`, no texto: Postgres normaliza el literal antes de
     * comparar, así que estos dos strings son la MISMA fila. Comparando en
     * crudo, este reenvío se lee como un cambio, se consulta el catálogo y —con
     * el insumo ya dado de baja— la edición falla con la trampa que el guard
     * existe para evitar.
     *
     * Sin este caso, sacar el `.toLowerCase()` de los dos lados no pone nada en
     * rojo: el test hermano de arriba manda el string idéntico, donde la
     * normalización no hace nada.
     */
    it('reenviar el mismo insumoId con OTRA capitalización tampoco consulta el catálogo', async () => {
      const c = makeCollaborators();
      c.insumoRepo.findById.mockResolvedValue(null);
      const { compra, itemId } = crearCompraConItem({ insumoId: INSUMO_ID });
      c.compraRepo.findByIdConItems.mockResolvedValue(compra);

      const result = await c.useCase.execute(
        baseDto({
          itemId,
          insumoId: INSUMO_ID.toUpperCase(),
          descripcion: 'Tóner negro (corregido)',
        }),
      );

      expect(result.isOk()).toBe(true);
      expect(c.insumoRepo.findById).not.toHaveBeenCalled();
    });

    /**
     * Decisión 5 del diseño: el stock ya sumado quedaría contado en el insumo
     * viejo. El guard vive en la entidad y gana sobre la verificación de
     * catálogo — cuál es el id nuevo da igual si el cambio está prohibido, y
     * contestar "ese insumo no existe" mandaría a corregir el id equivocado.
     */
    it('cambiar el insumo de un ítem YA RECIBIDO da InsumoDeItemNoReasignableError y ni consulta el catálogo', async () => {
      const c = makeCollaborators();
      const { compra, itemId } = crearCompraConItemRecibido(INSUMO_ID);
      c.compraRepo.findByIdConItems.mockResolvedValue(compra);

      const result = await c.useCase.execute(baseDto({ itemId, insumoId: OTRO_INSUMO_ID }));

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(InsumoDeItemNoReasignableError);
      expect(c.insumoRepo.findById).not.toHaveBeenCalled();
      expect(c.txRunner.run).not.toHaveBeenCalled();
    });

    it('el ítem YA RECIBIDO sigue editable en lo que no es el insumo: reenviar el mismo insumoId no lo bloquea', async () => {
      const c = makeCollaborators();
      const { compra, itemId } = crearCompraConItemRecibido(INSUMO_ID);
      c.compraRepo.findByIdConItems.mockResolvedValue(compra);

      const result = await c.useCase.execute(
        baseDto({ itemId, insumoId: INSUMO_ID, observaciones: 'Llegó completo' }),
      );

      expect(result.isOk()).toBe(true);
      expect(result.getValue().observaciones).toBe('Llegó completo');
      expect(result.getValue().insumoId).toBe(INSUMO_ID);
    });
  });
});
