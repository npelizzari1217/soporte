/**
 * [HTTP real] `GET /tickets/:id/pdf` — un Nest con el controller y un caso de
 * uso doble, para fijar lo que solo se ve en el cable: bytes crudos (no el
 * JSON de un Buffer), headers de descarga y el mapeo de errores.
 *
 * Los tres guards del controller se reemplazan por un doble que fija
 * `request.user`: su lógica ya tiene sus propios specs. Lo que SÍ se fija
 * acá es la metadata de permisos (`TICKETS:LECTURA`) y qué recibe el caso de
 * uso — en particular que `TICKETS:OBSERVAR` no cambia nada.
 */
import { CanActivate, ExecutionContext, INestApplication, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { AccionesGuard } from '../../../auth/infrastructure/guards/acciones.guard';
import { ACCIONES_KEY } from '../../../auth/infrastructure/guards/decorators';
import { JwtAuthGuard } from '../../../auth/infrastructure/guards/jwt-auth.guard';
import { TenantGuard } from '../../../auth/infrastructure/guards/tenant.guard';
import { JwtPayload } from '../../../auth/domain/ports/i-token.service';
import { Result } from '../../../shared/domain/result';
import { TicketNoEncontradoError } from '../../../tickets/domain/errors/tickets.errors';
import { GenerarPdfTicketUseCase } from '../../application/use-cases/generar-pdf-ticket.use-case';
import { TicketPdfController } from './ticket-pdf.controller';

/** PDF mínimo con bytes que NO son UTF-8 válido: si algo lo trata como texto, cambian. */
const PDF = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.from([0xff, 0xfe, 0x80, 0x00, 0x89])]);

function usuario(permisos: string[]): JwtPayload {
  return {
    v: 2,
    sub: 'user-1',
    cliente_id: 'cliente-1',
    rol: 'TECNICO',
    permisos,
    is_global_admin: false,
    cliente_nombre: 'Colegio San Martín',
    membresias: [],
    modulos: [],
    nombre: 'Ana',
    apellido: 'Pérez',
    cliente_logo_v: null,
  };
}

let actual: JwtPayload = usuario([]);
const guardDeUsuario: CanActivate = {
  canActivate(context: ExecutionContext): boolean {
    context.switchToHttp().getRequest<{ user: JwtPayload }>().user = actual;
    return true;
  },
};

const generar = { execute: vi.fn() };

@Module({
  controllers: [TicketPdfController],
  providers: [{ provide: GenerarPdfTicketUseCase, useValue: generar }],
})
class Harness {}

describe('TicketPdfController — GET /tickets/:id/pdf', () => {
  let app: INestApplication;
  let baseUrl: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [Harness] })
      .overrideGuard(JwtAuthGuard)
      .useValue(guardDeUsuario)
      .overrideGuard(TenantGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(AccionesGuard)
      .useValue({ canActivate: () => true })
      .compile();
    app = moduleRef.createNestApplication();
    await app.init();
    await app.listen(0);
    const port = (app.getHttpServer() as { address: () => { port: number } }).address().port;
    baseUrl = `http://localhost:${port}`;
  });

  afterAll(async () => {
    await app?.close();
  });

  beforeEach(() => {
    generar.execute.mockReset();
    actual = usuario([]);
  });

  it('declara @RequiereAcciones("TICKETS:LECTURA"), la misma acción que el detalle', () => {
    expect(Reflect.getMetadata(ACCIONES_KEY, TicketPdfController.prototype.pdf)).toEqual([
      'TICKETS:LECTURA',
    ]);
  });

  it('entrega los bytes EXACTOS del PDF (no JSON) con content-type, nombre y header de CORS', async () => {
    generar.execute.mockResolvedValue(
      Result.ok({ buffer: PDF, nombreArchivo: 'ticket-SOP-2026-00042.pdf' }),
    );

    const res = await fetch(`${baseUrl}/tickets/t-1/pdf`);
    const bytes = Buffer.from(await res.arrayBuffer());

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/pdf');
    expect(res.headers.get('content-disposition')).toBe(
      'attachment; filename="ticket-SOP-2026-00042.pdf"',
    );
    expect(res.headers.get('access-control-expose-headers')).toBe('Content-Disposition');
    expect(bytes.equals(PDF)).toBe(true);
  });

  it('un ticket ajeno o inexistente es 404, sin cuerpo de PDF', async () => {
    generar.execute.mockResolvedValue(Result.fail(new TicketNoEncontradoError('t-1')));

    const res = await fetch(`${baseUrl}/tickets/t-1/pdf`);

    expect(res.status).toBe(404);
    expect(res.headers.get('content-type')).not.toContain('application/pdf');
  });

  it('pasa id, actor, VER_TODOS y cliente del JWT al caso de uso', async () => {
    generar.execute.mockResolvedValue(Result.ok({ buffer: PDF, nombreArchivo: 'ticket-x.pdf' }));
    actual = usuario(['TICKETS:VER_TODOS']);

    await fetch(`${baseUrl}/tickets/t-9/pdf`);

    expect(generar.execute).toHaveBeenCalledWith({
      ticketId: 't-9',
      actorId: 'user-1',
      tienePermisoVerTodos: true,
      clienteId: 'cliente-1',
      clienteNombre: 'Colegio San Martín',
    });
  });

  it('TICKETS:OBSERVAR no cambia nada: el caso de uso no recibe ningún flag de observar', async () => {
    generar.execute.mockResolvedValue(Result.ok({ buffer: PDF, nombreArchivo: 'ticket-x.pdf' }));
    actual = usuario(['TICKETS:VER_TODOS', 'TICKETS:OBSERVAR']);

    await fetch(`${baseUrl}/tickets/t-9/pdf`);

    const dto: object = generar.execute.mock.calls[0][0];
    expect(Object.keys(dto).sort()).toEqual([
      'actorId',
      'clienteId',
      'clienteNombre',
      'ticketId',
      'tienePermisoVerTodos',
    ]);
  });
});
