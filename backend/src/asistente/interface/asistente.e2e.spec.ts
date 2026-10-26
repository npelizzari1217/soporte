/**
 * e2e HTTP de `POST /asistente/consultas` (odd/asistente-ia-ayuda, T3: S2, S3, S5, S6 y S7).
 *
 * `SharedModule` + `AsistenteModule` contra `soporte_master_test`, con JWT, `AccionesGuard`,
 * throttler y Prisma reales. El único reemplazo es `MODELO_IA`. Los artículos de prueba llevan
 * términos inventados (`zarquin`, `vortiplex`) para que los de otros specs no cambien el resultado.
 * No trunca: crea y borra sus propias filas.
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
import { RESPUESTA_SIN_RESULTADOS } from '../domain/consulta-asistente';
import { FallaModeloIaError, IModeloIa, MODELO_IA, PedidoIa } from '../domain/modelo-ia.port';
import { ASISTENTE_LIMITE } from '../infrastructure/asistente-throttler.guard';

const CLAVE_CIFRADO_DE_TEST = 'd'.repeat(64);

class ModeloIaFalso implements IModeloIa {
  respuesta: Result<string, FallaModeloIaError> = Result.ok('Respuesta del modelo.');
  pedidos: PedidoIa[] = [];

  async completar(
    _destino: DestinoIa,
    pedido: PedidoIa,
  ): Promise<Result<string, FallaModeloIaError>> {
    this.pedidos.push(pedido);
    return this.respuesta;
  }
}

interface Respuesta {
  respuesta: string;
  modo: string;
  fuentes: Array<{ articuloId: string; titulo: string }>;
}

usarLockMasterTest();

describe('POST /asistente/consultas — e2e', () => {
  let app: INestApplication;
  let baseUrl: string;
  let prismaService: PrismaService;
  let master: InstanceType<typeof MasterPrismaClient>;
  let tokens: ITokenService;
  let clavePrevia: string | undefined;
  const modelo = new ModeloIaFalso();
  const articulos: string[] = [];
  const clientes: string[] = [];
  let publicado: string;
  let interno: string;
  let clienteConIa: string;

  const token = (permisos: string[], clienteId: string | null = null): string =>
    tokens.signJwt(
      payloadDeTest({
        sub: `e2e-asistente-${randomBytes(6).toString('hex')}`,
        cliente_id: clienteId,
        permisos,
      }),
    );

  async function consultar(
    consulta: unknown,
    jwt?: string,
  ): Promise<{ status: number; data: Respuesta }> {
    const res = await fetch(`${baseUrl}/asistente/consultas`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}),
      },
      body: JSON.stringify({ consulta }),
    });
    return { status: res.status, data: (await res.json().catch(() => null)) as Respuesta };
  }

  async function crearArticulo(
    titulo: string,
    contenido: string,
    visible: boolean,
  ): Promise<string> {
    const a = await master.kbArticulo.create({
      data: { titulo, contenido, visibleParaSolicitante: visible },
    });
    articulos.push(a.id);
    return a.id;
  }

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

    publicado = await crearArticulo(
      'Zarquin del sistema',
      '## Configurar el zarquin\nPara configurar el zarquin abra Ajustes y elija Zarquin.',
      true,
    );
    interno = await crearArticulo(
      'Vortiplex interno',
      '## Reiniciar el vortiplex\nEl técnico reinicia el vortiplex desde la consola.',
      false,
    );
    const s = randomBytes(5).toString('hex');
    const c = await master.cliente.create({
      data: { nombre: `E2E Asistente ${s}`, dbName: `soporte_e2e_asist_${s}_test` },
    });
    clientes.push(c.id);
    clienteConIa = c.id;
    await master.asistenteIaConfig.create({
      data: {
        clienteId: c.id,
        url: URL_IA_POR_DEFECTO,
        modelo: 'gemini-2.5-flash',
        claveCifrada: new AesGcmSecretCipher().encrypt('AIzaClave', `ia:${c.id}`),
      },
    });
  }, 60_000);

  afterAll(async () => {
    await master?.kbArticulo.deleteMany({ where: { id: { in: articulos } } });
    await master?.cliente.deleteMany({ where: { id: { in: clientes } } });
    await app?.close();
    await prismaService?.onModuleDestroy();
    if (clavePrevia === undefined) delete process.env.EMAIL_CRYPTO_KEY;
    else process.env.EMAIL_CRYPTO_KEY = clavePrevia;
  }, 60_000);

  beforeEach(() => {
    modelo.respuesta = Result.ok('Respuesta del modelo.');
    modelo.pedidos = [];
  });

  it('sin token → 401', async () => {
    expect((await consultar('zarquin')).status).toBe(401);
  });

  it('sin KB:LECTURA → 403 y no llama al proveedor', async () => {
    const { status } = await consultar('zarquin', token([], clienteConIa));
    expect(status).toBe(403);
    expect(modelo.pedidos).toEqual([]);
  });

  it('cliente con IA: responde el modelo con los fragmentos de la Ayuda y cita el artículo', async () => {
    const { status, data } = await consultar(
      '¿Cómo configuro el zarquin?',
      token(['KB:LECTURA'], clienteConIa),
    );
    expect(status).toBe(200);
    expect(data).toEqual({
      respuesta: 'Respuesta del modelo.',
      modo: 'ia',
      fuentes: [{ articuloId: publicado, titulo: 'Zarquin del sistema' }],
    });
    expect(modelo.pedidos[0].mensajes[1].contenido).toContain('abra Ajustes y elija Zarquin');
  });

  it('cliente sin IA: responde con la Ayuda directamente', async () => {
    const { data } = await consultar('¿Cómo configuro el zarquin?', token(['KB:LECTURA'], null));
    expect(data).toEqual({
      respuesta: 'Para configurar el zarquin abra Ajustes y elija Zarquin.',
      modo: 'respaldo',
      fuentes: [{ articuloId: publicado, titulo: 'Zarquin del sistema' }],
    });
    expect(modelo.pedidos).toEqual([]);
  });

  it('un artículo no publicado no llega a quien no tiene KB:VER_TODOS', async () => {
    const { data } = await consultar('reiniciar vortiplex', token(['KB:LECTURA'], clienteConIa));
    expect(data.modo).toBe('sin_resultados');
    expect(JSON.stringify(data)).not.toContain(interno);
    expect(modelo.pedidos).toEqual([]);
  });

  it('con KB:VER_TODOS el artículo no publicado sí se usa', async () => {
    const { data } = await consultar(
      'reiniciar vortiplex',
      token(['KB:LECTURA', 'KB:VER_TODOS'], clienteConIa),
    );
    expect(data.fuentes).toEqual([{ articuloId: interno, titulo: 'Vortiplex interno' }]);
  });

  it('sin nada parecido: lo dice y sugiere crear un ticket', async () => {
    const { data } = await consultar('qwzxv plumbrik', token(['KB:LECTURA'], clienteConIa));
    expect(data).toEqual({
      respuesta: RESPUESTA_SIN_RESULTADOS,
      modo: 'sin_resultados',
      fuentes: [],
    });
  });

  it.each([
    ['vacía', '   '],
    ['de más de 600 caracteres', 'a'.repeat(601)],
    ['que no es texto', 42],
  ])('una consulta %s → 400', async (_caso, consulta) => {
    expect((await consultar(consulta, token(['KB:LECTURA'], clienteConIa))).status).toBe(400);
    expect(modelo.pedidos).toEqual([]);
  });

  it(`el cupo es de ${ASISTENTE_LIMITE} consultas por minuto por persona`, async () => {
    const jwt = token(['KB:LECTURA'], null);
    for (let i = 0; i < ASISTENTE_LIMITE; i++) {
      expect((await consultar('zarquin', jwt)).status).toBe(200);
    }
    expect((await consultar('zarquin', jwt)).status).toBe(429);
    // Otra persona conserva su propio cupo.
    expect((await consultar('zarquin', token(['KB:LECTURA'], null))).status).toBe(200);
  });
});
