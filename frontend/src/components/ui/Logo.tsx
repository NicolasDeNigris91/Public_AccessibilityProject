import type { CSSProperties } from "react";

type Variant = "mark" | "lockup" | "stacked";

interface LogoProps {
  variant?: Variant;
  size?: number;
  className?: string;
}

function Mark({ size, style }: { size: number; style?: CSSProperties }) {
  const stroke = Math.max(1.5, size * 0.06);
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      role="img"
      aria-label="Euthus"
      style={style}
    >
      <circle
        cx="20"
        cy="20"
        r={18 - stroke / 2}
        fill="none"
        stroke="currentColor"
        strokeWidth={stroke}
      />
      <line
        x1="2"
        y1="20"
        x2="38"
        y2="20"
        stroke="currentColor"
        strokeWidth={stroke}
        strokeLinecap="round"
      />
    </svg>
  );
}

export function Logo({ variant = "lockup", size = 28, className }: LogoProps) {
  if (variant === "mark") {
    return (
      <span className={className} style={{ color: "#B8532A", display: "inline-flex" }}>
        <Mark size={size} />
      </span>
    );
  }

  if (variant === "stacked") {
    return (
      <span
        className={className}
        style={{ display: "inline-flex", flexDirection: "column", alignItems: "center", gap: "0.5rem" }}
      >
        <span style={{ color: "#B8532A", display: "inline-flex" }}>
          <Mark size={size} />
        </span>
        <span className="font-serif" style={{ fontSize: size * 0.9, lineHeight: 1 }}>
          Euthus
        </span>
      </span>
    );
  }

  return (
    <span
      className={className}
      style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem" }}
    >
      <span style={{ color: "#B8532A", display: "inline-flex" }}>
        <Mark size={size} />
      </span>
      <span className="font-serif" style={{ fontSize: size * 0.95, lineHeight: 1, letterSpacing: "-0.01em" }}>
        Euthus
      </span>
    </span>
  );
}
