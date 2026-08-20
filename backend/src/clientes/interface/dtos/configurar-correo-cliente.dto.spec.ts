/**
 * ConfigurarCorreoClienteDto — validación de class-validator (D7, WU4).
 * Foco: el contrato de "password" — omitida se acepta (preserva), vacía se
 * rechaza (NUNCA es "borrar"), y los campos SMTP restantes son requeridos
 * (todo-o-nada).
 */
import { describe, expect, it } from 'vitest';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { ConfigurarCorreoClienteDto } from './cliente.dto';

const BASE = { host: 'smtp.acme.com', port: 587, user: 'u', secure: false, from: 'from@acme.com' };

describe('ConfigurarCorreoClienteDto', () => {
  it('acepta la config completa con password', async () => {
    const dto = plainToInstance(ConfigurarCorreoClienteDto, { ...BASE, password: 'secreta' });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('acepta password OMITIDA (preserva la existente)', async () => {
    const dto = plainToInstance(ConfigurarCorreoClienteDto, { ...BASE });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('[CRITICAL] rechaza password vacía — un string vacío NUNCA significa borrar', async () => {
    const dto = plainToInstance(ConfigurarCorreoClienteDto, { ...BASE, password: '' });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) => e.property === 'password')).toBe(true);
  });

  it.each(['host', 'user', 'from'])('rechaza %s vacío (todo-o-nada)', async (field) => {
    const dto = plainToInstance(ConfigurarCorreoClienteDto, { ...BASE, [field]: '' });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === field)).toBe(true);
  });

  it('rechaza port fuera de rango', async () => {
    const dto = plainToInstance(ConfigurarCorreoClienteDto, { ...BASE, port: 70000 });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'port')).toBe(true);
  });
});
