/**
 * reglas-asignacion.e2e.spec.ts — e2e real de `ReglasAsignacionController`:
 * HTTP → guards → casos de uso → Prisma REAL (tenant efímero) y master de test real
 * (usuarios, membresías y matriz de permisos sembrados de verdad).
 *
 * `usarLockMasterTest()` porque el spec escribe usuarios y membresías en
 * `soporte_master_test`. Higiene: borra sus filas de master → `app.close()` → `dropDatabase`.
 *
 * Ref spec: reglas-asignacion R1-R5. Ref design: ADR-8, ADR-9.
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
import { ReglasAsignacionModule } from '../../reglas-asignacion.module';
import { TenantScopeMiddleware } from '../../../shared/tenancy/tenant-scope.middleware';
import { PrismaService } from '../../../shared/infrastructure/persistence/prisma.service';
import {
  MasterPrismaClient,
  TenantPrismaClient,
} from '../../../shared/infrastructure/persistence/prisma-clients';
import { PostgresAdminService } from '../../../clientes/infrastructure/postgres-admin.service';
import { TenantMigrationRunnerAdapter } from '../../../clientes/infrastructure/tenant-migration-runner.adapter';
import { PrismaClienteRepository } from '../../../clientes/infrastructure/persistence/prisma/prisma-cliente.repository';
import { PrismaMatrizPermisosRepository } from '../../../auth/infrastructure/persistence/prisma/prisma-matriz-permisos.repository';
import { ClienteEntity } from '../../../clientes/domain/entities/cliente.entity';
import {
  TOKEN_SERVICE,
  ITokenService,
  JwtPayload,
} from '../../../auth/domain/ports/i-token.service';
import { payloadDeTest } from '../../../auth/test-helpers/payload-de-test';
import { usarLockMasterTest } from '../../../testing/lock-master-test';
import type { ReglasAsignacionVista } from '../../application/use-cases/listar-reglas-asignacion.use-case';
import type { ReglaAsignacionFila } from '../../domain/estado-regla-asignacion';

const MASTER_URL =
  process.env.DATABASE_URL_MASTER ??
  'postgresql://soporte:soporte@localhost:5432/soporte_master_test';

const SUFIJO = randomBytes(4).toString('hex');
const DB_NAME = `soporte_prov_reglasE2E_${SUFIJO}_test`;

type Headers = Record<string, string>;

async function http<T>(
  method: 'GET' | 'PUT',
  url: string,
  headers: Headers,
  body?: unknown,
): Promise<{ status: number; data: T }> {
  const res = await fetch(url, {
    method,
    headers: { Accept: 'application/json', 'Content-Type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = (await res.json().catch(() => null)) as T;
  return { status: res.status, data };
}

function bearer(token: string): Headers {
  return { Authorization: `Bearer ${token}` };
}

@Module({ imports: [SharedModule, ReglasAsignacionModule] })
class TestHarnessModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(TenantScopeMiddleware).forRoutes('*');
  }
}

// Turno exclusivo sobre la master de test compartida — ver src/testing/lock-master-test.ts.
usarLockMasterTest();

describe('ReglasAsignacionController e2e', () => {
  let app: INestApplication;
  let baseUrl: string;
  let prismaService: PrismaService;
  let masterClient: InstanceType<typeof MasterPrismaClient>;
  let tenantClient: InstanceType<typeof TenantPrismaClient>;
  let tokenService: ITokenService;
  let permisosRepo: PrismaMatrizPermisosRepository;

  const admin = new PostgresAdminService(MASTER_URL);

  let cliente: ClienteEntity;
  const usuarioIds: string[] = [];
  const rolIds: Record<string, string> = {};

  let tipoEquiposId: string;
  let tecnicoId: string;
  let colaboradorId: string;
  let administradorUsuarioId: string;
  let tecnicoSinModuloId: string;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL_MASTER) {
      process.env.DATABASE_URL_MASTER = MASTER_URL;
    }
    await admin.createDatabase(DB_NAME);
    await new TenantMigrationRunnerAdapter(MASTER_URL).run(DB_NAME);

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
    masterClient = prismaService.getMasterClient();
    tenantClient = prismaService.getTenantClient(DB_NAME);
    tokenService = moduleRef.get(TOKEN_SERVICE);
    permisosRepo = new PrismaMatrizPermisosRepository(prismaService);

    cliente = ClienteEntity.create({
      nombre: `E2E Reglas ${SUFIJO}`,
      razonSocial: null,
      cuit: null,
      dbName: DB_NAME,
      activo: true,
    });
    await new PrismaClienteRepository(prismaService).save(cliente);

    for (const codigo of ['TECNICO', 'COLABORADOR', 'ADMINISTRADOR']) {
      const rol = await masterClient.role.upsert({
        where: { codigo },
        update: {},
        create: { codigo, nombre: codigo },
      });
      rolIds[codigo] = rol.id;
    }

    tecnicoId = await sembrarUsuario('TECNICO', 'Tecnico', ['EQUIPOS:LECTURA']);
    colaboradorId = await sembrarUsuario('COLABORADOR', 'Colaborador', ['EQUIPOS:LECTURA']);
    administradorUsuarioId = await sembrarUsuario('ADMINISTRADOR', 'Admin', ['EQUIPOS:LECTURA']);
    tecnicoSinModuloId = await sembrarUsuario('TECNICO', 'SinModulo', ['TICKETS:LECTURA']);

    tipoEquiposId = (
      await tenantClient.tipoTicket.create({
        data: { codigo: `RE${SUFIJO}`, nombre: 'Tipo equipos', activo: true, modulo: 'EQUIPOS' },
      })
    ).id;
    // Segundo módulo: el GET agrupa los candidatos por cada módulo con tipos activos.
    await tenantClient.tipoTicket.create({
      data: { codigo: `RT${SUFIJO}`, nombre: 'Tipo tickets', activo: true, modulo: 'TICKETS' },
    });
  }, 90_000);

  afterAll(async () => {
    await masterClient.usuarioClientePermiso
      .deleteMany({ where: { usuarioId: { in: usuarioIds } } })
      .catch(() => undefined);
    await masterClient.membresia
      .deleteMany({ where: { usuarioId: { in: usuarioIds } } })
      .catch(() => undefined);
    await masterClient.usuario
      .deleteMany({ where: { id: { in: usuarioIds } } })
      .catch(() => undefined);
    await masterClient.cliente.deleteMany({ where: { id: cliente.id } }).catch(() => undefined);
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
    await admin.dropDatabase(DB_NAME);
  }, 60_000);

  async function sembrarUsuario(
    rol: string,
    nombre: string,
    celdas: Parameters<PrismaMatrizPermisosRepository['setPermisos']>[2],
  ): Promise<string> {
    const usuario = await masterClient.usuario.create({
      data: {
        email: `e2e_reglas_${nombre}_${SUFIJO}@test.local`,
        nombre,
        apellido: 'Reglas',
        passwordHash: 'no-se-usa',
        activo: true,
      },
    });
    usuarioIds.push(usuario.id);
    await masterClient.membresia.create({
      data: { usuarioId: usuario.id, clienteId: cliente.id, rolId: rolIds[rol], activo: true },
    });
    await permisosRepo.setPermisos(usuario.id, cliente.id, celdas);
    return usuario.id;
  }

  function tokenFor(overrides: Partial<JwtPayload>): string {
    return tokenService.signJwt(
      payloadDeTest({ sub: randomUUID(), cliente_id: cliente.id, ...overrides }),
    );
  }

  const adminToken = () => tokenFor({ rol: 'ADMINISTRADOR' });
  const url = (tipoId?: string) =>
    tipoId ? `${baseUrl}/reglas-asignacion/${tipoId}` : `${baseUrl}/reglas-asignacion`;

  const listar = async () => http<ReglasAsignacionVista>('GET', url(), bearer(adminToken()));
  const filaDe = (vista: ReglasAsignacionVista, tipoId: string) =>
    vista.reglas.find((r) => r.tipoId === tipoId);
  const fijar = (tipoId: string, responsableId: string | null) =>
    http<ReglaAsignacionFila>('PUT', url(tipoId), bearer(adminToken()), { responsableId });

  it('sin token → 401', async () => {
    const res = await http('GET', url(), {});
    expect(res.status).toBe(401);
  });

  it('[CRITICAL] no administrador → 403 en GET y PUT', async () => {
    for (const rol of ['TECNICO', 'COLABORADOR', 'USUARIO']) {
      const token = tokenFor({ rol });
      const get = await http('GET', url(), bearer(token));
      const put = await http('PUT', url(tipoEquiposId), bearer(token), { responsableId: null });
      expect(get.status).toBe(403);
      expect(put.status).toBe(403);
    }
  });

  it('ROOT → GET 200', async () => {
    const res = await http('GET', url(), bearer(tokenFor({ is_global_admin: true })));
    expect(res.status).toBe(200);
  });

  it('GET: tipo sin regla → SIN_REGLA y candidatos solo TECNICO/COLABORADOR con el módulo', async () => {
    const { status, data } = await listar();
    expect(status).toBe(200);
    expect(filaDe(data, tipoEquiposId)).toMatchObject({
      estado: 'SIN_REGLA',
      responsableId: null,
      responsableNombre: null,
    });
    const idsEquipos = data.candidatosPorModulo['EQUIPOS'].map((c) => c.id).sort();
    expect(idsEquipos).toEqual([tecnicoId, colaboradorId].sort());
    expect(idsEquipos).not.toContain(administradorUsuarioId);
    expect(data.candidatosPorModulo['TICKETS'].map((c) => c.id)).toEqual([tecnicoSinModuloId]);
  });

  it('PUT fija, reemplaza y quita la regla; el GET refleja VALIDA', async () => {
    const fijada = await fijar(tipoEquiposId, tecnicoId);
    expect(fijada.status).toBe(200);
    expect(fijada.data).toMatchObject({
      tipoId: tipoEquiposId,
      responsableId: tecnicoId,
      estado: 'VALIDA',
    });
    expect(filaDe((await listar()).data, tipoEquiposId)).toMatchObject({
      estado: 'VALIDA',
      responsableId: tecnicoId,
    });

    const reemplazada = await fijar(tipoEquiposId, colaboradorId);
    expect(reemplazada.status).toBe(200);
    expect(await tenantClient.reglaAsignacion.count({ where: { tipoId: tipoEquiposId } })).toBe(1);
    expect(filaDe((await listar()).data, tipoEquiposId)?.responsableId).toBe(colaboradorId);

    const quitada = await fijar(tipoEquiposId, null);
    expect(quitada.status).toBe(200);
    expect(quitada.data.estado).toBe('SIN_REGLA');
    expect(await tenantClient.reglaAsignacion.count({ where: { tipoId: tipoEquiposId } })).toBe(0);
  });

  it('GET: regla cuyo responsable perdió el módulo del tipo → ROTA con su nombre', async () => {
    expect((await fijar(tipoEquiposId, tecnicoId)).status).toBe(200);
    await permisosRepo.setPermisos(tecnicoId, cliente.id, ['TICKETS:LECTURA']);

    const fila = filaDe((await listar()).data, tipoEquiposId);
    expect(fila).toMatchObject({ estado: 'ROTA', responsableId: tecnicoId });
    expect(fila?.responsableNombre).toContain('Tecnico');

    await permisosRepo.setPermisos(tecnicoId, cliente.id, ['EQUIPOS:LECTURA']);
    expect((await fijar(tipoEquiposId, null)).status).toBe(200);
  });

  it('GET: regla cuyo responsable perdió la membresía activa → ROTA', async () => {
    expect((await fijar(tipoEquiposId, colaboradorId)).status).toBe(200);
    await masterClient.membresia.updateMany({
      where: { usuarioId: colaboradorId },
      data: { activo: false },
    });

    expect(filaDe((await listar()).data, tipoEquiposId)?.estado).toBe('ROTA');

    await masterClient.membresia.updateMany({
      where: { usuarioId: colaboradorId },
      data: { activo: true },
    });
    expect((await fijar(tipoEquiposId, null)).status).toBe(200);
  });

  it('PUT ignora un clienteId enviado en el body: la regla se evalúa con el del actor', async () => {
    const res = await http<ReglaAsignacionFila>('PUT', url(tipoEquiposId), bearer(adminToken()), {
      responsableId: tecnicoId,
      clienteId: randomUUID(),
    });
    expect(res.status).toBe(200);
    expect(res.data.estado).toBe('VALIDA');
    expect((await fijar(tipoEquiposId, null)).status).toBe(200);
  });

  it('PUT con un tipo inexistente → 404', async () => {
    const res = await fijar(randomUUID(), tecnicoId);
    expect(res.status).toBe(404);
  });

  it('PUT con un tipo dado de baja → 404', async () => {
    const baja = await tenantClient.tipoTicket.create({
      data: { codigo: `RB${SUFIJO}`, nombre: 'Baja', activo: false, modulo: 'EQUIPOS' },
    });
    const res = await fijar(baja.id, tecnicoId);
    expect(res.status).toBe(404);
  });

  it('[CRITICAL] PUT con un responsable no elegible → 422 y la regla anterior queda intacta', async () => {
    expect((await fijar(tipoEquiposId, tecnicoId)).status).toBe(200);

    const inelegibles = [administradorUsuarioId, tecnicoSinModuloId, randomUUID()];
    for (const responsableId of inelegibles) {
      const res = await fijar(tipoEquiposId, responsableId);
      expect(res.status).toBe(422);
    }
    expect(filaDe((await listar()).data, tipoEquiposId)).toMatchObject({
      estado: 'VALIDA',
      responsableId: tecnicoId,
    });
    expect((await fijar(tipoEquiposId, null)).status).toBe(200);
  });

  it('PUT con un body inválido → 400', async () => {
    const noUuid = await http('PUT', url(tipoEquiposId), bearer(adminToken()), {
      responsableId: 'no-es-uuid',
    });
    const sinCampo = await http('PUT', url(tipoEquiposId), bearer(adminToken()), {});
    expect(noUuid.status).toBe(400);
    expect(sinCampo.status).toBe(400);
  });
});
