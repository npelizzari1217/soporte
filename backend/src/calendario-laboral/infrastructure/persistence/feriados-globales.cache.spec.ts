import { FERIADOS_GLOBALES_TTL_MS, FeriadosGlobalesCache } from './feriados-globales.cache';

/** FeriadosGlobalesCache (odd/tasks/jd-tiempo-tecnico.md, T4, JD-B-002). */
const NAVIDAD = new Date('2026-12-25T00:00:00Z');
const ANIO_NUEVO = new Date('2027-01-01T00:00:00Z');

function armar() {
  let ahora = 1_000_000;
  const cache = new FeriadosGlobalesCache(() => ahora);
  return {
    cache,
    avanzar: (ms: number) => {
      ahora += ms;
    },
  };
}

describe('FeriadosGlobalesCache', () => {
  it('dentro de la vigencia devuelve la copia sin volver a consultar', async () => {
    const { cache, avanzar } = armar();
    const cargar = vi.fn().mockResolvedValue([NAVIDAD]);

    expect(await cache.obtener(cargar)).toEqual([NAVIDAD]);
    avanzar(FERIADOS_GLOBALES_TTL_MS - 1);
    expect(await cache.obtener(cargar)).toEqual([NAVIDAD]);
    expect(cargar).toHaveBeenCalledTimes(1);
  });

  it('vencida la vigencia vuelve a consultar y devuelve lo nuevo', async () => {
    const { cache, avanzar } = armar();
    const cargar = vi.fn().mockResolvedValueOnce([NAVIDAD]).mockResolvedValueOnce([ANIO_NUEVO]);

    await cache.obtener(cargar);
    avanzar(FERIADOS_GLOBALES_TTL_MS);
    expect(await cache.obtener(cargar)).toEqual([ANIO_NUEVO]);
    expect(cargar).toHaveBeenCalledTimes(2);
  });

  it('invalidar hace que la próxima lectura consulte aunque la copia siga vigente', async () => {
    const { cache } = armar();
    const cargar = vi.fn().mockResolvedValueOnce([NAVIDAD]).mockResolvedValueOnce([ANIO_NUEVO]);

    await cache.obtener(cargar);
    cache.invalidar();
    expect(await cache.obtener(cargar)).toEqual([ANIO_NUEVO]);
  });

  it('lecturas simultáneas comparten una sola consulta', async () => {
    const { cache } = armar();
    const cargar = vi.fn().mockResolvedValue([NAVIDAD]);

    const [a, b] = await Promise.all([cache.obtener(cargar), cache.obtener(cargar)]);
    expect(a).toEqual([NAVIDAD]);
    expect(b).toEqual([NAVIDAD]);
    expect(cargar).toHaveBeenCalledTimes(1);
  });

  it('una consulta que falla no queda guardada: el error llega y la siguiente lectura reintenta', async () => {
    const { cache } = armar();
    const cargar = vi
      .fn()
      .mockRejectedValueOnce(new Error('master caído'))
      .mockResolvedValueOnce([NAVIDAD]);

    await expect(cache.obtener(cargar)).rejects.toThrow('master caído');
    expect(await cache.obtener(cargar)).toEqual([NAVIDAD]);
    expect(cargar).toHaveBeenCalledTimes(2);
  });
});
