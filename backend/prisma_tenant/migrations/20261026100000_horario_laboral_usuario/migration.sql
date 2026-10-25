-- Horario laboral propio de cada usuario (odd/tasks/tiempo-tecnico.md, T1, S1-S2).
--
-- Mismo shape y mismos CHECK que `calendario_laboral_dias_cliente`
-- (migración `20260928150000_calendario_laboral_dias_cliente`): una fila por día de la semana
-- (0 = domingo .. 6 = sábado), `apertura_minuto`/`cierre_minuto` en minutos de hora argentina,
-- ambos NULL = día cerrado. La diferencia es la PK: (`usuario_id`, `dia_semana`).
--
-- `usuario_id` es referencia blanda a `master.usuarios` (sin FK, igual que
-- `equipo_valoraciones.usuario_id`): la pertenencia al tenant la valida el código contra
-- `master.membresias` antes de escribir.
--
-- Un usuario sin filas usa el horario del tenant (S2). Un usuario con horario propio tiene las 7
-- filas: el código las reemplaza juntas en una transacción, y "al menos un día abierto" lo valida
-- el dominio (`HorarioLaboralSemanal`), porque un CHECK por fila no puede verlo. Sin seed: la tabla
-- arranca vacía y todos los usuarios siguen con el horario del tenant.
--
-- El índice de la PK empieza por `usuario_id`: cubre la lectura del horario de un usuario.
--
-- `updated_at` no tiene DEFAULT (`@updatedAt` de Prisma lo escribe en cada INSERT y UPDATE).
--
-- Re-ejecutable: CREATE TABLE IF NOT EXISTS.
CREATE TABLE IF NOT EXISTS "horario_laboral_usuario" (
    "usuario_id"      UUID NOT NULL,
    "dia_semana"      SMALLINT NOT NULL,
    "apertura_minuto" SMALLINT,
    "cierre_minuto"   SMALLINT,
    "created_at"      TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"      TIMESTAMPTZ NOT NULL,

    CONSTRAINT "horario_laboral_usuario_pkey" PRIMARY KEY ("usuario_id", "dia_semana"),
    CONSTRAINT "horario_laboral_usuario_dia_semana_check"
      CHECK ("dia_semana" BETWEEN 0 AND 6),
    CONSTRAINT "horario_laboral_usuario_ventana_check" CHECK (
      ("apertura_minuto" IS NULL AND "cierre_minuto" IS NULL) OR
      ("apertura_minuto" IS NOT NULL AND "cierre_minuto" IS NOT NULL
       AND "apertura_minuto" >= 0 AND "cierre_minuto" <= 1440
       AND "apertura_minuto" < "cierre_minuto")
    )
);
