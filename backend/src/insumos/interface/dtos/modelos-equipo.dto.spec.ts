import { describe, expect, it } from 'vitest';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import {
  CreateModeloEquipoDto,
  EditModeloEquipoDto,
  toModeloEquipoResponseDto,
} from './modelos-equipo.dto';
import {
  ModeloEquipoEntity,
  MODELO_EQUIPO_MARCA_MAX_LENGTH,
  MODELO_EQUIPO_MODELO_MAX_LENGTH,
} from '../../domain/entities/modelo-equipo.entity';

describe('CreateModeloEquipoDto', () => {
  it('acepta marca en minúscula y la deja normalizada a mayúscula', async () => {
    const dto = plainToInstance(CreateModeloEquipoDto, {
      marca: ' hp ',
      modelo: 'LaserJet Pro M404',
    });
    expect(await validate(dto)).toHaveLength(0);
    expect(dto.marca).toBe('HP');
  });

  /**
   * La marca es texto libre en mayúscula, NO un código: "HEWLETT PACKARD"
   * lleva un espacio interno y tiene que entrar. Un patrón como el de
   * `codigo` en los otros dos catálogos la rechazaría.
   */
  it('acepta una marca con espacio interno', async () => {
    const dto = plainToInstance(CreateModeloEquipoDto, {
      marca: 'Hewlett Packard',
      modelo: 'M404',
    });
    expect(await validate(dto)).toHaveLength(0);
    expect(dto.marca).toBe('HEWLETT PACKARD');
  });
});

/**
 * Los topes de largo están declarados en LOS DOS DTOs (alta y edición).
 * Recorrer los dos no es redundancia: con un solo caso, borrar el decorador de
 * `EditModeloEquipoDto` no pone nada en rojo y el camino PATCH queda sin
 * guard.
 *
 * `modelos_equipo.marca` es `VarChar(100)` y `modelo` `VarChar(150)`. Sin
 * estos guards el valor atraviesa DTO y dominio intactos y lo frena recién
 * Postgres, con un error de driver que no nombra el campo.
 */
describe.each([
  ['CreateModeloEquipoDto', CreateModeloEquipoDto],
  ['EditModeloEquipoDto', EditModeloEquipoDto],
])('%s — topes de largo espejando la columna', (_nombre, Dto) => {
  it('rechaza marca de más de 100 caracteres', async () => {
    const dto = plainToInstance(Dto, {
      marca: 'A'.repeat(MODELO_EQUIPO_MARCA_MAX_LENGTH + 1),
      modelo: 'M404',
    });
    expect(await validate(dto)).not.toHaveLength(0);
  });

  it('acepta marca de exactamente 100 caracteres (límite inclusive)', async () => {
    const dto = plainToInstance(Dto, {
      marca: 'A'.repeat(MODELO_EQUIPO_MARCA_MAX_LENGTH),
      modelo: 'M404',
    });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('rechaza modelo de más de 150 caracteres', async () => {
    const dto = plainToInstance(Dto, {
      marca: 'HP',
      modelo: 'M'.repeat(MODELO_EQUIPO_MODELO_MAX_LENGTH + 1),
    });
    expect(await validate(dto)).not.toHaveLength(0);
  });

  it('acepta modelo de exactamente 150 caracteres (límite inclusive)', async () => {
    const dto = plainToInstance(Dto, {
      marca: 'HP',
      modelo: 'M'.repeat(MODELO_EQUIPO_MODELO_MAX_LENGTH),
    });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('recorta los espacios de borde del modelo sin gritarlo', async () => {
    const dto = plainToInstance(Dto, { marca: 'HP', modelo: '  LaserJet Pro M404  ' });
    expect(await validate(dto)).toHaveLength(0);
    expect(dto.modelo).toBe('LaserJet Pro M404');
  });

  /**
   * El recorte del `modelo` corre ANTES del mínimo de largo. Corriendo
   * después, `'   '` pasaría el `@MinLength(1)` midiendo 3 caracteres y recién
   * entonces quedaría en cadena vacía: un modelo en blanco persistido.
   */
  it('rechaza un modelo de solo espacios', async () => {
    const dto = plainToInstance(Dto, { marca: 'HP', modelo: '   ' });
    expect(await validate(dto)).not.toHaveLength(0);
  });

  /** Hermano del caso de arriba, del lado de la marca. */
  it('rechaza una marca de solo espacios', async () => {
    const dto = plainToInstance(Dto, { marca: '   ', modelo: 'M404' });
    expect(await validate(dto)).not.toHaveLength(0);
  });

  /**
   * El tope se mide sobre la marca YA NORMALIZADA: `'ß'.toUpperCase()` es
   * `'SS'`, así que 100 `ß` crudas son 200 caracteres en la columna. Midiendo
   * el crudo, este valor pasa el DTO y explota recién en Postgres.
   *
   * Se assertea la restricción `maxLength` EN PARTICULAR, no "hubo algún
   * error": la marca tiene además `@MinLength(1)` y `@IsString`, así que un
   * `not.toHaveLength(0)` podría quedar verde por otra regla aunque el tope se
   * midiera sobre el valor sin normalizar.
   */
  it('rechaza una marca que entra cruda pero se pasa del tope al normalizarse', async () => {
    const dto = plainToInstance(Dto, {
      marca: 'ß'.repeat(MODELO_EQUIPO_MARCA_MAX_LENGTH),
      modelo: 'M404',
    });

    const errores = await validate(dto);
    const restricciones = errores.flatMap((e) => Object.keys(e.constraints ?? {}));
    expect(restricciones).toContain('maxLength');
  });
});

describe('toModeloEquipoResponseDto', () => {
  it('mapea la entidad al shape de respuesta HTTP', () => {
    const modelo = ModeloEquipoEntity.create({
      marca: 'HP',
      modelo: 'LaserJet Pro M404',
      activo: true,
    });
    const dto = toModeloEquipoResponseDto(modelo);
    expect(dto.marca).toBe('HP');
    expect(dto.modelo).toBe('LaserJet Pro M404');
    expect(typeof dto.createdAt).toBe('string');
  });
});
