import type { ReactNode } from "react";

import { specimenBindingId } from "./coverage";

export function SpecimenBinding({ children, owner, state }: Readonly<{ children: ReactNode; owner: string; state: string }>) {
  return (
    <div
      className="min-w-0"
      data-specimen-owner={owner}
      data-specimen-state={state}
      id={specimenBindingId(owner, state)}
    >
      {children}
    </div>
  );
}
