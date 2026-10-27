/**
 * [UNIT] `VisibilidadCompraGuard` (odd/compras-por-tipo, S2, L3): el punto único que responde 404
 * en las rutas `/compras/:id...` sobre una compra cuyo tipo el actor no ve. El cargador de alcance
 * es el REAL, sobre un repositorio de permisos falso; la metadata del controller es la REAL.
 */
import 'reflect-metadata';
import { ExecutionContext, NotFoundException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { ExecutionContextHost } from '@nestjs/core/helpers/execution-context-host';
import { VisibilidadCompraGuard } from './visibilidad-compra.guard';
import { ComprasController } from '../controllers/compras.controller';
import { JwtAuthGuard } from '../../../auth/infrastructure/guards/jwt-auth.guard';
import { TenantGuard } from '../../../auth/infrastructure/guards/tenant.guard';
import { AccionesGuard } from '../../../auth/infrastructure/guards/acciones.guard';
import { CargadorAlcanceTicket } from '../../../tickets/interface/alcance-ticket';
import { AccionTipoTicket } from '../../../tickets/domain/permisos-tipo-ticket';
import { ICompraRepository } from '../../domain/ports/i-compra.repository';
import { payloadDeTest } from '../../../auth/test-helpers/payload-de-test';
import { JwtPayload } from '../../../auth/domain/ports/i-token.service';

const COMPRA_ID = '00000000-0000-4000-8000-0000000000a1';
const SOPORTE = 'tipo-soporte';
const EDILICIA = 'tipo-edilicia';

const LECTOR_SOPORTE = payloadDeTest({ sub: 'lector-1', cliente_id: 'c1', rol: 'COMPRADOR' });
const ADMINISTRADOR = payloadDeTest({ sub: 'admin-1', cliente_id: 'c1', rol: 'ADMINISTRADOR' });

function contexto(user: JwtPayload | null, params: Record<string, string>): ExecutionContext {
  return new ExecutionContextHost([{ user, params }]);
}

function crearGuard(tipoDeLaCompra: string | null | 'inexistente') {
  const findParaVisibilidad = vi
    .fn<ICompraRepository['findParaVisibilidad']>()
    .mockResolvedValue(tipoDeLaCompra === 'inexistente' ? null : { tipoTicketId: tipoDeLaCompra });
  const listarPorUsuario = vi.fn(
    async (): Promise<Map<string, Set<AccionTipoTicket>>> =>
      new Map([[SOPORTE, new Set<AccionTipoTicket>(['LECTURA'])]]),
  );
  const guard = new VisibilidadCompraGuard(
    { findParaVisibilidad },
    new CargadorAlcanceTicket({ listarPorUsuario }),
  );
  return { guard, findParaVisibilidad, listarPorUsuario };
}

describe('VisibilidadCompraGuard', () => {
  it('compra de un tipo sin LECTURA -> NotFoundException con el mensaje de una compra inexistente', async () => {
    const { guard } = crearGuard(EDILICIA);

    const resultado = guard.canActivate(contexto(LECTOR_SOPORTE, { id: COMPRA_ID }));

    await expect(resultado).rejects.toBeInstanceOf(NotFoundException);
    await expect(resultado).rejects.toThrow(`Compra con id "${COMPRA_ID}" no encontrada.`);
  });

  it('compra de un tipo con LECTURA -> pasa', async () => {
    const { guard } = crearGuard(SOPORTE);

    await expect(guard.canActivate(contexto(LECTOR_SOPORTE, { id: COMPRA_ID }))).resolves.toBe(
      true,
    );
  });

  it('S4: compra sin tipo -> pasa', async () => {
    const { guard } = crearGuard(null);

    await expect(guard.canActivate(contexto(LECTOR_SOPORTE, { id: COMPRA_ID }))).resolves.toBe(
      true,
    );
  });

  it('compra inexistente -> pasa (el caso de uso responde su 404)', async () => {
    const { guard } = crearGuard('inexistente');

    await expect(guard.canActivate(contexto(LECTOR_SOPORTE, { id: COMPRA_ID }))).resolves.toBe(
      true,
    );
  });

  it('ADMINISTRADOR -> pasa sin leer la compra ni los permisos por tipo', async () => {
    const { guard, findParaVisibilidad, listarPorUsuario } = crearGuard(EDILICIA);

    await expect(guard.canActivate(contexto(ADMINISTRADOR, { id: COMPRA_ID }))).resolves.toBe(true);
    expect(findParaVisibilidad).not.toHaveBeenCalled();
    expect(listarPorUsuario).not.toHaveBeenCalled();
  });

  it('ruta sin :id (alta, listado, exportación) -> pasa sin consultar nada', async () => {
    const { guard, findParaVisibilidad, listarPorUsuario } = crearGuard(EDILICIA);

    await expect(guard.canActivate(contexto(LECTOR_SOPORTE, {}))).resolves.toBe(true);
    expect(findParaVisibilidad).not.toHaveBeenCalled();
    expect(listarPorUsuario).not.toHaveBeenCalled();
  });

  it(':id que no es UUID -> pasa sin consultar (el caso de uso responde como antes)', async () => {
    const { guard, findParaVisibilidad } = crearGuard(EDILICIA);

    await expect(guard.canActivate(contexto(LECTOR_SOPORTE, { id: 'export' }))).resolves.toBe(true);
    expect(findParaVisibilidad).not.toHaveBeenCalled();
  });

  it('ComprasController lo declara a nivel de clase, DESPUÉS de JwtAuthGuard, TenantGuard y AccionesGuard', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, ComprasController) as unknown[];

    expect(guards).toEqual([JwtAuthGuard, TenantGuard, AccionesGuard, VisibilidadCompraGuard]);
  });
});
