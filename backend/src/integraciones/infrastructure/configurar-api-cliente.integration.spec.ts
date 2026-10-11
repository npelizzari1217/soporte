/**
 * ConfigurarApiClienteUseCase con los repos Prisma reales sobre `soporte_master_test`. No trunca:
 * crea clientes propios con sufijo aleatorio y al final borra lo que creo (membresias, clientes y
 * usuarios de integracion, en ese orden: la FK de membresias no cascadea).
 *
 * Cubre la deuda del `judgment-day` de la API publica: JD-5 (un `save()` viejo no vuelve a
 * habilitar la API) y JD-7 (dos habilitaciones simultaneas no dan 500).
 */
import { randomBytes } from 'node:crypto';
import { Pool } from 'pg';
import { PrismaService } from '../../shared/infrastructure/persistence/prisma.service';
import { URL_MASTER_TEST_POR_DEFECTO, usarLockMasterTest } from '../../testing/lock-master-test';
import { PrismaClienteRepository } from '../../clientes/infrastructure/persistence/prisma/prisma-cliente.repository';
import { PrismaUsuarioRepository } from '../../auth/infrastructure/persistence/prisma/prisma-usuario.repository';
import { PrismaMembresiaRepository } from '../../auth/infrastructure/persistence/prisma/prisma-membresia.repository';
import { PrismaRoleRepository } from '../../auth/infrastructure/persistence/prisma/prisma-role.repository';
import { PrismaApiHabilitadaRepository } from './prisma-api-habilitada.repository';
import { PrismaUsuarioIntegracionRepository } from './prisma-usuario-integracion.repository';
import {
  ConfigurarApiClienteUseCase,
  ROL_INTEGRACION,
  emailIntegracion,
} from '../application/configurar-api-cliente.use-case';

const URL_MASTER = process.env.DATABASE_URL_MASTER ?? URL_MASTER_TEST_POR_DEFECTO;
const ROOT = { isGlobalAdmin: true };

usarLockMasterTest();

describe('ConfigurarApiClienteUseCase (integracion)', () => {
  let pool: InstanceType<typeof Pool>;
  let prismaService: PrismaService;
  let clienteRepo: PrismaClienteRepository;
  let useCase: ConfigurarApiClienteUseCase;
  const clientes: string[] = [];

  const crearCliente = async (apiHabilitada: boolean): Promise<string> => {
    const s = randomBytes(6).toString('hex');
    const r = await pool.query(
      `INSERT INTO clientes (nombre, db_name, api_habilitada, updated_at)
       VALUES ($1, $2, $3, now()) RETURNING id`,
      [`Cliente ${s}`, `db_cfgapi_${s}`, apiHabilitada],
    );
    clientes.push(r.rows[0].id);
    return r.rows[0].id;
  };
  const apiHabilitada = async (id: string): Promise<boolean> =>
    (await pool.query('SELECT api_habilitada FROM clientes WHERE id = $1', [id])).rows[0]
      .api_habilitada;

  beforeAll(async () => {
    pool = new Pool({ connectionString: URL_MASTER });
    prismaService = new PrismaService(URL_MASTER);
    clienteRepo = new PrismaClienteRepository(prismaService);
    // Otros e2e truncan `roles`: el rol de integracion se asegura aca y no se borra.
    await pool.query(
      `INSERT INTO roles (codigo, nombre, updated_at) VALUES ($1, 'Usuario', now())
       ON CONFLICT (codigo) DO NOTHING`,
      [ROL_INTEGRACION],
    );
    useCase = new ConfigurarApiClienteUseCase(
      clienteRepo,
      new PrismaApiHabilitadaRepository(prismaService),
      new PrismaUsuarioRepository(prismaService),
      new PrismaMembresiaRepository(prismaService),
      new PrismaUsuarioIntegracionRepository(prismaService),
      new PrismaRoleRepository(prismaService),
      // Sin argon2, pero con su demora: entre `findByEmail` y `create` hay un hash de decenas de
      // ms, y esa es la ventana donde dos habilitaciones simultaneas se cruzan (JD-7).
      {
        hash: async (plano) => {
          await new Promise((r) => setTimeout(r, 50));
          return `hash:${plano}`;
        },
      },
    );
  });

  afterAll(async () => {
    await pool.query('DELETE FROM membresias WHERE cliente_id = ANY($1)', [clientes]);
    await pool.query('DELETE FROM clientes WHERE id = ANY($1)', [clientes]);
    await pool.query('DELETE FROM usuarios WHERE email = ANY($1)', [
      clientes.map(emailIntegracion),
    ]);
    await pool.end();
    await prismaService.onModuleDestroy();
  });

  it('JD-5: un save() con la entidad leida antes de deshabilitar no vuelve a habilitar la API', async () => {
    const id = await crearCliente(true);
    const vieja = (await clienteRepo.findById(id))!; // la lee otro caso de uso de clientes

    const r = await useCase.execute({ clienteId: id, habilitada: false }, ROOT);
    expect(r.isOk()).toBe(true);
    expect(await apiHabilitada(id)).toBe(false);

    vieja.editar({ nombre: 'Renombrado' });
    await clienteRepo.save(vieja);

    expect(await apiHabilitada(id)).toBe(false);
    expect((await clienteRepo.findById(id))!.nombre).toBe('Renombrado');
  });

  it('JD-7: dos habilitaciones simultaneas terminan bien y dejan un solo usuario de integracion', async () => {
    const id = await crearCliente(false);

    const [a, b] = await Promise.all([
      useCase.execute({ clienteId: id, habilitada: true }, ROOT),
      useCase.execute({ clienteId: id, habilitada: true }, ROOT),
    ]);

    expect(a.isOk()).toBe(true);
    expect(b.isOk()).toBe(true);
    expect(await apiHabilitada(id)).toBe(true);
    const usuarios = await pool.query('SELECT id FROM usuarios WHERE email = $1', [
      emailIntegracion(id),
    ]);
    expect(usuarios.rows).toHaveLength(1);
    const membresias = await pool.query(
      'SELECT activo FROM membresias WHERE usuario_id = $1 AND cliente_id = $2',
      [usuarios.rows[0].id, id],
    );
    expect(membresias.rows).toEqual([{ activo: true }]);
  });
});
