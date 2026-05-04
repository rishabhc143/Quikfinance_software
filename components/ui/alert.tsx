import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const alertVariants = cva(
  "relative w-full rounded-lg border p-3 text-sm [&>svg]:absolute [&>svg]:left-3 [&>svg]:top-3 [&>svg+div]:translate-y-[-2px] [&:has(svg)]:pl-9",
  {
    variants: {
      variant: {
        default: "bg-background text-foreground",
        info: "bg-blue-50 border-blue-200 text-blue-800 dark:bg-blue-950/40 dark:border-blue-900 dark:text-blue-200",
        warning: "bg-amber-50 border-amber-200 text-amber-800 dark:bg-amber-950/40 dark:border-amber-900 dark:text-amber-200",
        destructive: "border-destructive/50 text-destructive bg-destructive/5 dark:border-destructive [&>svg]:text-destructive",
      },
    },
    defaultVariants: { variant: "default" },
  }
);

export const Alert = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof alertVariants>>(
  ({ className, variant, ...props }, ref) => (
    <div ref={ref} role="alert" className={cn(alertVariants({ variant }), className)} {...props} />
  )
);
Alert.displayName = "Alert";

export const AlertTitle = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h5 ref={ref as never} className={cn("mb-1 font-medium leading-none tracking-tight", className)} {...props} />
  )
);
AlertTitle.displayName = "AlertTitle";

export const AlertDescription = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("text-sm [&_p]:leading-relaxed", className)} {...props} />
  )
);
AlertDescription.displayName = "AlertDescription";
