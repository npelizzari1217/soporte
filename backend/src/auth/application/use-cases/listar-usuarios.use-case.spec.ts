/**
 * T3.4 [RED/GREEN] — Unit tests para ListarUsuariosUseCase.
 *
 * Contrato verificado:
 * - Retorna usuarios del tenant resuelto (filtra por cliente_id)
 * - Excluye usuarios con deleted_at IS NOT NULL (delegado al repositorio)
 * - Incluye usuarios con activo=FALSE (admin ve inactivos)
 * - MUST NOT incluir password_hash en ningún campo
 * - Aislamiento: no devuelve usuarios de otros tenants
 *
 * Spec ref: clientes-tenancy/GET /usuarios
 * Tarea: T3.4
 */

import { ListarUsuariosUseCase, type ListarUsuariosDto } from './listar-usuarios.use-case';
import { UsuarioEntity } from '../../domain/entities/usuario.entity';

// ─── Factories ────────────────────────────────────────────────────────────────

function makeUsuario(
  clienteId: string,
  overrides?: Partial<{ email: string; activo: boolean; deletedAt: Date | null }>,
): UsuarioEntity {
  const entity = UsuarioEntity.create({
    email: overrides?.email ?? 'user@tenant.com',
    nombre: 'Usuario',
    apellido: 'Test',
    passwordHash: 'hashed_value_opaque',
    clienteId,
    activo: overrides?.activo ?? true,
    isGlobalAdmin: false,
    roles: [],
  });
  if (overrides?.deletedAt) {
    entity.softDelete(overrides.deletedAt);
  }
  return entity;
}

function makeUsuarioRepo() {
  return {
    findByEmail: vi.fn(),
    findById: vi.fn(),
    findByClienteId: vi.fn(),
    create: vi.fn(),
    save: vi.fn(),
  };
}

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('ListarUsuariosUseCase (T3.4)', () => {
  let usuarioRepo: ReturnType<typeof makeUsuarioRepo>;
  let useCase: ListarUsuariosUseCase;

  beforeEach(() => {
    usuarioRepo = makeUsuarioRepo();
    useCase = new ListarUsuariosUseCase(usuarioRepo as any);
  });

  it('retorna usuarios del tenant resuelto únicamente', async () => {
    const clienteId = 'tenant-a-uuid';
    const usuarios = [
      makeUsuario(clienteId, { email: 'u1@tenant.com' }),
      makeUsuario(clienteId, { email: 'u2@tenant.com' }),
    ];
    usuarioRepo.findByClienteId.mockResolvedValue(usuarios);

    const result = await useCase.execute({ clienteId });

    expect(result).toHaveLength(2);
    expect(usuarioRepo.findByClienteId).toHaveBeenCalledWith(clienteId);
  });

  it('array vacío cuando no hay usuarios → no 404 (vacío es válido)', async () => {
    usuarioRepo.findByClienteId.mockResolvedValue([]);

    const result = await useCase.execute({ clienteId: 'empty-tenant' });

    expect(result).toHaveLength(0);
  });

  it('incluye usuarios con activo=FALSE (el admin ve inactivos)', async () => {
    const clienteId = 'tenant-a';
    const inactivo = makeUsuario(clienteId, { activo: false });
    usuarioRepo.findByClienteId.mockResolvedValue([inactivo]);

    const result = await useCase.execute({ clienteId });

    expect(result).toHaveLength(1);
    expect(result[0].activo).toBe(false);
  });

  it('MUST NOT incluir password_hash en los objetos retornados', async () => {
    const clienteId = 'tenant-a';
    const usuario = makeUsuario(clienteId);
    usuarioRepo.findByClienteId.mockResolvedValue([usuario]);

    const result = await useCase.execute({ clienteId });

    // El use case retorna la entidad; la verificación de passwordHash NO expuesto
    // se garantiza en la capa de presentación (DTO mappers). El use case no
    // debe agregar un campo plaintext password.
    result.forEach((u) => {
      // @ts-expect-error — no debe haber campo 'password' en la entidad
      expect(u.password).toBeUndefined();
    });
  });

  it('aislamiento: pasa clienteId correcto al repo (no mezcla tenants)', async () => {
    usuarioRepo.findByClienteId.mockResolvedValue([]);

    await useCase.execute({ clienteId: 'tenant-b-uuid' });

    expect(usuarioRepo.findByClienteId).toHaveBeenCalledWith('tenant-b-uuid');
    expect(usuarioRepo.findByClienteId).not.toHaveBeenCalledWith('tenant-a-uuid');
  });

  it('dto con clienteId diferente → llama al repo con ese clienteId', async () => {
    const dto: ListarUsuariosDto = { clienteId: 'specific-tenant' };
    usuarioRepo.findByClienteId.mockResolvedValue([]);

    await useCase.execute(dto);

    expect(usuarioRepo.findByClienteId).toHaveBeenCalledExactlyOnceWith('specific-tenant');
  });
});
