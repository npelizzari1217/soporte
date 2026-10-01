/**
 * [INTEGRATION] Atomicidad de la baja de equipo completo contra Postgres real
 * (baja-equipo-completo, R6 y R7). Cada caso compara la foto de todo lo que una baja puede
 * escribir (`fx.foto()`) antes y después: una baja que falla, incluso DESPUÉS de haber escrito,
 * no deja nada cambiado. El camino transaccional se alcanza salteando el diagnóstico de afuera
 * con un espía. Sobre `soporte_tenant_test` con PREFIJO por corrida; no toca `soporte_master_test`.
 */
import type { DomainError, Result } from '../../../shared/domain/result';
import { calcularSaldos } from '../../../insumos/domain/entities/tipo-movimiento-insumo';
import {
  BajaEquipoConPiezasProblematicasError,
  EquipoDadoDeBajaError,
} from '../../domain/errors/equipos.errors';
import { BajaEquipoFixtures } from '../../testing/baja-equipo.fixtures';

describe('DarDeBajaEquipo — atomicidad — Integration', () => {
  let fx: BajaEquipoFixtures;

  beforeAll(async () => {
    fx = await BajaEquipoFixtures.crear();
  }, 30_000);

  afterAll(async () => {
    await fx.cerrar();
  }, 30_000);

  beforeEach(() => fx.limpiar());

  afterEach(async () => {
    vi.restoreAllMocks();
    expect(await fx.exigirInvarianteSerie()).toEqual([]);
  });

  const darDeBaja = (
    equipoId: string,
    seriales: { componenteId: string; numeroSerie: string }[] = [],
  ) =>
    fx.conTenant(() =>
      fx.useCase.execute({
        equipoId,
        destino: 'STOCK_USADO',
        categoria: 'VEJEZ',
        seriales,
        usuarioId: fx.usuarioId,
      }),
    );

  /** El diagnóstico de afuera no ve nada: la baja llega al camino transaccional. */
  const saltearDiagnostico = () =>
    vi.spyOn(fx.registrarEntrada, 'diagnosticarDevolucionesDeEquipo').mockResolvedValue([]);

  function piezasDelError(result: Result<unknown, DomainError>) {
    expect(result.isFail()).toBe(true);
    const error = result.getError();
    if (!(error instanceof BajaEquipoConPiezasProblematicasError)) throw error;
    return [...error.piezas].sort((a, b) => a.componenteId.localeCompare(b.componenteId));
  }

  const ordenadas = <T extends { componenteId: string }>(piezas: T[]) =>
    [...piezas].sort((a, b) => a.componenteId.localeCompare(b.componenteId));

  const CAMINOS = [
    ['el diagnóstico de afuera', false],
    ['el camino transaccional', true],
  ] as const;

  it.each(CAMINOS)(
    'una pieza con el insumo borrado rechaza la baja por %s y no cambia nada',
    async (_camino, salteando) => {
      const equipo = await fx.crearEquipo('ATO-1');
      await fx.agregarComponente(equipo.id, fx.ningunoId);
      const { unidadId } = await fx.agregarUnidadInstalada(equipo.id, 'S1');
      const borrado = await fx.agregarComponente(equipo.id, fx.borradoId);
      const antes = await fx.foto();
      if (salteando) saltearDiagnostico();

      const result = await darDeBaja(equipo.id);

      expect(piezasDelError(result)).toEqual([
        { componenteId: borrado, insumoId: fx.borradoId, causa: 'INSUMO_BORRADO' },
      ]);
      expect(await fx.foto()).toEqual(antes);
      const fila = await fx.tenantClient.equipoInformatico.findUniqueOrThrow({
        where: { id: equipo.id },
      });
      expect(fila.activo).toBe(true);
      const activos = await fx.tenantClient.componenteEquipo.count({
        where: { equipoId: equipo.id, deletedAt: null },
      });
      expect(activos).toBe(3);
      const unidad = await fx.tenantClient.unidadInsumo.findUniqueOrThrow({
        where: { id: unidadId },
      });
      expect(unidad.estado).toBe('INSTALADA');
    },
    30_000,
  );

  it.each(CAMINOS)(
    'dos insumos borrados y un legado SERIE sin serial: el error lista los tres componentes por %s',
    async (_camino, salteando) => {
      const equipo = await fx.crearEquipo('ATO-2');
      const borrado1 = await fx.agregarComponente(equipo.id, fx.borradoId);
      const borrado2 = await fx.agregarComponente(equipo.id, fx.borradoId);
      const legado = await fx.agregarComponente(equipo.id, fx.serieId);
      const antes = await fx.foto();
      if (salteando) saltearDiagnostico();

      const result = await darDeBaja(equipo.id);

      expect(piezasDelError(result)).toEqual(
        ordenadas([
          { componenteId: borrado1, insumoId: fx.borradoId, causa: 'INSUMO_BORRADO' },
          { componenteId: borrado2, insumoId: fx.borradoId, causa: 'INSUMO_BORRADO' },
          { componenteId: legado, insumoId: fx.serieId, causa: 'SERIAL_REQUERIDO' },
        ]),
      );
      expect(await fx.foto()).toEqual(antes);
    },
    30_000,
  );

  it('falla al marcar el equipo: revierte las ENTRADAs, la unidad, los eventos y las marcas ya escritas', async () => {
    const equipo = await fx.crearEquipo('ATO-3');
    await fx.agregarComponente(equipo.id, fx.ningunoId);
    const { unidadId } = await fx.agregarUnidadInstalada(equipo.id, 'S1');
    const antes = await fx.foto();
    const saldosAntes = await fx.saldos(fx.ningunoId);
    // Dentro del `run()`, justo antes del último paso: las escrituras anteriores ya existen.
    let usadoEnLaTransaccion = -1;
    const marcar = vi.spyOn(fx.equipoRepo, 'registrarBaja').mockImplementation(async () => {
      const sumas = await fx.movimientoRepo.sumByTipo(fx.ningunoId);
      usadoEnLaTransaccion = calcularSaldos(sumas).USADO;
      return false;
    });

    const result = await darDeBaja(equipo.id);

    expect(marcar).toHaveBeenCalledTimes(1);
    expect(usadoEnLaTransaccion).toBe(saldosAntes.USADO + 1);
    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(EquipoDadoDeBajaError);
    expect(await fx.foto()).toEqual(antes);
    expect(await fx.saldos(fx.ningunoId)).toEqual(saldosAntes);
    const unidad = await fx.tenantClient.unidadInsumo.findUniqueOrThrow({
      where: { id: unidadId },
    });
    expect(unidad).toMatchObject({ estado: 'INSTALADA', equipoId: equipo.id });
  }, 30_000);

  it('un serial legado ya existente que saltea el diagnóstico de afuera falla bajo L2 y no escribe nada', async () => {
    const equipo = await fx.crearEquipo('ATO-4');
    await fx.agregarComponente(equipo.id, fx.ningunoId);
    const { unidadId } = await fx.agregarUnidadInstalada(equipo.id, 'S1');
    const legado = await fx.agregarComponente(equipo.id, fx.serieId);
    await fx.agregarUnidadEnDeposito('DUP-1');
    const antes = await fx.foto();
    const diagnostico = saltearDiagnostico();

    const result = await darDeBaja(equipo.id, [{ componenteId: legado, numeroSerie: 'dup-1' }]);

    expect(diagnostico).toHaveBeenCalledTimes(1);
    expect(piezasDelError(result)).toEqual([
      { componenteId: legado, insumoId: fx.serieId, causa: 'SERIAL_DUPLICADO' },
    ]);
    expect(await fx.foto()).toEqual(antes);
    const unidad = await fx.tenantClient.unidadInsumo.findUniqueOrThrow({
      where: { id: unidadId },
    });
    expect(unidad).toMatchObject({ estado: 'INSTALADA', equipoId: equipo.id });
  }, 30_000);
});
