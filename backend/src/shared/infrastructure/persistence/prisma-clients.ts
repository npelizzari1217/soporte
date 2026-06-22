/**
 * prisma-clients.ts — re-exporta los PrismaClient generados de master y tenant.
 *
 * Propósito: centralizar los imports de los clientes Prisma generados
 * (`node_modules/.prisma/master` y `node_modules/.prisma/tenant`) en un
 * único punto que los tests pueden mockear fácilmente con `jest.mock`.
 *
 * Los repositorios de infraestructura NO importan desde aquí directamente;
 * reciben el client a través de TenantContext (tenant) o de PrismaService
 * inyectado (master). Este archivo existe exclusivamente para habilitar
 * el patrón de factory en PrismaService y el mockeo en tests.
 */

// Importamos como alias para claridad y para facilitar el mock en tests.
export { PrismaClient as MasterPrismaClient } from '.prisma/master';
export { PrismaClient as TenantPrismaClient } from '.prisma/tenant';
