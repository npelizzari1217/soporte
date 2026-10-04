/**
 * pedido-publico-contexto.e2e.spec.ts — `GET publico/c/:slug/pedido/contexto`
 * (sdd/formulario-publico-qr, WU-12; tarea 12.1; D8, D3, ADR-1, ADR-5).
 *
 * App real contra Postgres real y guards reales (throttler, tenant): dos tenants efímeros (A y B),
 * `soporte_master_test` truncada en `beforeEach` y `usarLockMasterTest()`. Cubre el 404 uniforme
 * (mismo status, cuerpo y headers sin `Date` para slug inexistente, deshabilitado, inactivo y
 * borrado), el token de otro tenant (indistinguible de uno inexistente) y los modos `EXTERNO`
 * y `SESION`. Cada request usa un `x-forwarded-for` propio para no compartir cupo del throttler.
 */
import { createHash, randomBytes } from 'node:crypto';
import {
  INestApplication,
  MiddlewareConsumer,
  Module,
  NestModule,
  ValidationPipe,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { SharedModule } from '../../../shared/shared.module';
import { AuthModule } from '../../../auth/auth.module';
import { FormularioPublicoModule } from '../../formulario-publico.module';
import { TenantScopeMiddleware } from '../../../shared/tenancy/tenant-scope.middleware';
import { PrismaService } from '../../../shared/infrastructure/persistence/prisma.service';
import {
  MasterPrismaClient,
  TenantPrismaClient,
} from '../../../shared/infrastructure/persistence/prisma-clients';
import { PostgresAdminService } from '../../../clientes/infrastructure/postgres-admin.service';
import { TenantMigrationRunnerAdapter } from '../../../clientes/infrastructure/tenant-migration-runner.adapter';
import { PrismaClienteRepository } from '../../../clientes/infrastructure/persistence/prisma/prisma-cliente.repository';
import { ClienteEntity } from '../../../clientes/domain/entities/cliente.entity';
import { usarLockMasterTest } from '../../../testing/lock-master-test';

const MASTER_TEST_URL =
  process.env.DATABASE_URL_MASTER ??
  'postgresql://soporte:soporte@localhost:5432/soporte_master_test';

const sufijo = randomBytes(4).toString('hex');
const DB_A = `soporte_prov_ctxPubA_${sufijo}_test`;
const DB_B = `soporte_prov_ctxPubB_${sufijo}_test`;

interface Respuesta {
  status: number;
  texto: string;
  headers: Record<string, string>;
}

/** Cada llamada con su propio `x-forwarded-for`: el cupo del throttler es `${xff}:${slug}`. */
async function get(url: string, xff = randomBytes(6).toString('hex')): Promise<Respuesta> {
  const res = await fetch(url, { headers: { Accept: 'application/json', 'x-forwarded-for': xff } });
  const headers = Object.fromEntries(res.headers.entries());
  delete headers.date;
  return { status: res.status, texto: await res.text(), headers };
}

const sha256 = (valor: string): string => createHash('sha256').update(valor).digest('hex');

@Module({ imports: [SharedModule, AuthModule, FormularioPublicoModule] })
class TestHarnessModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(TenantScopeMiddleware).forRoutes('*');
  }
}

usarLockMasterTest();

describe('Formulario público e2e — GET contexto (WU-12)', () => {
  let app: INestApplication;
  let baseUrl: string;
  let prismaService: PrismaService;
  let masterClient: InstanceType<typeof MasterPrismaClient>;
  let tenantA: InstanceType<typeof TenantPrismaClient>;
  let tenantB: InstanceType<typeof TenantPrismaClient>;
  let clienteRepo: PrismaClienteRepository;
  const admin = new PostgresAdminService(MASTER_TEST_URL);

  beforeAll(async () => {
    if (!process.env.DATABASE_URL_MASTER) {
      process.env.DATABASE_URL_MASTER = MASTER_TEST_URL;
    }
    for (const db of [DB_A, DB_B]) {
      await admin.createDatabase(db);
      await new TenantMigrationRunnerAdapter(MASTER_TEST_URL).run(db);
    }

    prismaService = new PrismaService(MASTER_TEST_URL);
    masterClient = prismaService.getMasterClient();
    tenantA = prismaService.getTenantClient(DB_A);
    tenantB = prismaService.getTenantClient(DB_B);
    clienteRepo = new PrismaClienteRepository(prismaService);

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [TestHarnessModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    await app.listen(0);
    const port = (app.getHttpServer() as { address: () => { port: number } }).address().port;
    baseUrl = `http://localhost:${port}`;
  }, 90_000);

  afterAll(async () => {
    // Orden CRÍTICO: filas → app.close() → dropDatabase. Al revés, el DROP falla en silencio.
    for (const tenant of [tenantA, tenantB]) {
      try {
        await tenant.equipoInformatico.deleteMany();
      } catch {
        /* no-op */
      }
    }
    try {
      await app?.close();
    } catch {
      /* no-op */
    }
    try {
      await prismaService?.onModuleDestroy();
    } catch {
      /* no-op */
    }
    await admin.dropDatabase(DB_A);
    await admin.dropDatabase(DB_B);
  }, 60_000);

  beforeEach(async () => {
    await masterClient.$executeRawUnsafe('TRUNCATE TABLE clientes RESTART IDENTITY CASCADE');
    await tenantA.equipoInformatico.deleteMany();
    await tenantB.equipoInformatico.deleteMany();
  });

  async function crearCliente(opciones: {
    slug: string;
    dbName: string;
    habilitado?: boolean;
    activo?: boolean;
    borrado?: boolean;
    conSmtp?: boolean;
  }): Promise<string> {
    const cliente = ClienteEntity.create({
      nombre: `Colegio ${opciones.slug}`,
      razonSocial: null,
      cuit: null,
      dbName: opciones.dbName,
      activo: opciones.activo ?? true,
    });
    await clienteRepo.save(cliente);
    // `save()` no escribe el slug (solo los CAS lo hacen): se carga por el camino real.
    await clienteRepo.cambiarSlugSiNoCongelado(cliente.id, opciones.slug);
    await masterClient.cliente.update({
      where: { id: cliente.id },
      data: {
        formularioPublicoHabilitado: opciones.habilitado ?? true,
        deletedAt: opciones.borrado ? new Date() : null,
        ...(opciones.conSmtp
          ? {
              smtpHost: 'smtp.integration.test',
              smtpPort: 587,
              smtpUser: 'pedido@integration.test',
              smtpFrom: 'no-reply@integration.test',
              smtpPasswordCifrada: 'v1:fake:fake:fake',
            }
          : {}),
      },
    });
    return cliente.id;
  }

  async function crearEquipo(
    tenant: InstanceType<typeof TenantPrismaClient>,
    token: string,
    extra: { nombre?: string; activo?: boolean; deletedAt?: Date } = {},
  ): Promise<void> {
    await tenant.equipoInformatico.create({
      data: {
        nombre: extra.nombre ?? 'PC-Laboratorio',
        activo: extra.activo,
        deletedAt: extra.deletedAt,
        qrTokenHash: sha256(token),
        qrEmitidoAt: new Date(),
      },
    });
  }

  const contexto = (slug: string, token?: string, xff?: string): Promise<Respuesta> =>
    get(
      `${baseUrl}/publico/c/${slug}/pedido/contexto${token === undefined ? '' : `?e=${encodeURIComponent(token)}`}`,
      xff,
    );

  describe('404 uniforme (ADR-1)', () => {
    it('slug inexistente, deshabilitado, inactivo, borrado y mal formado responden idéntico', async () => {
      await crearCliente({
        slug: 'deshabilitado',
        dbName: `ctx_deshab_${sufijo}`,
        habilitado: false,
      });
      await crearCliente({ slug: 'inactivo', dbName: `ctx_inact_${sufijo}`, activo: false });
      await crearCliente({ slug: 'borrado', dbName: `ctx_borr_${sufijo}`, borrado: true });

      const respuestas = [
        await contexto('no-existe'),
        await contexto('deshabilitado'),
        await contexto('inactivo'),
        await contexto('borrado'),
        await contexto('Slug_Inv%C3%A1lido'),
      ];

      expect(respuestas[0].status).toBe(404);
      for (const r of respuestas) {
        expect(r.status).toBe(respuestas[0].status);
        expect(r.texto).toBe(respuestas[0].texto);
        expect(r.headers).toEqual(respuestas[0].headers);
      }
      expect(JSON.parse(respuestas[0].texto)).toEqual({
        message: 'El formulario no está disponible.',
        error: 'Not Found',
        statusCode: 404,
      });
    });

    it('el 404 es el mismo con un token de equipo válido que sin token', async () => {
      await crearCliente({ slug: 'deshabilitado', dbName: DB_A, habilitado: false });
      await crearEquipo(tenantA, 'token-del-equipo-a');

      const conToken = await contexto('deshabilitado', 'token-del-equipo-a');
      const sinToken = await contexto('no-existe');

      expect(conToken.status).toBe(404);
      expect(conToken.texto).toBe(sinToken.texto);
      expect(conToken.headers).toEqual(sinToken.headers);
    });
  });

  describe('token del equipo (D8, ADR-5)', () => {
    it('token vigente del propio cliente devuelve solo los nombres', async () => {
      await crearCliente({ slug: 'colegio-a', dbName: DB_A, conSmtp: true });
      await crearEquipo(tenantA, 'token-vigente-a', { nombre: 'PC-Sala-3' });

      const r = await contexto('colegio-a', 'token-vigente-a');

      expect(r.status).toBe(200);
      expect(JSON.parse(r.texto)).toEqual({
        cliente: { nombre: 'Colegio colegio-a' },
        equipo: { nombre: 'PC-Sala-3' },
        modo: 'EXTERNO',
      });
    });

    it('token de un equipo del tenant B sobre el slug de A es byte a byte igual a uno inexistente', async () => {
      await crearCliente({ slug: 'colegio-a', dbName: DB_A, conSmtp: true });
      await crearCliente({ slug: 'colegio-b', dbName: DB_B, conSmtp: true });
      await crearEquipo(tenantB, 'token-del-equipo-de-b', { nombre: 'Servidor-Secreto-B' });

      const deB = await contexto('colegio-a', 'token-del-equipo-de-b');
      const inexistente = await contexto('colegio-a', 'token-que-no-existe-en-ningun-lado');
      const sinToken = await contexto('colegio-a');

      expect(deB.status).toBe(200);
      expect(deB.texto).toBe(inexistente.texto);
      expect(deB.texto).toBe(sinToken.texto);
      expect(deB.headers).toEqual(inexistente.headers);
      expect(deB.texto).not.toContain('Servidor-Secreto-B');
      expect(JSON.parse(deB.texto)).toEqual({
        cliente: { nombre: 'Colegio colegio-a' },
        equipo: null,
        modo: 'EXTERNO',
      });
    });

    it('equipo dado de baja o borrado abre sin equipo, igual que un token inexistente', async () => {
      await crearCliente({ slug: 'colegio-a', dbName: DB_A, conSmtp: true });
      await crearEquipo(tenantA, 'token-de-baja', { activo: false });
      await crearEquipo(tenantA, 'token-borrado', { deletedAt: new Date() });

      const baja = await contexto('colegio-a', 'token-de-baja');
      const borrado = await contexto('colegio-a', 'token-borrado');
      const inexistente = await contexto('colegio-a', 'token-inexistente');

      expect(baja.texto).toBe(inexistente.texto);
      expect(borrado.texto).toBe(inexistente.texto);
    });

    it('un token de largo desmedido se trata como inexistente', async () => {
      await crearCliente({ slug: 'colegio-a', dbName: DB_A, conSmtp: true });

      const r = await contexto('colegio-a', 'x'.repeat(5000));
      const inexistente = await contexto('colegio-a', 'token-inexistente');

      expect(r.status).toBe(200);
      expect(r.texto).toBe(inexistente.texto);
    });
  });

  describe('modo (D3)', () => {
    it('correo LISTO responde EXTERNO', async () => {
      await crearCliente({ slug: 'colegio-a', dbName: DB_A, conSmtp: true });

      const r = await contexto('colegio-a');

      expect(JSON.parse(r.texto)).toMatchObject({ modo: 'EXTERNO' });
    });

    it('correo sin configurar responde SESION, con o sin equipo', async () => {
      await crearCliente({ slug: 'colegio-b', dbName: DB_B });
      await crearEquipo(tenantB, 'token-de-b', { nombre: 'PC-B' });

      const sinEquipo = await contexto('colegio-b');
      const conEquipo = await contexto('colegio-b', 'token-de-b');

      expect(JSON.parse(sinEquipo.texto)).toEqual({
        cliente: { nombre: 'Colegio colegio-b' },
        equipo: null,
        modo: 'SESION',
      });
      expect(JSON.parse(conEquipo.texto)).toEqual({
        cliente: { nombre: 'Colegio colegio-b' },
        equipo: { nombre: 'PC-B' },
        modo: 'SESION',
      });
    });
  });

  describe('throttler `contexto` (ADR-8)', () => {
    it('el 31.º pedido del mismo origen y slug da 429, y otro slug tiene su propio cupo', async () => {
      await crearCliente({ slug: 'colegio-a', dbName: DB_A, conSmtp: true });

      const estados: number[] = [];
      for (let i = 0; i < 31; i++) {
        estados.push((await contexto('colegio-a', undefined, 'mismo-origen')).status);
      }

      expect(estados.slice(0, 30).every((s) => s === 200)).toBe(true);
      expect(estados[30]).toBe(429);
      expect((await contexto('no-existe', undefined, 'mismo-origen')).status).toBe(404);
    });
  });
});
