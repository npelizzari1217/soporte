/**
 * PR-19/PR-20 [UNIT] — RED→GREEN: `ListarComprasUseCase` (§4.9, S32-S34, H3).
 *
 * Todos los puertos mockeados (`vi.fn()`) — sin DB. Cubre:
 * - S33: el DTO de cada fila expone `estado`/`comprado`/`cerrado`/
 *   `totalesPorMoneda` y NO expone `items` (ni ningún campo que los
 *   contenga) — el listado no arrastra el detalle.
 * - Los valores derivados vienen de los getters de `CompraEntity` (que
 *   delegan en `derivarEstadoCompra`, ADR-C1): NO hay una segunda
 *   implementación de la tabla de verdad en este caso de uso.
 * - Paginación: `pagina`/`porPagina` se traducen a `limit`/`offset` sobre
 *   `ICompraRepository.findAllConItems`.
 * - Defaults de paginación cuando el DTO no los provee.
 * - Sin compras -> `{ items: [], total }`, sin error.
 * - `total` (PR-20, cierra el gap declarado en PR-19/H3): sale de
 *   `ICompraRepository.count()`, EN PARALELO con `findAllConItems`
 *   (`Promise.all`), SIN `limit`/`offset` — refleja el universo filtrado
 *   completo, no el tamaño de la página. Incluye el borde que descartó la
 *   alternativa de `COUNT(*) OVER()` (ver
 *   `sdd/redisenio-modulo-compras/count-en-consulta`): página vacía
 *   (`findAllConItems` devuelve `[]`) pero `total` sigue siendo el real,
 *   porque `count()` es una consulta INDEPENDIENTE, no depende de que la
 *   página tenga filas.
 *
 * Ref spec: sdd/redisenio-modulo-compras/spec §4.9 (S32, S33, S34). Ref
 * design: ADR-C1, ADR-C2. Ref tasks: PR-19, H3; excepción `total` cerrada en
 * `sdd/redisenio-modulo-compras/count-en-consulta`.
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
    const compraRepo = {
      findAllConItems: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
    };
    const useCase = new ListarComprasUseCase(compraRepo as never);
    return { useCase, compraRepo };
  }

  it('S33: el DTO de cada fila expone estado/comprado/cerrado/totalesPorMoneda y NO expone items', async () => {
    const c = makeCollaborators();
    const item = ItemCompraEntity.create(crearItemPropsValidas(), 'item-1');
    item.aprobar('aprobador-1');
    item.registrarOrden(2, new Date('2026-01-16'));
    item.registrarRecepcion(2, new Date('2026-01-17'));
    item.registrarEntrega(2, new Date('2026-01-18'));
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

  it('traduce pagina/porPagina a limit/offset de findAllConItems (S32)', async () => {
    const c = makeCollaborators();

    await c.useCase.execute({ pagina: 3, porPagina: 10 });

    expect(c.compraRepo.findAllConItems).toHaveBeenCalledTimes(1);
    expect(c.compraRepo.findAllConItems).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 10, offset: 20 }),
    );
  });

  it('sin pagina/porPagina explícitos, aplica los defaults (página 1, 20 por página)', async () => {
    const c = makeCollaborators();

    const result = await c.useCase.execute();

    expect(c.compraRepo.findAllConItems).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 20, offset: 0 }),
    );
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

  it('total refleja el universo filtrado completo, NO el tamaño de la página (más filas que porPagina)', async () => {
    const c = makeCollaborators();
    const compraA = crearCompra('compra-a');
    const compraB = crearCompra('compra-b');
    // Página de 2 pero el filtro completo tiene 5 compras -> total debe ser 5, no 2.
    c.compraRepo.findAllConItems.mockResolvedValue([compraA, compraB]);
    c.compraRepo.count.mockResolvedValue(5);

    const result = await c.useCase.execute({ pagina: 1, porPagina: 2 });

    expect(result.getValue().items).toHaveLength(2);
    expect(result.getValue().total).toBe(5);
  });

  it('el borde que descartó COUNT(*) OVER(): página vacía (offset más allá del total) pero total sigue siendo correcto', async () => {
    const c = makeCollaborators();
    // findAllConItems no tiene fila para "llevar" un total embebido en la
    // misma sentencia -- por eso count() es una consulta INDEPENDIENTE.
    c.compraRepo.findAllConItems.mockResolvedValue([]);
    c.compraRepo.count.mockResolvedValue(5);

    const result = await c.useCase.execute({ pagina: 100, porPagina: 2 });

    expect(result.getValue().items).toEqual([]);
    expect(result.getValue().total).toBe(5);
  });

  it('count() se llama SIN limit/offset (mide el universo completo, no la página)', async () => {
    const c = makeCollaborators();

    await c.useCase.execute({ pagina: 3, porPagina: 10 });

    expect(c.compraRepo.count).toHaveBeenCalledTimes(1);
    const [filtrosDeCount] = c.compraRepo.count.mock.calls[0]!;
    expect(filtrosDeCount).not.toHaveProperty('limit');
    expect(filtrosDeCount).not.toHaveProperty('offset');
  });

  // ─── WU-13 (sdd/compras-tres-etapas-y-sectores, R9/S62) — el bug real ────
  //
  // count() se llamaba SIN argumentos mientras findAllConItems SÍ recibía
  // filtros de negocio: el total de paginación medía el universo SIN
  // filtrar, no el filtrado. Estos tests fallan contra la implementación
  // vieja (count() con cero argumentos) y pasan solo si count() recibe el
  // MISMO objeto de filtros de negocio que findAllConItems (menos limit/offset).

  it('S62: count() recibe el MISMO filtro de negocio (cicloId/soloEnCurso/sectorId/fechas) que findAllConItems, sin limit/offset', async () => {
    const c = makeCollaborators();

    await c.useCase.execute({
      pagina: 1,
      porPagina: 2,
      cicloId: 'ciclo-1',
      soloEnCurso: true,
      sectorId: 'sector-1',
    });

    const [filtrosFindAll] = c.compraRepo.findAllConItems.mock.calls[0]!;
    const [filtrosCount] = c.compraRepo.count.mock.calls[0]!;

    expect(filtrosCount).toEqual({
      cicloId: 'ciclo-1',
      soloEnCurso: true,
      sectorId: 'sector-1',
    });
    expect(filtrosFindAll).toEqual({
      cicloId: 'ciclo-1',
      soloEnCurso: true,
      sectorId: 'sector-1',
      limit: 2,
      offset: 0,
    });
  });

  it('S62: soloEnCurso default es true cuando el caller no lo especifica', async () => {
    const c = makeCollaborators();

    await c.useCase.execute();

    expect(c.compraRepo.count).toHaveBeenCalledWith(expect.objectContaining({ soloEnCurso: true }));
  });

  it('S62: soloEnCurso: false desactiva el filtro por defecto (universo completo, incluidas cerradas/canceladas)', async () => {
    const c = makeCollaborators();

    await c.useCase.execute({ soloEnCurso: false });

    expect(c.compraRepo.count).toHaveBeenCalledWith(
      expect.objectContaining({ soloEnCurso: false }),
    );
  });
});
