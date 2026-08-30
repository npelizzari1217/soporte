/**
 * reparaciones.dto.spec.ts — RED→GREEN: tope de largo de `titulo` en
 * `CreateTicketEdilicioHttpDto` (fix defecto "límite de largo de titulo").
 *
 * `titulo` crea un `Ticket` (`Ticket.titulo VarChar(255)`) vía
 * `TicketEntity.create()`. Sin este guard el valor atraviesa el DTO y el
 * dominio intactos y lo frena recién Postgres, con un error de driver sin
 * nombrar campo.
 */
import 'reflect-metadata';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateSubtareaHttpDto, CreateTicketEdilicioHttpDto } from './reparaciones.dto';
import { TICKET_EDILICIA_UBICACION_MAX_LENGTH } from '../../domain/entities/ticket-edilicia.entity';
import { SUBTAREA_DESCRIPCION_MAX_LENGTH } from '../../domain/entities/subtarea-edilicia.entity';

describe('CreateTicketEdilicioHttpDto — tope de largo de titulo espejando la columna', () => {
  const prioridadId = '00000000-0000-4000-8000-000000000002';

  // Asserta el error DEL CAMPO y por SU restricción, no que "hubo algún
  // error": un DTO que rechazara por otra propiedad daría verde igual con
  // el tope de largo ausente.
  it('rechaza titulo de más de 255 caracteres, por maxLength', async () => {
    const dto = plainToInstance(CreateTicketEdilicioHttpDto, {
      titulo: 'A'.repeat(256),
      prioridadId,
    });
    const errorDeTitulo = (await validate(dto)).find((e) => e.property === 'titulo');

    expect(errorDeTitulo?.constraints).toHaveProperty('maxLength');
  });

  it('acepta titulo de exactamente 255 caracteres (límite inclusive)', async () => {
    const dto = plainToInstance(CreateTicketEdilicioHttpDto, {
      titulo: 'A'.repeat(255),
      prioridadId,
    });
    expect(await validate(dto)).toHaveLength(0);
  });
});

/**
 * `ubicacion` y `descripcion` de subtarea: el mismo defecto que `titulo`, en dos
 * campos que habían quedado afuera. Sus columnas son `VarChar(255)` y no las
 * acotaba ninguna capa, así que el valor llegaba a Postgres (22001 → 500 crudo).
 *
 * El tope no se declara acá: se importa del dominio, para que el borde y la
 * precondición no puedan divergir.
 */
describe('CreateTicketEdilicioHttpDto — tope de ubicacion', () => {
  const BASE = {
    titulo: 'Filtración en el baño',
    prioridadId: '9f1a0b2c-3d4e-4f50-8a61-72b83c94d5e6',
  };

  it('acepta una ubicacion en el límite exacto', async () => {
    const dto = plainToInstance(CreateTicketEdilicioHttpDto, {
      ...BASE,
      ubicacion: 'A'.repeat(TICKET_EDILICIA_UBICACION_MAX_LENGTH),
    });
    expect((await validate(dto)).some((e) => e.property === 'ubicacion')).toBe(false);
  });

  it('rechaza una ubicacion que pasa el tope', async () => {
    const dto = plainToInstance(CreateTicketEdilicioHttpDto, {
      ...BASE,
      ubicacion: 'A'.repeat(TICKET_EDILICIA_UBICACION_MAX_LENGTH + 1),
    });
    const error = (await validate(dto)).find((e) => e.property === 'ubicacion');
    expect(error?.constraints).toHaveProperty('maxLength');
  });

  it('sigue aceptando el alta sin ubicacion: el tope no la vuelve obligatoria', async () => {
    const dto = plainToInstance(CreateTicketEdilicioHttpDto, BASE);
    expect((await validate(dto)).some((e) => e.property === 'ubicacion')).toBe(false);
  });
});

describe('CreateSubtareaHttpDto — tope de descripcion', () => {
  it('acepta una descripcion en el límite exacto', async () => {
    const dto = plainToInstance(CreateSubtareaHttpDto, {
      descripcion: 'A'.repeat(SUBTAREA_DESCRIPCION_MAX_LENGTH),
    });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('rechaza una descripcion que pasa el tope, y POR el tope', async () => {
    const dto = plainToInstance(CreateSubtareaHttpDto, {
      descripcion: 'A'.repeat(SUBTAREA_DESCRIPCION_MAX_LENGTH + 1),
    });
    const error = (await validate(dto)).find((e) => e.property === 'descripcion');
    // Mirar la constraint y no solo el campo: si mañana se agrega otro decorador
    // a descripcion, un assert por nombre de propiedad pasaria por el motivo
    // equivocado. Mismo criterio que el test de titulo de mas arriba.
    expect(error?.constraints).toHaveProperty('maxLength');
  });

  it('sigue rechazando la descripcion vacía: el tope no reemplaza al mínimo', async () => {
    const dto = plainToInstance(CreateSubtareaHttpDto, { descripcion: '' });
    expect((await validate(dto)).some((e) => e.property === 'descripcion')).toBe(true);
  });
});
