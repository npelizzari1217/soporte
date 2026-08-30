/**
 * Topes de largo de `codigo` y `nombre`. El límite no se declara acá: se importa
 * de `TipoComponente`, que es la autoridad.
 *
 * El punto delicado es `codigo`: el dominio lo normaliza con
 * `trim().toUpperCase()`, y `toUpperCase()` puede AGRANDAR el string. Si el
 * borde midiera el crudo, un código de 50 'ß' pasaría el DTO y llegaría a la
 * columna convertido en 100 'S'. Por eso el DTO aplica la MISMA función de
 * normalización antes de medir — rama 3 de la "regla de tres ramas".
 */
import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CrearTipoComponenteDto, RenombrarTipoComponenteDto } from './tipos-componente.dto';
import {
  TIPO_COMPONENTE_CODIGO_MAX_LENGTH,
  TIPO_COMPONENTE_NOMBRE_MAX_LENGTH,
} from '../../domain/entities/tipo-componente.entity';

const errorDe = async (dto: object, campo: string) =>
  (await validate(dto)).find((e) => e.property === campo);

describe('CrearTipoComponenteDto — topes de largo', () => {
  it('acepta codigo y nombre en el límite exacto', async () => {
    const dto = plainToInstance(CrearTipoComponenteDto, {
      codigo: 'A'.repeat(TIPO_COMPONENTE_CODIGO_MAX_LENGTH),
      nombre: 'B'.repeat(TIPO_COMPONENTE_NOMBRE_MAX_LENGTH),
    });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('rechaza un codigo que pasa el tope', async () => {
    const dto = plainToInstance(CrearTipoComponenteDto, {
      codigo: 'A'.repeat(TIPO_COMPONENTE_CODIGO_MAX_LENGTH + 1),
      nombre: 'CPU',
    });
    expect((await errorDe(dto, 'codigo'))?.constraints).toHaveProperty('maxLength');
  });

  it('rechaza un nombre que pasa el tope', async () => {
    const dto = plainToInstance(CrearTipoComponenteDto, {
      codigo: 'CPU',
      nombre: 'B'.repeat(TIPO_COMPONENTE_NOMBRE_MAX_LENGTH + 1),
    });
    expect((await errorDe(dto, 'nombre'))?.constraints).toHaveProperty('maxLength');
  });

  /**
   * EL CASO QUE JUSTIFICA EL `@Transform`: 50 'ß' entran en el tope crudo, pero
   * normalizados son 100 'S'. Sin normalizar antes de medir, esto pasaba el
   * borde y reventaba en la columna de 50.
   */
  it('rechaza un codigo que entra crudo pero se EXPANDE al normalizar', async () => {
    const crudo = 'ß'.repeat(TIPO_COMPONENTE_CODIGO_MAX_LENGTH);
    expect(crudo).toHaveLength(TIPO_COMPONENTE_CODIGO_MAX_LENGTH);
    const dto = plainToInstance(CrearTipoComponenteDto, { codigo: crudo, nombre: 'CPU' });
    expect((await errorDe(dto, 'codigo'))?.constraints).toHaveProperty('maxLength');
  });

  /** Hermano invertido: un código normal, con espacios y minúsculas, sigue pasando. */
  it('acepta un codigo normal que la normalización no agranda', async () => {
    const dto = plainToInstance(CrearTipoComponenteDto, { codigo: '  ram-ddr4  ', nombre: 'RAM' });
    expect(await validate(dto)).toHaveLength(0);
  });
});

describe('RenombrarTipoComponenteDto — tope de nombre', () => {
  it('acepta un nombre en el límite exacto', async () => {
    const dto = plainToInstance(RenombrarTipoComponenteDto, {
      nombre: 'B'.repeat(TIPO_COMPONENTE_NOMBRE_MAX_LENGTH),
    });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('rechaza un nombre que pasa el tope', async () => {
    const dto = plainToInstance(RenombrarTipoComponenteDto, {
      nombre: 'B'.repeat(TIPO_COMPONENTE_NOMBRE_MAX_LENGTH + 1),
    });
    expect((await errorDe(dto, 'nombre'))?.constraints).toHaveProperty('maxLength');
  });
});
