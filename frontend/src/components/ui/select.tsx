import * as React from 'react'
import * as RadixSelect from '@radix-ui/react-select'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Select atom — wraps Radix Select with the project's visual language.
 *
 * Why Radix: click-outside, ESC, keyboard navigation, ARIA role=combobox +
 * role=listbox, and portal rendering are all handled by the primitive.
 * We only provide the visual layer.
 *
 * Why portal: Radix renders the dropdown content in document.body to avoid
 * overflow/stacking context issues inside flex/grid containers. Tests must
 * use `within(document.body)` to query the listbox.
 *
 * Radius breakdown (CONSTITUTION §3):
 *   Trigger  → rounded-xl (input-class, 12px)
 *   Content  → rounded-md (dropdown-class, 6px)
 *   Items    → rounded-sm (minimal, 2px)
 */

export interface SelectProps {
  value?: string
  onValueChange?: (value: string) => void
  options: { value: string; label: string }[]
  placeholder?: string
  disabled?: boolean
  className?: string
}

function Select({
  value,
  onValueChange,
  options,
  placeholder,
  disabled,
  className,
}: SelectProps) {
  return (
    <RadixSelect.Root
      value={value}
      onValueChange={onValueChange}
      disabled={disabled}
    >
      <RadixSelect.Trigger
        className={cn(
          'flex w-full items-center justify-between gap-2 ' +
          'rounded-xl border border-input bg-transparent px-3 py-2 text-sm ' +
          'ring-offset-background placeholder:text-muted-foreground ' +
          'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 ' +
          'disabled:cursor-not-allowed disabled:opacity-50 ' +
          'transition-colors',
          className
        )}
      >
        <RadixSelect.Value placeholder={placeholder} />
        <RadixSelect.Icon asChild>
          <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden />
        </RadixSelect.Icon>
      </RadixSelect.Trigger>

      <RadixSelect.Portal>
        <RadixSelect.Content
          className={
            'rounded-md border border-border bg-popover shadow-md z-50 ' +
            'overflow-hidden min-w-[8rem]'
          }
          position="popper"
          sideOffset={4}
        >
          <RadixSelect.Viewport className="p-1">
            {options.map((opt) => (
              <RadixSelect.Item
                key={opt.value}
                value={opt.value}
                className={
                  'rounded-sm px-3 py-1.5 text-sm cursor-pointer select-none ' +
                  'hover:bg-muted focus:bg-muted ' +
                  'focus:outline-none data-[highlighted]:bg-muted ' +
                  'flex items-center gap-2'
                }
              >
                <RadixSelect.ItemText>{opt.label}</RadixSelect.ItemText>
              </RadixSelect.Item>
            ))}
          </RadixSelect.Viewport>
        </RadixSelect.Content>
      </RadixSelect.Portal>
    </RadixSelect.Root>
  )
}
Select.displayName = 'Select'

export { Select }
