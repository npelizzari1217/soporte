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
import { ClienteEntity } from './cliente.entity';

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
