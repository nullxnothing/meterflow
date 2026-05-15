import { cva, type VariantProps } from "class-variance-authority";
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/utils";

const baseButtonClasses = [
  "mf-button",
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
      default: "mf-button--primary",
      primary: "mf-button--primary",
      secondary: "mf-button--secondary",
      outline: "mf-button--outline",
      ghost: "mf-button--ghost",
      link: "mf-button--link",
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
