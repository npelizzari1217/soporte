/**
 * integraciones-api-cliente.e2e.spec.ts — e2e HTTP real de `PATCH /clientes/:id/api`
 * (sdd/api-publica, T2). Guards reales, Postgres real (`soporte_master_test`), JWT firmados por
 * el `ITokenService` real. Solo ROOT habilita o deshabilita (CA4).
 */
import { randomBytes } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { SharedModule } from '../src/shared/shared.module';
import { IntegracionesModule } from '../src/integraciones/integraciones.module';
import { PrismaService } from '../src/shared/infrastructure/persistence/prisma.service';
import { MasterPrismaClient } from '../src/shared/infrastructure/persistence/prisma-clients';
import { TOKEN_SERVICE, ITokenService } from '../src/auth/domain/ports/i-token.service';
import { payloadDeTest } from '../src/auth/test-helpers/payload-de-test';
import { usarLockMasterTest } from '../src/testing/lock-master-test';
import { emailIntegracion } from '../src/integraciones/application/configurar-api-cliente.use-case';

// Turno exclusivo sobre la master de test compartida — ver src/testing/lock-master-test.ts.
usarLockMasterTest();

describe('Integraciones e2e — PATCH /clientes/:id/api', () => {
  let app: INestApplication;
  let baseUrl: string;
  let prismaService: PrismaService;
  let masterClient: InstanceType<typeof MasterPrismaClient>;
  let tokenService: ITokenService;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [SharedModule, IntegracionesModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    await app.listen(0);

    const port = (app.getHttpServer() as { address: () => { port: number } }).address().port;
    baseUrl = `http://localhost:${port}`;
    prismaService = moduleRef.get(PrismaService);
    masterClient = prismaService.getMasterClient();
    tokenService = moduleRef.get(TOKEN_SERVICE);
  }, 60_000);

  afterAll(async () => {
    try {
      await app?.close();
    } catch (_err) {
      /* no-op */
    }
    try {
      await prismaService?.onModuleDestroy();
    } catch (_err) {
      /* no-op */
    }
  }, 60_000);

  beforeEach(async () => {
    await masterClient.$executeRawUnsafe(
      'TRUNCATE TABLE membresias, usuarios, clientes, roles RESTART IDENTITY CASCADE',
    );
    await masterClient.role.create({ data: { codigo: 'USUARIO', nombre: 'Usuario' } });
  });

  function token(isGlobalAdmin: boolean): string {
    return tokenService.signJwt(
      payloadDeTest({
        sub: `e2e-api-${randomBytes(4).toString('hex')}`,
        is_global_admin: isGlobalAdmin,
      }),
    );
  }

  async function crearCliente(): Promise<string> {
    const sufijo = randomBytes(3).toString('hex');
    const cliente = await masterClient.cliente.create({
      data: { nombre: `E2E API ${sufijo}`, dbName: `soporte_e2e_api_${sufijo}_test` },
    });
    return cliente.id;
  }

  async function patch(id: string, body: unknown, bearer?: string) {
    const res = await fetch(`${baseUrl}/clientes/${id}/api`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
      },
      body: JSON.stringify(body),
    });
    return { status: res.status, data: (await res.json().catch(() => null)) as unknown };
  }

  const flag = async (id: string) =>
    (await masterClient.cliente.findUniqueOrThrow({ where: { id } })).apiHabilitada;

  const usuariosIntegracion = (clienteId: string) =>
    masterClient.usuario.findMany({
      where: { email: emailIntegracion(clienteId) },
      include: { membresias: true },
    });

  it('ROOT habilita: 200, flag en true y un usuario de integracion con membresia activa', async () => {
    const id = await crearCliente();
    const { status, data } = await patch(id, { habilitada: true }, token(true));

    expect(status).toBe(200);
    expect(data).toEqual({ clienteId: id, apiHabilitada: true });
    expect(await flag(id)).toBe(true);
    const usuarios = await usuariosIntegracion(id);
    expect(usuarios).toHaveLength(1);
    expect(usuarios[0].esIntegracion).toBe(true);
    expect(usuarios[0].membresias).toMatchObject([{ clienteId: id, activo: true }]);
  });

  it('habilitar dos veces no duplica el usuario', async () => {
    const id = await crearCliente();
    await patch(id, { habilitada: true }, token(true));
    await patch(id, { habilitada: true }, token(true));
    expect(await usuariosIntegracion(id)).toHaveLength(1);
  });

  it('ADMINISTRADOR (no ROOT): 403 y no se crea nada', async () => {
    const id = await crearCliente();
    const { status } = await patch(id, { habilitada: true }, token(false));

    expect(status).toBe(403);
    expect(await flag(id)).toBe(false);
    expect(await usuariosIntegracion(id)).toHaveLength(0);
  });

  it('sin Bearer: 401', async () => {
    const id = await crearCliente();
    expect((await patch(id, { habilitada: true })).status).toBe(401);
  });

  it('el usuario de integracion no puede entrar con ninguna contrasena', async () => {
    const id = await crearCliente();
    await patch(id, { habilitada: true }, token(true));

    for (const password of ['password', 'Integracion123!', emailIntegracion(id)]) {
      const res = await fetch(`${baseUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: emailIntegracion(id), password }),
      });
      expect(res.status).toBe(401);
    }
  });

  it('deshabilitar apaga el flag y conserva el usuario y su membresia', async () => {
    const id = await crearCliente();
    await patch(id, { habilitada: true }, token(true));

    const { status, data } = await patch(id, { habilitada: false }, token(true));

    expect(status).toBe(200);
    expect(data).toEqual({ clienteId: id, apiHabilitada: false });
    expect(await flag(id)).toBe(false);
    const usuarios = await usuariosIntegracion(id);
    expect(usuarios).toHaveLength(1);
    expect(usuarios[0].membresias).toMatchObject([{ activo: true }]);
  });

  it('cliente inexistente: 404; body invalido: 400', async () => {
    const id = await crearCliente();
    expect(
      (await patch('00000000-0000-4000-8000-000000000000', { habilitada: true }, token(true)))
        .status,
    ).toBe(404);
    expect((await patch(id, { habilitada: 'si' }, token(true))).status).toBe(400);
  });
});
