/**
 * politica-tfa.e2e.spec.ts — `GET/PUT /politica-2fa` (WU-7, C1-C5): HTTP → guards → use case →
 * Prisma REAL sobre la master de test. Dos clientes efimeros (sin base tenant: `TenantGuard`
 * resuelve el cliente en master y el cliente de tenant es perezoso). Borra solo sus filas.
 */
import { randomBytes, randomUUID } from 'node:crypto';
import {
  INestApplication,
  MiddlewareConsumer,
  Module,
  NestModule,
  ValidationPipe,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { SharedModule } from '../../../shared/shared.module';
import { TenantScopeMiddleware } from '../../../shared/tenancy/tenant-scope.middleware';
import { PrismaService } from '../../../shared/infrastructure/persistence/prisma.service';
import { PrismaClienteRepository } from '../../infrastructure/persistence/prisma/prisma-cliente.repository';
import { ClienteEntity } from '../../domain/entities/cliente.entity';
import { ClientesModule } from '../../clientes.module';
import { TOKEN_SERVICE, ITokenService } from '../../../auth/domain/ports/i-token.service';
import { payloadDeTest } from '../../../auth/test-helpers/payload-de-test';

const MASTER_URL =
  process.env.DATABASE_URL_MASTER ??
  'postgresql://soporte:soporte@localhost:5432/soporte_master_test';
const SUFIJO = randomBytes(4).toString('hex');

@Module({ imports: [SharedModule, ClientesModule] })
class TestHarnessModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(TenantScopeMiddleware).forRoutes('*');
  }
}

describe('PoliticaTfaController e2e (WU-7)', () => {
  let app: INestApplication;
  let baseUrl: string;
  let prismaService: PrismaService;
  let repo: PrismaClienteRepository;
  let tokenService: ITokenService;
  let clienteA: ClienteEntity;
  let clienteB: ClienteEntity;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL_MASTER) process.env.DATABASE_URL_MASTER = MASTER_URL;
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [TestHarnessModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    await app.listen(0);
    const port = (app.getHttpServer() as { address: () => { port: number } }).address().port;
    baseUrl = `http://localhost:${port}`;

    prismaService = moduleRef.get(PrismaService);
    tokenService = moduleRef.get(TOKEN_SERVICE);
    repo = new PrismaClienteRepository(prismaService);
    const nuevo = (n: string) =>
      ClienteEntity.create({
        nombre: `E2E Pol2fa ${n} ${SUFIJO}`,
        razonSocial: null,
        cuit: null,
        dbName: `soporte_pol2fa_${n}_${SUFIJO}_test`,
        activo: true,
      });
    clienteA = nuevo('a');
    clienteB = nuevo('b');
    await repo.save(clienteA);
    await repo.save(clienteB);
  }, 60_000);

  afterAll(async () => {
    await prismaService
      ?.getMasterClient()
      .cliente.deleteMany({ where: { id: { in: [clienteA.id, clienteB.id] } } })
      .catch(() => undefined);
    await app?.close().catch(() => undefined);
    await prismaService?.onModuleDestroy().catch(() => undefined);
  }, 30_000);

  const token = (clienteId: string, rol: string): string =>
    tokenService.signJwt(
      payloadDeTest({ sub: `e2e-pol2fa-${randomUUID()}`, cliente_id: clienteId, rol }),
    );

  async function llamar(
    metodo: 'GET' | 'PUT',
    jwt: string | null,
    body?: unknown,
  ): Promise<{ status: number; data: { requiere2fa?: boolean } | null }> {
    const res = await fetch(`${baseUrl}/politica-2fa`, {
      method: metodo,
      headers: {
        'Content-Type': 'application/json',
        ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return {
      status: res.status,
      data: (await res.json().catch(() => null)) as { requiere2fa?: boolean } | null,
    };
  }

  it('sin token 401; TECNICO 403 en GET y PUT sin cambiar nada (C1)', async () => {
    expect((await llamar('GET', null)).status).toBe(401);
    const tecnico = token(clienteA.id, 'TECNICO');
    expect((await llamar('GET', tecnico)).status).toBe(403);
    expect((await llamar('PUT', tecnico, { requiere2fa: true })).status).toBe(403);
    expect(await repo.obtenerRequiere2fa(clienteA.id)).toBe(false);
  });

  it('ADMINISTRADOR cambia la de su cliente y el cliente B no se entera (C1, C2)', async () => {
    const adminA = token(clienteA.id, 'ADMINISTRADOR');
    expect((await llamar('GET', adminA)).data).toEqual({ requiere2fa: false });

    const put = await llamar('PUT', adminA, { requiere2fa: true });
    expect(put.status).toBe(200);
    expect(put.data).toEqual({ requiere2fa: true });
    expect(await repo.obtenerRequiere2fa(clienteA.id)).toBe(true);
    expect(await repo.obtenerRequiere2fa(clienteB.id)).toBe(false);
    expect((await llamar('GET', token(clienteB.id, 'ADMINISTRADOR'))).data).toEqual({
      requiere2fa: false,
    });
  });

  it('un clienteId en el body se ignora: solo cuenta el del token (C2)', async () => {
    const adminB = token(clienteB.id, 'ADMINISTRADOR');
    const put = await llamar('PUT', adminB, { requiere2fa: true, clienteId: clienteA.id });
    expect(put.status).toBe(200);
    expect(await repo.obtenerRequiere2fa(clienteB.id)).toBe(true);
    await repo.fijarRequiere2fa(clienteB.id, false);
  });

  it('body invalido 400; activar y desactivar no invalidan una sesion abierta (C4)', async () => {
    const adminA = token(clienteA.id, 'ADMINISTRADOR');
    expect((await llamar('PUT', adminA, { requiere2fa: 'si' })).status).toBe(400);
    expect((await llamar('PUT', adminA, { requiere2fa: true })).status).toBe(200);
    // El mismo JWT, emitido antes del cambio, sigue valiendo hasta vencer.
    expect((await llamar('GET', adminA)).status).toBe(200);
    expect((await llamar('PUT', adminA, { requiere2fa: false })).status).toBe(200);
    expect((await llamar('GET', adminA)).data).toEqual({ requiere2fa: false });
  });
});
