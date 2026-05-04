import { copy } from "@/lib/copy";

interface ScoreDisplayProps {
  score: number;
}

function scoreTone(score: number) {
  if (score >= 90) return "text-severity-pass";
  if (score >= 70) return "text-severity-moderate";
  return "text-severity-critical";
}

export function ScoreDisplay({ score }: ScoreDisplayProps) {
  return (
    <div className="flex flex-col items-start gap-2">
      <span className="text-xs uppercase tracking-wider text-muted">{copy.report.scoreLabel}</span>
      <div className="flex items-baseline gap-2">
        <span className={`font-serif text-score ${scoreTone(score)}`}>{score}</span>
        <span className="font-serif text-2xl text-muted">/ 100</span>
      </div>
    </div>
  );
}
