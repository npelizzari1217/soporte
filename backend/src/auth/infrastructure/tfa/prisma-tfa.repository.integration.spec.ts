/**
 * Repositorio de 2FA sobre `soporte_master_test` (WU-4a, ADR-2). No trunca: crea usuarios con
 * sufijo aleatorio y borra solo esos (las tablas hijas caen por cascada).
 */
import { randomBytes } from 'node:crypto';
import { Pool } from 'pg';
import { PrismaService } from '../../../shared/infrastructure/persistence/prisma.service';
import { URL_MASTER_TEST_POR_DEFECTO, usarLockMasterTest } from '../../../testing/lock-master-test';
import { PrismaTfaRepository } from './prisma-tfa.repository';

const URL_MASTER = process.env.DATABASE_URL_MASTER ?? URL_MASTER_TEST_POR_DEFECTO;
const SUFIJO = randomBytes(4).toString('hex');

usarLockMasterTest();

describe('PrismaTfaRepository', () => {
  let pool: InstanceType<typeof Pool>;
  let prismaService: PrismaService;
  let repo: PrismaTfaRepository;
  const usuarioIds: string[] = [];

  const crearUsuario = async (): Promise<string> => {
    const u = await prismaService.getMasterClient().usuario.create({
      data: {
        email: `tfa-${SUFIJO}-${usuarioIds.length}@test.local`,
        nombre: 'Tfa',
        apellido: 'Test',
        passwordHash: 'x',
      },
    });
    usuarioIds.push(u.id);
    return u.id;
  };
  /** Usuario con 2FA activo en `ultimo_paso` 100. */
  const conTfaActivo = async (secreto = 'secreto-a'): Promise<string> => {
    const id = await crearUsuario();
    await pool.query(
      `INSERT INTO usuarios_tfa (usuario_id, secreto_cifrado, confirmado_at, ultimo_paso, updated_at)
       VALUES ($1, $2, now(), 100, now())`,
      [id, secreto],
    );
    return id;
  };
  const contar = async (tabla: string, id: string): Promise<number> =>
    (await pool.query(`SELECT count(*)::int AS n FROM ${tabla} WHERE usuario_id = $1`, [id]))
      .rows[0].n;
  const hashes = (n: number, prefijo: string) =>
    Array.from({ length: n }, (_, i) => `$argon2id$${prefijo}${i}`);

  beforeAll(() => {
    pool = new Pool({ connectionString: URL_MASTER });
    prismaService = new PrismaService(URL_MASTER);
    repo = new PrismaTfaRepository(prismaService);
  });

  afterAll(async () => {
    if (usuarioIds.length)
      await pool.query('DELETE FROM usuarios WHERE id = ANY($1)', [usuarioIds]);
    await pool.end();
    await prismaService.onModuleDestroy();
  });

  describe('registrarPaso (T2)', () => {
    it('dos registros concurrentes del mismo paso: exactamente uno acepta', async () => {
      const id = await conTfaActivo();
      const r = await Promise.all([
        repo.registrarPaso(id, 101, 'secreto-a'),
        repo.registrarPaso(id, 101, 'secreto-a'),
      ]);
      expect(r.filter(Boolean)).toHaveLength(1);
      expect((await repo.obtener(id))?.ultimoPaso).toBe(101);
    });

    it('un paso anterior o igual al ultimo es replay', async () => {
      const id = await conTfaActivo();
      expect(await repo.registrarPaso(id, 100, 'secreto-a')).toBe(false);
      expect(await repo.registrarPaso(id, 99, 'secreto-a')).toBe(false);
    });

    it('con un secreto distinto del leido no escribe ninguna fila', async () => {
      const id = await conTfaActivo();
      expect(await repo.registrarPaso(id, 150, 'secreto-viejo')).toBe(false);
      expect((await repo.obtener(id))?.ultimoPaso).toBe(100);
    });
  });

  describe('promoverPendiente (T2, T4, T10)', () => {
    it('un unico CAS fija secreto, confirmado_at y paso, y limpia el pendiente', async () => {
      const id = await conTfaActivo();
      await repo.guardarPendiente(id, 'pendiente-1');
      expect(await repo.promoverPendiente(id, 'pendiente-1', 777)).toBe(true);
      const e = await repo.obtener(id);
      expect(e).toMatchObject({
        secretoCifrado: 'pendiente-1',
        ultimoPaso: 777,
        secretoPendienteCifrado: null,
        pendienteCreadoAt: null,
      });
      expect(e?.confirmadoAt).toBeInstanceOf(Date);
    });

    it('con otro pendiente leido no promueve; guardar no toca el secreto activo', async () => {
      const id = await conTfaActivo();
      await repo.guardarPendiente(id, 'pendiente-2');
      expect(await repo.promoverPendiente(id, 'pendiente-otro', 777)).toBe(false);
      const e = await repo.obtener(id);
      expect(e).toMatchObject({ secretoCifrado: 'secreto-a', ultimoPaso: 100 });
      expect(e?.secretoPendienteCifrado).toBe('pendiente-2');
    });

    it('dos promociones concurrentes del mismo pendiente: una gana', async () => {
      const id = await crearUsuario();
      await repo.guardarPendiente(id, 'pendiente-3');
      const r = await Promise.all([
        repo.promoverPendiente(id, 'pendiente-3', 5),
        repo.promoverPendiente(id, 'pendiente-3', 5),
      ]);
      expect(r.filter(Boolean)).toHaveLength(1);
    });

    it('el codigo que confirmo no se puede repetir en el login (replay)', async () => {
      const id = await crearUsuario();
      await repo.guardarPendiente(id, 'pendiente-4');
      await repo.promoverPendiente(id, 'pendiente-4', 4242);
      expect(await repo.registrarPaso(id, 4242, 'pendiente-4')).toBe(false);
      expect(await repo.registrarPaso(id, 4243, 'pendiente-4')).toBe(true);
    });
  });

  describe('codigos de recuperacion (T5, T9)', () => {
    it('guarda 10, consume uno y cuenta los restantes', async () => {
      const id = await crearUsuario();
      await repo.reemplazarCodigos(id, hashes(10, 'a'));
      expect(await repo.contarCodigosRestantes(id)).toBe(10);
      const [primero] = await repo.obtenerCodigosDisponibles(id);
      expect(await repo.consumirCodigo(primero.id)).toBe(true);
      expect(await repo.contarCodigosRestantes(id)).toBe(9);
      expect(await repo.obtenerCodigosDisponibles(id)).toHaveLength(9);
    });

    it('dos consumos concurrentes del mismo codigo: uno gana', async () => {
      const id = await crearUsuario();
      await repo.reemplazarCodigos(id, hashes(2, 'b'));
      const [c] = await repo.obtenerCodigosDisponibles(id);
      const r = await Promise.all([repo.consumirCodigo(c.id), repo.consumirCodigo(c.id)]);
      expect(r.filter(Boolean)).toHaveLength(1);
    });

    it('regenerar borra el juego anterior e inserta el nuevo', async () => {
      const id = await crearUsuario();
      await repo.reemplazarCodigos(id, hashes(10, 'c'));
      await repo.reemplazarCodigos(id, hashes(10, 'd'));
      const hs = (await repo.obtenerCodigosDisponibles(id)).map((c) => c.codigoHash);
      expect(hs).toHaveLength(10);
      expect(hs.every((h) => h.startsWith('$argon2id$d'))).toBe(true);
    });

    it('con un fallo a mitad de la transaccion queda el juego previo intacto', async () => {
      const id = await crearUsuario();
      await repo.reemplazarCodigos(id, hashes(10, 'e'));
      // Postgres rechaza el NUL en un text: falla el insert, despues del delete.
      await expect(repo.reemplazarCodigos(id, [...hashes(9, 'f'), 'mal\u0000o'])).rejects.toThrow();
      const hs = (await repo.obtenerCodigosDisponibles(id)).map((c) => c.codigoHash);
      expect(hs).toHaveLength(10);
      expect(hs.every((h) => h.startsWith('$argon2id$e'))).toBe(true);
    });
  });

  describe('eliminarTodo (D6, S3)', () => {
    const sembrarCompleto = async (): Promise<string> => {
      const id = await conTfaActivo();
      await repo.reemplazarCodigos(id, hashes(3, 'g'));
      await pool.query(
        `INSERT INTO tfa_dispositivos_confiables (usuario_id, token_hash, expira_at)
         VALUES ($1, $2, now() + interval '1 day')`,
        [id, `td-${SUFIJO}-${id}`],
      );
      await pool.query(
        `INSERT INTO auth_desafios (usuario_id, token_hash, proposito, expira_at)
         VALUES ($1, $2, 'VERIFICAR', now() + interval '1 hour')`,
        [id, `ds-${SUFIJO}-${id}`],
      );
      return id;
    };
    const sinRevocar = async (id: string) =>
      (
        await pool.query(
          'SELECT (SELECT count(*)::int FROM tfa_dispositivos_confiables WHERE usuario_id = $1 AND revocado_at IS NULL) AS d, (SELECT count(*)::int FROM auth_desafios WHERE usuario_id = $1 AND usado_at IS NULL) AS s',
          [id],
        )
      ).rows[0];

    it('borra 2FA y codigos, revoca dispositivos e invalida desafios abiertos', async () => {
      const id = await sembrarCompleto();
      await repo.eliminarTodo(id);
      expect(await contar('usuarios_tfa', id)).toBe(0);
      expect(await contar('tfa_codigos_recuperacion', id)).toBe(0);
      expect(await sinRevocar(id)).toEqual({ d: 0, s: 0 });
      expect(await contar('tfa_dispositivos_confiables', id)).toBe(1);
    });

    it('con un fallo forzado a mitad no queda nada a medias', async () => {
      const id = await sembrarCompleto();
      const nombre = `fuerza_fallo_${SUFIJO}`;
      // Trigger propio (solo para este usuario): falla al revocar dispositivos, tras los deletes.
      await pool.query(
        `CREATE FUNCTION ${nombre}() RETURNS trigger LANGUAGE plpgsql AS $$
         BEGIN IF NEW.usuario_id = '${id}'::uuid THEN RAISE EXCEPTION 'fallo forzado'; END IF; RETURN NEW; END $$`,
      );
      await pool.query(
        `CREATE TRIGGER ${nombre} BEFORE UPDATE ON tfa_dispositivos_confiables
         FOR EACH ROW EXECUTE FUNCTION ${nombre}()`,
      );
      try {
        await expect(repo.eliminarTodo(id)).rejects.toThrow();
      } finally {
        await pool.query(`DROP TRIGGER ${nombre} ON tfa_dispositivos_confiables`);
        await pool.query(`DROP FUNCTION ${nombre}()`);
      }
      expect(await contar('usuarios_tfa', id)).toBe(1);
      expect(await contar('tfa_codigos_recuperacion', id)).toBe(3);
      expect(await sinRevocar(id)).toEqual({ d: 1, s: 1 });
    });
  });
});
