/**
 * migracion-m1.integration.spec.ts — WU-1 (sdd/verificacion-dos-pasos, ADR-3).
 *
 * Verifica la migracion M1 de master contra la `soporte_master_test` compartida (que ya la
 * tiene aplicada): CHECKs, defaults, cascada y la ausencia de FK en `auth_intentos_fallidos`.
 * No trunca: crea sus propios usuarios y clientes (sufijo aleatorio) y borra solo esos.
 */
import { randomBytes, randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { PrismaService } from '../../../shared/infrastructure/persistence/prisma.service';
import { MasterPrismaClient } from '../../../shared/infrastructure/persistence/prisma-clients';
import { URL_MASTER_TEST_POR_DEFECTO, usarLockMasterTest } from '../../../testing/lock-master-test';

const URL_MASTER = process.env.DATABASE_URL_MASTER ?? URL_MASTER_TEST_POR_DEFECTO;
const SUFIJO = randomBytes(4).toString('hex');

usarLockMasterTest();

describe('Migracion M1 — verificacion en dos pasos (master)', () => {
  let pool: InstanceType<typeof Pool>;
  let prismaService: PrismaService;
  let master: InstanceType<typeof MasterPrismaClient>;
  const usuarioIds: string[] = [];
  const clienteIds: string[] = [];
  const clavesIntento: string[] = [];

  async function crearUsuario(): Promise<string> {
    const u = await master.usuario.create({
      data: {
        email: `m1-${SUFIJO}-${usuarioIds.length}@test.local`,
        nombre: 'M1',
        apellido: 'Test',
        passwordHash: 'x',
      },
    });
    usuarioIds.push(u.id);
    return u.id;
  }

  async function filas(tabla: string, usuarioId: string): Promise<number> {
    const r = await pool.query(`SELECT count(*)::int AS n FROM ${tabla} WHERE usuario_id = $1`, [
      usuarioId,
    ]);
    return r.rows[0].n;
  }

  beforeAll(() => {
    pool = new Pool({ connectionString: URL_MASTER });
    prismaService = new PrismaService(URL_MASTER);
    master = prismaService.getMasterClient();
  });

  afterAll(async () => {
    if (clavesIntento.length) {
      await pool.query('DELETE FROM auth_intentos_fallidos WHERE clave = ANY($1)', [clavesIntento]);
    }
    // Las tablas con FK caen por cascada al borrar el usuario.
    if (usuarioIds.length)
      await pool.query('DELETE FROM usuarios WHERE id = ANY($1)', [usuarioIds]);
    if (clienteIds.length)
      await pool.query('DELETE FROM clientes WHERE id = ANY($1)', [clienteIds]);
    await pool.end();
    await prismaService.onModuleDestroy();
  });

  describe('CHECK de usuarios_tfa', () => {
    it('rechaza secreto_cifrado sin confirmado_at y a la inversa', async () => {
      const id = await crearUsuario();
      await expect(
        pool.query(
          'INSERT INTO usuarios_tfa (usuario_id, secreto_cifrado, updated_at) VALUES ($1, $2, now())',
          [id, 's'],
        ),
      ).rejects.toThrow(/usuarios_tfa_activo_par_check/);
      await expect(
        pool.query(
          'INSERT INTO usuarios_tfa (usuario_id, confirmado_at, updated_at) VALUES ($1, now(), now())',
          [id],
        ),
      ).rejects.toThrow(/usuarios_tfa_activo_par_check/);
    });

    it('rechaza pendiente sin fecha y a la inversa', async () => {
      const id = await crearUsuario();
      await expect(
        pool.query(
          'INSERT INTO usuarios_tfa (usuario_id, secreto_pendiente_cifrado, updated_at) VALUES ($1, $2, now())',
          [id, 's'],
        ),
      ).rejects.toThrow(/usuarios_tfa_pendiente_par_check/);
      await expect(
        pool.query(
          'INSERT INTO usuarios_tfa (usuario_id, pendiente_creado_at, updated_at) VALUES ($1, now(), now())',
          [id],
        ),
      ).rejects.toThrow(/usuarios_tfa_pendiente_par_check/);
    });

    it('acepta los pares completos (activo, pendiente, ambos o ninguno)', async () => {
      const id = await crearUsuario();
      await pool.query(
        `INSERT INTO usuarios_tfa (usuario_id, secreto_cifrado, confirmado_at,
           secreto_pendiente_cifrado, pendiente_creado_at, updated_at)
         VALUES ($1, 'a', now(), 'p', now(), now())`,
        [id],
      );
      expect(await filas('usuarios_tfa', id)).toBe(1);
    });
  });

  it('rechaza un proposito de desafio invalido y acepta los tres validos', async () => {
    const id = await crearUsuario();
    const insertar = (proposito: string) =>
      pool.query(
        `INSERT INTO auth_desafios (usuario_id, token_hash, proposito, expira_at)
         VALUES ($1, $2, $3, now() + interval '5 minutes')`,
        [id, randomUUID(), proposito],
      );
    await expect(insertar('OTRO')).rejects.toThrow(/auth_desafios_proposito_check/);
    for (const p of ['VERIFICAR', 'ENROLAR', 'SELECCIONAR']) await insertar(p);
    expect(await filas('auth_desafios', id)).toBe(3);
  });

  it('requiere_2fa es NOT NULL DEFAULT false (sin backfill); los defaults de Prisma y del DDL coinciden', async () => {
    const r = await pool.query(
      `SELECT column_default, is_nullable FROM information_schema.columns
       WHERE table_name = 'clientes' AND column_name = 'requiere_2fa'`,
    );
    expect(r.rows[0]).toEqual({ column_default: 'false', is_nullable: 'NO' });
    // Prisma omite la columna → aplica el DDL; el default del schema es el mismo.
    const c = await master.cliente.create({
      data: { nombre: `M1 ${SUFIJO}`, dbName: `m1_${SUFIJO}_db` },
    });
    clienteIds.push(c.id);
    expect(c.requiere2fa).toBe(false);
    const u = await master.usuarioTfa.create({
      data: { usuario: { connect: { id: await crearUsuario() } } },
    });
    expect(u.ultimoPaso).toBe(0);
    const ddl = await pool.query(
      `SELECT column_default FROM information_schema.columns
       WHERE table_name = 'usuarios_tfa' AND column_name = 'ultimo_paso'`,
    );
    expect(ddl.rows[0].column_default).toBe('0');
  });

  it('borrar el usuario cascadea las 4 tablas con FK', async () => {
    const id = await crearUsuario();
    await pool.query(
      `INSERT INTO usuarios_tfa (usuario_id, secreto_cifrado, confirmado_at, updated_at) VALUES ($1, 's', now(), now())`,
      [id],
    );
    await pool.query(
      `INSERT INTO tfa_codigos_recuperacion (usuario_id, codigo_hash) VALUES ($1, 'h')`,
      [id],
    );
    await pool.query(
      `INSERT INTO tfa_dispositivos_confiables (usuario_id, token_hash, expira_at) VALUES ($1, $2, now())`,
      [id, randomUUID()],
    );
    await pool.query(
      `INSERT INTO auth_desafios (usuario_id, token_hash, proposito, expira_at) VALUES ($1, $2, 'VERIFICAR', now())`,
      [id, randomUUID()],
    );
    const tablas = [
      'usuarios_tfa',
      'tfa_codigos_recuperacion',
      'tfa_dispositivos_confiables',
      'auth_desafios',
    ];
    for (const t of tablas) expect(await filas(t, id)).toBe(1);

    await pool.query('DELETE FROM usuarios WHERE id = $1', [id]);

    for (const t of tablas) expect(await filas(t, id)).toBe(0);
  });

  it('auth_intentos_fallidos no tiene FK y acepta una clave sin usuario', async () => {
    const clave = `pwd:${SUFIJO}:203.0.113.7`;
    clavesIntento.push(clave);
    await pool.query(
      'INSERT INTO auth_intentos_fallidos (clave, fallos, ventana_inicio) VALUES ($1, 1, now())',
      [clave],
    );
    const fk = await pool.query(
      `SELECT count(*)::int AS n FROM information_schema.table_constraints
       WHERE table_name = 'auth_intentos_fallidos' AND constraint_type = 'FOREIGN KEY'`,
    );
    expect(fk.rows[0].n).toBe(0);
  });
});
