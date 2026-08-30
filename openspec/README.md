# openspec — artifact store de soporte

Este directorio es el **lado commiteado** de la persistencia híbrida que define
`C:\trabajos\CLAUDE.md`. Su razón de ser es una sola:

> Engram es la **caché** local de una máquina. Este directorio es la **verdad**.
> Si el proyecto se muda de PC, se clona en otra, o esa base de engram se pierde,
> el historial de decisiones tiene que seguir acá.

Ante divergencia entre engram y este directorio, **manda lo commiteado**.

## Estructura

| Carpeta | Qué guarda |
|---|---|
| `changes/<cambio>/` | Los artefactos SDD del cambio en curso: propuesta, spec, diseño, tareas |
| `changes/archive/` | Los cambios ya cerrados, movidos por `sdd-archive` |
| `specs/<capacidad>/` | Las especificaciones vigentes por capacidad, fusionadas al archivar |

## Cómo se escribe

Cada fase del ciclo SDD deja su artefacto **en los dos lados**:

- **Acá**, dentro de `changes/<cambio>/`, y entra al repo en el commit del ciclo.
- **En engram**, con `gentle-ai mem_save` y `topic_key: sdd/{change}/{artifact}`,
  pasando `project: "soporte"` explícito para evitar "ambiguous project".

Nunca se commitea engram ni un snapshot suyo: `.engram/` está en el `.gitignore`.

## Estado de la migración

Creado el 2026-08-30, al adoptar la persistencia híbrida. **Los ciclos anteriores a
esa fecha viven solo en engram** y no están reflejados acá: si hace falta recuperar
una decisión vieja, hay que buscarla con `gentle-ai mem_search` en la máquina que
tenga esa base. Los ciclos nuevos ya escriben en los dos lados.
