import { describe, it, expect } from 'vitest';
import {
  CATEGORIAS_BAJA_EQUIPO,
  CrearEquipoInformaticoProps,
  DESTINOS_BAJA_EQUIPO,
  ETIQUETAS_CATEGORIA_BAJA,
  EquipoInformaticoEntity,
  componerLeyendaBaja,
  largoMaximoTextoBaja,
  normalizarUbicacion,
} from './equipo-informatico.entity';
import { DomainError } from '../../../shared/domain/result';

/**
 * T10.1 [U][RED] — EquipoInformaticoEntity: `darDeBaja()` (activo=false)
 * distinto de `softDelete()` (deletedAt); `actualizar()`. La asignación a
 * personas se eliminó del dominio Equipos — vive solo en `Ticket`.
 *
 * Ref spec: sdd/flujos-especializados/spec F3-Q1. Ref design: ADR-9.
 */
/** Props base válidas, sin nada opcional seteado — usada por los tests de límites. */
function baseProps(): CrearEquipoInformaticoProps {
  return {
    nombre: 'Notebook',
    numeroSerie: null,
    marca: null,
    modelo: null,
    fechaAdquisicion: null,
    ubicacion: null,
    importe: null,
    fechaValoracion: null,
    observaciones: null,
    valorResidual: null,
    fechaValorResidual: null,
  };
}

describe('EquipoInformaticoEntity', () => {
  function makeEquipo() {
    return EquipoInformaticoEntity.create({
      nombre: 'Notebook Dell 5420',
      numeroSerie: 'SN-001',
      marca: 'Dell',
      modelo: 'Latitude 5420',
      fechaAdquisicion: new Date('2025-01-01'),
      ubicacion: null,
      importe: null,
      fechaValoracion: null,
      observaciones: null,
      valorResidual: null,
      fechaValorResidual: null,
    });
  }

  it('create() inicializa activo=true y deletedAt=null', () => {
    const equipo = makeEquipo();
    expect(equipo.activo).toBe(true);
    expect(equipo.isDeleted()).toBe(false);
    expect(equipo.nombre).toBe('Notebook Dell 5420');
    expect(equipo.numeroSerie).toBe('SN-001');
  });

  it('darDeBaja() setea activo=false y guarda los cinco datos SIN tocar deletedAt', () => {
    const equipo = makeEquipo();
    const fecha = new Date('2026-10-01T12:00:00Z');
    equipo.darDeBaja({
      destino: 'STOCK_USADO',
      categoria: 'ROTURA',
      motivo: '  no enciende  ',
      usuarioId: 'u1',
      fecha,
    });
    expect(equipo.activo).toBe(false);
    expect(equipo.isDeleted()).toBe(false);
    expect(equipo.bajaDestino).toBe('STOCK_USADO');
    expect(equipo.bajaCategoria).toBe('ROTURA');
    expect(equipo.bajaMotivo).toBe('no enciende');
    expect(equipo.bajaFecha).toBe(fecha);
    expect(equipo.bajaUsuarioId).toBe('u1');
  });

  it('create() deja los datos de baja en null', () => {
    const equipo = makeEquipo();
    expect(equipo.bajaDestino).toBeNull();
    expect(equipo.bajaCategoria).toBeNull();
    expect(equipo.bajaMotivo).toBeNull();
    expect(equipo.bajaFecha).toBeNull();
    expect(equipo.bajaUsuarioId).toBeNull();
  });

  it('darDeBaja() sin texto guarda bajaMotivo en null', () => {
    const equipo = makeEquipo();
    equipo.darDeBaja({
      destino: 'DESCARTE',
      categoria: 'VEJEZ',
      motivo: '   ',
      usuarioId: 'u1',
      fecha: new Date(),
    });
    expect(equipo.bajaMotivo).toBeNull();
  });

  it('darDeBaja() sobre un equipo no vigente lanza y no pisa los datos originales', () => {
    const equipo = makeEquipo();
    equipo.darDeBaja({
      destino: 'DESCARTE',
      categoria: 'VEJEZ',
      usuarioId: 'u1',
      fecha: new Date(),
    });
    expect(() =>
      equipo.darDeBaja({
        destino: 'STOCK_USADO',
        categoria: 'ROTURA',
        usuarioId: 'u2',
        fecha: new Date(),
      }),
    ).toThrow(/ya está dado de baja/);
    expect(equipo.bajaDestino).toBe('DESCARTE');
    expect(equipo.bajaUsuarioId).toBe('u1');
  });

  it.each([[undefined], [null], [''], ['   ']])(
    'darDeBaja() con categoría OTRA y motivo %j lanza',
    (motivo) => {
      const equipo = makeEquipo();
      expect(() =>
        equipo.darDeBaja({
          destino: 'DESCARTE',
          categoria: 'OTRA',
          motivo,
          usuarioId: 'u1',
          fecha: new Date(),
        }),
      ).toThrow(/OTRA exige un motivo/);
      expect(equipo.activo).toBe(true);
    },
  );

  it('darDeBaja() con una categoría fuera del catálogo lanza', () => {
    const equipo = makeEquipo();
    expect(() =>
      equipo.darDeBaja({
        destino: 'DESCARTE',
        // @ts-expect-error categoría fuera del catálogo a propósito
        categoria: 'OBSOLESCENCIA',
        usuarioId: 'u1',
        fecha: new Date(),
      }),
    ).toThrow(/categoría de baja/);
    expect(equipo.activo).toBe(true);
  });

  describe('leyenda de la baja', () => {
    it('compone la leyenda con texto', () => {
      expect(componerLeyendaBaja('PC-Caja-3', 'DONACION', 'a la escuela N° 12')).toBe(
        'Baja del equipo «PC-Caja-3» — Donación: a la escuela N° 12',
      );
    });

    it.each([[undefined], [null], ['  ']])('compone la leyenda sin texto (%j)', (texto) => {
      expect(componerLeyendaBaja('PC-1', 'VEJEZ', texto)).toBe('Baja del equipo «PC-1» — Vejez');
    });

    it('recorta el texto antes de componer', () => {
      expect(componerLeyendaBaja('PC-1', 'ROTURA', '  no enciende ')).toBe(
        'Baja del equipo «PC-1» — Rotura: no enciende',
      );
    });

    it('con el texto en el largo máximo la leyenda mide exactamente 500', () => {
      const max = largoMaximoTextoBaja('PC-Caja-3', 'DONACION');
      const leyenda = componerLeyendaBaja('PC-Caja-3', 'DONACION', 'x'.repeat(max));
      expect(leyenda).toHaveLength(500);
    });

    it('con un carácter más la leyenda mide 501', () => {
      const max = largoMaximoTextoBaja('PC-Caja-3', 'DONACION');
      const leyenda = componerLeyendaBaja('PC-Caja-3', 'DONACION', 'x'.repeat(max + 1));
      expect(leyenda).toHaveLength(501);
    });

    it('con el nombre de 255 y Donación el espacio para el texto es 214', () => {
      expect(largoMaximoTextoBaja('A'.repeat(255), 'DONACION')).toBe(214);
    });

    it('la leyenda sin texto cabe siempre, aun con el nombre en su tope', () => {
      for (const categoria of CATEGORIAS_BAJA_EQUIPO) {
        expect(largoMaximoTextoBaja('A'.repeat(255), categoria)).toBeGreaterThan(0);
      }
    });

    it('una categoría fuera del catálogo lanza', () => {
      expect(() =>
        // @ts-expect-error categoría fuera del catálogo a propósito
        componerLeyendaBaja('PC-1', 'OBSOLESCENCIA'),
      ).toThrow(/categoría de baja/);
    });
  });

  it('el catálogo de categorías y sus etiquetas coinciden', () => {
    expect(Object.keys(ETIQUETAS_CATEGORIA_BAJA).sort()).toEqual(
      [...CATEGORIAS_BAJA_EQUIPO].sort(),
    );
    expect(ETIQUETAS_CATEGORIA_BAJA).toEqual({
      VEJEZ: 'Vejez',
      DONACION: 'Donación',
      ROTURA: 'Rotura',
      OTRA: 'Otra',
    });
  });

  it('los destinos de la baja son los del retiro de un componente', () => {
    expect([...DESTINOS_BAJA_EQUIPO]).toEqual(['STOCK_USADO', 'DESCARTE']);
  });

  it('softDelete() (heredado de BaseEntity) setea deletedAt SIN tocar activo', () => {
    const equipo = makeEquipo();
    equipo.softDelete();
    expect(equipo.isDeleted()).toBe(true);
    expect(equipo.activo).toBe(true);
  });

  it('actualizar() aplica PATCH semántico (undefined no toca, null limpia)', () => {
    const equipo = makeEquipo();
    equipo.actualizar({ nombre: 'Notebook Dell 5420 (actualizado)', marca: undefined });
    expect(equipo.nombre).toBe('Notebook Dell 5420 (actualizado)');
    expect(equipo.marca).toBe('Dell');

    equipo.actualizar({ ubicacion: 'oficina 1' });
    expect(equipo.ubicacion).toBe('OFICINA 1'); // normalizada a mayúscula (invariante de dominio)
    equipo.actualizar({ ubicacion: null });
    expect(equipo.ubicacion).toBeNull();
  });

  it('create() normaliza ubicacion a mayúscula', () => {
    const equipo = EquipoInformaticoEntity.create({
      nombre: 'Notebook Dell 5420',
      numeroSerie: 'SN-002',
      marca: null,
      modelo: null,
      fechaAdquisicion: null,
      ubicacion: 'oficina 1',
      importe: null,
      fechaValoracion: null,
      observaciones: null,
      valorResidual: null,
      fechaValorResidual: null,
    });
    expect(equipo.ubicacion).toBe('OFICINA 1');
  });

  /**
   * Fix defecto "límites de equipos" (sdd/limites-db): la base impone topes
   * (`VarChar`/`Decimal(14,2)`) que el dominio no hacía respetar. Un caso por
   * camino, parametrizado.
   */
  describe('límites de largo/rango', () => {
    it.each([
      ['nombre', { nombre: 'A'.repeat(256) }, /nombre excede/],
      ['numeroSerie', { numeroSerie: 'A'.repeat(256) }, /numeroSerie excede/],
      ['marca', { marca: 'A'.repeat(101) }, /marca excede/],
      ['modelo', { modelo: 'A'.repeat(101) }, /modelo excede/],
      ['ubicacion', { ubicacion: 'A'.repeat(256) }, /ubicacion excede/],
      ['importe (negativo)', { importe: -1 }, /importe no puede ser negativo/],
      ['importe (excede techo)', { importe: 100_000_000 }, /importe excede el techo de negocio/],
      ['valorResidual (negativo)', { valorResidual: -1 }, /valorResidual no puede ser negativo/],
      [
        'valorResidual (excede techo)',
        { valorResidual: 100_000_000 },
        /valorResidual excede el techo de negocio/,
      ],
    ] as const)('create() rechaza %s fuera de rango', (_campo, override, mensaje) => {
      expect(() => EquipoInformaticoEntity.create({ ...baseProps(), ...override })).toThrow(
        mensaje,
      );
    });

    it.each([
      ['nombre', { nombre: 'A'.repeat(255) }],
      ['numeroSerie', { numeroSerie: 'A'.repeat(255) }],
      ['marca', { marca: 'A'.repeat(100) }],
      ['modelo', { modelo: 'A'.repeat(100) }],
      ['ubicacion', { ubicacion: 'A'.repeat(255) }],
      ['importe (mínimo, 0)', { importe: 0 }],
      ['importe (techo, 99999999)', { importe: 99_999_999 }],
      ['valorResidual (mínimo, 0)', { valorResidual: 0 }],
      ['valorResidual (techo, 99999999)', { valorResidual: 99_999_999 }],
    ] as const)('create() acepta %s en el límite exacto', (_campo, override) => {
      expect(() => EquipoInformaticoEntity.create({ ...baseProps(), ...override })).not.toThrow();
    });

    it('actualizar() re-valida el mismo tope de nombre', () => {
      const equipo = EquipoInformaticoEntity.create(baseProps());
      expect(() => equipo.actualizar({ nombre: 'A'.repeat(256) })).toThrow(/nombre excede/);
      expect(equipo.nombre).toBe(baseProps().nombre); // no mutó (falló antes de aplicar)
    });

    it('actualizar() re-valida el mismo tope de importe', () => {
      const equipo = EquipoInformaticoEntity.create(baseProps());
      expect(() => equipo.actualizar({ importe: -1 })).toThrow(/importe no puede ser negativo/);
      expect(equipo.importe).toBeNull(); // no mutó (falló antes de aplicar)
    });

    /**
     * Regresión: el guard medía `ubicacion` CRUDA, antes de normalizar a
     * mayúscula. `toUpperCase()` no preserva longitud en JS ('ß' → 'SS'),
     * así que un valor de 200 chars pasaba el tope de 255 y se expandía a
     * 400 al normalizar, llegando a Postgres (VarChar(255)) como 22001.
     */
    it('create() rechaza ubicacion que excede el tope DESPUÉS de normalizar a mayúscula', () => {
      expect(() =>
        EquipoInformaticoEntity.create({ ...baseProps(), ubicacion: 'ß'.repeat(200) }),
      ).toThrow(/ubicacion excede/);
    });

    it('actualizar() rechaza ubicacion que excede el tope DESPUÉS de normalizar a mayúscula', () => {
      const equipo = EquipoInformaticoEntity.create(baseProps());
      expect(() => equipo.actualizar({ ubicacion: 'ß'.repeat(200) })).toThrow(/ubicacion excede/);
    });

    /**
     * No-regresión (R3 del spec): el bypass del DTO sigue siendo un `throw`
     * de `Error` PLANO — no un `DomainError`/`Result` — porque es contrato
     * del caller, no una desviación de negocio (ADR-1). NO arranca en RED:
     * `validarLargos` ya lanzaba `Error` antes de este change; este test
     * documenta el contrato para que una futura migración a `Result` en este
     * archivo lo note explícitamente.
     */
    it('el bypass del DTO sigue lanzando Error plano, no DomainError/Result', () => {
      let error: unknown;
      try {
        EquipoInformaticoEntity.create({ ...baseProps(), ubicacion: 'ß'.repeat(200) });
      } catch (e) {
        error = e;
      }
      expect(error).toBeInstanceOf(Error);
      expect(error).not.toBeInstanceOf(DomainError);
    });

    // Hermano invertido: un valor ya normalizado y validado por el DTO
    // (equipos.dto.ts) no dispara el backstop al re-normalizar (idempotencia
    // de `normalizarUbicacion`, ver 1.8).
    it('valor ya validado por el DTO (ya normalizado, dentro de rango) no dispara el backstop', () => {
      const yaNormalizado = 'ß'.repeat(127).toUpperCase(); // 254 chars, dentro del tope
      expect(() =>
        EquipoInformaticoEntity.create({ ...baseProps(), ubicacion: yaNormalizado }),
      ).not.toThrow();
    });
  });

  /**
   * Hermano invertido de los tests de rechazo de `create()`: `reconstitute()`
   * NO valida largos (JSDoc de `validarLargos`) porque la fila ya existe en
   * la base — hacer explotar una lectura por un valor histórico convertiría
   * un dato viejo en una caída de sistema.
   */
  it('reconstitute() NO valida largos (permite un valor histórico que excede el tope actual)', () => {
    expect(() =>
      EquipoInformaticoEntity.reconstitute(
        { ...baseProps(), nombre: 'A'.repeat(300), modeloEquipoId: null, activo: true },
        'id-historico',
        new Date('2020-01-01'),
        new Date('2020-01-01'),
        null,
      ),
    ).not.toThrow();
  });

  /**
   * Determinismo/idempotencia de `normalizarUbicacion` (R4 del spec, ADR-1
   * del design). GUARD DE INVARIANTE — NO arranca en RED: `.toUpperCase()`
   * ya es idempotente en JS por definición para estos casos, así que la
   * implementación mínima (delegar en `toUpperCase()`) ya lo cumple sin
   * código extra. La mordida (mutar a `valor.toUpperCase() + 'X'`) prueba que
   * el test realmente ejerce la función — con la mutación, la doble
   * aplicación deja de ser igual a la simple (`...XX` !== `...X`).
   */
  describe('normalizarUbicacion — determinismo e idempotencia', () => {
    it.each([
      ['ß', 2],
      ['ﬁ', 2],
      ['ﬅ', 2],
      ['İ', 1],
      ['ǳ', 1],
      ['oficina 3', 9],
      ['ÁÉÍÓÚ', 5],
    ])(
      'normalizarUbicacion(%s) es idempotente y mide %s tras normalizar',
      (valor, largoEsperado) => {
        const unaVez = normalizarUbicacion(valor);
        const dosVeces = normalizarUbicacion(unaVez);
        expect(dosVeces).toBe(unaVez);
        expect(unaVez.length).toBe(largoEsperado);
      },
    );

    it('caracteres que se expanden 1→2 code points al normalizar (ß, ﬁ)', () => {
      expect(normalizarUbicacion('ß').length).toBe(2);
      expect(normalizarUbicacion('ﬁ').length).toBe(2);
    });

    // Hermano invertido de la expansión: ASCII normal no cambia de largo.
    it('texto ASCII conserva el largo al normalizar', () => {
      expect(normalizarUbicacion('Deposito Central').length).toBe('Deposito Central'.length);
    });

    // Hermano invertido de la idempotencia general: un valor YA normalizado
    // sale byte a byte igual, no solo con el mismo largo.
    it('valor ya en mayúsculas sale byte a byte igual (idempotencia exacta)', () => {
      expect(normalizarUbicacion('DEPOSITO CENTRAL')).toBe('DEPOSITO CENTRAL');
    });
  });

  it('reconstitute() restaura estado desde persistencia', () => {
    const createdAt = new Date('2025-01-01');
    const updatedAt = new Date('2025-02-01');
    const equipo = EquipoInformaticoEntity.reconstitute(
      {
        nombre: 'Equipo reconstituido',
        numeroSerie: null,
        marca: null,
        modelo: null,
        fechaAdquisicion: null,
        ubicacion: null,
        modeloEquipoId: null,
        importe: null,
        fechaValoracion: null,
        observaciones: null,
        valorResidual: null,
        fechaValorResidual: null,
        activo: false,
      },
      'id-reconstituido',
      createdAt,
      updatedAt,
      null,
    );
    expect(equipo.id).toBe('id-reconstituido');
    expect(equipo.activo).toBe(false);
    expect(equipo.createdAt).toEqual(createdAt);
  });
});

/**
 * `modeloEquipoId` es la FK al catálogo `modelos_equipo` (sdd/insumos-catalogo).
 * Es NULLABLE a propósito: un clon armado en casa no tiene modelo de catálogo y
 * existe igual — simplemente no participa de la compatibilidad con insumos.
 */
describe('EquipoInformaticoEntity — modeloEquipoId', () => {
  const MODELO_ID = '01900000-0000-7000-8000-0000000000aa';
  const OTRO_MODELO_ID = '01900000-0000-7000-8000-0000000000bb';

  it('create() sin modeloEquipoId lo deja en null — el equipo sin modelo de catálogo existe igual', () => {
    const equipo = EquipoInformaticoEntity.create(baseProps());
    expect(equipo.modeloEquipoId).toBeNull();
  });

  it('create() con modeloEquipoId lo conserva', () => {
    const equipo = EquipoInformaticoEntity.create({ ...baseProps(), modeloEquipoId: MODELO_ID });
    expect(equipo.modeloEquipoId).toBe(MODELO_ID);
  });

  it('actualizar() con undefined NO toca el modelo ya asignado (PATCH semántico)', () => {
    const equipo = EquipoInformaticoEntity.create({ ...baseProps(), modeloEquipoId: MODELO_ID });

    equipo.actualizar({ nombre: 'Renombrado' });

    expect(equipo.modeloEquipoId).toBe(MODELO_ID);
  });

  it('actualizar() con otro id reasigna el modelo', () => {
    const equipo = EquipoInformaticoEntity.create({ ...baseProps(), modeloEquipoId: MODELO_ID });

    equipo.actualizar({ modeloEquipoId: OTRO_MODELO_ID });

    expect(equipo.modeloEquipoId).toBe(OTRO_MODELO_ID);
  });

  /**
   * Desvincular es un cambio LEGÍTIMO, no un descuido: un equipo mal
   * clasificado tiene que poder quedarse sin modelo de catálogo. Por eso `null`
   * limpia y `undefined` no toca — la distinción de siempre del PATCH.
   */
  it('actualizar() con null desvincula el modelo', () => {
    const equipo = EquipoInformaticoEntity.create({ ...baseProps(), modeloEquipoId: MODELO_ID });

    equipo.actualizar({ modeloEquipoId: null });

    expect(equipo.modeloEquipoId).toBeNull();
  });
});
