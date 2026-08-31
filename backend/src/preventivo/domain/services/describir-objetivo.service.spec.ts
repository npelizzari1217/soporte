/**
 * describir-objetivo.service.spec.ts — WU-2 (2.1), RED→GREEN: las siete
 * ramas de `describirObjetivo` (ADR-1) más `componerDescripcionTicket`.
 * Función pura, sin mocks: un caso por rama, más un test que asegura que
 * los siete resultados son mutuamente distintos.
 *
 * Ref spec: sdd/preventivo-edicion-y-permisos/specs/preventivo-objetivo-en-ticket/spec
 * Requirements "La descripción del ticket antepone el objetivo del plan" y
 * "Objetivo irresoluble degrada el texto sin fallar la generación".
 * Ref design: ADR-1. Tarea: 2.1.
 */
import {
  describirObjetivo,
  componerDescripcionTicket,
  ObjetivoResuelto,
} from './describir-objetivo.service';

describe('describirObjetivo (ADR-1: siete ramas, ninguna colapsada)', () => {
  it('UBICACION → "Ubicación: <TEXTO>"', () => {
    expect(describirObjetivo({ tipo: 'UBICACION', texto: 'SALA DE SERVIDORES' })).toBe(
      'Ubicación: SALA DE SERVIDORES',
    );
  });

  it('EQUIPO_VIGENTE → "Equipo: <nombre>"', () => {
    expect(describirObjetivo({ tipo: 'EQUIPO_VIGENTE', nombre: 'Notebook Dell 5420' })).toBe(
      'Equipo: Notebook Dell 5420',
    );
  });

  it('EQUIPO_DADO_DE_BAJA → "Equipo: <nombre> (dado de baja)"', () => {
    expect(describirObjetivo({ tipo: 'EQUIPO_DADO_DE_BAJA', nombre: 'Notebook Dell 5420' })).toBe(
      'Equipo: Notebook Dell 5420 (dado de baja)',
    );
  });

  it('EQUIPO_ELIMINADO → "Equipo: <nombre> (eliminado del inventario)"', () => {
    expect(describirObjetivo({ tipo: 'EQUIPO_ELIMINADO', nombre: 'Notebook Dell 5420' })).toBe(
      'Equipo: Notebook Dell 5420 (eliminado del inventario)',
    );
  });

  it('EQUIPO_INEXISTENTE → "Equipo: no encontrado (id <equipoId>)"', () => {
    expect(describirObjetivo({ tipo: 'EQUIPO_INEXISTENTE', equipoId: 'equipo-uuid' })).toBe(
      'Equipo: no encontrado (id equipo-uuid)',
    );
  });

  it('EQUIPO_NO_CONSULTABLE → "Equipo: no se pudo consultar (id <equipoId>)"', () => {
    expect(describirObjetivo({ tipo: 'EQUIPO_NO_CONSULTABLE', equipoId: 'equipo-uuid' })).toBe(
      'Equipo: no se pudo consultar (id equipo-uuid)',
    );
  });

  it('SIN_OBJETIVO → null (fila histórica sin equipo ni ubicación)', () => {
    expect(describirObjetivo({ tipo: 'SIN_OBJETIVO' })).toBeNull();
  });

  it('las siete ramas producen resultados mutuamente distintos, con el MISMO texto base', () => {
    const base = 'Recurso';
    const casos: ObjetivoResuelto[] = [
      { tipo: 'UBICACION', texto: base },
      { tipo: 'EQUIPO_VIGENTE', nombre: base },
      { tipo: 'EQUIPO_DADO_DE_BAJA', nombre: base },
      { tipo: 'EQUIPO_ELIMINADO', nombre: base },
      { tipo: 'EQUIPO_INEXISTENTE', equipoId: base },
      { tipo: 'EQUIPO_NO_CONSULTABLE', equipoId: base },
      { tipo: 'SIN_OBJETIVO' },
    ];

    const resultados = casos.map((caso) => describirObjetivo(caso));

    expect(resultados).toHaveLength(7);
    expect(new Set(resultados).size).toBe(7);
  });
});

describe('componerDescripcionTicket', () => {
  it('antepone la línea de objetivo, una línea en blanco y luego las instrucciones', () => {
    const objetivo: ObjetivoResuelto = { tipo: 'EQUIPO_VIGENTE', nombre: 'Notebook Dell 5420' };

    expect(componerDescripcionTicket(objetivo, 'Limpiar ventiladores')).toBe(
      'Equipo: Notebook Dell 5420\n\nLimpiar ventiladores',
    );
  });

  it('SIN_OBJETIVO devuelve las instrucciones solas, sin línea en blanco colgada', () => {
    expect(componerDescripcionTicket({ tipo: 'SIN_OBJETIVO' }, 'Revisar UPS')).toBe('Revisar UPS');
  });

  it('instrucciones = null no deja línea en blanco colgada', () => {
    const objetivo: ObjetivoResuelto = { tipo: 'UBICACION', texto: 'SALA DE SERVIDORES' };

    expect(componerDescripcionTicket(objetivo, null)).toBe('Ubicación: SALA DE SERVIDORES');
  });

  // El DTO declara `instrucciones` con @IsOptional() @IsString() y SIN
  // @IsNotEmpty(): la cadena vacía llega hasta acá. Tratarla distinto de
  // `null` deja la línea en blanco colgada que OT-R1 prohíbe.
  it('instrucciones = cadena vacía no deja línea en blanco colgada', () => {
    const objetivo: ObjetivoResuelto = { tipo: 'EQUIPO_VIGENTE', nombre: 'Notebook Dell 5420' };

    expect(componerDescripcionTicket(objetivo, '')).toBe('Equipo: Notebook Dell 5420');
  });

  it('instrucciones en blanco (espacios y saltos) tampoco dejan línea colgada', () => {
    const objetivo: ObjetivoResuelto = { tipo: 'EQUIPO_VIGENTE', nombre: 'Notebook Dell 5420' };

    expect(componerDescripcionTicket(objetivo, '   \n  ')).toBe('Equipo: Notebook Dell 5420');
  });

  // Hermano invertido: lo que SÍ tiene contenido se compone igual que siempre,
  // y viaja tal cual, sin recortarle los espacios al texto real.
  it('instrucciones con contenido real se anteponen igual, sin recortar el texto', () => {
    const objetivo: ObjetivoResuelto = { tipo: 'EQUIPO_VIGENTE', nombre: 'Notebook Dell 5420' };

    expect(componerDescripcionTicket(objetivo, '  Limpiar ventiladores  ')).toBe(
      'Equipo: Notebook Dell 5420\n\n  Limpiar ventiladores  ',
    );
  });

  it('SIN_OBJETIVO con instrucciones vacías devuelve la cadena vacía', () => {
    expect(componerDescripcionTicket({ tipo: 'SIN_OBJETIVO' }, '')).toBe('');
  });
});
