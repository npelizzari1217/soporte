/**
 * app-module.registro.e2e.spec.ts — `FormularioPublicoModule` registrado en `AppModule`
 * (sdd/formulario-publico-qr, WU-19, tarea 19.3; ADR-12).
 *
 * Arranca el `AppModule` REAL (sin harness): comprueba que el modulo no rompe el boot y que las
 * tres rutas publicas existen y responden sin sesion. Un slug inexistente da el 404 uniforme, asi
 * que no hace falta sembrar nada en master.
 */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from '../app.module';
import { usarLockMasterTest } from '../testing/lock-master-test';

const MASTER_TEST_URL =
  process.env.DATABASE_URL_MASTER ??
  'postgresql://soporte:soporte@localhost:5432/soporte_master_test';

usarLockMasterTest();

describe('AppModule con FormularioPublicoModule (WU-19)', () => {
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
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    await app.listen(0);
    const port = (app.getHttpServer() as { address: () => { port: number } }).address().port;
    baseUrl = `http://localhost:${port}`;
  }, 90_000);

  afterAll(async () => {
    await app?.close();
  });

  it('las rutas publicas existen y no piden sesion: slug inexistente da 404, no 401 ni 404 de ruta', async () => {
    const contexto = await fetch(`${baseUrl}/publico/c/no-existe/pedido/contexto`);
    const solicitud = await fetch(`${baseUrl}/publico/c/no-existe/pedido/solicitud`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nombre: 'Ana',
        email: 'ana@example.com',
        titulo: 'Titulo',
        descripcion: 'Descripcion',
      }),
    });
    const confirmar = await fetch(`${baseUrl}/publico/c/no-existe/pedido/confirmar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: 'x' }),
    });

    for (const res of [contexto, solicitud, confirmar]) {
      expect(res.status).toBe(404);
      const cuerpo = (await res.json()) as { message?: string };
      // El 404 de una ruta que no existe dice "Cannot GET/POST ..."; el uniforme tiene mensaje fijo.
      expect(cuerpo.message).not.toMatch(/^Cannot /);
    }
  });
});
