import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-sky-primary focus:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-sky-primary text-white hover:bg-sky-primary/80",
        secondary:
          "border-transparent bg-sky-surface-elevated text-sky-text-primary hover:bg-sky-surface-elevated/80",
        ai: "border-transparent bg-sky-ai/10 text-sky-ai hover:bg-sky-ai/20",
        destructive:
          "border-transparent bg-sky-danger text-white hover:bg-sky-danger/80",
        outline: "text-sky-text-primary border-sky-border",
        success: "border-transparent bg-sky-success text-white hover:bg-sky-success/80",
        warning: "border-transparent bg-sky-warning text-white hover:bg-sky-warning/80",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
