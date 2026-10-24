/**
 * preventivo.dto.spec.ts — borde HTTP de la anticipación del plan
 * (odd/preventivo-anticipacion T1, S5/S6).
 *
 * El DTO valida la FORMA de cada campo (entero >= 0, unidad del catálogo); la
 * regla entre campos (anticipación menor que la cadencia) es del dominio, como
 * el objetivo excluyente. Cada assert mira el error DEL CAMPO y por SU
 * restricción: un DTO que rechazara por otra propiedad daría verde igual.
 */
import 'reflect-metadata';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import {
  CreatePlanPreventivoHttpDto,
  EditarPlanPreventivoHttpDto,
  toPlanPreventivoResponseDto,
} from './preventivo.dto';
import { PlanPreventivoEntity } from '../../domain/entities/plan-preventivo.entity';

const BASE_CREAR = {
  titulo: 'Plan test',
  ubicacion: 'DEPOSITO',
  prioridadId: '00000000-0000-4000-8000-000000000002',
  responsableId: '00000000-0000-4000-8000-000000000003',
  intervaloValor: 1,
  intervaloUnidad: 'MESES',
  fechaInicio: '2026-01-01',
};

async function erroresDe<T extends object>(
  clase: new () => T,
  body: Record<string, unknown>,
  propiedad: string,
): Promise<Record<string, string> | undefined> {
  const dto = plainToInstance(clase, body);
  return (await validate(dto)).find((e) => e.property === propiedad)?.constraints;
}

describe('CreatePlanPreventivoHttpDto — anticipación', () => {
  it('sin anticipación es válido (el dominio la toma como 0 días)', async () => {
    const dto = plainToInstance(CreatePlanPreventivoHttpDto, BASE_CREAR);

    expect(await validate(dto)).toEqual([]);
  });

  it('acepta anticipacionValor 0 (límite inferior inclusive)', async () => {
    const errores = await erroresDe(
      CreatePlanPreventivoHttpDto,
      { ...BASE_CREAR, anticipacionValor: 0, anticipacionUnidad: 'DIAS' },
      'anticipacionValor',
    );

    expect(errores).toBeUndefined();
  });

  it('rechaza anticipacionValor negativo, por min', async () => {
    const errores = await erroresDe(
      CreatePlanPreventivoHttpDto,
      { ...BASE_CREAR, anticipacionValor: -1 },
      'anticipacionValor',
    );

    expect(errores).toHaveProperty('min');
  });

  it('rechaza anticipacionValor no entero, por isInt', async () => {
    const errores = await erroresDe(
      CreatePlanPreventivoHttpDto,
      { ...BASE_CREAR, anticipacionValor: 1.5 },
      'anticipacionValor',
    );

    expect(errores).toHaveProperty('isInt');
  });

  it('rechaza una unidad de anticipación fuera del catálogo, por isIn', async () => {
    const errores = await erroresDe(
      CreatePlanPreventivoHttpDto,
      { ...BASE_CREAR, anticipacionValor: 1, anticipacionUnidad: 'SEMANAS' },
      'anticipacionUnidad',
    );

    expect(errores).toHaveProperty('isIn');
  });
});

describe('EditarPlanPreventivoHttpDto — anticipación', () => {
  it('acepta anticipacionValor 0 y rechaza -1', async () => {
    const cero = await erroresDe(
      EditarPlanPreventivoHttpDto,
      { anticipacionValor: 0 },
      'anticipacionValor',
    );
    const negativo = await erroresDe(
      EditarPlanPreventivoHttpDto,
      { anticipacionValor: -1 },
      'anticipacionValor',
    );

    expect(cero).toBeUndefined();
    expect(negativo).toHaveProperty('min');
  });

  it('rechaza una unidad de anticipación fuera del catálogo, por isIn', async () => {
    const errores = await erroresDe(
      EditarPlanPreventivoHttpDto,
      { anticipacionUnidad: 'SEMANAS' },
      'anticipacionUnidad',
    );

    expect(errores).toHaveProperty('isIn');
  });
});

describe('toPlanPreventivoResponseDto — anticipación', () => {
  it('expone la anticipación del plan', () => {
    const plan = PlanPreventivoEntity.create({
      titulo: 'Plan test',
      instrucciones: null,
      equipoId: null,
      ubicacion: 'DEPOSITO',
      prioridadId: 'prioridad-uuid',
      responsableId: 'responsable-uuid',
      intervaloValor: 1,
      intervaloUnidad: 'MESES',
      anticipacionValor: 7,
      anticipacionUnidad: 'DIAS',
      fechaInicio: new Date('2026-01-01'),
      proximaEjecucionEn: new Date('2026-01-01'),
      activo: true,
    }).getValue();

    const dto = toPlanPreventivoResponseDto(plan);

    expect(dto.anticipacionValor).toBe(7);
    expect(dto.anticipacionUnidad).toBe('DIAS');
  });
});
