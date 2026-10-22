/**
 * adjuntos.controller.spec.ts — las rutas de adjuntos no exigen celdas de módulo
 * (odd/permisos-por-tipo-ticket, D5 d): `AdjuntarArchivoUseCase` decide con `ALTAS` o
 * `MODIFICACION` sobre el tipo del ticket dueño. La conducta HTTP se prueba en
 * `autorizacion.e2e.spec.ts`.
 */
import { AdjuntosController } from './adjuntos.controller';
import { accionesPorRuta } from '../../../shared/test-helpers/acciones-por-ruta';

describe('AdjuntosController — sin @RequiereAcciones de módulo (D5 d)', () => {
  it('ninguna de sus 2 rutas exige una celda: decide el caso de uso por tipo', () => {
    const rutas = accionesPorRuta(AdjuntosController);

    expect(rutas.size).toBe(2);
    expect([...rutas].filter(([, acciones]) => acciones.length > 0)).toEqual([]);
  });
});
