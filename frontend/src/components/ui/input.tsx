import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * Input atom — form input styled per constitution §3 (`rounded-xl`).
 *
 * `error` triggers both the destructive visual ring AND `aria-invalid`, so
 * screen readers announce the validation error state, not just sighted users.
 */
const inputVariants = cva(
  "flex w-full rounded-xl border border-input bg-transparent px-3 py-2 text-sm ring-offset-background " +
    "placeholder:text-muted-foreground " +
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 " +
    "disabled:cursor-not-allowed disabled:opacity-50 " +
    "transition-colors",
  {
    variants: {
      error: {
        true: "border-destructive focus-visible:ring-destructive/30",
        false: "",
      },
    },
    defaultVariants: {
      error: false,
    },
  },
);

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement>,
    Omit<VariantProps<typeof inputVariants>, "error"> {
  /** When true, applies the destructive ring AND sets aria-invalid="true". */
  error?: boolean;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, error = false, ...props }, ref) => {
    return (
      <input
        className={cn(inputVariants({ error, className }))}
        aria-invalid={error || undefined}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input, inputVariants };
