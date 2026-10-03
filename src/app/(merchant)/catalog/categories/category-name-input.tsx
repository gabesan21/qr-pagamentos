"use client";

import { Input } from "@/components/ui/input";

export function CategoryNameInput({
  id,
  name,
}: Readonly<{ id: string; name: "namePtBr" | "nameEn" }>) {
  return (
    <Input
      id={id}
      maxLength={320}
      name={name}
      onInput={(event) => {
        const input = event.currentTarget;
        if (input.value.length <= 160) return;
        const codePoints = Array.from(input.value);
        if (codePoints.length > 160) input.value = codePoints.slice(0, 160).join("");
      }}
      required
    />
  );
}
