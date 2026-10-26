/**
 * e2e HTTP de las 4 rutas de configuración de IA por cliente (odd/asistente-ia-ayuda, T1, S4 y S7):
 * GET/PATCH/DELETE `/clientes/:id/ia` y POST `/clientes/:id/ia/probar`.
 *
 * Levanta `SharedModule` + `AsistenteModule` contra `soporte_master_test`, con JWT y guards reales.
 * El único reemplazo es `MODELO_IA`: un proveedor real nunca se llama desde los tests. No trunca:
 * crea clientes propios con sufijo aleatorio y los borra al final.
 */
import { randomBytes } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { SharedModule } from '../../shared/shared.module';
import { PrismaService } from '../../shared/infrastructure/persistence/prisma.service';
import { MasterPrismaClient } from '../../shared/infrastructure/persistence/prisma-clients';
import { AesGcmSecretCipher } from '../../shared/infrastructure/crypto/aes-gcm-secret-cipher';
import { Result } from '../../shared/domain/result';
import { TOKEN_SERVICE, ITokenService } from '../../auth/domain/ports/i-token.service';
import { payloadDeTest } from '../../auth/test-helpers/payload-de-test';
import { usarLockMasterTest } from '../../testing/lock-master-test';
import { AsistenteModule } from '../asistente.module';
import { DestinoIa, URL_IA_POR_DEFECTO } from '../domain/config-ia';
import { FallaModeloIaError, IModeloIa, MODELO_IA, PedidoIa } from '../domain/modelo-ia.port';

const CLAVE_CIFRADO_DE_TEST = 'e'.repeat(64);

/** Proveedor falso que implementa el puerto real; cada test fija su respuesta. */
class ModeloIaFalso implements IModeloIa {
  respuesta: Result<string, FallaModeloIaError> = Result.ok('OK');
  llamadas: DestinoIa[] = [];

  async completar(
    destino: DestinoIa,
    _pedido: PedidoIa,
  ): Promise<Result<string, FallaModeloIaError>> {
    this.llamadas.push(destino);
    return this.respuesta;
  }
}

interface IaRespuesta {
  configurado: boolean;
  url: string | null;
  modelo: string | null;
  verificadoAt: string | null;
  verificacionError: string | null;
}

const BODY = { url: URL_IA_POR_DEFECTO, modelo: 'gemini-2.5-flash', clave: 'AIzaClaveDeTest' };

const RUTAS = [
  { nombre: 'GET /clientes/:id/ia', method: 'GET', path: (id: string) => `/clientes/${id}/ia` },
  {
    nombre: 'PATCH /clientes/:id/ia',
    method: 'PATCH',
    path: (id: string) => `/clientes/${id}/ia`,
    body: BODY,
  },
  {
    nombre: 'DELETE /clientes/:id/ia',
    method: 'DELETE',
    path: (id: string) => `/clientes/${id}/ia`,
  },
  {
    nombre: 'POST /clientes/:id/ia/probar',
    method: 'POST',
    path: (id: string) => `/clientes/${id}/ia/probar`,
  },
];

usarLockMasterTest();

describe('Configuración de IA por cliente — e2e', () => {
  let app: INestApplication;
  let baseUrl: string;
  let prismaService: PrismaService;
  let master: InstanceType<typeof MasterPrismaClient>;
  let tokens: ITokenService;
  let clavePrevia: string | undefined;
  const modelo = new ModeloIaFalso();
  const clientes: string[] = [];

  async function pedir<T = unknown>(
    method: string,
    path: string,
    opts: { body?: unknown; token?: string } = {},
  ): Promise<{ status: number; data: T }> {
    const res = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
    return { status: res.status, data: (await res.json().catch(() => null)) as T };
  }

  const token = (root: boolean): string =>
    tokens.signJwt(
      payloadDeTest({ sub: `e2e-ia-${randomBytes(4).toString('hex')}`, is_global_admin: root }),
    );

  async function crearCliente(): Promise<string> {
    const s = randomBytes(5).toString('hex');
    const c = await master.cliente.create({
      data: { nombre: `E2E IA ${s}`, dbName: `soporte_e2e_ia_${s}_test` },
    });
    clientes.push(c.id);
    return c.id;
  }

  const fila = (clienteId: string) => master.asistenteIaConfig.findUnique({ where: { clienteId } });

  beforeAll(async () => {
    clavePrevia = process.env.EMAIL_CRYPTO_KEY;
    process.env.EMAIL_CRYPTO_KEY = CLAVE_CIFRADO_DE_TEST;
    const moduleRef = await Test.createTestingModule({ imports: [SharedModule, AsistenteModule] })
      .overrideProvider(MODELO_IA)
      .useValue(modelo)
      .compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    await app.listen(0);
    const port = (app.getHttpServer() as { address: () => { port: number } }).address().port;
    baseUrl = `http://localhost:${port}`;
    prismaService = moduleRef.get(PrismaService);
    master = prismaService.getMasterClient();
    tokens = moduleRef.get(TOKEN_SERVICE);
  }, 60_000);

  afterAll(async () => {
    await master?.cliente.deleteMany({ where: { id: { in: clientes } } });
    await app?.close();
    await prismaService?.onModuleDestroy();
    if (clavePrevia === undefined) delete process.env.EMAIL_CRYPTO_KEY;
    else process.env.EMAIL_CRYPTO_KEY = clavePrevia;
  }, 60_000);

  beforeEach(() => {
    modelo.respuesta = Result.ok('OK');
    modelo.llamadas = [];
  });

  describe('autorización con guards reales', () => {
    it.each(RUTAS)('$nombre — sin token → 401 y no escribe nada', async (ruta) => {
      const c = await crearCliente();
      const { status } = await pedir(ruta.method, ruta.path(c), { body: ruta.body });
      expect(status).toBe(401);
      expect(await fila(c)).toBeNull();
      expect(modelo.llamadas).toEqual([]);
    });

    it.each(RUTAS)('$nombre — usuario que no es ROOT → 403 y no escribe nada', async (ruta) => {
      const c = await crearCliente();
      const { status } = await pedir(ruta.method, ruta.path(c), {
        body: ruta.body,
        token: token(false),
      });
      expect(status).toBe(403);
      expect(await fila(c)).toBeNull();
      expect(modelo.llamadas).toEqual([]);
    });
  });

  it('ROOT configura: la clave se guarda cifrada con AAD ia:{id} y no sale en la respuesta', async () => {
    const c = await crearCliente();
    const { status, data } = await pedir<IaRespuesta>('PATCH', `/clientes/${c}/ia`, {
      body: BODY,
      token: token(true),
    });

    expect(status).toBe(200);
    expect(data).toEqual({
      configurado: true,
      url: URL_IA_POR_DEFECTO,
      modelo: 'gemini-2.5-flash',
      verificadoAt: null,
      verificacionError: null,
    });
    expect(JSON.stringify(data)).not.toContain('AIzaClaveDeTest');
    const guardada = await fila(c);
    expect(guardada?.claveCifrada).not.toContain('AIzaClaveDeTest');
    expect(new AesGcmSecretCipher().decrypt(guardada?.claveCifrada ?? '', `ia:${c}`)).toBe(
      'AIzaClaveDeTest',
    );

    const ver = await pedir<IaRespuesta>('GET', `/clientes/${c}/ia`, { token: token(true) });
    expect(ver.data).toEqual(data);
  });

  it('un cliente sin IA se ve como "sin configurar"', async () => {
    const c = await crearCliente();
    const { status, data } = await pedir<IaRespuesta>('GET', `/clientes/${c}/ia`, {
      token: token(true),
    });
    expect(status).toBe(200);
    expect(data.configurado).toBe(false);
  });

  it.each([
    ['URL http', { ...BODY, url: 'http://inseguro.example.com/' }],
    ['clave vacía', { ...BODY, clave: '' }],
    ['modelo vacío', { ...BODY, modelo: '' }],
  ])('PATCH con %s → 400 y no escribe nada', async (_caso, body) => {
    const c = await crearCliente();
    const { status } = await pedir('PATCH', `/clientes/${c}/ia`, { body, token: token(true) });
    expect(status).toBe(400);
    expect(await fila(c)).toBeNull();
  });

  it('PATCH sin clave y sin configuración previa → 400', async () => {
    const c = await crearCliente();
    const { url, modelo: m } = BODY;
    const { status } = await pedir('PATCH', `/clientes/${c}/ia`, {
      body: { url, modelo: m },
      token: token(true),
    });
    expect(status).toBe(400);
    expect(await fila(c)).toBeNull();
  });

  it('probar llama al proveedor con la clave descifrada y registra el éxito', async () => {
    const c = await crearCliente();
    await pedir('PATCH', `/clientes/${c}/ia`, { body: BODY, token: token(true) });

    const { status, data } = await pedir<IaRespuesta>('POST', `/clientes/${c}/ia/probar`, {
      token: token(true),
    });

    expect(status).toBe(200);
    expect(modelo.llamadas).toEqual([
      { url: URL_IA_POR_DEFECTO, modelo: 'gemini-2.5-flash', clave: 'AIzaClaveDeTest' },
    ]);
    expect(data.verificadoAt).not.toBeNull();
    expect(data.verificacionError).toBeNull();
  });

  it('probar sin configuración → 400 sin llamar al proveedor', async () => {
    const c = await crearCliente();
    const { status } = await pedir('POST', `/clientes/${c}/ia/probar`, { token: token(true) });
    expect(status).toBe(400);
    expect(modelo.llamadas).toEqual([]);
  });

  it('DELETE quita la configuración y la clave', async () => {
    const c = await crearCliente();
    await pedir('PATCH', `/clientes/${c}/ia`, { body: BODY, token: token(true) });
    const { status, data } = await pedir<IaRespuesta>('DELETE', `/clientes/${c}/ia`, {
      token: token(true),
    });
    expect(status).toBe(200);
    expect(data.configurado).toBe(false);
    expect(await fila(c)).toBeNull();
  });

  it('un cliente inexistente → 404', async () => {
    const { status } = await pedir('GET', '/clientes/01977a00-0000-7000-8000-00000000ffff/ia', {
      token: token(true),
    });
    expect(status).toBe(404);
  });
});
