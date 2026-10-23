/**
 * retirar-celdas-tickets-matriz.integration.spec.ts — T9b
 * (odd/tasks/permisos-por-tipo-ticket.md, L50.1-2).
 *
 * Corre la migración `20261023120000_retirar_celdas_tickets_matriz` y su `rollback.sql` sobre una
 * base efímera: la master de test compartida ya tiene el CHECK nuevo y no admite sembrar las
 * celdas que la migración tiene que borrar. La tabla se arma con su migración de creación y el
 * CHECK anterior a T9b se pone con el propio `rollback.sql`, así que el mismo spec prueba que el
 * rollback deja la tabla como estaba antes.
 *
 * Verifica fila por fila: se borran TICKETS:* y EDILICIA:LECTURA|ALTAS|MODIFICACION de todos los
 * usuarios y clientes; quedan EDILICIA:BORRADO y las celdas de los demás módulos; correrla dos
 * veces da lo mismo; el CHECK nuevo rechaza las celdas retiradas; el rollback vuelve a aceptarlas
 * pero no restaura las borradas.
 */
import * as fs from 'fs';
import * as path from 'path';
import { randomBytes, randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { PostgresAdminService } from '../src/clientes/infrastructure/postgres-admin.service';
import { usarLockMasterTest } from '../src/testing/lock-master-test';

const TEST_URL =
  process.env.DATABASE_URL_MASTER ??
  'postgresql://soporte:soporte@localhost:5432/soporte_master_test';
const EPHEMERAL_DB_NAME = `soporte_retiro_celdas_${randomBytes(4).toString('hex')}_test`;

const MIGRACIONES = path.resolve(__dirname, 'migrations');
const CREAR_TABLA = path.join(
  MIGRACIONES,
  '20260816210000_add_usuario_cliente_permisos',
  'migration.sql',
);
const MIGRACION = path.join(MIGRACIONES, '20261023120000_retirar_celdas_tickets_matriz');

const leer = (archivo: string): string => fs.readFileSync(archivo, 'utf8');

/** Celdas que la migración borra: todo TICKETS y EDILICIA salvo BORRADO. */
const RETIRADAS = [
  'TICKETS:LECTURA',
  'TICKETS:ALTAS',
  'TICKETS:MODIFICACION',
  'TICKETS:VER_TODOS',
  'TICKETS:ASIGNAR',
  'TICKETS:TRANSICIONAR',
  'TICKETS:OBSERVAR',
  'TICKETS:COMENTAR',
  'EDILICIA:LECTURA',
  'EDILICIA:ALTAS',
  'EDILICIA:MODIFICACION',
];

/** Celdas que sobreviven: EDILICIA:BORRADO (desvincular compra, L21) y otros módulos. */
const CONSERVADAS = ['COMPRAS:LECTURA', 'EDILICIA:BORRADO', 'INSUMOS:AJUSTAR', 'KB:LECTURA'];

// Turno exclusivo sobre la master de test compartida — ver src/testing/lock-master-test.ts.
usarLockMasterTest();

describe('Migración 20261023120000_retirar_celdas_tickets_matriz (T9b)', () => {
  let pool: Pool;
  const admin = new PostgresAdminService(TEST_URL);
  const usuarioA = randomUUID();
  const usuarioB = randomUUID();
  const clienteA = randomUUID();
  const clienteB = randomUUID();

  async function insertar(usuarioId: string, clienteId: string, celda: string): Promise<void> {
    const [modulo, accion] = celda.split(':');
    await pool.query(
      `INSERT INTO usuario_cliente_permisos (usuario_id, cliente_id, modulo, accion)
       VALUES ($1, $2, $3, $4)`,
      [usuarioId, clienteId, modulo, accion],
    );
  }

  async function celdasDe(usuarioId: string, clienteId: string): Promise<string[]> {
    const { rows } = await pool.query<{ modulo: string; accion: string }>(
      'SELECT modulo, accion FROM usuario_cliente_permisos WHERE usuario_id = $1 AND cliente_id = $2',
      [usuarioId, clienteId],
    );
    return rows.map((r) => `${r.modulo}:${r.accion}`).sort();
  }

  beforeAll(async () => {
    await admin.createDatabase(EPHEMERAL_DB_NAME);
    const url = new URL(TEST_URL);
    url.pathname = `/${EPHEMERAL_DB_NAME}`;
    pool = new Pool({ connectionString: url.toString() });

    await pool.query(leer(CREAR_TABLA));
    // El CHECK de 36 pares vigente antes de T9b.
    await pool.query(leer(path.join(MIGRACION, 'rollback.sql')));

    // Dos usuarios en dos clientes: el DELETE no filtra por usuario ni por cliente.
    for (const [usuarioId, clienteId] of [
      [usuarioA, clienteA],
      [usuarioA, clienteB],
      [usuarioB, clienteA],
    ]) {
      for (const celda of [...RETIRADAS, ...CONSERVADAS]) {
        await insertar(usuarioId, clienteId, celda);
      }
    }
  }, 60_000);

  afterAll(async () => {
    await pool.end().catch(() => undefined);
    await admin.dropDatabase(EPHEMERAL_DB_NAME);
  }, 30_000);

  it('borra TICKETS:* y EDILICIA:LECTURA|ALTAS|MODIFICACION y conserva el resto, en todos los usuarios y clientes', async () => {
    await pool.query(leer(path.join(MIGRACION, 'migration.sql')));

    expect(await celdasDe(usuarioA, clienteA)).toEqual(CONSERVADAS);
    expect(await celdasDe(usuarioA, clienteB)).toEqual(CONSERVADAS);
    expect(await celdasDe(usuarioB, clienteA)).toEqual(CONSERVADAS);
  });

  it('es re-ejecutable: una segunda corrida deja las mismas filas', async () => {
    await pool.query(leer(path.join(MIGRACION, 'migration.sql')));

    expect(await celdasDe(usuarioA, clienteA)).toEqual(CONSERVADAS);
    const { rows } = await pool.query<{ total: string }>(
      'SELECT count(*) AS total FROM usuario_cliente_permisos',
    );
    expect(Number(rows[0].total)).toBe(CONSERVADAS.length * 3);
  });

  it.each(RETIRADAS)('el CHECK nuevo rechaza %s', async (celda) => {
    await expect(insertar(usuarioB, clienteB, celda)).rejects.toThrow(
      /usuario_cliente_permisos_modulo_accion_check/,
    );
  });

  it('el CHECK nuevo acepta EDILICIA:BORRADO', async () => {
    await insertar(usuarioB, clienteB, 'EDILICIA:BORRADO');
    expect(await celdasDe(usuarioB, clienteB)).toEqual(['EDILICIA:BORRADO']);
  });

  it('el rollback vuelve a aceptar las celdas retiradas, sin restaurar las borradas', async () => {
    await pool.query(leer(path.join(MIGRACION, 'rollback.sql')));

    expect(await celdasDe(usuarioA, clienteA)).toEqual(CONSERVADAS);
    await insertar(usuarioB, clienteB, 'TICKETS:LECTURA');
    expect(await celdasDe(usuarioB, clienteB)).toEqual(['EDILICIA:BORRADO', 'TICKETS:LECTURA']);
  });
});
