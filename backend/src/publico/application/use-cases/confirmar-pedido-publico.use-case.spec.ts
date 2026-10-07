/**
 * confirmar-pedido-publico.use-case.spec.ts — `POST confirmar` (sdd/formulario-publico-qr, WU-14;
 * tarea 14.3; D1, ADR-4, ADR-7). Fakes puros, sin Nest ni base: la atomicidad real (DELETE
 * concurrente, ROLLBACK que restaura la fila) la prueba la integracion de `confirmar-pedido-publico`.
 */
import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { ClienteEntity } from '../../../clientes/domain/entities/cliente.entity';
import { IClienteRepository } from '../../../clientes/domain/ports/i-cliente.repository';
import { EstadoCorreoCliente } from '../../../auth/domain/ports/i-correo-de-cliente.port';
import { TicketSoporteEntity } from '../../../equipos/domain/entities/ticket-soporte.entity';
import { DomainError, Result } from '../../../shared/domain/result';
import { AUTOR_FORMULARIO_PUBLICO } from '../../../tickets/domain/constants/formulario-publico.constants';
import { TicketEntity } from '../../../tickets/domain/entities/ticket.entity';
import { SinCicloActivoError } from '../../../tickets/domain/errors/tickets.errors';
import { PedidoPendienteEntity } from '../../domain/entities/pedido-pendiente.entity';
import { PedidoPublicoTokenEntity } from '../../domain/entities/pedido-publico-token.entity';
import { FormularioPublicoNoDisponibleError } from '../../domain/errors/publico.errors';
import { ResolverClientePublicoService } from '../services/resolver-cliente-publico.service';
import { ConfirmarPedidoPublicoUseCase } from './confirmar-pedido-publico.use-case';

const CLIENTE_ID = '01977a00-0000-7000-8000-0000000000c1';
const TOKEN_CRUDO = 'token-crudo-de-prueba';
const PRIORIDAD_MEDIA = '01977a00-0000-7000-8000-0000000000a1';
const EQUIPO_ID = '01977a00-0000-7000-8000-0000000000e1';

const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');

function cliente(id = CLIENTE_ID): ClienteEntity {
  return ClienteEntity.reconstitute(
    {
      nombre: 'Colegio Norte',
      razonSocial: null,
      cuit: null,
      dbName: 'tenant_norte',
      activo: true,
      slug: 'colegio-norte',
      formularioPublicoHabilitado: true,
    },
    id,
    new Date(),
    new Date(),
    null,
  );
}

function pendiente(over: { ahora?: Date; equipoId?: string | null } = {}): PedidoPendienteEntity {
  return PedidoPendienteEntity.create({
    nombre: 'Ana Pérez',
    email: 'Ana@Example.com',
    telefono: '11 5555-0000',
    titulo: 'No enciende la PC',
    descripcion: 'La PC del laboratorio no enciende.',
    equipoId: over.equipoId === undefined ? EQUIPO_ID : over.equipoId,
    ahora: over.ahora,
  }).getValue();
}

function ticketCreado(numero = 'SOP-2026-0001') {
  const ticket = TicketEntity.create({
    numero,
    titulo: 'No enciende la PC',
    descripcion: null,
    tipoId: 't',
    estadoId: 'e',
    prioridadId: PRIORIDAD_MEDIA,
    cicloId: 'c',
    ticketReferenciaId: null,
    solicitanteId: null,
    solicitanteExternoId: 'x',
  });
  return {
    ticket,
    ticketSoporte: TicketSoporteEntity.create({ ticketId: ticket.id, equipoId: EQUIPO_ID }),
  };
}

function setup(
  over: {
    cliente?: ClienteEntity | null;
    token?: PedidoPublicoTokenEntity | null;
    consumido?: PedidoPendienteEntity | null;
    estado?: EstadoCorreoCliente;
    prioridadId?: string | null;
    crear?: () => Promise<Result<ReturnType<typeof ticketCreado>, DomainError>>;
    marcarUsado?: () => Promise<boolean>;
  } = {},
) {
  const llamadas: string[] = [];
  const clienteRepo: IClienteRepository = {
    findById: vi.fn(),
    findByDbName: vi.fn(),
    findBySlug: vi.fn().mockResolvedValue(over.cliente === undefined ? cliente() : over.cliente),
    congelarSlug: vi.fn(),
    fijarRequiere2fa: vi.fn(),
    obtenerRequiere2fa: vi.fn(),
    cambiarSlugSiNoCongelado: vi.fn(),
    findAll: vi.fn(),
    save: vi.fn(),
    delete: vi.fn(),
  };
  const resolver = new ResolverClientePublicoService(
    clienteRepo,
    { getTenantClient: vi.fn().mockReturnValue({}) },
    { bind: vi.fn() },
  );
  const token =
    over.token === undefined
      ? PedidoPublicoTokenEntity.emitir({ clienteId: CLIENTE_ID, tokenHash: sha256(TOKEN_CRUDO) })
      : over.token;
  const tokenRepo = {
    save: vi.fn(),
    findByHash: vi.fn().mockResolvedValue(token),
    marcarUsado: vi.fn().mockImplementation(async () => {
      llamadas.push('marcarUsado');
      return over.marcarUsado ? over.marcarUsado() : true;
    }),
  };
  const pendienteRepo = {
    consumir: vi.fn().mockImplementation(async () => {
      llamadas.push('consumir');
      return over.consumido === undefined ? pendiente() : over.consumido;
    }),
  };
  const solicitanteRepo = {
    save: vi.fn().mockImplementation(async () => {
      llamadas.push('solicitante.save');
    }),
  };
  const prioridadRepo = {
    findIdByCodigo: vi
      .fn()
      .mockResolvedValue(over.prioridadId === undefined ? PRIORIDAD_MEDIA : over.prioridadId),
  };
  const crearTicketSoporte = {
    execute: vi.fn().mockImplementation(async () => {
      llamadas.push('crearTicket');
      return over.crear ? over.crear() : Result.ok(ticketCreado());
    }),
  };
  const tx = { rollbacks: 0, commits: 0 };
  const txRunner = {
    run: vi.fn().mockImplementation(async (fn: () => Promise<unknown>) => {
      llamadas.push('tx.inicio');
      try {
        const r = await fn();
        tx.commits += 1;
        llamadas.push('tx.commit');
        return r;
      } catch (e) {
        tx.rollbacks += 1;
        llamadas.push('tx.rollback');
        throw e;
      }
    }),
    alCommitear: vi.fn(),
  };
  const correo = { estado: vi.fn().mockResolvedValue(over.estado ?? 'LISTO') };
  const logger = { error: vi.fn() };
  const useCase = new ConfirmarPedidoPublicoUseCase(
    resolver,
    correo,
    tokenRepo,
    pendienteRepo,
    solicitanteRepo,
    prioridadRepo,
    crearTicketSoporte,
    txRunner,
    logger,
  );
  return {
    useCase,
    tokenRepo,
    pendienteRepo,
    solicitanteRepo,
    prioridadRepo,
    crearTicketSoporte,
    txRunner,
    correo,
    logger,
    tx,
    llamadas,
  };
}

const comando = { slug: 'colegio-norte', token: TOKEN_CRUDO };

function esNoDisponible(r: Result<unknown, DomainError>): void {
  expect(r.isFail()).toBe(true);
  expect(r.getError()).toBeInstanceOf(FormularioPublicoNoDisponibleError);
}

describe('ConfirmarPedidoPublicoUseCase', () => {
  describe('camino feliz', () => {
    it('crea el ticket con los datos del pendiente, MEDIA, OMITIR y el autor del formulario', async () => {
      const { useCase, crearTicketSoporte, solicitanteRepo, tokenRepo } = setup();

      const r = await useCase.ejecutar(comando);

      expect(r.isOk()).toBe(true);
      expect(r.getValue()).toMatchObject({
        numero: 'SOP-2026-0001',
        nombre: 'Ana Pérez',
        email: 'ana@example.com',
        clienteId: CLIENTE_ID,
        clienteNombre: 'Colegio Norte',
      });
      expect(solicitanteRepo.save).toHaveBeenCalledTimes(1);
      expect(tokenRepo.findByHash).toHaveBeenCalledWith(sha256(TOKEN_CRUDO));
      const dto = crearTicketSoporte.execute.mock.calls[0][0];
      expect(dto).toMatchObject({
        titulo: 'No enciende la PC',
        descripcion: 'La PC del laboratorio no enciende.',
        prioridadId: PRIORIDAD_MEDIA,
        equipoId: EQUIPO_ID,
        solicitanteId: null,
        equipoInvalido: 'OMITIR',
        clienteId: CLIENTE_ID,
        autorId: AUTOR_FORMULARIO_PUBLICO,
      });
      expect(dto.solicitanteExternoId).toEqual(expect.any(String));
    });

    it('pide la prioridad por el codigo MEDIA y nunca la recibe del comando', async () => {
      const { useCase, prioridadRepo, crearTicketSoporte } = setup();

      const conPrioridadAjena = { ...comando, prioridadId: 'CRITICA' };
      await useCase.ejecutar(conPrioridadAjena);

      expect(prioridadRepo.findIdByCodigo).toHaveBeenCalledWith('MEDIA');
      expect(crearTicketSoporte.execute.mock.calls[0][0].prioridadId).toBe(PRIORIDAD_MEDIA);
    });

    it('todo ocurre dentro de la transaccion y used_at se marca DESPUES del commit', async () => {
      const { useCase, llamadas } = setup();

      await useCase.ejecutar(comando);

      expect(llamadas).toEqual([
        'tx.inicio',
        'consumir',
        'solicitante.save',
        'crearTicket',
        'tx.commit',
        'marcarUsado',
      ]);
    });

    it('un fallo al marcar used_at no tumba la confirmacion y se loguea', async () => {
      const { useCase, logger } = setup({
        marcarUsado: async () => {
          throw new Error('master caido');
        },
      });

      const r = await useCase.ejecutar(comando);

      expect(r.isOk()).toBe(true);
      expect(logger.error).toHaveBeenCalledTimes(1);
    });
  });

  describe('rollback: el link sigue valido', () => {
    it('sin ciclo activo devuelve el error del ticket, hace ROLLBACK y no marca used_at', async () => {
      const { useCase, tx, tokenRepo, llamadas } = setup({
        crear: async () => Result.fail(new SinCicloActivoError()),
      });

      const r = await useCase.ejecutar(comando);

      expect(r.isFail()).toBe(true);
      expect(r.getError()).toBeInstanceOf(SinCicloActivoError);
      expect(tx.rollbacks).toBe(1);
      expect(tx.commits).toBe(0);
      expect(tokenRepo.marcarUsado).not.toHaveBeenCalled();
      expect(llamadas).toContain('tx.rollback');
    });

    it('un error inesperado del ticket tambien hace ROLLBACK y se propaga', async () => {
      const { useCase, tx, tokenRepo } = setup({
        crear: async () => {
          throw new Error('catalogo inconsistente');
        },
      });

      await expect(useCase.ejecutar(comando)).rejects.toThrow('catalogo inconsistente');
      expect(tx.rollbacks).toBe(1);
      expect(tokenRepo.marcarUsado).not.toHaveBeenCalled();
    });
  });

  describe('404 uniforme', () => {
    it('token inexistente: no toca el tenant ni la transaccion', async () => {
      const { useCase, txRunner, pendienteRepo } = setup({ token: null });

      esNoDisponible(await useCase.ejecutar(comando));
      expect(txRunner.run).not.toHaveBeenCalled();
      expect(pendienteRepo.consumir).not.toHaveBeenCalled();
    });

    it('token vacio no consulta master', async () => {
      const { useCase, tokenRepo } = setup();

      esNoDisponible(await useCase.ejecutar({ slug: 'colegio-norte', token: '' }));
      expect(tokenRepo.findByHash).not.toHaveBeenCalled();
    });

    it('token vencido, usado o revocado no es vigente', async () => {
      const vencido = PedidoPublicoTokenEntity.emitir({
        clienteId: CLIENTE_ID,
        tokenHash: sha256(TOKEN_CRUDO),
        ahora: new Date('2020-01-01T00:00:00Z'),
      });
      const usado = PedidoPublicoTokenEntity.reconstitute(
        {
          clienteId: CLIENTE_ID,
          tokenHash: sha256(TOKEN_CRUDO),
          expiresAt: new Date(Date.now() + 60_000),
          usedAt: new Date(),
          revokedAt: null,
        },
        'u',
        new Date(),
        new Date(),
        null,
      );
      const revocado = PedidoPublicoTokenEntity.reconstitute(
        {
          clienteId: CLIENTE_ID,
          tokenHash: sha256(TOKEN_CRUDO),
          expiresAt: new Date(Date.now() + 60_000),
          usedAt: null,
          revokedAt: new Date(),
        },
        'r',
        new Date(),
        new Date(),
        null,
      );
      for (const token of [vencido, usado, revocado]) {
        const { useCase, txRunner } = setup({ token });
        esNoDisponible(await useCase.ejecutar(comando));
        expect(txRunner.run).not.toHaveBeenCalled();
      }
    });

    it('token de otro cliente sobre este slug es 404 sin abrir transaccion', async () => {
      const ajeno = PedidoPublicoTokenEntity.emitir({
        clienteId: '01977a00-0000-7000-8000-0000000000c2',
        tokenHash: sha256(TOKEN_CRUDO),
      });
      const { useCase, txRunner, crearTicketSoporte } = setup({ token: ajeno });

      esNoDisponible(await useCase.ejecutar(comando));
      expect(txRunner.run).not.toHaveBeenCalled();
      expect(crearTicketSoporte.execute).not.toHaveBeenCalled();
    });

    it('slug inexistente o cliente no disponible es 404', async () => {
      const { useCase, txRunner } = setup({ cliente: null });

      esNoDisponible(await useCase.ejecutar(comando));
      expect(txRunner.run).not.toHaveBeenCalled();
    });

    it.each<EstadoCorreoCliente>(['SIN_CORREO', 'CLIENTE_NO_DISPONIBLE'])(
      'correo en estado %s es 404 y no consume el pendiente',
      async (estado) => {
        const { useCase, pendienteRepo } = setup({ estado });

        esNoDisponible(await useCase.ejecutar(comando));
        expect(pendienteRepo.consumir).not.toHaveBeenCalled();
      },
    );

    it('sin pendiente (ya consumido por otra confirmacion) es 404 y no crea nada', async () => {
      const { useCase, crearTicketSoporte, solicitanteRepo, tokenRepo } = setup({
        consumido: null,
      });

      esNoDisponible(await useCase.ejecutar(comando));
      expect(solicitanteRepo.save).not.toHaveBeenCalled();
      expect(crearTicketSoporte.execute).not.toHaveBeenCalled();
      expect(tokenRepo.marcarUsado).not.toHaveBeenCalled();
    });

    it('pendiente vencido es 404, queda borrado (PII) y no crea ticket', async () => {
      const { useCase, crearTicketSoporte, tx } = setup({
        consumido: pendiente({ ahora: new Date('2020-01-01T00:00:00Z') }),
      });

      esNoDisponible(await useCase.ejecutar(comando));
      expect(crearTicketSoporte.execute).not.toHaveBeenCalled();
      expect(tx.commits).toBe(1);
      expect(tx.rollbacks).toBe(0);
    });
  });

  it('sin la prioridad MEDIA en el catalogo lanza un error defensivo antes de abrir la transaccion', async () => {
    const { useCase, txRunner } = setup({ prioridadId: null });

    await expect(useCase.ejecutar(comando)).rejects.toThrow(/MEDIA/);
    expect(txRunner.run).not.toHaveBeenCalled();
  });
});
