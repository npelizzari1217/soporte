/**
 * ConfigurarApiClienteUseCase con los repos Prisma reales sobre `soporte_master_test`. No trunca:
 * crea clientes propios con sufijo aleatorio y al final borra lo que creo (clientes, usuarios de
 * integracion; las membresias caen por cascada).
 *
 * Cubre la deuda del `judgment-day` de la API publica: JD-5 (un `save()` viejo no vuelve a
 * habilitar la API).
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
      new PrismaRoleRepository(prismaService),
      // Sin argon2: el secreto del usuario de integracion no se usa nunca.
      { hash: async (plano) => `hash:${plano}` },
    );
  });

  afterAll(async () => {
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
});
