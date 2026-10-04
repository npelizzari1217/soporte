/**
 * resolver-encuesta-token.service.spec.ts — TDD RED→GREEN (Tarea 5.1).
 *
 * Repos/colaboradores 100% fake (sin Nest, sin DB): un test por cada rama de
 * rechazo del binder (ADR-C1) + el test de seguridad más importante del
 * módulo — que `clienteId` bindeado sale de la FILA del token, nunca de un
 * valor externo.
 *
 * Ref spec: sdd/csat/spec, Requirement "Validación del token en el endpoint
 * público", "Cliente inactivo o eliminado no acepta escrituras". Ref design:
 * ADR-C1. Tarea: 5.1.
 */
import * as crypto from 'crypto';
import { ResolverEncuestaTokenService } from './resolver-encuesta-token.service';
import {
  EncuestaTokenEntity,
  EncuestaTokenProps,
} from '../../domain/entities/encuesta-token.entity';
import { EncuestaLinkInvalidoError } from '../../domain/errors/csat.errors';
import { ClienteEntity, ClienteProps } from '../../../clientes/domain/entities/cliente.entity';
import { IEncuestaTokenRepository } from '../../domain/ports/i-encuesta-token.repository';
import { IClienteRepository } from '../../../clientes/domain/ports/i-cliente.repository';

const RAW_TOKEN = 'raw-token-de-prueba';
const TOKEN_HASH = crypto.createHash('sha256').update(RAW_TOKEN).digest('hex');
const CLIENTE_ID_DE_LA_FILA = '01977a00-0000-7000-8000-0000000000c1';
const TICKET_ID = '01977a00-0000-7000-8000-0000000000t1';
const TOKEN_ID = '01977a00-0000-7000-8000-0000000000d1';

/** Props de token vigente por defecto — cada test overridea solo lo que rompe. */
function tokenPropsVigente(overrides: Partial<EncuestaTokenProps> = {}): EncuestaTokenProps {
  return {
    clienteId: CLIENTE_ID_DE_LA_FILA,
    ticketId: TICKET_ID,
    tokenHash: TOKEN_HASH,
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    usedAt: null,
    revokedAt: null,
    ...overrides,
  };
}

function makeToken(overrides: Partial<EncuestaTokenProps> = {}): EncuestaTokenEntity {
  return EncuestaTokenEntity.reconstitute(
    tokenPropsVigente(overrides),
    TOKEN_ID,
    new Date(),
    new Date(),
    null,
  );
}

/** Props de cliente válido (activo, no borrado, csatHabilitado) por defecto. */
function clientePropsValido(overrides: Partial<ClienteProps> = {}): ClienteProps {
  return {
    nombre: 'Cliente de Prueba',
    razonSocial: null,
    cuit: null,
    dbName: 'test_csat_cliente',
    activo: true,
    csatHabilitado: true,
    ...overrides,
  };
}

function makeCliente(
  id: string,
  overrides: Partial<ClienteProps> = {},
  deletedAt: Date | null = null,
): ClienteEntity {
  return ClienteEntity.reconstitute(
    clientePropsValido(overrides),
    id,
    new Date(),
    new Date(),
    deletedAt,
  );
}

/** Fake IEncuestaTokenRepository — `findByHash` devuelve un valor fijo inyectado por test. */
function makeFakeTokenRepo(token: EncuestaTokenEntity | null): IEncuestaTokenRepository {
  return {
    findByHash: vi.fn().mockResolvedValue(token),
    save: vi.fn(),
    revocarVigentesDeTicket: vi.fn(),
    marcarUsadoSiNoUsado: vi.fn(),
    liberarUso: vi.fn(),
  };
}

/** Fake IClienteRepository — `findById` es un vi.fn() configurable por test. */
function makeFakeClienteRepo(cliente: ClienteEntity | null): IClienteRepository {
  return {
    findById: vi.fn().mockResolvedValue(cliente),
    findByDbName: vi.fn(),
    findBySlug: vi.fn(),
    congelarSlug: vi.fn(),
    cambiarSlugSiNoCongelado: vi.fn(),
    findAll: vi.fn(),
    save: vi.fn(),
    delete: vi.fn(),
  };
}

function makeFakePrismaService(): { getTenantClient: ReturnType<typeof vi.fn> } {
  return { getTenantClient: vi.fn().mockReturnValue({ marker: 'tenant-client-stub' }) };
}

function makeFakeTenantContext(): { bind: ReturnType<typeof vi.fn> } {
  return { bind: vi.fn() };
}

function buildService(
  tokenRepo: IEncuestaTokenRepository,
  clienteRepo: IClienteRepository,
  prismaService = makeFakePrismaService(),
  tenantContext = makeFakeTenantContext(),
) {
  const service = new ResolverEncuestaTokenService(
    tokenRepo,
    clienteRepo,
    prismaService as never,
    tenantContext as never,
  );
  return { service, prismaService, tenantContext };
}

describe('ResolverEncuestaTokenService', () => {
  describe('ramas de rechazo — todas devuelven el MISMO EncuestaLinkInvalidoError', () => {
    it('sin fila (findByHash devuelve null)', async () => {
      const { service } = buildService(makeFakeTokenRepo(null), makeFakeClienteRepo(null));

      const resultado = await service.resolver(RAW_TOKEN);

      expect(resultado.isFail()).toBe(true);
      expect(resultado.getError()).toBeInstanceOf(EncuestaLinkInvalidoError);
    });

    /**
     * [WU12.2] Los tres tests de abajo usaban `makeFakeClienteRepo(null)`:
     * eso hace que, si el chequeo de token que el nombre del test dice
     * probar desapareciera, el guard SIGUIENTE (cliente inexistente) igual
     * rechazara con el mismo error — pasando por el motivo equivocado. Con
     * un cliente VÁLIDO, el único motivo posible de rechazo es el chequeo de
     * token bajo prueba.
     */
    it('token revocado', async () => {
      const token = makeToken({ revokedAt: new Date() });
      const cliente = makeCliente(CLIENTE_ID_DE_LA_FILA);
      const { service } = buildService(makeFakeTokenRepo(token), makeFakeClienteRepo(cliente));

      const resultado = await service.resolver(RAW_TOKEN);

      expect(resultado.isFail()).toBe(true);
      expect(resultado.getError()).toBeInstanceOf(EncuestaLinkInvalidoError);
    });

    it('token ya usado', async () => {
      const token = makeToken({ usedAt: new Date() });
      const cliente = makeCliente(CLIENTE_ID_DE_LA_FILA);
      const { service } = buildService(makeFakeTokenRepo(token), makeFakeClienteRepo(cliente));

      const resultado = await service.resolver(RAW_TOKEN);

      expect(resultado.isFail()).toBe(true);
      expect(resultado.getError()).toBeInstanceOf(EncuestaLinkInvalidoError);
    });

    it('token vencido', async () => {
      const token = makeToken({ expiresAt: new Date(Date.now() - 1000) });
      const cliente = makeCliente(CLIENTE_ID_DE_LA_FILA);
      const { service } = buildService(makeFakeTokenRepo(token), makeFakeClienteRepo(cliente));

      const resultado = await service.resolver(RAW_TOKEN);

      expect(resultado.isFail()).toBe(true);
      expect(resultado.getError()).toBeInstanceOf(EncuestaLinkInvalidoError);
    });

    it('cliente inexistente (findById devuelve null)', async () => {
      const token = makeToken();
      const { service } = buildService(makeFakeTokenRepo(token), makeFakeClienteRepo(null));

      const resultado = await service.resolver(RAW_TOKEN);

      expect(resultado.isFail()).toBe(true);
      expect(resultado.getError()).toBeInstanceOf(EncuestaLinkInvalidoError);
    });

    it('cliente activo=false', async () => {
      const token = makeToken();
      const cliente = makeCliente(CLIENTE_ID_DE_LA_FILA, { activo: false });
      const { service } = buildService(makeFakeTokenRepo(token), makeFakeClienteRepo(cliente));

      const resultado = await service.resolver(RAW_TOKEN);

      expect(resultado.isFail()).toBe(true);
      expect(resultado.getError()).toBeInstanceOf(EncuestaLinkInvalidoError);
    });

    it('cliente isDeleted()', async () => {
      const token = makeToken();
      const cliente = makeCliente(CLIENTE_ID_DE_LA_FILA, {}, new Date());
      const { service } = buildService(makeFakeTokenRepo(token), makeFakeClienteRepo(cliente));

      const resultado = await service.resolver(RAW_TOKEN);

      expect(resultado.isFail()).toBe(true);
      expect(resultado.getError()).toBeInstanceOf(EncuestaLinkInvalidoError);
    });

    it('cliente sin csatHabilitado', async () => {
      const token = makeToken();
      const cliente = makeCliente(CLIENTE_ID_DE_LA_FILA, { csatHabilitado: false });
      const { service } = buildService(makeFakeTokenRepo(token), makeFakeClienteRepo(cliente));

      const resultado = await service.resolver(RAW_TOKEN);

      expect(resultado.isFail()).toBe(true);
      expect(resultado.getError()).toBeInstanceOf(EncuestaLinkInvalidoError);
    });
  });

  describe('camino válido', () => {
    it('token vigente + cliente activo/habilitado → Result.ok con los datos resueltos', async () => {
      const token = makeToken();
      const cliente = makeCliente(CLIENTE_ID_DE_LA_FILA);
      const { service, tenantContext } = buildService(
        makeFakeTokenRepo(token),
        makeFakeClienteRepo(cliente),
      );

      const resultado = await service.resolver(RAW_TOKEN);

      expect(resultado.isOk()).toBe(true);
      expect(resultado.getValue()).toEqual({
        tokenId: TOKEN_ID,
        ticketId: TICKET_ID,
        clienteId: CLIENTE_ID_DE_LA_FILA,
      });
      expect(tenantContext.bind).toHaveBeenCalledTimes(1);
    });
  });

  describe('el clienteId bindeado SALE DE LA FILA DEL TOKEN, nunca de otra fuente', () => {
    it('el clienteId que llega a clienteRepo.findById() y a TenantContext.bind() es EXACTAMENTE el de la fila del token — no un valor externo ni hardcodeado', async () => {
      // Un clienteId deliberadamente distintivo (no una constante reusada en
      // otro test) para que un futuro cambio que hardcodee o tome el
      // clienteId de otra fuente (ej. un parámetro nuevo agregado a
      // resolver()) rompa esta aserción en vez de pasar por casualidad.
      const clienteIdDeLaFilaDelToken = '01977a00-0000-7000-8000-c1c1c1c1c1c1';
      const token = makeToken({ clienteId: clienteIdDeLaFilaDelToken });
      const cliente = makeCliente(clienteIdDeLaFilaDelToken);
      const clienteRepo = makeFakeClienteRepo(cliente);
      const { service, tenantContext } = buildService(makeFakeTokenRepo(token), clienteRepo);

      const resultado = await service.resolver(RAW_TOKEN);

      // 1) El repo de clientes se consultó CON el clienteId de la fila —
      //    no con ningún otro id (la firma de resolver() no recibe ninguno).
      expect(clienteRepo.findById).toHaveBeenCalledWith(clienteIdDeLaFilaDelToken);
      expect(clienteRepo.findById).toHaveBeenCalledTimes(1);

      // 2) El bind del TenantContext usa ESE MISMO clienteId — si alguien
      //    reemplaza la fuente (ej. un clienteId de query param) esta
      //    aserción se rompe porque el valor bindeado dejaría de coincidir.
      expect(tenantContext.bind).toHaveBeenCalledWith(
        expect.objectContaining({ clienteId: clienteIdDeLaFilaDelToken }),
      );

      // 3) El valor devuelto al caller también coincide.
      expect(resultado.getValue().clienteId).toBe(clienteIdDeLaFilaDelToken);
    });
  });
});
