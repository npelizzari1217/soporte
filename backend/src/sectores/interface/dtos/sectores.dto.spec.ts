import { describe, expect, it } from 'vitest';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateSectorDto, toSectorResponseDto } from './sectores.dto';
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

describe('toSectorResponseDto (WU-07)', () => {
  it('mapea la entidad al shape de respuesta HTTP', () => {
    const sector = SectorEntity.create({ codigo: 'A', nombre: 'A', activo: true });
    const dto = toSectorResponseDto(sector);
    expect(dto.codigo).toBe('A');
    expect(typeof dto.createdAt).toBe('string');
  });
});
