/**
 * limpiar-componentes-sin-insumo.spec.ts — WU-1 (sdd catalogo-unico-componentes, ADR-3).
 *
 * Unit: parseo de flags, derivación de URL y el contrato de `--apply`
 * (sin `--esperadas` o con un número distinto NO borra nada). Los pools son
 * fakes: no toca ninguna base.
 */
import { vi } from 'vitest';
import {
  EXIT_CON_FILAS,
  EXIT_ERROR,
  EXIT_OK,
  ejecutarLimpieza,
  parsearArgs,
  tenantUrl,
} from './limpiar-componentes-sin-insumo.mjs';

interface FakeFila {
  id: string;
  equipo_id: string;
  equipo: string | null;
  tipo_componente_codigo: string;
  deleted_at: Date | null;
}

/** Pool fake: `query` responde el inventario; `connect` registra los DELETE. */
function fakePool(filas: FakeFila[]) {
  const sentencias: string[] = [];
  const client = {
    query: vi.fn(async (sql: string) => {
      sentencias.push(sql);
      if (sql.startsWith('delete')) return { rows: filas.map((f) => ({ id: f.id })) };
      return { rows: [] };
    }),
    release: vi.fn(),
  };
  return {
    sentencias,
    pool: {
      query: vi.fn(async () => ({ rows: filas })),
      connect: vi.fn(async () => client),
    },
  };
}

const FILA_VIVA: FakeFila = {
  id: 'a1',
  equipo_id: 'e1',
  equipo: 'PC 1',
  tipo_componente_codigo: 'RAM',
  deleted_at: null,
};
const FILA_BORRADA: FakeFila = {
  id: 'b2',
  equipo_id: 'e2',
  equipo: 'PC 2',
  tipo_componente_codigo: 'DISCO',
  deleted_at: new Date('2026-08-01T10:00:00.000Z'),
};

describe('parsearArgs', () => {
  it('sin flags es modo reporte', () => {
    expect(parsearArgs([])).toEqual({ apply: false, esperadas: null });
  });

  it('--apply con --esperadas=N devuelve ambos', () => {
    expect(parsearArgs(['--apply', '--esperadas=12'])).toEqual({ apply: true, esperadas: 12 });
  });

  it('--apply sin --esperadas es un error', () => {
    expect(parsearArgs(['--apply'])).toHaveProperty('error');
  });

  it('--esperadas sin --apply es un error', () => {
    expect(parsearArgs(['--esperadas=3'])).toHaveProperty('error');
  });

  it.each(['--esperadas=', '--esperadas=abc', '--esperadas=-1', '--esperadas=1.5'])(
    'rechaza un valor inválido: %s',
    (flag) => {
      expect(parsearArgs(['--apply', flag])).toHaveProperty('error');
    },
  );

  it('rechaza un argumento desconocido', () => {
    expect(parsearArgs(['--forzar'])).toHaveProperty('error');
  });
});

describe('tenantUrl', () => {
  it('reemplaza el pathname de master por /db_name', () => {
    expect(tenantUrl('postgresql://u:p@host:5432/soporte_master', 'tenant_abc')).toBe(
      'postgresql://u:p@host:5432/tenant_abc',
    );
  });
});

describe('ejecutarLimpieza', () => {
  const log = vi.fn();

  beforeEach(() => log.mockClear());

  it('reporte sin filas: exit 0', async () => {
    const { pool } = fakePool([]);
    const r = await ejecutarLimpieza({ tenants: [{ dbName: 't1', pool }], apply: false, log });
    expect(r.exitCode).toBe(EXIT_OK);
  });

  it('reporte con filas: exit 2, distingue vivas de borradas y lista clientes fuera', async () => {
    const { pool } = fakePool([FILA_VIVA, FILA_BORRADA]);
    const r = await ejecutarLimpieza({
      tenants: [{ dbName: 't1', pool }],
      fuera: [{ nombre: 'Cliente Baja', db_name: 't_baja', activo: false, deleted_at: null }],
      apply: false,
      log,
    });

    expect(r.exitCode).toBe(EXIT_CON_FILAS);
    const texto = log.mock.calls.map((c) => c[0]).join('\n');
    expect(texto).toContain('2 (1 vivas, 1 borradas lógicamente)');
    expect(texto).toContain('borrada lógicamente el 2026-08-01T10:00:00.000Z');
    expect(texto).toContain('Cliente Baja');
  });

  it('el reporte nunca abre una transacción de borrado', async () => {
    const { pool } = fakePool([FILA_VIVA]);
    await ejecutarLimpieza({ tenants: [{ dbName: 't1', pool }], apply: false, log });
    expect(pool.connect).not.toHaveBeenCalled();
  });

  it('--apply con un número distinto de esperadas no borra nada', async () => {
    const { pool } = fakePool([FILA_VIVA, FILA_BORRADA]);
    const r = await ejecutarLimpieza({
      tenants: [{ dbName: 't1', pool }],
      apply: true,
      esperadas: 5,
      log,
    });

    expect(r).toEqual({ exitCode: EXIT_ERROR, borradas: 0 });
    expect(pool.connect).not.toHaveBeenCalled();
  });

  it('--apply con el número correcto borra y termina con exit 0', async () => {
    const { pool, sentencias } = fakePool([FILA_VIVA, FILA_BORRADA]);
    const r = await ejecutarLimpieza({
      tenants: [{ dbName: 't1', pool }],
      apply: true,
      esperadas: 2,
      log,
    });

    expect(r).toEqual({ exitCode: EXIT_OK, borradas: 2 });
    expect(sentencias[0]).toBe('BEGIN');
    expect(sentencias.at(-1)).toBe('COMMIT');
  });

  it('si los ids borrados difieren de los inventariados hace ROLLBACK y falla', async () => {
    const { pool, sentencias } = fakePool([FILA_VIVA]);
    // El DELETE devuelve un id que el inventario no vio (apareció entre medio).
    const client = await pool.connect();
    client.query.mockImplementation(async (sql: string) => {
      sentencias.push(sql);
      if (sql.startsWith('delete')) return { rows: [{ id: 'a1' }, { id: 'zz' }] };
      return { rows: [] };
    });

    const r = await ejecutarLimpieza({
      tenants: [{ dbName: 't1', pool }],
      apply: true,
      esperadas: 1,
      log,
    });

    expect(r.exitCode).toBe(EXIT_ERROR);
    expect(sentencias).toContain('ROLLBACK');
    expect(sentencias).not.toContain('COMMIT');
  });
});
