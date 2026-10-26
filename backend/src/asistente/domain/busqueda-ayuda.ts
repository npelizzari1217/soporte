/**
 * Recuperación de fragmentos de la Ayuda para el asistente (odd/asistente-ia-ayuda, S2 y S3).
 *
 * Porta la búsqueda léxica del agente de sesitec, que no usa embeddings: texto normalizado (minúsculas,
 * sin acentos, sin signos), palabras vacías descartadas y puntaje por coincidencia de términos. Los
 * artículos se dividen por sección de markdown, así el contexto que recibe el modelo es corto y
 * pertinente. El puntaje pondera cada término por su rareza en la Ayuda (IDF), como un BM25 mínimo.
 * Todo es puro: sin E/S, para poder probarlo con casos exactos.
 */

/** Artículo de la Ayuda tal como lo lee el asistente. */
export interface ArticuloAyuda {
  id: string;
  titulo: string;
  contenido: string;
}

/** Una sección de un artículo: la unidad que se busca y se pasa como contexto. */
export interface FragmentoAyuda {
  articuloId: string;
  articuloTitulo: string;
  /** Título de la sección, o el del artículo para el texto previo al primer encabezado. */
  seccion: string;
  texto: string;
}

/** Fragmento con su puntaje de coincidencia contra la consulta. */
export interface FragmentoPuntuado extends FragmentoAyuda {
  puntaje: number;
}

/** Largo máximo de un fragmento; una sección más larga se parte por párrafos. */
export const LARGO_MAXIMO_FRAGMENTO = 1200;
/** Fragmentos que se pasan como contexto al modelo (como en sesitec). */
export const FRAGMENTOS_POR_CONSULTA = 3;

const ENCABEZADO = /^#{1,4}\s+(.+?)\s*#*\s*$/;

/**
 * Palabras que no distinguen un tema de otro. Se comparan ya normalizadas (sin acentos). Incluye las
 * formas de pregunta habituales ("cómo", "puedo", "hago") para que no pesen más que el tema.
 */
const PALABRAS_VACIAS = new Set([
  'que',
  'para',
  'por',
  'con',
  'una',
  'uno',
  'unos',
  'unas',
  'los',
  'las',
  'del',
  'como',
  'cual',
  'cuales',
  'cuando',
  'donde',
  'esta',
  'este',
  'esto',
  'estos',
  'estas',
  'eso',
  'esa',
  'ese',
  'son',
  'sus',
  'hay',
  'mas',
  'pero',
  'sin',
  'sobre',
  'entre',
  'tiene',
  'tengo',
  'puedo',
  'puede',
  'pueden',
  'hago',
  'hacer',
  'quiero',
  'necesito',
  'cosa',
  'algo',
  'ser',
  'estan',
  'muy',
  'tambien',
  'usted',
  'ustedes',
  'mis',
  'mio',
  'nos',
  'les',
  'todo',
  'todos',
  'toda',
  'todas',
  'otro',
  'otra',
  'cada',
  'desde',
  'hasta',
  'ver',
  'veo',
  'aca',
  'ahi',
  'alli',
  'aqui',
  'the',
  'and',
]);

/** Minúsculas, sin acentos y con los signos reemplazados por espacios. */
export function normalizarTexto(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Terminaciones que se quitan para reducir una palabra a su raíz, de la más larga a la más corta.
 * Es un lematizador liviano para español, no un analizador morfológico: alcanza para que "creo",
 * "crea" y "crear", o "equipo" y "equipos", den la misma raíz.
 */
const TERMINACIONES = [
  'aciones',
  'amientos',
  'imientos',
  'amiento',
  'imiento',
  'acion',
  'mente',
  'ando',
  'iendo',
  'ados',
  'adas',
  'idos',
  'idas',
  'ado',
  'ada',
  'ido',
  'ida',
  'ar',
  'er',
  'ir',
  'as',
  'es',
  'os',
  'an',
  'en',
  'a',
  'e',
  'o',
  's',
];

/** Largo máximo de una raíz: las palabras largas de una misma familia comparten el comienzo. */
const LARGO_MAXIMO_RAIZ = 6;

/**
 * Raíz de una palabra normalizada: reduce los diptongos `ue` y `ie`, quita la primera terminación que deje al menos 3 letras (4 para
 * las terminaciones de 3 o más letras, para no dejar raíces que coincidan con todo) y corta en
 * `LARGO_MAXIMO_RAIZ`.
 */
export function raiz(palabra: string): string {
  // Diptongos de los verbos irregulares: "apruebo" y "aprobar", "cierro" y "cerrar".
  palabra = palabra.replace(/ue/g, 'o').replace(/ie/g, 'e');
  for (const t of TERMINACIONES) {
    const minimo = t.length >= 3 ? 4 : 3;
    if (palabra.endsWith(t) && palabra.length - t.length >= minimo) {
      return palabra.slice(0, palabra.length - t.length).slice(0, LARGO_MAXIMO_RAIZ);
    }
  }
  return palabra.slice(0, LARGO_MAXIMO_RAIZ);
}

/** Raíces de las palabras significativas del texto, con repeticiones. */
export function terminos(texto: string): string[] {
  return normalizarTexto(texto)
    .split(' ')
    .filter((p) => p.length >= 3 && !PALABRAS_VACIAS.has(p))
    .map(raiz);
}

/** Parte un texto largo por párrafos en trozos de hasta `LARGO_MAXIMO_FRAGMENTO` caracteres. */
function partirPorParrafos(texto: string): string[] {
  const trozos: string[] = [];
  let actual = '';
  for (const parrafo of texto.split(/\n\s*\n/)) {
    const limpio = parrafo.trim();
    if (!limpio) continue;
    if (actual && actual.length + limpio.length + 2 > LARGO_MAXIMO_FRAGMENTO) {
      trozos.push(actual);
      actual = '';
    }
    // Un párrafo solo más largo que el tope se corta en seco: no hay mejor frontera.
    for (let i = 0; i < limpio.length; i += LARGO_MAXIMO_FRAGMENTO) {
      const pedazo = limpio.slice(i, i + LARGO_MAXIMO_FRAGMENTO);
      actual = actual ? `${actual}\n\n${pedazo}` : pedazo;
      if (actual.length >= LARGO_MAXIMO_FRAGMENTO) {
        trozos.push(actual);
        actual = '';
      }
    }
  }
  if (actual) trozos.push(actual);
  return trozos;
}

/**
 * Divide un artículo por sus encabezados de markdown (`#` a `####`). El texto previo al primer
 * encabezado queda con el título del artículo como sección. Las secciones vacías se descartan.
 */
export function fragmentarArticulo(articulo: ArticuloAyuda): FragmentoAyuda[] {
  const secciones: Array<{ seccion: string; lineas: string[] }> = [
    { seccion: articulo.titulo, lineas: [] },
  ];
  for (const linea of articulo.contenido.split(/\r?\n/)) {
    const encabezado = ENCABEZADO.exec(linea);
    if (encabezado) secciones.push({ seccion: encabezado[1], lineas: [] });
    else secciones[secciones.length - 1].lineas.push(linea);
  }

  return secciones.flatMap(({ seccion, lineas }) =>
    partirPorParrafos(lineas.join('\n')).map((texto) => ({
      articuloId: articulo.id,
      articuloTitulo: articulo.titulo,
      seccion,
      texto,
    })),
  );
}

/**
 * Rareza de cada término en el conjunto de fragmentos (IDF): `ln(1 + N / df)`. Un término que
 * aparece en casi todos los fragmentos (como "ticket" en esta Ayuda) pesa poco; uno específico pesa
 * mucho. Sin esto, la palabra más común de la Ayuda decide el resultado.
 */
export function rarezas(fragmentos: FragmentoAyuda[]): Map<string, number> {
  const apariciones = new Map<string, number>();
  for (const f of fragmentos) {
    for (const t of new Set(terminos(`${f.articuloTitulo} ${f.seccion} ${f.texto}`))) {
      apariciones.set(t, (apariciones.get(t) ?? 0) + 1);
    }
  }
  const n = fragmentos.length;
  return new Map([...apariciones].map(([t, df]) => [t, Math.log(1 + n / df)]));
}

/**
 * Puntaje de un fragmento: por cada término distinto de la consulta, sus apariciones en el texto
 * (hasta 3, para que una palabra repetida no domine) más 2 si aparece en el título del artículo o de
 * la sección, todo multiplicado por la rareza del término. 0 significa que no comparte ningún término.
 */
export function puntuarFragmento(
  terminosConsulta: string[],
  fragmento: FragmentoAyuda,
  rareza: Map<string, number>,
): number {
  const cuerpo = new Map<string, number>();
  for (const t of terminos(fragmento.texto)) cuerpo.set(t, (cuerpo.get(t) ?? 0) + 1);
  const titulos = new Set(terminos(`${fragmento.articuloTitulo} ${fragmento.seccion}`));

  let puntaje = 0;
  for (const t of new Set(terminosConsulta)) {
    const peso = Math.min(cuerpo.get(t) ?? 0, 3) + (titulos.has(t) ? 2 : 0);
    puntaje += peso * (rareza.get(t) ?? 0);
  }
  return puntaje;
}

/**
 * Los `cantidad` fragmentos más parecidos a la consulta, de mayor a menor puntaje. A igual puntaje
 * gana el más corto (más concentrado). Solo devuelve fragmentos con al menos un término en común.
 */
export function buscarFragmentos(
  articulos: ArticuloAyuda[],
  consulta: string,
  cantidad: number = FRAGMENTOS_POR_CONSULTA,
): FragmentoPuntuado[] {
  const terminosConsulta = terminos(consulta);
  if (terminosConsulta.length === 0) return [];

  const fragmentos = articulos.flatMap(fragmentarArticulo);
  const rareza = rarezas(fragmentos);
  return fragmentos
    .map((f) => ({ ...f, puntaje: puntuarFragmento(terminosConsulta, f, rareza) }))
    .filter((f) => f.puntaje > 0)
    .sort((a, b) => b.puntaje - a.puntaje || a.texto.length - b.texto.length)
    .slice(0, cantidad);
}
