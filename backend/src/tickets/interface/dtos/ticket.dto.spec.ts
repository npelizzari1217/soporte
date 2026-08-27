/**
 * ticket.dto.spec.ts — RED→GREEN: `toTicketResponseDto` (sdd/beta-frontend
 * item 2 — sla_vence_at/vencido + nombres resueltos batch).
 *
 * Alto valor (política 80/20): valida que el DTO expone los campos nuevos
 * correctamente y que, sin `nombres`/sin SLA calculado, degrada a `null`
 * de forma retrocompatible (nunca `undefined` filtrándose al JSON).
 */
import 'reflect-metadata';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { TicketEntity } from '../../domain/entities/ticket.entity';
import { CreateTicketDto, EditTicketDto, toTicketResponseDto } from './ticket.dto';

function makeTicket(overrides: Partial<Parameters<typeof TicketEntity.reconstitute>[0]> = {}) {
  const now = new Date('2026-01-01T00:00:00.000Z');
  return TicketEntity.reconstitute(
    {
      numero: 'SOP-2026-00001',
      titulo: 'Ticket de prueba',
      descripcion: null,
      tipoId: 'tipo-uuid',
      estadoId: 'estado-uuid',
      prioridadId: 'prioridad-uuid',
      cicloId: null,
      ticketReferenciaId: null,
      solicitanteId: 'solicitante-uuid',
      asignadoId: 'asignado-uuid',
      slaVenceAt: new Date('2026-01-02T00:00:00.000Z'),
      vencido: true,
      fechaCierre: null,
      ...overrides,
    },
    'ticket-1',
    now,
    now,
    null,
  );
}

describe('toTicketResponseDto', () => {
  it('expone slaVenceAt/vencido calculados por el módulo SLA', () => {
    const dto = toTicketResponseDto(makeTicket());

    expect(dto.slaVenceAt).toBe('2026-01-02T00:00:00.000Z');
    expect(dto.vencido).toBe(true);
  });

  it('slaVenceAt null cuando el ticket aún no tiene SLA calculado', () => {
    const dto = toTicketResponseDto(makeTicket({ slaVenceAt: null, vencido: false }));

    expect(dto.slaVenceAt).toBeNull();
    expect(dto.vencido).toBe(false);
  });

  it('sin `nombres` (2do arg omitido) los 4 campos de nombre son null — retrocompatible', () => {
    const dto = toTicketResponseDto(makeTicket());

    expect(dto.solicitanteNombre).toBeNull();
    expect(dto.solicitanteApellido).toBeNull();
    expect(dto.asignadoNombre).toBeNull();
    expect(dto.asignadoApellido).toBeNull();
  });

  it('con `nombres` resueltos, mapea solicitante y asignado', () => {
    const dto = toTicketResponseDto(makeTicket(), {
      solicitante: { nombre: 'Ana', apellido: 'Gómez' },
      asignado: { nombre: 'Luis', apellido: 'Pérez' },
    });

    expect(dto.solicitanteNombre).toBe('Ana');
    expect(dto.solicitanteApellido).toBe('Gómez');
    expect(dto.asignadoNombre).toBe('Luis');
    expect(dto.asignadoApellido).toBe('Pérez');
  });

  it('asignado sin resolver (usuario removido) → asignadoNombre/apellido null, aunque haya solicitante', () => {
    const dto = toTicketResponseDto(makeTicket(), {
      solicitante: { nombre: 'Ana', apellido: 'Gómez' },
      asignado: undefined,
    });

    expect(dto.asignadoNombre).toBeNull();
    expect(dto.asignadoApellido).toBeNull();
  });
});

/**
 * `Ticket.titulo` es `VarChar(255)`. Sin este guard el valor atraviesa DTO
 * y dominio intactos y lo frena recién Postgres, con un error de driver sin
 * nombrar campo (fix defecto "límite de largo de titulo").
 *
 * Recorre los dos DTOs (alta y edición): con un solo caso, borrar el
 * decorador de uno de los dos no pone nada en rojo (patrón medido en
 * `sectores.dto.spec.ts`).
 */
describe.each([
  [
    'CreateTicketDto',
    CreateTicketDto,
    {
      tipoId: '00000000-0000-4000-8000-000000000001',
      prioridadId: '00000000-0000-4000-8000-000000000002',
    },
  ],
  ['EditTicketDto', EditTicketDto, {}],
])('%s — tope de largo de titulo espejando la columna', (_nombre, Dto, extraProps) => {
  // Asserta el error DEL CAMPO y por SU restricción, no que "hubo algún
  // error": un DTO que rechazara por otra propiedad daría verde igual con el
  // tope de largo ausente.
  it('rechaza titulo de más de 255 caracteres, por maxLength', async () => {
    const dto = plainToInstance(Dto, { titulo: 'A'.repeat(256), ...extraProps });

    const errorDeTitulo = (await validate(dto)).find((e) => e.property === 'titulo');

    expect(errorDeTitulo?.constraints).toHaveProperty('maxLength');
  });

  it('acepta titulo de exactamente 255 caracteres (límite inclusive)', async () => {
    const dto = plainToInstance(Dto, { titulo: 'A'.repeat(255), ...extraProps });
    expect(await validate(dto)).toHaveLength(0);
  });
});
