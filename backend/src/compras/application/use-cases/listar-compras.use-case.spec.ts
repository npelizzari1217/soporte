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
 *   `ICompraRepository.findPaginaConItems`.
 * - Defaults de paginación cuando el DTO no los provee.
 * - Sin compras -> `{ items: [], total }`, sin error.
 * - `total`: sale de la MISMA lectura que la página (WU-25), y sigue siendo
 *   el del universo filtrado completo incluso con la página vacía (offset
 *   más allá del total) — el borde que en su momento descartó
 *   `COUNT(*) OVER()` (`sdd/redisenio-modulo-compras/count-en-consulta`).
 * - WU-25: tabla de precedencia entre el filtro nuevo `estado` y el
 *   `soloEnCurso` deprecado.
 *
 * Ref spec: sdd/redisenio-modulo-compras/spec §4.9 (S32, S33, S34). Ref
 * design: ADR-C1, ADR-C2. Ref tasks: PR-19, H3; WU-25
 * (sdd/compras-orden-filtro-estado).
 */
import { ListarComprasUseCase } from './listar-compras.use-case';
import { CompraEntity, CompraProps } from '../../domain/entities/compra.entity';
import { ItemCompraEntity, ItemCompraCreateProps } from '../../domain/entities/item-compra.entity';
import { FiltroGrupoEstadoCompra } from '../../domain/services/estado-compra';

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
      findPaginaConItems: vi.fn().mockResolvedValue({ compras: [], total: 0 }),
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
    c.compraRepo.findPaginaConItems.mockResolvedValue({ compras: [compra], total: 1 });

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
    c.compraRepo.findPaginaConItems.mockResolvedValue({ compras: [compra], total: 1 });

    const result = await c.useCase.execute();

    const [fila] = result.getValue().items;
    expect(fila.estado).toBe(compra.estado);
    expect(fila.comprado).toBe(compra.comprado);
    expect(fila.cerrado).toBe(compra.cerrado);
    expect(fila.estado).toBe('PENDIENTE');
    expect(fila.comprado).toBe(false);
    expect(fila.cerrado).toBe(false);
  });

  it('traduce pagina/porPagina a limit/offset de findPaginaConItems (S32)', async () => {
    const c = makeCollaborators();

    await c.useCase.execute({ pagina: 3, porPagina: 10 });

    expect(c.compraRepo.findPaginaConItems).toHaveBeenCalledTimes(1);
    expect(c.compraRepo.findPaginaConItems).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 10, offset: 20 }),
    );
  });

  it('sin pagina/porPagina explícitos, aplica los defaults (página 1, 20 por página)', async () => {
    const c = makeCollaborators();

    const result = await c.useCase.execute();

    expect(c.compraRepo.findPaginaConItems).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 20, offset: 0 }),
    );
    expect(result.getValue().pagina).toBe(1);
    expect(result.getValue().porPagina).toBe(20);
  });

  it('sin compras -> items vacío, sin error', async () => {
    const c = makeCollaborators();
    c.compraRepo.findPaginaConItems.mockResolvedValue({ compras: [], total: 0 });

    const result = await c.useCase.execute();

    expect(result.isOk()).toBe(true);
    expect(result.getValue().items).toEqual([]);
  });

  it('total refleja el universo filtrado completo, NO el tamaño de la página (más filas que porPagina)', async () => {
    const c = makeCollaborators();
    const compraA = crearCompra('compra-a');
    const compraB = crearCompra('compra-b');
    // Página de 2 pero el filtro completo tiene 5 compras -> total debe ser 5, no 2.
    c.compraRepo.findPaginaConItems.mockResolvedValue({ compras: [compraA, compraB], total: 5 });

    const result = await c.useCase.execute({ pagina: 1, porPagina: 2 });

    expect(result.getValue().items).toHaveLength(2);
    expect(result.getValue().total).toBe(5);
  });

  it('el borde que descartó COUNT(*) OVER(): página vacía (offset más allá del total) pero total sigue siendo correcto', async () => {
    const c = makeCollaborators();
    c.compraRepo.findPaginaConItems.mockResolvedValue({ compras: [], total: 5 });

    const result = await c.useCase.execute({ pagina: 100, porPagina: 2 });

    expect(result.getValue().items).toEqual([]);
    expect(result.getValue().total).toBe(5);
  });

  it('el orden de la página se respeta tal cual lo devuelve el repositorio (el ORDER BY vive en SQL, no acá)', async () => {
    const c = makeCollaborators();
    const primera = crearCompra('compra-activa');
    const segunda = crearCompra('compra-cancelada');
    c.compraRepo.findPaginaConItems.mockResolvedValue({ compras: [primera, segunda], total: 2 });

    const result = await c.useCase.execute();

    expect(result.getValue().items.map((fila) => fila.id)).toEqual([
      'compra-activa',
      'compra-cancelada',
    ]);
  });

  // ─── WU-13 (sdd/compras-tres-etapas-y-sectores, R9/S62) ─────────────────
  //
  // El bug original: `count()` se llamaba SIN argumentos mientras
  // `findAllConItems` SÍ recibía filtros, así que el total de paginación
  // medía el universo SIN filtrar. WU-25 cerró esa clase entera de bug por
  // construcción — hay UNA sola lectura, así que `items` y `total` no pueden
  // salir de filtros distintos. Lo que queda por verificar es que el filtro
  // de negocio llegue completo a esa única lectura.

  it('S62: los filtros de negocio llegan completos a findPaginaConItems, junto con limit/offset', async () => {
    const c = makeCollaborators();

    await c.useCase.execute({
      pagina: 1,
      porPagina: 2,
      cicloId: 'ciclo-1',
      estado: 'ACTIVAS',
      sectorId: 'sector-1',
      fechaDesde: new Date('2026-01-01'),
      fechaHasta: new Date('2026-12-31'),
    });

    expect(c.compraRepo.findPaginaConItems).toHaveBeenCalledTimes(1);
    const [filtros] = c.compraRepo.findPaginaConItems.mock.calls[0]!;
    expect(filtros).toEqual({
      cicloId: 'ciclo-1',
      grupoEstado: 'ACTIVAS',
      sectorId: 'sector-1',
      fechaDesde: new Date('2026-01-01'),
      fechaHasta: new Date('2026-12-31'),
      limit: 2,
      offset: 0,
    });
  });

  // ─── WU-25 (sdd/compras-orden-filtro-estado) — precedencia estado/soloEnCurso ──

  describe('WU-25: precedencia entre `estado` y el `soloEnCurso` deprecado', () => {
    interface CasoPrecedencia {
      readonly nombre: string;
      readonly dto: { estado?: FiltroGrupoEstadoCompra; soloEnCurso?: boolean };
      readonly esperado: FiltroGrupoEstadoCompra;
    }

    const casos: readonly CasoPrecedencia[] = [
      { nombre: 'ninguno de los dos -> default ACTIVAS', dto: {}, esperado: 'ACTIVAS' },
      { nombre: 'sólo soloEnCurso=true -> ACTIVAS', dto: { soloEnCurso: true }, esperado: 'ACTIVAS' },
      { nombre: 'sólo soloEnCurso=false -> TODAS', dto: { soloEnCurso: false }, esperado: 'TODAS' },
      {
        nombre: 'sólo estado=COMPLETADAS -> COMPLETADAS',
        dto: { estado: 'COMPLETADAS' },
        esperado: 'COMPLETADAS',
      },
      {
        nombre: 'estado gana sobre soloEnCurso=false',
        dto: { estado: 'CANCELADAS', soloEnCurso: false },
        esperado: 'CANCELADAS',
      },
      {
        nombre: 'estado gana sobre soloEnCurso=true',
        dto: { estado: 'TODAS', soloEnCurso: true },
        esperado: 'TODAS',
      },
    ];

    it.each(casos)('$nombre', async ({ dto, esperado }) => {
      const c = makeCollaborators();

      await c.useCase.execute(dto);

      expect(c.compraRepo.findPaginaConItems).toHaveBeenCalledWith(
        expect.objectContaining({ grupoEstado: esperado }),
      );
    });
  });
});
