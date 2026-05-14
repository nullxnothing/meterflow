import { cva, type VariantProps } from "class-variance-authority";
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/utils";

const baseButtonClasses = [
  "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap",
  "rounded-md text-sm font-semibold leading-none outline-none",
  "transition-[background,border-color,color,box-shadow,transform] duration-200 ease-out",
  "focus-visible:ring-2 focus-visible:ring-primary/35",
  "disabled:pointer-events-none disabled:opacity-50",
  "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
].join(" ");

export const buttonVariants = cva(baseButtonClasses, {
  variants: {
    variant: {
      default:
        "border border-border-strong bg-primary text-primary-foreground shadow-primary hover:-translate-y-0.5 hover:bg-primary/90",
      primary:
        "border border-border-strong bg-primary text-primary-foreground shadow-primary hover:-translate-y-0.5 hover:bg-primary/90",
      secondary:
        "border border-border bg-panel-elevated/60 text-foreground shadow-card hover:-translate-y-0.5 hover:border-border-strong hover:bg-panel-elevated",
      outline:
        "border border-border bg-transparent text-foreground hover:-translate-y-0.5 hover:border-border-strong hover:bg-muted/60",
      ghost: "border border-transparent text-muted-foreground hover:bg-muted/45 hover:text-foreground",
      link: "h-auto border-0 p-0 text-primary underline-offset-4 hover:text-accent-2 hover:underline",
    },
    size: {
      default: "h-11 px-5",
      sm: "h-9 rounded-sm px-3 text-xs",
      lg: "h-12 px-6 text-base",
      icon: "size-10 p-0",
    },
  },
  defaultVariants: {
    variant: "default",
    size: "default",
  },
});

type ButtonVariantProps = VariantProps<typeof buttonVariants>;

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  ButtonVariantProps & {
    children: ReactNode;
  };

export function Button({ className, variant, size, children, ...props }: ButtonProps) {
  return (
    <button className={cn(buttonVariants({ variant, size }), className)} {...props}>
      {children}
    </button>
  );
}

type ButtonLinkProps = AnchorHTMLAttributes<HTMLAnchorElement> &
  ButtonVariantProps & {
    href: string;
    children: ReactNode;
  };

export function ButtonLink({ className, variant, size, children, ...props }: ButtonLinkProps) {
  return (
    <a className={cn(buttonVariants({ variant, size }), className)} {...props}>
      {children}
    </a>
  );
}
