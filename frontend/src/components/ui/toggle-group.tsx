import * as React from "react";
import * as ToggleGroupPrimitive from "@radix-ui/react-toggle-group";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const toggleVariants = cva(
  "inline-flex items-center justify-center rounded-md border border-transparent bg-transparent px-3 py-1.5 text-body font-medium transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ringAccent focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=on]:bg-background-raised data-[state=on]:text-foreground data-[state=on]:shadow-card",
  {
    variants: {
      variant: {
        default: "text-muted-foreground",
        soft: "text-foreground/80 data-[state=on]:bg-primary/10 data-[state=on]:text-primary",
      },
      size: {
        default: "min-w-[2.25rem]",
        sm: "min-w-[2rem] text-body-xs",
        lg: "min-w-[2.75rem] text-body-lg",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

const ToggleGroup = ToggleGroupPrimitive.Root;

const ToggleGroupItem = ({
  className,
  variant,
  size,
  ...props
}: React.ComponentProps<typeof ToggleGroupPrimitive.Item> &
  VariantProps<typeof toggleVariants>) => (
  <ToggleGroupPrimitive.Item
    className={cn(toggleVariants({ variant, size }), className)}
    {...props}
  />
);

export { ToggleGroup, ToggleGroupItem };
