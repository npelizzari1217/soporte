/**
 * reporte-stock-insumos.e2e.spec.ts — levanta la app REAL (Nest, sin mocks de
 * infraestructura) y pega por HTTP a `GET /insumos/reporte-stock` y a
 * `GET /insumos/reporte-stock/export`. Cubre lo que el unit test del controller
 * no puede:
 *
 * 1. **Los permisos de verdad** (R5): 403 sin `INSUMOS:LECTURA` en las dos rutas
 *    y 200 con SOLO esa celda. El par es lo que prueba que la celda decide.
 * 2. **El orden de las rutas**: `/insumos/reporte-stock` no la captura una ruta
 *    `GET /insumos/:id/...` de `InsumosController`.
 * 3. **El formato del archivo** (R6): Content-Type, Content-Disposition, BOM y `;`.
 * 4. **Los mismos filtros en JSON y CSV** (R3) y el tope de 5000 filas (R6).
 *
 * Tenant efimero; el reporte devuelve TODOS los insumos de la base, asi que
 * cada caso parte de una base sin insumos. Higiene: filas → `app.close()` →
 * `dropDatabase`.
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
import { AuthModule } from '../../../auth/auth.module';
import { InsumosModule } from '../../insumos.module';
import { TenantScopeMiddleware } from '../../../shared/tenancy/tenant-scope.middleware';

import { PrismaService } from '../../../shared/infrastructure/persistence/prisma.service';
import { MasterPrismaClient } from '../../../shared/infrastructure/persistence/prisma-clients';
import { PostgresAdminService } from '../../../clientes/infrastructure/postgres-admin.service';
import { TenantMigrationRunnerAdapter } from '../../../clientes/infrastructure/tenant-migration-runner.adapter';
import { PrismaClienteRepository } from '../../../clientes/infrastructure/persistence/prisma/prisma-cliente.repository';
import { PrismaUsuarioRepository } from '../../../auth/infrastructure/persistence/prisma/prisma-usuario.repository';
import { PrismaMatrizPermisosRepository } from '../../../auth/infrastructure/persistence/prisma/prisma-matriz-permisos.repository';
import { ClienteEntity } from '../../../clientes/domain/entities/cliente.entity';
import { UsuarioEntity } from '../../../auth/domain/entities/usuario.entity';
import { RoleEntity } from '../../../auth/domain/entities/role.entity';
import { Argon2HashProvider } from '../../../auth/infrastructure/argon2-hash.provider';
import { CodigoAccion } from '../../../shared/domain/acciones';
import { ReporteStockResponseDto } from '../dtos/reporte-stock.dto';
import { TOPE_FILAS_EXPORT } from '../../../shared/domain/tope-filas-export';
import { usarLockMasterTest } from '../../../testing/lock-master-test';

const MASTER_TEST_URL =
  process.env.DATABASE_URL_MASTER ??
  'postgresql://soporte:soporte@localhost:5432/soporte_master_test';

const TENANT_DB_NAME = `soporte_prov_repstockE2E_${randomBytes(4).toString('hex')}_test`;
const PLAINTEXT_PASSWORD = 'E2eReporteStockSecret!123';

type Headers = Record<string, string>;

async function httpGet<T = unknown>(
  url: string,
  headers: Headers = {},
): Promise<{ status: number; data: T }> {
  const res = await fetch(url, {
    method: 'GET',
    headers: { Accept: 'application/json', ...headers },
  });
  const data = (await res.json().catch(() => null)) as T;
  return { status: res.status, data };
}

async function httpGetTexto(
  url: string,
  headers: Headers = {},
): Promise<{ status: number; texto: string; bom: boolean; headers: globalThis.Headers }> {
  const res = await fetch(url, { method: 'GET', headers });
  // `res.text()` descarta el BOM al decodificar: se mira en los bytes crudos.
  const bytes = new Uint8Array(await res.arrayBuffer());
  const bom = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
  return { status: res.status, texto: new TextDecoder().decode(bytes), bom, headers: res.headers };
}

async function httpPost<T = unknown>(
  url: string,
  body: unknown,
): Promise<{ status: number; data: T }> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => null)) as T;
  return { status: res.status, data };
}

function bearer(token: string): Headers {
  return { Authorization: `Bearer ${token}` };
}

@Module({
  imports: [SharedModule, AuthModule, InsumosModule],
})
class TestHarnessModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(TenantScopeMiddleware).forRoutes('*');
  }
}

// Turno exclusivo sobre la master de test compartida — ver src/testing/lock-master-test.ts.
usarLockMasterTest();

/** Filas de datos del CSV: sin BOM, sin encabezado, partidas por `;`. */
function filasCsv(texto: string): string[][] {
  const lineas = texto.replace(/^﻿/, '').split('\r\n');
  return lineas.slice(1).map((l) => l.split(';'));
}

describe('Reporte de stock e2e — permisos, formato y filtros', () => {
  let app: INestApplication;
  let baseUrl: string;

  let prismaService: PrismaService;
  let masterClient: InstanceType<typeof MasterPrismaClient>;
  let clienteRepo: PrismaClienteRepository;
  let usuarioRepo: PrismaUsuarioRepository;
  let permisosRepo: PrismaMatrizPermisosRepository;
  let hashProvider: Argon2HashProvider;

  const admin = new PostgresAdminService(MASTER_TEST_URL);

  beforeAll(async () => {
    if (!process.env.DATABASE_URL_MASTER) {
      process.env.DATABASE_URL_MASTER = MASTER_TEST_URL;
    }

    await admin.createDatabase(TENANT_DB_NAME);
    await new TenantMigrationRunnerAdapter(MASTER_TEST_URL).run(TENANT_DB_NAME);

    prismaService = new PrismaService(MASTER_TEST_URL);
    masterClient = prismaService.getMasterClient();
    clienteRepo = new PrismaClienteRepository(prismaService);
    usuarioRepo = new PrismaUsuarioRepository(prismaService);
    permisosRepo = new PrismaMatrizPermisosRepository(prismaService);
    hashProvider = new Argon2HashProvider();

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
    // Orden: filas → app.close() → dropDatabase. Las filas del tenant las
    // limpia `limpiarInsumos` en cada caso; la base se dropea entera.
    try {
      await app?.close();
    } catch (error) {
      console.error('[teardown] app.close() falló, sigo al dropDatabase igual:', error);
    }
    try {
      await prismaService?.onModuleDestroy();
    } catch (error) {
      console.error('[teardown] onModuleDestroy() falló, sigo al dropDatabase igual:', error);
    }
    await admin.dropDatabase(TENANT_DB_NAME);
  }, 60_000);

  beforeEach(async () => {
    await masterClient.$executeRawUnsafe(
      'TRUNCATE TABLE membresias, refresh_tokens, usuario_cliente_permisos, usuarios, clientes, roles RESTART IDENTITY CASCADE',
    );
    await limpiarInsumos();
  });

  /** El reporte lista TODOS los insumos de la base: cada caso arranca sin ninguno. */
  async function limpiarInsumos(): Promise<void> {
    const tenant = prismaService.getTenantClient(TENANT_DB_NAME);
    await tenant.movimientoInsumo.deleteMany({});
    await tenant.insumo.deleteMany({});
  }

  async function crearClienteTenant(): Promise<ClienteEntity> {
    const cliente = ClienteEntity.create({
      nombre: `E2E Reporte ${randomBytes(3).toString('hex')}`,
      razonSocial: null,
      cuit: null,
      dbName: TENANT_DB_NAME,
      activo: true,
    });
    await clienteRepo.save(cliente);
    return cliente;
  }

  async function crearRole(codigo: string): Promise<RoleEntity> {
    const role = RoleEntity.create({ codigo, nombre: codigo, descripcion: null, permisos: [] });
    await masterClient.role.create({
      data: { id: role.id, codigo: role.codigo, nombre: role.nombre },
    });
    return role;
  }

  async function crearUsuario(): Promise<UsuarioEntity> {
    const usuario = UsuarioEntity.create({
      email: `e2e_repstock_${randomBytes(4).toString('hex')}@test.local`,
      nombre: 'E2E',
      apellido: 'Reporte',
      passwordHash: await hashProvider.hash(PLAINTEXT_PASSWORD),
      activo: true,
      isGlobalAdmin: false,
    });
    await usuarioRepo.save(usuario);
    return usuario;
  }

  async function login(email: string): Promise<string> {
    const { data } = await httpPost<{ accessToken: string }>(`${baseUrl}/auth/login`, {
      email,
      password: PLAINTEXT_PASSWORD,
    });
    return data.accessToken;
  }

  /** Actor con EXACTAMENTE las celdas pedidas; el rol RBAC viejo va vacío. */
  async function crearActor(permisos: CodigoAccion[]): Promise<string> {
    const cliente = await crearClienteTenant();
    const role = await crearRole(`ROL_E2E_${randomBytes(3).toString('hex')}`);
    const usuario = await crearUsuario();
    await masterClient.membresia.create({
      data: { usuarioId: usuario.id, clienteId: cliente.id, rolId: role.id, activo: true },
    });
    await permisosRepo.setPermisos(usuario.id, cliente.id, permisos);
    return login(usuario.email);
  }

  /** Fixture: familia + unidad propias del caso (códigos únicos). */
  async function sembrarFamiliaYUnidad(
    esRepuesto: boolean,
    entera = true,
  ): Promise<{ familiaId: string; unidadId: string }> {
    const tenant = prismaService.getTenantClient(TENANT_DB_NAME);
    const marca = randomBytes(4).toString('hex').toUpperCase();
    const familia = await tenant.familiaInsumo.create({
      data: { codigo: `FAM_${marca}`, nombre: `Familia ${marca}`, esRepuesto },
    });
    const unidad = await tenant.unidadMedida.create({
      data: { codigo: `UM_${marca}`, nombre: `Unidad ${marca}`, entera },
    });
    return { familiaId: familia.id, unidadId: unidad.id };
  }

  async function sembrarInsumo(
    codigo: string,
    familiaId: string,
    unidadId: string,
    opciones: { stockMinimo?: number | null; entrada?: number } = {},
  ): Promise<string> {
    const tenant = prismaService.getTenantClient(TENANT_DB_NAME);
    const insumo = await tenant.insumo.create({
      data: {
        codigo,
        nombre: `Insumo ${codigo}`,
        familiaId,
        unidadMedidaId: unidadId,
        stockMinimo: opciones.stockMinimo ?? null,
      },
    });
    if (opciones.entrada !== undefined) {
      await tenant.movimientoInsumo.create({
        data: {
          insumoId: insumo.id,
          tipo: 'ENTRADA',
          condicion: 'NUEVO',
          cantidad: opciones.entrada,
          usuarioId: randomUUID(),
        },
      });
    }
    return insumo.id;
  }

  /** Siembra masiva por SQL: `cantidad` insumos de una sola vez. */
  async function sembrarMasivo(cantidad: number, familiaId: string, unidadId: string) {
    const tenant = prismaService.getTenantClient(TENANT_DB_NAME);
    await tenant.$executeRawUnsafe(
      `INSERT INTO insumos (codigo, nombre, familia_id, unidad_medida_id, updated_at)
       SELECT 'BULK-' || lpad(g::text, 6, '0'), 'Insumo masivo ' || g, $1::uuid, $2::uuid, now()
       FROM generate_series(1, ${Number(cantidad)}) AS g`,
      familiaId,
      unidadId,
    );
  }

  const urlJson = (query = ''): string => `${baseUrl}/insumos/reporte-stock${query}`;
  const urlCsv = (query = ''): string => `${baseUrl}/insumos/reporte-stock/export${query}`;

  describe('Permisos (R5)', () => {
    it('sin JWT las dos rutas responden 401', async () => {
      const json = await httpGet(urlJson());
      const csv = await httpGetTexto(urlCsv());
      expect([json.status, csv.status]).toEqual([401, 401]);
    });

    it('sin INSUMOS:LECTURA ambas responden 403 y la exportación no entrega archivo', async () => {
      const token = await crearActor(['INSUMOS:ALTAS']);
      const { familiaId, unidadId } = await sembrarFamiliaYUnidad(false);
      await sembrarInsumo('SIN-PERMISO', familiaId, unidadId, { entrada: 1 });

      const json = await httpGet(urlJson(), bearer(token));
      const csv = await httpGetTexto(urlCsv(), bearer(token));

      expect(json.status).toBe(403);
      expect(csv.status).toBe(403);
      expect(csv.headers.get('content-disposition')).toBeNull();
      expect(csv.texto).not.toContain('SIN-PERMISO');
    });

    it('con SOLO INSUMOS:LECTURA ambas responden 200 (y /reporte-stock no la captura otra ruta)', async () => {
      const token = await crearActor(['INSUMOS:LECTURA']);
      const { familiaId, unidadId } = await sembrarFamiliaYUnidad(false);
      await sembrarInsumo('CON-PERMISO', familiaId, unidadId, { entrada: 4, stockMinimo: 5 });

      const json = await httpGet<ReporteStockResponseDto>(urlJson(), bearer(token));
      const csv = await httpGetTexto(urlCsv(), bearer(token));

      expect(json.status).toBe(200);
      // Una ruta `/insumos/:id` habría respondido otra cosa (400/404); acá atiende el reporte.
      expect(json.data.filas.map((f) => f.codigo)).toEqual(['CON-PERMISO']);
      expect(csv.status).toBe(200);
      expect(csv.texto).toContain('CON-PERMISO');
    });
  });

  describe('Respuesta JSON (R1)', () => {
    it('lleva generadoEn en ISO y las filas con saldos y estado', async () => {
      const token = await crearActor(['INSUMOS:LECTURA']);
      const { familiaId, unidadId } = await sembrarFamiliaYUnidad(false);
      await sembrarInsumo('R-1', familiaId, unidadId, { entrada: 3, stockMinimo: 5 });

      const antes = Date.now();
      const { status, data } = await httpGet<ReporteStockResponseDto>(urlJson(), bearer(token));

      expect(status).toBe(200);
      expect(new Date(data.generadoEn).toISOString()).toBe(data.generadoEn);
      expect(Math.abs(new Date(data.generadoEn).getTime() - antes)).toBeLessThan(60_000);
      expect(data.filas).toHaveLength(1);
      expect(data.filas[0]).toMatchObject({
        codigo: 'R-1',
        saldos: { NUEVO: 3, USADO: 0, total: 3 },
        stockMinimo: 5,
        estadoReposicion: 'BAJO_MINIMO',
        activo: true,
      });
    });

    it('un familiaId que no es uuid responde 400 en las dos rutas', async () => {
      const token = await crearActor(['INSUMOS:LECTURA']);

      const json = await httpGet(urlJson('?familiaId=no-es-uuid'), bearer(token));
      const csv = await httpGetTexto(urlCsv('?familiaId=no-es-uuid'), bearer(token));

      expect([json.status, csv.status]).toEqual([400, 400]);
    });
  });

  describe('Formato del archivo (R6)', () => {
    it('Content-Type, Content-Disposition, BOM y separador `;`', async () => {
      const token = await crearActor(['INSUMOS:LECTURA']);
      const { familiaId, unidadId } = await sembrarFamiliaYUnidad(false);
      await sembrarInsumo('CSV-1', familiaId, unidadId, { entrada: 2, stockMinimo: 5 });

      const csv = await httpGetTexto(urlCsv(), bearer(token));

      expect(csv.status).toBe(200);
      expect(csv.headers.get('content-type')).toBe('text/csv; charset=utf-8');
      expect(csv.headers.get('content-disposition')).toMatch(
        /^attachment; filename="reporte-stock-insumos-\d{4}-\d{2}-\d{2}\.csv"$/,
      );
      expect(csv.headers.get('access-control-expose-headers')).toContain('Content-Disposition');
      expect(csv.bom).toBe(true);
      expect(csv.texto.split('\r\n')[0]).toContain(';');
      expect(filasCsv(csv.texto)[0][0]).toBe('CSV-1');
    });
  });

  describe('Mismos filtros en JSON y CSV (R3)', () => {
    it('con los cuatro filtros combinados el CSV tiene las mismas filas y el mismo orden', async () => {
      const token = await crearActor(['INSUMOS:LECTURA']);
      const repuestos = await sembrarFamiliaYUnidad(true);
      const consumibles = await sembrarFamiliaYUnidad(false);
      // En la familia objetivo (repuesto): dos bajo mínimo con stock, uno sin stock, uno suficiente.
      await sembrarInsumo('A-BAJO', repuestos.familiaId, repuestos.unidadId, {
        entrada: 1,
        stockMinimo: 5,
      });
      await sembrarInsumo('B-BAJO', repuestos.familiaId, repuestos.unidadId, {
        entrada: 2,
        stockMinimo: 5,
      });
      await sembrarInsumo('C-CERO', repuestos.familiaId, repuestos.unidadId, { stockMinimo: 5 });
      await sembrarInsumo('D-OK', repuestos.familiaId, repuestos.unidadId, {
        entrada: 9,
        stockMinimo: 5,
      });
      // Otra familia: no debe aparecer.
      await sembrarInsumo('Z-OTRA', consumibles.familiaId, consumibles.unidadId, {
        entrada: 1,
        stockMinimo: 5,
      });

      const query = `?familiaId=${repuestos.familiaId}&esRepuesto=true&soloBajoMinimo=true&ocultarSinStock=true`;
      const json = await httpGet<ReporteStockResponseDto>(urlJson(query), bearer(token));
      const csv = await httpGetTexto(urlCsv(query), bearer(token));

      const codigosJson = json.data.filas.map((f) => f.codigo);
      expect(codigosJson).toEqual(['A-BAJO', 'B-BAJO']);
      expect(filasCsv(csv.texto).map((f) => f[0])).toEqual(codigosJson);
    });
  });

  describe('Tope de filas (R6)', () => {
    it('5000 filas responde 200 con el CSV completo; 5001 responde 422 sin CSV parcial', async () => {
      const token = await crearActor(['INSUMOS:LECTURA']);
      const { familiaId, unidadId } = await sembrarFamiliaYUnidad(false);

      await sembrarMasivo(TOPE_FILAS_EXPORT, familiaId, unidadId);
      const justo = await httpGetTexto(urlCsv(), bearer(token));
      expect(justo.status).toBe(200);
      expect(filasCsv(justo.texto)).toHaveLength(TOPE_FILAS_EXPORT);

      // La fila 5001, con codigo propio.
      const tenant = prismaService.getTenantClient(TENANT_DB_NAME);
      await tenant.insumo.create({
        data: { codigo: 'BULK-EXTRA', nombre: 'Extra', familiaId, unidadMedidaId: unidadId },
      });

      const excedido = await httpGetTexto(urlCsv(), bearer(token));
      expect(excedido.status).toBe(422);
      expect(excedido.headers.get('content-disposition')).toBeNull();
      expect(excedido.texto).not.toContain('BULK-000001');

      // El JSON no tiene tope: el reporte sigue respondiendo.
      const json = await httpGet<ReporteStockResponseDto>(urlJson(), bearer(token));
      expect(json.status).toBe(200);
      expect(json.data.filas).toHaveLength(TOPE_FILAS_EXPORT + 1);
    }, 120_000);
  });

  describe('Ninguna columna de dinero (R4)', () => {
    it('ni el JSON ni el CSV traen claves o columnas de dinero', async () => {
      const token = await crearActor(['INSUMOS:LECTURA']);
      const { familiaId, unidadId } = await sembrarFamiliaYUnidad(false);
      await sembrarInsumo('SIN-PLATA', familiaId, unidadId, { entrada: 1 });

      const json = await httpGet<ReporteStockResponseDto>(urlJson(), bearer(token));
      const csv = await httpGetTexto(urlCsv(), bearer(token));

      const dinero = /monto|costo|precio|moneda|importe|valor/i;
      expect(JSON.stringify(json.data)).not.toMatch(dinero);
      expect(csv.texto.split('\r\n')[0]).not.toMatch(dinero);
    });
  });
});
