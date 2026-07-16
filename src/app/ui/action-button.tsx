import type { ButtonHTMLAttributes, ReactNode } from "react";

type ActionButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  loading?: boolean;
  tone?: "primary" | "secondary";
};

export function ActionButton({ children, className, loading = false, tone = "primary", disabled, ...props }: Readonly<ActionButtonProps>) {
  const classes = ["action-button", `action-button--${tone}`, className].filter(Boolean).join(" ");

  return (
    <button aria-busy={loading || undefined} className={classes} disabled={disabled || loading} {...props}>
      {children}
    </button>
  );
}
