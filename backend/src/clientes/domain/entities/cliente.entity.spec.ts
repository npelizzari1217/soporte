/**
 * WU1 T1.4 — Unit test del getter `csatHabilitado` (sdd/csat).
 *
 * Cubre solo la regla no trivial: default a `false` cuando no se provee
 * (mismo patrón que `UsuarioEntity.isGlobalAdmin`), y que `reconstitute()`
 * respeta el valor persistido. El resto de `ClienteEntity` no tiene tests
 * unitarios propios — no se agregan acá por estar fuera de alcance de WU1.
 *
 * WU10.2 suma `configurarCsat()`: el setter que usa
 * `ConfigurarCsatClienteUseCase` para prender/apagar el flag por cliente
 * desde la pantalla de admin (sdd/csat/tasks-wu10 WU10.2).
 */
import {
  ClienteEntity,
  CLIENTE_NOMBRE_MAX_LENGTH,
  CLIENTE_RAZON_SOCIAL_MAX_LENGTH,
} from './cliente.entity';

const makeCliente = (csatHabilitado?: boolean) =>
  ClienteEntity.create({
    nombre: 'Acme SA',
    razonSocial: null,
    cuit: null,
    dbName: 'acme_sa',
    activo: true,
    csatHabilitado,
  });

describe('ClienteEntity — csatHabilitado', () => {
  describe('create()', () => {
    it('default a false cuando no se provee', () => {
      const cliente = makeCliente();
      expect(cliente.csatHabilitado).toBe(false);
    });

    it('expone true cuando se provee explícitamente', () => {
      const cliente = makeCliente(true);
      expect(cliente.csatHabilitado).toBe(true);
    });
  });

  describe('reconstitute()', () => {
    it('respeta csatHabilitado=true persistido', () => {
      const cliente = ClienteEntity.reconstitute(
        {
          nombre: 'Acme SA',
          razonSocial: null,
          cuit: null,
          dbName: 'acme_sa',
          activo: true,
          csatHabilitado: true,
        },
        'cliente-id',
        new Date('2025-01-01T00:00:00Z'),
        new Date('2025-01-01T00:00:00Z'),
        null,
      );
      expect(cliente.csatHabilitado).toBe(true);
    });

    it('default a false cuando la fila persistida no lo provee', () => {
      const cliente = ClienteEntity.reconstitute(
        {
          nombre: 'Acme SA',
          razonSocial: null,
          cuit: null,
          dbName: 'acme_sa',
          activo: true,
        },
        'cliente-id',
        new Date('2025-01-01T00:00:00Z'),
        new Date('2025-01-01T00:00:00Z'),
        null,
      );
      expect(cliente.csatHabilitado).toBe(false);
    });
  });

  describe('configurarCsat() (WU10.2)', () => {
    it('prende el flag y actualiza updatedAt', () => {
      const cliente = makeCliente(false);
      const updatedAtOriginal = cliente.updatedAt;

      cliente.configurarCsat(true);

      expect(cliente.csatHabilitado).toBe(true);
      expect(cliente.updatedAt.getTime()).toBeGreaterThanOrEqual(updatedAtOriginal.getTime());
    });

    it('apaga el flag cuando ya estaba prendido', () => {
      const cliente = makeCliente(true);

      cliente.configurarCsat(false);

      expect(cliente.csatHabilitado).toBe(false);
    });
  });
});

/**
 * WU1 T1.5 — Unit test de `actualizarLogo()` / `quitarLogo()` (sdd/logo-por-cliente).
 *
 * Cubre la regla no trivial: las 3 props de logo (`logoStorageKey`,
 * `logoMimeType`, `logoUpdatedAt`) viajan SIEMPRE juntas — ninguna de las dos
 * operaciones deja el trío a medio setear. El round-trip con el mapper
 * Prisma (D4) es el que valida que la persistencia respeta ese trío; acá se
 * valida solo el comportamiento de la entidad.
 */
describe('ClienteEntity — logo', () => {
  const makeClienteSinLogo = () =>
    ClienteEntity.create({
      nombre: 'Acme SA',
      razonSocial: null,
      cuit: null,
      dbName: 'acme_sa',
      activo: true,
    });

  describe('create() / reconstitute()', () => {
    it('sin logo, los 3 getters son null', () => {
      const cliente = makeClienteSinLogo();
      expect(cliente.logoStorageKey).toBeNull();
      expect(cliente.logoMimeType).toBeNull();
      expect(cliente.logoUpdatedAt).toBeNull();
    });

    it('reconstitute() respeta las 3 props de logo persistidas', () => {
      const fecha = new Date('2026-09-20T12:00:00Z');
      const cliente = ClienteEntity.reconstitute(
        {
          nombre: 'Acme SA',
          razonSocial: null,
          cuit: null,
          dbName: 'acme_sa',
          activo: true,
          logoStorageKey: 'clientes/cliente-id/uuid-1',
          logoMimeType: 'image/png',
          logoUpdatedAt: fecha,
        },
        'cliente-id',
        new Date('2025-01-01T00:00:00Z'),
        new Date('2025-01-01T00:00:00Z'),
        null,
      );
      expect(cliente.logoStorageKey).toBe('clientes/cliente-id/uuid-1');
      expect(cliente.logoMimeType).toBe('image/png');
      expect(cliente.logoUpdatedAt).toEqual(fecha);
    });
  });

  describe('actualizarLogo()', () => {
    it('setea las 3 props juntas y actualiza updatedAt', () => {
      const cliente = makeClienteSinLogo();
      const updatedAtOriginal = cliente.updatedAt;
      const fecha = new Date('2026-09-21T10:00:00Z');

      cliente.actualizarLogo('clientes/cliente-id/uuid-2', 'image/webp', fecha);

      expect(cliente.logoStorageKey).toBe('clientes/cliente-id/uuid-2');
      expect(cliente.logoMimeType).toBe('image/webp');
      expect(cliente.logoUpdatedAt).toEqual(fecha);
      expect(cliente.updatedAt.getTime()).toBeGreaterThanOrEqual(updatedAtOriginal.getTime());
    });

    it('reemplaza un logo existente por uno nuevo, sin dejar mezcla de props', () => {
      const cliente = makeClienteSinLogo();
      cliente.actualizarLogo(
        'clientes/cliente-id/uuid-1',
        'image/png',
        new Date('2026-09-01T00:00:00Z'),
      );

      const fechaNueva = new Date('2026-09-21T10:00:00Z');
      cliente.actualizarLogo('clientes/cliente-id/uuid-2', 'image/jpeg', fechaNueva);

      expect(cliente.logoStorageKey).toBe('clientes/cliente-id/uuid-2');
      expect(cliente.logoMimeType).toBe('image/jpeg');
      expect(cliente.logoUpdatedAt).toEqual(fechaNueva);
    });
  });

  describe('quitarLogo()', () => {
    it('limpia las 3 props juntas y actualiza updatedAt', () => {
      const cliente = makeClienteSinLogo();
      cliente.actualizarLogo(
        'clientes/cliente-id/uuid-1',
        'image/png',
        new Date('2026-09-01T00:00:00Z'),
      );
      const updatedAtConLogo = cliente.updatedAt;

      cliente.quitarLogo();

      expect(cliente.logoStorageKey).toBeNull();
      expect(cliente.logoMimeType).toBeNull();
      expect(cliente.logoUpdatedAt).toBeNull();
      expect(cliente.updatedAt.getTime()).toBeGreaterThanOrEqual(updatedAtConLogo.getTime());
    });

    it('es idempotente: quitar el logo de un cliente sin logo no lanza', () => {
      const cliente = makeClienteSinLogo();
      expect(() => cliente.quitarLogo()).not.toThrow();
      expect(cliente.logoStorageKey).toBeNull();
    });
  });
});

/**
 * Guard de largo de `cuit` — cierra la divergencia entre la columna y el DTO.
 *
 * `clientes.cuit` es `VARCHAR(13)` (`prisma_master/schema.prisma`,
 * `init_master/migration.sql:6`), que es exactamente el largo de un CUIT
 * formateado (`30-12345678-9`). El DTO declaraba `@MaxLength(20)`: 14 a 20
 * caracteres pasaban `class-validator`, no encontraban guard en el dominio y
 * reventaban recién en Postgres (22001 → 500 crudo en vez de 400 limpio).
 *
 * `throw` plano y no `Result`: `cuit` no se normaliza en ningún borde, así
 * que el borde mide lo mismo que el dominio — rama 1 de la "regla de tres
 * ramas" documentada en `equipo-informatico.entity.ts`.
 */
describe('ClienteEntity — tope de largo de cuit', () => {
  const conCuit = (cuit: string | null) =>
    ClienteEntity.create({
      nombre: 'Acme SA',
      razonSocial: null,
      cuit,
      dbName: 'acme_sa',
      activo: true,
    });

  describe('create()', () => {
    it('acepta un cuit de 13 caracteres (el largo exacto de la columna)', () => {
      expect(conCuit('30-12345678-9').cuit).toBe('30-12345678-9');
    });

    it('rechaza un cuit de 14 caracteres', () => {
      expect(() => conCuit('A'.repeat(14))).toThrow(/cuit excede/);
    });

    it('sigue aceptando cuit null: el tope no lo vuelve obligatorio', () => {
      expect(conCuit(null).cuit).toBeNull();
    });
  });

  describe('editar()', () => {
    it('rechaza un cuit de 14 caracteres', () => {
      const cliente = conCuit(null);
      expect(() => cliente.editar({ cuit: 'A'.repeat(14) })).toThrow(/cuit excede/);
    });

    it('acepta un cuit de 13 caracteres', () => {
      const cliente = conCuit(null);
      cliente.editar({ cuit: '30-12345678-9' });
      expect(cliente.cuit).toBe('30-12345678-9');
    });

    it('acepta null para limpiar el cuit', () => {
      const cliente = conCuit('30-12345678-9');
      cliente.editar({ cuit: null });
      expect(cliente.cuit).toBeNull();
    });

    it('no toca el cuit cuando el patch no lo incluye', () => {
      const cliente = conCuit('30-12345678-9');
      cliente.editar({ nombre: 'Acme SRL' });
      expect(cliente.cuit).toBe('30-12345678-9');
    });
  });

  /**
   * Hermano invertido del guard: `reconstitute()` lee, no revalida.
   *
   * El valor de 20 de este test NO puede existir en la base real (la columna
   * es `VARCHAR(13)`), así que el caso es hipotético a propósito: fija que la
   * lectura queda exenta del tope, para que ensanchar la columna en el futuro
   * no convierta un dato legítimo en una caída. Mismo criterio que
   * `EquipoInformaticoEntity`.
   */
  it('reconstitute() NO valida el tope (una lectura nunca revalida)', () => {
    const cliente = ClienteEntity.reconstitute(
      {
        nombre: 'Acme SA',
        razonSocial: null,
        cuit: 'A'.repeat(20),
        dbName: 'acme_sa',
        activo: true,
      },
      'id-1',
      new Date(),
      new Date(),
      null,
    );
    expect(cliente.cuit).toBe('A'.repeat(20));
  });
});

/**
 * Guard de largo de `nombre` y `razonSocial`.
 *
 * El 200 NO es el ancho de la columna: `clientes.nombre` y
 * `clientes.razon_social` son `VarChar(255)`. Es un tope de producto más
 * estricto, que ya vivía en `UpdateClienteDto` — la columna queda de backstop.
 * Sube al dominio por el mismo motivo que `cuit`: mientras el número estuvo
 * escrito a mano en el borde, el alta se quedó sin él y la edición no, así que
 * un nombre de 220 se podía crear pero nunca editar.
 */
describe('ClienteEntity — tope de largo de nombre y razonSocial', () => {
  const conNombre = (nombre: string, razonSocial: string | null = null) =>
    ClienteEntity.create({ nombre, razonSocial, cuit: null, dbName: 'acme_sa', activo: true });

  it('acepta un nombre en el límite exacto', () => {
    expect(conNombre('A'.repeat(CLIENTE_NOMBRE_MAX_LENGTH)).nombre).toHaveLength(
      CLIENTE_NOMBRE_MAX_LENGTH,
    );
  });

  it('create() rechaza un nombre que pasa el tope', () => {
    expect(() => conNombre('A'.repeat(CLIENTE_NOMBRE_MAX_LENGTH + 1))).toThrow(/nombre excede/);
  });

  it('create() rechaza una razonSocial que pasa el tope', () => {
    expect(() => conNombre('Acme SA', 'A'.repeat(CLIENTE_RAZON_SOCIAL_MAX_LENGTH + 1))).toThrow(
      /razonSocial excede/,
    );
  });

  it('sigue aceptando razonSocial null: el tope no la vuelve obligatoria', () => {
    expect(conNombre('Acme SA', null).razonSocial).toBeNull();
  });

  it('editar() rechaza un nombre que pasa el tope', () => {
    const cliente = conNombre('Acme SA');
    expect(() => cliente.editar({ nombre: 'A'.repeat(CLIENTE_NOMBRE_MAX_LENGTH + 1) })).toThrow(
      /nombre excede/,
    );
  });

  it('editar() rechaza una razonSocial que pasa el tope', () => {
    const cliente = conNombre('Acme SA');
    expect(() =>
      cliente.editar({ razonSocial: 'A'.repeat(CLIENTE_RAZON_SOCIAL_MAX_LENGTH + 1) }),
    ).toThrow(/razonSocial excede/);
  });

  /** Centinela de valor: los topes no son el ancho de la columna, son más chicos. */
  it('los topes de producto son más estrictos que la columna VarChar(255)', () => {
    expect(CLIENTE_NOMBRE_MAX_LENGTH).toBeLessThan(255);
    expect(CLIENTE_RAZON_SOCIAL_MAX_LENGTH).toBeLessThan(255);
  });
});
