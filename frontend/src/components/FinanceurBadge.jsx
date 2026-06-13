import React from "react";
import { FINANCEUR_STYLES } from "@/lib/constants";

export default function FinanceurBadge({ value, testid }) {
  const cls = FINANCEUR_STYLES[value] || "bg-slate-100 text-slate-700 border border-slate-200";
  return (
    <span
      data-testid={testid || `financeur-badge-${value}`}
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold ${cls}`}
    >
      {value}
    </span>
  );
}
