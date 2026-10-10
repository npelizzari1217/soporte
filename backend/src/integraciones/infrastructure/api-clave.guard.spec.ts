import { UnauthorizedException } from '@nestjs/common';
import { ExecutionContextHost } from '@nestjs/core/helpers/execution-context-host';
import { UsuarioEntity } from '../../auth/domain/entities/usuario.entity';
import { MembresiaResuelta } from '../../auth/domain/ports/i-membresia.repository';
import { JwtPayload } from '../../auth/domain/ports/i-token.service';
import { ClienteEntity } from '../../clientes/domain/entities/cliente.entity';
import { PermisoApi, ApiClave } from '../domain/api-clave';
import { hashearClaveApi } from '../domain/generar-clave-api';
import { ApiClaveAutenticada, ApiClaveGuard, INTERVALO_USO_MS } from './api-clave.guard';

const CLAVE = 'sop_clave-de-prueba';

interface Pedido {
  headers: Record<string, string | string[] | undefined>;
  user?: JwtPayload | null;
  apiClave?: ApiClaveAutenticada;
}

function armar(
  opciones: {
    permisos?: PermisoApi[];
    revocada?: boolean;
    clienteActivo?: boolean;
    apiHabilitada?: boolean;
    clienteBorrado?: boolean;
    usuario?: 'ok' | 'ausente' | 'inactivo' | 'borrado';
    membresia?: boolean;
    claveConocida?: boolean;
  } = {},
) {
  const cliente = ClienteEntity.create({
    nombre: 'Acme',
    razonSocial: null,
    cuit: null,
    dbName: 'acme_db',
    activo: opciones.clienteActivo ?? true,
    apiHabilitada: opciones.apiHabilitada ?? true,
  });
  if (opciones.clienteBorrado) cliente.softDelete();
  const usuario = UsuarioEntity.create({
    email: 'integracion@integraciones.invalid',
    nombre: 'Integracion',
    apellido: 'API',
    passwordHash: 'x',
    activo: opciones.usuario !== 'inactivo',
    esIntegracion: true,
  });
  if (opciones.usuario === 'borrado') usuario.softDelete();
  const fila: ApiClave = {
    id: 'clave-1',
    clienteId: cliente.id,
    usuarioId: usuario.id,
    nombre: 'ERP',
    prefijo: 'sop_clave-de',
    hash: hashearClaveApi(CLAVE),
    permisos: opciones.permisos ?? ['TICKETS:LECTURA'],
    creadaPorId: 'admin-1',
    creadaAt: new Date(),
    ultimoUsoAt: null,
    revocadaAt: opciones.revocada ? new Date() : null,
  };
  const membresia: MembresiaResuelta = {
    clienteId: cliente.id,
    clienteNombre: cliente.nombre,
    rolCodigo: 'USUARIO',
    clienteRequiere2fa: false,
  };
  const registrarUso = vi.fn().mockResolvedValue(undefined);
  const buscarPorHash = vi
    .fn()
    .mockImplementation(async (hash: string) =>
      opciones.claveConocida === false || hash !== fila.hash ? null : fila,
    );
  const bind = vi.fn();
  const getTenantClient = vi.fn().mockReturnValue({ tenant: true });
  const log = vi.fn();
  const guard = new ApiClaveGuard(
    { buscarPorHash, registrarUso },
    { findById: async (id) => (id === cliente.id ? cliente : null) },
    {
      findById: async (id) =>
        opciones.usuario === 'ausente' || id !== usuario.id ? null : usuario,
    },
    { findActivaByUsuarioYCliente: async () => (opciones.membresia === false ? null : membresia) },
    { getTenantClient },
    { bind },
    { log },
  );
  return { guard, cliente, usuario, registrarUso, bind, getTenantClient, log };
}

function contexto(pedido: Pedido): ExecutionContextHost {
  return new ExecutionContextHost([pedido]);
}

const conClave = (valor: string | string[] | undefined = CLAVE): Pedido => ({
  headers: { 'x-api-key': valor },
});

async function error401(promesa: Promise<boolean>): Promise<UnauthorizedException> {
  const error: unknown = await promesa.then(
    () => null,
    (e: unknown) => e,
  );
  if (!(error instanceof UnauthorizedException)) {
    throw new Error('Se esperaba un UnauthorizedException');
  }
  return error;
}

describe('ApiClaveGuard', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  describe('rechazos: un mismo 401 sin pista', () => {
    const casos: [string, Parameters<typeof armar>[0], Pedido | undefined][] = [
      ['header ausente', {}, { headers: {} }],
      ['header repetido', {}, conClave(['a', 'b'])],
      ['header sin el prefijo sop_', {}, conClave('otra-cosa')],
      ['header desmesurado', {}, conClave(`sop_${'a'.repeat(500)}`)],
      ['clave desconocida', { claveConocida: false }, undefined],
      ['clave revocada', { revocada: true }, undefined],
      ['cliente inactivo', { clienteActivo: false }, undefined],
      ['cliente borrado', { clienteBorrado: true }, undefined],
      ['API deshabilitada', { apiHabilitada: false }, undefined],
      ['usuario de integracion ausente', { usuario: 'ausente' }, undefined],
      ['usuario de integracion inactivo', { usuario: 'inactivo' }, undefined],
      ['usuario de integracion borrado', { usuario: 'borrado' }, undefined],
      ['membresia inactiva', { membresia: false }, undefined],
    ];

    it.each(casos)('%s', async (_nombre, opciones, pedido) => {
      const { guard, bind, registrarUso } = armar(opciones);
      const p = pedido ?? conClave();

      const error = await error401(guard.canActivate(contexto(p)));

      expect(error.getStatus()).toBe(401);
      expect(error.getResponse()).toEqual(new UnauthorizedException('No autorizado').getResponse());
      expect(bind).not.toHaveBeenCalled();
      expect(registrarUso).not.toHaveBeenCalled();
      expect(p.user).toBeUndefined();
    });

    it('registra el motivo real en el log sin la clave ni su hash', async () => {
      const { guard, log } = armar({ revocada: true });

      await error401(guard.canActivate(contexto(conClave())));

      const mensaje = String(log.mock.calls[0][0]);
      expect(mensaje).toContain('clave revocada');
      expect(mensaje).not.toContain(CLAVE);
      expect(mensaje).not.toContain(hashearClaveApi(CLAVE));
    });
  });

  describe('exito', () => {
    it('bindea el tenant del cliente de la clave y arma el actor sintetico', async () => {
      const { guard, cliente, usuario, bind, getTenantClient } = armar({
        permisos: ['TICKETS:ALTAS'],
      });
      const pedido = conClave();

      await expect(guard.canActivate(contexto(pedido))).resolves.toBe(true);

      expect(getTenantClient).toHaveBeenCalledWith('acme_db');
      expect(bind).toHaveBeenCalledWith({
        prismaClient: { tenant: true },
        dbName: 'acme_db',
        clienteId: cliente.id,
      });
      expect(pedido.user).toEqual({
        v: expect.any(Number),
        sub: usuario.id,
        cliente_id: cliente.id,
        rol: 'USUARIO',
        permisos: ['TICKETS:ALTAS'],
        is_global_admin: false,
        cliente_nombre: 'Acme',
        membresias: [],
        modulos: ['TICKETS'],
        nombre: 'Integracion',
        apellido: 'API',
        cliente_logo_v: null,
      });
      expect(pedido.apiClave).toEqual({ id: 'clave-1', prefijo: 'sop_clave-de' });
    });

    it('agrega TICKETS:VER_TODOS solo cuando la clave lleva TICKETS:LECTURA', async () => {
      const conLectura = armar({ permisos: ['TICKETS:LECTURA', 'TICKETS:COMENTAR'] });
      const p1 = conClave();
      await conLectura.guard.canActivate(contexto(p1));
      expect(p1.user?.permisos).toEqual([
        'TICKETS:LECTURA',
        'TICKETS:COMENTAR',
        'TICKETS:VER_TODOS',
      ]);

      const sinLectura = armar({ permisos: ['TICKETS:ALTAS', 'TICKETS:COMENTAR'] });
      const p2 = conClave();
      await sinLectura.guard.canActivate(contexto(p2));
      expect(p2.user?.permisos).toEqual(['TICKETS:ALTAS', 'TICKETS:COMENTAR']);
    });
  });

  describe('ultimo uso', () => {
    it('lo registra una vez por intervalo y por clave', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-10-10T12:00:00Z'));
      const { guard, registrarUso } = armar();

      await guard.canActivate(contexto(conClave()));
      await guard.canActivate(contexto(conClave()));
      expect(registrarUso).toHaveBeenCalledTimes(1);
      expect(registrarUso).toHaveBeenCalledWith('clave-1', new Date('2026-10-10T12:00:00Z'));

      vi.advanceTimersByTime(INTERVALO_USO_MS);
      await guard.canActivate(contexto(conClave()));
      expect(registrarUso).toHaveBeenCalledTimes(2);
    });

    it('si falla la escritura el pedido sigue adelante y se reintenta en el siguiente', async () => {
      const { guard, registrarUso } = armar();
      registrarUso.mockRejectedValueOnce(new Error('base caida'));

      await expect(guard.canActivate(contexto(conClave()))).resolves.toBe(true);
      await Promise.resolve();
      await expect(guard.canActivate(contexto(conClave()))).resolves.toBe(true);

      expect(registrarUso).toHaveBeenCalledTimes(2);
    });
  });
});
