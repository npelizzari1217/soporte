"use client";

/**
 * EditarClienteDialog — edita datos comerciales de un cliente (nombre/razón
 * social/CUIT). dbName es INMUTABLE (identifica la DB física) — se muestra
 * deshabilitado. Exclusivo ROOT (el caller ya gatea por `isGlobalAdmin`; el
 * backend revalida vía `GlobalAdminGuard`). Mismo patrón que
 * `crear-cliente-dialog.tsx` (react-hook-form + zod).
 */
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Pencil } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useEditarCliente } from "../hooks/use-clientes-mutations";
import { editarClienteSchema, type EditarClienteFormValues } from "../schemas";
import type { Cliente } from "../types";

export interface EditarClienteDialogProps {
  cliente: Cliente;
}

const FIELDS: { name: keyof EditarClienteFormValues; label: string }[] = [
  { name: "nombre", label: "Nombre" },
  { name: "razonSocial", label: "Razón social (opcional)" },
  { name: "cuit", label: "CUIT (opcional)" },
];

export function EditarClienteDialog({ cliente }: EditarClienteDialogProps) {
  const [open, setOpen] = useState(false);
  const mutation = useEditarCliente();

  const defaultValues: EditarClienteFormValues = {
    nombre: cliente.nombre,
    razonSocial: cliente.razonSocial ?? "",
    cuit: cliente.cuit ?? "",
  };

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<EditarClienteFormValues>({
    resolver: zodResolver(editarClienteSchema),
    defaultValues,
  });

  function submit(values: EditarClienteFormValues) {
    mutation.mutate(
      {
        id: cliente.id,
        dto: {
          nombre: values.nombre,
          razonSocial: values.razonSocial || undefined,
          cuit: values.cuit || undefined,
        },
      },
      {
        onSuccess: () => setOpen(false),
      },
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        // Al reabrir, reseteá el form a los valores actuales del cliente.
        if (next) reset(defaultValues);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" aria-label={`Editar ${cliente.nombre}`}>
          <Pencil className="h-4 w-4" aria-hidden="true" />
          Editar
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar cliente</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(submit)} className="flex flex-col gap-3" noValidate>
          {FIELDS.map((field) => (
            <div key={field.name} className="flex flex-col gap-1">
              <label htmlFor={`editar-cliente-${field.name}`} className="text-sm font-medium text-foreground">
                {field.label}
              </label>
              <Input
                id={`editar-cliente-${field.name}`}
                error={!!errors[field.name]}
                {...register(field.name)}
              />
              {errors[field.name] && (
                <p role="alert" className="text-sm text-destructive">
                  {errors[field.name]?.message}
                </p>
              )}
            </div>
          ))}

          {/* dbName inmutable — se muestra deshabilitado para dar contexto. */}
          <div className="flex flex-col gap-1">
            <label htmlFor="editar-cliente-dbName" className="text-sm font-medium text-muted-foreground">
              Base de datos (no editable)
            </label>
            <Input id="editar-cliente-dbName" value={cliente.dbName} disabled readOnly />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="submit" isLoading={mutation.isPending}>
              Guardar
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
