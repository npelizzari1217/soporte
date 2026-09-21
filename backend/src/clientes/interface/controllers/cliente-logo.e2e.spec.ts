/**
 * cliente-logo.e2e.spec.ts — HTTP e2e que atrapa el bug de producción
 * "el logo de cliente se sirve como JSON en vez de bytes"
 * (fix/logo-streamable-file).
 *
 * CAUSA RAÍZ (medida contra producción, ver commit): `ClienteLogoController.ver()`
 * devolvía un `Buffer` con `@Res({ passthrough: true })`. Con passthrough, Nest
 * SERIALIZA el valor de retorno — un `Buffer` se serializa a JSON
 * (`{"type":"Buffer","data":[...]}`), nunca a los bytes crudos. El patrón se
 * copió de los exports CSV (`equipos.controller.ts:281`, `reparaciones:255`,
 * `tickets:327`, `compras:743`), que sí funcionan con
 * `@Res({ passthrough: true })` porque devuelven `Promise<string>` — un
 * string se envía tal cual; un `Buffer` no.
 *
 * NINGÚN test unitario podía atrapar esto: `cliente-logo.controller.spec.ts`
 * instancia el controller a mano y verifica el VALOR DE RETORNO del método
 * (antes del fix: `expect(body).toBe(buffer)`), sin pasar nunca por la capa
 * de serialización HTTP real de Nest (`RouterResponseController` →
 * `ExpressAdapter.reply`, que es donde `res.json(buffer)` convierte el
 * binario en texto). Este spec SÍ pasa por esa capa: levanta un
 * `INestApplication` real con el controller real, hace una petición HTTP
 * real con `fetch`, y compara los BYTES CRUDOS de la respuesta.
 *
 * Alcance deliberadamente liviano: NO se levanta el flujo completo de login
 * ni una DB tenant efímera (a diferencia de `compras.e2e.spec.ts`) porque lo
 * que hay que probar es la serialización HTTP del binario, no el flujo de
 * autenticación (ya cubierto por `jwt-auth.guard.spec.ts`) ni el aislamiento
 * entre inquilinos como lógica de negocio (ya cubierto, con mocks, por
 * `cliente-logo.controller.spec.ts`). Por eso `JwtAuthGuard` se overridea acá
 * con un guard de prueba que reemplaza SOLO `ITokenService.verifyJwt`
 * (infraestructura de firma) por un mapa fijo Token -> JwtPayload — el
 * `@UseGuards(JwtAuthGuard)` real declarado en el controller no se toca, y el
 * chequeo inline de aislamiento (`ver()`) corre tal cual está en el código.
 * `ConfigurarLogoClienteUseCase`/`QuitarLogoClienteUseCase`/
 * `VerLogoClienteUseCase` se mockean con `vi.fn()` — la resolución del
 * binario (repo + storage) ya la prueba `ver-logo-cliente.use-case.spec.ts`.
 *
 * RED verificado (ver evidencia en el mensaje del commit): contra el
 * controller SIN el fix (Buffer + passthrough), el primer `it` de este spec
 * falla porque el `Content-Type` llega como `image/png; charset=utf-8` (no
 * `image/png` a secas) y el cuerpo de la respuesta es el JSON
 * `{"type":"Buffer","data":[...]}` en vez de los bytes del PNG — exactamente
 * la medición contra producción del encargo. El status 200 y las cabeceras
 * `nosniff`/`inline` YA pasaban antes del fix: el fallo es puntual de la
 * serialización del cuerpo, no de routing ni de autenticación.
 */
import {
  CanActivate,
  ExecutionContext,
  INestApplication,
  Module,
  UnauthorizedException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { ClienteLogoController } from './cliente-logo.controller';
import { ConfigurarLogoClienteUseCase } from '../../application/use-cases/configurar-logo-cliente.use-case';
import { QuitarLogoClienteUseCase } from '../../application/use-cases/quitar-logo-cliente.use-case';
import { VerLogoClienteUseCase } from '../../application/use-cases/ver-logo-cliente.use-case';
import { JwtAuthGuard } from '../../../auth/infrastructure/guards/jwt-auth.guard';
import { JwtPayload } from '../../../auth/domain/ports/i-token.service';
import { Result } from '../../../shared/domain/result';
import { LogoClienteNoEncontradoError } from '../../domain/errors/clientes.errors';

const CLIENTE_A = '11111111-1111-1111-1111-111111111111';
const CLIENTE_B = '22222222-2222-2222-2222-222222222222';

/**
 * PNG real de 1x1 (no un buffer arbitrario): conserva la firma de 8 bytes
 * `89 50 4e 47 0d 0a 1a 0a` que el spec verifica byte a byte, y un tamaño
 * fijo conocido para comparar longitudes exactas.
 */
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);
const PNG_MAGIC_HEX = '89504e470d0a1a0a';

function usuarioDe(clienteId: string | null, isGlobalAdmin = false): JwtPayload {
  return {
    v: 2,
    sub: 'user-1',
    cliente_id: clienteId,
    rol: isGlobalAdmin ? null : 'USUARIO',
    permisos: [],
    is_global_admin: isGlobalAdmin,
    cliente_nombre: null,
    membresias: [],
    modulos: [],
    nombre: 'Test',
    apellido: 'User',
    cliente_logo_v: null,
  };
}

/**
 * Guard de prueba: reemplaza SOLO `ITokenService.verifyJwt` (infraestructura
 * de firma) por un mapa fijo Token -> JwtPayload, para no depender de un
 * secreto JWT real en este spec liviano. La LÓGICA del guard (leer el header
 * `Authorization: Bearer`, 401 si falta o es inválido, `request.user = ...`)
 * es la misma que `JwtAuthGuard` real — no se reescribe el comportamiento,
 * sólo se reemplaza de dónde sale el payload.
 */
function buildTestAuthGuard(tokens: Record<string, JwtPayload>): CanActivate {
  return {
    canActivate(context: ExecutionContext): boolean {
      const request = context
        .switchToHttp()
        .getRequest<{ headers: Record<string, string>; user: JwtPayload }>();
      const authHeader = request.headers['authorization'] ?? '';
      if (!authHeader.startsWith('Bearer ')) {
        throw new UnauthorizedException('Token de acceso requerido');
      }
      const user = tokens[authHeader.slice(7)];
      if (!user) {
        throw new UnauthorizedException('Token inválido o expirado');
      }
      request.user = user;
      return true;
    },
  };
}

@Module({
  controllers: [ClienteLogoController],
  providers: [
    { provide: ConfigurarLogoClienteUseCase, useValue: { execute: vi.fn() } },
    { provide: QuitarLogoClienteUseCase, useValue: { execute: vi.fn() } },
    { provide: VerLogoClienteUseCase, useValue: { execute: vi.fn() } },
  ],
})
class TestHarnessModule {}

describe('GET /clientes/:id/logo — e2e HTTP real (bug: JSON en vez de bytes)', () => {
  let app: INestApplication;
  let baseUrl: string;
  let verLogoClienteUseCase: { execute: ReturnType<typeof vi.fn> };

  const TOKEN_CLIENTE_A = 'token-cliente-a';
  const TOKEN_ROOT = 'token-root';

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [TestHarnessModule],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(
        buildTestAuthGuard({
          [TOKEN_CLIENTE_A]: usuarioDe(CLIENTE_A),
          [TOKEN_ROOT]: usuarioDe(null, true),
        }),
      )
      .compile();

    verLogoClienteUseCase = moduleRef.get(VerLogoClienteUseCase);

    app = moduleRef.createNestApplication();
    await app.init();
    await app.listen(0);

    const port = (app.getHttpServer() as { address: () => { port: number } }).address().port;
    baseUrl = `http://localhost:${port}`;
  });

  afterAll(async () => {
    await app?.close();
  });

  it('devuelve los bytes del PNG idénticos al archivo, con Content-Type exacto y sin charset', async () => {
    verLogoClienteUseCase.execute.mockResolvedValue(
      Result.ok({ buffer: PNG_1X1, mimeType: 'image/png' }),
    );

    const res = await fetch(`${baseUrl}/clientes/${CLIENTE_A}/logo`, {
      headers: { Authorization: `Bearer ${TOKEN_CLIENTE_A}` },
    });

    expect(verLogoClienteUseCase.execute).toHaveBeenCalledWith(CLIENTE_A);
    expect(res.status).toBe(200);

    // Content-Type EXACTO al mime almacenado, sin "; charset=...". El bug de
    // producción lo dejaba en "image/png; charset=utf-8" porque Express
    // serializaba el Buffer con res.json() en vez de mandar los bytes.
    expect(res.headers.get('content-type')).toBe('image/png');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('content-disposition')).toBe('inline');

    const bodyBuffer = Buffer.from(await res.arrayBuffer());

    // Bytes IDÉNTICOS al archivo — comparación de Buffer completa. Con el
    // bug, el cuerpo es `{"type":"Buffer","data":[...]}` (arranca con
    // `7b2274797065223a`, "{"type":" en ASCII) y esta comparación falla.
    expect(bodyBuffer.equals(PNG_1X1)).toBe(true);
    expect(bodyBuffer.length).toBe(PNG_1X1.length);
    expect(bodyBuffer.subarray(0, 8).toString('hex')).toBe(PNG_MAGIC_HEX);
  });

  it('usuario del cliente A pide el logo del cliente B -> 403, sin invocar el use case', async () => {
    const res = await fetch(`${baseUrl}/clientes/${CLIENTE_B}/logo`, {
      headers: { Authorization: `Bearer ${TOKEN_CLIENTE_A}` },
    });

    expect(res.status).toBe(403);
  });

  it('ROOT lee el logo de cualquier cliente -> 200 con los mismos bytes', async () => {
    verLogoClienteUseCase.execute.mockResolvedValue(
      Result.ok({ buffer: PNG_1X1, mimeType: 'image/png' }),
    );

    const res = await fetch(`${baseUrl}/clientes/${CLIENTE_B}/logo`, {
      headers: { Authorization: `Bearer ${TOKEN_ROOT}` },
    });

    expect(res.status).toBe(200);
    const bodyBuffer = Buffer.from(await res.arrayBuffer());
    expect(bodyBuffer.equals(PNG_1X1)).toBe(true);
  });

  it('propaga 404 cuando el cliente no tiene logo', async () => {
    verLogoClienteUseCase.execute.mockResolvedValue(
      Result.fail(new LogoClienteNoEncontradoError(CLIENTE_A)),
    );

    const res = await fetch(`${baseUrl}/clientes/${CLIENTE_A}/logo`, {
      headers: { Authorization: `Bearer ${TOKEN_CLIENTE_A}` },
    });

    expect(res.status).toBe(404);
  });
});
