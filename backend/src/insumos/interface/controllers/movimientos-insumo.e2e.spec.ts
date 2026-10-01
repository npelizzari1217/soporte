/**
 * movimientos-insumo.e2e.spec.ts — levanta la app REAL (Nest, sin mocks de
 * infraestructura) y pega por HTTP a las cinco rutas de la bitácora de
 * existencias. Cubre lo que ningún unit test puede:
 *
 * 1. **Que los permisos estén separados de verdad.** Los unit tests instancian
 *    el controller a mano y los guards nunca corren: leen la METADATA, no la
 *    decisión. Solo un request real con un JWT que trae `INSUMOS:ALTAS` y NO
 *    trae `INSUMOS:AJUSTAR` distingue un 403 de un 201, y solo el par —403 en
 *    el ajuste, 201 en la entrada, con el MISMO token— prueba que la
 *    separación existe y no que el actor simplemente no puede nada.
 * 2. **Que los topes del borde devuelvan 400 y no 500.** El tope de la cantidad
 *    y el del motivo van como `throw` en la entidad. Sin el espejo en el DTO,
 *    ese `throw` sale como 500 crudo — la clase 1 de fallo de topes del
 *    `AGENTS.md`—, y eso solo se ve atravesando `ValidationPipe` de verdad.
 * 3. **Que el `usuarioId` salga del JWT.** Un body que pretenda fijarlo tiene
 *    que quedar ignorado, y la firma del asiento tiene que ser la de quien
 *    mandó el request.
 * 4. **Que el listado devuelva el subconjunto de filas correcto.** Un 200 sobre
 *    una ruta con scope no prueba nada por sí solo: los asserts son de
 *    CONTENIDO, con el insumo ajeno realmente presente en la base.
 *
 * Archivo propio y no dentro de `insumos-catalogos.e2e.spec.ts`: aquel prueba
 * el gate por ROL (`AdminClienteGuard`) del ABM del catálogo, y este prueba el
 * gate por CELDA (`AccionesGuard`) de la matriz. Son los dos modelos de
 * autorización del módulo, y mezclarlos en un archivo haría que un actor
 * sembrado para uno se use por descuido en el otro.
 *
 * Mismo patrón de provisioning que `insumos-catalogos.e2e.spec.ts` (tenant
 * efímero, fetch nativo, orden `app.close()` → `onModuleDestroy()` →
 * `dropDatabase`) y mismo sembrado de celdas que `autorizacion.e2e.spec.ts`
 * (`PrismaMatrizPermisosRepository.setPermisos`, con el rol RBAC viejo vacío).
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
import { MOVIMIENTO_INSUMO_MOTIVO_MAX_LENGTH } from '../../domain/entities/movimiento-insumo.entity';
import {
  ListarMovimientosInsumoResponseDto,
  MovimientoInsumoResponseDto,
  StockInsumoResponseDto,
} from '../dtos/movimientos-insumo.dto';
import { usarLockMasterTest } from '../../../testing/lock-master-test';

const MASTER_TEST_URL =
  process.env.DATABASE_URL_MASTER ??
  'postgresql://soporte:soporte@localhost:5432/soporte_master_test';

const TENANT_DB_NAME = `soporte_prov_movinsE2E_${randomBytes(4).toString('hex')}_test`;
const PLAINTEXT_PASSWORD = 'E2eMovimientosSecret!123';

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

/**
 * POST con el body ya escrito como TEXTO, sin pasar por `JSON.stringify`.
 *
 * Existe porque hay entradas que solo se distinguen en el texto del JSON y no
 * sobreviven a un ida y vuelta por un objeto de JavaScript: `1E-7` en mayúscula
 * es el mismo `number` que `1e-7`, así que serializar un objeto nunca produce
 * esa forma. El servidor sí la recibe, porque `JSON.parse` la acepta.
 */
async function httpPostCrudo<T = unknown>(
  url: string,
  bodyCrudo: string,
  headers: Headers = {},
): Promise<{ status: number; data: T }> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: bodyCrudo,
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

/** Sufijo corto y único, para que los códigos del catálogo no choquen entre casos. */
function sufijo(): string {
  return randomBytes(4).toString('hex').toUpperCase();
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

describe('Movimientos de insumo e2e — celdas separadas y topes del borde', () => {
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

  // `usuario_cliente_permisos` NO tiene FK declarada, así que el CASCADE de las
  // otras tablas no la alcanza: va nombrada. La base del TENANT no se trunca —
  // cada caso siembra su propio insumo con un código único, y la base efímera
  // se dropea entera al final.
  beforeEach(async () => {
    await masterClient.$executeRawUnsafe(
      'TRUNCATE TABLE membresias, refresh_tokens, usuario_cliente_permisos, usuarios, clientes, roles RESTART IDENTITY CASCADE',
    );
  });

  async function crearClienteTenant(): Promise<ClienteEntity> {
    const cliente = ClienteEntity.create({
      nombre: `E2E Movimientos ${randomBytes(3).toString('hex')}`,
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
      email: `e2e_movins_${randomBytes(4).toString('hex')}@test.local`,
      nombre: 'E2E',
      apellido: 'Movimientos',
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

  /**
   * Actor con rol `ADMINISTRADOR`, que bypassea tanto `AdminClienteGuard` como
   * `AccionesGuard`. Es el único que puede sembrar el catálogo (familia, unidad
   * e insumo son ABM por ROL, Entrega 1), y crea el cliente/tenant.
   */
  async function crearAdministrador(): Promise<{ token: string; clienteId: string }> {
    const cliente = await crearClienteTenant();
    const role = await crearRole('ADMINISTRADOR');
    const usuario = await crearUsuario();
    await masterClient.membresia.create({
      data: { usuarioId: usuario.id, clienteId: cliente.id, rolId: role.id, activo: true },
    });
    return { token: await login(usuario.email), clienteId: cliente.id };
  }

  /**
   * Actor con EXACTAMENTE las celdas pedidas, en el MISMO cliente que el
   * administrador. El rol RBAC viejo va vacío a propósito: lo que decide es la
   * matriz.
   *
   * `crearClienteTenant()` usa un `TENANT_DB_NAME` fijo por archivo, así que un
   * segundo cliente chocaría contra el `db_name` UNIQUE: por eso los actores
   * restringidos se agregan al cliente que ya existe.
   */
  async function agregarActor(
    clienteId: string,
    permisos: CodigoAccion[],
  ): Promise<{ token: string; usuarioId: string }> {
    const role = await crearRole(`ROL_E2E_${randomBytes(3).toString('hex')}`);
    const usuario = await crearUsuario();
    await masterClient.membresia.create({
      data: { usuarioId: usuario.id, clienteId, rolId: role.id, activo: true },
    });
    await permisosRepo.setPermisos(usuario.id, clienteId, permisos);
    return { token: await login(usuario.email), usuarioId: usuario.id };
  }

  /** Siembra familia + unidad + insumo con el administrador y devuelve el id del insumo. */
  async function sembrarInsumo(
    tokenAdmin: string,
    opciones: { stockMinimo?: number | null; esRepuesto?: boolean } = {},
  ): Promise<string> {
    const marca = sufijo();

    const familia = await httpPost<{ id: string }>(
      `${baseUrl}/familias-insumo`,
      {
        codigo: `FAM_${marca}`,
        nombre: 'Familia de prueba',
        esRepuesto: opciones.esRepuesto ?? false,
      },
      bearer(tokenAdmin),
    );
    expect(familia.status).toBe(201);

    const unidad = await httpPost<{ id: string }>(
      `${baseUrl}/unidades-medida`,
      { codigo: `UM_${marca}`, nombre: 'Unidad de prueba' },
      bearer(tokenAdmin),
    );
    expect(unidad.status).toBe(201);

    const insumo = await httpPost<{ id: string }>(
      `${baseUrl}/insumos`,
      {
        codigo: `INS_${marca}`,
        nombre: 'Tóner de prueba',
        familiaId: familia.data.id,
        unidadMedidaId: unidad.data.id,
        stockMinimo: opciones.stockMinimo ?? null,
      },
      bearer(tokenAdmin),
    );
    expect(insumo.status).toBe(201);

    return insumo.data.id;
  }

  /**
   * Escenario completo: un administrador que siembra el insumo y un actor con
   * las celdas exactas que el caso quiere probar.
   */
  async function prepararEscenario(
    permisos: CodigoAccion[],
    opciones: { stockMinimo?: number | null; esRepuesto?: boolean } = {},
  ): Promise<{ tokenAdmin: string; token: string; usuarioId: string; insumoId: string }> {
    const administrador = await crearAdministrador();
    const insumoId = await sembrarInsumo(administrador.token, opciones);
    const actor = await agregarActor(administrador.clienteId, permisos);
    return {
      tokenAdmin: administrador.token,
      token: actor.token,
      usuarioId: actor.usuarioId,
      insumoId,
    };
  }

  function urlEntrada(insumoId: string): string {
    return `${baseUrl}/insumos/${insumoId}/movimientos/entrada`;
  }
  function urlSalida(insumoId: string): string {
    return `${baseUrl}/insumos/${insumoId}/movimientos/salida`;
  }
  function urlAjuste(insumoId: string): string {
    return `${baseUrl}/insumos/${insumoId}/movimientos/ajuste`;
  }
  function urlStock(insumoId: string): string {
    return `${baseUrl}/insumos/${insumoId}/stock`;
  }
  function urlMovimientos(insumoId: string, query = ''): string {
    return `${baseUrl}/insumos/${insumoId}/movimientos${query}`;
  }

  describe('Sin JWT', () => {
    it('las cinco rutas responden 401', async () => {
      const insumoId = '11111111-1111-4111-8111-111111111111';

      const entrada = await httpPost(urlEntrada(insumoId), { cantidad: 1 });
      const salida = await httpPost(urlSalida(insumoId), { cantidad: 1 });
      const ajuste = await httpPost(urlAjuste(insumoId), {
        tipo: 'AJUSTE_NEGATIVO',
        cantidad: 1,
        motivo: 'X',
      });
      const stock = await httpGet(urlStock(insumoId));
      const movimientos = await httpGet(urlMovimientos(insumoId));

      expect([
        entrada.status,
        salida.status,
        ajuste.status,
        stock.status,
        movimientos.status,
      ]).toEqual([401, 401, 401, 401, 401]);
    });
  });

  describe('Las celdas están separadas de verdad', () => {
    /**
     * EL par que prueba la separación. Con el MISMO token: 201 en la entrada y
     * 403 en el ajuste. Sin el 201, el 403 no probaría nada —un actor sin
     * ningún permiso también da 403—; sin el 403, el 201 no probaría que
     * `AJUSTAR` es una celda aparte.
     */
    it('con ALTAS y sin AJUSTAR: 201 en la entrada y 403 en el ajuste', async () => {
      const escenario = await prepararEscenario(['INSUMOS:ALTAS']);

      const entrada = await httpPost<MovimientoInsumoResponseDto>(
        urlEntrada(escenario.insumoId),
        { cantidad: 5 },
        bearer(escenario.token),
      );
      const ajuste = await httpPost(
        urlAjuste(escenario.insumoId),
        { tipo: 'AJUSTE_NEGATIVO', cantidad: 1, motivo: 'Conteo físico' },
        bearer(escenario.token),
      );

      expect(entrada.status).toBe(201);
      expect(entrada.data.tipo).toBe('ENTRADA');
      expect(entrada.data.cantidad).toBe(5);
      expect(ajuste.status).toBe(403);
    });

    /**
     * El caso hermano con la condición invertida: `AJUSTAR` no arrastra
     * `ALTAS`. Sin este, un guard que devolviera siempre 201 para el ajuste y
     * siempre 403 para la entrada pasaría el test de arriba al revés.
     */
    it('con AJUSTAR y sin ALTAS: 201 en el ajuste y 403 en la entrada', async () => {
      const escenario = await prepararEscenario(['INSUMOS:AJUSTAR']);

      const ajuste = await httpPost<MovimientoInsumoResponseDto>(
        urlAjuste(escenario.insumoId),
        { tipo: 'AJUSTE_POSITIVO', cantidad: 4, motivo: 'Conteo físico del 06/09' },
        bearer(escenario.token),
      );
      const entrada = await httpPost(
        urlEntrada(escenario.insumoId),
        { cantidad: 1 },
        bearer(escenario.token),
      );

      expect(ajuste.status).toBe(201);
      expect(ajuste.data.tipo).toBe('AJUSTE_POSITIVO');
      expect(ajuste.data.motivo).toBe('Conteo físico del 06/09');
      expect(entrada.status).toBe(403);
    });

    it('la salida comparte la celda de la entrada: con ALTAS responde 201', async () => {
      const escenario = await prepararEscenario(['INSUMOS:ALTAS']);
      const entrada = await httpPost(
        urlEntrada(escenario.insumoId),
        { cantidad: 5 },
        bearer(escenario.token),
      );
      expect(entrada.status).toBe(201);

      const salida = await httpPost<MovimientoInsumoResponseDto>(
        urlSalida(escenario.insumoId),
        { cantidad: 2 },
        bearer(escenario.token),
      );

      expect(salida.status).toBe(201);
      expect(salida.data.tipo).toBe('SALIDA');
    });

    /**
     * El stock lleva su propia celda: escribir no habilita leer, y al revés. El
     * assert del caso permitido es de CONTENIDO —el saldo y el estado—, no solo
     * de código: un 200 no prueba nada si devuelve el número equivocado.
     */
    it('el stock exige LECTURA: 403 con ALTAS a secas, 200 y saldo correcto con LECTURA', async () => {
      const escenario = await prepararEscenario(['INSUMOS:ALTAS'], { stockMinimo: 5 });
      const entrada = await httpPost(
        urlEntrada(escenario.insumoId),
        { cantidad: 10 },
        bearer(escenario.token),
      );
      expect(entrada.status).toBe(201);

      const sinLectura = await httpGet(urlStock(escenario.insumoId), bearer(escenario.token));

      const conLectura = await httpGet<StockInsumoResponseDto>(
        urlStock(escenario.insumoId),
        bearer(escenario.tokenAdmin),
      );

      expect(sinLectura.status).toBe(403);
      expect(conLectura.status).toBe(200);
      expect(conLectura.data).toEqual({
        insumoId: escenario.insumoId,
        stock: 10,
        saldos: { NUEVO: 10, USADO: 0 },
        admiteUsado: false,
        stockMinimo: 5,
        estadoReposicion: 'SUFICIENTE',
        seguimiento: 'NINGUNO',
        pendientesDeSerie: 0,
      });
    });
  });

  describe('El usuarioId lo estampa el borde', () => {
    /**
     * El body trae un `usuarioId` de otra persona y el asiento tiene que quedar
     * firmado por quien mandó el request. El fixture SÍ trae el campo: sin él,
     * el assert pasaría por construcción.
     */
    it('ignora el usuarioId del body y firma con el sub del JWT', async () => {
      const escenario = await prepararEscenario(['INSUMOS:ALTAS']);
      const suplantado = '99999999-9999-4999-8999-999999999999';

      const { status, data } = await httpPost<MovimientoInsumoResponseDto>(
        urlEntrada(escenario.insumoId),
        { cantidad: 3, usuarioId: suplantado },
        bearer(escenario.token),
      );

      expect(status).toBe(201);
      expect(data.usuarioId).toBe(escenario.usuarioId);
      expect(data.usuarioId).not.toBe(suplantado);
    });
  });

  describe('Los errores de dominio salen como 4xx, nunca como 500', () => {
    /**
     * La deuda central de esta unidad: `STOCK_INSUFICIENTE` no estaba mapeado
     * en ningún lado, y un `DomainError` sin mapeo sale como 500. El assert
     * incluye el mensaje porque trae los dos números —lo pedido y lo
     * disponible—, que es lo que le permite a quien carga corregir.
     */
    it('el stock insuficiente responde 422 y no 500, con los dos números', async () => {
      const escenario = await prepararEscenario(['INSUMOS:ALTAS']);
      const entrada = await httpPost(
        urlEntrada(escenario.insumoId),
        { cantidad: 2 },
        bearer(escenario.token),
      );
      expect(entrada.status).toBe(201);

      const { status, data } = await httpPost<{ message: string }>(
        urlSalida(escenario.insumoId),
        { cantidad: 5 },
        bearer(escenario.token),
      );

      expect(status).toBe(422);
      expect(data.message).toContain('no tiene stock suficiente');
      expect(data.message).toContain('2 disponibles');
    });

    /**
     * `MOTIVO_AJUSTE_REQUERIDO` es 422 y no 400: la obligatoriedad depende del
     * `tipo` que venga en el mismo body, así que ningún decorador la puede
     * expresar y la regla vive en el dominio.
     */
    it('el ajuste sin motivo responde 422 nombrando el tipo exacto', async () => {
      const escenario = await prepararEscenario(['INSUMOS:AJUSTAR']);

      const { status, data } = await httpPost<{ message: string }>(
        urlAjuste(escenario.insumoId),
        { tipo: 'AJUSTE_NEGATIVO', cantidad: 1, motivo: '   ' },
        bearer(escenario.token),
      );

      expect(status).toBe(422);
      expect(data.message).toContain('AJUSTE_NEGATIVO');
      expect(data.message).toContain('El motivo es obligatorio');
    });

    /**
     * El insumo deshabilitado NO admite ENTRADA, pero SÍ salida y ajuste: es la
     * distinción exacta que el mensaje de `InsumoDeshabilitadoError` explica, y
     * confundirla dejaría el stock atrapado en el depósito. 422 y no 404: la
     * fila existe.
     */
    it('el insumo deshabilitado responde 422 en la entrada y 201 en la salida', async () => {
      const escenario = await prepararEscenario(['INSUMOS:ALTAS']);
      const entradaPrevia = await httpPost(
        urlEntrada(escenario.insumoId),
        { cantidad: 4 },
        bearer(escenario.token),
      );
      expect(entradaPrevia.status).toBe(201);

      const deshabilitado = await fetch(`${baseUrl}/insumos/${escenario.insumoId}/estado`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...bearer(escenario.tokenAdmin) },
        body: JSON.stringify({ activo: false }),
      });
      expect(deshabilitado.status).toBe(200);

      const entrada = await httpPost<{ message: string }>(
        urlEntrada(escenario.insumoId),
        { cantidad: 1 },
        bearer(escenario.token),
      );
      const salida = await httpPost(
        urlSalida(escenario.insumoId),
        { cantidad: 1 },
        bearer(escenario.token),
      );

      expect(entrada.status).toBe(422);
      expect(entrada.data.message).toContain('deshabilitado');
      expect(salida.status).toBe(201);
    });

    it('el insumo inexistente responde 404: es el recurso de la URL', async () => {
      const escenario = await prepararEscenario(['INSUMOS:ALTAS']);
      const inexistente = '01919999-9999-7999-8999-999999999999';

      const { status } = await httpPost(
        urlEntrada(inexistente),
        { cantidad: 1 },
        bearer(escenario.token),
      );

      expect(status).toBe(404);
    });
  });

  describe('Los topes del borde responden 400, no 500', () => {
    /**
     * El caso que motiva el espejo del tope en el DTO:
     * `MOVIMIENTO_INSUMO_MOTIVO_MAX_LENGTH` va como `throw` en la entidad, así
     * que sin el `@MaxLength` importado un motivo de más sale como 500 crudo.
     * El largo se construye desde la constante del dominio.
     */
    it('un motivo de un carácter por encima del tope responde 400 y nombra el campo', async () => {
      const escenario = await prepararEscenario(['INSUMOS:ALTAS']);

      const { status, data } = await httpPost<{ message: string[] }>(
        urlEntrada(escenario.insumoId),
        { cantidad: 1, motivo: 'a'.repeat(MOVIMIENTO_INSUMO_MOTIVO_MAX_LENGTH + 1) },
        bearer(escenario.token),
      );

      expect(status).toBe(400);
      expect(JSON.stringify(data.message)).toContain('motivo');
    });

    it('un motivo del largo máximo exacto responde 201', async () => {
      const escenario = await prepararEscenario(['INSUMOS:ALTAS']);

      const { status, data } = await httpPost<MovimientoInsumoResponseDto>(
        urlEntrada(escenario.insumoId),
        { cantidad: 1, motivo: 'a'.repeat(MOVIMIENTO_INSUMO_MOTIVO_MAX_LENGTH) },
        bearer(escenario.token),
      );

      expect(status).toBe(201);
      expect(data.motivo).toHaveLength(MOVIMIENTO_INSUMO_MOTIVO_MAX_LENGTH);
    });

    /**
     * Postgres redondea el tercer decimal en silencio en un `DECIMAL(10,2)`, y
     * ese redondeo se acumula sobre un saldo que ES la suma de todas las filas.
     * El borde lo rechaza antes.
     */
    it('una cantidad con tres decimales responde 400 y nombra el campo', async () => {
      const escenario = await prepararEscenario(['INSUMOS:ALTAS']);

      const { status, data } = await httpPost<{ message: string[] }>(
        urlEntrada(escenario.insumoId),
        { cantidad: 1.005 },
        bearer(escenario.token),
      );

      expect(status).toBe(400);
      expect(JSON.stringify(data.message)).toContain('cantidad');
    });

    /**
     * `1E-7` son 7 decimales, así que la respuesta correcta es 400 — el mismo
     * 400 que se lleva `1.005`. Lo que este caso agrega es POR DÓNDE se
     * rechaza: un número tan chico se escribe en notación exponencial cuando se
     * lo pasa a texto, y contar sus decimales partiendo por el punto no
     * encuentra ninguno porque no hay punto. Ese conteo vive DENTRO del
     * validador, así que su fallo no sale como un error de validación: sale
     * como una excepción cruda desde adentro del `ValidationPipe`, y el borde
     * responde 500 donde el DTO promete 400.
     *
     * El body va como TEXTO y no como objeto a propósito: la mayúscula de
     * `1E-7` no sobrevive a `JSON.stringify`, y es exactamente la forma que un
     * cliente puede mandar porque `JSON.parse` la acepta.
     */
    it('una cantidad en notación exponencial responde 400 y no 500', async () => {
      const escenario = await prepararEscenario(['INSUMOS:ALTAS']);

      const { status, data } = await httpPostCrudo<{ message: string[] }>(
        urlEntrada(escenario.insumoId),
        '{"cantidad":1E-7}',
        bearer(escenario.token),
      );

      expect(status).toBe(400);
      expect(JSON.stringify(data.message)).toContain('cantidad');
    });

    it('una cantidad en cero responde 400: el signo lo da el tipo', async () => {
      const escenario = await prepararEscenario(['INSUMOS:ALTAS']);

      const { status } = await httpPost(
        urlEntrada(escenario.insumoId),
        { cantidad: 0 },
        bearer(escenario.token),
      );

      expect(status).toBe(400);
    });

    /**
     * Sin `ParseUUIDPipe` el id crudo llega a Prisma contra una columna
     * `@db.Uuid` y el `22P02` de Postgres sale como 500. El actor lleva las DOS
     * celdas de escritura para que el 400 no pueda confundirse con un 403.
     */
    it.each([['entrada'], ['salida'], ['ajuste']])(
      'un id mal formado responde 400 en la ruta de %s',
      async (operacion) => {
        const escenario = await prepararEscenario(['INSUMOS:ALTAS', 'INSUMOS:AJUSTAR']);

        const { status } = await httpPost(
          `${baseUrl}/insumos/no-es-un-uuid/movimientos/${operacion}`,
          { tipo: 'AJUSTE_POSITIVO', cantidad: 1, motivo: 'Conteo físico' },
          bearer(escenario.token),
        );

        expect(status).toBe(400);
      },
    );

    it('un id mal formado responde 400 en la consulta de stock', async () => {
      const escenario = await prepararEscenario(['INSUMOS:LECTURA']);

      const { status } = await httpGet(
        `${baseUrl}/insumos/no-es-un-uuid/stock`,
        bearer(escenario.token),
      );

      expect(status).toBe(400);
    });

    /**
     * El `tipo` del ajuste está acotado a sus dos direcciones, y ese `@IsIn` es
     * parte del gate: si admitiera `ENTRADA`, quien solo tiene `AJUSTAR`
     * registraría la operación cotidiana por esta puerta.
     */
    it('un ajuste con tipo ENTRADA responde 400 y no registra nada', async () => {
      const escenario = await prepararEscenario(['INSUMOS:AJUSTAR', 'INSUMOS:LECTURA']);

      const { status } = await httpPost(
        urlAjuste(escenario.insumoId),
        { tipo: 'ENTRADA', cantidad: 9, motivo: 'Intento de esquivar el gate' },
        bearer(escenario.token),
      );

      const stock = await httpGet<StockInsumoResponseDto>(
        urlStock(escenario.insumoId),
        bearer(escenario.token),
      );

      expect(status).toBe(400);
      expect(stock.data.stock).toBe(0);
    });
  });

  describe('El saldo es la suma de la bitácora', () => {
    /**
     * El recorrido completo por HTTP: entrada, salida y ajuste negativo sobre
     * el mismo insumo, y el saldo que sale de sumarlos. El punto de reposición
     * queda por encima del resultado, así que el estado también cambia — un
     * assert de saldo sin el estado dejaría sin probar la mitad de la ficha.
     */
    it('entrada, salida y ajuste negativo dan el saldo y el estado esperados', async () => {
      const escenario = await prepararEscenario(
        ['INSUMOS:ALTAS', 'INSUMOS:AJUSTAR', 'INSUMOS:LECTURA'],
        { stockMinimo: 5 },
      );

      const entrada = await httpPost(
        urlEntrada(escenario.insumoId),
        { cantidad: 10.5 },
        bearer(escenario.token),
      );
      const salida = await httpPost(
        urlSalida(escenario.insumoId),
        { cantidad: 4 },
        bearer(escenario.token),
      );
      const ajuste = await httpPost(
        urlAjuste(escenario.insumoId),
        { tipo: 'AJUSTE_NEGATIVO', cantidad: 1.5, motivo: 'Conteo físico: faltaban 1,5' },
        bearer(escenario.token),
      );

      expect([entrada.status, salida.status, ajuste.status]).toEqual([201, 201, 201]);

      const { status, data } = await httpGet<StockInsumoResponseDto>(
        urlStock(escenario.insumoId),
        bearer(escenario.token),
      );

      expect(status).toBe(200);
      expect(data.stock).toBe(5);
      expect(data.stockMinimo).toBe(5);
      expect(data.estadoReposicion).toBe('BAJO_MINIMO');
    });

    it('sin punto de reposición el estado es SIN_PUNTO_DEFINIDO y no SUFICIENTE', async () => {
      const escenario = await prepararEscenario(['INSUMOS:ALTAS', 'INSUMOS:LECTURA']);
      const entrada = await httpPost(
        urlEntrada(escenario.insumoId),
        { cantidad: 1 },
        bearer(escenario.token),
      );
      expect(entrada.status).toBe(201);

      const { data } = await httpGet<StockInsumoResponseDto>(
        urlStock(escenario.insumoId),
        bearer(escenario.token),
      );

      expect(data.stockMinimo).toBeNull();
      expect(data.estadoReposicion).toBe('SIN_PUNTO_DEFINIDO');
    });
  });

  describe('GET /insumos/:insumoId/movimientos — la bitácora de la ficha', () => {
    /**
     * Siembra una entrada nacida de una RECEPCIÓN, con su cadena completa:
     * ciclo → compra → ítem → movimiento.
     *
     * Va por el cliente del tenant y no por HTTP porque el único camino de
     * aplicación que estampa `itemCompraId` vive en `ComprasModule`, que este
     * harness no levanta a propósito —mezclarlo traería el gate por rol del ABM
     * de compras a un archivo que prueba el gate por celda—. Es un FIXTURE: lo
     * que el caso verifica es que el dato llegue al cliente por la ruta HTTP
     * real, no cómo se escribió.
     *
     * El ciclo va `activo: false` porque `ciclos_cliente` tiene un único
     * parcial sobre `activo = true`: la base del tenant NO se trunca entre
     * casos, así que un segundo ciclo activo chocaría contra el índice.
     */
    async function sembrarEntradaDeRecepcion(
      insumoId: string,
      usuarioId: string,
    ): Promise<{ movimientoId: string; itemCompraId: string }> {
      const tenant = prismaService.getTenantClient(TENANT_DB_NAME);

      const ciclo = await tenant.cicloCliente.create({
        data: {
          cicloVigenteId: randomUUID(),
          nombre: `Ciclo E2E ${sufijo()}`,
          fechaInicio: new Date('2026-01-01'),
          fechaFin: new Date('2026-12-31'),
          activo: false,
        },
      });
      const compra = await tenant.compra.create({
        data: {
          numero: `E2E-${sufijo()}`,
          fechaSolicitud: new Date('2026-09-07'),
          motivo: 'Compra sembrada por el e2e',
          solicitanteId: usuarioId,
          cicloId: ciclo.id,
        },
      });
      const item = await tenant.itemCompra.create({
        data: {
          compraId: compra.id,
          descripcion: 'Tóner recibido',
          insumoId,
          cantidad: 5,
          proveedor: 'Proveedor de prueba',
          monto: 1000,
          fechaCotizacion: new Date('2026-09-07'),
        },
      });
      const movimiento = await tenant.movimientoInsumo.create({
        data: {
          insumoId,
          tipo: 'ENTRADA',
          cantidad: 5,
          usuarioId,
          itemCompraId: item.id,
        },
      });

      return { movimientoId: movimiento.id, itemCompraId: item.id };
    }

    /**
     * El listado lleva su propia celda `INSUMOS:LECTURA`, igual que el stock:
     * escribir la bitácora no habilita a leerla entera. El caso permitido
     * assertea CONTENIDO —el asiento que se acaba de registrar— y no solo el
     * 200: un código de estado sobre una ruta con scope no prueba nada.
     */
    it('exige LECTURA: 403 con ALTAS a secas, 200 y el asiento sembrado con LECTURA', async () => {
      const escenario = await prepararEscenario(['INSUMOS:ALTAS']);
      const entrada = await httpPost(
        urlEntrada(escenario.insumoId),
        { cantidad: 7 },
        bearer(escenario.token),
      );
      expect(entrada.status).toBe(201);

      const sinLectura = await httpGet(urlMovimientos(escenario.insumoId), bearer(escenario.token));

      const conLectura = await httpGet<ListarMovimientosInsumoResponseDto>(
        urlMovimientos(escenario.insumoId),
        bearer(escenario.tokenAdmin),
      );

      expect(sinLectura.status).toBe(403);
      expect(conLectura.status).toBe(200);
      expect(conLectura.data.items).toHaveLength(1);
      expect(conLectura.data.items[0].tipo).toBe('ENTRADA');
      expect(conLectura.data.items[0].cantidad).toBe(7);
      expect(conLectura.data.items[0].insumoId).toBe(escenario.insumoId);
    });

    /**
     * El scope es por INSUMO, y eso se prueba con el ajeno REALMENTE presente
     * en el fixture: sin el segundo insumo movido, el assert de ausencia
     * pasaría por construcción. Es la forma de verde falso que el `AGENTS.md`
     * describe —el 200 sobre el subconjunto de filas equivocado—.
     */
    it('trae solo los movimientos del insumo pedido, con el ajeno presente en la base', async () => {
      const escenario = await prepararEscenario(['INSUMOS:ALTAS', 'INSUMOS:LECTURA']);
      const otroInsumoId = await sembrarInsumo(escenario.tokenAdmin);

      const propia = await httpPost(
        urlEntrada(escenario.insumoId),
        { cantidad: 3, motivo: 'Del insumo pedido' },
        bearer(escenario.token),
      );
      const ajena = await httpPost(
        urlEntrada(otroInsumoId),
        { cantidad: 99, motivo: 'Del OTRO insumo' },
        bearer(escenario.token),
      );
      expect([propia.status, ajena.status]).toEqual([201, 201]);

      const { status, data } = await httpGet<ListarMovimientosInsumoResponseDto>(
        urlMovimientos(escenario.insumoId),
        bearer(escenario.token),
      );

      expect(status).toBe(200);
      expect(data.total).toBe(1);
      expect(data.items).toHaveLength(1);
      expect(data.items[0].insumoId).toBe(escenario.insumoId);
      expect(data.items.map((item) => item.motivo)).not.toContain('Del OTRO insumo');
      expect(data.items.map((item) => item.insumoId)).not.toContain(otroInsumoId);
    });

    /**
     * El punto de toda la entrega: un asiento nacido de una recepción tiene que
     * distinguirse de una carga manual. La entrada del enganche va SIN motivo a
     * propósito, así que sin `itemCompraId` publicado las dos se ven idénticas.
     * El fixture trae las DOS —la de recepción y una manual—, así que el assert
     * de `null` de la segunda tampoco pasa por construcción.
     */
    it('publica el itemCompraId del asiento nacido de una recepción', async () => {
      const escenario = await prepararEscenario(['INSUMOS:ALTAS', 'INSUMOS:LECTURA']);
      const sembrado = await sembrarEntradaDeRecepcion(escenario.insumoId, escenario.usuarioId);

      const manual = await httpPost(
        urlEntrada(escenario.insumoId),
        { cantidad: 1, motivo: 'Carga manual' },
        bearer(escenario.token),
      );
      expect(manual.status).toBe(201);

      const { status, data } = await httpGet<ListarMovimientosInsumoResponseDto>(
        urlMovimientos(escenario.insumoId),
        bearer(escenario.token),
      );

      expect(status).toBe(200);
      const deRecepcion = data.items.find((item) => item.id === sembrado.movimientoId);
      const deCargaManual = data.items.find((item) => item.motivo === 'Carga manual');

      expect(deRecepcion?.itemCompraId).toBe(sembrado.itemCompraId);
      expect(deCargaManual?.itemCompraId).toBeNull();
    });

    /**
     * El orden lo fija la persistencia (`createdAt DESC, id DESC`) y tiene que
     * llegar intacto al cliente: el más reciente primero. Sin este caso, un
     * mapper que reordenara —o un `take` negativo que invirtiera la consulta—
     * pasaría en verde con la misma cantidad de filas.
     */
    it('entrega el más reciente primero', async () => {
      const escenario = await prepararEscenario(['INSUMOS:ALTAS', 'INSUMOS:LECTURA']);

      const primera = await httpPost(
        urlEntrada(escenario.insumoId),
        { cantidad: 10, motivo: 'Primera' },
        bearer(escenario.token),
      );
      const segunda = await httpPost(
        urlSalida(escenario.insumoId),
        { cantidad: 2, motivo: 'Segunda' },
        bearer(escenario.token),
      );
      const tercera = await httpPost(
        urlSalida(escenario.insumoId),
        { cantidad: 3, motivo: 'Tercera' },
        bearer(escenario.token),
      );
      expect([primera.status, segunda.status, tercera.status]).toEqual([201, 201, 201]);

      const { data } = await httpGet<ListarMovimientosInsumoResponseDto>(
        urlMovimientos(escenario.insumoId),
        bearer(escenario.token),
      );

      expect(data.items.map((item) => item.motivo)).toEqual(['Tercera', 'Segunda', 'Primera']);
    });

    /**
     * `total` es el universo completo del insumo y no el tamaño de la página:
     * el fixture siembra MÁS movimientos que el `porPagina` que se pide, si no
     * los dos números coincidirían y el assert no distinguiría nada.
     */
    it('el total es el universo del insumo y no el tamaño de la página', async () => {
      const escenario = await prepararEscenario(['INSUMOS:ALTAS', 'INSUMOS:LECTURA']);

      for (const cantidad of [1, 2, 3]) {
        const registrado = await httpPost(
          urlEntrada(escenario.insumoId),
          { cantidad },
          bearer(escenario.token),
        );
        expect(registrado.status).toBe(201);
      }

      const { status, data } = await httpGet<ListarMovimientosInsumoResponseDto>(
        urlMovimientos(escenario.insumoId, '?porPagina=2'),
        bearer(escenario.token),
      );

      expect(status).toBe(200);
      expect(data.items).toHaveLength(2);
      expect(data.total).toBe(3);
      expect(data.porPagina).toBe(2);
      expect(data.pagina).toBe(1);
    });

    /**
     * EL candado del `take` negativo. Un `porPagina` menor a 1 llega al `take`
     * de Prisma, que INVIERTE el orden: la respuesta serían los movimientos más
     * VIEJOS presentados como los más nuevos, con un 200 de cara limpia. Sin
     * este caso, el `@Min(1)` del DTO es una promesa sin guardia.
     */
    it.each([['porPagina=0'], ['porPagina=-1']])(
      'con %s responde 400 y no un 200 con el orden invertido',
      async (query) => {
        const escenario = await prepararEscenario(['INSUMOS:ALTAS', 'INSUMOS:LECTURA']);
        const entrada = await httpPost(
          urlEntrada(escenario.insumoId),
          { cantidad: 1 },
          bearer(escenario.token),
        );
        expect(entrada.status).toBe(201);

        const { status, data } = await httpGet<{ message: string[] }>(
          urlMovimientos(escenario.insumoId, `?${query}`),
          bearer(escenario.token),
        );

        expect(status).toBe(400);
        expect(JSON.stringify(data.message)).toContain('porPagina');
      },
    );

    /**
     * El candado del `skip` negativo, que es la OTRA falla: el caso de uso
     * traduce la página a `offset: (pagina - 1) * porPagina`, así que una
     * página menor a 1 revienta en Prisma como 500 crudo sin nombrar el campo.
     * Una miente y la otra explota; las dos las ataja el mismo `@Min(1)`.
     */
    it.each([['pagina=0'], ['pagina=-1']])('con %s responde 400 y no 500', async (query) => {
      const escenario = await prepararEscenario(['INSUMOS:LECTURA']);

      const { status, data } = await httpGet<{ message: string[] }>(
        urlMovimientos(escenario.insumoId, `?${query}`),
        bearer(escenario.token),
      );

      expect(status).toBe(400);
      expect(JSON.stringify(data.message)).toContain('pagina');
    });

    it('con porPagina por encima del tope de página responde 400', async () => {
      const escenario = await prepararEscenario(['INSUMOS:LECTURA']);

      const { status, data } = await httpGet<{ message: string[] }>(
        urlMovimientos(escenario.insumoId, '?porPagina=101'),
        bearer(escenario.token),
      );

      expect(status).toBe(400);
      expect(JSON.stringify(data.message)).toContain('porPagina');
    });

    /**
     * Una bitácora vacía y un insumo inexistente son cosas distintas:
     * responder `200 []` para el segundo le afirmaría al usuario que el insumo
     * existe y nunca se movió.
     */
    it('con el insumo inexistente responde 404 y no una lista vacía', async () => {
      const escenario = await prepararEscenario(['INSUMOS:LECTURA']);
      const inexistente = '01919999-9999-7999-8999-999999999999';

      const { status } = await httpGet(urlMovimientos(inexistente), bearer(escenario.token));

      expect(status).toBe(404);
    });

    it('con el insumoId mal formado responde 400', async () => {
      const escenario = await prepararEscenario(['INSUMOS:LECTURA']);

      const { status } = await httpGet(
        `${baseUrl}/insumos/no-es-un-uuid/movimientos`,
        bearer(escenario.token),
      );

      expect(status).toBe(400);
    });
  });
  describe('Condición del stock (NUEVO / USADO)', () => {
    const PERMISOS: CodigoAccion[] = ['INSUMOS:ALTAS', 'INSUMOS:AJUSTAR', 'INSUMOS:LECTURA'];

    it('entrada USADO en un repuesto: sube el saldo USADO y el listado informa la condición', async () => {
      const e = await prepararEscenario(PERMISOS, { esRepuesto: true });

      const entrada = await httpPost<MovimientoInsumoResponseDto>(
        urlEntrada(e.insumoId),
        { cantidad: 5, condicion: 'USADO' },
        bearer(e.token),
      );
      const stock = await httpGet<StockInsumoResponseDto>(urlStock(e.insumoId), bearer(e.token));
      const lista = await httpGet<ListarMovimientosInsumoResponseDto>(
        urlMovimientos(e.insumoId),
        bearer(e.token),
      );

      expect(entrada.status).toBe(201);
      expect(entrada.data.condicion).toBe('USADO');
      expect(stock.data.saldos).toEqual({ NUEVO: 0, USADO: 5 });
      expect(stock.data.stock).toBe(5);
      expect(stock.data.admiteUsado).toBe(true);
      expect(lista.data.items.map((m) => m.condicion)).toEqual(['USADO']);
    });

    it('sin condición la entrada es NUEVO', async () => {
      const e = await prepararEscenario(PERMISOS, { esRepuesto: true });

      const entrada = await httpPost<MovimientoInsumoResponseDto>(
        urlEntrada(e.insumoId),
        { cantidad: 2 },
        bearer(e.token),
      );

      expect(entrada.status).toBe(201);
      expect(entrada.data.condicion).toBe('NUEVO');
    });

    it('USADO en un insumo que no es repuesto da 422 en entrada, salida y ajuste', async () => {
      const e = await prepararEscenario(PERMISOS, { esRepuesto: false });

      const entrada = await httpPost(
        urlEntrada(e.insumoId),
        { cantidad: 1, condicion: 'USADO' },
        bearer(e.token),
      );
      const salida = await httpPost(
        urlSalida(e.insumoId),
        { cantidad: 1, condicion: 'USADO' },
        bearer(e.token),
      );
      const ajuste = await httpPost(
        urlAjuste(e.insumoId),
        { tipo: 'AJUSTE_POSITIVO', cantidad: 1, motivo: 'Conteo', condicion: 'USADO' },
        bearer(e.token),
      );
      const stock = await httpGet<StockInsumoResponseDto>(urlStock(e.insumoId), bearer(e.token));

      expect([entrada.status, salida.status, ajuste.status]).toEqual([422, 422, 422]);
      expect(stock.data.admiteUsado).toBe(false);
      expect(stock.data.saldos).toEqual({ NUEVO: 0, USADO: 0 });
    });

    it('una condición fuera del catálogo da 400', async () => {
      const e = await prepararEscenario(PERMISOS, { esRepuesto: true });

      const { status } = await httpPost(
        urlEntrada(e.insumoId),
        { cantidad: 1, condicion: 'REFURBISHED' },
        bearer(e.token),
      );

      expect(status).toBe(400);
    });

    it('salida NUEVO con saldo NUEVO 0 y USADO 5 da stock insuficiente', async () => {
      const e = await prepararEscenario(PERMISOS, { esRepuesto: true });
      await httpPost(urlEntrada(e.insumoId), { cantidad: 5, condicion: 'USADO' }, bearer(e.token));

      const salida = await httpPost(urlSalida(e.insumoId), { cantidad: 1 }, bearer(e.token));
      const stock = await httpGet<StockInsumoResponseDto>(urlStock(e.insumoId), bearer(e.token));

      expect(salida.status).toBe(422);
      expect(stock.data.saldos).toEqual({ NUEVO: 0, USADO: 5 });
    });

    it('GET stock devuelve NUEVO, USADO y el total, y la reposición sigue a NUEVO', async () => {
      const e = await prepararEscenario(PERMISOS, { esRepuesto: true, stockMinimo: 5 });
      await httpPost(urlEntrada(e.insumoId), { cantidad: 2 }, bearer(e.token));
      await httpPost(urlEntrada(e.insumoId), { cantidad: 10, condicion: 'USADO' }, bearer(e.token));

      const stock = await httpGet<StockInsumoResponseDto>(urlStock(e.insumoId), bearer(e.token));

      expect(stock.data.saldos).toEqual({ NUEVO: 2, USADO: 10 });
      expect(stock.data.stock).toBe(12);
      expect(stock.data.estadoReposicion).toBe('BAJO_MINIMO');
    });
  });
});
