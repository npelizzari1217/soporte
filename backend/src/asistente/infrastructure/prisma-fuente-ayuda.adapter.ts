import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../shared/infrastructure/persistence/prisma.service';
import { ArticuloAyuda } from '../domain/busqueda-ayuda';
import { IFuenteAyuda } from '../domain/fuente-ayuda.port';

/**
 * Lee la Ayuda de `kb_articulos` (master) con la misma regla de visibilidad que su listado: activos y
 * sin baja; sin `KB:VER_TODOS`, además publicados (`visible_para_solicitante`).
 */
@Injectable()
export class PrismaFuenteAyuda implements IFuenteAyuda {
  constructor(private readonly prismaService: PrismaService) {}

  async listarArticulos(soloPublicados: boolean): Promise<ArticuloAyuda[]> {
    return this.prismaService.getMasterClient().kbArticulo.findMany({
      where: {
        activo: true,
        deletedAt: null,
        ...(soloPublicados ? { visibleParaSolicitante: true } : {}),
      },
      select: { id: true, titulo: true, contenido: true },
      // Orden total: a igual puntaje la búsqueda conserva este orden, así que tiene que ser estable.
      orderBy: [{ titulo: 'asc' }, { id: 'asc' }],
    });
  }
}
