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
  ModuloSinAltaDeTipoError,
  TipoOrigenPermisosNoEncontradoError,
  TipoOrigenPermisosDeOtroModuloError,
} from '../../domain/errors/tickets.errors';
import { ITipoTicketRepository } from '../../domain/ports/i-tipo-ticket.repository';
import { PermisoTipoTicketFila } from '../../domain/ports/i-permiso-tipo-ticket.repository';
import { PermisosTipoTicketEnMemoria } from '../../test-helpers/permisos-tipo-ticket-en-memoria';
import { Modulo } from '../../../shared/domain/modulos';

describe('CrearTipoTicketUseCase', () => {
  function makeCollaborators(
    existentes: TipoTicketEntity[] = [],
    filasIniciales: readonly PermisoTipoTicketFila[] = [],
  ) {
    /** Escrituras hechas, marcadas con si corrieron dentro de la transacción. */
    const escrituras: string[] = [];
    let enTransaccion = false;
    const tipoTicketRepo = {
      findByCodigo: vi
        .fn<ITipoTicketRepository['findByCodigo']>()
        .mockImplementation(async (codigo: string) => {
          return existentes.find((t) => t.codigo === codigo) ?? null;
        }),
      findById: vi
        .fn<ITipoTicketRepository['findById']>()
        .mockImplementation(async (id: string) => existentes.find((t) => t.id === id) ?? null),
      findAllActive: vi
        .fn<ITipoTicketRepository['findAllActive']>()
        .mockResolvedValue(existentes.filter((t) => !t.isDeleted())),
      save: vi.fn<ITipoTicketRepository['save']>().mockImplementation(async () => {
        escrituras.push(`save:${enTransaccion ? 'tx' : 'fuera'}`);
      }),
    };
    const permisos = new PermisosTipoTicketEnMemoria(
      existentes.map(({ id, modulo }) => ({ id, modulo })),
      filasIniciales,
    );
    const copiarOriginal = permisos.copiarDeTipo.bind(permisos);
    const copiarDeTipo = vi
      .spyOn(permisos, 'copiarDeTipo')
      .mockImplementation(async (origenId: string, destinoId: string) => {
        escrituras.push(`copia:${enTransaccion ? 'tx' : 'fuera'}`);
        return copiarOriginal(origenId, destinoId);
      });
    const txRunner = {
      run: async <T>(fn: () => Promise<T>): Promise<T> => {
        enTransaccion = true;
        try {
          return await fn();
        } finally {
          enTransaccion = false;
        }
      },
    };
    const useCase = new CrearTipoTicketUseCase(tipoTicketRepo, permisos, txRunner);
    return { useCase, tipoTicketRepo, permisos, copiarDeTipo, escrituras };
  }

  it('crea el tipo de ticket y lo persiste cuando codigo y prefijo son únicos', async () => {
    const c = makeCollaborators();

    const result = await c.useCase.execute({
      codigo: 'RRHH',
      nombre: 'Recursos Humanos',
      modulo: 'TICKETS',
    });

    expect(result.isOk()).toBe(true);
    const tipo = result.getValue();
    expect(tipo.codigo).toBe('RRHH');
    expect(tipo.nombre).toBe('Recursos Humanos');
    expect(tipo.modulo).toBe('TICKETS');
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

  it.each(['COMPRAS', 'EQUIPOS'])(
    'modulo %s, sin alta con tipo elegible → ModuloSinAltaDeTipoError (422), sin tocar el repo (S4)',
    async (modulo) => {
      const c = makeCollaborators();

      const result = await c.useCase.execute({
        codigo: 'RRHH',
        nombre: 'Recursos Humanos',
        modulo,
      });

      expect(result.getError()).toBeInstanceOf(ModuloSinAltaDeTipoError);
      expect(result.getError().message).toBe(
        `Un tipo de ticket del módulo ${modulo} no se podría usar: solo los módulos TICKETS y EDILICIA tienen un alta que permite elegir el tipo.`,
      );
      expect(c.tipoTicketRepo.findByCodigo).not.toHaveBeenCalled();
      expect(c.tipoTicketRepo.save).not.toHaveBeenCalled();
    },
  );

  it('modulo EDILICIA → crea el tipo (S4)', async () => {
    const c = makeCollaborators();

    const result = await c.useCase.execute({
      codigo: 'PINTURA',
      nombre: 'Pintura',
      modulo: 'EDILICIA',
    });

    expect(result.getValue().modulo).toBe('EDILICIA');
    expect(c.tipoTicketRepo.save).toHaveBeenCalled();
  });

  it('codigo ya existente (activo o soft-deleted) → TipoTicketCodigoDuplicadoError (422), sin persistir', async () => {
    const existente = TipoTicketEntity.create({
      codigo: 'SOPORTE',
      nombre: 'Soporte',
      modulo: 'TICKETS',
      activo: true,
    });
    const c = makeCollaborators([existente]);

    const result = await c.useCase.execute({
      codigo: 'SOPORTE',
      nombre: 'Duplicado',
      modulo: 'TICKETS',
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
      modulo: 'TICKETS',
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
      modulo: 'TICKETS',
    });

    expect(result.isOk()).toBe(true);
  });

  it('codigo degenerado (sin caracteres alfanuméricos) → TipoTicketDesconocidoError (422), sin persistir', async () => {
    const c = makeCollaborators();

    const result = await c.useCase.execute({
      codigo: '###',
      nombre: 'Inválido',
      modulo: 'TICKETS',
    });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(TipoTicketDesconocidoError);
    expect(c.tipoTicketRepo.save).not.toHaveBeenCalled();
  });

  describe('permisos del tipo nuevo (odd/tasks/permisos-por-tipo-ticket.md, S4)', () => {
    const USUARIO_1 = '11111111-1111-4111-8111-111111111111';
    const USUARIO_2 = '22222222-2222-4222-8222-222222222222';
    const USUARIO_3 = '33333333-3333-4333-8333-333333333333';

    function tipo(codigo: string, modulo: Modulo): TipoTicketEntity {
      return TipoTicketEntity.create({ codigo, nombre: codigo, modulo, activo: true });
    }

    /** Fixture con filas en dos tipos para tres usuarios: el origen y uno que no se copia. */
    function escenario() {
      const soporte = tipo('SOPORTE', 'TICKETS');
      const redes = tipo('REDES', 'TICKETS');
      const edilicia = tipo('EDILICIA', 'EDILICIA');
      const filas: PermisoTipoTicketFila[] = [
        { usuarioId: USUARIO_1, tipoId: soporte.id, accion: 'LECTURA' },
        { usuarioId: USUARIO_1, tipoId: soporte.id, accion: 'VER_TODOS' },
        { usuarioId: USUARIO_1, tipoId: soporte.id, accion: 'MODIFICACION' },
        { usuarioId: USUARIO_2, tipoId: soporte.id, accion: 'LECTURA' },
        { usuarioId: USUARIO_2, tipoId: soporte.id, accion: 'COMENTAR' },
        // Filas en otro tipo: no se copian.
        { usuarioId: USUARIO_1, tipoId: redes.id, accion: 'ASIGNAR' },
        { usuarioId: USUARIO_3, tipoId: redes.id, accion: 'LECTURA' },
        { usuarioId: USUARIO_3, tipoId: edilicia.id, accion: 'LECTURA' },
      ];
      return { soporte, redes, edilicia, c: makeCollaborators([soporte, redes, edilicia], filas) };
    }

    it('sin tipo de origen, el tipo nace cerrado: nadie tiene filas sobre él', async () => {
      const { c } = escenario();

      const result = await c.useCase.execute({
        codigo: 'ELECT',
        nombre: 'Elec',
        modulo: 'TICKETS',
      });

      const nuevoId = result.getValue().id;
      for (const usuarioId of [USUARIO_1, USUARIO_2, USUARIO_3]) {
        expect(c.permisos.filasDe(usuarioId).filter((f) => f.startsWith(nuevoId))).toEqual([]);
      }
      expect(c.copiarDeTipo).not.toHaveBeenCalled();
    });

    it('con origen null, el tipo también nace cerrado', async () => {
      const { c } = escenario();

      const result = await c.useCase.execute({
        codigo: 'ELECT',
        nombre: 'Elec',
        modulo: 'TICKETS',
        copiarPermisosDeTipoId: null,
      });

      expect(result.isOk()).toBe(true);
      expect(c.copiarDeTipo).not.toHaveBeenCalled();
    });

    it('copiar de un tipo da a cada usuario en el tipo nuevo exactamente las acciones que tiene en el origen', async () => {
      const { c, soporte, redes, edilicia } = escenario();

      const result = await c.useCase.execute({
        codigo: 'ELECT',
        nombre: 'Elec',
        modulo: 'TICKETS',
        copiarPermisosDeTipoId: soporte.id,
      });

      const nuevoId = result.getValue().id;
      expect(c.permisos.filasDe(USUARIO_1)).toEqual(
        [
          `${soporte.id}:LECTURA`,
          `${soporte.id}:MODIFICACION`,
          `${soporte.id}:VER_TODOS`,
          `${redes.id}:ASIGNAR`,
          `${nuevoId}:LECTURA`,
          `${nuevoId}:MODIFICACION`,
          `${nuevoId}:VER_TODOS`,
        ].sort(),
      );
      expect(c.permisos.filasDe(USUARIO_2)).toEqual(
        [
          `${soporte.id}:COMENTAR`,
          `${soporte.id}:LECTURA`,
          `${nuevoId}:COMENTAR`,
          `${nuevoId}:LECTURA`,
        ].sort(),
      );
      // Sin filas en el origen: sigue sin acceso al tipo nuevo.
      expect(c.permisos.filasDe(USUARIO_3)).toEqual(
        [`${redes.id}:LECTURA`, `${edilicia.id}:LECTURA`].sort(),
      );
    });

    it('W2: no propaga al tipo nuevo las filas de quien no tiene Ver en el origen (S3); Borrar sí (S8)', async () => {
      const soporte = tipo('SOPORTE', 'TICKETS');
      const c = makeCollaborators(
        [soporte],
        [
          { usuarioId: USUARIO_1, tipoId: soporte.id, accion: 'LECTURA' },
          { usuarioId: USUARIO_1, tipoId: soporte.id, accion: 'BORRADO' },
          // Fila sin Ver, como las que puede dejar el backfill (L34).
          { usuarioId: USUARIO_2, tipoId: soporte.id, accion: 'COMENTAR' },
        ],
      );

      const result = await c.useCase.execute({
        codigo: 'ELECT',
        nombre: 'Elec',
        modulo: 'TICKETS',
        copiarPermisosDeTipoId: soporte.id,
      });

      const nuevoId = result.getValue().id;
      expect(c.permisos.filasDe(USUARIO_1).filter((f) => f.startsWith(nuevoId))).toEqual(
        [`${nuevoId}:BORRADO`, `${nuevoId}:LECTURA`].sort(),
      );
      expect(c.permisos.filasDe(USUARIO_2)).toEqual([`${soporte.id}:COMENTAR`]);
    });

    it('el alta del tipo y la copia corren dentro de la misma transacción', async () => {
      const { c, soporte } = escenario();

      await c.useCase.execute({
        codigo: 'ELECT',
        nombre: 'Elec',
        modulo: 'TICKETS',
        copiarPermisosDeTipoId: soporte.id,
      });

      expect(c.escrituras).toEqual(['save:tx', 'copia:tx']);
    });

    it('si la copia falla, el error se propaga desde la transacción (el runner revierte el alta)', async () => {
      const { c, soporte } = escenario();
      c.copiarDeTipo.mockRejectedValueOnce(new Error('fallo de la copia'));

      await expect(
        c.useCase.execute({
          codigo: 'ELECT',
          nombre: 'Elec',
          modulo: 'TICKETS',
          copiarPermisosDeTipoId: soporte.id,
        }),
      ).rejects.toThrow('fallo de la copia');
      // El alta ocurrió dentro del run() que propagó el error: el runner real la revierte
      // (prueba con Postgres en crear-tipo-ticket.integration.spec.ts).
      expect(c.escrituras).toEqual(['save:tx']);
      expect(c.copiarDeTipo).toHaveBeenCalledTimes(1);
    });

    it('un tipo de origen inexistente → TipoOrigenPermisosNoEncontradoError (422), sin crear el tipo ni copiar', async () => {
      const { c } = escenario();
      const inexistente = '99999999-9999-4999-8999-999999999999';

      const result = await c.useCase.execute({
        codigo: 'ELECT',
        nombre: 'Elec',
        modulo: 'TICKETS',
        copiarPermisosDeTipoId: inexistente,
      });

      expect(result.getError()).toBeInstanceOf(TipoOrigenPermisosNoEncontradoError);
      expect(result.getError().message).toBe(
        `No existe el tipo de ticket "${inexistente}" del que se pidieron copiar los permisos.`,
      );
      expect(c.tipoTicketRepo.save).not.toHaveBeenCalled();
      expect(c.copiarDeTipo).not.toHaveBeenCalled();
    });

    it('un tipo de origen de otro módulo → TipoOrigenPermisosDeOtroModuloError (422), sin crear el tipo ni copiar', async () => {
      const { c, edilicia } = escenario();

      const result = await c.useCase.execute({
        codigo: 'ELECT',
        nombre: 'Elec',
        modulo: 'TICKETS',
        copiarPermisosDeTipoId: edilicia.id,
      });

      expect(result.getError()).toBeInstanceOf(TipoOrigenPermisosDeOtroModuloError);
      expect(result.getError().message).toBe(
        'Los permisos solo se copian de un tipo del mismo módulo: el tipo elegido es de EDILICIA y el nuevo es de TICKETS.',
      );
      expect(c.tipoTicketRepo.save).not.toHaveBeenCalled();
      expect(c.copiarDeTipo).not.toHaveBeenCalled();
      expect(c.permisos.filasDe(USUARIO_3)).toHaveLength(2);
    });
  });
});
