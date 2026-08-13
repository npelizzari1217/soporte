/**
 * PR-12 [UNIT] — S37: append-only garantizado por FIRMA, no por convención.
 *
 * Este test NO es documentación: es la garantía ESTRUCTURAL de que el
 * append-only de la bitácora de compras no se puede violar aunque alguien
 * quiera. Verifica con `Object.getOwnPropertyNames(prototype)` que ningún
 * método propio de `PrismaOperacionCompraRepository` matchea
 * `/update|delete|remove|borrar|actualizar/i`. Si mañana alguien agrega
 * `actualizarOperacion` (o cualquier variante), este test lo frena SIN que
 * nadie edite el test.
 *
 * 100% unit — no requiere `TenantContext` activo ni DB: solo inspecciona el
 * prototipo de la clase.
 *
 * Ref spec: sdd/redisenio-modulo-compras/spec §4.10 (S37). Ref design:
 * ADR-C2, ADR-C4. Tarea: PR-12.
 */
import { PrismaOperacionCompraRepository } from './prisma-operacion-compra.repository';

describe('PrismaOperacionCompraRepository — S37 (append-only por firma)', () => {
  const METODOS_PROHIBIDOS = /update|delete|remove|borrar|actualizar/i;

  it('[CRITICAL] no expone ningún método de mutación/borrado sobre una operación ya persistida', () => {
    const nombresPropios = Object.getOwnPropertyNames(
      PrismaOperacionCompraRepository.prototype,
    ).filter((nombre) => nombre !== 'constructor');

    const violaciones = nombresPropios.filter((nombre) => METODOS_PROHIBIDOS.test(nombre));

    expect(violaciones).toEqual([]);
  });

  it('expone EXACTAMENTE crear() y listarPorCompra() como métodos públicos del puerto (además del constructor y el getter privado `client`)', () => {
    const nombresPropios = Object.getOwnPropertyNames(PrismaOperacionCompraRepository.prototype);

    expect(nombresPropios.sort()).toEqual(
      ['constructor', 'client', 'crear', 'listarPorCompra'].sort(),
    );
  });
});
