/**
 * T3.11 — Integración: orden de rutas + aislamiento por rol (cierre riesgo #5).
 *
 * A diferencia de ciclos.controller.spec.ts (unit-level, guards mockeados vía
 * instancia directa de clase), este spec bootstrapea un módulo Nest REAL con
 * PermissionsGuard y PermissionsOrGlobalAdminGuard REALES (no mockeados) para
 * ejercer el enrutamiento y la cadena de guards de punta a punta vía HTTP.
 *
 * JwtAuthGuard y TenantGuard se sustituyen por fakes livianos (mismo TOKEN de
 * DI) porque su responsabilidad (decodificar JWT real / resolver tenant contra
 * la DB master) es infraestructura fuera del alcance de este test — lo que se
 * verifica acá es: (1) el orden de declaración de rutas de Nest, y (2) que
 * PermissionsGuard / PermissionsOrGlobalAdminGuard, evaluados con un payload
 * JWT real de rol regular, aíslan correctamente `/ciclos` y `POST /ciclos`
 * dejando pasar `/ciclos/activo`.
 *
 * Spec ref: ciclos-master-tenant/design riesgo #5, ADR-8
 * Tarea: T3.11
 */
import { CanActivate, ExecutionContext, INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { CiclosController } from './ciclos.controller';
import { JwtAuthGuard } from '../../../auth/infrastructure/guards/jwt-auth.guard';
import { TenantGuard } from '../../../auth/infrastructure/guards/tenant.guard';
import { PermissionsGuard } from '../../../auth/infrastructure/guards/permissions.guard';
import { PermissionsOrGlobalAdminGuard } from '../../../auth/infrastructure/guards/permissions-or-global-admin.guard';
import { ListarCiclosUseCase } from '../../application/use-cases/listar-ciclos.use-case';
import { ElegirCicloTenantUseCase } from '../../application/use-cases/elegir-ciclo-tenant.use-case';
import { ActivarCicloUseCase } from '../../application/use-cases/activar-ciclo.use-case';
import { ObtenerCicloActivoUseCase } from '../../application/use-cases/obtener-ciclo-activo.use-case';
import { JwtPayload } from '../../../auth/domain/ports/i-token.service';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const REGULAR_USER: JwtPayload = {
  sub: '01966a6a-0000-7000-8000-000000000009',
  cliente_id: 'c1111111-0000-4000-8000-000000000001',
  email: 'regular@test.com',
  roles: ['USUARIO'],
  permisos: [], // rol regular: sin ciclo:gestionar
  cliente_nombre: 'Test Corp',
  is_global_admin: false,
};

/** Fake JwtAuthGuard — inyecta el payload de rol regular directamente en el request. */
class FakeJwtAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{ user: JwtPayload }>();
    request.user = REGULAR_USER;
    return true;
  }
}

/** Fake TenantGuard — la resolución de tenant contra DB es infra, fuera de alcance. */
class FakeTenantGuard implements CanActivate {
  canActivate(): boolean {
    return true;
  }
}

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('CiclosController — routing + aislamiento por rol, guards reales (T3.11)', () => {
  let app: INestApplication;
  let baseUrl: string;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [CiclosController],
      providers: [
        Reflector,
        PermissionsGuard,
        PermissionsOrGlobalAdminGuard,
        { provide: ListarCiclosUseCase, useValue: { execute: vi.fn().mockResolvedValue([]) } },
        { provide: ElegirCicloTenantUseCase, useValue: { execute: vi.fn() } },
        { provide: ActivarCicloUseCase, useValue: { execute: vi.fn() } },
        {
          provide: ObtenerCicloActivoUseCase,
          useValue: { execute: vi.fn().mockResolvedValue(null) },
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useClass(FakeJwtAuthGuard)
      .overrideGuard(TenantGuard)
      .useClass(FakeTenantGuard)
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
    await app.listen(0);
    const port = (app.getHttpServer() as { address: () => { port: number } }).address().port;
    baseUrl = `http://localhost:${port}`;
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /ciclos/activo con rol regular → 200 (no cae en ruta paramétrica, no 403)', async () => {
    const res = await fetch(`${baseUrl}/ciclos/activo`);
    expect(res.status).toBe(200);
  });

  it('GET /ciclos con el mismo rol regular → 403 (PermissionsGuard real rechaza)', async () => {
    const res = await fetch(`${baseUrl}/ciclos`);
    expect(res.status).toBe(403);
  });

  it('POST /ciclos con el mismo rol regular → 403 (guard combinado rechaza sin permiso ni global)', async () => {
    const res = await fetch(`${baseUrl}/ciclos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cicloVigenteId: '3fa85f64-5717-4562-b3fc-2c963f66afa6' }),
    });
    expect(res.status).toBe(403);
  });
});
