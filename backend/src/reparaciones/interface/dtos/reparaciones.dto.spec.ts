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
import { CreateTicketEdilicioHttpDto } from './reparaciones.dto';

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
