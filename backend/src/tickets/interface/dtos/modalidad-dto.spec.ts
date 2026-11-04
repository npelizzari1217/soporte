import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateTicketDto, EditTicketDto } from './ticket.dto';
import {
  CreateTicketEdilicioHttpDto,
  EditarReparacionHttpDto,
} from '../../../reparaciones/interface/dtos/reparaciones.dto';

/** Propiedades con error al validar `body` contra `cls`. */
async function propiedadesConError(cls: new () => object, body: object): Promise<string[]> {
  return (await validate(plainToInstance(cls, body))).map((e) => e.property);
}

describe('modalidad en los DTO HTTP (odd/edilicia-obra-externa, S1)', () => {
  it.each([
    ['EditTicketDto', EditTicketDto],
    ['EditarReparacionHttpDto', EditarReparacionHttpDto],
  ])(
    '%s rechaza null: un null no puede volver INTERNA en silencio a un ticket EXTERNA',
    async (_, cls) => {
      expect(await propiedadesConError(cls, { modalidad: null })).toContain('modalidad');
    },
  );

  it.each([
    ['CreateTicketDto', CreateTicketDto],
    ['CreateTicketEdilicioHttpDto', CreateTicketEdilicioHttpDto],
    ['EditTicketDto', EditTicketDto],
    ['EditarReparacionHttpDto', EditarReparacionHttpDto],
  ])('%s rechaza valores fuera del catalogo y acepta el catalogo', async (_, cls) => {
    for (const v of [null, 'externa', '', 'MIXTA']) {
      expect(await propiedadesConError(cls, { modalidad: v })).toContain('modalidad');
    }
    for (const v of ['INTERNA', 'EXTERNA']) {
      expect(await propiedadesConError(cls, { modalidad: v })).not.toContain('modalidad');
    }
    expect(await propiedadesConError(cls, {})).not.toContain('modalidad');
  });
});
