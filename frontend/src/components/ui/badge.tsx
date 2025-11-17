import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-3 py-0.5 text-body-xs font-semibold uppercase tracking-wide transition-colors",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-muted text-muted-foreground hover:bg-muted/80",
        accent:
          "border-transparent bg-primary text-primary-foreground shadow shadow-card",
        neon: "border-transparent bg-trading-cyan/20 text-trading-cyan",
        success: "border-transparent bg-success/20 text-success-foreground",
        warning: "border-transparent bg-warning/15 text-warning",
        destructive:
          "border-transparent bg-destructive/15 text-destructive-foreground",
        outline: "text-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
