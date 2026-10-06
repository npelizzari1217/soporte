/**
 * catalogo.dto.spec.ts — WU-5 (sdd/sla-primera-respuesta-y-pausa, R2): la meta de
 * primera respuesta de `POST/PATCH /catalogos/prioridades` es opcional, `null` la
 * limpia y 0 o un negativo se rechazan en la API.
 */
import 'reflect-metadata';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { PrioridadEntity } from '../../domain/entities/prioridad.entity';
import { CreatePrioridadDto, EditPrioridadDto, toPrioridadResponseDto } from './catalogo.dto';

const base = { codigo: 'ALTA', nombre: 'Alta', orden: 30 };

async function erroresDe(dto: object): Promise<string[]> {
  return (await validate(dto)).map((e) => e.property);
}

describe('DTOs de prioridad — slaPrimeraRespuestaHoras', () => {
  it.each([
    ['omitido', {}],
    ['null (sin meta)', { slaPrimeraRespuestaHoras: null }],
    ['4', { slaPrimeraRespuestaHoras: 4 }],
  ])('POST acepta %s', async (_caso, extra) => {
    const dto = plainToInstance(CreatePrioridadDto, { ...base, ...extra });
    expect(await erroresDe(dto)).toEqual([]);
  });

  it.each([0, -1, 1.5])('POST rechaza %s', async (valor) => {
    const dto = plainToInstance(CreatePrioridadDto, { ...base, slaPrimeraRespuestaHoras: valor });
    expect(await erroresDe(dto)).toEqual(['slaPrimeraRespuestaHoras']);
  });

  it.each([0, -3])('PATCH rechaza %s', async (valor) => {
    const dto = plainToInstance(EditPrioridadDto, { slaPrimeraRespuestaHoras: valor });
    expect(await erroresDe(dto)).toEqual(['slaPrimeraRespuestaHoras']);
  });

  it('PATCH acepta null (limpia la meta) y un entero positivo', async () => {
    for (const valor of [null, 2]) {
      const dto = plainToInstance(EditPrioridadDto, { slaPrimeraRespuestaHoras: valor });
      expect(await erroresDe(dto)).toEqual([]);
    }
  });

  it('la respuesta expone la meta, o null si no hay', () => {
    const con = PrioridadEntity.create({
      ...base,
      color: null,
      activo: true,
      slaPrimeraRespuestaHoras: 4,
    });
    const sin = PrioridadEntity.create({ ...base, color: null, activo: true });

    expect(toPrioridadResponseDto(con).slaPrimeraRespuestaHoras).toBe(4);
    expect(toPrioridadResponseDto(sin).slaPrimeraRespuestaHoras).toBeNull();
  });
});
