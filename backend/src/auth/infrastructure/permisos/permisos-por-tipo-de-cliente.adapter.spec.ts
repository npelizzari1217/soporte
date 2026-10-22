/**
 * PermisosPorTipoDeClienteAdapter (odd/tasks/permisos-por-tipo-ticket.md, T4c). `TenantContext`
 * real, con el molde de `correo-de-cliente.adapter.spec.ts`: el doble de la plantilla lee desde
 * adentro qué contexto quedó bindeado.
 */
import { PermisosPorTipoDeClienteAdapter } from './permisos-por-tipo-de-cliente.adapter';
import { TenantContext, TenantContextData } from '../../../shared/tenancy/tenant-context';
import { ClienteEntity } from '../../../clientes/domain/entities/cliente.entity';

const CLIENTE_ID = '01977a00-0000-7000-8000-0000000000c2';
const DB_NAME = 'soporte_cliente_permisos';
const ENTRADA = {
  clienteId: CLIENTE_ID,
  usuarioId: 'usuario-1',
  celdas: ['TICKETS:LECTURA'],
  sobrescribir: true,
};

function armar() {
  const cliente = ClienteEntity.create(
    { nombre: 'Cliente', razonSocial: null, cuit: null, dbName: DB_NAME, activo: true },
    CLIENTE_ID,
  );
  const clienteRepo = { findById: vi.fn().mockResolvedValue(cliente) };
  const prismaService = { getTenantClient: vi.fn().mockImplementation((db: string) => ({ db })) };
  const tenantContext = new TenantContext();
  const contextos: (TenantContextData | undefined)[] = [];
  const plantilla = {
    ejecutar: vi.fn().mockImplementation(async () => {
      contextos.push(tenantContext.get());
      return true;
    }),
  };
  const adapter = new PermisosPorTipoDeClienteAdapter(
    clienteRepo,
    prismaService,
    tenantContext,
    plantilla,
  );
  return { adapter, clienteRepo, prismaService, tenantContext, plantilla, contextos };
}

describe('PermisosPorTipoDeClienteAdapter.aplicarPlantilla', () => {
  it('aplica la plantilla dentro del TenantContext de la base del cliente recibido', async () => {
    const c = armar();

    await c.adapter.aplicarPlantilla(ENTRADA);

    expect(c.clienteRepo.findById).toHaveBeenCalledWith(CLIENTE_ID);
    expect(c.prismaService.getTenantClient).toHaveBeenCalledWith(DB_NAME);
    expect(c.plantilla.ejecutar).toHaveBeenCalledWith({
      usuarioId: 'usuario-1',
      celdas: ['TICKETS:LECTURA'],
      sobrescribir: true,
    });
    expect(c.contextos).toEqual([
      { prismaClient: { db: DB_NAME }, dbName: DB_NAME, clienteId: CLIENTE_ID },
    ]);
  });

  it('no usa el contexto que ya estuviera bindeado: el tenant sale siempre del clienteId', async () => {
    const c = armar();

    await c.tenantContext.run(
      { prismaClient: { db: 'otro_tenant' }, dbName: 'otro_tenant', clienteId: 'otro' },
      () => c.adapter.aplicarPlantilla(ENTRADA),
    );

    expect(c.contextos.map((ctx) => ctx?.dbName)).toEqual([DB_NAME]);
  });

  it('si el cliente no existe, falla sin escribir', async () => {
    const c = armar();
    c.clienteRepo.findById.mockResolvedValue(null);

    await expect(c.adapter.aplicarPlantilla(ENTRADA)).rejects.toThrow(
      `El cliente ${CLIENTE_ID} no existe`,
    );
    expect(c.plantilla.ejecutar).not.toHaveBeenCalled();
  });

  it('un fallo de la base del tenant se propaga, no se traga', async () => {
    const c = armar();
    const caida = new Error('conexión rechazada');
    c.plantilla.ejecutar.mockRejectedValue(caida);

    await expect(c.adapter.aplicarPlantilla(ENTRADA)).rejects.toBe(caida);
  });
});
