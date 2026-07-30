/**
 * 3.11 — RED: `PrismaAuditLog.record()` — `scope.kind==='tenant'` ⇒ resuelve
 * `dbName` desde `master.clientes` por `clienteId` (R9, mismo patrón que
 * `PrismaConfigResolver`) y persiste vía
 * `getTenantClient(dbName).auditEntry.create`; `'global'` ⇒
 * `getMasterClient().auditEntry.create` (R5 escenario "scope dual" — nunca
 * cruzado). También cubre el REQUISITO DURO (STATE.md "Judgment Day — PR1 —
 * fixes Ronda 2" fix #6): el adapter persiste EXACTAMENTE lo que trae la
 * entidad — nunca agrega ni descifra nada — así que si `AuditEntry` ya trae
 * el valor enmascarado (garantía del handler/write use case), lo que llega
 * a la fila de `audit_entries` es el valor enmascarado, jamás el plaintext.
 *
 * `getMasterClient`/`getTenantClient` de `PrismaService` mockeados — mismo
 * patrón que `config-resolver.adapter.spec.ts`. `master.clientes.findFirst`
 * también mockeado (Judgment Day PR3 Ronda 1, issue 3) para cubrir la
 * re-resolución de `dbName` por `clienteId`.
 *
 * Ref design: §5, §8. Ref spec: R5, Requirement 9. Ref tasks: PR3 3.11/3.12.
 * Judgment Day PR3 Ronda 1, issue 3.
 */
import { PrismaAuditLog } from './audit-log.adapter';
import { PrismaService } from '../../../../shared/infrastructure/persistence/prisma.service';
import { AuditEntry } from '../../../domain/entities/audit-entry.entity';
import { ConfigScope } from '../../../domain/events/configuracion-cambiada.event';

describe('PrismaAuditLog', () => {
  let adapter: PrismaAuditLog;

  const mockTenantAuditCreate = vi.fn();
  const mockGlobalAuditCreate = vi.fn();
  const mockGetTenantClient = vi.fn();
  const mockClienteFindFirst = vi.fn();

  const mockMasterClient = {
    auditEntry: { create: mockGlobalAuditCreate },
    cliente: { findFirst: mockClienteFindFirst },
  };

  const mockPrismaService = {
    getMasterClient: vi.fn().mockReturnValue(mockMasterClient),
    getTenantClient: mockGetTenantClient,
  } as PrismaService;

  const CLIENTE_ID_A = 'cliente-uuid-a';

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetTenantClient.mockReturnValue({
      auditEntry: { create: mockTenantAuditCreate },
    });
    mockClienteFindFirst.mockResolvedValue({ dbName: 'tenant_a_db' });
    adapter = new PrismaAuditLog(mockPrismaService);
  });

  const buildEntry = (esSecreto: boolean, valor: string) =>
    AuditEntry.create({
      actorId: 'actor-uuid',
      accion: 'config.actualizada',
      categoria: 'smtp',
      clave: esSecreto ? 'pass' : 'host',
      valorAnterior: esSecreto ? '********' : 'old.smtp.com',
      valorNuevo: esSecreto ? '********' : valor,
      esSecreto,
    });

  it('scope tenant ⇒ resuelve dbName por clienteId en master.clientes y persiste vía getTenantClient(dbName).auditEntry.create', async () => {
    mockTenantAuditCreate.mockResolvedValue({});
    const entry = buildEntry(false, 'new.smtp.com');
    const scope: ConfigScope = { kind: 'tenant', clienteId: CLIENTE_ID_A };

    const result = await adapter.record(entry, scope);

    expect(result.isOk()).toBe(true);
    expect(mockClienteFindFirst).toHaveBeenCalledWith({
      where: { id: CLIENTE_ID_A, activo: true, deletedAt: null },
      select: { dbName: true },
    });
    expect(mockGetTenantClient).toHaveBeenCalledWith('tenant_a_db');
    expect(mockTenantAuditCreate).toHaveBeenCalledTimes(1);
    expect(mockGlobalAuditCreate).not.toHaveBeenCalled();
    const [{ data }] = mockTenantAuditCreate.mock.calls[0];
    expect(data.id).toBe(entry.id);
    expect(data.actorId).toBe('actor-uuid');
    expect(data.categoria).toBe('smtp');
    expect(data.clave).toBe('host');
    expect(data.valorAnterior).toBe('old.smtp.com');
    expect(data.valorNuevo).toBe('new.smtp.com');
    expect(data.esSecreto).toBe(false);
  });

  it('scope tenant con clienteId inexistente/inactivo ⇒ Result.fail(AuditError), NUNCA llama getTenantClient (sin cross-DB)', async () => {
    mockClienteFindFirst.mockResolvedValue(null);
    const entry = buildEntry(false, 'new.smtp.com');
    const scope: ConfigScope = { kind: 'tenant', clienteId: 'cliente-inexistente' };

    const result = await adapter.record(entry, scope);

    expect(result.isFail()).toBe(true);
    expect(result.getError().code).toBe('AUDIT_WRITE_FAILED');
    expect(mockGetTenantClient).not.toHaveBeenCalled();
    expect(mockTenantAuditCreate).not.toHaveBeenCalled();
  });

  it('scope tenant con clienteId malformado (findFirst rechaza) ⇒ Result.fail(AuditError), NUNCA lanza ni llama getTenantClient', async () => {
    mockClienteFindFirst.mockRejectedValue(new Error('PrismaClientValidationError'));
    const entry = buildEntry(false, 'new.smtp.com');
    const scope: ConfigScope = { kind: 'tenant', clienteId: 'no-es-un-uuid' };

    const result = await adapter.record(entry, scope);

    expect(result.isFail()).toBe(true);
    expect(result.getError().code).toBe('AUDIT_WRITE_FAILED');
    expect(mockGetTenantClient).not.toHaveBeenCalled();
    expect(mockTenantAuditCreate).not.toHaveBeenCalled();
  });

  it('scope global ⇒ persiste vía getMasterClient().auditEntry.create, nunca toca getTenantClient', async () => {
    mockGlobalAuditCreate.mockResolvedValue({});
    const entry = buildEntry(false, 'new.smtp.com');
    const scope: ConfigScope = { kind: 'global' };

    const result = await adapter.record(entry, scope);

    expect(result.isOk()).toBe(true);
    expect(mockGlobalAuditCreate).toHaveBeenCalledTimes(1);
    expect(mockGetTenantClient).not.toHaveBeenCalled();
    expect(mockTenantAuditCreate).not.toHaveBeenCalled();
  });

  it('fila esSecreto=true ⇒ persiste el valor ENMASCARADO tal cual llega en la entidad, nunca lo transforma', async () => {
    mockTenantAuditCreate.mockResolvedValue({});
    const entry = buildEntry(true, '********');
    const scope: ConfigScope = { kind: 'tenant', clienteId: CLIENTE_ID_A };

    await adapter.record(entry, scope);

    const [{ data }] = mockTenantAuditCreate.mock.calls[0];
    expect(data.esSecreto).toBe(true);
    expect(data.valorAnterior).toBe('********');
    expect(data.valorNuevo).toBe('********');
  });

  it('fallo de infra Prisma ⇒ Result.fail(AuditError), NUNCA lanza', async () => {
    mockTenantAuditCreate.mockRejectedValue(new Error('connection reset'));
    const entry = buildEntry(false, 'new.smtp.com');
    const scope: ConfigScope = { kind: 'tenant', clienteId: CLIENTE_ID_A };

    const result = await adapter.record(entry, scope);

    expect(result.isFail()).toBe(true);
    expect(result.getError().code).toBe('AUDIT_WRITE_FAILED');
  });

  it('fallo de infra en scope global ⇒ Result.fail(AuditError), NUNCA lanza', async () => {
    mockGlobalAuditCreate.mockRejectedValue(new Error('timeout'));
    const entry = buildEntry(false, 'new.smtp.com');
    const scope: ConfigScope = { kind: 'global' };

    const result = await adapter.record(entry, scope);

    expect(result.isFail()).toBe(true);
    expect(result.getError().code).toBe('AUDIT_WRITE_FAILED');
  });
});
