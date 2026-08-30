/**
 * Tope de largo de `nombre` en las dos rutas del ABM de ciclos vigentes. El
 * límite no se declara acá: se importa de `CicloVigenteEntity`, la autoridad.
 *
 * Sin este tope el valor llegaba a la columna `VarChar(100)` y moría con 22001
 * — un 500 crudo que ni siquiera nombra el campo.
 */
import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateCicloVigenteDto, UpdateCicloVigenteDto } from './ciclo-vigente.dto';
import { CICLO_VIGENTE_NOMBRE_MAX_LENGTH } from '../../domain/entities/ciclo-vigente.entity';

const FECHAS = { fechaInicio: '2026-01-01', fechaFin: '2026-12-31' };
const errorDe = async (dto: object) => (await validate(dto)).find((e) => e.property === 'nombre');

describe('CreateCicloVigenteDto — tope de nombre', () => {
  it('acepta un nombre en el límite exacto', async () => {
    const dto = plainToInstance(CreateCicloVigenteDto, {
      ...FECHAS,
      nombre: 'A'.repeat(CICLO_VIGENTE_NOMBRE_MAX_LENGTH),
    });
    expect(await errorDe(dto)).toBeUndefined();
  });

  it('rechaza un nombre que pasa el tope, y POR el tope', async () => {
    const dto = plainToInstance(CreateCicloVigenteDto, {
      ...FECHAS,
      nombre: 'A'.repeat(CICLO_VIGENTE_NOMBRE_MAX_LENGTH + 1),
    });
    expect((await errorDe(dto))?.constraints).toHaveProperty('maxLength');
  });

  it('sigue rechazando el nombre vacío: el tope no reemplaza al mínimo', async () => {
    const dto = plainToInstance(CreateCicloVigenteDto, { ...FECHAS, nombre: '' });
    expect(await errorDe(dto)).toBeDefined();
  });
});

describe('UpdateCicloVigenteDto — tope de nombre', () => {
  it('rechaza un nombre que pasa el tope', async () => {
    const dto = plainToInstance(UpdateCicloVigenteDto, {
      nombre: 'A'.repeat(CICLO_VIGENTE_NOMBRE_MAX_LENGTH + 1),
    });
    expect((await errorDe(dto))?.constraints).toHaveProperty('maxLength');
  });

  it('sigue aceptando un patch que no toca el nombre', async () => {
    const dto = plainToInstance(UpdateCicloVigenteDto, {});
    expect(await errorDe(dto)).toBeUndefined();
  });
});
