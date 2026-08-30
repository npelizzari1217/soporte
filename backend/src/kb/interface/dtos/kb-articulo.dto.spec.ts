/**
 * Tope de largo de `titulo` en las dos rutas del ABM de la Ayuda. El límite no
 * se declara acá: se importa de `KbArticuloEntity`, la autoridad.
 *
 * `contenido` no lleva tope y no es un olvido: su columna es `@db.Text`.
 */
import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateKbArticuloDto, EditKbArticuloDto } from './kb-articulo.dto';
import { KB_TITULO_MAX_LENGTH } from '../../domain/entities/kb-articulo.entity';

const errorDe = async (dto: object, campo: string) =>
  (await validate(dto)).find((e) => e.property === campo);

describe('CreateKbArticuloDto — tope de titulo', () => {
  const BASE = { contenido: 'Contenido del artículo' };

  it('acepta un titulo en el límite exacto', async () => {
    const dto = plainToInstance(CreateKbArticuloDto, {
      ...BASE,
      titulo: 'A'.repeat(KB_TITULO_MAX_LENGTH),
    });
    expect(await errorDe(dto, 'titulo')).toBeUndefined();
  });

  it('rechaza un titulo que pasa el tope, y POR el tope', async () => {
    const dto = plainToInstance(CreateKbArticuloDto, {
      ...BASE,
      titulo: 'A'.repeat(KB_TITULO_MAX_LENGTH + 1),
    });
    expect((await errorDe(dto, 'titulo'))?.constraints).toHaveProperty('maxLength');
  });

  it('NO acota el contenido: su columna es Text', async () => {
    const dto = plainToInstance(CreateKbArticuloDto, {
      titulo: 'Cómo cargar un ticket',
      contenido: 'x'.repeat(KB_TITULO_MAX_LENGTH * 100),
    });
    expect(await errorDe(dto, 'contenido')).toBeUndefined();
  });
});

describe('EditKbArticuloDto — tope de titulo', () => {
  it('rechaza un titulo que pasa el tope', async () => {
    const dto = plainToInstance(EditKbArticuloDto, {
      titulo: 'A'.repeat(KB_TITULO_MAX_LENGTH + 1),
    });
    expect((await errorDe(dto, 'titulo'))?.constraints).toHaveProperty('maxLength');
  });

  it('sigue aceptando un patch que no toca el titulo', async () => {
    const dto = plainToInstance(EditKbArticuloDto, { contenido: 'Nuevo contenido' });
    expect(await errorDe(dto, 'titulo')).toBeUndefined();
  });
});
