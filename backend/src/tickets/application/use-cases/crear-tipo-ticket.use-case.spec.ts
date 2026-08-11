/**
 * T11.1 [UNIT] — RED→GREEN: `CrearTipoTicketUseCase` (T2, PR11 — CRUD
 * catálogos editables). Valida unicidad de `codigo` y ausencia de colisión
 * de prefijo derivado (ADR-4) contra los tipos ACTIVOS del tenant — cierra
 * el riesgo recurrente documentado en PR8/PR9/PR10 (fixtures de e2e
 * colisionando prefijo) para el flujo real de alta de catálogo.
 *
 * Ref spec: sdd/tickets-core/spec T2, T5. Ref design: ADR-4. Tarea: T11.1.
 */
import { CrearTipoTicketUseCase } from './crear-tipo-ticket.use-case';
import { TipoTicketEntity } from '../../domain/entities/tipo-ticket.entity';
import {
  TipoTicketCodigoDuplicadoError,
  PrefijoTipoTicketColisionError,
  TipoTicketDesconocidoError,
  ModuloTipoTicketInvalidoError,
} from '../../domain/errors/tickets.errors';

describe('CrearTipoTicketUseCase', () => {
  function makeCollaborators(existentes: TipoTicketEntity[] = []) {
    const tipoTicketRepo = {
      findByCodigo: vi.fn().mockImplementation(async (codigo: string) => {
        return existentes.find((t) => t.codigo === codigo) ?? null;
      }),
      findAllActive: vi.fn().mockResolvedValue(existentes.filter((t) => !t.isDeleted())),
      save: vi.fn().mockResolvedValue(undefined),
    };
    const useCase = new CrearTipoTicketUseCase(tipoTicketRepo as never);
    return { useCase, tipoTicketRepo };
  }

  it('crea el tipo de ticket y lo persiste cuando codigo y prefijo son únicos', async () => {
    const c = makeCollaborators();

    const result = await c.useCase.execute({
      codigo: 'RRHH',
      nombre: 'Recursos Humanos',
      modulo: 'SOPORTE',
    });

    expect(result.isOk()).toBe(true);
    const tipo = result.getValue();
    expect(tipo.codigo).toBe('RRHH');
    expect(tipo.nombre).toBe('Recursos Humanos');
    expect(tipo.modulo).toBe('SOPORTE');
    expect(tipo.activo).toBe(true);
    expect(c.tipoTicketRepo.save).toHaveBeenCalledWith(tipo);
  });

  it('modulo inválido → ModuloTipoTicketInvalidoError (422), sin tocar el repo', async () => {
    const c = makeCollaborators();

    const result = await c.useCase.execute({
      codigo: 'RRHH',
      nombre: 'Recursos Humanos',
      modulo: 'INVENTADO',
    });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(ModuloTipoTicketInvalidoError);
    expect(c.tipoTicketRepo.findByCodigo).not.toHaveBeenCalled();
    expect(c.tipoTicketRepo.save).not.toHaveBeenCalled();
  });

  it('codigo ya existente (activo o soft-deleted) → TipoTicketCodigoDuplicadoError (422), sin persistir', async () => {
    const existente = TipoTicketEntity.create({
      codigo: 'SOPORTE',
      nombre: 'Soporte',
      modulo: 'SOPORTE',
      activo: true,
    });
    const c = makeCollaborators([existente]);

    const result = await c.useCase.execute({
      codigo: 'SOPORTE',
      nombre: 'Duplicado',
      modulo: 'SOPORTE',
    });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(TipoTicketCodigoDuplicadoError);
    expect(c.tipoTicketRepo.save).not.toHaveBeenCalled();
  });

  it('prefijo derivado colisiona con un tipo ACTIVO existente → PrefijoTipoTicketColisionError (422), sin persistir', async () => {
    // "COMPRAS" deriva COM (mapa base); "COMISION" (custom) también derivaría COM (3 primeras letras).
    const existente = TipoTicketEntity.create({
      codigo: 'COMPRAS',
      nombre: 'Compras',
      modulo: 'COMPRAS',
      activo: true,
    });
    const c = makeCollaborators([existente]);

    const result = await c.useCase.execute({
      codigo: 'COMISION',
      nombre: 'Comisiones',
      modulo: 'SOPORTE',
    });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(PrefijoTipoTicketColisionError);
    expect(c.tipoTicketRepo.save).not.toHaveBeenCalled();
  });

  it('un tipo con el mismo prefijo pero DADO DE BAJA no bloquea la creación (solo compite contra ACTIVOS)', async () => {
    const dadoDeBaja = TipoTicketEntity.create({
      codigo: 'COMPRAS',
      nombre: 'Compras',
      modulo: 'COMPRAS',
      activo: false,
    });
    dadoDeBaja.desactivar();
    const c = makeCollaborators([dadoDeBaja]);
    // findByCodigo solo se llama con el codigo nuevo (distinto), no colisiona ahí.

    const result = await c.useCase.execute({
      codigo: 'COMISION',
      nombre: 'Comisiones',
      modulo: 'SOPORTE',
    });

    expect(result.isOk()).toBe(true);
  });

  it('codigo degenerado (sin caracteres alfanuméricos) → TipoTicketDesconocidoError (422), sin persistir', async () => {
    const c = makeCollaborators();

    const result = await c.useCase.execute({
      codigo: '###',
      nombre: 'Inválido',
      modulo: 'SOPORTE',
    });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(TipoTicketDesconocidoError);
    expect(c.tipoTicketRepo.save).not.toHaveBeenCalled();
  });
});
