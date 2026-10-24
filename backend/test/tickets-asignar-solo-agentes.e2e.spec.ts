/**
 * tickets-asignar-solo-agentes.e2e.spec.ts — `PATCH /tickets/:id/asignar` y
 * `PATCH /tickets/:id/asignar-en-proceso` aceptan como responsable SOLO a un TECNICO o
 * COLABORADOR activo con `LECTURA` sobre el tipo del ticket: el mismo universo que ofrece
 * `GET /tickets/:id/asignables` (decisión del dueño del 2026-10-23).
 *
 * App real (Nest, guards reales, repositorios Prisma), master de test y una base de tenant efímera
 * migrada y sembrada. Los fixtures contienen a quienes NO tienen que pasar: un ADMINISTRADOR y un
 * ROOT con `LECTURA` sobre el tipo, un USUARIO con `LECTURA` y un TECNICO con `LECTURA` sobre otro
 * tipo. Un ticket ya asignado a un ADMINISTRADOR antes de la regla se sigue editando y se pone en
 * proceso sin cambiar de responsable.
 *
 * Higiene: filas del tenant → `app.close()` → pool → `dropDatabase`, con el turno exclusivo de
 * `usarLockMasterTest()` sobre la master compartida.
 */
import { randomBytes } from 'node:crypto';
import {
  INestApplication,
  MiddlewareConsumer,
  Module,
  NestModule,
  ValidationPipe,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { SharedModule } from '../src/shared/shared.module';
import { AuthModule } from '../src/auth/auth.module';
import { TicketsModule } from '../src/tickets/tickets.module';
import { TenantScopeMiddleware } from '../src/shared/tenancy/tenant-scope.middleware';
import { PrismaService } from '../src/shared/infrastructure/persistence/prisma.service';
import {
  MasterPrismaClient,
  TenantPrismaClient,
} from '../src/shared/infrastructure/persistence/prisma-clients';
import { PostgresAdminService } from '../src/clientes/infrastructure/postgres-admin.service';
import { TenantMigrationRunnerAdapter } from '../src/clientes/infrastructure/tenant-migration-runner.adapter';
import { TenantSeederAdapter } from '../src/clientes/infrastructure/tenant-seeder.adapter';
import { PrismaClienteRepository } from '../src/clientes/infrastructure/persistence/prisma/prisma-cliente.repository';
import { PrismaUsuarioRepository } from '../src/auth/infrastructure/persistence/prisma/prisma-usuario.repository';
import { ClienteEntity } from '../src/clientes/domain/entities/cliente.entity';
import { UsuarioEntity } from '../src/auth/domain/entities/usuario.entity';
import { Argon2HashProvider } from '../src/auth/infrastructure/argon2-hash.provider';
import { URL_MASTER_TEST_POR_DEFECTO, usarLockMasterTest } from '../src/testing/lock-master-test';

const MASTER_TEST_URL = process.env.DATABASE_URL_MASTER ?? URL_MASTER_TEST_POR_DEFECTO;
const TENANT_DB_NAME = `soporte_prov_asignarE2E_${randomBytes(4).toString('hex')}_test`;
const PASSWORD = 'E2eAsignarAgentes!123';

/** Mensaje del 422 para un asignado fuera del universo de agentes del tipo. */
function mensajeNoElegible(usuarioId: string, tipoId: string): string {
  return (
    `El usuario "${usuarioId}" no puede recibir tickets del tipo "${tipoId}": ` +
    'solo se asignan técnicos o colaboradores activos con permiso de Ver sobre ese tipo.'
  );
}

@Module({ imports: [SharedModule, AuthModule, TicketsModule] })
class HarnessModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(TenantScopeMiddleware).forRoutes('*');
  }
}

async function httpPatch<T = unknown>(
  url: string,
  token: string,
  body: unknown,
): Promise<{ status: number; data: T }> {
  const res = await fetch(url, {
    method: 'PATCH',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => null)) as T;
  return { status: res.status, data };
}

// Turno exclusivo sobre la master de test compartida — ver src/testing/lock-master-test.ts.
usarLockMasterTest();

describe('PATCH /tickets/:id/asignar y /asignar-en-proceso — solo técnicos y colaboradores (e2e)', () => {
  let app: INestApplication;
  let baseUrl: string;
  let token: string;
  let prismaService: PrismaService;
  let master: InstanceType<typeof MasterPrismaClient>;
  let tenant: InstanceType<typeof TenantPrismaClient>;
  const admin = new PostgresAdminService(MASTER_TEST_URL);
  const hash = new Argon2HashProvider();

  /** Tipos del tenant: los tickets son de `soporte`; `redes` es el otro tipo del técnico. */
  const tipos = { soporte: '', redes: '' };
  /** Ids de los usuarios del fixture. */
  const ids: Record<string, string> = {};
  /** Ids de catálogo del tenant sembrado. */
  const catalogo = { nuevo: '', asignado: '', enProceso: '', prioridad: '' };
  let sufijo = '';
  let secuencia = 0;

  /**
   * Inserta un ticket de Soporte directamente en el tenant.
   *
   * @param asignadoId Responsable ya guardado, o `null`.
   * @returns Id del ticket.
   */
  async function crearTicket(asignadoId: string | null): Promise<string> {
    secuencia += 1;
    const ticket = await tenant.ticket.create({
      data: {
        numero: `E2E-${sufijo}-${secuencia}`,
        titulo: `Ticket ${secuencia}`,
        tipoId: tipos.soporte,
        estadoId: asignadoId === null ? catalogo.nuevo : catalogo.asignado,
        prioridadId: catalogo.prioridad,
        solicitanteId: ids.asignador,
        asignadoId,
      },
    });
    return ticket.id;
  }

  async function asignadoGuardado(ticketId: string): Promise<string | null> {
    return (await tenant.ticket.findUniqueOrThrow({ where: { id: ticketId } })).asignadoId;
  }

  beforeAll(async () => {
    if (!process.env.DATABASE_URL_MASTER) {
      process.env.DATABASE_URL_MASTER = MASTER_TEST_URL;
    }
    await admin.createDatabase(TENANT_DB_NAME);
    await new TenantMigrationRunnerAdapter(MASTER_TEST_URL).run(TENANT_DB_NAME);
    await new TenantSeederAdapter(MASTER_TEST_URL).seed(TENANT_DB_NAME);
    prismaService = new PrismaService(MASTER_TEST_URL);
    master = prismaService.getMasterClient();
    tenant = prismaService.getTenantClient(TENANT_DB_NAME);

    await master.$executeRawUnsafe(
      'TRUNCATE TABLE membresias, refresh_tokens, usuario_cliente_permisos, usuarios, clientes, roles RESTART IDENTITY CASCADE',
    );

    sufijo = randomBytes(3).toString('hex');
    for (const clave of ['soporte', 'redes'] as const) {
      const tipo = await tenant.tipoTicket.create({
        data: {
          codigo: `E2E_${clave.toUpperCase()}_${sufijo}`,
          nombre: `E2E ${clave}`,
          modulo: 'TICKETS',
        },
      });
      tipos[clave] = tipo.id;
    }
    const estado = async (codigo: string): Promise<string> =>
      (await tenant.estado.findUniqueOrThrow({ where: { codigo } })).id;
    catalogo.nuevo = await estado('NUEVO');
    catalogo.asignado = await estado('ASIGNADO');
    catalogo.enProceso = await estado('EN_PROCESO');
    catalogo.prioridad = (
      await tenant.prioridad.findUniqueOrThrow({ where: { codigo: 'MEDIA' } })
    ).id;

    const cliente = ClienteEntity.create({
      nombre: `E2E Asignar ${sufijo}`,
      razonSocial: null,
      cuit: null,
      dbName: TENANT_DB_NAME,
      activo: true,
    });
    await new PrismaClienteRepository(prismaService).save(cliente);

    const roles = new Map<string, string>();
    for (const codigo of ['ADMINISTRADOR', 'TECNICO', 'COLABORADOR', 'USUARIO']) {
      const rol = await master.role.create({ data: { codigo, nombre: codigo } });
      roles.set(codigo, rol.id);
    }
    const usuarioRepo = new PrismaUsuarioRepository(prismaService);

    /** Usuario con membresía activa (ROOT: `is_global_admin`, sin membresía) y sus filas por tipo. */
    async function crear(
      clave: string,
      rol: 'ROOT' | 'ADMINISTRADOR' | 'TECNICO' | 'COLABORADOR' | 'USUARIO',
      tiposConLectura: ReadonlyArray<keyof typeof tipos>,
    ): Promise<void> {
      const usuario = UsuarioEntity.create({
        email: `e2e_asignar_${clave}_${sufijo}@test.local`,
        nombre: clave,
        apellido: 'E2E',
        passwordHash: await hash.hash(PASSWORD),
        activo: true,
        isGlobalAdmin: rol === 'ROOT',
      });
      await usuarioRepo.save(usuario);
      if (rol !== 'ROOT') {
        const rolId = roles.get(rol);
        if (rolId === undefined) throw new Error(`Rol de fixture inexistente: ${rol}`);
        await master.membresia.create({
          data: { usuarioId: usuario.id, clienteId: cliente.id, rolId, activo: true },
        });
      }
      if (tiposConLectura.length > 0) {
        await tenant.permisoTipoTicket.createMany({
          data: tiposConLectura.map((tipo) => ({
            usuarioId: usuario.id,
            tipoId: tipos[tipo],
            accion: 'LECTURA' as const,
          })),
        });
      }
      ids[clave] = usuario.id;
    }

    // El actor es ADMINISTRADOR: ve y asigna todo, así que solo decide la elegibilidad del destino.
    await crear('asignador', 'ADMINISTRADOR', []);
    await crear('adminDestino', 'ADMINISTRADOR', ['soporte']);
    await crear('rootDestino', 'ROOT', ['soporte']);
    await crear('usuarioConLectura', 'USUARIO', ['soporte']);
    await crear('tecnicoDeRedes', 'TECNICO', ['redes']);
    await crear('tecnico', 'TECNICO', ['soporte']);
    await crear('colaborador', 'COLABORADOR', ['soporte']);

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [HarnessModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    await app.listen(0);
    const port = (app.getHttpServer() as { address: () => { port: number } }).address().port;
    baseUrl = `http://localhost:${port}`;

    const res = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: `e2e_asignar_asignador_${sufijo}@test.local`,
        password: PASSWORD,
      }),
    });
    token = ((await res.json()) as { accessToken: string }).accessToken;
  }, 120_000);

  afterAll(async () => {
    try {
      await tenant?.permisoTipoTicket.deleteMany();
    } catch (_err) {
      /* no-op */
    }
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
    await admin.dropDatabase(TENANT_DB_NAME);
  }, 60_000);

  describe.each(['asignar', 'asignar-en-proceso'])('PATCH /tickets/:id/%s', (ruta) => {
    it.each([
      ['un ADMINISTRADOR con LECTURA sobre el tipo', 'adminDestino'],
      ['un ROOT con LECTURA sobre el tipo', 'rootDestino'],
      ['un USUARIO con LECTURA sobre el tipo', 'usuarioConLectura'],
      ['un TECNICO sin LECTURA sobre el tipo (sí sobre otro)', 'tecnicoDeRedes'],
    ])('%s → 422 que nombra la regla; el responsable guardado no cambia', async (_caso, clave) => {
      const ticketId = await crearTicket(ids.tecnico);

      const { status, data } = await httpPatch<{ message: string }>(
        `${baseUrl}/tickets/${ticketId}/${ruta}`,
        token,
        { asignadoId: ids[clave] },
      );

      expect(status).toBe(422);
      expect(data.message).toBe(mensajeNoElegible(ids[clave], tipos.soporte));
      expect(await asignadoGuardado(ticketId)).toBe(ids.tecnico);
    });

    it.each([
      ['un TECNICO con LECTURA sobre el tipo', 'tecnico'],
      ['un COLABORADOR con LECTURA sobre el tipo', 'colaborador'],
    ])('%s → 200 y queda guardado como responsable', async (_caso, clave) => {
      const ticketId = await crearTicket(null);

      const { status, data } = await httpPatch<{ asignadoId: string }>(
        `${baseUrl}/tickets/${ticketId}/${ruta}`,
        token,
        { asignadoId: ids[clave] },
      );

      expect(status).toBe(200);
      expect(data.asignadoId).toBe(ids[clave]);
      expect(await asignadoGuardado(ticketId)).toBe(ids[clave]);
    });
  });

  describe('ticket asignado a un ADMINISTRADOR antes de la regla', () => {
    it('editar otros campos sin tocar el responsable → 200 y el ADMINISTRADOR sigue asignado', async () => {
      const ticketId = await crearTicket(ids.adminDestino);

      const { status, data } = await httpPatch<{ titulo: string; asignadoId: string }>(
        `${baseUrl}/tickets/${ticketId}`,
        token,
        { titulo: 'Título editado' },
      );

      expect(status).toBe(200);
      expect(data.titulo).toBe('Título editado');
      expect(await asignadoGuardado(ticketId)).toBe(ids.adminDestino);
    });

    it('ponerlo en proceso con el mismo responsable → 200, EN_PROCESO y el ADMINISTRADOR sigue asignado', async () => {
      const ticketId = await crearTicket(ids.adminDestino);

      const { status } = await httpPatch(
        `${baseUrl}/tickets/${ticketId}/asignar-en-proceso`,
        token,
        { asignadoId: ids.adminDestino },
      );

      expect(status).toBe(200);
      const fila = await tenant.ticket.findUniqueOrThrow({ where: { id: ticketId } });
      expect(fila.estadoId).toBe(catalogo.enProceso);
      expect(fila.asignadoId).toBe(ids.adminDestino);
    });

    it('reasignarlo a un técnico del tipo → 200', async () => {
      const ticketId = await crearTicket(ids.adminDestino);

      const { status } = await httpPatch(`${baseUrl}/tickets/${ticketId}/asignar`, token, {
        asignadoId: ids.tecnico,
      });

      expect(status).toBe(200);
      expect(await asignadoGuardado(ticketId)).toBe(ids.tecnico);
    });
  });

  it('sanity: DATABASE_URL_MASTER apunta a una DB *_test y el tenant es efímero *_test', () => {
    expect(MASTER_TEST_URL).toMatch(/_test$/);
    expect(TENANT_DB_NAME).toMatch(/^soporte_prov_asignarE2E_.*_test$/);
  });
});
