/**
 * backfill-permisos-tipo-ticket.integration.spec.ts — T4b de odd/tasks/permisos-por-tipo-ticket.md (S7).
 *
 * Contra Postgres REAL: las celdas se leen de la base master de test (cliente, usuarios y
 * membresías propios, borrados al final) y se escriben en un tenant efímero con todas las
 * migraciones. El ensayo no escribe, `--apply` inserta exactamente las filas de L11, una segunda
 * corrida queda frenada por la guarda, y `--force` completa sin duplicar.
 * La traducción de L11 se pasa desde el código fuente: el script la toma de `dist/`.
 */
import { randomBytes } from 'node:crypto';
import { Client } from 'pg';
import { PostgresAdminService } from '../src/clientes/infrastructure/postgres-admin.service';
import { TenantMigrationRunnerAdapter } from '../src/clientes/infrastructure/tenant-migration-runner.adapter';
import { accionesDeTipoDesdeCeldas } from '../src/tickets/domain/permisos-tipo-ticket';
import {
  backfillTenant,
  formatearResultado,
  leerCeldasPorUsuario,
  parsearArgs,
} from './backfill-permisos-tipo-ticket.mjs';

const MASTER_TEST_URL =
  process.env.DATABASE_URL_MASTER ??
  'postgresql://soporte:soporte@localhost:5432/soporte_master_test';
const SUFIJO = randomBytes(4).toString('hex');
const TENANT_DB_NAME = `soporte_prov_bfpermtipo_${SUFIJO}_test`;

function buildTenantUrl(dbName: string): string {
  const url = new URL(MASTER_TEST_URL);
  url.pathname = `/${dbName}`;
  return url.toString();
}

/** Usuarios del fixture: rol de su membresía, si está activa, y celdas master del cliente. */
const USUARIOS = {
  // Celdas de TICKETS y una de KB, que no cuenta para ningún tipo.
  tickets: {
    rol: 'TECNICO',
    activa: true,
    celdas: ['TICKETS:LECTURA', 'TICKETS:ALTAS', 'TICKETS:OBSERVAR', 'KB:LECTURA'],
  },
  // EDILICIA:BORRADO (desvincular compra) sigue siendo permiso del módulo (L21). Con una celda de
  // EDILICIA, el tipo de EDILICIA suma también sus celdas de TICKETS (L35).
  edilicia: {
    rol: 'TECNICO',
    activa: true,
    celdas: [
      'TICKETS:LECTURA',
      'TICKETS:ASIGNAR',
      'EDILICIA:LECTURA',
      'EDILICIA:MODIFICACION',
      'EDILICIA:BORRADO',
    ],
  },
  // Con una celda de COMPRAS: el tipo de COMPRAS toma sus celdas de TICKETS (L23).
  compras: {
    rol: 'TECNICO',
    activa: true,
    celdas: ['TICKETS:LECTURA', 'TICKETS:MODIFICACION', 'COMPRAS:LECTURA'],
  },
  // Membresía desactivada: se migra igual (L21).
  inactivo: { rol: 'TECNICO', activa: false, celdas: ['TICKETS:LECTURA'] },
  // Bypass: sin celdas, no recibe filas.
  admin: { rol: 'ADMINISTRADOR', activa: true, celdas: [] },
} as const;
type NombreUsuario = keyof typeof USUARIOS;

/**
 * Filas esperadas como `usuario|tipo|accion`, escritas a mano desde L11, L23 y L35 (no derivadas
 * de la traducción). Tipos: SOP (TICKETS), BAJA (TICKETS, dado de baja), COM (COMPRAS), EQU
 * (EQUIPOS, nadie tiene celdas de EQUIPOS) y PREVENTIVO (EDILICIA, sembrado por la migración).
 * PREVENTIVO no recibe filas de quien no tiene ninguna celda de EDILICIA, ni VER_TODOS sin
 * `TICKETS:VER_TODOS`.
 */
const ESPERADAS = [
  ...['SOP', 'BAJA'].flatMap((t) =>
    ['LECTURA', 'ALTAS', 'OBSERVAR', 'IMPRESION'].map((a) => `tickets|${t}|${a}`),
  ),
  ...['SOP', 'BAJA'].flatMap((t) =>
    ['LECTURA', 'ASIGNAR', 'IMPRESION'].map((a) => `edilicia|${t}|${a}`),
  ),
  ...['LECTURA', 'ASIGNAR', 'MODIFICACION', 'TRANSICIONAR', 'COMENTAR', 'IMPRESION'].map(
    (a) => `edilicia|PREVENTIVO|${a}`,
  ),
  ...['SOP', 'BAJA', 'COM'].flatMap((t) =>
    ['LECTURA', 'MODIFICACION', 'IMPRESION'].map((a) => `compras|${t}|${a}`),
  ),
  ...['SOP', 'BAJA'].flatMap((t) => ['LECTURA', 'IMPRESION'].map((a) => `inactivo|${t}|${a}`)),
].sort();

describe('backfill-permisos-tipo-ticket — master de test + tenant efímero', () => {
  const admin = new PostgresAdminService(MASTER_TEST_URL);
  const migrationRunner = new TenantMigrationRunnerAdapter(MASTER_TEST_URL);
  let master: Client;
  let tenant: Client;
  let clienteId: string;
  /** Otro cliente: una celda suya del mismo usuario no cuenta para este tenant. */
  const otroClienteId = '00000000-0000-4000-8000-0000000000bf';
  const usuarioIds = {} as Record<NombreUsuario, string>;
  const rolesCreados: string[] = [];
  const tipoIds: Record<string, string> = {};

  const nombrePorUsuarioId = (): Map<string, string> =>
    new Map(Object.entries(usuarioIds).map(([nombre, id]) => [id, nombre]));
  const nombrePorTipoId = (): Map<string, string> =>
    new Map(Object.entries(tipoIds).map(([nombre, id]) => [id, nombre]));

  const filas = async (): Promise<string[]> => {
    const usuarios = nombrePorUsuarioId();
    const tipos = nombrePorTipoId();
    const r = await tenant.query(`SELECT usuario_id, tipo_id, accion FROM permisos_tipo_ticket`);
    return r.rows
      .map((x) => `${usuarios.get(x.usuario_id)}|${tipos.get(x.tipo_id)}|${x.accion}`)
      .sort();
  };

  const correr = async (aplicar: boolean, forzar = false, pool: unknown = tenant) =>
    backfillTenant({
      pool,
      celdasPorUsuario: await leerCeldasPorUsuario(master, clienteId),
      accionesDeTipoDesdeCeldas,
      aplicar,
      forzar,
    });

  async function rolId(codigo: string): Promise<string> {
    const creado = await master.query(
      `INSERT INTO roles (id, codigo, nombre, updated_at) VALUES (gen_random_uuid(), $1, $1, now())
       ON CONFLICT (codigo) DO NOTHING RETURNING id`,
      [codigo],
    );
    if (creado.rows.length > 0) {
      rolesCreados.push(creado.rows[0].id as string);
      return creado.rows[0].id as string;
    }
    return (await master.query(`SELECT id FROM roles WHERE codigo = $1`, [codigo])).rows[0]
      .id as string;
  }

  async function tipo(nombre: string, modulo: string, dadoDeBaja = false): Promise<void> {
    tipoIds[nombre] = (
      await tenant.query(
        `INSERT INTO tipos_ticket (id, codigo, nombre, modulo, activo, deleted_at, updated_at)
         VALUES (gen_random_uuid(), $1, $1, $2, $3, $4, now()) RETURNING id`,
        [`T_BFPT_${nombre}`, modulo, !dadoDeBaja, dadoDeBaja ? new Date() : null],
      )
    ).rows[0].id as string;
  }

  beforeAll(async () => {
    master = new Client({ connectionString: MASTER_TEST_URL });
    await master.connect();
    await admin.createDatabase(TENANT_DB_NAME);
    await migrationRunner.run(TENANT_DB_NAME);
    tenant = new Client({ connectionString: buildTenantUrl(TENANT_DB_NAME) });
    await tenant.connect();

    clienteId = (
      await master.query(
        `INSERT INTO clientes (id, nombre, db_name, updated_at)
         VALUES (gen_random_uuid(), 'Cliente BFPT', $1, now()) RETURNING id`,
        [TENANT_DB_NAME],
      )
    ).rows[0].id as string;
    for (const [nombre, u] of Object.entries(USUARIOS) as [
      NombreUsuario,
      (typeof USUARIOS)[NombreUsuario],
    ][]) {
      usuarioIds[nombre] = (
        await master.query(
          `INSERT INTO usuarios (id, email, nombre, apellido, password_hash, updated_at)
           VALUES (gen_random_uuid(), $1, 'Test', 'BFPT', 'x', now()) RETURNING id`,
          [`bfpt-${SUFIJO}-${nombre}@integration.test`],
        )
      ).rows[0].id as string;
      await master.query(
        `INSERT INTO membresias (id, usuario_id, cliente_id, rol_id, activo, updated_at)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, now())`,
        [usuarioIds[nombre], clienteId, await rolId(u.rol), u.activa],
      );
      for (const celda of u.celdas) {
        const [modulo, accion] = celda.split(':');
        await master.query(
          `INSERT INTO usuario_cliente_permisos (usuario_id, cliente_id, modulo, accion)
           VALUES ($1, $2, $3, $4)`,
          [usuarioIds[nombre], clienteId, modulo, accion],
        );
      }
    }
    // Si contara, el usuario de TICKETS recibiría Modificar.
    await master.query(
      `INSERT INTO usuario_cliente_permisos (usuario_id, cliente_id, modulo, accion)
       VALUES ($1, $2, 'TICKETS', 'MODIFICACION')`,
      [usuarioIds.tickets, otroClienteId],
    );

    await tipo('SOP', 'TICKETS');
    await tipo('BAJA', 'TICKETS', true);
    await tipo('COM', 'COMPRAS');
    await tipo('EQU', 'EQUIPOS');
    tipoIds.PREVENTIVO = (
      await tenant.query(`SELECT id FROM tipos_ticket WHERE codigo = 'PREVENTIVO'`)
    ).rows[0].id as string;
  }, 60_000);

  afterAll(async () => {
    const ids = Object.values(usuarioIds);
    await master.query(`DELETE FROM usuario_cliente_permisos WHERE usuario_id = ANY($1::uuid[])`, [
      ids,
    ]);
    await master.query(`DELETE FROM membresias WHERE cliente_id = $1`, [clienteId]);
    await master.query(`DELETE FROM usuarios WHERE id = ANY($1::uuid[])`, [ids]);
    await master.query(`DELETE FROM clientes WHERE id = $1`, [clienteId]);
    await master.query(`DELETE FROM roles WHERE id = ANY($1::uuid[])`, [rolesCreados]);
    await master.end();
    await tenant.end();
    await admin.dropDatabase(TENANT_DB_NAME);
  }, 60_000);

  it('el ensayo informa los conteos y no escribe', async () => {
    const r = await correr(false);

    expect(r).toEqual({
      usuarios: 4,
      tipos: 5,
      calculadas: ESPERADAS.length,
      existentes: 0,
      insertadas: 0,
      omitido: false,
    });
    expect(await filas()).toEqual([]);
    expect(formatearResultado('soporte_x', r, false)).toBe(
      `[backfill-permisos-tipo-ticket] soporte_x: usuarios 4, tipos 5, filas calculadas ${ESPERADAS.length}, insertadas 0 (ensayo)`,
    );
  });

  it('--apply inserta exactamente las filas de L11: módulo del tipo, Imprimir con Ver, COMPRAS solo con su celda, membresía inactiva incluida, ADMINISTRADOR sin filas', async () => {
    const r = await correr(true);

    expect(r).toEqual({
      usuarios: 4,
      tipos: 5,
      calculadas: ESPERADAS.length,
      existentes: 0,
      insertadas: ESPERADAS.length,
      omitido: false,
    });
    expect(await filas()).toEqual(ESPERADAS);
    expect(formatearResultado('soporte_x', r, true)).toBe(
      `[backfill-permisos-tipo-ticket] soporte_x: usuarios 4, tipos 5, filas calculadas ${ESPERADAS.length}, insertadas ${ESPERADAS.length}`,
    );
  });

  it('una segunda corrida con --apply queda omitida por la guarda y no cambia nada', async () => {
    const r = await correr(true);

    expect(r).toMatchObject({ existentes: ESPERADAS.length, insertadas: 0, omitido: true });
    expect(await filas()).toEqual(ESPERADAS);
    expect(formatearResultado('soporte_x', r, true)).toBe(
      `[backfill-permisos-tipo-ticket] soporte_x: usuarios 4, tipos 5, filas calculadas ${ESPERADAS.length}, ` +
        `insertadas 0 | OMITIDO: la tabla ya tiene ${ESPERADAS.length} fila(s) ` +
        '(backfill ya corrido o permisos editados); --force para completar igual',
    );
  });

  it('la guarda protege una acción quitada a mano; el ensayo avisa que --apply la omitiría', async () => {
    // Un administrador le quita Comentario interno al usuario de TICKETS en SOP (T7).
    await tenant.query(
      `DELETE FROM permisos_tipo_ticket WHERE usuario_id = $1 AND tipo_id = $2 AND accion = 'OBSERVAR'`,
      [usuarioIds.tickets, tipoIds.SOP],
    );
    const sinQuitada = ESPERADAS.filter((f) => f !== 'tickets|SOP|OBSERVAR');

    const ensayo = await correr(false);
    const aplicada = await correr(true);

    expect(formatearResultado('soporte_x', ensayo, false)).toBe(
      `[backfill-permisos-tipo-ticket] soporte_x: usuarios 4, tipos 5, filas calculadas ${ESPERADAS.length}, ` +
        `insertadas 0 (ensayo) | la tabla ya tiene ${sinQuitada.length} fila(s): --apply lo omitiria sin --force`,
    );
    expect(aplicada).toMatchObject({ insertadas: 0, omitido: true });
    expect(await filas()).toEqual(sinQuitada);
  });

  it('--apply --force completa solo lo que falta (re-agrega lo quitado) y repetirlo inserta 0', async () => {
    const forzada = await correr(true, true);
    const repetida = await correr(true, true);

    expect(forzada).toMatchObject({ insertadas: 1, omitido: false });
    expect(repetida).toMatchObject({ insertadas: 0, omitido: false });
    expect(await filas()).toEqual(ESPERADAS);
  });

  it('una fila escrita entre el conteo y el INSERT también frena la escritura', async () => {
    await tenant.query(`DELETE FROM permisos_tipo_ticket`);
    // La tabla se lee vacía y alguien concede un permiso justo antes del INSERT.
    const pool = {
      query: async (sql: string, params?: unknown[]) => {
        if (sql.includes('INSERT INTO "permisos_tipo_ticket"')) {
          await tenant.query(
            `INSERT INTO permisos_tipo_ticket (usuario_id, tipo_id, accion) VALUES ($1, $2, 'LECTURA')`,
            [usuarioIds.admin, tipoIds.EQU],
          );
        }
        return tenant.query(sql, params);
      },
    };

    const r = await correr(true, false, pool);

    expect(r).toMatchObject({ existentes: 0, insertadas: 0, omitido: false });
    expect(await filas()).toEqual(['admin|EQU|LECTURA']);
  });

  it('parsearArgs: ensayo por defecto, --apply y --force, cualquier otro argumento aborta', () => {
    expect(parsearArgs([])).toEqual({ aplicar: false, forzar: false });
    expect(parsearArgs(['--apply'])).toEqual({ aplicar: true, forzar: false });
    expect(parsearArgs(['--apply', '--force'])).toEqual({ aplicar: true, forzar: true });
    expect(() => parsearArgs(['--aplicar'])).toThrow(/argumento desconocido: --aplicar/);
  });
});
