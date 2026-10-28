"use client";

import React, { useState } from "react";
import { Sparkles, ThumbsUp, ThumbsDown, AlertCircle } from "lucide-react";
import { T } from "@/components/ui/T";

interface AiChipProps {
  interactionId?: string;
  showFeedback?: boolean;
}

export function AiChip({ interactionId, showFeedback = false }: AiChipProps) {
  const [rated, setRated] = useState<number | null>(null);
  const [reported, setReported] = useState(false);

  const handleRate = async (rating: number) => {
    setRated(rating);
    if (!interactionId) return;
    try {
      await fetch(`/api/ai/rate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ interactionId, rating }),
      });
    } catch (err) {
      // Non-blocking
    }
  };

  const handleReport = async () => {
    setReported(true);
    if (!interactionId) return;
    try {
      await fetch(`/api/reports`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetType: "AI_OUTPUT",
          targetId: interactionId,
          reason: "WRONG_AI_OUTPUT",
        }),
      });
    } catch (err) {
      // Non-blocking
    }
  };

  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-primary/10 text-primary text-[11px] font-bold tracking-wider">
        <Sparkles className="w-2.5 h-2.5" />
        <T k="rfq.aiChip" />
      </span>

      {showFeedback && (
        <span className="inline-flex items-center gap-1 text-xs text-gray-500">
          <button
            type="button"
            onClick={() => handleRate(1)}
            className={`p-1 rounded hover:bg-gray-100 ${rated === 1 ? "text-primary font-bold" : ""}`}
            title="Good AI suggestion"
            aria-label="Good AI suggestion"
          >
            <ThumbsUp className="w-3 h-3" />
          </button>
          <button
            type="button"
            onClick={() => handleRate(-1)}
            className={`p-1 rounded hover:bg-gray-100 ${rated === -1 ? "text-red-500 font-bold" : ""}`}
            title="Poor AI suggestion"
            aria-label="Poor AI suggestion"
          >
            <ThumbsDown className="w-3 h-3" />
          </button>
          <button
            type="button"
            onClick={handleReport}
            disabled={reported}
            className="text-[11px] text-gray-400 hover:text-red-500 underline ml-1"
          >
            {reported ? (
              <span className="text-green-600"><T k="quote.reported" /></span>
            ) : (
              <T k="quote.reportWrongAi" />
            )}
          </button>
        </span>
      )}
    </span>
  );
}
