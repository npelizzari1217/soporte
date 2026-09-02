/**
 * tenant-guard-zona-horaria.integration.spec.ts — TDD RED phase (WU-3, C3a,
 * tarea 3.1, sdd/zona-horaria-por-tenant).
 *
 * D3 (design): `zonaHoraria: ZonaHoraria` vive en `TenantContextData` y lo
 * bindea `TenantGuard` desde el `findById` que YA ejecuta — cero queries
 * nuevas. La alternativa rechazada era re-consultar por call site: paga N
 * queries por request y admite que dos capas del mismo request lean valores
 * distintos si la zona cambia en el medio. Este spec existe para que esa
 * alternativa rechazada no pueda reintroducirse en silencio: el `findById`
 * del repositorio se espía y se cuenta.
 *
 * Por qué INTEGRACIÓN y no unit (a diferencia de `tenant.guard.spec.ts`, que
 * llama `guard.canActivate()` directo): un unit test no puede distinguir "el
 * guard llamó una vez" de "el guard llamó una vez Y ALGO MÁS en el pipeline
 * de la request llamó una segunda vez" — necesita el viaje HTTP real
 * (`JwtAuthGuard` → `TenantGuard` → controller) para que CUALQUIER re-consulta
 * en cualquier punto de esa cadena quede capturada por el mismo espía. Se
 * levanta un `TestingModule` real de NestJS con guards reales y DI real; el
 * ÚNICO doble no-real es el repositorio (`CLIENTE_REPOSITORY`, en memoria) y
 * `PrismaService` (URL que nunca dispara una query — ver nota de
 * `PROBE_PRISMA_URL` abajo), porque tocar Postgres no es lo que este spec
 * necesita probar.
 *
 * El espía cuenta llamadas REALES, no las del test: `findByIdMock` es el
 * PROVEEDOR inyectado por Nest en el `TenantGuard` real que corre dentro del
 * pipeline HTTP — el test nunca invoca `clienteRepo.findById` por su cuenta,
 * solo dispara la request con `fetch()`. Cada llamada que el mock registra
 * es una llamada que hizo código de PRODUCCIÓN durante un round-trip HTTP
 * real, no una del arnés de test.
 *
 * El bind de `zonaHoraria` se verifica espiando `TenantContext.bind()`, mismo
 * criterio que el `bindSpy` de `tenant.guard.spec.ts`. Se usa
 * `expect.objectContaining` y no un literal tipado a propósito: el matcher
 * asimétrico no acopla la aserción a la forma COMPLETA de
 * `TenantContextData`, así que agregar un campo nuevo a esa interfaz no
 * obliga a tocar este spec.
 */
import { Controller, Get, INestApplication, UseGuards } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { JwtModule } from '@nestjs/jwt';

import { entorno } from '../../../config/entorno';
import { JwtAuthGuard } from './jwt-auth.guard';
import { TenantGuard } from './tenant.guard';
import { ITokenService, TOKEN_SERVICE } from '../../domain/ports/i-token.service';
import { JwtTokenService } from '../jwt-token.service';
import { payloadDeTest } from '../../test-helpers/payload-de-test';
import {
  CLIENTE_REPOSITORY,
  IClienteRepository,
} from '../../../clientes/domain/ports/i-cliente.repository';
import { ClienteEntity } from '../../../clientes/domain/entities/cliente.entity';
import { ZonaHoraria } from '../../../shared/domain/zona-horaria';
import { PrismaService } from '../../../shared/infrastructure/persistence/prisma.service';
import { TenantContext } from '../../../shared/tenancy/tenant-context';

/**
 * Nunca dispara una query real: `PrismaService` arma el `pg.Pool` de forma
 * lazy (ver docstring de la clase) y este spec nunca toca el `PrismaClient`
 * del tenant — ni el controller ni el guard lo consultan, solo lo obtienen
 * de `PrismaService.getTenantClient()` para bindearlo al contexto.
 */
const PROBE_PRISMA_URL = 'postgresql://probe:probe@localhost:5432/tenant_guard_probe_nunca_test';

const CLIENTE_ID = '10000000-0000-4000-8000-000000000001';
// DISTINTA del DEFAULT de la columna (`America/Argentina/Buenos_Aires`, migración
// `20260901120000_add_cliente_zona_horaria`) a propósito. Con la zona del fixture
// igual al default, un guard que devolviera el default hardcodeado en vez de leer
// el del cliente pasaba las aserciones: medido con un mutante, 638 tests en verde.
const ZONA_ESPERADA = 'Europe/Madrid';

const clienteFixture = ClienteEntity.reconstitute(
  {
    nombre: 'Cliente Zona Horaria Probe',
    razonSocial: null,
    cuit: null,
    dbName: 'soporte_zona_horaria_probe',
    activo: true,
    zonaHoraria: ZonaHoraria.crear(ZONA_ESPERADA),
  },
  CLIENTE_ID,
  new Date(),
  new Date(),
  null,
);

/** Ruta mínima protegida por la cadena real de guards (`JwtAuthGuard` → `TenantGuard`). */
@Controller('probe')
class ProbeController {
  @UseGuards(JwtAuthGuard, TenantGuard)
  @Get('tenant-scope')
  probe(): { ok: true } {
    return { ok: true };
  }
}

describe('TenantGuard integración — bind de zonaHoraria + una sola query por request (D3, WU-3 tarea 3.1)', () => {
  let app: INestApplication;
  let baseUrl: string;
  let tenantContext: TenantContext;
  let findByIdMock: ReturnType<typeof vi.fn<(id: string) => Promise<ClienteEntity | null>>>;
  let bindSpy: ReturnType<typeof vi.spyOn>;
  let token: string;

  beforeAll(async () => {
    findByIdMock = vi.fn<(id: string) => Promise<ClienteEntity | null>>(async (id) =>
      id === clienteFixture.id ? clienteFixture : null,
    );
    const fakeClienteRepo: IClienteRepository = {
      findById: findByIdMock,
      findByDbName: vi.fn(),
      findAll: vi.fn(),
      save: vi.fn(),
      delete: vi.fn(),
    };
    tenantContext = new TenantContext();
    const prismaServiceStub = new PrismaService(PROBE_PRISMA_URL);

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [
        JwtModule.register({
          secret: entorno.JWT_SECRET,
          signOptions: { expiresIn: '15m', algorithm: 'HS256' },
        }),
      ],
      controllers: [ProbeController],
      providers: [
        JwtAuthGuard,
        TenantGuard,
        { provide: TOKEN_SERVICE, useClass: JwtTokenService },
        { provide: CLIENTE_REPOSITORY, useValue: fakeClienteRepo },
        { provide: PrismaService, useValue: prismaServiceStub },
        { provide: TenantContext, useValue: tenantContext },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
    await app.listen(0);
    const port = (app.getHttpServer() as { address: () => { port: number } }).address().port;
    baseUrl = `http://localhost:${port}`;

    const tokenService = moduleRef.get<ITokenService>(TOKEN_SERVICE);
    token = tokenService.signJwt(
      payloadDeTest({
        cliente_id: clienteFixture.id,
        rol: 'TECNICO',
        permisos: [],
        cliente_nombre: clienteFixture.nombre,
      }),
    );
  }, 30_000);

  afterAll(async () => {
    await app?.close();
  });

  beforeEach(() => {
    findByIdMock.mockClear();
    bindSpy = vi.spyOn(tenantContext, 'bind');
  });

  afterEach(() => {
    bindSpy.mockRestore();
  });

  async function callProbe(): Promise<{ status: number }> {
    const res = await fetch(`${baseUrl}/probe/tenant-scope`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return { status: res.status };
  }

  it(
    'bindea TenantContext con la zonaHoraria del cliente resuelto (D3) y consulta ' +
      'el repositorio EXACTAMENTE una vez por request (cero re-consultas)',
    async () => {
      const { status } = await callProbe();

      expect(status).toBe(200);
      // El conteo va ANTES del bind a propósito, y hay que dejarlo ahí: si el
      // bind se rompe, su aserción tira primero y corta el test, así que un
      // conteo puesto al final no se evaluaría. Medido con un mutante: con dos
      // `findById` en el guard y el bind fallando, el test reportaba el bind y
      // la doble query pasaba invisible.
      expect(findByIdMock).toHaveBeenCalledTimes(1);
      // El bind lleva la zona del cliente resuelto (D3): es lo que 3.2 agregó y
      // lo que este assert protege de que alguien lo saque.
      expect(bindSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          clienteId: clienteFixture.id,
          zonaHoraria: expect.objectContaining({ valor: ZONA_ESPERADA }),
        }),
      );
    },
  );
});
