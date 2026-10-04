/**
 * formulario-publico.e2e.spec.ts — e2e HTTP real de
 * `PATCH /clientes/:id/formulario-publico` (sdd/formulario-publico-qr, WU-2).
 *
 * Levanta un `INestApplication` real (`SharedModule` + `ClientesModule`)
 * contra Postgres real (`soporte_master_test`) con JWT firmados por el
 * `ITokenService` real y los guards reales (`JwtAuthGuard`, `GlobalAdminGuard`):
 * ningun guard se mockea. Solo ROOT puede configurar (D7, D12).
 */
import { randomBytes, randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { SharedModule } from '../../../shared/shared.module';
import { ClientesModule } from '../../clientes.module';
import { PrismaService } from '../../../shared/infrastructure/persistence/prisma.service';
import { MasterPrismaClient } from '../../../shared/infrastructure/persistence/prisma-clients';
import { TOKEN_SERVICE, ITokenService } from '../../../auth/domain/ports/i-token.service';
import { payloadDeTest } from '../../../auth/test-helpers/payload-de-test';
import { usarLockMasterTest } from '../../../testing/lock-master-test';

interface ClienteRespuesta {
  id: string;
  slug: string | null;
  formularioPublicoHabilitado: boolean;
  /** Solo en las respuestas de error de dominio del slug. */
  code?: string;
}

// Turno exclusivo sobre la master de test compartida — ver src/testing/lock-master-test.ts.
usarLockMasterTest();

describe('Formulario publico e2e — PATCH /clientes/:id/formulario-publico', () => {
  let app: INestApplication;
  let baseUrl: string;
  let prismaService: PrismaService;
  let masterClient: InstanceType<typeof MasterPrismaClient>;
  let tokenService: ITokenService;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [SharedModule, ClientesModule],
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
    await masterClient.$executeRawUnsafe('TRUNCATE TABLE clientes RESTART IDENTITY CASCADE');
  });

  function token(isGlobalAdmin: boolean): string {
    return tokenService.signJwt(
      payloadDeTest({
        sub: `e2e-fp-${randomBytes(4).toString('hex')}`,
        is_global_admin: isGlobalAdmin,
      }),
    );
  }

  async function crearCliente(suffix: string, slug?: string): Promise<string> {
    const cliente = await masterClient.cliente.create({
      data: { nombre: `E2E FP ${suffix}`, dbName: `soporte_e2e_fp_${suffix}_test`, slug },
    });
    return cliente.id;
  }

  async function patch(
    id: string,
    body: unknown,
    bearer?: string,
  ): Promise<{ status: number; data: ClienteRespuesta | null }> {
    const res = await fetch(`${baseUrl}/clientes/${id}/formulario-publico`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
      },
      body: JSON.stringify(body),
    });
    return { status: res.status, data: (await res.json().catch(() => null)) as ClienteRespuesta };
  }

  function leerFila(id: string) {
    return masterClient.cliente.findUniqueOrThrow({
      where: { id },
      select: { slug: true, formularioPublicoHabilitado: true, slugCongeladoAt: true },
    });
  }

  it('sin Bearer token: 401 y no se escribe nada', async () => {
    const id = await crearCliente('s401');
    const { status } = await patch(id, { slug: 'colegio-norte' });
    expect(status).toBe(401);
    expect((await leerFila(id)).slug).toBeNull();
  });

  it('ADMINISTRADOR (no ROOT): 403 y el estado no cambia', async () => {
    const id = await crearCliente('s403');
    const { status } = await patch(id, { slug: 'colegio-norte', habilitado: true }, token(false));
    expect(status).toBe(403);
    const fila = await leerFila(id);
    expect(fila.slug).toBeNull();
    expect(fila.formularioPublicoHabilitado).toBe(false);
  });

  it('ROOT carga el slug y habilita en el mismo pedido: 200', async () => {
    const id = await crearCliente('s200');
    const { status, data } = await patch(
      id,
      { slug: 'colegio-norte', habilitado: true },
      token(true),
    );
    expect(status).toBe(200);
    expect(data).toMatchObject({ slug: 'colegio-norte', formularioPublicoHabilitado: true });
    expect(await leerFila(id)).toMatchObject({
      slug: 'colegio-norte',
      formularioPublicoHabilitado: true,
    });
  });

  it('un cliente nuevo nace con el formulario deshabilitado', async () => {
    const id = await crearCliente('sdef');
    expect(await leerFila(id)).toMatchObject({ slug: null, formularioPublicoHabilitado: false });
  });

  it('cliente inexistente: 404 (no un 409 enganoso)', async () => {
    const { status } = await patch(randomUUID(), { slug: 'colegio-norte' }, token(true));
    expect(status).toBe(404);
  });

  it('habilitar sin slug: 409 y no habilita', async () => {
    const id = await crearCliente('ssin');
    const { status, data } = await patch(id, { habilitado: true }, token(true));
    expect(status).toBe(409);
    expect(data?.code).toBe('SLUG_REQUERIDO');
    expect((await leerFila(id)).formularioPublicoHabilitado).toBe(false);
  });

  it('slug duplicado: 409 y el segundo cliente no cambia', async () => {
    await crearCliente('sdupa', 'colegio-norte');
    const idB = await crearCliente('sdupb');
    const { status, data } = await patch(idB, { slug: 'colegio-norte' }, token(true));
    expect(status).toBe(409);
    expect(data?.code).toBe('SLUG_DUPLICADO');
    expect((await leerFila(idB)).slug).toBeNull();
  });

  it.each(['Colegio Norte', 'colegio_norte', '-colegio', randomUUID()])(
    'slug invalido %s: 400',
    async (slug) => {
      const id = await crearCliente(`sinv${randomBytes(2).toString('hex')}`);
      const { status } = await patch(id, { slug }, token(true));
      expect(status).toBe(400);
      expect((await leerFila(id)).slug).toBeNull();
    },
  );

  it('slug igual al dbName normalizado: 400', async () => {
    const id = await crearCliente('sdb');
    const { status, data } = await patch(id, { slug: 'soporte-e2e-fp-sdb-test' }, token(true));
    expect(status).toBe(400);
    expect(data?.code).toBe('SLUG_INVALIDO');
  });

  it('slug congelado: 409 y el slug sigue igual', async () => {
    const id = await crearCliente('sfrz', 'colegio-norte');
    await masterClient.cliente.update({ where: { id }, data: { slugCongeladoAt: new Date() } });
    const { status, data } = await patch(id, { slug: 'otro-slug' }, token(true));
    expect(status).toBe(409);
    expect(data?.code).toBe('SLUG_CONGELADO');
    expect((await leerFila(id)).slug).toBe('colegio-norte');
  });
});
