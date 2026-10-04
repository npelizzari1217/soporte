/**
 * pedido-publico-solicitud.e2e.spec.ts — `POST publico/c/:slug/pedido/solicitud`
 * (sdd/formulario-publico-qr, WU-13; tarea 13.1; D1, D3, D10, ADR-7, ADR-8).
 *
 * App real contra Postgres real y guards reales (throttler, tenant): dos tenants efímeros (A y B),
 * `soporte_master_test` truncada en `beforeEach`, `usarLockMasterTest()` y `EMAIL_SENDER` falso.
 * Los cupos del throttler viven en memoria de la app y se comparten entre tests: cada test usa
 * slugs y emails propios para no heredar el contador de otro.
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
import {
  EMAIL_SENDER,
  EmailMessage,
  IEmailSender,
} from '../../../shared/domain/ports/i-email-sender';
import { TAREAS_SEGUNDO_PLANO } from '../../../shared/domain/ports/i-tareas-segundo-plano.port';
// Tipo CONCRETO: `esperarPendientes()` no está en el puerto.
import { TareasSegundoPlano } from '../../../shared/infrastructure/segundo-plano/tareas-segundo-plano';
import { usarLockMasterTest } from '../../../testing/lock-master-test';

const MASTER_TEST_URL =
  process.env.DATABASE_URL_MASTER ??
  'postgresql://soporte:soporte@localhost:5432/soporte_master_test';

const sufijo = randomBytes(4).toString('hex');
const DB_A = `soporte_prov_solPubA_${sufijo}_test`;
const DB_B = `soporte_prov_solPubB_${sufijo}_test`;

class FakeEmailSender implements IEmailSender {
  enviados: EmailMessage[] = [];
  async send(msg: EmailMessage): Promise<void> {
    this.enviados.push(msg);
  }
}

interface Respuesta {
  status: number;
  texto: string;
}

const sha256 = (valor: string): string => createHash('sha256').update(valor).digest('hex');

@Module({ imports: [SharedModule, AuthModule, FormularioPublicoModule] })
class TestHarnessModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(TenantScopeMiddleware).forRoutes('*');
  }
}

usarLockMasterTest();

describe('Formulario público e2e — POST solicitud (WU-13)', () => {
  let app: INestApplication;
  let baseUrl: string;
  let prismaService: PrismaService;
  let masterClient: InstanceType<typeof MasterPrismaClient>;
  let tenantA: InstanceType<typeof TenantPrismaClient>;
  let tenantB: InstanceType<typeof TenantPrismaClient>;
  let clienteRepo: PrismaClienteRepository;
  let tareas: TareasSegundoPlano;
  const correo = new FakeEmailSender();
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
    })
      .overrideProvider(EMAIL_SENDER)
      .useValue(correo)
      .compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    await app.listen(0);
    tareas = moduleRef.get<TareasSegundoPlano>(TAREAS_SEGUNDO_PLANO, { strict: false });
    const port = (app.getHttpServer() as { address: () => { port: number } }).address().port;
    baseUrl = `http://localhost:${port}`;
  }, 90_000);

  afterAll(async () => {
    // Orden CRÍTICO: filas → app.close() → dropDatabase. Al revés, el DROP falla en silencio.
    for (const tenant of [tenantA, tenantB]) {
      try {
        await tenant.pedidoPublicoPendiente.deleteMany();
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
    await tenantA.pedidoPublicoPendiente.deleteMany();
    await tenantB.pedidoPublicoPendiente.deleteMany();
    await tenantA.equipoInformatico.deleteMany();
    correo.enviados = [];
  });

  async function crearCliente(opciones: {
    slug: string;
    dbName: string;
    conSmtp?: boolean;
  }): Promise<string> {
    const cliente = ClienteEntity.create({
      nombre: `Colegio ${opciones.slug}`,
      razonSocial: null,
      cuit: null,
      dbName: opciones.dbName,
      activo: true,
    });
    await clienteRepo.save(cliente);
    // `save()` no escribe el slug (solo los CAS lo hacen): se carga por el camino real.
    await clienteRepo.cambiarSlugSiNoCongelado(cliente.id, opciones.slug);
    await masterClient.cliente.update({
      where: { id: cliente.id },
      data: {
        formularioPublicoHabilitado: true,
        ...(opciones.conSmtp === false
          ? {}
          : {
              smtpHost: 'smtp.integration.test',
              smtpPort: 587,
              smtpUser: 'pedido@integration.test',
              smtpFrom: 'no-reply@integration.test',
              smtpPasswordCifrada: 'v1:fake:fake:fake',
            }),
      },
    });
    return cliente.id;
  }

  const cuerpo = (email: string, extra: Record<string, unknown> = {}): Record<string, unknown> => ({
    nombre: 'Ana Pérez',
    email,
    titulo: 'No enciende la PC',
    descripcion: 'La PC del laboratorio no enciende.',
    ...extra,
  });

  async function solicitar(
    slug: string,
    body: Record<string, unknown>,
    xff = randomBytes(6).toString('hex'),
  ): Promise<Respuesta> {
    const res = await fetch(`${baseUrl}/publico/c/${slug}/pedido/solicitud`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'x-forwarded-for': xff,
      },
      body: JSON.stringify(body),
    });
    return { status: res.status, texto: await res.text() };
  }

  describe('camino feliz (D1, ADR-7)', () => {
    it('202 constante: el pendiente con la PII queda en el tenant, master solo guarda el hash y sale el mail', async () => {
      const clienteId = await crearCliente({ slug: 'sol-feliz', dbName: DB_A });

      const r = await solicitar(
        'sol-feliz',
        cuerpo('feliz@example.com', { prioridadId: 'CRITICA' }),
      );
      await tareas.esperarPendientes();

      expect(r.status).toBe(202);
      expect(JSON.parse(r.texto)).toEqual({
        mensaje: 'Si los datos son correctos, te enviamos un mail para confirmar.',
      });

      const pendientes = await tenantA.pedidoPublicoPendiente.findMany();
      expect(pendientes).toHaveLength(1);
      expect(pendientes[0]).toMatchObject({
        nombre: 'Ana Pérez',
        email: 'feliz@example.com',
        titulo: 'No enciende la PC',
      });

      const tokens = await masterClient.pedidoPublicoToken.findMany();
      expect(tokens).toHaveLength(1);
      expect(tokens[0].id).toBe(pendientes[0].id);
      expect(tokens[0].clienteId).toBe(clienteId);
      expect(tokens[0].usedAt).toBeNull();

      expect(correo.enviados).toHaveLength(1);
      const mensaje = correo.enviados[0];
      expect(mensaje.to).toBe('feliz@example.com');
      const crudo = /\/c\/sol-feliz\/pedido\/confirmar#token=([^\s"]+)/.exec(mensaje.text)?.[1];
      expect(crudo).toBeDefined();
      expect(tokens[0].tokenHash).toBe(sha256(crudo ?? ''));
      expect(JSON.stringify(tokens[0])).not.toContain(crudo);
    });

    it('el token del QR resuelve el equipo en el tenant del slug', async () => {
      await crearCliente({ slug: 'sol-qr', dbName: DB_A });
      const equipo = await tenantA.equipoInformatico.create({
        data: { nombre: 'PC-QR', qrTokenHash: sha256('token-qr-e2e'), qrEmitidoAt: new Date() },
      });

      await solicitar('sol-qr', cuerpo('qr@example.com', { equipoToken: 'token-qr-e2e' }));
      await solicitar('sol-qr', cuerpo('qr2@example.com', { equipoToken: 'token-inexistente' }));
      await tareas.esperarPendientes();

      const porEmail = Object.fromEntries(
        (await tenantA.pedidoPublicoPendiente.findMany()).map((p) => [p.email, p.equipoId]),
      );
      expect(porEmail['qr@example.com']).toBe(equipo.id);
      expect(porEmail['qr2@example.com']).toBeNull();
    });

    it('un body inválido da 400 sin escribir nada', async () => {
      await crearCliente({ slug: 'sol-400', dbName: DB_A });

      const r = await solicitar('sol-400', cuerpo('no-es-un-email'));

      expect(r.status).toBe(400);
      expect(await tenantA.pedidoPublicoPendiente.count()).toBe(0);
      expect(await masterClient.pedidoPublicoToken.count()).toBe(0);
    });

    it('una descripción de 4001 caracteres la rechaza el DTO con 400 (@MaxLength), sin escribir ni mandar mail', async () => {
      await crearCliente({ slug: 'sol-400-desc', dbName: DB_A });

      const r = await solicitar(
        'sol-400-desc',
        cuerpo('desc@example.com', { descripcion: 'x'.repeat(4001) }),
      );
      await tareas.esperarPendientes();

      expect(r.status).toBe(400);
      // Mensaje de class-validator: lo emite el ValidationPipe, no la entidad.
      const { message } = JSON.parse(r.texto) as { message: string[] };
      expect(message).toEqual(['descripcion must be shorter than or equal to 4000 characters']);
      expect(await tenantA.pedidoPublicoPendiente.count()).toBe(0);
      expect(await masterClient.pedidoPublicoToken.count()).toBe(0);
      expect(correo.enviados).toHaveLength(0);
    });
  });

  describe('correo sin LISTO (D3)', () => {
    it('404 uniforme: no escribe PII ni en master ni en el tenant, y no manda mail', async () => {
      await crearCliente({ slug: 'sol-sin-smtp', dbName: DB_B, conSmtp: false });

      const r = await solicitar('sol-sin-smtp', cuerpo('sin-smtp@example.com'));
      const inexistente = await solicitar('sol-no-existe-d3', cuerpo('sin-smtp2@example.com'));
      await tareas.esperarPendientes();

      expect(r.status).toBe(404);
      expect(r.texto).toBe(inexistente.texto);
      expect(await tenantB.pedidoPublicoPendiente.count()).toBe(0);
      expect(await masterClient.pedidoPublicoToken.count()).toBe(0);
      expect(correo.enviados).toHaveLength(0);
    });
  });

  describe('throttlers `email` y `cliente` (D10, ADR-8)', () => {
    it('el mismo email con distintos x-forwarded-for comparte cupo y el 4.º da 429 sin mail', async () => {
      await crearCliente({ slug: 'sol-email', dbName: DB_A });

      const estados: number[] = [];
      for (let i = 0; i < 4; i++) {
        estados.push((await solicitar('sol-email', cuerpo('rota@example.com'), `ip-${i}`)).status);
      }
      await tareas.esperarPendientes();

      expect(estados).toEqual([202, 202, 202, 429]);
      expect(correo.enviados).toHaveLength(3);
      // El email se normaliza: otra capitalización es el mismo buzón.
      expect((await solicitar('sol-email', cuerpo('  ROTA@Example.com '), 'ip-9')).status).toBe(
        429,
      );
      // Otro email del mismo cliente tiene su propio cupo.
      expect((await solicitar('sol-email', cuerpo('otro@example.com'), 'ip-0')).status).toBe(202);
    });

    it('el 429 lleva un solo mensaje genérico, igual para el límite de email y el de cliente', async () => {
      await crearCliente({ slug: 'sol-429', dbName: DB_A });

      for (let i = 0; i < 3; i++) {
        await solicitar('sol-429', cuerpo('mismo429@example.com'));
      }
      // El pedido rechazado por email corta antes del throttler `cliente`: no consume su cupo.
      const porEmail = await solicitar('sol-429', cuerpo('mismo429@example.com'));
      for (let i = 0; i < 27; i++) {
        await solicitar('sol-429', cuerpo(`relleno429-${i}@example.com`));
      }
      const porCliente = await solicitar('sol-429', cuerpo('nuevo429@example.com'));

      expect(porEmail.status).toBe(429);
      expect(porCliente.status).toBe(429);
      expect(porEmail.texto).toBe(porCliente.texto);
    });

    it('el pedido 31 al cliente da 429 y otro cliente no se ve afectado', async () => {
      await crearCliente({ slug: 'sol-cupo-a', dbName: DB_A });
      await crearCliente({ slug: 'sol-cupo-b', dbName: DB_B });

      const estados: number[] = [];
      for (let i = 0; i < 31; i++) {
        estados.push((await solicitar('sol-cupo-a', cuerpo(`c${i}@example.com`))).status);
      }

      expect(estados.slice(0, 30).every((s) => s === 202)).toBe(true);
      expect(estados[30]).toBe(429);
      expect((await solicitar('sol-cupo-b', cuerpo('c0@example.com'))).status).toBe(202);
    });

    it('un slug inexistente tiene su propio contador: 404 hasta el cupo y luego 429, sin tocar a otro slug', async () => {
      await crearCliente({ slug: 'sol-real', dbName: DB_A });

      const estados: number[] = [];
      for (let i = 0; i < 31; i++) {
        estados.push((await solicitar('sol-fantasma', cuerpo(`f${i}@example.com`))).status);
      }

      expect(estados.slice(0, 30).every((s) => s === 404)).toBe(true);
      expect(estados[30]).toBe(429);
      expect((await solicitar('sol-real', cuerpo('real@example.com'))).status).toBe(202);
    });
  });
});
