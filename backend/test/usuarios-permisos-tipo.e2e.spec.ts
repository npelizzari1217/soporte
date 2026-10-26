/**
 * usuarios-permisos-tipo.e2e.spec.ts — plantillas de rol por tipo de ticket
 * (odd/tasks/permisos-por-tipo-ticket.md, T4c, S7).
 *
 * Endpoints reales (`POST /usuarios`, `POST /usuarios/:id/permisos/aplicar-preset`,
 * `PATCH /usuarios/:id/rol`) con guards reales, master de test y una base de tenant efímera migrada
 * y sembrada con `TenantSeederAdapter`. Afirma sobre las filas de `permisos_tipo_ticket` leídas
 * crudas del tenant, no sobre las llamadas. No trunca master: cada fila lleva un sufijo aleatorio y
 * se borra al final.
 */
import { randomBytes } from 'node:crypto';
import {
  INestApplication,
  MiddlewareConsumer,
  Module,
  NestModule,
  ValidationPipe,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { SharedModule } from '../src/shared/shared.module';
import { AuthModule } from '../src/auth/auth.module';
import { TenantScopeMiddleware } from '../src/shared/tenancy/tenant-scope.middleware';
import { PrismaService } from '../src/shared/infrastructure/persistence/prisma.service';
import {
  MasterPrismaClient,
  TenantPrismaClient,
} from '../src/shared/infrastructure/persistence/prisma-clients';
import { PostgresAdminService } from '../src/clientes/infrastructure/postgres-admin.service';
import { TenantMigrationRunnerAdapter } from '../src/clientes/infrastructure/tenant-migration-runner.adapter';
import { TenantSeederAdapter } from '../src/clientes/infrastructure/tenant-seeder.adapter';
import { ClienteEntity } from '../src/clientes/domain/entities/cliente.entity';
import { PrismaClienteRepository } from '../src/clientes/infrastructure/persistence/prisma/prisma-cliente.repository';
import { UsuarioEntity } from '../src/auth/domain/entities/usuario.entity';
import { PrismaUsuarioRepository } from '../src/auth/infrastructure/persistence/prisma/prisma-usuario.repository';
import { Argon2HashProvider } from '../src/auth/infrastructure/argon2-hash.provider';
import { URL_MASTER_TEST_POR_DEFECTO, usarLockMasterTest } from '../src/testing/lock-master-test';

const URL_MASTER = process.env.DATABASE_URL_MASTER ?? URL_MASTER_TEST_POR_DEFECTO;
const SUFIJO = randomBytes(4).toString('hex');
const TENANT_DB = `soporte_prov_permtipoE2E_${SUFIJO}_test`;
const PASSWORD = 'E2ePermTipo!123';

@Module({ imports: [SharedModule, AuthModule] })
class HarnessModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(TenantScopeMiddleware).forRoutes('*');
  }
}

usarLockMasterTest();

describe('Plantillas de rol por tipo de ticket por los endpoints de /usuarios (T4c)', () => {
  const admin = new PostgresAdminService(URL_MASTER);
  let app: INestApplication;
  let baseUrl: string;
  let prisma: PrismaService;
  let master: InstanceType<typeof MasterPrismaClient>;
  let tenant: InstanceType<typeof TenantPrismaClient>;
  let emailKeyOriginal: string | undefined;
  let clienteId: string;
  let tokenAdmin: string;
  let tipoSoporteId: string;
  let tipoEdiliciaId: string;
  let tipoDeBajaId: string;
  const usuarioIds: string[] = [];

  async function http(metodo: string, ruta: string, body?: object) {
    const res = await fetch(`${baseUrl}${ruta}`, {
      method: metodo,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenAdmin}` },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: res.status, body: (await res.json().catch(() => null)) as unknown };
  }

  /** Filas por tipo del usuario, leídas crudas del tenant, como `tipoId:ACCION`. */
  async function filasDe(usuarioId: string): Promise<string[]> {
    const filas = await tenant.permisoTipoTicket.findMany({ where: { usuarioId } });
    return filas.map((f) => `${f.tipoId}:${f.accion}`).sort();
  }

  async function rolId(codigo: string): Promise<string> {
    const rol =
      (await master.role.findFirst({ where: { codigo } })) ??
      (await master.role.create({ data: { codigo, nombre: codigo } }));
    return rol.id;
  }

  async function crearUsuarioPorEndpoint(etiqueta: string, rolCodigo: string): Promise<string> {
    const { status, body } = await http('POST', '/usuarios', {
      email: `permtipo-${etiqueta}-${SUFIJO}@test.local`,
      nombre: 'Perm',
      apellido: etiqueta,
      password: PASSWORD,
      rolCodigo,
    });
    expect(status).toBe(201);
    const usuarioId = (body as { usuarioId: string }).usuarioId;
    usuarioIds.push(usuarioId);
    return usuarioId;
  }

  beforeAll(async () => {
    emailKeyOriginal = process.env.EMAIL_CRYPTO_KEY;
    process.env.EMAIL_CRYPTO_KEY = 'f'.repeat(64);
    process.env.DATABASE_URL_MASTER ??= URL_MASTER;

    await admin.createDatabase(TENANT_DB);
    await new TenantMigrationRunnerAdapter(URL_MASTER).run(TENANT_DB);
    await new TenantSeederAdapter(URL_MASTER).seed(TENANT_DB);

    prisma = new PrismaService(URL_MASTER);
    master = prisma.getMasterClient();
    tenant = prisma.getTenantClient(TENANT_DB);
    tipoSoporteId = (await tenant.tipoTicket.findUniqueOrThrow({ where: { codigo: 'SOPORTE' } }))
      .id;
    const edilicia = await tenant.tipoTicket.findFirst({ where: { modulo: 'EDILICIA' } });
    tipoEdiliciaId =
      edilicia?.id ??
      (
        await tenant.tipoTicket.create({
          data: { codigo: `EDI_${SUFIJO}`, nombre: 'Edilicia E2E', modulo: 'EDILICIA' },
        })
      ).id;
    // Un tipo dado de baja también recibe permisos (L24).
    tipoDeBajaId = (
      await tenant.tipoTicket.create({
        data: {
          codigo: `BAJA_${SUFIJO}`,
          nombre: 'Baja E2E',
          modulo: 'TICKETS',
          activo: false,
          deletedAt: new Date(),
        },
      })
    ).id;

    const cliente = ClienteEntity.create({
      nombre: `PermTipo E2E ${SUFIJO}`,
      razonSocial: null,
      cuit: null,
      dbName: TENANT_DB,
      activo: true,
    });
    await new PrismaClienteRepository(prisma).save(cliente);
    clienteId = cliente.id;

    const actor = UsuarioEntity.create({
      email: `permtipo-admin-${SUFIJO}@test.local`,
      nombre: 'Admin',
      apellido: 'PermTipo',
      passwordHash: await new Argon2HashProvider().hash(PASSWORD),
      activo: true,
      isGlobalAdmin: false,
    });
    await new PrismaUsuarioRepository(prisma).save(actor);
    usuarioIds.push(actor.id);
    await master.membresia.create({
      data: { usuarioId: actor.id, clienteId, rolId: await rolId('ADMINISTRADOR'), activo: true },
    });
    for (const codigo of ['TECNICO', 'USUARIO']) await rolId(codigo);

    const moduleRef = await Test.createTestingModule({ imports: [HarnessModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    await app.listen(0);
    const port = (app.getHttpServer() as { address: () => { port: number } }).address().port;
    baseUrl = `http://localhost:${port}`;

    const login = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: actor.email, password: PASSWORD }),
    });
    tokenAdmin = ((await login.json()) as { accessToken: string }).accessToken;
  }, 120_000);

  afterAll(async () => {
    if (emailKeyOriginal === undefined) delete process.env.EMAIL_CRYPTO_KEY;
    else process.env.EMAIL_CRYPTO_KEY = emailKeyOriginal;
    try {
      await app?.close();
    } catch {
      /* no-op */
    }
    try {
      for (const usuarioId of usuarioIds) {
        await master.usuarioClientePermiso.deleteMany({ where: { usuarioId } });
        await master.refreshToken.deleteMany({ where: { usuarioId } });
        await master.membresia.deleteMany({ where: { usuarioId } });
        await master.usuario.deleteMany({ where: { id: usuarioId } });
      }
      if (clienteId) await master.cliente.deleteMany({ where: { id: clienteId } });
    } catch {
      /* no-op */
    }
    try {
      await prisma?.onModuleDestroy();
    } catch {
      /* no-op */
    }
    await admin.dropDatabase(TENANT_DB);
  }, 60_000);

  it('POST /usuarios con TECNICO deja la matriz y sus filas por tipo en cada tipo del tenant', async () => {
    const usuarioId = await crearUsuarioPorEndpoint('tecnico', 'TECNICO');

    const celdas = await master.usuarioClientePermiso.count({ where: { usuarioId, clienteId } });
    expect(celdas).toBeGreaterThan(0);
    const filas = await filasDe(usuarioId);
    expect(filas).toContain(`${tipoSoporteId}:ASIGNAR`);
    expect(filas).toContain(`${tipoSoporteId}:IMPRESION`);
    expect(filas).toContain(`${tipoEdiliciaId}:TRANSICIONAR`);
    expect(filas).toContain(`${tipoDeBajaId}:LECTURA`);
    expect(filas.some((f) => f.endsWith(':BORRADO'))).toBe(false);
    const tiposConFilas = new Set(filas.map((f) => f.split(':')[0]));
    expect(tiposConFilas.size).toBe(await tenant.tipoTicket.count());
  });

  it('POST /usuarios/:id/permisos/aplicar-preset reemplaza las filas por tipo, sin fusionar', async () => {
    const usuarioId = await crearUsuarioPorEndpoint('aplicar', 'TECNICO');
    expect(await filasDe(usuarioId)).toContain(`${tipoSoporteId}:ASIGNAR`);

    const { status } = await http('POST', `/usuarios/${usuarioId}/permisos/aplicar-preset`, {
      rolCodigo: 'USUARIO',
    });

    expect(status).toBe(200);
    const filas = await filasDe(usuarioId);
    expect(filas).not.toContain(`${tipoSoporteId}:ASIGNAR`);
    expect(filas).not.toContain(`${tipoSoporteId}:VER_TODOS`);
    expect(filas).toContain(`${tipoSoporteId}:ALTAS`);
  });

  it('PATCH /usuarios/:id/rol a ADMINISTRADOR con reaplicarPreset deja al usuario sin filas por tipo', async () => {
    const usuarioId = await crearUsuarioPorEndpoint('rol-admin', 'TECNICO');
    expect((await filasDe(usuarioId)).length).toBeGreaterThan(0);

    const { status } = await http('PATCH', `/usuarios/${usuarioId}/rol`, {
      rolCodigo: 'ADMINISTRADOR',
      reaplicarPreset: true,
    });

    expect(status).toBe(200);
    expect(await filasDe(usuarioId)).toEqual([]);
  });

  /** `GET /usuarios` con el token del usuario creado por `crearUsuarioPorEndpoint(etiqueta)`. */
  async function listarUsuariosComo(etiqueta: string): Promise<number> {
    const login = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: `permtipo-${etiqueta}-${SUFIJO}@test.local`, password: PASSWORD }),
    });
    const { accessToken } = (await login.json()) as { accessToken: string };
    const res = await fetch(`${baseUrl}/usuarios`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    return res.status;
  }

  // S7: el acceso a `GET /usuarios` no cambia con la migración. Antes exigía `TICKETS:ASIGNAR` o
  // `TICKETS:VER_TODOS`; la plantilla USUARIO no tiene ninguna, y su `EDILICIA:LECTURA` ya no se
  // traduce a VER_TODOS sobre los tipos de Edilicia (L35).
  it('GET /usuarios con las filas de la plantilla USUARIO → 403, con las de TECNICO → 200 (S7)', async () => {
    const usuarioId = await crearUsuarioPorEndpoint('lista-usuario', 'USUARIO');
    const tecnicoId = await crearUsuarioPorEndpoint('lista-tecnico', 'TECNICO');
    // El USUARIO no recibe VER_TODOS en ningún tipo; el TECNICO conserva sobre Edilicia las acciones
    // de sus celdas de TICKETS (L35).
    const filas = await filasDe(usuarioId);
    expect(filas).not.toContain(`${tipoEdiliciaId}:VER_TODOS`);
    expect(filas).not.toContain(`${tipoSoporteId}:VER_TODOS`);
    expect(filas).toContain(`${tipoEdiliciaId}:COMENTAR`);
    const filasTecnico = await filasDe(tecnicoId);
    expect(filasTecnico).toContain(`${tipoEdiliciaId}:ASIGNAR`);
    expect(filasTecnico).toContain(`${tipoEdiliciaId}:OBSERVAR`);

    expect(await listarUsuariosComo('lista-usuario')).toBe(403);
    expect(await listarUsuariosComo('lista-tecnico')).toBe(200);
  });

  describe('volver a dar de alta a una persona desactivada (odd/tasks/defectos-ayuda.md, S1)', () => {
    async function membresiasDe(usuarioId: string) {
      return master.membresia.findMany({
        where: { usuarioId, clienteId },
        select: { activo: true, rol: { select: { codigo: true } } },
      });
    }

    async function realta(etiqueta: string, rolCodigo: string) {
      return http('POST', '/usuarios', {
        email: `permtipo-${etiqueta}-${SUFIJO}@test.local`,
        nombre: 'Perm',
        apellido: etiqueta,
        password: PASSWORD,
        rolCodigo,
      });
    }

    it('con el mismo rol la reactiva: 201 y una sola membresía, activa', async () => {
      const usuarioId = await crearUsuarioPorEndpoint('realta-mismo', 'TECNICO');
      expect((await http("DELETE", `/usuarios/${usuarioId}/membresia`)).status).toBe(204);

      const { status, body } = await realta('realta-mismo', 'TECNICO');

      expect(status).toBe(201);
      expect((body as { usuarioId: string }).usuarioId).toBe(usuarioId);
      expect(await membresiasDe(usuarioId)).toEqual([{ activo: true, rol: { codigo: 'TECNICO' } }]);
    });

    it('con otro rol también: 201 y una sola membresía activa con el rol nuevo', async () => {
      // El rol tiene que existir en master: la base de test es compartida y otros specs lo crean y
      // lo borran, así que no se puede dar por sentado.
      await rolId('COLABORADOR');
      const usuarioId = await crearUsuarioPorEndpoint('realta-otro', 'TECNICO');
      expect((await http("DELETE", `/usuarios/${usuarioId}/membresia`)).status).toBe(204);

      const { status, body } = await realta('realta-otro', 'COLABORADOR');

      expect(status, JSON.stringify(body)).toBe(201);
      expect(await membresiasDe(usuarioId)).toEqual([
        { activo: true, rol: { codigo: 'COLABORADOR' } },
      ]);
    });

    it('con la membresía activa sigue rechazando el alta duplicada', async () => {
      await crearUsuarioPorEndpoint('realta-activa', 'TECNICO');

      const { status } = await realta('realta-activa', 'TECNICO');

      expect(status).toBe(409);
    });
  });

  it('PATCH /usuarios/:id/rol sin reaplicarPreset no toca las filas por tipo', async () => {
    const usuarioId = await crearUsuarioPorEndpoint('sinpreset', 'TECNICO');
    const antes = await filasDe(usuarioId);

    const { status } = await http('PATCH', `/usuarios/${usuarioId}/rol`, { rolCodigo: 'USUARIO' });

    expect(status).toBe(200);
    expect(await filasDe(usuarioId)).toEqual(antes);
  });

  /** Celdas de la matriz master del usuario en el cliente del harness, ordenadas. */
  async function celdasDe(usuarioId: string): Promise<string[]> {
    const filas = await master.usuarioClientePermiso.findMany({ where: { usuarioId, clienteId } });
    return filas.map((f) => `${f.modulo}:${f.accion}`).sort();
  }

  // T9b (L50.1-2): TICKETS y EDILICIA:LECTURA|ALTAS|MODIFICACION salen del catálogo. Antes de T9b el
  // PATCH las ignoraba y respondía 200; ahora son celdas inválidas como cualquier otra.
  it.each(['TICKETS:LECTURA', 'EDILICIA:LECTURA', 'EDILICIA:ALTAS', 'EDILICIA:MODIFICACION'])(
    'PATCH /usuarios/:id/permisos con %s → 400 y la matriz no cambia (T9b)',
    async (celda) => {
      const usuarioId = await crearUsuarioPorEndpoint(`patch-${celda.replace(':', '-')}`, 'USUARIO');
      const antes = await celdasDe(usuarioId);

      const { status, body } = await http('PATCH', `/usuarios/${usuarioId}/permisos`, {
        celdas: ['COMPRAS:LECTURA', celda],
      });

      expect(status).toBe(400);
      expect(JSON.stringify(body)).toContain('celdas');
      expect(await celdasDe(usuarioId)).toEqual(antes);
    },
  );

  it('PATCH /usuarios/:id/permisos con EDILICIA:BORRADO reemplaza la matriz completa (T9b)', async () => {
    const usuarioId = await crearUsuarioPorEndpoint('patch-borrado', 'TECNICO');

    const { status, body } = await http('PATCH', `/usuarios/${usuarioId}/permisos`, {
      celdas: ['EDILICIA:BORRADO', 'COMPRAS:LECTURA'],
    });

    expect(status).toBe(200);
    expect(body).toEqual({ usuarioId, celdas: ['EDILICIA:BORRADO', 'COMPRAS:LECTURA'] });
    expect(await celdasDe(usuarioId)).toEqual(['COMPRAS:LECTURA', 'EDILICIA:BORRADO']);
  });

  it('GET /usuarios/:id/permisos publica el catálogo sin TICKETS y con EDILICIA solo BORRADO (T9b)', async () => {
    const usuarioId = await crearUsuarioPorEndpoint('catalogo', 'TECNICO');

    const { status, body } = await http('GET', `/usuarios/${usuarioId}/permisos`);

    expect(status).toBe(200);
    const { catalogo, celdas } = body as {
      catalogo: Record<string, { piso: string[]; extras: string[] }>;
      celdas: string[];
    };
    expect(catalogo).not.toHaveProperty('TICKETS');
    expect(catalogo.EDILICIA).toEqual({ piso: ['BORRADO'], extras: [] });
    expect(celdas.filter((c) => c.startsWith('TICKETS:') || /^EDILICIA:(?!BORRADO)/.test(c))).toEqual(
      [],
    );
  });
});
