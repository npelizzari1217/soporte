import type { Cliente, Role } from '.prisma/master';
import { MembresiaMapper, PrismaMembresiaResuelta } from './membresia.mapper';

const fila = (requiere2fa: boolean): PrismaMembresiaResuelta =>
  ({
    cliente: { id: 'c-1', nombre: 'Acme', requiere2fa } as Cliente,
    rol: { codigo: 'TECNICO' } as Role,
  }) as PrismaMembresiaResuelta;

describe('MembresiaMapper.toResuelta', () => {
  it.each([true, false])('proyecta la politica de 2FA del cliente (%s) (L3, C3)', (requiere) => {
    expect(MembresiaMapper.toResuelta(fila(requiere))).toEqual({
      clienteId: 'c-1',
      clienteNombre: 'Acme',
      rolCodigo: 'TECNICO',
      clienteRequiere2fa: requiere,
    });
  });
});
