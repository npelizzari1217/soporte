import { describe, expect, it } from 'vitest';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import {
  CreateFamiliaInsumoDto,
  EditFamiliaInsumoDto,
  toFamiliaInsumoResponseDto,
} from './familias-insumo.dto';
import {
  FamiliaInsumoEntity,
  FAMILIA_INSUMO_CODIGO_MAX_LENGTH,
  FAMILIA_INSUMO_NOMBRE_MAX_LENGTH,
} from '../../domain/entities/familia-insumo.entity';

describe('CreateFamiliaInsumoDto', () => {
  it('acepta codigo en minúscula y lo deja normalizado a mayúscula', async () => {
    const dto = plainToInstance(CreateFamiliaInsumoDto, { codigo: ' toner ', nombre: 'Tóner' });
    expect(await validate(dto)).toHaveLength(0);
    expect(dto.codigo).toBe('TONER');
  });

  it('rechaza codigo con espacios internos o símbolos', async () => {
    const dto = plainToInstance(CreateFamiliaInsumoDto, {
      codigo: 'TONER HP!',
      nombre: 'Tóner HP',
    });
    expect(await validate(dto)).not.toHaveLength(0);
  });

  it('acepta codigo válido (mayúsculas/números/guion bajo)', async () => {
    const dto = plainToInstance(CreateFamiliaInsumoDto, {
      codigo: 'TONER_1',
      nombre: 'Tóner',
    });
    expect(await validate(dto)).toHaveLength(0);
  });
});

/**
 * Los topes de largo están declarados en LOS DOS DTOs (alta y edición).
 * Recorrer los dos no es redundancia: con un solo caso, borrar el decorador de
 * `EditFamiliaInsumoDto` no pone nada en rojo y el camino PATCH queda sin
 * guard.
 *
 * `familias_insumo.codigo` es `VarChar(30)` y `nombre` `VarChar(100)`. Sin
 * estos guards el valor atraviesa DTO y dominio intactos y lo frena recién
 * Postgres, con un error de driver que no nombra el campo.
 */
describe.each([
  ['CreateFamiliaInsumoDto', CreateFamiliaInsumoDto],
  ['EditFamiliaInsumoDto', EditFamiliaInsumoDto],
])('%s — topes de largo espejando la columna', (_nombre, Dto) => {
  it('rechaza codigo de más de 30 caracteres', async () => {
    const dto = plainToInstance(Dto, {
      codigo: 'A'.repeat(FAMILIA_INSUMO_CODIGO_MAX_LENGTH + 1),
      nombre: 'Tóner',
    });
    expect(await validate(dto)).not.toHaveLength(0);
  });

  it('acepta codigo de exactamente 30 caracteres (límite inclusive)', async () => {
    const dto = plainToInstance(Dto, {
      codigo: 'A'.repeat(FAMILIA_INSUMO_CODIGO_MAX_LENGTH),
      nombre: 'Tóner',
    });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('rechaza nombre de más de 100 caracteres', async () => {
    const dto = plainToInstance(Dto, {
      codigo: 'TONER',
      nombre: 'N'.repeat(FAMILIA_INSUMO_NOMBRE_MAX_LENGTH + 1),
    });
    expect(await validate(dto)).not.toHaveLength(0);
  });

  it('acepta nombre de exactamente 100 caracteres (límite inclusive)', async () => {
    const dto = plainToInstance(Dto, {
      codigo: 'TONER',
      nombre: 'N'.repeat(FAMILIA_INSUMO_NOMBRE_MAX_LENGTH),
    });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('recorta los espacios de borde del nombre', async () => {
    const dto = plainToInstance(Dto, { codigo: 'TONER', nombre: '  Tóner  ' });
    expect(await validate(dto)).toHaveLength(0);
    expect(dto.nombre).toBe('Tóner');
  });

  /**
   * El recorte del `nombre` corre ANTES del mínimo de largo. Corriendo
   * después, `'   '` pasaría el `@MinLength(1)` midiendo 3 caracteres y recién
   * entonces quedaría en cadena vacía: un nombre en blanco persistido.
   */
  it('rechaza un nombre de solo espacios', async () => {
    const dto = plainToInstance(Dto, { codigo: 'TONER', nombre: '   ' });
    expect(await validate(dto)).not.toHaveLength(0);
  });

  /**
   * El tope se mide sobre el codigo YA NORMALIZADO: `'ß'.toUpperCase()` es
   * `'SS'`, así que 30 `ß` crudos son 60 caracteres en la columna. Midiendo el
   * crudo, este valor pasa el DTO y explota recién en Postgres.
   */
  it('rechaza un codigo que entra crudo pero se pasa del tope al normalizarse', async () => {
    const dto = plainToInstance(Dto, {
      codigo: 'ß'.repeat(FAMILIA_INSUMO_CODIGO_MAX_LENGTH),
      nombre: 'Tóner',
    });

    // Se asserta la restricción `maxLength` en particular, no "hubo algún
    // error": la `ß` cruda tampoco pasa el `@Matches`, así que un
    // `not.toHaveLength(0)` quedaría verde por el patrón aunque el tope se
    // midiera sobre el valor sin normalizar. Medido con un mutante: sacando el
    // `@Transform`, la aserción genérica seguía pasando.
    const errores = await validate(dto);
    const restricciones = errores.flatMap((e) => Object.keys(e.constraints ?? {}));
    expect(restricciones).toContain('maxLength');
  });
});

describe('toFamiliaInsumoResponseDto', () => {
  it('mapea la entidad al shape de respuesta HTTP', () => {
    const familia = FamiliaInsumoEntity.create({ codigo: 'A', nombre: 'A', activo: true });
    const dto = toFamiliaInsumoResponseDto(familia);
    expect(dto.codigo).toBe('A');
    expect(typeof dto.createdAt).toBe('string');
  });
});
