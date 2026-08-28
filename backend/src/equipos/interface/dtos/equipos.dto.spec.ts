/**
 * equipos.dto.spec.ts — RED→GREEN: tope de largo de `titulo` en
 * `CreateTicketSoporteHttpDto` (fix defecto "límite de largo de titulo").
 *
 * `titulo` crea un `Ticket` (`Ticket.titulo VarChar(255)`) vía
 * `TicketEntity.create()`. Sin este guard el valor atraviesa el DTO y el
 * dominio intactos y lo frena recién Postgres, con un error de driver sin
 * nombrar campo.
 */
import 'reflect-metadata';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import {
  CreateTicketSoporteHttpDto,
  CreateEquipoHttpDto,
  EditarEquipoHttpDto,
} from './equipos.dto';

describe('CreateTicketSoporteHttpDto — tope de largo de titulo espejando la columna', () => {
  const prioridadId = '00000000-0000-4000-8000-000000000002';

  // Asserta el error DEL CAMPO y por SU restricción, no que "hubo algún
  // error": un DTO que rechazara por otra propiedad daría verde igual con
  // el tope de largo ausente.
  it('rechaza titulo de más de 255 caracteres, por maxLength', async () => {
    const dto = plainToInstance(CreateTicketSoporteHttpDto, {
      titulo: 'A'.repeat(256),
      prioridadId,
    });
    const errorDeTitulo = (await validate(dto)).find((e) => e.property === 'titulo');

    expect(errorDeTitulo?.constraints).toHaveProperty('maxLength');
  });

  it('acepta titulo de exactamente 255 caracteres (límite inclusive)', async () => {
    const dto = plainToInstance(CreateTicketSoporteHttpDto, {
      titulo: 'A'.repeat(255),
      prioridadId,
    });
    expect(await validate(dto)).toHaveLength(0);
  });
});

/**
 * Fix defecto "límites de equipos" (sdd/limites-db/explore gap #4). Recorre
 * LOS DOS DTOs (alta y edición): con un solo caso, un decorador borrado en
 * uno de los dos no pone nada en rojo (mismo hallazgo que `sectores.dto.spec.ts`).
 * Los tests asertan el error DEL CAMPO y por SU restricción, no que "hubo
 * algún error".
 */
describe.each([
  ['CreateEquipoHttpDto', CreateEquipoHttpDto],
  ['EditarEquipoHttpDto', EditarEquipoHttpDto],
])('%s — topes de largo/rango espejando la columna', (_nombreDto, Dto) => {
  const base = { nombre: 'Notebook' };

  it.each([
    ['nombre', 'A'.repeat(256), 'maxLength'],
    ['numeroSerie', 'A'.repeat(256), 'maxLength'],
    ['marca', 'A'.repeat(101), 'maxLength'],
    ['modelo', 'A'.repeat(101), 'maxLength'],
    ['importe', -1, 'min'],
    ['importe', 100_000_000, 'max'],
    ['valorResidual', -1, 'min'],
    ['valorResidual', 100_000_000, 'max'],
  ])('rechaza %s fuera de rango, por %s', async (campo, valor, restriccion) => {
    const dto = plainToInstance(Dto, { ...base, [campo]: valor });
    const errorDelCampo = (await validate(dto)).find((e) => e.property === campo);
    // `?? {}` evita que un `errorDelCampo` ausente (campo que hoy no
    // valida nada) haga explotar el matcher con un TypeError ajeno a la
    // aserción; sin este fallback, un RED real se confunde con un import roto.
    expect(errorDelCampo?.constraints ?? {}).toHaveProperty(restriccion);
  });

  it.each([
    ['nombre', 'A'.repeat(255)],
    ['numeroSerie', 'A'.repeat(255)],
    ['marca', 'A'.repeat(100)],
    ['modelo', 'A'.repeat(100)],
    ['importe', 0],
    ['importe', 99_999_999],
    ['valorResidual', 0],
    ['valorResidual', 99_999_999],
  ])('acepta %s en el límite exacto', async (campo, valor) => {
    const dto = plainToInstance(Dto, { ...base, [campo]: valor });
    const errorDelCampo = (await validate(dto)).find((e) => e.property === campo);
    expect(errorDelCampo).toBeUndefined();
  });
});
