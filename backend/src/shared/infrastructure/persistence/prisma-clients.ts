/**
 * prisma-clients.ts — re-exporta los PrismaClient generados de master y tenant.
 *
 * Centraliza los imports de los clientes Prisma generados
 * (`node_modules/.prisma/master` y `node_modules/.prisma/tenant`) en un único
 * punto, para que PrismaService y los tests puedan referenciarlos/mockearlos
 * sin acoplarse a la ruta de salida de cada generator.
 *
 * Los repositorios de infraestructura NO importan desde acá directamente:
 * reciben el client vía TenantContext (tenant) o PrismaService inyectado
 * (master). Requiere `pnpm run generate:master` / `generate:tenant` antes de
 * compilar (los tipos `.prisma/master` y `.prisma/tenant` no existen hasta
 * que Prisma genera el client).
 */
export { PrismaClient as MasterPrismaClient } from '.prisma/master';
export { PrismaClient as TenantPrismaClient } from '.prisma/tenant';
