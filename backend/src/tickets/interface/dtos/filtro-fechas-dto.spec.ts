/**
 * [UNIT] Borde de entrada del filtro Desde/Hasta (odd/autor-y-filtro-fechas, S2): una fecha vacía
 * (`?fechaDesde=`, solo posible con una URL tipeada) la rechaza el DTO con un 400 antes de llegar a
 * `instanteDesde`/`instanteHasta`, que por eso no la contemplan. Si este test se pone rojo, esos
 * helpers pasan a recibir `""` y hay que tratarlo ahí.
 */
import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ExportarTicketsQueryDto, ListTicketsQueryDto } from './ticket.dto';

async function propiedadesConError(cls: new () => object, query: object): Promise<string[]> {
  return (await validate(plainToInstance(cls, query))).map((e) => e.property);
}

describe('filtro de fechas en los DTO de query de tickets', () => {
  it.each([
    ['ListTicketsQueryDto', ListTicketsQueryDto],
    ['ExportarTicketsQueryDto', ExportarTicketsQueryDto],
  ])('%s rechaza una fecha vacía en los dos bordes', async (_, cls) => {
    expect(await propiedadesConError(cls, { fechaDesde: '', fechaHasta: '' })).toEqual([
      'fechaDesde',
      'fechaHasta',
    ]);
  });

  it.each([
    ['ListTicketsQueryDto', ListTicketsQueryDto],
    ['ExportarTicketsQueryDto', ExportarTicketsQueryDto],
  ])('%s acepta una fecha sola y la ausencia de fechas', async (_, cls) => {
    expect(
      await propiedadesConError(cls, { fechaDesde: '2026-01-01', fechaHasta: '2026-12-31' }),
    ).toEqual([]);
    expect(await propiedadesConError(cls, {})).toEqual([]);
  });
});
