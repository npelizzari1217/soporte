/**
 * 3.6 TEST — CorreoDeClienteAdapter. `TenantContext` real (molde
 * `sla-sweep.scheduler.spec.ts`), para verificar desde adentro del `send()`
 * fake qué contexto quedó bindeado. Ref design: ADR-4. Tarea: 3.6.
 */
import { CorreoDeClienteAdapter } from './correo-de-cliente.adapter';
import { TenantContext } from '../../../shared/tenancy/tenant-context';
import { ClienteEntity } from '../../../clientes/domain/entities/cliente.entity';

const CLIENTE_ID = '01977a00-0000-7000-8000-0000000000c1';
const DB_NAME = 'soporte_cliente_prueba';

function makeCliente(overrides: Partial<{ activo: boolean; deleted: boolean }> = {}) {
  const cliente = ClienteEntity.create(
    {
      nombre: 'Cliente',
      razonSocial: null,
      cuit: null,
      dbName: DB_NAME,
      activo: overrides.activo ?? true,
    },
    CLIENTE_ID,
  );
  if (overrides.deleted) cliente.softDelete();
  return cliente;
}

function makeCollaborators() {
  const clienteRepo = { findById: vi.fn() };
  const emailConfigRepo = { findState: vi.fn() };
  const prismaService = { getTenantClient: vi.fn().mockImplementation((db: string) => ({ db })) };
  const tenantContext = new TenantContext();
  const emailSender = { send: vi.fn().mockResolvedValue(undefined) };
  const adapter = new CorreoDeClienteAdapter(
    clienteRepo as never,
    emailConfigRepo as never,
    prismaService as never,
    tenantContext,
    emailSender as never,
  );
  return { adapter, clienteRepo, emailConfigRepo, prismaService, tenantContext, emailSender };
}

describe('CorreoDeClienteAdapter.estado', () => {
  it.each([
    ['LISTO', makeCliente(), { configurado: true }],
    ['SIN_CORREO', makeCliente(), { configurado: false }],
    ['CLIENTE_NO_DISPONIBLE', makeCliente({ activo: false }), { configurado: true }],
    ['CLIENTE_NO_DISPONIBLE', makeCliente({ deleted: true }), { configurado: true }],
    ['CLIENTE_NO_DISPONIBLE', null, { configurado: true }],
  ] as const)('%s', async (esperado, cliente, configState) => {
    const c = makeCollaborators();
    c.clienteRepo.findById.mockResolvedValue(cliente);
    c.emailConfigRepo.findState.mockResolvedValue(configState);

    await expect(c.adapter.estado(CLIENTE_ID)).resolves.toBe(esperado);
  });
});

describe('CorreoDeClienteAdapter.enviar', () => {
  it('corre IEmailSender.send() DENTRO del TenantContext del clienteId recibido', async () => {
    const c = makeCollaborators();
    c.clienteRepo.findById.mockResolvedValue(makeCliente());
    let contextoVisto: ReturnType<TenantContext['get']>;
    c.emailSender.send.mockImplementation(async () => {
      contextoVisto = c.tenantContext.get();
    });

    const msg = { to: 'ana@ejemplo.com', subject: 'Asunto', text: 'Cuerpo' };
    await c.adapter.enviar(CLIENTE_ID, msg);

    expect(c.emailSender.send).toHaveBeenCalledWith(msg);
    expect(contextoVisto).toMatchObject({ clienteId: CLIENTE_ID, dbName: DB_NAME });
    expect(c.prismaService.getTenantClient).toHaveBeenCalledWith(DB_NAME);
  });

  it('no lanza si el cliente ya no existe (defensivo)', async () => {
    const c = makeCollaborators();
    c.clienteRepo.findById.mockResolvedValue(null);

    await expect(
      c.adapter.enviar(CLIENTE_ID, { to: 'x@y.com', subject: 's', text: 't' }),
    ).resolves.toBeUndefined();
    expect(c.emailSender.send).not.toHaveBeenCalled();
  });

  it('no lanza si el repositorio o el envío fallan', async () => {
    const c = makeCollaborators();
    c.clienteRepo.findById.mockRejectedValueOnce(new Error('db caida'));
    await expect(
      c.adapter.enviar(CLIENTE_ID, { to: 'x@y.com', subject: 's', text: 't' }),
    ).resolves.toBeUndefined();

    c.clienteRepo.findById.mockResolvedValue(makeCliente());
    c.emailSender.send.mockRejectedValueOnce(new Error('smtp caido'));
    await expect(
      c.adapter.enviar(CLIENTE_ID, { to: 'x@y.com', subject: 's', text: 't' }),
    ).resolves.toBeUndefined();
  });
});

describe('CorreoDeClienteAdapter.estado ante fallas', () => {
  it('devuelve CLIENTE_NO_DISPONIBLE si un repositorio lanza', async () => {
    const c = makeCollaborators();
    c.clienteRepo.findById.mockRejectedValueOnce(new Error('db caida'));
    await expect(c.adapter.estado(CLIENTE_ID)).resolves.toBe('CLIENTE_NO_DISPONIBLE');

    c.clienteRepo.findById.mockResolvedValue(makeCliente());
    c.emailConfigRepo.findState.mockRejectedValueOnce(new Error('db caida'));
    await expect(c.adapter.estado(CLIENTE_ID)).resolves.toBe('CLIENTE_NO_DISPONIBLE');
  });
});
