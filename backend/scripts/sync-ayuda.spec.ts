/**
 * Parseo del frontmatter de los artículos de Ayuda, y test de deriva del
 * directorio real (`backend/ayuda/`).
 *
 * Un frontmatter inválido no puede pasar en silencio: el artículo terminaría sin
 * sincronizarse sin que nadie se entere, o peor, sincronizado con una identidad
 * equivocada.
 *
 * El test de deriva es el que importa a futuro: cada `.md` que se agregue al
 * repositorio pasa por acá, así que un frontmatter roto o un slug repetido se
 * detecta en la suite y no en la corrida contra producción.
 */
/* eslint-disable @typescript-eslint/no-require-imports */
import { existsSync } from 'node:fs';

type Articulo = {
  slug: string;
  titulo: string;
  visibleParaSolicitante: boolean;
  contenido: string;
  origen: string;
};

const { parsearArticulo, cargarArticulos, DIRECTORIO_ARTICULOS } = require('./sync-ayuda.js') as {
  parsearArticulo: (texto: string, origen: string) => Articulo;
  cargarArticulos: (directorio?: string) => Articulo[];
  DIRECTORIO_ARTICULOS: string;
};

describe('parsearArticulo()', () => {
  const VALIDO = [
    '---',
    'slug: permisos-y-roles',
    'titulo: Cómo funcionan los permisos',
    'visibleParaSolicitante: false',
    '---',
    '',
    '# Título',
    '',
    'Cuerpo del artículo.',
  ].join('\n');

  it('extrae frontmatter y cuerpo, y aplica los defaults', () => {
    const articulo = parsearArticulo(VALIDO, 'ejemplo.md');

    expect(articulo.slug).toBe('permisos-y-roles');
    expect(articulo.titulo).toBe('Cómo funcionan los permisos');
    expect(articulo.visibleParaSolicitante).toBe(false);
    expect(articulo.contenido).toBe('# Título\n\nCuerpo del artículo.');
  });

  it('acepta comentarios al final de una línea del frontmatter', () => {
    const texto = VALIDO.replace(
      'visibleParaSolicitante: false',
      'visibleParaSolicitante: false   # arranca interno',
    );

    expect(parsearArticulo(texto, 'ejemplo.md').visibleParaSolicitante).toBe(false);
  });

  // Un frontmatter inválido NO puede pasar en silencio: el artículo terminaría
  // sin sincronizarse, o peor, sincronizado con una identidad equivocada.
  it.each([
    ['sin slug', VALIDO.replace('slug: permisos-y-roles\n', ''), /falta "slug" en el frontmatter/],
    [
      'sin titulo',
      VALIDO.replace('titulo: Cómo funcionan los permisos\n', ''),
      /falta "titulo" en el frontmatter/,
    ],
    ['sin frontmatter', '# Solo cuerpo\n', /debe empezar con una línea "---"/],
    [
      'frontmatter sin cerrar',
      '---\nslug: x\ntitulo: X\n\n# Cuerpo\n',
      /frontmatter quedó sin cerrar/,
    ],
    [
      'slug con mayúsculas',
      VALIDO.replace('permisos-y-roles', 'Permisos-Y-Roles'),
      /slug "Permisos-Y-Roles" inválido/,
    ],
    ['cuerpo vacío', '---\nslug: x\ntitulo: X\n---\n\n', /no tiene cuerpo/],
    [
      'clave desconocida',
      VALIDO.replace('visibleParaSolicitante:', 'visibleParaSolicitant:'),
      /clave desconocida "visibleParaSolicitant"/,
    ],
    // `tipoTicket` era una clave válida hasta que la Ayuda pasó a master: la FK
    // apuntaba al catálogo del TENANT y no sobrevivió al cruce. Un .md viejo que
    // la traiga tiene que fallar fuerte, no ignorarse en silencio.
    [
      'con el tipoTicket retirado',
      VALIDO.replace('slug: permisos-y-roles', 'slug: permisos-y-roles\ntipoTicket: null'),
      /clave desconocida "tipoTicket"/,
    ],
  ])('rechaza un archivo %s con un mensaje que nombra el archivo', (_caso, texto, patron) => {
    expect(() => parsearArticulo(texto as string, 'roto.md')).toThrow(patron as RegExp);
    expect(() => parsearArticulo(texto as string, 'roto.md')).toThrow(/\[roto\.md\]/);
  });
});

describe('cargarArticulos() — deriva del directorio real', () => {
  it('todos los .md de backend/ayuda tienen frontmatter válido y slugs únicos', () => {
    expect(existsSync(DIRECTORIO_ARTICULOS)).toBe(true);

    const articulos = cargarArticulos();

    expect(articulos.length).toBeGreaterThan(0);
    const slugs = articulos.map((a) => a.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });
});
