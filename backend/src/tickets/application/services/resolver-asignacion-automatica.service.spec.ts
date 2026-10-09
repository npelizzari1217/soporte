/**
 * [UNIT] ResolverAsignacionAutomatica — tabla de ADR-2 (sdd/asignacion-automatica-por-tipo, A1, A2,
 * A4, A5, A7).
 *
 * Mutación documentada: quitar el try/catch alrededor de `listarTecnicosAsignables` pone en rojo el
 * caso "master rechaza → null"; envolver `findByTipoId` en un try/catch pone en rojo el caso
 * "tenant rechaza → el resolver rechaza".
 */
import { TipoTicketEntity } from '../../domain/entities/tipo-ticket.entity';
import { IEstadoRepository } from '../../domain/ports/i-estado.repository';
import {
  IReglaAsignacionRepository,
  ReglaAsignacion,
} from '../../domain/ports/i-regla-asignacion.repository';
import { ITipoOperacionRepository } from '../../domain/ports/i-tipo-operacion.repository';
import { IUsuarioMasterChecker } from '../../domain/ports/i-usuario-master.checker';
import { ILogger } from '../../../shared/domain/ports/i-logger.port';
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
  const listarTecnicosAsignables = vi
    .fn()
    .mockResolvedValue([{ id: RESPONSABLE, nombre: 'Tina', apellido: 'Tecnica' }]);
  const estadoFindIdByCodigo = vi.fn().mockResolvedValue('estado-asignado-id');
  const tipoOpFindIdByCodigo = vi.fn().mockResolvedValue('tipo-op-asignacion-id');
  const log = vi.fn();
  const error = vi.fn();
  const resolver = new ResolverAsignacionAutomatica(
    { findByTipoId } satisfies Pick<IReglaAsignacionRepository, 'findByTipoId'>,
    { listarTecnicosAsignables } satisfies Pick<IUsuarioMasterChecker, 'listarTecnicosAsignables'>,
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
    listarTecnicosAsignables,
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
    expect(c.listarTecnicosAsignables).not.toHaveBeenCalled();
  });

  it('findByTipoId rechaza (tenant) → el resolver rechaza, no lo traga', async () => {
    const c = armar();
    c.findByTipoId.mockRejectedValue(new Error('tenant caido'));

    await expect(c.resolver.resolver(tipoActivo(), CLIENTE)).rejects.toThrow('tenant caido');
    expect(c.error).not.toHaveBeenCalled();
  });

  it('listarTecnicosAsignables rechaza (master) → null y log DEGRADADA solo con la clase del error', async () => {
    const c = armar();
    c.listarTecnicosAsignables.mockRejectedValue(new MasterCaidoError('password=secreta'));

    await expect(c.resolver.resolver(tipoActivo(), CLIENTE)).resolves.toBeNull();
    expect(c.error).toHaveBeenCalledWith(
      'ASIGNACION_AUTOMATICA_DEGRADADA | tipoId=tipo-1 | error=MasterCaidoError',
    );
    expect(c.error.mock.calls[0][0]).not.toContain('secreta');
  });

  it('responsable fuera del universo → null y log REGLA_ROTA', async () => {
    const c = armar();
    c.findByTipoId.mockResolvedValue(regla('u-admin'));

    await expect(c.resolver.resolver(tipoActivo(), CLIENTE)).resolves.toBeNull();
    expect(c.log).toHaveBeenCalledWith(
      'ASIGNACION_AUTOMATICA_REGLA_ROTA | tipoId=tipo-1 | responsableId=u-admin',
    );
  });

  it('regla válida → asignacion con los ids de catálogo; consulta el universo del módulo del tipo', async () => {
    const c = armar();

    await expect(c.resolver.resolver(tipoActivo(), CLIENTE)).resolves.toEqual({
      asignadoId: RESPONSABLE,
      estadoAsignadoId: 'estado-asignado-id',
      tipoOperacionAsignacionId: 'tipo-op-asignacion-id',
    });
    expect(c.listarTecnicosAsignables).toHaveBeenCalledWith(CLIENTE, 'TICKETS');
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
