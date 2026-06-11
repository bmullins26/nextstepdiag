import logoAsset from "@/assets/nextstep-logo.asset.json";

type BrandLogoProps = {
  className?: string;
  /** Convenience: sets both width and height (square box, image fits inside). */
  size?: number;
  /** Explicit width in px. Overrides `size`. */
  width?: number;
  /** Explicit height in px. Overrides `size`. */
  height?: number;
};

export function BrandLogo({ className = "", size = 96, width, height }: BrandLogoProps) {
  const w = width ?? size;
  const h = height ?? size;
  return (
    <img
      src={logoAsset.url}
      alt="NextStep Diagnostics — A technician in your pocket"
      width={w}
      height={h}
      className={className}
      style={{ width: w, height: h, objectFit: "contain" }}
    />
  );
}