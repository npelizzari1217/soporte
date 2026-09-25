/**
 * importar-legacy.ts — carga un paquete `soporte-importacion-legacy/v1` en UN
 * cliente de soporte.
 *
 *   pnpm importar:legacy --paquete <ruta.json> --cliente <nombre exacto> [--aplicar]
 *
 * Sin `--aplicar` es una simulación de solo lectura: informa lo que haría y
 * cada conflicto. Con `--aplicar` escribe e informa lo mismo con resultados.
 * Con conflictos no escribe nada. El orden de escritura es master primero
 * (idempotente, no puede compartir transacción con el tenant) y después el
 * tenant en una única transacción.
 *
 * No levanta la aplicación Nest ni pasa por casos de uso: sin eventos de
 * dominio, sin correos, sin encuestas.
 */
import { readFileSync } from 'fs';
import { PrismaService } from '../../src/shared/infrastructure/persistence/prisma.service';
import { requireEnv } from '../../prisma_master/seeds/root-bootstrap.seed';
import { frenoDeProduccion, parsearArgs } from './cli';
import {
  aplicarMaster,
  leerCiclosVigentes,
  leerRoles,
  leerUsuariosExistentes,
  resolverCliente,
  type ResultadoMaster,
} from './master';
import { validarPaquete, type PaqueteLegacy } from './paquete';
import { comentariosDeTicket, planificarCiclos, planificarUsuarios, separarTickets } from './plan';
import { aplicarTenant, conflictosDeCatalogo, leerTenant, type ResultadoTenant } from './tenant';

export interface ResultadoImportacion {
  conflictos: string[];
  master: ResultadoMaster | null;
  tenant: ResultadoTenant | null;
}

const contar = <T>(xs: T[], f: (x: T) => boolean) => xs.filter(f).length;

export async function importar(
  prisma: PrismaService,
  paquete: PaqueteLegacy,
  clienteNombre: string,
  aplicar: boolean,
  log: (linea: string) => void,
): Promise<ResultadoImportacion> {
  const master = prisma.getMasterClient();
  const clienteR = await resolverCliente(master, clienteNombre);
  if (clienteR.isFail())
    return { conflictos: [clienteR.getError().message], master: null, tenant: null };
  const cliente = clienteR.getValue();
  const tenant = prisma.getTenantClient(cliente.dbName);

  log(`Cliente destino: ${cliente.nombre} (base ${cliente.dbName})`);
  log(aplicar ? 'Modo: APLICAR' : 'Modo: SIMULACION (no se escribe nada)');
  paquete.alertas.forEach((a) => log(`Alerta del paquete: ${a}`));

  const roles = await leerRoles(master);
  const existentes = await leerUsuariosExistentes(
    master,
    paquete.usuarios.map((u) => u.email),
    cliente.id,
  );
  const estadoTenant = await leerTenant(tenant, paquete);
  const usuarios = planificarUsuarios(paquete.usuarios, existentes);
  const ciclos = planificarCiclos(
    paquete.ciclos,
    await leerCiclosVigentes(master),
    estadoTenant.ciclosCliente,
  );
  const { aInsertar, yaExistian } = separarTickets(paquete.tickets, estadoTenant.numerosExistentes);
  const conflictos = [
    ...usuarios.conflictos,
    ...ciclos.conflictos,
    ...conflictosDeCatalogo(paquete, estadoTenant.catalogos),
    ...[...new Set(paquete.usuarios.map((u) => u.rol))]
      .filter((r) => !roles.has(r))
      .map((r) => `rol ${r} no existe en master`),
  ];

  const up = usuarios.plan;
  log(
    `Usuarios: ${up.length} (reusar ${contar(up, (p) => p.accion === 'reusar')}, crear sin acceso ` +
      `${contar(up, (p) => p.accion === 'crear')}; membresias a agregar ${contar(up, (p) => p.membresia === 'agregar')}, ` +
      `inactivas que no se reactivan ${contar(up, (p) => p.membresia === 'inactiva')})`,
  );
  up.forEach((p) =>
    log(
      `  usuario legacy ${p.legacyId} ${p.email} ${p.rol}: ${p.accion}, membresia ${p.membresia}`,
    ),
  );
  ciclos.plan.forEach((c) =>
    log(
      `  ciclo legacy ${c.legacyId} ${c.fechaInicio} a ${c.fechaFin}: vigente ${c.vigente.accion}, del cliente ${c.cliente.accion}`,
    ),
  );
  const comentarios = aInsertar.reduce((n, t) => n + comentariosDeTicket(t).length, 0);
  log(
    `Tickets: ${paquete.tickets.length} en el paquete; a insertar ${aInsertar.length} con ${comentarios} ` +
      `comentario(s); ya existian ${yaExistian.length}`,
  );
  if (yaExistian.length > 0) log(`  ya existian: ${yaExistian.join(', ')}`);
  conflictos.forEach((c) => log(`CONFLICTO: ${c}`));

  if (!aplicar || conflictos.length > 0) {
    if (aplicar) log('Hay conflictos: no se escribio nada.');
    return { conflictos, master: null, tenant: null };
  }

  const rm = await aplicarMaster(
    master,
    cliente,
    paquete.usuarios,
    usuarios.plan,
    ciclos.plan,
    roles,
  );
  log(
    `Master: ${rm.usuariosCreados} usuario(s) creado(s) sin acceso, ${rm.membresiasAgregadas} membresia(s) ` +
      `agregada(s), ${rm.vigentesCreados} ciclo(s) vigente(s) creado(s) inactivo(s)`,
  );
  const rt = await aplicarTenant(tenant, {
    paquete,
    planCiclos: ciclos.plan,
    vigenteIdPorLegacy: rm.vigenteIdPorLegacy,
    usuarioIdPorLegacy: rm.usuarioIdPorLegacy,
    catalogos: estadoTenant.catalogos,
  });
  log(
    `Tenant: ${rt.ciclosCreados} ciclo(s) del cliente creado(s) inactivo(s), ${rt.ticketsInsertados} ticket(s) ` +
      `insertado(s), ${rt.comentariosInsertados} comentario(s) insertado(s), ${rt.yaExistian.length} ya existia(n)`,
  );
  return { conflictos, master: rm, tenant: rt };
}

async function main(): Promise<number> {
  const opcionesR = parsearArgs(process.argv.slice(2));
  if (opcionesR.isFail()) return fallar(opcionesR.getError().message);
  const opciones = opcionesR.getValue();

  const paqueteR = validarPaquete(JSON.parse(readFileSync(opciones.paquete, 'utf8')));
  if (paqueteR.isFail()) {
    paqueteR.getError().errores.forEach((e) => console.error(`[importar-legacy] ${e}`));
    return fallar(paqueteR.getError().message);
  }
  const freno = frenoDeProduccion(opciones, process.env);
  if (freno.isFail()) return fallar(freno.getError().message);

  const prisma = new PrismaService(requireEnv('DATABASE_URL_MASTER'));
  try {
    const r = await importar(prisma, paqueteR.getValue(), opciones.cliente, opciones.aplicar, (l) =>
      console.log(`[importar-legacy] ${l}`),
    );
    return r.conflictos.length > 0 ? 1 : 0;
  } finally {
    await prisma.onModuleDestroy();
  }
}

function fallar(mensaje: string): number {
  console.error(`[importar-legacy] ${mensaje}`);
  return 1;
}

if (require.main === module) {
  try {
    process.loadEnvFile();
  } catch {
    // .env ausente: se usan las variables del entorno.
  }
  main()
    .then((codigo) => (process.exitCode = codigo))
    .catch((err) => {
      console.error('[importar-legacy] Error:', (err as Error).message);
      process.exitCode = 1;
    });
}
