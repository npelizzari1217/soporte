/**
 * solicitar-pedido-publico.use-case.spec.ts — `POST solicitud` (sdd/formulario-publico-qr, WU-13;
 * tarea 13.1; D1, D3, ADR-1, ADR-7). Fakes puros, sin Nest ni base.
 */
import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { ClienteEntity } from '../../../clientes/domain/entities/cliente.entity';
import { IClienteRepository } from '../../../clientes/domain/ports/i-cliente.repository';
import { EstadoCorreoCliente } from '../../../auth/domain/ports/i-correo-de-cliente.port';
import { hashTokenQr } from '../../../equipos/application/use-cases/emitir-qr-equipo.use-case';
import { equipoDadoDeBaja, equipoVigente } from '../../../equipos/testing/equipos-unit.fixtures';
import {
  FormularioPublicoNoDisponibleError,
  PedidoPendienteInvalidoError,
} from '../../domain/errors/publico.errors';
import { PedidoPendienteEntity } from '../../domain/entities/pedido-pendiente.entity';
import { PedidoPublicoTokenEntity } from '../../domain/entities/pedido-publico-token.entity';
import { ResolverClientePublicoService } from '../services/resolver-cliente-publico.service';
import {
  SolicitarPedidoPublicoCommand,
  SolicitarPedidoPublicoUseCase,
} from './solicitar-pedido-publico.use-case';

const BASE = 'https://soporte.sesitec.net';

function clienteHabilitado(): ClienteEntity {
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
    '01977a00-0000-7000-8000-0000000000c1',
    new Date(),
    new Date(),
    null,
  );
}

const comando: SolicitarPedidoPublicoCommand = {
  slug: 'colegio-norte',
  nombre: 'Ana Pérez',
  email: 'Ana@Example.com',
  telefono: '11 5555-0000',
  titulo: 'No enciende la PC',
  descripcion: 'La PC del laboratorio no enciende.',
};

function setup(
  over: {
    cliente?: ClienteEntity | null;
    estado?: EstadoCorreoCliente;
    equipo?: ReturnType<typeof equipoVigente> | null;
  } = {},
) {
  const llamadas: string[] = [];
  const guardados: { pendiente?: PedidoPendienteEntity; token?: PedidoPublicoTokenEntity } = {};
  const clienteRepo: IClienteRepository = {
    findById: vi.fn(),
    findByDbName: vi.fn(),
    findBySlug: vi
      .fn()
      .mockResolvedValue(over.cliente === undefined ? clienteHabilitado() : over.cliente),
    congelarSlug: vi.fn(),
    cambiarSlugSiNoCongelado: vi.fn(),
    findAll: vi.fn(),
    save: vi.fn(),
    delete: vi.fn(),
  };
  const tenantContext = { bind: vi.fn() };
  const resolver = new ResolverClientePublicoService(
    clienteRepo,
    { getTenantClient: vi.fn().mockReturnValue({}) },
    tenantContext,
  );
  const correo = {
    estado: vi.fn().mockResolvedValue(over.estado ?? 'LISTO'),
    enviar: vi.fn().mockResolvedValue(undefined),
  };
  const equipoRepo = {
    findByQrHash: vi.fn().mockResolvedValue(over.equipo === undefined ? null : over.equipo),
  };
  const pendienteRepo = {
    save: vi.fn().mockImplementation(async (p: PedidoPendienteEntity) => {
      llamadas.push('pendiente.save');
      guardados.pendiente = p;
    }),
    consumir: vi.fn(),
    purgarVencidos: vi.fn().mockImplementation(async () => {
      llamadas.push('purgarVencidos');
      return 0;
    }),
  };
  const tokenRepo = {
    save: vi.fn().mockImplementation(async (t: PedidoPublicoTokenEntity) => {
      llamadas.push('token.save');
      guardados.token = t;
    }),
    findByHash: vi.fn(),
    marcarUsado: vi.fn(),
  };
  const tareas = { lanzar: vi.fn() };
  const useCase = new SolicitarPedidoPublicoUseCase(
    resolver,
    correo,
    equipoRepo,
    pendienteRepo,
    tokenRepo,
    tareas,
    BASE,
  );
  return { useCase, correo, equipoRepo, pendienteRepo, tokenRepo, tareas, guardados, llamadas };
}

describe('SolicitarPedidoPublicoUseCase', () => {
  describe('rechazos: 404 uniforme y sin escribir PII', () => {
    it.each<EstadoCorreoCliente>(['SIN_CORREO', 'CLIENTE_NO_DISPONIBLE'])(
      'correo en estado %s no escribe en master ni en el tenant ni manda mail',
      async (estado) => {
        const { useCase, pendienteRepo, tokenRepo, tareas, correo } = setup({ estado });

        const r = await useCase.ejecutar(comando);

        expect(r.isFail()).toBe(true);
        expect(r.getError()).toBeInstanceOf(FormularioPublicoNoDisponibleError);
        expect(tokenRepo.save).not.toHaveBeenCalled();
        expect(pendienteRepo.save).not.toHaveBeenCalled();
        expect(pendienteRepo.purgarVencidos).not.toHaveBeenCalled();
        expect(tareas.lanzar).not.toHaveBeenCalled();
        expect(correo.enviar).not.toHaveBeenCalled();
      },
    );

    it('slug inexistente da el mismo error, sin consultar el correo', async () => {
      const { useCase, correo, tokenRepo, pendienteRepo } = setup({ cliente: null });

      const r = await useCase.ejecutar(comando);

      expect(r.getError()).toBeInstanceOf(FormularioPublicoNoDisponibleError);
      expect(correo.estado).not.toHaveBeenCalled();
      expect(tokenRepo.save).not.toHaveBeenCalled();
      expect(pendienteRepo.save).not.toHaveBeenCalled();
    });

    it('datos inválidos para el dominio devuelven PedidoPendienteInvalidoError sin escribir', async () => {
      const { useCase, tokenRepo, pendienteRepo } = setup();

      const r = await useCase.ejecutar({ ...comando, titulo: 'ab' });

      expect(r.getError()).toBeInstanceOf(PedidoPendienteInvalidoError);
      expect(tokenRepo.save).not.toHaveBeenCalled();
      expect(pendienteRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('camino feliz', () => {
    it('purga, guarda el pendiente en el tenant y el token en master bajo el mismo id', async () => {
      const { useCase, guardados, llamadas } = setup();

      const r = await useCase.ejecutar(comando);

      expect(r.isOk()).toBe(true);
      expect(llamadas).toEqual(['purgarVencidos', 'pendiente.save', 'token.save']);
      expect(guardados.pendiente?.email).toBe('ana@example.com');
      expect(guardados.token?.id).toBe(guardados.pendiente?.id);
      expect(guardados.token?.clienteId).toBe('01977a00-0000-7000-8000-0000000000c1');
    });

    it('master guarda solo el hash: el token crudo del link no está en ningún lado persistido', async () => {
      const { useCase, guardados, tareas, correo } = setup();

      await useCase.ejecutar(comando);
      const tarea = tareas.lanzar.mock.calls[0][1] as () => Promise<void>;
      await tarea();

      const mensaje = correo.enviar.mock.calls[0][1] as { text: string };
      const crudo = /#token=(\S+)/.exec(mensaje.text)?.[1] ?? '';
      expect(crudo.length).toBeGreaterThanOrEqual(43);
      expect(guardados.token?.tokenHash).toBe(createHash('sha256').update(crudo).digest('hex'));
      expect(JSON.stringify(guardados.token)).not.toContain(crudo);
    });

    it('el mail sale diferido por ITareasSegundoPlano, al email normalizado y con el link de APP_BASE_URL', async () => {
      const { useCase, tareas, correo } = setup();

      await useCase.ejecutar(comando);

      expect(tareas.lanzar).toHaveBeenCalledTimes(1);
      expect(tareas.lanzar.mock.calls[0][0]).toBe('pedido-publico.verificacion');
      expect(correo.enviar).not.toHaveBeenCalled();

      await (tareas.lanzar.mock.calls[0][1] as () => Promise<void>)();

      expect(correo.enviar).toHaveBeenCalledTimes(1);
      const [clienteId, mensaje] = correo.enviar.mock.calls[0] as [
        string,
        { to: string; text: string },
      ];
      expect(clienteId).toBe('01977a00-0000-7000-8000-0000000000c1');
      expect(mensaje.to).toBe('ana@example.com');
      expect(mensaje.text).toContain(`${BASE}/c/colegio-norte/pedido/confirmar#token=`);
    });
  });

  describe('equipo del QR', () => {
    it('resuelve el equipo por el hash del token y lo guarda en el pendiente', async () => {
      const equipo = equipoVigente();
      const { useCase, equipoRepo, guardados } = setup({ equipo });

      await useCase.ejecutar({ ...comando, equipoToken: 'token-del-qr' });

      expect(equipoRepo.findByQrHash).toHaveBeenCalledWith(hashTokenQr('token-del-qr'));
      expect(guardados.pendiente?.equipoId).toBe(equipo.id);
    });

    it('token inexistente, equipo de baja o token desmedido dejan equipoId en null sin fallar', async () => {
      const inexistente = setup({ equipo: null });
      await inexistente.useCase.ejecutar({ ...comando, equipoToken: 'no-existe' });
      expect(inexistente.guardados.pendiente?.equipoId).toBeNull();

      const baja = setup({ equipo: equipoDadoDeBaja() });
      await baja.useCase.ejecutar({ ...comando, equipoToken: 'de-baja' });
      expect(baja.guardados.pendiente?.equipoId).toBeNull();

      const largo = setup();
      const r = await largo.useCase.ejecutar({ ...comando, equipoToken: 'x'.repeat(500) });
      expect(r.isOk()).toBe(true);
      expect(largo.equipoRepo.findByQrHash).not.toHaveBeenCalled();
      expect(largo.guardados.pendiente?.equipoId).toBeNull();
    });
  });
});
