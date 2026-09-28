/**
 * check-calendario-master-default.spec.ts — WU-1b (sdd/horario-laboral-por-cliente).
 *
 * La consulta va INYECTADA (mismo criterio que `backfill-correo-clientes.spec.ts`):
 * el spec no abre una conexion real, pasa una funcion `query()` fake que
 * devuelve o lanza lo que un chequeo real vería, y valida solo la logica
 * pura de `compararConDefault`/`chequearDefaultMaster`.
 *
 * Ref design: D18. Ref tasks: WU-1b, 1b.2.
 */
import { chequearDefaultMaster, compararConDefault } from './check-calendario-master-default.mjs';

const FILAS_DEFAULT = [
  { dia_semana: 0, apertura_minuto: null, cierre_minuto: null },
  { dia_semana: 1, apertura_minuto: 540, cierre_minuto: 1080 },
  { dia_semana: 2, apertura_minuto: 540, cierre_minuto: 1080 },
  { dia_semana: 3, apertura_minuto: 540, cierre_minuto: 1080 },
  { dia_semana: 4, apertura_minuto: 540, cierre_minuto: 1080 },
  { dia_semana: 5, apertura_minuto: 540, cierre_minuto: 1080 },
  { dia_semana: 6, apertura_minuto: null, cierre_minuto: null },
];

describe('compararConDefault() — evaluacion pura de las 7 filas', () => {
  it('el default exacto (lun-vie 540-1080, sab/dom NULL) pasa', () => {
    expect(compararConDefault(FILAS_DEFAULT)).toEqual({ ok: true });
  });

  it('un dia cambiado falla y reporta cual', () => {
    const filas = FILAS_DEFAULT.map((f) =>
      f.dia_semana === 1 ? { ...f, apertura_minuto: 480, cierre_minuto: 720 } : f,
    );

    const resultado = compararConDefault(filas);

    expect(resultado.ok).toBe(false);
    expect(resultado.motivo).toContain('dia_semana=1');
    expect(resultado.motivo).toContain('esperado apertura=540 cierre=1080');
    expect(resultado.motivo).toContain('encontrado apertura=480 cierre=720');
  });

  it('una fila faltante (6 en vez de 7) falla', () => {
    const filas = FILAS_DEFAULT.filter((f) => f.dia_semana !== 6);

    const resultado = compararConDefault(filas);

    expect(resultado.ok).toBe(false);
    expect(resultado.motivo).toContain('se esperaban 7 filas');
    expect(resultado.motivo).toContain('se encontraron 6');
  });
});

describe('chequearDefaultMaster() — consulta inyectada', () => {
  it('con el default exacto, ok true', async () => {
    const resultado = await chequearDefaultMaster(async () => FILAS_DEFAULT);

    expect(resultado).toEqual({ ok: true });
  });

  it('la tabla ausente (42P01) se traduce a un resultado ok:false, no propaga la excepcion', async () => {
    const query = async () => {
      const error: NodeJS.ErrnoException = new Error(
        'relation "calendario_laboral_dias" does not exist',
      );
      error.code = '42P01';
      throw error;
    };

    const resultado = await chequearDefaultMaster(query);

    expect(resultado.ok).toBe(false);
    expect(resultado.motivo).toContain('no existe en master');
  });

  it('un error de base distinto de 42P01 se propaga (no es el caso que esta precondicion cubre)', async () => {
    const query = async () => {
      throw new Error('conexion rechazada');
    };

    await expect(chequearDefaultMaster(query)).rejects.toThrow('conexion rechazada');
  });
});
