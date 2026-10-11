/**
 * integraciones-api-v1-openapi.e2e.spec.ts — documento OpenAPI de la API publica (api-publica, T6,
 * CA7). Arranca el `AppModule` REAL con el mismo prefijo y la misma funcion de configuracion que
 * `main.ts`, asi que todas las rutas internas existen: el documento tiene que dejarlas afuera.
 * No siembra nada: solo lee `/api/v1/openapi.json`, sin clave.
 */
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { configurarOpenApiV1 } from '../src/integraciones/interface/openapi-v1';
import { usarLockMasterTest } from '../src/testing/lock-master-test';

const MASTER_TEST_URL =
  process.env.DATABASE_URL_MASTER ??
  'postgresql://soporte:soporte@localhost:5432/soporte_master_test';

// El boot del AppModule abre conexiones a la master de test compartida: turno exclusivo.
usarLockMasterTest();

interface OperacionOpenApi {
  parameters?: { name: string; in: string }[];
  security?: Record<string, string[]>[];
  responses: Record<string, unknown>;
}

interface DocumentoOpenApi {
  openapi: string;
  info: { title: string; version: string };
  paths: Record<string, Record<string, OperacionOpenApi>>;
  components: {
    securitySchemes?: Record<string, { type: string; in?: string; name?: string }>;
    schemas?: Record<string, unknown>;
  };
}

describe('API v1 e2e — OpenAPI', () => {
  let app: INestApplication;
  let baseUrl: string;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL_MASTER) {
      process.env.DATABASE_URL_MASTER = MASTER_TEST_URL;
    }
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    configurarOpenApiV1(app);
    await app.init();
    await app.listen(0);
    const port = (app.getHttpServer() as { address: () => { port: number } }).address().port;
    baseUrl = `http://localhost:${port}`;
  }, 90_000);

  afterAll(async () => {
    await app?.close();
  });

  async function leerDocumento(): Promise<{ status: number; doc: DocumentoOpenApi }> {
    const res = await fetch(`${baseUrl}/api/v1/openapi.json`);
    return { status: res.status, doc: (await res.json()) as DocumentoOpenApi };
  }

  it('se sirve sin clave, con 200 y JSON', async () => {
    const res = await fetch(`${baseUrl}/api/v1/openapi.json`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/application\/json/);
  });

  it('solo documenta rutas v1, con las cuatro operaciones de tickets y los catalogos', async () => {
    const { status, doc } = await leerDocumento();
    expect(status).toBe(200);
    expect(doc.info.version).toBe('1');

    const rutas = Object.keys(doc.paths).sort();
    expect(rutas.length).toBeGreaterThan(0);
    for (const ruta of rutas) {
      expect(ruta.startsWith('/api/v1/')).toBe(true);
    }
    expect(rutas).toEqual([
      '/api/v1/catalogos',
      '/api/v1/tickets',
      '/api/v1/tickets/{id}',
      '/api/v1/tickets/{id}/comentarios',
    ]);
    expect(Object.keys(doc.paths['/api/v1/tickets']).sort()).toEqual(['get', 'post']);
    expect(Object.keys(doc.paths['/api/v1/tickets/{id}'])).toEqual(['get']);
    expect(Object.keys(doc.paths['/api/v1/tickets/{id}/comentarios'])).toEqual(['post']);
    expect(Object.keys(doc.paths['/api/v1/catalogos'])).toEqual(['get']);
  });

  it('no filtra ninguna ruta interna, aunque el AppModule las tenga montadas', async () => {
    const { doc } = await leerDocumento();
    const texto = Object.keys(doc.paths).join('\n');
    for (const interna of [
      '/integraciones/claves',
      '/clientes',
      '/auth',
      '/usuarios',
      '/publico',
    ]) {
      expect(texto).not.toContain(interna);
    }
  });

  it('declara el esquema apiKey en X-Api-Key y lo exige en toda operacion', async () => {
    const { doc } = await leerDocumento();
    const esquemas = Object.entries(doc.components.securitySchemes ?? {});
    expect(esquemas).toHaveLength(1);
    const [nombre, esquema] = esquemas[0];
    expect(esquema).toMatchObject({ type: 'apiKey', in: 'header', name: 'X-Api-Key' });

    for (const operaciones of Object.values(doc.paths)) {
      for (const operacion of Object.values(operaciones)) {
        expect(operacion.security).toEqual([{ [nombre]: [] }]);
        expect(Object.keys(operacion.responses)).toEqual(
          expect.arrayContaining(['401', '403', '429']),
        );
      }
    }
  });

  it('describe los contratos de respuesta v1', async () => {
    const { doc } = await leerDocumento();
    expect(Object.keys(doc.components.schemas ?? {})).toEqual(
      expect.arrayContaining([
        'TicketV1',
        'ListaTicketsV1',
        'ComentarioV1',
        'CatalogosV1',
        'ErrorV1',
      ]),
    );
    expect(Object.keys(doc.paths['/api/v1/tickets'].post.responses)).toEqual(
      expect.arrayContaining(['201', '400', '409', '422']),
    );
    expect(Object.keys(doc.paths['/api/v1/tickets/{id}'].get.responses)).toEqual(
      expect.arrayContaining(['200', '404']),
    );
    const filtros = (doc.paths['/api/v1/tickets'].get.parameters ?? []).map((p) => p.name).sort();
    expect(filtros).toEqual([
      'busqueda',
      'estado',
      'fechaDesde',
      'fechaHasta',
      'pagina',
      'porPagina',
      'prioridad',
      'tipo',
    ]);
  });
});
