import Link from "next/link";
import { cn } from "@/lib/cn";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

const styles: Record<ButtonVariant, string> = {
  primary: "bg-berry text-ivory hover:bg-berry-deep border border-transparent shadow-[0_1px_2px_rgba(48,35,51,0.12)]",
  secondary: "bg-card text-plum border border-line hover:border-plum-faint hover:bg-lavender-tint",
  ghost: "bg-transparent text-plum-soft hover:text-plum hover:bg-lavender-tint border border-transparent",
  danger: "bg-berry-tint text-berry hover:bg-berry hover:text-ivory border border-transparent",
};

/** 44px minimum touch target on every button. */
const base =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed select-none";

export function Button({ variant = "primary", className, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return <button className={cn(base, styles[variant], className)} {...props} />;
}

export function ButtonLink({
  variant = "primary",
  className,
  href,
  children,
}: {
  variant?: ButtonVariant;
  className?: string;
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link href={href} className={cn(base, styles[variant], className)}>
      {children}
    </Link>
  );
}
