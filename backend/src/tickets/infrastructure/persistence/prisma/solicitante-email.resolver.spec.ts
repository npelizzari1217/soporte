/**
 * 2.7 — RED: SolicitanteEmailResolver — ok (mismo tenant), fail (no existe /
 * otro tenant), fail (email vacío), vía PrismaService.getMasterClient()
 * mockeado. Espejo de usuario-master.checker.ts (mismo patrón de aislamiento
 * multi-tenant, sin TenantContext).
 *
 * Ref spec: Requirement 8 Scenarios 1-3, NFR "Resolución del solicitante
 * siempre ocurre contra el tenant correcto".
 * Ref tasks: PR2 2.7
 */
import { SolicitanteEmailResolver } from './solicitante-email.resolver';
import { PrismaService } from '../../../../shared/infrastructure/persistence/prisma.service';

const SOLICITANTE_ID = 'solicitante-uuid-001';
const CLIENTE_ID = 'cliente-uuid-001';

describe('SolicitanteEmailResolver', () => {
  let resolver: SolicitanteEmailResolver;

  const mockUsuario = {
    findFirst: vi.fn(),
  };

  const mockMasterClient = {
    usuario: mockUsuario,
  };

  const mockPrismaService = {
    getMasterClient: vi.fn().mockReturnValue(mockMasterClient),
  } as unknown as PrismaService;

  beforeEach(() => {
    vi.clearAllMocks();
    mockPrismaService.getMasterClient = vi.fn().mockReturnValue(mockMasterClient);
    resolver = new SolicitanteEmailResolver(mockPrismaService);
  });

  describe('resolver(solicitanteId, clienteId)', () => {
    it('retorna Result.ok(Email) cuando el usuario existe y pertenece al tenant', async () => {
      mockUsuario.findFirst.mockResolvedValue({ email: 'solicitante@dominio.com' });

      const result = await resolver.resolver(SOLICITANTE_ID, CLIENTE_ID);

      expect(result.isOk()).toBe(true);
      expect(result.getValue().value()).toBe('solicitante@dominio.com');
      expect(mockUsuario.findFirst).toHaveBeenCalledWith({
        where: { id: SOLICITANTE_ID, clienteId: CLIENTE_ID, deletedAt: null },
        select: { email: true },
      });
    });

    it('retorna Result.fail(USUARIO_NO_ENCONTRADO) cuando el usuario no existe en el tenant', async () => {
      mockUsuario.findFirst.mockResolvedValue(null);

      const result = await resolver.resolver(SOLICITANTE_ID, CLIENTE_ID);

      expect(result.isFail()).toBe(true);
      expect(result.getError().code).toBe('USUARIO_NO_ENCONTRADO');
    });

    it('retorna Result.fail(USUARIO_NO_ENCONTRADO) cuando el usuario pertenece a otro tenant (nunca filtra cross-tenant)', async () => {
      // El mock representa la query real: findFirst con clienteId en el WHERE
      // ya excluye usuarios de otros tenants — el resultado es null.
      mockUsuario.findFirst.mockResolvedValue(null);

      const result = await resolver.resolver(SOLICITANTE_ID, 'otro-cliente-uuid');

      expect(result.isFail()).toBe(true);
      expect(result.getError().code).toBe('USUARIO_NO_ENCONTRADO');
      expect(mockUsuario.findFirst).toHaveBeenCalledWith({
        where: { id: SOLICITANTE_ID, clienteId: 'otro-cliente-uuid', deletedAt: null },
        select: { email: true },
      });
    });

    it('retorna Result.fail(EMAIL_NO_DISPONIBLE) cuando el usuario existe pero el email está vacío', async () => {
      mockUsuario.findFirst.mockResolvedValue({ email: '' });

      const result = await resolver.resolver(SOLICITANTE_ID, CLIENTE_ID);

      expect(result.isFail()).toBe(true);
      expect(result.getError().code).toBe('EMAIL_NO_DISPONIBLE');
    });

    it('nunca lanza excepción — retorna Result.fail incluso ante datos inconsistentes', async () => {
      mockUsuario.findFirst.mockResolvedValue({ email: null });

      await expect(resolver.resolver(SOLICITANTE_ID, CLIENTE_ID)).resolves.not.toThrow();
      const result = await resolver.resolver(SOLICITANTE_ID, CLIENTE_ID);
      expect(result.isFail()).toBe(true);
    });
  });
});
