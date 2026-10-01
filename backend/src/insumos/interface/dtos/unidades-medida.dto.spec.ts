import { describe, expect, it } from 'vitest';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import {
  CreateUnidadMedidaDto,
  EditUnidadMedidaDto,
  toUnidadMedidaResponseDto,
} from './unidades-medida.dto';
import {
  UnidadMedidaEntity,
  UNIDAD_MEDIDA_CODIGO_MAX_LENGTH,
  UNIDAD_MEDIDA_NOMBRE_MAX_LENGTH,
} from '../../domain/entities/unidad-medida.entity';

describe('CreateUnidadMedidaDto', () => {
  it('acepta codigo en minúscula y lo deja normalizado a mayúscula', async () => {
    const dto = plainToInstance(CreateUnidadMedidaDto, { codigo: ' un ', nombre: 'Unidad' });
    expect(await validate(dto)).toHaveLength(0);
    expect(dto.codigo).toBe('UN');
  });

  it('rechaza codigo con espacios internos o símbolos', async () => {
    const dto = plainToInstance(CreateUnidadMedidaDto, { codigo: 'M 2!', nombre: 'Metro' });
    expect(await validate(dto)).not.toHaveLength(0);
  });

  it('acepta `entera` booleana y la deja ausente si no viene', async () => {
    const con = plainToInstance(CreateUnidadMedidaDto, { codigo: 'UN', nombre: 'U', entera: true });
    const sin = plainToInstance(CreateUnidadMedidaDto, { codigo: 'UN', nombre: 'U' });
    expect(await validate(con)).toHaveLength(0);
    expect(await validate(sin)).toHaveLength(0);
    expect(con.entera).toBe(true);
    expect(sin.entera).toBeUndefined();
  });

  it('rechaza `entera` que no es booleana', async () => {
    const dto = plainToInstance(CreateUnidadMedidaDto, {
      codigo: 'UN',
      nombre: 'U',
      entera: 'si',
    });
    expect(await validate(dto)).not.toHaveLength(0);
  });

  it('acepta codigo válido (mayúsculas/números/guion bajo)', async () => {
    const dto = plainToInstance(CreateUnidadMedidaDto, { codigo: 'M2', nombre: 'Metro cuadrado' });
    expect(await validate(dto)).toHaveLength(0);
  });
});

/**
 * Los topes de largo están declarados en LOS DOS DTOs (alta y edición).
 * Recorrer los dos no es redundancia: con un solo caso, borrar el decorador de
 * `EditUnidadMedidaDto` no pone nada en rojo y el camino PATCH queda sin guard.
 *
 * `unidades_medida.codigo` es `VarChar(20)` y `nombre` `VarChar(50)`. Sin estos
 * guards el valor atraviesa DTO y dominio intactos y lo frena recién Postgres,
 * con un error de driver que no nombra el campo.
 */
describe.each([
  ['CreateUnidadMedidaDto', CreateUnidadMedidaDto],
  ['EditUnidadMedidaDto', EditUnidadMedidaDto],
])('%s — topes de largo espejando la columna', (_nombre, Dto) => {
  it('rechaza codigo de más de 20 caracteres', async () => {
    const dto = plainToInstance(Dto, {
      codigo: 'A'.repeat(UNIDAD_MEDIDA_CODIGO_MAX_LENGTH + 1),
      nombre: 'Unidad',
    });
    expect(await validate(dto)).not.toHaveLength(0);
  });

  it('acepta codigo de exactamente 20 caracteres (límite inclusive)', async () => {
    const dto = plainToInstance(Dto, {
      codigo: 'A'.repeat(UNIDAD_MEDIDA_CODIGO_MAX_LENGTH),
      nombre: 'Unidad',
    });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('rechaza nombre de más de 50 caracteres', async () => {
    const dto = plainToInstance(Dto, {
      codigo: 'UN',
      nombre: 'N'.repeat(UNIDAD_MEDIDA_NOMBRE_MAX_LENGTH + 1),
    });
    expect(await validate(dto)).not.toHaveLength(0);
  });

  it('acepta nombre de exactamente 50 caracteres (límite inclusive)', async () => {
    const dto = plainToInstance(Dto, {
      codigo: 'UN',
      nombre: 'N'.repeat(UNIDAD_MEDIDA_NOMBRE_MAX_LENGTH),
    });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('recorta los espacios de borde del nombre', async () => {
    const dto = plainToInstance(Dto, { codigo: 'UN', nombre: '  Unidad  ' });
    expect(await validate(dto)).toHaveLength(0);
    expect(dto.nombre).toBe('Unidad');
  });

  /**
   * El recorte del `nombre` corre ANTES del mínimo de largo. Corriendo
   * después, `'   '` pasaría el `@MinLength(1)` midiendo 3 caracteres y recién
   * entonces quedaría en cadena vacía: un nombre en blanco persistido.
   */
  it('rechaza un nombre de solo espacios', async () => {
    const dto = plainToInstance(Dto, { codigo: 'UN', nombre: '   ' });
    expect(await validate(dto)).not.toHaveLength(0);
  });

  /**
   * El tope se mide sobre el codigo YA NORMALIZADO: `'ß'.toUpperCase()` es
   * `'SS'`, así que 20 `ß` crudos son 40 caracteres en la columna. Midiendo el
   * crudo, este valor pasa el DTO y explota recién en Postgres.
   */
  it('rechaza un codigo que entra crudo pero se pasa del tope al normalizarse', async () => {
    const dto = plainToInstance(Dto, {
      codigo: 'ß'.repeat(UNIDAD_MEDIDA_CODIGO_MAX_LENGTH),
      nombre: 'Unidad',
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

describe('toUnidadMedidaResponseDto', () => {
  it('mapea la entidad al shape de respuesta HTTP', () => {
    const unidad = UnidadMedidaEntity.create({ codigo: 'A', nombre: 'A', activo: true });
    const dto = toUnidadMedidaResponseDto(unidad);
    expect(dto.codigo).toBe('A');
    expect(typeof dto.createdAt).toBe('string');
  });

  it('incluye `entera` en la respuesta', () => {
    const entera = UnidadMedidaEntity.create({
      codigo: 'A',
      nombre: 'A',
      activo: true,
      entera: true,
    });
    const comun = UnidadMedidaEntity.create({ codigo: 'B', nombre: 'B', activo: true });
    expect(toUnidadMedidaResponseDto(entera).entera).toBe(true);
    expect(toUnidadMedidaResponseDto(comun).entera).toBe(false);
  });
});
