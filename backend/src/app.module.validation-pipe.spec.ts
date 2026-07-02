/**
 * tech-debt-validation-pipe [RED→GREEN] — Contrato del ValidationPipe global.
 *
 * Verifica, SIN bootstrapear NestJS ni tocar HTTP/auth, que:
 *   1. `new ValidationPipe({ whitelist: true, transform: true })` (la misma config
 *      que se registra como APP_PIPE en AppModule) rechaza payloads malformados
 *      de los DTOs de admin-general con BadRequestException.
 *   2. Los payloads válidos pasan y se transforman a instancias del DTO (class-transformer).
 *
 * ALCANCE: SOLO los DTOs de admin-general (clientes/ciclos, reportes, auth/usuarios).
 * NO cubre tickets/compras/equipos/reparaciones/comentarios (fuera de alcance).
 *
 * Nota: las interfaces de TS se borran en compilación (metatype queda en `Object`),
 * por eso ReporteQueryDto y CreateUsuarioDto se convierten de interface a class:
 * sin esa conversión, el pipe saltea la validación en silencio (metatype === Object).
 *
 * Tarea: tech-debt-validation-pipe
 */
import { ValidationPipe, BadRequestException, ArgumentMetadata } from '@nestjs/common';
import { CreateCicloDto } from './clientes/interface/dtos/create-ciclo.dto';
import { CreateClienteDto } from './clientes/interface/dtos/create-cliente.dto';
import { CreateCicloVigenteDto } from './clientes/interface/dtos/create-ciclo-vigente.dto';
import { ReporteQueryDto } from './reportes/interface/dtos/reporte-query.dto';
import { CreateUsuarioDto } from './auth/interface/dtos/auth.dto';

// Misma config que se registra como APP_PIPE en AppModule (progresiva: sin
// forbidNonWhitelisted para no romper payloads con props extra).
function makePipe(): ValidationPipe {
  return new ValidationPipe({ whitelist: true, transform: true });
}

describe('ValidationPipe global — DTOs de admin-general', () => {
  describe('CreateUsuarioDto (POST /usuarios)', () => {
    const metadata: ArgumentMetadata = { type: 'body', metatype: CreateUsuarioDto, data: '' };

    it('rechaza email inválido con BadRequestException', async () => {
      const payload = {
        email: 'no-es-un-email',
        nombre: 'Ana',
        apellido: 'Gómez',
        password: 'Password123!',
        rol: 'USUARIO',
      };

      await expect(makePipe().transform(payload, metadata)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('rechaza rol fuera de ROLES_VALIDOS con BadRequestException', async () => {
      const payload = {
        email: 'ana@example.com',
        nombre: 'Ana',
        apellido: 'Gómez',
        password: 'Password123!',
        rol: 'SUPERADMIN',
      };

      await expect(makePipe().transform(payload, metadata)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('acepta un payload válido y lo transforma a instancia de CreateUsuarioDto', async () => {
      const payload = {
        email: 'ana@example.com',
        nombre: 'Ana',
        apellido: 'Gómez',
        password: 'Password123!',
        rol: 'USUARIO',
      };

      const result = await makePipe().transform(payload, metadata);
      expect(result).toBeInstanceOf(CreateUsuarioDto);
      expect(result.email).toBe('ana@example.com');
    });
  });

  describe('ReporteQueryDto (GET /reportes/*)', () => {
    const metadata: ArgumentMetadata = { type: 'query', metatype: ReporteQueryDto, data: '' };

    it('rechaza cicloId no-UUID con BadRequestException', async () => {
      await expect(
        makePipe().transform({ cicloId: 'no-es-un-uuid' }, metadata),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('acepta cicloId ausente (querystring vacío = ciclo activo del tenant)', async () => {
      const result = await makePipe().transform({}, metadata);
      expect(result).toBeInstanceOf(ReporteQueryDto);
      expect(result.cicloId).toBeUndefined();
    });

    it('acepta cicloId con UUID válido', async () => {
      const uuid = '3fa85f64-5717-4562-b3fc-2c963f66afa6';
      const result = await makePipe().transform({ cicloId: uuid }, metadata);
      expect(result).toBeInstanceOf(ReporteQueryDto);
      expect(result.cicloId).toBe(uuid);
    });
  });

  describe('CreateCicloDto (POST /ciclos)', () => {
    const metadata: ArgumentMetadata = { type: 'body', metatype: CreateCicloDto, data: '' };

    it('rechaza fechaInicio inválida con BadRequestException', async () => {
      const payload = {
        nombre: 'Ciclo 2026',
        fechaInicio: 'no-es-una-fecha',
        fechaFin: '2026-12-31',
      };
      await expect(makePipe().transform(payload, metadata)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('rechaza nombre vacío con BadRequestException', async () => {
      const payload = { nombre: '', fechaInicio: '2026-01-01', fechaFin: '2026-12-31' };
      await expect(makePipe().transform(payload, metadata)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('acepta un payload válido y lo transforma a instancia de CreateCicloDto', async () => {
      const payload = { nombre: 'Ciclo 2026', fechaInicio: '2026-01-01', fechaFin: '2026-12-31' };
      const result = await makePipe().transform(payload, metadata);
      expect(result).toBeInstanceOf(CreateCicloDto);
      expect(result.nombre).toBe('Ciclo 2026');
    });
  });

  describe('CreateCicloVigenteDto (POST /ciclos-vigentes)', () => {
    const metadata: ArgumentMetadata = {
      type: 'body',
      metatype: CreateCicloVigenteDto,
      data: '',
    };

    it('rechaza activo no-boolean con BadRequestException', async () => {
      const payload = {
        nombre: 'Ciclo vigente',
        fechaInicio: '2026-01-01',
        fechaFin: '2026-12-31',
        activo: 'si',
      };
      await expect(makePipe().transform(payload, metadata)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('acepta un payload válido y lo transforma a instancia de CreateCicloVigenteDto', async () => {
      const payload = {
        nombre: 'Ciclo vigente',
        fechaInicio: '2026-01-01',
        fechaFin: '2026-12-31',
        activo: true,
      };
      const result = await makePipe().transform(payload, metadata);
      expect(result).toBeInstanceOf(CreateCicloVigenteDto);
      expect(result.activo).toBe(true);
    });
  });

  describe('CreateClienteDto (POST /clientes)', () => {
    const metadata: ArgumentMetadata = { type: 'body', metatype: CreateClienteDto, data: '' };

    it('rechaza adminEmail inválido con BadRequestException', async () => {
      const payload = {
        nombre: 'Acme',
        razonSocial: null,
        cuit: null,
        dbName: 'acme_db',
        adminEmail: 'no-es-un-email',
        adminNombre: 'Admin',
        adminApellido: 'Uno',
        adminPassword: 'Password123!',
      };
      await expect(makePipe().transform(payload, metadata)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('acepta un payload válido con razonSocial/cuit null', async () => {
      const payload = {
        nombre: 'Acme',
        razonSocial: null,
        cuit: null,
        dbName: 'acme_db',
        adminEmail: 'admin@acme.com',
        adminNombre: 'Admin',
        adminApellido: 'Uno',
        adminPassword: 'Password123!',
      };
      const result = await makePipe().transform(payload, metadata);
      expect(result).toBeInstanceOf(CreateClienteDto);
      expect(result.razonSocial).toBeNull();
      expect(result.cuit).toBeNull();
    });
  });
});
