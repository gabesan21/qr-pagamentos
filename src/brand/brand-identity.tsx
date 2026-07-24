import type { SVGProps } from "react";

import { brandGeometry, type BrandIdentityId } from "./geometry";

type BrandIdentityProps = Readonly<{
  accessibleName?: string;
  className?: string;
  variant: BrandIdentityId;
}>;

function BrandMark({
  accessibleName,
  className,
  ...props
}: Readonly<{ accessibleName?: string }> & SVGProps<SVGSVGElement>) {
  const labelled = Boolean(accessibleName);

  return (
    <svg
      aria-hidden={labelled ? undefined : true}
      aria-label={accessibleName}
      className={className}
      data-brand-mark
      focusable="false"
      role={labelled ? "img" : undefined}
      viewBox={brandGeometry.viewBox}
      {...props}
    >
      {brandGeometry.rectangles.map((rectangle) => (
        <rect fill="currentColor" key={`${rectangle.x}-${rectangle.y}`} {...rectangle} />
      ))}
    </svg>
  );
}

export function BrandIdentity({ accessibleName, className, variant }: BrandIdentityProps) {
  const identityClassName = ["brand-identity", className].filter(Boolean).join(" ");

  if (variant === "mark-only") {
    return (
      <span className={identityClassName} data-brand-identity={variant}>
        <BrandMark accessibleName={accessibleName} className="brand-identity__mark" />
      </span>
    );
  }

  return (
    <span className={identityClassName} data-brand-identity={variant}>
      <BrandMark className="brand-identity__mark" />
      <span className="brand-identity__name">QR Pagamentos</span>
    </span>
  );
}
