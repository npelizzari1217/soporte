/**
 * Una regla VALIDA nunca falla en silencio en el alta (odd/permisos-por-tipo-ticket, D5 g): la
 * pantalla de reglas (listar y configurar) y la asignación automática del alta
 * (`ResolverAsignacionAutomatica`) deciden con la MISMA `ElegibilidadAsignado` sobre las mismas
 * filas. Para cada responsable posible, VALIDA ⇔ el PUT lo acepta ⇔ el alta lo asigna; ROTA ⇔ el
 * PUT responde 422 ⇔ el alta no asigna y lo deja en el log.
 */
import { ElegibilidadAsignado } from '../../../tickets/application/services/elegibilidad-asignado';
import { ResolverAsignacionAutomatica } from '../../../tickets/application/services/resolver-asignacion-automatica.service';
import { TipoTicketEntity } from '../../../tickets/domain/entities/tipo-ticket.entity';
import { ReglaAsignacion } from '../../../tickets/domain/ports/i-regla-asignacion.repository';
import { MasterAgentesEnMemoria } from '../../../tickets/test-helpers/master-agentes-en-memoria';
import { PermisosTipoTicketEnMemoria } from '../../../tickets/test-helpers/permisos-tipo-ticket-en-memoria';
import { ConfigurarReglaAsignacionUseCase } from './configurar-regla-asignacion.use-case';
import { ListarReglasAsignacionUseCase } from './listar-reglas-asignacion.use-case';

const CLIENTE = 'cliente-1';
const SOPORTE = TipoTicketEntity.create(
  { codigo: 'SOPORTE', nombre: 'Soporte', modulo: 'TICKETS', activo: true },
  'tipo-soporte',
);

/** Responsables posibles y lo que se espera de cada uno sobre el tipo Soporte. */
const CASOS: { responsableId: string; valida: boolean }[] = [
  { responsableId: 'u-tecnico', valida: true },
  { responsableId: 'u-colaborador', valida: true },
  { responsableId: 'u-celda-sin-fila', valida: false },
  { responsableId: 'u-otro-tipo', valida: false },
  { responsableId: 'u-modificacion-sin-lectura', valida: false },
  { responsableId: 'u-admin', valida: false },
  { responsableId: 'u-usuario', valida: false },
  { responsableId: 'u-inexistente', valida: false },
];

function armar() {
  const master = new MasterAgentesEnMemoria();
  master.agregar({ id: 'u-tecnico', rol: 'TECNICO', celdas: [] });
  master.agregar({ id: 'u-colaborador', rol: 'COLABORADOR', celdas: [] });
  master.agregar({ id: 'u-celda-sin-fila', rol: 'TECNICO', celdas: ['TICKETS:LECTURA'] });
  master.agregar({ id: 'u-otro-tipo', rol: 'TECNICO', celdas: [] });
  master.agregar({ id: 'u-modificacion-sin-lectura', rol: 'TECNICO', celdas: [] });
  master.agregar({ id: 'u-admin', rol: 'ADMINISTRADOR', celdas: [] });
  master.agregar({ id: 'u-usuario', rol: 'USUARIO', celdas: [] });
  const permisos = new PermisosTipoTicketEnMemoria(
    [],
    [
      { usuarioId: 'u-tecnico', tipoId: SOPORTE.id, accion: 'LECTURA' },
      { usuarioId: 'u-colaborador', tipoId: SOPORTE.id, accion: 'LECTURA' },
      { usuarioId: 'u-otro-tipo', tipoId: 'tipo-mantenimiento', accion: 'LECTURA' },
      { usuarioId: 'u-modificacion-sin-lectura', tipoId: SOPORTE.id, accion: 'MODIFICACION' },
      { usuarioId: 'u-admin', tipoId: SOPORTE.id, accion: 'LECTURA' },
      { usuarioId: 'u-usuario', tipoId: SOPORTE.id, accion: 'LECTURA' },
    ],
  );
  const elegibilidad = new ElegibilidadAsignado(master, permisos);

  let reglaActual: ReglaAsignacion | null = null;
  const reglaRepo = {
    findByTipoId: (): Promise<ReglaAsignacion | null> => Promise.resolve(reglaActual),
    listar: (): Promise<ReglaAsignacion[]> => Promise.resolve(reglaActual ? [reglaActual] : []),
    fijar: vi.fn().mockResolvedValue(undefined),
    quitar: vi.fn().mockResolvedValue(undefined),
  };
  const fijarRegla = (responsableId: string): void => {
    const fecha = new Date('2026-10-21');
    reglaActual = {
      tipoId: SOPORTE.id,
      responsableId,
      actualizadoPor: 'admin',
      createdAt: fecha,
      updatedAt: fecha,
    };
  };

  const log = vi.fn();
  const listar = new ListarReglasAsignacionUseCase(
    { findAllActive: vi.fn().mockResolvedValue([SOPORTE]) },
    reglaRepo,
    elegibilidad,
    { resolverNombres: vi.fn().mockResolvedValue(new Map()) },
  );
  const configurar = new ConfigurarReglaAsignacionUseCase(
    { findById: vi.fn().mockResolvedValue(SOPORTE) },
    reglaRepo,
    elegibilidad,
  );
  const resolver = new ResolverAsignacionAutomatica(
    reglaRepo,
    elegibilidad,
    { findIdByCodigo: vi.fn().mockResolvedValue('estado-asignado') },
    { findIdByCodigo: vi.fn().mockResolvedValue('tipo-op-asignacion') },
    { log, error: vi.fn() },
  );
  return { listar, configurar, resolver, fijarRegla, log };
}

describe('regla de asignación: la pantalla y el alta deciden igual', () => {
  it.each(CASOS)(
    '$responsableId: VALIDA=$valida en la pantalla, el PUT y el alta',
    async (caso) => {
      const { listar, configurar, resolver, fijarRegla, log } = armar();
      fijarRegla(caso.responsableId);

      const { reglas } = await listar.execute(CLIENTE);
      const put = await configurar.execute({
        tipoId: SOPORTE.id,
        responsableId: caso.responsableId,
        clienteId: CLIENTE,
        actorId: 'admin',
      });
      const asignacion = await resolver.resolver(SOPORTE, CLIENTE);

      expect(reglas[0].estado).toBe(caso.valida ? 'VALIDA' : 'ROTA');
      expect(put.isOk()).toBe(caso.valida);
      if (caso.valida) {
        expect(asignacion).toMatchObject({ asignadoId: caso.responsableId });
        expect(log).not.toHaveBeenCalled();
      } else {
        expect(asignacion).toBeNull();
        expect(log).toHaveBeenCalledWith(
          `ASIGNACION_AUTOMATICA_REGLA_ROTA | tipoId=${SOPORTE.id} | responsableId=${caso.responsableId}`,
        );
      }
    },
  );
});
