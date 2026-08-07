import { describe, it, expect, vi } from 'vitest';
import { CrearUsuarioTenantUseCase } from './crear-usuario-tenant.use-case';
import { UsuarioEntity } from '../../domain/entities/usuario.entity';
import { RoleEntity } from '../../domain/entities/role.entity';
import { RolNoEncontradoError, MembresiaYaActivaError } from '../../domain/errors/auth.errors';

const DTO = {
  clienteId: 'cliente-token',
  email: 'nuevo@test.com',
  nombre: 'Nueva',
  apellido: 'Persona',
  password: 'Secreto123!',
  rolCodigo: 'TECNICO',
};

function buildRole() {
  return RoleEntity.create({
    codigo: 'TECNICO',
    nombre: 'Técnico',
    descripcion: null,
    permisos: [],
  });
}

function buildDeps(overrides: Partial<Record<string, unknown>> = {}) {
  const usuarioRepo = {
    findByEmail: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockResolvedValue(undefined),
    ...(overrides.usuarioRepo as object),
  };
  const membresiaRepo = {
    findActivaByUsuarioYCliente: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockResolvedValue(undefined),
    ...(overrides.membresiaRepo as object),
  };
  const roleRepo = {
    findByCodigo: vi.fn().mockResolvedValue(buildRole()),
    ...(overrides.roleRepo as object),
  };
  const hashProvider = {
    hash: vi.fn().mockResolvedValue('hashed-password'),
    ...(overrides.hashProvider as object),
  };
  const useCase = new CrearUsuarioTenantUseCase(
    usuarioRepo as never,
    membresiaRepo as never,
    roleRepo as never,
    hashProvider as never,
  );
  return { useCase, usuarioRepo, membresiaRepo, roleRepo, hashProvider };
}

describe('CrearUsuarioTenantUseCase (gestión mínima de usuarios, sdd/beta-frontend)', () => {
  it('crea un usuario global NUEVO + su membresía en el cliente del token', async () => {
    const { useCase, usuarioRepo, membresiaRepo, hashProvider, roleRepo } = buildDeps();
    const rol = await roleRepo.findByCodigo('TECNICO');

    const result = await useCase.execute(DTO);

    expect(result.isOk()).toBe(true);
    expect(hashProvider.hash).toHaveBeenCalledWith(DTO.password);
    expect(usuarioRepo.create).toHaveBeenCalledOnce();
    expect(membresiaRepo.create).toHaveBeenCalledOnce();
    const membresiaCreada = membresiaRepo.create.mock.calls[0][0];
    expect(membresiaCreada.clienteId).toBe(DTO.clienteId);
    expect(membresiaCreada.rolId).toBe(rol.id);
    expect(membresiaCreada.activo).toBe(true);
  });

  it('AISLAMIENTO: la membresía SIEMPRE se crea con el clienteId recibido, nunca otro', async () => {
    const { useCase, membresiaRepo } = buildDeps();

    await useCase.execute({ ...DTO, clienteId: 'cliente-especifico' });

    const membresiaCreada = membresiaRepo.create.mock.calls[0][0];
    expect(membresiaCreada.clienteId).toBe('cliente-especifico');
  });

  it('reutiliza un usuario global EXISTENTE (no rehashea password ni pisa nombre/apellido)', async () => {
    const existente = UsuarioEntity.reconstitute(
      {
        email: DTO.email,
        nombre: 'Original',
        apellido: 'Original',
        passwordHash: 'hash-viejo',
        activo: true,
        isGlobalAdmin: false,
      },
      'usuario-existente',
      new Date(),
      new Date(),
      null,
    );
    const { useCase, usuarioRepo, membresiaRepo, hashProvider } = buildDeps({
      usuarioRepo: { findByEmail: vi.fn().mockResolvedValue(existente) },
    });

    const result = await useCase.execute(DTO);

    expect(result.isOk()).toBe(true);
    expect(hashProvider.hash).not.toHaveBeenCalled();
    expect(usuarioRepo.create).not.toHaveBeenCalled();
    const membresiaCreada = membresiaRepo.create.mock.calls[0][0];
    expect(membresiaCreada.usuarioId).toBe('usuario-existente');
  });

  it('falla con RolNoEncontradoError si el rolCodigo no existe en el catálogo', async () => {
    const { useCase, membresiaRepo } = buildDeps({
      roleRepo: { findByCodigo: vi.fn().mockResolvedValue(null) },
    });

    const result = await useCase.execute(DTO);

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(RolNoEncontradoError);
    expect(membresiaRepo.create).not.toHaveBeenCalled();
  });

  it('falla con MembresiaYaActivaError si el usuario ya tiene membresía activa en ESTE cliente', async () => {
    const existente = UsuarioEntity.reconstitute(
      {
        email: DTO.email,
        nombre: 'Original',
        apellido: 'Original',
        passwordHash: 'hash-viejo',
        activo: true,
        isGlobalAdmin: false,
      },
      'usuario-existente',
      new Date(),
      new Date(),
      null,
    );
    const { useCase, membresiaRepo } = buildDeps({
      usuarioRepo: { findByEmail: vi.fn().mockResolvedValue(existente) },
      membresiaRepo: {
        findActivaByUsuarioYCliente: vi.fn().mockResolvedValue({
          clienteId: DTO.clienteId,
          clienteNombre: 'X',
          rolCodigo: 'USUARIO',
          permisos: [],
        }),
      },
    });

    const result = await useCase.execute(DTO);

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(MembresiaYaActivaError);
    expect(membresiaRepo.create).not.toHaveBeenCalled();
  });
});
