// Adaptador SIN lógica propia, a propósito (ver design sdd/regeneracion-reproducible
// D1-D2): lee el mundo (snapshot de process.env + parseo de backend/.env) y
// delega la decisión al módulo puro. Un `throw` acá corta TODA la corrida de
// Vitest antes de que corra el primer spec — por eso vive fuera del módulo
// puro, que no puede tocar `process.env` ni el filesystem sin dejar de serlo.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import dotenv from 'dotenv';
import { auditarEntorno } from '../scripts/lib/guardarrail-host.mjs';

const RUTA_ENV = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.env');

export default function globalSetup() {
  const envProceso = { ...process.env };

  let envArchivo = {};
  try {
    envArchivo = dotenv.parse(readFileSync(RUTA_ENV));
  } catch {
    // .env ausente: se audita solo lo que ya está en el entorno de shell.
  }

  const { violaciones } = auditarEntorno({ envProceso, envArchivo, rutaArchivo: RUTA_ENV });

  if (violaciones.length > 0) {
    for (const violacion of violaciones) {
      console.error(`[guardarrail-host] ${violacion.mensaje}`);
    }
    throw new Error(
      `[guardarrail-host] corrida abortada: ${violaciones.length} URL(s) de base de datos ` +
        'apuntan fuera de localhost/127.0.0.1/::1.',
    );
  }
}
