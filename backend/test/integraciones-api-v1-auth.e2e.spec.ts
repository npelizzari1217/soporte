/**
 * integraciones-api-v1-auth.e2e.spec.ts — e2e HTTP real de la autenticacion por clave de la API
 * publica (sdd/api-publica, T4: CA3, CA4, CA6, CA8 y el criterio transversal de aislamiento).
 * Un controller de prueba bajo `v1/...` (declarado solo aca) hace eco del actor y del tenant;
 * Postgres real (`soporte_master_test`), tenants efimeros no necesarios: `getTenantClient` es perezoso.
 */
import { randomBytes } from 'node:crypto';
import {
  Get,
  INestApplication,
  MiddlewareConsumer,
  Module,
  NestModule,
  Post,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { SharedModule } from '../src/shared/shared.module';
import { AuthModule } from '../src/auth/auth.module';
import { ApiV1Module } from '../src/integraciones/api-v1.module';
import { ApiV1 } from '../src/integraciones/interface/api-v1.decorator';
import { CurrentUser } from '../src/auth/infrastructure/guards/decorators';
import { RequiereAcciones } from '../src/auth/infrastructure/guards/decorators';
import { JwtPayload } from '../src/auth/domain/ports/i-token.service';
import { PrismaService } from '../src/shared/infrastructure/persistence/prisma.service';
import { MasterPrismaClient } from '../src/shared/infrastructure/persistence/prisma-clients';
import { TenantContext } from '../src/shared/tenancy/tenant-context';
import { TenantScopeMiddleware } from '../src/shared/tenancy/tenant-scope.middleware';
import { usarLockMasterTest } from '../src/testing/lock-master-test';
import { generarClaveApi } from '../src/integraciones/domain/generar-clave-api';

// Turno exclusivo sobre la master de test compartida — ver src/testing/lock-master-test.ts.
usarLockMasterTest();

const LIMITE = 3;

@ApiV1('eco')
class EcoController {
  constructor(private readonly tenantContext: TenantContext) {}

  @Get()
  @RequiereAcciones('TICKETS:LECTURA')
  leer(@CurrentUser() user: JwtPayload) {
    return {
      clienteId: user.cliente_id,
      permisos: user.permisos,
      rol: user.rol,
      tenantBindeado: this.tenantContext.get()?.clienteId ?? null,
      dbName: this.tenantContext.get()?.dbName ?? null,
    };
  }

  @Post()
  @RequiereAcciones('TICKETS:ALTAS')
  crear() {
    return { ok: true };
  }
}

@Module({ imports: [SharedModule, AuthModule, ApiV1Module], controllers: [EcoController] })
class ArneesModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(TenantScopeMiddleware).forRoutes('*');
  }
}

interface Entorno {
  clienteId: string;
  dbName: string;
  usuarioId: string;
  adminId: string;
}

describe('API v1 e2e — autenticacion por clave', () => {
  let app: INestApplication;
  let baseUrl: string;
  let prismaService: PrismaService;
  let master: InstanceType<typeof MasterPrismaClient>;
  let limiteAnterior: string | undefined;

  beforeAll(async () => {
    limiteAnterior = process.env.API_V1_RATE_LIMIT;
    process.env.API_V1_RATE_LIMIT = String(LIMITE);
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [ArneesModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    await app.listen(0);
    const port = (app.getHttpServer() as { address: () => { port: number } }).address().port;
    baseUrl = `http://localhost:${port}`;
    prismaService = moduleRef.get(PrismaService);
    master = prismaService.getMasterClient();
  }, 60_000);

  afterAll(async () => {
    if (limiteAnterior === undefined) delete process.env.API_V1_RATE_LIMIT;
    else process.env.API_V1_RATE_LIMIT = limiteAnterior;
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
    await master.$executeRawUnsafe(
      'TRUNCATE TABLE api_claves, membresias, usuarios, clientes, roles RESTART IDENTITY CASCADE',
    );
    await master.role.create({ data: { codigo: 'USUARIO', nombre: 'Usuario' } });
  });

  /** Cliente con usuario de integracion + membresia y un admin que figura como creador de claves. */
  async function crearEntorno(opciones: { apiHabilitada?: boolean; activo?: boolean } = {}) {
    const sufijo = randomBytes(3).toString('hex');
    const cliente = await master.cliente.create({
      data: {
        nombre: `E2E v1 ${sufijo}`,
        dbName: `soporte_e2e_v1_${sufijo}_test`,
        apiHabilitada: opciones.apiHabilitada ?? true,
        activo: opciones.activo ?? true,
      },
    });
    const usuario = await master.usuario.create({
      data: {
        email: `integracion-${sufijo}@integraciones.invalid`,
        nombre: 'Integracion',
        apellido: 'API',
        passwordHash: 'x',
        esIntegracion: true,
      },
    });
    const rol = await master.role.findUniqueOrThrow({ where: { codigo: 'USUARIO' } });
    await master.membresia.create({
      data: { usuarioId: usuario.id, clienteId: cliente.id, rolId: rol.id },
    });
    const admin = await master.usuario.create({
      data: {
        email: `admin-${sufijo}@e2e.test`,
        nombre: 'Admin',
        apellido: 'E2E',
        passwordHash: 'x',
      },
    });
    const entorno: Entorno = {
      clienteId: cliente.id,
      dbName: cliente.dbName,
      usuarioId: usuario.id,
      adminId: admin.id,
    };
    return entorno;
  }

  async function emitirClave(e: Entorno, permisos: string[], revocada = false) {
    const generada = generarClaveApi();
    const fila = await master.apiClave.create({
      data: {
        clienteId: e.clienteId,
        usuarioId: e.usuarioId,
        nombre: 'ERP',
        prefijo: generada.prefijo,
        hash: generada.hash,
        permisos,
        creadaPorId: e.adminId,
        revocadaAt: revocada ? new Date() : null,
      },
    });
    return { clave: generada.clave, id: fila.id };
  }

  async function llamar(clave?: string, metodo = 'GET') {
    const res = await fetch(`${baseUrl}/v1/eco`, {
      method: metodo,
      headers: clave === undefined ? {} : { 'X-Api-Key': clave },
    });
    return { status: res.status, cuerpo: (await res.json().catch(() => null)) as unknown };
  }

  it('una clave valida entra con el tenant de SU cliente y los permisos de la clave', async () => {
    const a = await crearEntorno();
    const { clave } = await emitirClave(a, ['TICKETS:LECTURA']);

    const { status, cuerpo } = await llamar(clave);

    expect(status).toBe(200);
    expect(cuerpo).toEqual({
      clienteId: a.clienteId,
      permisos: ['TICKETS:LECTURA', 'TICKETS:VER_TODOS'],
      rol: 'USUARIO',
      tenantBindeado: a.clienteId,
      dbName: a.dbName,
    });
  });

  it('una clave del cliente A nunca bindea el tenant del cliente B', async () => {
    const a = await crearEntorno();
    const b = await crearEntorno();
    const claveA = await emitirClave(a, ['TICKETS:LECTURA']);
    const claveB = await emitirClave(b, ['TICKETS:LECTURA']);

    const ra = await llamar(claveA.clave);
    const rb = await llamar(claveB.clave);

    expect(ra.cuerpo).toMatchObject({ clienteId: a.clienteId, dbName: a.dbName });
    expect(rb.cuerpo).toMatchObject({ clienteId: b.clienteId, dbName: b.dbName });
  });

  it('ausente, desconocida, revocada, API deshabilitada y cliente inactivo: el mismo 401', async () => {
    const ok = await crearEntorno();
    const revocada = await emitirClave(ok, ['TICKETS:LECTURA'], true);
    const sinApi = await crearEntorno({ apiHabilitada: false });
    const claveSinApi = await emitirClave(sinApi, ['TICKETS:LECTURA']);
    const inactivo = await crearEntorno({ activo: false });
    const claveInactivo = await emitirClave(inactivo, ['TICKETS:LECTURA']);

    const respuestas = [
      await llamar(),
      await llamar(generarClaveApi().clave),
      await llamar(revocada.clave),
      await llamar(claveSinApi.clave),
      await llamar(claveInactivo.clave),
    ];

    for (const r of respuestas) {
      expect(r.status).toBe(401);
      expect(r.cuerpo).toEqual(respuestas[0].cuerpo);
    }
  });

  it('una clave sin TICKETS:ALTAS recibe 403 en una ruta de alta; con el permiso, pasa', async () => {
    const e = await crearEntorno();
    const soloLectura = await emitirClave(e, ['TICKETS:LECTURA']);
    const conAltas = await emitirClave(e, ['TICKETS:ALTAS']);

    expect((await llamar(soloLectura.clave, 'POST')).status).toBe(403);
    expect((await llamar(conAltas.clave, 'POST')).status).toBe(201);
  });

  it('el ultimo uso queda registrado despues de un pedido', async () => {
    const e = await crearEntorno();
    const { clave, id } = await emitirClave(e, ['TICKETS:LECTURA']);
    expect((await master.apiClave.findUniqueOrThrow({ where: { id } })).ultimoUsoAt).toBeNull();

    await llamar(clave);

    await vi.waitFor(async () => {
      const fila = await master.apiClave.findUniqueOrThrow({ where: { id } });
      expect(fila.ultimoUsoAt).not.toBeNull();
    });
  });

  it('pasado el limite por clave responde 429; otra clave tiene su propio cupo; el 401 no cuenta', async () => {
    const e = await crearEntorno();
    const k1 = await emitirClave(e, ['TICKETS:LECTURA']);
    const k2 = await emitirClave(e, ['TICKETS:LECTURA']);

    for (let i = 0; i < 10; i++) expect((await llamar('sop_desconocida')).status).toBe(401);
    const estados: number[] = [];
    for (let i = 0; i < LIMITE + 1; i++) estados.push((await llamar(k1.clave)).status);

    expect(estados).toEqual([...Array(LIMITE).fill(200), 429]);
    expect((await llamar(k2.clave)).status).toBe(200);
  });

  it('JD-1: el cupo es por clave y lo comparten todas las rutas v1, no uno por ruta', async () => {
    const e = await crearEntorno();
    const k1 = await emitirClave(e, ['TICKETS:LECTURA', 'TICKETS:ALTAS']);
    const k2 = await emitirClave(e, ['TICKETS:LECTURA', 'TICKETS:ALTAS']);

    // Alterna dos handlers distintos (GET y POST) con la misma clave: suman al mismo cupo.
    const estados: number[] = [];
    for (let i = 0; i < LIMITE + 1; i++) {
      estados.push((await llamar(k1.clave, i % 2 === 0 ? 'GET' : 'POST')).status);
    }

    expect(estados).toEqual([200, 201, 200, 429]);
    expect((await llamar(k1.clave, 'POST')).status).toBe(429);
    expect((await llamar(k2.clave, 'POST')).status).toBe(201);
  });
});
