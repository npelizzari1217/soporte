import { describe, it, expect, vi } from 'vitest';
import { EditarUsuarioTenantUseCase } from './editar-usuario-tenant.use-case';
import { UsuarioEntity } from '../../domain/entities/usuario.entity';
import { MembresiaNoEncontradaError } from '../../domain/errors/auth.errors';
import type { MembresiaResuelta } from '../../domain/ports/i-membresia.repository';

function buildUsuario() {
  return UsuarioEntity.reconstitute(
    {
      email: 'ada@test.com',
      nombre: 'Ada',
      apellido: 'Vieja',
      passwordHash: 'hash',
      activo: true,
    },
    'usuario-1',
    new Date(),
    new Date(),
    null,
  );
}

const MEMBRESIA_ACTIVA: MembresiaResuelta = {
  clienteId: 'cliente-token',
  clienteNombre: 'Cliente Token',
  rolCodigo: 'TECNICO',
  clienteRequiere2fa: false,
};

describe('EditarUsuarioTenantUseCase (gestión mínima de usuarios, sdd/beta-frontend §5)', () => {
  it('edita nombre y apellido del usuario con membresía activa en este cliente', async () => {
    const usuario = buildUsuario();
    const usuarioRepo = {
      findById: vi.fn().mockResolvedValue(usuario),
      save: vi.fn().mockResolvedValue(undefined),
    };
    const membresiaRepo = {
      findActivaByUsuarioYCliente: vi.fn().mockResolvedValue(MEMBRESIA_ACTIVA),
    };
    const useCase = new EditarUsuarioTenantUseCase(usuarioRepo as never, membresiaRepo as never);

    const result = await useCase.execute({
      clienteId: 'cliente-token',
      usuarioId: 'usuario-1',
      nombre: 'Ada',
      apellido: 'Lovelace',
    });

    expect(result.isOk()).toBe(true);
    expect(membresiaRepo.findActivaByUsuarioYCliente).toHaveBeenCalledWith(
      'usuario-1',
      'cliente-token',
    );
    expect(usuario.nombre).toBe('Ada');
    expect(usuario.apellido).toBe('Lovelace');
    // email intacto: no es editable.
    expect(usuario.email).toBe('ada@test.com');
    expect(usuarioRepo.save).toHaveBeenCalledWith(usuario);
  });

  it('AISLAMIENTO: falla con MembresiaNoEncontradaError si no hay membresía activa en este cliente', async () => {
    const usuarioRepo = { findById: vi.fn(), save: vi.fn() };
    const membresiaRepo = {
      findActivaByUsuarioYCliente: vi.fn().mockResolvedValue(null),
    };
    const useCase = new EditarUsuarioTenantUseCase(usuarioRepo as never, membresiaRepo as never);

    const result = await useCase.execute({
      clienteId: 'cliente-token',
      usuarioId: 'usuario-de-otro-cliente',
      nombre: 'Nombre',
    });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(MembresiaNoEncontradaError);
    // No carga ni persiste el usuario si falla el chequeo de aislamiento.
    expect(usuarioRepo.findById).not.toHaveBeenCalled();
    expect(usuarioRepo.save).not.toHaveBeenCalled();
  });
});
