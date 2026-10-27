/**
 * lib/ai/prompts/requestAssistant.v1.ts
 *
 * Prompt template and Zod schema for AI Request Assistant (F6, §8.4, §12).
 * Prompt Version: requestAssistant.v1
 */

import { z } from "zod";
import { PaymentTerm, Priority } from "@prisma/client";

export const PROMPT_VERSION = "requestAssistant.v1";

export const RequestAssistantOutputSchema = z.object({
  categorySlug: z.string().nullable(),
  title: z.string(),
  attributes: z.record(z.unknown()).default({}),
  quantity: z.number().nullable(),
  unit: z.string().nullable(),
  neededBy: z.string().nullable(), // ISO date string YYYY-MM-DD
  deliveryArea: z.string().nullable(),
  preferredPaymentTerm: z.nativeEnum(PaymentTerm).nullable(),
  priority: z.nativeEnum(Priority).nullable(),
  uncertainFields: z.array(z.string()).default([]),
  questions: z
    .array(
      z.object({
        field: z.string(),
        question: z.string(),
        options: z.array(z.string()).optional(),
      })
    )
    .default([]),
  notes: z.string().nullable().default(null),
});

export type RequestAssistantOutput = z.infer<typeof RequestAssistantOutputSchema>;

export interface RequestAssistantPromptInput {
  userText: string;
  activeCategories: Array<{
    slug: string;
    attributeSchema: any;
    defaultUnits: string[];
  }>;
  buyerBusinessArea?: string;
  todayDhaka: string; // YYYY-MM-DD
  uiLanguage: string; // "bn" | "en"
}

export function buildRequestAssistantPrompt(input: RequestAssistantPromptInput): string {
  const categorySchemasSummary = input.activeCategories.map((cat) => ({
    slug: cat.slug,
    units: cat.defaultUnits,
    attributes: Object.entries(cat.attributeSchema || {}).map(([key, def]: [string, any]) => ({
      key,
      type: def.type,
      options: def.options?.map((o: any) => o.value),
      unit: def.unit,
      min: def.min,
      max: def.max,
    })),
  }));

  return `
You are the BizNet AI Request Assistant for Bangladeshi B2B procurement.
Extract the structured procurement request from the buyer's text.

User UI Language: ${input.uiLanguage}
Today's Date in Asia/Dhaka: ${input.todayDhaka}
Buyer Business Area: ${input.buyerBusinessArea || "Unknown"}

Active Categories and Schemas:
${JSON.stringify(categorySchemasSummary, null, 2)}

Instructions:
1. Identify the most matching categorySlug from the active categories list. If no match, return null.
2. Formulate a clear, concise title (5-120 characters) in ${input.uiLanguage === "bn" ? "Bangla" : "English"}.
3. Extract attributes matching the category's attribute keys and allowed options/types.
4. Extract quantity and unit (prefer allowed category defaultUnits).
5. If relative dates are mentioned (e.g. "কাল", "আগামীকাল", "tomorrow", "৩ দিন পর", "in 2 days"), compute the exact ISO date (YYYY-MM-DD) based on todayDhaka (${input.todayDhaka}).
6. Extract deliveryArea if specified (or default to buyer business area if mentioned).
7. If any key attribute is ambiguous, missing, or uncertain:
   - add the attribute key to "uncertainFields"
   - add an entry to "questions" with a brief clarifying question and options chips.
8. Output MUST be valid JSON adhering strictly to the schema.
9. Do not invent fake data.

Buyer text:
"${input.userText}"
`.trim();
}
