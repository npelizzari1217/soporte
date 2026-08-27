import { describe, expect, it } from 'vitest';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateSectorDto, EditSectorDto, toSectorResponseDto } from './sectores.dto';
import { SectorEntity } from '../../domain/entities/sector.entity';

describe('CreateSectorDto (WU-07)', () => {
  it('rechaza codigo en minúsculas', async () => {
    const dto = plainToInstance(CreateSectorDto, { codigo: 'computacion', nombre: 'Computación' });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('acepta codigo válido (mayúsculas/números/guion bajo)', async () => {
    const dto = plainToInstance(CreateSectorDto, {
      codigo: 'COMPUTACION_1',
      nombre: 'Computación',
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });
});

/**
 * Los topes de largo están declarados a mano en LOS DOS DTOs (alta y edición).
 * Recorrer los dos no es redundancia: con un solo caso, borrar el decorador de
 * `EditSectorDto` no pone nada en rojo y el camino PATCH queda sin guard —
 * medido durante la revisión de este mismo cambio.
 *
 * sdd/filtro-prisma H5 — `Sector.codigo` es `VarChar(50)` y `Sector.nombre`
 * `VarChar(100)`. Sin estos guards el valor atraviesa DTO y dominio intactos y
 * lo frena recién Postgres, que devuelve un error de driver sin nombrar campo.
 */
describe.each([
  ['CreateSectorDto', CreateSectorDto],
  ['EditSectorDto', EditSectorDto],
])('%s — topes de largo espejando la columna', (_nombre, Dto) => {
  it('rechaza codigo de más de 50 caracteres', async () => {
    const dto = plainToInstance(Dto, { codigo: 'A'.repeat(51), nombre: 'Computación' });
    expect(await validate(dto)).not.toHaveLength(0);
  });

  it('acepta codigo de exactamente 50 caracteres (límite inclusive)', async () => {
    const dto = plainToInstance(Dto, { codigo: 'A'.repeat(50), nombre: 'Computación' });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('rechaza nombre de más de 100 caracteres', async () => {
    const dto = plainToInstance(Dto, { codigo: 'COMPUTACION', nombre: 'N'.repeat(101) });
    expect(await validate(dto)).not.toHaveLength(0);
  });

  it('acepta nombre de exactamente 100 caracteres (límite inclusive)', async () => {
    const dto = plainToInstance(Dto, { codigo: 'COMPUTACION', nombre: 'N'.repeat(100) });
    expect(await validate(dto)).toHaveLength(0);
  });
});

describe('toSectorResponseDto (WU-07)', () => {
  it('mapea la entidad al shape de respuesta HTTP', () => {
    const sector = SectorEntity.create({ codigo: 'A', nombre: 'A', activo: true });
    const dto = toSectorResponseDto(sector);
    expect(dto.codigo).toBe('A');
    expect(typeof dto.createdAt).toBe('string');
  });
});
