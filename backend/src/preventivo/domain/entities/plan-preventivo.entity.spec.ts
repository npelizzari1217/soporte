/**
 * 3.1/3.2 [UNIT] — RED→GREEN: PlanPreventivoEntity (objetivo excluyente +
 * cadencia válida). El dominio es la AUTORIDAD de estas invariantes; el
 * CHECK de Postgres (`planes_preventivo_objetivo_check`,
 * `..._intervalo_valor_check`, `..._intervalo_unidad_check`) es backstop
 * (WU-2, ver `preventivo-schema.integration.spec.ts`).
 *
 * Ref spec: sdd/preventivo/spec, Requirements "Objetivo excluyente del
 * plan" y "Recurrencia por tiempo, anclada a fecha inmutable". Ref design:
 * ADR-PV1. Tarea: 3.1/3.2.
 */
import {
  PlanPreventivoEntity,
  PlanPreventivoCreateProps,
  TITULO_MAX_LENGTH,
  UBICACION_MAX_LENGTH,
  INTERVALO_VALOR_MAXIMO,
} from './plan-preventivo.entity';
import {
  IntervaloExcedeMaximoError,
  IntervaloInvalidoError,
  ObjetivoInvalidoError,
  TituloDemasiadoLargoError,
  UbicacionDemasiadoLargaError,
  UnidadIntervaloInvalidaError,
} from '../errors/preventivo.errors';

function propsConEquipo(
  overrides: Partial<PlanPreventivoCreateProps> = {},
): PlanPreventivoCreateProps {
  return {
    titulo: 'Limpieza de filtros A/A',
    instrucciones: 'Revisar y limpiar filtros de aire acondicionado.',
    equipoId: 'equipo-uuid-1',
    ubicacion: null,
    prioridadId: 'prioridad-uuid-1',
    responsableId: 'usuario-uuid-1',
    intervaloValor: 3,
    intervaloUnidad: 'MESES',
    fechaInicio: new Date('2026-01-01T00:00:00.000Z'),
    proximaEjecucionEn: new Date('2026-04-01T00:00:00.000Z'),
    activo: true,
    ...overrides,
  };
}

describe('PlanPreventivoEntity', () => {
  describe('create()', () => {
    it('crea un plan válido con objetivo equipo', () => {
      const result = PlanPreventivoEntity.create(propsConEquipo());

      expect(result.isOk()).toBe(true);
      const plan = result.getValue();
      expect(plan.equipoId).toBe('equipo-uuid-1');
      expect(plan.ubicacion).toBeNull();
      expect(plan.id).toMatch(/^[0-9a-f-]{36}$/);
    });

    it('crea un plan válido con objetivo ubicación y normaliza a mayúscula', () => {
      const result = PlanPreventivoEntity.create(
        propsConEquipo({ equipoId: null, ubicacion: '  sala de servidores  ' }),
      );

      expect(result.isOk()).toBe(true);
      const plan = result.getValue();
      expect(plan.equipoId).toBeNull();
      expect(plan.ubicacion).toBe('SALA DE SERVIDORES');
    });

    it('rechaza con ObjetivoInvalidoError cuando vienen equipo Y ubicación', () => {
      const result = PlanPreventivoEntity.create(
        propsConEquipo({ equipoId: 'equipo-uuid-1', ubicacion: 'DEPOSITO' }),
      );

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(ObjetivoInvalidoError);
      expect(result.getError().message).toMatch(/equipo Y a una ubicación/);
    });

    it('rechaza con ObjetivoInvalidoError cuando no viene ni equipo ni ubicación', () => {
      const result = PlanPreventivoEntity.create(
        propsConEquipo({ equipoId: null, ubicacion: null }),
      );

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(ObjetivoInvalidoError);
      expect(result.getError().message).toMatch(/no se proveyó ninguno/);
    });

    it('rechaza con ObjetivoInvalidoError cuando ubicación es solo espacios (queda vacía tras normalizar)', () => {
      const result = PlanPreventivoEntity.create(
        propsConEquipo({ equipoId: null, ubicacion: '   ' }),
      );

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(ObjetivoInvalidoError);
    });

    it('rechaza con IntervaloInvalidoError cuando intervaloValor es 0', () => {
      const result = PlanPreventivoEntity.create(propsConEquipo({ intervaloValor: 0 }));

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(IntervaloInvalidoError);
    });

    it('rechaza con IntervaloInvalidoError cuando intervaloValor es negativo', () => {
      const result = PlanPreventivoEntity.create(propsConEquipo({ intervaloValor: -2 }));

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(IntervaloInvalidoError);
    });

    it('rechaza con IntervaloInvalidoError cuando intervaloValor no es entero', () => {
      const result = PlanPreventivoEntity.create(propsConEquipo({ intervaloValor: 1.5 }));

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(IntervaloInvalidoError);
    });

    it('rechaza con UnidadIntervaloInvalidaError cuando la unidad no está en el catálogo', () => {
      const result = PlanPreventivoEntity.create(
        propsConEquipo({
          intervaloUnidad: 'SEMANAS' as PlanPreventivoCreateProps['intervaloUnidad'],
        }),
      );

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(UnidadIntervaloInvalidaError);
    });

    it('rechaza con TituloDemasiadoLargoError cuando el título excede 255 caracteres', () => {
      const result = PlanPreventivoEntity.create(
        propsConEquipo({ titulo: 'A'.repeat(TITULO_MAX_LENGTH + 1) }),
      );

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(TituloDemasiadoLargoError);
      expect(result.getError().message).toMatch(/255 caracteres/);
    });

    it('acepta un título de exactamente 255 caracteres (límite inclusive)', () => {
      const result = PlanPreventivoEntity.create(
        propsConEquipo({ titulo: 'A'.repeat(TITULO_MAX_LENGTH) }),
      );

      expect(result.isOk()).toBe(true);
    });

    it('rechaza con UbicacionDemasiadoLargaError cuando la ubicación excede 255 caracteres', () => {
      const result = PlanPreventivoEntity.create(
        propsConEquipo({
          equipoId: null,
          ubicacion: 'B'.repeat(UBICACION_MAX_LENGTH + 1),
        }),
      );

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(UbicacionDemasiadoLargaError);
      expect(result.getError().message).toMatch(/255 caracteres/);
    });

    it('rechaza con IntervaloExcedeMaximoError cuando intervaloValor supera el techo de negocio', () => {
      const result = PlanPreventivoEntity.create(
        propsConEquipo({ intervaloValor: INTERVALO_VALOR_MAXIMO + 1 }),
      );

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(IntervaloExcedeMaximoError);
    });

    it('acepta intervaloValor exactamente en el techo de negocio (límite inclusive)', () => {
      const result = PlanPreventivoEntity.create(
        propsConEquipo({ intervaloValor: INTERVALO_VALOR_MAXIMO }),
      );

      expect(result.isOk()).toBe(true);
    });

    it('rechaza con IntervaloExcedeMaximoError un valor patológico que desbordaría int4 (3_000_000_000)', () => {
      const result = PlanPreventivoEntity.create(propsConEquipo({ intervaloValor: 3_000_000_000 }));

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(IntervaloExcedeMaximoError);
    });
  });

  describe('reconstitute()', () => {
    it('reconstruye una entidad desde persistencia sin re-validar', () => {
      const createdAt = new Date('2026-01-01T00:00:00Z');
      const updatedAt = new Date('2026-01-01T00:00:00Z');

      const plan = PlanPreventivoEntity.reconstitute(
        propsConEquipo(),
        'db-uuid-plan',
        createdAt,
        updatedAt,
        null,
      );

      expect(plan.id).toBe('db-uuid-plan');
      expect(plan.createdAt).toEqual(createdAt);
      expect(plan.deletedAt).toBeNull();
    });
  });

  describe('editar()', () => {
    it('edita campos provistos y deja intactos los no provistos (PATCH semántico)', () => {
      const plan = PlanPreventivoEntity.create(propsConEquipo()).getValue();

      const result = plan.editar({ titulo: 'Nuevo título', intervaloValor: 6 });

      expect(result.isOk()).toBe(true);
      expect(plan.titulo).toBe('Nuevo título');
      expect(plan.intervaloValor).toBe(6);
      expect(plan.equipoId).toBe('equipo-uuid-1');
    });

    it('permite cambiar el objetivo de equipo a ubicación en una sola edición', () => {
      const plan = PlanPreventivoEntity.create(propsConEquipo()).getValue();

      const result = plan.editar({ equipoId: null, ubicacion: 'planta baja' });

      expect(result.isOk()).toBe(true);
      expect(plan.equipoId).toBeNull();
      expect(plan.ubicacion).toBe('PLANTA BAJA');
    });

    it('rechaza con ObjetivoInvalidoError si la edición deja ambos objetivos seteados, y NO muta', () => {
      const plan = PlanPreventivoEntity.create(propsConEquipo()).getValue();

      const result = plan.editar({ ubicacion: 'DEPOSITO' });

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(ObjetivoInvalidoError);
      expect(plan.ubicacion).toBeNull();
      expect(plan.equipoId).toBe('equipo-uuid-1');
    });

    it('rechaza con IntervaloInvalidoError si la edición deja intervaloValor <= 0, y NO muta', () => {
      const plan = PlanPreventivoEntity.create(propsConEquipo()).getValue();

      const result = plan.editar({ intervaloValor: -1 });

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(IntervaloInvalidoError);
      expect(plan.intervaloValor).toBe(3);
    });

    it('rechaza con TituloDemasiadoLargoError si la edición deja el título en más de 255 caracteres, y NO muta', () => {
      const plan = PlanPreventivoEntity.create(propsConEquipo()).getValue();

      const result = plan.editar({ titulo: 'A'.repeat(TITULO_MAX_LENGTH + 1) });

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(TituloDemasiadoLargoError);
      expect(plan.titulo).toBe('Limpieza de filtros A/A');
    });

    it('rechaza con UbicacionDemasiadoLargaError si la edición deja la ubicación en más de 255 caracteres, y NO muta', () => {
      const plan = PlanPreventivoEntity.create(propsConEquipo()).getValue();

      const result = plan.editar({
        equipoId: null,
        ubicacion: 'B'.repeat(UBICACION_MAX_LENGTH + 1),
      });

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(UbicacionDemasiadoLargaError);
      expect(plan.equipoId).toBe('equipo-uuid-1');
      expect(plan.ubicacion).toBeNull();
    });

    it('rechaza con IntervaloExcedeMaximoError si la edición deja intervaloValor sobre el techo de negocio, y NO muta', () => {
      const plan = PlanPreventivoEntity.create(propsConEquipo()).getValue();

      const result = plan.editar({ intervaloValor: INTERVALO_VALOR_MAXIMO + 1 });

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(IntervaloExcedeMaximoError);
      expect(plan.intervaloValor).toBe(3);
    });
  });
});
