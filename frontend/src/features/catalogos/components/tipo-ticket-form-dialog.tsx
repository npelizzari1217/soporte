"use client";

/**
 * TipoTicketFormDialog — crear/editar un `TipoTicket` (T4.2). Modal genérico
 * (`components/ui/dialog.tsx`) + RHF/zod, mismo patrón que `KbArticuloForm`
 * pero en un `Dialog` (no página completa) — la tabla de tipos vive en una
 * sola pantalla con acciones inline, no una ruta por tipo.
 *
 * En el alta ofrece "Copiar permisos de" (S4, odd/tasks/permisos-por-tipo-ticket.md): un tipo nuevo
 * nace cerrado salvo que copie los permisos por usuario de otro tipo del mismo módulo.
 */
import { useState } from "react";
import { useForm, type DefaultValues } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { ReactNode } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useTiposTicket } from "@/features/tickets/hooks/use-catalogos";
import { useCrearTipoTicket, useEditarTipoTicket } from "../hooks/use-catalogo-mutations";
import { tipoTicketSchema, type TipoTicketFormValues } from "../schemas";
import { esTipoTicketDelSistema, MODULOS_CON_ALTA_DE_TIPO } from "../tipos-del-sistema";
import type { TipoTicket } from "@/features/tickets/types";

export interface TipoTicketFormDialogProps {
  trigger: ReactNode;
  tipo?: TipoTicket;
}

export function TipoTicketFormDialog({ trigger, tipo }: TipoTicketFormDialogProps) {
  const [open, setOpen] = useState(false);
  const isEdit = !!tipo;
  // El código de un tipo fijo del sistema no cambia (el backend responde 422).
  const codigoBloqueado = !!tipo && esTipoTicketDelSistema(tipo.codigo);
  const crearMutation = useCrearTipoTicket();
  const editarMutation = useEditarTipoTicket(tipo?.id ?? "");
  const mutation = isEdit ? editarMutation : crearMutation;
  // Misma consulta que la tabla de tipos: comparte la caché, no agrega un pedido por fila.
  const tiposQuery = useTiposTicket();

  // Recalculado en CADA render: el reset de apertura inyecta el dato vigente
  // aunque el diálogo lleve montado desde el primer pintado de la tabla.
  // El placeholder "" de `modulo` en la rama de alta es un módulo INVÁLIDO A
  // PROPÓSITO: el schema lo rechaza con "El módulo es requerido"
  // (catalogos/schemas.ts). Va explícito, y no ausente, porque si la clave
  // falta RHF adopta el valor actual del <select> en vez de limpiarlo — acá
  // es el único de los cuatro diálogos con un <Select> de valor no
  // controlado (D1b).
  // Un tipo que ya es de COMPRAS o EQUIPOS conserva su módulo como opción: sin ella el <select>
  // caería a otra y el guardado lo movería de módulo sin que nadie lo eligiera.
  const modulosOfrecidos =
    tipo && !MODULOS_CON_ALTA_DE_TIPO.includes(tipo.modulo)
      ? [...MODULOS_CON_ALTA_DE_TIPO, tipo.modulo]
      : MODULOS_CON_ALTA_DE_TIPO;

  const valoresVigentes: DefaultValues<TipoTicketFormValues> = tipo
    ? { codigo: tipo.codigo, nombre: tipo.nombre, modulo: tipo.modulo }
    : {
        codigo: "",
        nombre: "",
        modulo: "" as TipoTicketFormValues["modulo"],
        copiarPermisosDeTipoId: "",
      };

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<TipoTicketFormValues>({
    resolver: zodResolver(tipoTicketSchema),
    defaultValues: valoresVigentes,
  });

  // Los orígenes ofrecidos son los tipos del módulo elegido. El valor vigente se deriva de esa
  // lista: un id que ya no está en ella (cambio de módulo, catálogo cargando o tipo dado de baja
  // entre tanto) se muestra y se envía como "Ninguno", así la pantalla y el alta no divergen.
  const moduloElegido = watch("modulo");
  const origenesOfrecidos = (tiposQuery.data ?? []).filter(
    (t) => t.activo && t.modulo === moduloElegido,
  );
  const origenElegido = watch("copiarPermisosDeTipoId") ?? "";
  const origenVigente = origenesOfrecidos.some((t) => t.id === origenElegido) ? origenElegido : "";

  function submit({ codigo, nombre, modulo }: TipoTicketFormValues) {
    // El origen se toma de `origenVigente`, nunca del valor crudo del formulario.
    const values = { codigo, nombre, modulo };
    const alCerrar = {
      onSuccess: () => {
        setOpen(false);
      },
    };
    if (isEdit) {
      editarMutation.mutate(values, alCerrar);
      return;
    }
    crearMutation.mutate(
      origenVigente ? { ...values, copiarPermisosDeTipoId: origenVigente } : values,
      alCerrar,
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) reset(valoresVigentes);
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar tipo de ticket" : "Nuevo tipo de ticket"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(submit)} className="flex flex-col gap-4" noValidate>
          <div className="flex flex-col gap-1">
            <label htmlFor="tipo-codigo" className="text-sm font-medium text-foreground">
              Código
            </label>
            <Input
              id="tipo-codigo"
              error={!!errors.codigo}
              readOnly={codigoBloqueado}
              {...register("codigo")}
            />
            {errors.codigo && (
              <p role="alert" className="text-sm text-destructive">
                {errors.codigo.message}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="tipo-nombre" className="text-sm font-medium text-foreground">
              Nombre
            </label>
            <Input id="tipo-nombre" error={!!errors.nombre} {...register("nombre")} />
            {errors.nombre && (
              <p role="alert" className="text-sm text-destructive">
                {errors.nombre.message}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="tipo-modulo" className="text-sm font-medium text-foreground">
              Módulo
            </label>
            <Select
              id="tipo-modulo"
              error={!!errors.modulo}
              {...register("modulo", {
                // Un origen pertenece a un solo módulo: al cambiarlo, el elegido deja de valer.
                onChange: () => {
                  if (!isEdit) setValue("copiarPermisosDeTipoId", "");
                },
              })}
            >
              <option value="" disabled>
                Elegí un módulo
              </option>
              {modulosOfrecidos.map((modulo) => (
                <option key={modulo} value={modulo}>
                  {modulo}
                </option>
              ))}
            </Select>
            {errors.modulo && (
              <p role="alert" className="text-sm text-destructive">
                {errors.modulo.message}
              </p>
            )}
          </div>

          {!isEdit && (
            <div className="flex flex-col gap-1">
              <label htmlFor="tipo-copiar-permisos" className="text-sm font-medium text-foreground">
                Copiar permisos de
              </label>
              <Select
                id="tipo-copiar-permisos"
                aria-describedby="tipo-copiar-permisos-ayuda"
                value={origenVigente}
                onChange={(e) => setValue("copiarPermisosDeTipoId", e.target.value)}
              >
                <option value="">Ninguno (cerrado)</option>
                {origenesOfrecidos.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nombre}
                  </option>
                ))}
              </Select>
              <p id="tipo-copiar-permisos-ayuda" className="text-sm text-muted-foreground">
                El tipo nuevo nace cerrado: solo los administradores lo ven hasta que se asignen
                permisos. Al elegir un tipo, cada usuario recibe en el nuevo los mismos permisos que
                tiene en ese.
              </p>
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button type="submit" isLoading={mutation.isPending}>
              {isEdit ? "Guardar" : "Crear"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
