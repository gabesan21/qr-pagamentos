import type { ReactNode } from "react";

type StatusProps = {
  children: ReactNode;
  label: string;
  tone: "success" | "warning" | "danger";
};

export function Status({ children, label, tone }: Readonly<StatusProps>) {
  return <p className={`status status--${tone}`}><strong>{label}</strong><span>{children}</span></p>;
}
