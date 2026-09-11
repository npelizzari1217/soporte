/**
 * insumos-catalogos.e2e.spec.ts — levanta la app REAL (Nest, sin mocks de
 * infraestructura) y pega por HTTP a `/familias-insumo`, `/unidades-medida` e
 * `/insumos`. Cubre lo que ningún unit test puede:
 *
 * 1. El gate por MÉTODO de los dos controllers: los unit tests instancian el
 *    controller a mano y los guards nunca corren. Solo un request HTTP real
 *    con un JWT sin rol ADMINISTRADOR distingue un 403 de un 200.
 * 2. El borde completo: `ValidationPipe` + `@Transform` + normalización de la
 *    capa de aplicación. Que `toner` en minúscula termine como `TONER` en la
 *    respuesta atraviesa las cuatro capas, y ninguna de ellas sola lo prueba.
 *
 * UN SOLO archivo para los tres recursos, con UN SOLO tenant efímero: el
 * provisioning de una base efímera es lo caro de este spec, y los tres
 * comparten módulo y guards. `/insumos` va acá y no en un archivo propio
 * justamente porque necesita los otros dos: sin una familia y una unidad
 * vigentes en el mismo tenant no se puede dar de alta ningún insumo.
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
import { InsumoResponseDto } from '../dtos/insumos.dto';
import { ModeloEquipoResponseDto } from '../dtos/modelos-equipo.dto';
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

describe('Insumos e2e — gate por método + borde completo', () => {
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

  describe('Insumos — el agregado con sus códigos alternativos', () => {
    /**
     * Siembra la familia y la unidad que el alta de un insumo necesita, por la
     * API real: son FK con `ON DELETE RESTRICT`, así que sin las dos filas no
     * entra ningún insumo.
     *
     * @param token Access token de un actor con rol ADMINISTRADOR.
     * @param sufijo Sufijo único, para que los códigos no choquen entre tests
     *   (el tenant efímero es UNO SOLO para todo el archivo y las tablas de
     *   catálogo no se truncan entre casos).
     * @returns Los ids de la familia y la unidad recién creadas.
     */
    async function sembrarCatalogos(
      token: string,
      sufijo: string,
    ): Promise<{ familiaId: string; unidadMedidaId: string }> {
      const familia = await httpPost<FamiliaInsumoResponseDto>(
        `${baseUrl}/familias-insumo`,
        { codigo: `FAM_${sufijo}`, nombre: 'Familia de insumos' },
        bearer(token),
      );
      const unidad = await httpPost<UnidadMedidaResponseDto>(
        `${baseUrl}/unidades-medida`,
        { codigo: `UM_${sufijo}`, nombre: 'Unidad de medida' },
        bearer(token),
      );
      expect(familia.status).toBe(201);
      expect(unidad.status).toBe(201);
      return { familiaId: familia.data.id, unidadMedidaId: unidad.data.id };
    }

    /** Sufijo único por caso: el tenant efímero es compartido por todo el archivo. */
    function sufijo(): string {
      return randomBytes(3).toString('hex').toUpperCase();
    }

    it('sin JWT → 401 en GET /insumos y en POST /insumos', async () => {
      const consulta = await httpGet(`${baseUrl}/insumos`);
      const comando = await httpPost(`${baseUrl}/insumos`, { codigo: 'X', nombre: 'X' });

      expect(consulta.status).toBe(401);
      expect(comando.status).toBe(401);
    });

    it('POST y PATCH /insumos: actor SIN rol ADMINISTRADOR → 403', async () => {
      const suf = sufijo();
      const adminActor = await crearActorConRol('ADMINISTRADOR');
      const catalogos = await sembrarCatalogos(adminActor.accessToken, suf);
      const creado = await httpPost<InsumoResponseDto>(
        `${baseUrl}/insumos`,
        { nombre: 'Tóner negro', ...catalogos },
        bearer(adminActor.accessToken),
      );
      expect(creado.status).toBe(201);

      const actor = await crearActorConRol('USUARIO', adminActor.clienteId);

      const alta = await httpPost(
        `${baseUrl}/insumos`,
        { nombre: 'Otro', ...catalogos },
        bearer(actor.accessToken),
      );
      const editar = await httpPatch(
        `${baseUrl}/insumos/${creado.data.id}`,
        { nombre: 'Renombrado' },
        bearer(actor.accessToken),
      );
      const cambiarEstado = await httpPatch(
        `${baseUrl}/insumos/${creado.data.id}/estado`,
        { activo: false },
        bearer(actor.accessToken),
      );

      expect(alta.status).toBe(403);
      expect(editar.status).toBe(403);
      expect(cambiarEstado.status).toBe(403);
    });

    // El assert es de CONTENIDO y no solo de status: un 200 no prueba lectura
    // abierta si la ruta devuelve el subconjunto de filas equivocado.
    it('GET /insumos: actor SIN rol ADMINISTRADOR → 200 y ve el catálogo con sus códigos alternativos', async () => {
      const suf = sufijo();
      const adminActor = await crearActorConRol('ADMINISTRADOR');
      const catalogos = await sembrarCatalogos(adminActor.accessToken, suf);
      const sembrado = await httpPost<InsumoResponseDto>(
        `${baseUrl}/insumos`,
        {
          nombre: 'Lectura abierta',
          ...catalogos,
          codigosAlternativos: [{ codigo: `ALT_${suf}`, fabricante: 'HP' }],
        },
        bearer(adminActor.accessToken),
      );
      expect(sembrado.status).toBe(201);

      const actor = await crearActorConRol('USUARIO', adminActor.clienteId);

      const { status, data } = await httpGet<InsumoResponseDto[]>(
        `${baseUrl}/insumos`,
        bearer(actor.accessToken),
      );

      expect(status).toBe(200);
      const fila = data.find((insumo) => insumo.id === sembrado.data.id);
      // El código lo autogenera el sistema (issue #166): el assert de
      // contenido es contra lo que YA quedó guardado en el alta, no contra un
      // valor que el test haya elegido.
      expect(fila?.codigo).toBe(sembrado.data.codigo);
      expect(fila?.codigosAlternativos).toEqual([
        { id: sembrado.data.codigosAlternativos[0]!.id, codigo: `ALT_${suf}`, fabricante: 'HP' },
      ]);
    });

    /**
     * El nombre y los códigos alternativos se siguen normalizando igual que
     * siempre. El fabricante de solo espacios colapsa a `null`, que es lo que
     * hace utilizable al índice `NULLS NOT DISTINCT`.
     */
    it('POST /insumos normaliza el nombre, el fabricante y colapsa el fabricante vacío a null', async () => {
      const suf = sufijo();
      const adminActor = await crearActorConRol('ADMINISTRADOR');
      const catalogos = await sembrarCatalogos(adminActor.accessToken, suf);

      const { status, data } = await httpPost<InsumoResponseDto>(
        `${baseUrl}/insumos`,
        {
          nombre: '  Tóner negro  ',
          ...catalogos,
          codigosAlternativos: [
            { codigo: `  alt_${suf.toLowerCase()}  `, fabricante: ' hp ' },
            { codigo: `GEN_${suf}`, fabricante: '   ' },
          ],
        },
        bearer(adminActor.accessToken),
      );

      expect(status).toBe(201);
      expect(data.nombre).toBe('Tóner negro');
      const porCodigo = new Map(data.codigosAlternativos.map((c) => [c.codigo, c.fabricante]));
      expect(porCodigo.get(`ALT_${suf}`)).toBe('HP');
      expect(porCodigo.get(`GEN_${suf}`)).toBeNull();
    });

    /**
     * EL BORDE del issue #166, de punta a punta —sin mockear NADA—: un
     * `codigo` en el body de `POST /insumos` atraviesa `ValidationPipe`
     * (`whitelist: true`), que lo descarta en silencio, y el insumo se crea
     * con el código autogenerado (`INS-0001`/`REP-0001` según la familia), NO
     * con el valor que mandó el cliente. INVIERTE el test homónimo de #162
     * ("POST /insumos normaliza el código..."), que ahí sí esperaba ver el
     * valor del cliente reflejado en la respuesta.
     */
    it('POST /insumos ignora el codigo del cliente y autogenera el propio', async () => {
      const suf = sufijo();
      const adminActor = await crearActorConRol('ADMINISTRADOR');
      const catalogos = await sembrarCatalogos(adminActor.accessToken, suf);

      const { status, data } = await httpPost<InsumoResponseDto>(
        `${baseUrl}/insumos`,
        { codigo: `NUNCA_${suf}`, nombre: 'Ignora el codigo del cliente', ...catalogos },
        bearer(adminActor.accessToken),
      );

      expect(status).toBe(201);
      expect(data.codigo).not.toBe(`NUNCA_${suf}`);
      expect(data.codigo).toMatch(/^(INS|REP)-\d{4}$/);
    });

    /**
     * Existir NO es ser elegible: la FK acepta la familia deshabilitada porque
     * su fila está. El hermano invertido —la misma alta contra una familia
     * habilitada— prueba que el rechazo no viene de un guard que rechaza todo.
     */
    it('POST /insumos con familia deshabilitada → 422, y con la habilitada → 201', async () => {
      const suf = sufijo();
      const adminActor = await crearActorConRol('ADMINISTRADOR');
      const vigente = await sembrarCatalogos(adminActor.accessToken, suf);
      const deshabilitada = await httpPost<FamiliaInsumoResponseDto>(
        `${baseUrl}/familias-insumo`,
        { codigo: `FAM_OFF_${suf}`, nombre: 'Familia deshabilitada' },
        bearer(adminActor.accessToken),
      );
      const baja = await httpPatch(
        `${baseUrl}/familias-insumo/${deshabilitada.data.id}/estado`,
        { activo: false },
        bearer(adminActor.accessToken),
      );
      expect(baja.status).toBe(200);

      const conDeshabilitada = await httpPost(
        `${baseUrl}/insumos`,
        {
          nombre: 'Con familia deshabilitada',
          familiaId: deshabilitada.data.id,
          unidadMedidaId: vigente.unidadMedidaId,
        },
        bearer(adminActor.accessToken),
      );
      const conHabilitada = await httpPost(
        `${baseUrl}/insumos`,
        { nombre: 'Con familia habilitada', ...vigente },
        bearer(adminActor.accessToken),
      );

      expect(conDeshabilitada.status).toBe(422);
      expect(conHabilitada.status).toBe(201);
    });

    /**
     * El UNIQUE `(codigo, fabricante)` es GLOBAL al tenant, así que el par ya
     * tomado por OTRO insumo se rechaza en el borde con un 422 y no llega a la
     * base como un 23505 crudo. El hermano invertido —el mismo código con otro
     * fabricante— prueba que el rechazo es sobre el PAR y no sobre el código
     * solo.
     */
    it('POST /insumos con un par (codigo, fabricante) ya tomado → 422; con otro fabricante → 201', async () => {
      const suf = sufijo();
      const adminActor = await crearActorConRol('ADMINISTRADOR');
      const catalogos = await sembrarCatalogos(adminActor.accessToken, suf);
      const primero = await httpPost(
        `${baseUrl}/insumos`,
        {
          nombre: 'Ocupante',
          ...catalogos,
          codigosAlternativos: [{ codigo: `PAR_${suf}`, fabricante: 'HP' }],
        },
        bearer(adminActor.accessToken),
      );
      expect(primero.status).toBe(201);

      const choque = await httpPost(
        `${baseUrl}/insumos`,
        {
          nombre: 'Choca',
          ...catalogos,
          codigosAlternativos: [{ codigo: `PAR_${suf}`, fabricante: 'hp' }],
        },
        bearer(adminActor.accessToken),
      );
      const otroFabricante = await httpPost(
        `${baseUrl}/insumos`,
        {
          nombre: 'Otro fabricante',
          ...catalogos,
          codigosAlternativos: [{ codigo: `PAR_${suf}`, fabricante: 'CANON' }],
        },
        bearer(adminActor.accessToken),
      );

      expect(choque.status).toBe(422);
      expect(otroFabricante.status).toBe(201);
    });

    /** El duplicado DENTRO del mismo payload se resuelve sin tocar la base. */
    it('POST /insumos con el mismo par repetido en el payload → 422', async () => {
      const suf = sufijo();
      const adminActor = await crearActorConRol('ADMINISTRADOR');
      const catalogos = await sembrarCatalogos(adminActor.accessToken, suf);

      const { status } = await httpPost(
        `${baseUrl}/insumos`,
        {
          nombre: 'Payload con repetido',
          ...catalogos,
          codigosAlternativos: [
            { codigo: `REP_${suf}`, fabricante: 'HP' },
            { codigo: `rep_${suf.toLowerCase()}`, fabricante: ' hp ' },
          ],
        },
        bearer(adminActor.accessToken),
      );

      expect(status).toBe(422);
    });

    /**
     * Postgres NO falla ante un tercer decimal en un `DECIMAL(10,2)`: lo
     * REDONDEA en silencio. Sin el guard del borde y el del dominio, el usuario
     * guarda `0.005` y le queda `0.01`, sin ningún error de por medio.
     */
    it('POST /insumos con stockMinimo de tres decimales → 400', async () => {
      const suf = sufijo();
      const adminActor = await crearActorConRol('ADMINISTRADOR');
      const catalogos = await sembrarCatalogos(adminActor.accessToken, suf);

      const { status } = await httpPost(
        `${baseUrl}/insumos`,
        { nombre: 'Tres decimales', ...catalogos, stockMinimo: 0.005 },
        bearer(adminActor.accessToken),
      );

      expect(status).toBe(400);
    });

    it('PATCH /insumos/:id con un UUID bien formado que no existe → 404', async () => {
      const adminActor = await crearActorConRol('ADMINISTRADOR');

      const { status } = await httpPatch(
        `${baseUrl}/insumos/00000000-0000-4000-8000-000000000000`,
        { nombre: 'X' },
        bearer(adminActor.accessToken),
      );

      expect(status).toBe(404);
    });

    /**
     * Hermano del caso de arriba, y protege algo distinto: un id mal formado no
     * es un `@db.Uuid` válido — Postgres lo rechaza con `22P02`, que NO está en
     * el mapa cerrado de `PrismaExceptionFilter`, así que sin el
     * `ParseUUIDPipe` el usuario se come un 500 en vez de un error de borde.
     */
    it('PATCH /insumos/:id con id mal formado → 400, nunca 500', async () => {
      const adminActor = await crearActorConRol('ADMINISTRADOR');

      const { status } = await httpPatch(
        `${baseUrl}/insumos/no-es-un-uuid`,
        { nombre: 'X' },
        bearer(adminActor.accessToken),
      );

      expect(status).toBe(400);
    });

    /**
     * EL GEMELO INVERTIDO que cierra el agujero del WU-3 (issue #166), de
     * punta a punta: un `codigo` distinto en el body de `PATCH /insumos/:id`
     * atraviesa `ValidationPipe` (`whitelist: true`), que lo descarta en
     * silencio ANTES de llegar a `EditarInsumoUseCase`. Sin este test, la
     * garantía sería falsa: el alta podría no aceptar un código a mano y
     * Editar cambiarlo igual treinta segundos después.
     */
    it('PATCH /insumos/:id con un codigo distinto en el body NO cambia el codigo del insumo', async () => {
      const suf = sufijo();
      const adminActor = await crearActorConRol('ADMINISTRADOR');
      const catalogos = await sembrarCatalogos(adminActor.accessToken, suf);

      const crear = await httpPost<InsumoResponseDto>(
        `${baseUrl}/insumos`,
        { nombre: 'Codigo congelado', ...catalogos },
        bearer(adminActor.accessToken),
      );
      expect(crear.status).toBe(201);

      const editar = await httpPatch<InsumoResponseDto>(
        `${baseUrl}/insumos/${crear.data.id}`,
        { codigo: `OTRO_${suf}`, nombre: 'Renombrado' },
        bearer(adminActor.accessToken),
      );

      expect(editar.status).toBe(200);
      expect(editar.data.codigo).toBe(crear.data.codigo);
      expect(editar.data.codigo).not.toBe(`OTRO_${suf}`);
      expect(editar.data.nombre).toBe('Renombrado');
    });

    it('flujo completo: crear → editar la lista de códigos → desactivar → sigue listado → reactivar', async () => {
      const suf = sufijo();
      const adminActor = await crearActorConRol('ADMINISTRADOR');
      const catalogos = await sembrarCatalogos(adminActor.accessToken, suf);

      const crear = await httpPost<InsumoResponseDto>(
        `${baseUrl}/insumos`,
        {
          nombre: 'Original',
          ...catalogos,
          stockMinimo: 10.5,
          codigosAlternativos: [
            { codigo: `QUEDA_${suf}`, fabricante: 'HP' },
            { codigo: `SEVA_${suf}`, fabricante: 'HP' },
          ],
        },
        bearer(adminActor.accessToken),
      );
      expect(crear.status).toBe(201);
      expect(crear.data.stockMinimo).toBe(10.5);
      const id = crear.data.id;
      const idQueQueda = crear.data.codigosAlternativos.find(
        (c) => c.codigo === `QUEDA_${suf}`,
      )!.id;

      // La lista que llega REEMPLAZA a la guardada: el código que no viene es
      // uno que el usuario sacó. El que se queda conserva su id, que es el
      // trabajo que hace la reutilización de la entidad existente.
      const editar = await httpPatch<InsumoResponseDto>(
        `${baseUrl}/insumos/${id}`,
        {
          nombre: 'Renombrado',
          codigosAlternativos: [
            { codigo: `QUEDA_${suf}`, fabricante: 'HP' },
            { codigo: `NUEVO_${suf}`, fabricante: null },
          ],
        },
        bearer(adminActor.accessToken),
      );
      expect(editar.status).toBe(200);
      expect(editar.data.nombre).toBe('Renombrado');
      expect(editar.data.codigosAlternativos.map((c) => c.codigo).sort()).toEqual(
        [`NUEVO_${suf}`, `QUEDA_${suf}`].sort(),
      );
      expect(editar.data.codigosAlternativos.find((c) => c.codigo === `QUEDA_${suf}`)?.id).toBe(
        idQueQueda,
      );

      // Listado previo: confirma que el PATCH persistió y ancla el estado
      // inicial `activo: true` contra el que se compara la baja de abajo.
      const listadoActivo = await httpGet<InsumoResponseDto[]>(
        `${baseUrl}/insumos`,
        bearer(adminActor.accessToken),
      );
      const filaActiva = listadoActivo.data.find((insumo) => insumo.id === id);
      expect(filaActiva?.nombre).toBe('Renombrado');
      expect(filaActiva?.activo).toBe(true);
      expect(filaActiva?.codigosAlternativos).toHaveLength(2);

      const desactivar = await httpPatch(
        `${baseUrl}/insumos/${id}/estado`,
        { activo: false },
        bearer(adminActor.accessToken),
      );
      expect(desactivar.status).toBe(200);

      // Deshabilitar NO elimina ni oculta: la fila sigue en el listado con
      // `activo: false`, que es de donde el administrador saca el id para
      // volver a habilitarla.
      const listadoTrasBaja = await httpGet<InsumoResponseDto[]>(
        `${baseUrl}/insumos`,
        bearer(adminActor.accessToken),
      );
      expect(listadoTrasBaja.data.find((insumo) => insumo.id === id)?.activo).toBe(false);

      const reactivar = await httpPatch(
        `${baseUrl}/insumos/${id}/estado`,
        { activo: true },
        bearer(adminActor.accessToken),
      );
      expect(reactivar.status).toBe(200);

      const listadoTrasReactivar = await httpGet<InsumoResponseDto[]>(
        `${baseUrl}/insumos`,
        bearer(adminActor.accessToken),
      );
      expect(listadoTrasReactivar.data.find((insumo) => insumo.id === id)?.activo).toBe(true);
    });

    describe('Compatibilidad insumo ↔ modelo de equipo', () => {
      /**
       * Siembra un modelo de equipo por la API real: `insumos_modelos_equipo`
       * tiene FK a `modelos_equipo`, así que sin la fila no entra ningún par.
       *
       * @param token Access token de un actor con rol ADMINISTRADOR.
       * @param sufijoModelo Sufijo único, para que el par marca+modelo no choque
       *   con el de otro caso (el tenant efímero es UNO SOLO para todo el archivo).
       * @returns El id del modelo recién creado.
       */
      async function sembrarModelo(token: string, sufijoModelo: string): Promise<string> {
        const modelo = await httpPost<ModeloEquipoResponseDto>(
          `${baseUrl}/modelos-equipo`,
          { marca: 'HP', modelo: `LaserJet ${sufijoModelo}` },
          bearer(token),
        );
        expect(modelo.status).toBe(201);
        return modelo.data.id;
      }

      /**
       * La lectura por el lado del modelo es la que responde "¿qué tóner le va a
       * esta impresora?". El assert es de CONTENIDO Y de AUSENCIA sobre un
       * fixture CARGADO: el segundo insumo existe en el mismo tenant y es
       * compatible con OTRO modelo, así que un handler que devolviera el
       * catálogo entero —o que perdiera el id— se pone rojo acá.
       */
      it('GET /modelos-equipo/:id/insumos: actor SIN rol ADMINISTRADOR → 200 y ve solo los compatibles', async () => {
        const suf = sufijo();
        const adminActor = await crearActorConRol('ADMINISTRADOR');
        const catalogos = await sembrarCatalogos(adminActor.accessToken, suf);
        const modeloBuscado = await sembrarModelo(adminActor.accessToken, `A_${suf}`);
        const otroModelo = await sembrarModelo(adminActor.accessToken, `B_${suf}`);

        const compatible = await httpPost<InsumoResponseDto>(
          `${baseUrl}/insumos`,
          {
            nombre: 'Le sirve al modelo buscado',
            ...catalogos,
            compatibilidad: [{ modeloEquipoId: modeloBuscado, rol: ' negro ' }],
          },
          bearer(adminActor.accessToken),
        );
        const ajeno = await httpPost<InsumoResponseDto>(
          `${baseUrl}/insumos`,
          {
            nombre: 'Le sirve a otro modelo',
            ...catalogos,
            compatibilidad: [{ modeloEquipoId: otroModelo }],
          },
          bearer(adminActor.accessToken),
        );
        expect(compatible.status).toBe(201);
        expect(ajeno.status).toBe(201);

        const actor = await crearActorConRol('USUARIO', adminActor.clienteId);

        const { status, data } = await httpGet<InsumoResponseDto[]>(
          `${baseUrl}/modelos-equipo/${modeloBuscado}/insumos`,
          bearer(actor.accessToken),
        );

        expect(status).toBe(200);
        expect(data.map((insumo) => insumo.id)).toContain(compatible.data.id);
        expect(data.map((insumo) => insumo.id)).not.toContain(ajeno.data.id);
        expect(data.find((insumo) => insumo.id === compatible.data.id)?.compatibilidad).toEqual([
          { modeloEquipoId: modeloBuscado, rol: 'NEGRO' },
        ]);
      });

      /**
       * Un id mal formado no es un `@db.Uuid` válido: Postgres lo rechaza con
       * `22P02`, que NO está en el mapa cerrado de `PrismaExceptionFilter`, así
       * que sin el `ParseUUIDPipe` el usuario se come un 500.
       */
      it('GET /modelos-equipo/:id/insumos con id mal formado → 400, nunca 500', async () => {
        const adminActor = await crearActorConRol('ADMINISTRADOR');

        const { status } = await httpGet(
          `${baseUrl}/modelos-equipo/no-es-un-uuid/insumos`,
          bearer(adminActor.accessToken),
        );

        expect(status).toBe(400);
      });

      /** Un modelo sin insumos compatibles es una lista vacía, no un 404. */
      it('GET /modelos-equipo/:id/insumos de un modelo sin compatibilidades → 200 y lista vacía', async () => {
        const suf = sufijo();
        const adminActor = await crearActorConRol('ADMINISTRADOR');
        const modeloSolo = await sembrarModelo(adminActor.accessToken, `SOLO_${suf}`);

        const { status, data } = await httpGet<InsumoResponseDto[]>(
          `${baseUrl}/modelos-equipo/${modeloSolo}/insumos`,
          bearer(adminActor.accessToken),
        );

        expect(status).toBe(200);
        expect(data).toEqual([]);
      });

      /**
       * Existir NO es ser elegible: la FK acepta el modelo deshabilitado porque
       * su fila está. El hermano invertido —el mismo alta contra el modelo
       * habilitado— prueba que el rechazo no viene de un guard que rechaza todo.
       */
      it('POST /insumos con modelo deshabilitado → 422, y con el habilitado → 201', async () => {
        const suf = sufijo();
        const adminActor = await crearActorConRol('ADMINISTRADOR');
        const catalogos = await sembrarCatalogos(adminActor.accessToken, suf);
        const vigente = await sembrarModelo(adminActor.accessToken, `ON_${suf}`);
        const apagado = await sembrarModelo(adminActor.accessToken, `OFF_${suf}`);
        const baja = await httpPatch(
          `${baseUrl}/modelos-equipo/${apagado}/estado`,
          { activo: false },
          bearer(adminActor.accessToken),
        );
        expect(baja.status).toBe(200);

        const conDeshabilitado = await httpPost(
          `${baseUrl}/insumos`,
          {
            nombre: 'Con modelo deshabilitado',
            ...catalogos,
            compatibilidad: [{ modeloEquipoId: apagado }],
          },
          bearer(adminActor.accessToken),
        );
        const conHabilitado = await httpPost(
          `${baseUrl}/insumos`,
          {
            nombre: 'Con modelo habilitado',
            ...catalogos,
            compatibilidad: [{ modeloEquipoId: vigente }],
          },
          bearer(adminActor.accessToken),
        );

        expect(conDeshabilitado.status).toBe(422);
        expect(conHabilitado.status).toBe(201);
      });

      /**
       * La PK de `insumos_modelos_equipo` es el par: sin el guard de la capa de
       * aplicación, las dos filas llegan a la escritura anidada y el usuario ve
       * un 500 crudo en lugar de un 422 que nombra el modelo repetido.
       */
      it('POST /insumos con el mismo modelo repetido en el payload → 422, nunca 500', async () => {
        const suf = sufijo();
        const adminActor = await crearActorConRol('ADMINISTRADOR');
        const catalogos = await sembrarCatalogos(adminActor.accessToken, suf);
        const modeloId = await sembrarModelo(adminActor.accessToken, `REP_${suf}`);

        const { status } = await httpPost(
          `${baseUrl}/insumos`,
          {
            nombre: 'Modelo repetido',
            ...catalogos,
            compatibilidad: [
              { modeloEquipoId: modeloId, rol: 'NEGRO' },
              { modeloEquipoId: modeloId, rol: 'CIAN' },
            ],
          },
          bearer(adminActor.accessToken),
        );

        expect(status).toBe(422);
      });

      /**
       * La lista es PATCH y atraviesa las cuatro capas: `undefined` deja la
       * guardada intacta —editar el nombre no puede desvincular un insumo de sus
       * modelos— y `[]` la vacía. El listado por modelo es el que confirma que
       * la fila realmente se borró de la base, no solo de la respuesta.
       */
      it('PATCH /insumos/:id: el nombre solo no toca la compatibilidad, y la lista vacía la borra', async () => {
        const suf = sufijo();
        const adminActor = await crearActorConRol('ADMINISTRADOR');
        const catalogos = await sembrarCatalogos(adminActor.accessToken, suf);
        const modeloId = await sembrarModelo(adminActor.accessToken, `PATCH_${suf}`);

        const crear = await httpPost<InsumoResponseDto>(
          `${baseUrl}/insumos`,
          {
            nombre: 'Original',
            ...catalogos,
            compatibilidad: [{ modeloEquipoId: modeloId, rol: 'NEGRO' }],
          },
          bearer(adminActor.accessToken),
        );
        expect(crear.status).toBe(201);

        const soloNombre = await httpPatch<InsumoResponseDto>(
          `${baseUrl}/insumos/${crear.data.id}`,
          { nombre: 'Renombrado' },
          bearer(adminActor.accessToken),
        );
        expect(soloNombre.status).toBe(200);
        expect(soloNombre.data.compatibilidad).toEqual([
          { modeloEquipoId: modeloId, rol: 'NEGRO' },
        ]);

        const trasRenombrar = await httpGet<InsumoResponseDto[]>(
          `${baseUrl}/modelos-equipo/${modeloId}/insumos`,
          bearer(adminActor.accessToken),
        );
        expect(trasRenombrar.data.map((insumo) => insumo.id)).toContain(crear.data.id);

        const vaciar = await httpPatch<InsumoResponseDto>(
          `${baseUrl}/insumos/${crear.data.id}`,
          { compatibilidad: [] },
          bearer(adminActor.accessToken),
        );
        expect(vaciar.status).toBe(200);
        expect(vaciar.data.compatibilidad).toEqual([]);

        const trasVaciar = await httpGet<InsumoResponseDto[]>(
          `${baseUrl}/modelos-equipo/${modeloId}/insumos`,
          bearer(adminActor.accessToken),
        );
        expect(trasVaciar.data.map((insumo) => insumo.id)).not.toContain(crear.data.id);
      });
    });
  });
});
