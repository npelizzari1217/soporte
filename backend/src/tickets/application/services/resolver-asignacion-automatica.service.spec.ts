/**
 * [UNIT] ResolverAsignacionAutomatica — tabla de ADR-2 (sdd/asignacion-automatica-por-tipo, A1, A2,
 * A4, A5, A7).
 *
 * Mutación documentada: quitar el try/catch alrededor de `esAgente` pone en rojo el caso "master
 * rechaza → null"; envolver `findByTipoId` o la lectura de permisos por tipo en un try/catch pone
 * en rojo los casos "tenant rechaza → el resolver rechaza".
 *
 * Elegibilidad del responsable (odd/permisos-por-tipo-ticket, D5 g): `ElegibilidadAsignado` real
 * sobre dobles en memoria, así que el alta decide con `LECTURA` sobre el tipo de la regla y no con
 * las celdas por módulo de master.
 */
import { TipoTicketEntity } from '../../domain/entities/tipo-ticket.entity';
import { IEstadoRepository } from '../../domain/ports/i-estado.repository';
import {
  IReglaAsignacionRepository,
  ReglaAsignacion,
} from '../../domain/ports/i-regla-asignacion.repository';
import { ITipoOperacionRepository } from '../../domain/ports/i-tipo-operacion.repository';
import { ILogger } from '../../../shared/domain/ports/i-logger.port';
import { MasterAgentesEnMemoria } from '../../test-helpers/master-agentes-en-memoria';
import { PermisosTipoTicketEnMemoria } from '../../test-helpers/permisos-tipo-ticket-en-memoria';
import { ElegibilidadAsignado } from './elegibilidad-asignado';
import { ResolverAsignacionAutomatica } from './resolver-asignacion-automatica.service';

const RESPONSABLE = 'u-responsable';
const CLIENTE = 'cliente-1';

class MasterCaidoError extends Error {}

function tipoActivo(): TipoTicketEntity {
  return TipoTicketEntity.create(
    { codigo: 'TICKETS', nombre: 'Soporte', modulo: 'TICKETS', activo: true },
    'tipo-1',
  );
}

function regla(responsableId = RESPONSABLE): ReglaAsignacion {
  return {
    tipoId: 'tipo-1',
    responsableId,
    actualizadoPor: 'admin',
    createdAt: new Date('2026-10-09'),
    updatedAt: new Date('2026-10-09'),
  };
}

function armar() {
  const findByTipoId = vi.fn().mockResolvedValue(regla());
  // Por defecto el responsable es TECNICO con LECTURA sobre el tipo de la regla.
  const master = new MasterAgentesEnMemoria();
  master.agregar({ id: RESPONSABLE, rol: 'TECNICO', celdas: [], nombre: 'Tina' });
  master.agregar({ id: 'u-admin', rol: 'ADMINISTRADOR', celdas: [] });
  const permisos = new PermisosTipoTicketEnMemoria(
    [],
    [
      { usuarioId: RESPONSABLE, tipoId: 'tipo-1', accion: 'LECTURA' },
      { usuarioId: 'u-admin', tipoId: 'tipo-1', accion: 'LECTURA' },
    ],
  );
  const listarAgentes = vi.spyOn(master, 'listarAgentes');
  const listarPorUsuario = vi.spyOn(permisos, 'listarPorUsuario');
  const estadoFindIdByCodigo = vi.fn().mockResolvedValue('estado-asignado-id');
  const tipoOpFindIdByCodigo = vi.fn().mockResolvedValue('tipo-op-asignacion-id');
  const log = vi.fn();
  const error = vi.fn();
  const resolver = new ResolverAsignacionAutomatica(
    { findByTipoId } satisfies Pick<IReglaAsignacionRepository, 'findByTipoId'>,
    new ElegibilidadAsignado(master, permisos),
    { findIdByCodigo: estadoFindIdByCodigo } satisfies Pick<IEstadoRepository, 'findIdByCodigo'>,
    { findIdByCodigo: tipoOpFindIdByCodigo } satisfies Pick<
      ITipoOperacionRepository,
      'findIdByCodigo'
    >,
    { log, error } satisfies ILogger,
  );
  return {
    resolver,
    findByTipoId,
    master,
    permisos,
    listarAgentes,
    listarPorUsuario,
    estadoFindIdByCodigo,
    tipoOpFindIdByCodigo,
    log,
    error,
  };
}

describe('ResolverAsignacionAutomatica', () => {
  it('tipo dado de baja → null sin consultar nada', async () => {
    const c = armar();
    const tipo = tipoActivo();
    tipo.desactivar();

    await expect(c.resolver.resolver(tipo, CLIENTE)).resolves.toBeNull();
    expect(c.findByTipoId).not.toHaveBeenCalled();
  });

  it('sin fila de regla → null sin tocar el maestro', async () => {
    const c = armar();
    c.findByTipoId.mockResolvedValue(null);

    await expect(c.resolver.resolver(tipoActivo(), CLIENTE)).resolves.toBeNull();
    expect(c.listarAgentes).not.toHaveBeenCalled();
    expect(c.listarPorUsuario).not.toHaveBeenCalled();
  });

  it('findByTipoId rechaza (tenant) → el resolver rechaza, no lo traga', async () => {
    const c = armar();
    c.findByTipoId.mockRejectedValue(new Error('tenant caido'));

    await expect(c.resolver.resolver(tipoActivo(), CLIENTE)).rejects.toThrow('tenant caido');
    expect(c.error).not.toHaveBeenCalled();
  });

  it('la lectura de permisos por tipo rechaza (tenant) → el resolver rechaza, no lo traga', async () => {
    const c = armar();
    c.listarPorUsuario.mockRejectedValue(new Error('tenant caido'));

    await expect(c.resolver.resolver(tipoActivo(), CLIENTE)).rejects.toThrow('tenant caido');
    expect(c.error).not.toHaveBeenCalled();
  });

  it('master rechaza → null y log DEGRADADA solo con la clase del error', async () => {
    const c = armar();
    c.listarAgentes.mockRejectedValue(new MasterCaidoError('password=secreta'));

    await expect(c.resolver.resolver(tipoActivo(), CLIENTE)).resolves.toBeNull();
    expect(c.error).toHaveBeenCalledWith(
      'ASIGNACION_AUTOMATICA_DEGRADADA | tipoId=tipo-1 | error=MasterCaidoError',
    );
    expect(c.error.mock.calls[0][0]).not.toContain('secreta');
  });

  it('responsable ADMINISTRADOR (fuera del universo de agentes) → null y log REGLA_ROTA', async () => {
    const c = armar();
    c.findByTipoId.mockResolvedValue(regla('u-admin'));

    await expect(c.resolver.resolver(tipoActivo(), CLIENTE)).resolves.toBeNull();
    expect(c.log).toHaveBeenCalledWith(
      'ASIGNACION_AUTOMATICA_REGLA_ROTA | tipoId=tipo-1 | responsableId=u-admin',
    );
  });

  it('responsable TECNICO con la celda del módulo pero sin LECTURA sobre el tipo → REGLA_ROTA, sin ir a master', async () => {
    const c = armar();
    c.master.agregar({ id: 'u-celda', rol: 'TECNICO', celdas: ['TICKETS:LECTURA'] });
    await c.permisos.agregarSiFaltan([
      { usuarioId: 'u-celda', tipoId: 'tipo-1', accion: 'MODIFICACION' },
      { usuarioId: 'u-celda', tipoId: 'tipo-otro', accion: 'LECTURA' },
    ]);
    c.findByTipoId.mockResolvedValue(regla('u-celda'));

    await expect(c.resolver.resolver(tipoActivo(), CLIENTE)).resolves.toBeNull();
    expect(c.log).toHaveBeenCalledWith(
      'ASIGNACION_AUTOMATICA_REGLA_ROTA | tipoId=tipo-1 | responsableId=u-celda',
    );
    expect(c.listarAgentes).not.toHaveBeenCalled();
  });

  it('regla válida → asignacion con los ids de catálogo; decide con la LECTURA sobre el tipo', async () => {
    const c = armar();

    await expect(c.resolver.resolver(tipoActivo(), CLIENTE)).resolves.toEqual({
      asignadoId: RESPONSABLE,
      estadoAsignadoId: 'estado-asignado-id',
      tipoOperacionAsignacionId: 'tipo-op-asignacion-id',
    });
    expect(c.listarPorUsuario).toHaveBeenCalledWith(RESPONSABLE);
    expect(c.listarAgentes).toHaveBeenCalledWith(CLIENTE, [RESPONSABLE]);
    expect(c.estadoFindIdByCodigo).toHaveBeenCalledWith('ASIGNADO');
    expect(c.tipoOpFindIdByCodigo).toHaveBeenCalledWith('ASIGNACION');
  });

  it('estado ASIGNADO ausente del catálogo → throw defensivo', async () => {
    const c = armar();
    c.estadoFindIdByCodigo.mockResolvedValue(null);

    await expect(c.resolver.resolver(tipoActivo(), CLIENTE)).rejects.toThrow(/"ASIGNADO"/);
  });

  it('tipo de operación ASIGNACION ausente del catálogo → throw defensivo', async () => {
    const c = armar();
    c.tipoOpFindIdByCodigo.mockResolvedValue(null);

    await expect(c.resolver.resolver(tipoActivo(), CLIENTE)).rejects.toThrow(/"ASIGNACION"/);
  });
});
