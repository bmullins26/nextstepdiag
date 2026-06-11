import fullLogoAsset from "@/assets/nextstep-logo.asset.json";
import pocketLogoAsset from "@/assets/nextstep-pocket.asset.json";

type BrandLogoProps = {
  className?: string;
  /** Convenience: sets both width and height (square box, image fits inside). */
  size?: number;
  /** Explicit width in px. Overrides `size`. */
  width?: number;
  /** Explicit height in px. Overrides `size`. */
  height?: number;
  /** Which official variant to render. `full` = wordmark + tagline, `pocket` = mark only. */
  variant?: "full" | "pocket";
};

export function BrandLogo({
  className = "",
  size = 96,
  width,
  height,
  variant = "full",
}: BrandLogoProps) {
  const w = width ?? size;
  const h = height ?? size;
  const asset = variant === "pocket" ? pocketLogoAsset : fullLogoAsset;
  const alt =
    variant === "pocket"
      ? "NextStep Diagnostics"
      : "NextStep Diagnostics — A technician in your pocket";
  return (
    <img
      src={asset.url}
      alt={alt}
      width={w}
      height={h}
      className={className}
      style={{ width: w, height: h, objectFit: "contain" }}
    />
  );
}