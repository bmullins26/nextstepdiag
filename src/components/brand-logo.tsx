import logoAsset from "@/assets/nextstep-logo.asset.json";

export function BrandLogo({ className = "", size = 96 }: { className?: string; size?: number }) {
  return (
    <img
      src={logoAsset.url}
      alt="NextStep Diagnostics"
      width={size}
      height={size}
      className={className}
      style={{ width: size, height: size, objectFit: "contain" }}
    />
  );
}