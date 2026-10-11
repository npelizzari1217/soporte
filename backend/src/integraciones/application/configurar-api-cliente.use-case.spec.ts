import { ClienteEntity } from '../../clientes/domain/entities/cliente.entity';
import { UsuarioEntity } from '../../auth/domain/entities/usuario.entity';
import { MembresiaEntity } from '../../auth/domain/entities/membresia.entity';
import { RoleEntity } from '../../auth/domain/entities/role.entity';
import {
  ConfigurarApiClienteUseCase,
  ROL_INTEGRACION,
  emailIntegracion,
} from './configurar-api-cliente.use-case';

/** Fakes en memoria: cada uno implementa solo el Pick que el caso de uso declara. */
function armar(opciones: { conRol?: boolean } = {}) {
  const cliente = ClienteEntity.create({
    nombre: 'Acme',
    razonSocial: null,
    cuit: null,
    dbName: 'acme_db',
    activo: true,
  });
  const usuarios = new Map<string, UsuarioEntity>();
  const membresias: MembresiaEntity[] = [];
  const rol = RoleEntity.create({
    codigo: ROL_INTEGRACION,
    nombre: 'Usuario',
    descripcion: null,
    permisos: [],
  });

  const useCase = new ConfigurarApiClienteUseCase(
    {
      findById: async (id) => (id === cliente.id ? cliente : null),
      save: async () => undefined,
    },
    {
      findByEmail: async (email) => usuarios.get(email) ?? null,
      create: async (u) => {
        usuarios.set(u.email, u);
      },
    },
    {
      findByUsuarioYCliente: async (usuarioId, clienteId) =>
        membresias.find((m) => m.usuarioId === usuarioId && m.clienteId === clienteId) ?? null,
      create: async (m) => {
        membresias.push(m);
      },
      save: async () => undefined,
    },
    {
      findByCodigo: async (codigo) =>
        opciones.conRol === false || codigo !== rol.codigo ? null : rol,
    },
    { hash: async (plano) => `hash:${plano}` },
  );
  return { cliente, usuarios, membresias, rol, useCase };
}

const ROOT = { isGlobalAdmin: true };

describe('ConfigurarApiClienteUseCase', () => {
  it('habilitar prende el flag y crea una sola vez el usuario de integracion con su membresia', async () => {
    const { cliente, usuarios, membresias, rol, useCase } = armar();

    const r = await useCase.execute({ clienteId: cliente.id, habilitada: true }, ROOT);

    expect(r.isOk()).toBe(true);
    expect(cliente.apiHabilitada).toBe(true);
    expect(usuarios.size).toBe(1);
    const usuario = usuarios.get(emailIntegracion(cliente.id));
    expect(usuario?.esIntegracion).toBe(true);
    expect(usuario?.passwordHash).toMatch(/^hash:[0-9a-f]{64}$/);
    expect(membresias).toHaveLength(1);
    expect(membresias[0]).toMatchObject({ clienteId: cliente.id, rolId: rol.id, activo: true });
  });

  it('habilitar de nuevo es idempotente: no duplica usuario ni membresia', async () => {
    const { cliente, usuarios, membresias, useCase } = armar();
    await useCase.execute({ clienteId: cliente.id, habilitada: true }, ROOT);
    await useCase.execute({ clienteId: cliente.id, habilitada: true }, ROOT);

    expect(usuarios.size).toBe(1);
    expect(membresias).toHaveLength(1);
  });

  it('deshabilitar apaga el flag y conserva usuario y membresia', async () => {
    const { cliente, usuarios, membresias, useCase } = armar();
    await useCase.execute({ clienteId: cliente.id, habilitada: true }, ROOT);

    const r = await useCase.execute({ clienteId: cliente.id, habilitada: false }, ROOT);

    expect(r.getValue()).toEqual({ clienteId: cliente.id, apiHabilitada: false });
    expect(usuarios.size).toBe(1);
    expect(membresias[0].activo).toBe(true);
  });

  it('volver a habilitar reactiva la membresia desactivada y reusa el usuario', async () => {
    const { cliente, usuarios, membresias, useCase } = armar();
    await useCase.execute({ clienteId: cliente.id, habilitada: true }, ROOT);
    membresias[0].desactivar();

    await useCase.execute({ clienteId: cliente.id, habilitada: true }, ROOT);

    expect(usuarios.size).toBe(1);
    expect(membresias).toHaveLength(1);
    expect(membresias[0].activo).toBe(true);
  });

  it('un actor que no es ROOT recibe API_SOLO_ROOT y no cambia nada', async () => {
    const { cliente, usuarios, useCase } = armar();

    const r = await useCase.execute(
      { clienteId: cliente.id, habilitada: true },
      { isGlobalAdmin: false },
    );

    expect(r.getError().code).toBe('API_SOLO_ROOT');
    expect(cliente.apiHabilitada).toBe(false);
    expect(usuarios.size).toBe(0);
  });

  it('cliente inexistente: API_CLIENTE_NO_ENCONTRADO', async () => {
    const { useCase } = armar();
    const r = await useCase.execute({ clienteId: 'otro', habilitada: true }, ROOT);
    expect(r.getError().code).toBe('API_CLIENTE_NO_ENCONTRADO');
  });

  it('sin el rol en el catalogo falla y deja la API apagada', async () => {
    const { cliente, usuarios, useCase } = armar({ conRol: false });
    const r = await useCase.execute({ clienteId: cliente.id, habilitada: true }, ROOT);

    expect(r.getError().code).toBe('API_ROL_INTEGRACION_NO_ENCONTRADO');
    expect(cliente.apiHabilitada).toBe(false);
    expect(usuarios.size).toBe(0);
  });
});
