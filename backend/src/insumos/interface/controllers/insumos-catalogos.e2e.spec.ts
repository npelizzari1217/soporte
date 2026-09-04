/**
 * insumos-catalogos.e2e.spec.ts — levanta la app REAL (Nest, sin mocks de
 * infraestructura) y pega por HTTP a `/familias-insumo` y `/unidades-medida`.
 * Cubre lo que ningún unit test puede:
 *
 * 1. El gate por MÉTODO de los dos controllers: los unit tests instancian el
 *    controller a mano y los guards nunca corren. Solo un request HTTP real
 *    con un JWT sin rol ADMINISTRADOR distingue un 403 de un 200.
 * 2. El borde completo: `ValidationPipe` + `@Transform` + normalización de la
 *    capa de aplicación. Que `toner` en minúscula termine como `TONER` en la
 *    respuesta atraviesa las cuatro capas, y ninguna de ellas sola lo prueba.
 *
 * UN SOLO archivo para los dos catálogos, con UN SOLO tenant efímero: el
 * provisioning de una base efímera es lo caro de este spec, y los dos catálogos
 * comparten módulo, guards y forma.
 *
 * Mismo patrón que `sectores.e2e.spec.ts` (provisioning de tenant efímero,
 * fetch nativo, orden app.close() → onModuleDestroy() → dropDatabase).
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
import { ClienteEntity } from '../../../clientes/domain/entities/cliente.entity';
import { UsuarioEntity } from '../../../auth/domain/entities/usuario.entity';
import { RoleEntity } from '../../../auth/domain/entities/role.entity';
import { Argon2HashProvider } from '../../../auth/infrastructure/argon2-hash.provider';
import { FamiliaInsumoResponseDto } from '../dtos/familias-insumo.dto';
import { UnidadMedidaResponseDto } from '../dtos/unidades-medida.dto';
import { usarLockMasterTest } from '../../../testing/lock-master-test';

const MASTER_TEST_URL =
  process.env.DATABASE_URL_MASTER ??
  'postgresql://soporte:soporte@localhost:5432/soporte_master_test';

const TENANT_DB_NAME = `soporte_prov_insumosE2E_${randomBytes(4).toString('hex')}_test`;
const PLAINTEXT_PASSWORD = 'E2eInsumosSecret!123';

type Headers = Record<string, string>;

/** POST con `.json().catch(() => null)`: un body vacío no debe romper el parseo. */
async function httpPost<T = unknown>(
  url: string,
  body: unknown,
  headers: Headers = {},
): Promise<{ status: number; data: T }> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => null)) as T;
  return { status: res.status, data };
}

/** Hermano de `httpPost` para PATCH. */
async function httpPatch<T = unknown>(
  url: string,
  body: unknown,
  headers: Headers = {},
): Promise<{ status: number; data: T }> {
  const res = await fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => null)) as T;
  return { status: res.status, data };
}

/** Hermano de `httpPost` para GET. */
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

describe('Catálogos de insumos e2e — gate por método + borde completo', () => {
  let app: INestApplication;
  let baseUrl: string;

  let prismaService: PrismaService;
  let masterClient: InstanceType<typeof MasterPrismaClient>;
  let clienteRepo: PrismaClienteRepository;
  let usuarioRepo: PrismaUsuarioRepository;
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

  // El cierre se traga el error a propósito para que `dropDatabase` corra
  // igual — si no, un cierre fallido deja una base efímera huérfana. Pero se
  // loguea: tragar en silencio convierte el próximo huérfano en un misterio.
  afterAll(async () => {
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
      'TRUNCATE TABLE membresias, refresh_tokens, usuarios, clientes, roles RESTART IDENTITY CASCADE',
    );
  });

  async function crearClienteTenant(): Promise<ClienteEntity> {
    const cliente = ClienteEntity.create({
      nombre: `E2E Insumos ${randomBytes(3).toString('hex')}`,
      razonSocial: null,
      cuit: null,
      dbName: TENANT_DB_NAME,
      activo: true,
    });
    await clienteRepo.save(cliente);
    return cliente;
  }

  async function createRole(codigo: string): Promise<RoleEntity> {
    const role = RoleEntity.create({ codigo, nombre: codigo, descripcion: null, permisos: [] });
    await masterClient.role.create({
      data: { id: role.id, codigo: role.codigo, nombre: role.nombre },
    });
    return role;
  }

  async function createUsuario(suffix: string): Promise<UsuarioEntity> {
    const usuario = UsuarioEntity.create({
      email: `e2e_insumos_${suffix}@test.local`,
      nombre: 'E2E',
      apellido: 'Insumos',
      passwordHash: await hashProvider.hash(PLAINTEXT_PASSWORD),
      activo: true,
      isGlobalAdmin: false,
    });
    await usuarioRepo.save(usuario);
    return usuario;
  }

  async function login(email: string): Promise<{ accessToken: string }> {
    const { data } = await httpPost<{ accessToken: string }>(`${baseUrl}/auth/login`, {
      email,
      password: PLAINTEXT_PASSWORD,
    });
    return data;
  }

  /**
   * Actor con el rol dado (`'ADMINISTRADOR'` bypassea `AdminClienteGuard`;
   * cualquier otro NO). `clienteIdExistente` permite compartir el MISMO
   * cliente/tenant entre dos actores de un mismo test — `crearClienteTenant()`
   * usa `TENANT_DB_NAME` fijo por archivo, así que una 2ª llamada sin reusar el
   * cliente choca contra el `db_name` UNIQUE.
   */
  async function crearActorConRol(
    rolCodigo: string,
    clienteIdExistente?: string,
  ): Promise<{ accessToken: string; clienteId: string }> {
    const clienteId = clienteIdExistente ?? (await crearClienteTenant()).id;
    const role = await createRole(
      rolCodigo === 'ADMINISTRADOR' ? 'ADMINISTRADOR' : `ROL_E2E_${randomBytes(3).toString('hex')}`,
    );
    const usuario = await createUsuario(randomBytes(3).toString('hex'));
    await masterClient.membresia.create({
      data: { usuarioId: usuario.id, clienteId, rolId: role.id, activo: true },
    });
    const { accessToken } = await login(usuario.email);
    return { accessToken, clienteId };
  }

  describe('Gating de acceso', () => {
    it.each([['familias-insumo'], ['unidades-medida']])(
      'sin JWT → 401 en GET /%s y en POST /%s',
      async (ruta) => {
        const consulta = await httpGet(`${baseUrl}/${ruta}`);
        const comando = await httpPost(`${baseUrl}/${ruta}`, { codigo: 'X', nombre: 'X' });
        expect(consulta.status).toBe(401);
        expect(comando.status).toBe(401);
      },
    );
  });

  describe('Gate por MÉTODO — nunca por clase', () => {
    it.each([
      ['familias-insumo', 'TONER_E2E'],
      ['unidades-medida', 'UN_E2E'],
    ])('POST /%s: actor SIN rol ADMINISTRADOR → 403', async (ruta, codigo) => {
      const actor = await crearActorConRol('USUARIO');

      const { status } = await httpPost(
        `${baseUrl}/${ruta}`,
        { codigo, nombre: 'De prueba' },
        bearer(actor.accessToken),
      );

      expect(status).toBe(403);
    });

    it.each([
      ['familias-insumo', 'PATCH_FAM', 'PATCH_FAM_2'],
      ['unidades-medida', 'PATCH_UM', 'PATCH_UM_2'],
    ])(
      'PATCH /%s/:id y /:id/estado: actor SIN rol ADMINISTRADOR → 403',
      async (ruta, codigo, _otro) => {
        const adminActor = await crearActorConRol('ADMINISTRADOR');
        const creado = await httpPost<{ id: string }>(
          `${baseUrl}/${ruta}`,
          { codigo, nombre: 'De prueba' },
          bearer(adminActor.accessToken),
        );
        expect(creado.status).toBe(201);

        const actor = await crearActorConRol('USUARIO', adminActor.clienteId);

        const editar = await httpPatch(
          `${baseUrl}/${ruta}/${creado.data.id}`,
          { nombre: 'Renombrada' },
          bearer(actor.accessToken),
        );
        const cambiarEstado = await httpPatch(
          `${baseUrl}/${ruta}/${creado.data.id}/estado`,
          { activo: false },
          bearer(actor.accessToken),
        );

        expect(editar.status).toBe(403);
        expect(cambiarEstado.status).toBe(403);
      },
    );

    // El assert es de CONTENIDO y no solo de status: un 200 no prueba lectura
    // abierta si la ruta devuelve el subconjunto de filas equivocado. El actor
    // se crea sobre el MISMO cliente que el admin, así que ver la fila sembrada
    // distingue "leo lo que tengo que leer" de "no me rebotó".
    it.each([
      ['familias-insumo', 'LECTURA_FAM'],
      ['unidades-medida', 'LECTURA_UM'],
    ])('GET /%s: actor SIN rol ADMINISTRADOR → 200 y ve el catálogo', async (ruta, codigo) => {
      const adminActor = await crearActorConRol('ADMINISTRADOR');
      const sembrado = await httpPost<{ id: string; codigo: string }>(
        `${baseUrl}/${ruta}`,
        { codigo, nombre: 'Lectura abierta' },
        bearer(adminActor.accessToken),
      );
      expect(sembrado.status).toBe(201);

      const actor = await crearActorConRol('USUARIO', adminActor.clienteId);

      const { status, data } = await httpGet<Array<{ id: string; codigo: string }>>(
        `${baseUrl}/${ruta}`,
        bearer(actor.accessToken),
      );

      expect(status).toBe(200);
      expect(data.find((fila) => fila.id === sembrado.data.id)?.codigo).toBe(codigo);
    });
  });

  describe('Borde completo — normalización y validación', () => {
    // El `codigo` viaja en minúscula desde el cliente y tiene que llegar en
    // mayúscula a la respuesta. Atraviesa `@Transform` del DTO y la
    // normalización de la capa de aplicación: si alguna de las dos se cae, acá
    // se ve.
    it('POST /familias-insumo normaliza el codigo en minúscula a mayúscula', async () => {
      const adminActor = await crearActorConRol('ADMINISTRADOR');

      const { status, data } = await httpPost<FamiliaInsumoResponseDto>(
        `${baseUrl}/familias-insumo`,
        { codigo: '  cartucho  ', nombre: '  Cartucho  ' },
        bearer(adminActor.accessToken),
      );

      expect(status).toBe(201);
      expect(data.codigo).toBe('CARTUCHO');
      expect(data.nombre).toBe('Cartucho');
    });

    // Un `nombre` de solo espacios cumple el `@MinLength(1)` si nadie lo
    // recorta antes, y se persiste como una unidad sin nombre visible. El
    // recorte tiene que correr ANTES del mínimo de largo para que esto sea 400.
    it('POST /unidades-medida con nombre de solo espacios → 400', async () => {
      const adminActor = await crearActorConRol('ADMINISTRADOR');

      const { status } = await httpPost(
        `${baseUrl}/unidades-medida`,
        { codigo: 'ESPACIOS', nombre: '   ' },
        bearer(adminActor.accessToken),
      );

      expect(status).toBe(400);
    });

    // Sin el `@MaxLength` del DTO y la precondición del dominio, este request
    // llega a Postgres y vuelve como un 500 con un error de driver (22001) que
    // no nombra el campo.
    it('POST /unidades-medida con codigo más largo que la columna → 400, no 500', async () => {
      const adminActor = await crearActorConRol('ADMINISTRADOR');

      const { status } = await httpPost(
        `${baseUrl}/unidades-medida`,
        { codigo: 'A'.repeat(21), nombre: 'Demasiado larga' },
        bearer(adminActor.accessToken),
      );

      expect(status).toBe(400);
    });

    it('POST /familias-insumo con codigo duplicado → 422', async () => {
      const adminActor = await crearActorConRol('ADMINISTRADOR');
      const body = { codigo: 'DUPLICADA', nombre: 'Duplicada' };

      const primera = await httpPost(
        `${baseUrl}/familias-insumo`,
        body,
        bearer(adminActor.accessToken),
      );
      const segunda = await httpPost(
        `${baseUrl}/familias-insumo`,
        body,
        bearer(adminActor.accessToken),
      );

      expect(primera.status).toBe(201);
      expect(segunda.status).toBe(422);
    });

    it('PATCH /unidades-medida/:id con id inexistente → 404', async () => {
      const adminActor = await crearActorConRol('ADMINISTRADOR');

      const { status } = await httpPatch(
        `${baseUrl}/unidades-medida/00000000-0000-4000-8000-000000000000`,
        { nombre: 'X' },
        bearer(adminActor.accessToken),
      );

      expect(status).toBe(404);
    });

    /**
     * Hermano del caso de arriba, y protege algo distinto: aquél usa un UUID
     * BIEN FORMADO que no existe, así que llega a Prisma y vuelve 404. Un id
     * mal formado no es un `@db.Uuid` válido — Postgres lo rechaza con 22P02,
     * que NO está en el mapa cerrado de `PrismaExceptionFilter`, así que sin el
     * `ParseUUIDPipe` el usuario se come un 500 en vez de un error de borde.
     */
    it.each([['familias-insumo'], ['unidades-medida']])(
      'PATCH /%s/:id con id mal formado → 400, nunca 500',
      async (recurso) => {
        const adminActor = await crearActorConRol('ADMINISTRADOR');

        const { status } = await httpPatch(
          `${baseUrl}/${recurso}/no-es-un-uuid`,
          { nombre: 'X' },
          bearer(adminActor.accessToken),
        );

        expect(status).toBe(400);
      },
    );
  });

  describe('Flujo feliz: crear → editar → desactivar → listado lo sigue mostrando → reactivar', () => {
    it.each([
      ['familias-insumo', 'FLUJO_FAM'],
      ['unidades-medida', 'FLUJO_UM'],
    ])('atraviesa la app real de punta a punta en /%s', async (ruta, codigo) => {
      const adminActor = await crearActorConRol('ADMINISTRADOR');

      const crear = await httpPost<FamiliaInsumoResponseDto | UnidadMedidaResponseDto>(
        `${baseUrl}/${ruta}`,
        { codigo, nombre: 'Original' },
        bearer(adminActor.accessToken),
      );
      expect(crear.status).toBe(201);
      const id = crear.data.id;

      const editar = await httpPatch(
        `${baseUrl}/${ruta}/${id}`,
        { nombre: 'Renombrada' },
        bearer(adminActor.accessToken),
      );
      expect(editar.status).toBe(200);

      // Listado previo con el nombre editado: confirma que el PATCH persistió y
      // ancla el estado inicial `activo: true` contra el que se compara la baja
      // de abajo. Sin él, un tenant scope roto o un filtro mal armado —que
      // devolverían `[]` SIEMPRE— no se distinguirían del flujo correcto.
      const listadoActivo = await httpGet<Array<{ id: string; nombre: string; activo: boolean }>>(
        `${baseUrl}/${ruta}`,
        bearer(adminActor.accessToken),
      );
      expect(listadoActivo.data.find((fila) => fila.id === id)?.nombre).toBe('Renombrada');
      expect(listadoActivo.data.find((fila) => fila.id === id)?.activo).toBe(true);

      const desactivar = await httpPatch(
        `${baseUrl}/${ruta}/${id}/estado`,
        { activo: false },
        bearer(adminActor.accessToken),
      );
      expect(desactivar.status).toBe(200);

      // Dar de baja DESHABILITA, no elimina: la fila sigue en el listado con
      // `activo: false`. Es la única pantalla desde la que el administrador
      // consigue el id, así que si desapareciera la reactivación quedaría
      // inalcanzable.
      const listadoTrasBaja = await httpGet<Array<{ id: string; activo: boolean }>>(
        `${baseUrl}/${ruta}`,
        bearer(adminActor.accessToken),
      );
      expect(listadoTrasBaja.data.find((fila) => fila.id === id)?.activo).toBe(false);

      const reactivar = await httpPatch(
        `${baseUrl}/${ruta}/${id}/estado`,
        { activo: true },
        bearer(adminActor.accessToken),
      );
      expect(reactivar.status).toBe(200);

      const listadoTrasReactivar = await httpGet<Array<{ id: string; activo: boolean }>>(
        `${baseUrl}/${ruta}`,
        bearer(adminActor.accessToken),
      );
      expect(listadoTrasReactivar.data.find((fila) => fila.id === id)?.activo).toBe(true);
    });
  });
});
