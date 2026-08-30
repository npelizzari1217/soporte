/**
 * `CreateClienteDto` / `UpdateClienteDto` — tope de largo de `cuit`.
 *
 * Foco: que el borde devuelva un 400 amable en vez de dejar pasar el valor
 * hasta Postgres (22001 → 500 crudo). El límite NO se declara acá: se importa
 * de `ClienteEntity`, que es la autoridad. Estos tests existen para que el
 * borde y el dominio no puedan divergir en silencio, que es exactamente lo
 * que había pasado (`@MaxLength(20)` contra una columna de 13).
 */
import { describe, expect, it } from 'vitest';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateClienteDto, UpdateClienteDto } from './cliente.dto';
import {
  CLIENTE_CUIT_MAX_LENGTH,
  CLIENTE_NOMBRE_MAX_LENGTH,
  CLIENTE_RAZON_SOCIAL_MAX_LENGTH,
} from '../../domain/entities/cliente.entity';

const ALTA_VALIDA = {
  nombre: 'Acme SA',
  adminEmail: 'admin@acme.com',
  adminNombre: 'Ada',
  adminApellido: 'Lovelace',
  adminPassword: 'unaClaveLarga',
};

const CUIT_EN_EL_LIMITE = '30-12345678-9';
const CUIT_PASADO = 'A'.repeat(CLIENTE_CUIT_MAX_LENGTH + 1);

/** El tope del DTO es el del dominio, no un número tipeado a mano. */
it('CLIENTE_CUIT_MAX_LENGTH es el largo de un CUIT formateado', () => {
  expect(CUIT_EN_EL_LIMITE).toHaveLength(CLIENTE_CUIT_MAX_LENGTH);
});

describe('CreateClienteDto — cuit', () => {
  it('acepta un cuit en el límite exacto', async () => {
    const dto = plainToInstance(CreateClienteDto, { ...ALTA_VALIDA, cuit: CUIT_EN_EL_LIMITE });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('rechaza un cuit que pasa el tope', async () => {
    const dto = plainToInstance(CreateClienteDto, { ...ALTA_VALIDA, cuit: CUIT_PASADO });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'cuit')).toBe(true);
  });

  it('sigue aceptando el alta sin cuit: el tope no lo vuelve obligatorio', async () => {
    const dto = plainToInstance(CreateClienteDto, ALTA_VALIDA);
    expect(await validate(dto)).toHaveLength(0);
  });
});

describe('UpdateClienteDto — cuit', () => {
  it('acepta un cuit en el límite exacto', async () => {
    const dto = plainToInstance(UpdateClienteDto, { cuit: CUIT_EN_EL_LIMITE });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('rechaza un cuit que pasa el tope', async () => {
    const dto = plainToInstance(UpdateClienteDto, { cuit: CUIT_PASADO });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'cuit')).toBe(true);
  });

  it('sigue aceptando un patch que no toca el cuit', async () => {
    const dto = plainToInstance(UpdateClienteDto, { nombre: 'Acme SRL' });
    expect(await validate(dto)).toHaveLength(0);
  });
});

/**
 * El alta no declaraba NINGÚN tope de largo mientras la edición sí, así que un
 * nombre de 220 se podía crear y después no se podía editar — y por API llegaba
 * a la columna y moría ahí (22001 → 500 crudo). Los dos DTOs importan ahora la
 * misma constante del dominio.
 */
describe.each([
  ['CreateClienteDto', CreateClienteDto, ALTA_VALIDA],
  ['UpdateClienteDto', UpdateClienteDto, {}],
])('%s — topes de nombre y razonSocial', (_nombre, Dto, base) => {
  it('acepta un nombre en el límite exacto', async () => {
    const dto = plainToInstance(Dto, { ...base, nombre: 'A'.repeat(CLIENTE_NOMBRE_MAX_LENGTH) });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('rechaza un nombre que pasa el tope', async () => {
    const dto = plainToInstance(Dto, {
      ...base,
      nombre: 'A'.repeat(CLIENTE_NOMBRE_MAX_LENGTH + 1),
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'nombre')).toBe(true);
  });

  it('rechaza una razonSocial que pasa el tope', async () => {
    const dto = plainToInstance(Dto, {
      ...base,
      razonSocial: 'A'.repeat(CLIENTE_RAZON_SOCIAL_MAX_LENGTH + 1),
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'razonSocial')).toBe(true);
  });
});
