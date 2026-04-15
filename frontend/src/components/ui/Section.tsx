import type { ReactNode } from "react";
import { Container } from "./Container";

interface SectionProps {
  children: ReactNode;
  as?: "section" | "header" | "footer" | "article";
  tone?: "default" | "muted" | "accent";
  className?: string;
  containerClassName?: string;
}

const TONES = {
  default: "",
  muted: "bg-surface",
  accent: "bg-brand/5",
} as const;

export function Section({
  children,
  as: Tag = "section",
  tone = "default",
  className = "",
  containerClassName = "",
}: SectionProps) {
  return (
    <Tag className={`py-18 ${TONES[tone]} ${className}`}>
      <Container className={containerClassName}>{children}</Container>
    </Tag>
  );
}
