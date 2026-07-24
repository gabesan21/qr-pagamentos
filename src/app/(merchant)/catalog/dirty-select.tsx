"use client";

import { useState, type ComponentProps } from "react";

import { NativeSelect } from "@/components/ui/native-select";

// Dirty-field omission: the control is unnamed until the merchant actually
// changes it, so an untouched optional field posts nothing and the stored
// value stays unchanged (absent = unchanged at the service boundary).
export function DirtySelect({
  fieldName,
  onChange,
  ...props
}: Readonly<{ fieldName: string } & Omit<ComponentProps<typeof NativeSelect>, "name">>) {
  const [dirty, setDirty] = useState(false);

  return (
    <NativeSelect
      {...props}
      name={dirty ? fieldName : undefined}
      onChange={(event) => {
        setDirty(true);
        onChange?.(event);
      }}
    />
  );
}
