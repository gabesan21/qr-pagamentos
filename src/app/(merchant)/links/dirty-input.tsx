"use client";

import { useState, type ComponentProps } from "react";

import { Input } from "@/components/ui/input";

// Dirty-field omission: the control is unnamed until the merchant actually
// changes it, so an untouched optional field posts nothing and the stored
// value stays unchanged (absent = unchanged at the service boundary). An
// explicit blank after a change posts the empty value, which clears the field.
export function DirtyInput({
  fieldName,
  onChange,
  ...props
}: Readonly<{ fieldName: string } & Omit<ComponentProps<typeof Input>, "name">>) {
  const [dirty, setDirty] = useState(false);

  return (
    <Input
      {...props}
      name={dirty ? fieldName : undefined}
      onChange={(event) => {
        setDirty(true);
        onChange?.(event);
      }}
    />
  );
}
