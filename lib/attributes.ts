import { z } from "zod";

export type AttributeType = "text" | "number" | "select" | "multiselect" | "boolean";

export interface AttributeFieldDefinition {
  key: string;
  type: AttributeType;
  required?: boolean;
  filterable?: boolean;
  comparable?: boolean;
  min?: number;
  max?: number;
  unit?: string;
  options?: string[];
}

export interface AttributeSchema {
  fields: AttributeFieldDefinition[];
}

/**
 * Builds a strict Zod validator for attribute JSON based on category schema (§6).
 * Form, server actions, and AI validation use this single builder (A1).
 * Supports: text, number (min/max/unit), select, multiselect, boolean (A2).
 * Strips unknown fields automatically (A6).
 */
export function buildAttributeZod(schema: AttributeSchema) {
  const shape: Record<string, z.ZodTypeAny> = {};

  for (const field of schema.fields || []) {
    let fieldValidator: z.ZodTypeAny;

    switch (field.type) {
      case "text": {
        if (field.required) {
          fieldValidator = z
            .string({ required_error: "Required" })
            .trim()
            .min(1, { message: "Required" });
        } else {
          fieldValidator = z
            .string()
            .trim()
            .optional()
            .or(z.literal(""))
            .transform((v) => (v === "" ? undefined : v));
        }
        break;
      }

      case "number": {
        let num = z.number({ invalid_type_error: "Must be a number", required_error: "Required" });
        if (field.min !== undefined) {
          num = num.min(field.min, { message: `Must be at least ${field.min}` });
        }
        if (field.max !== undefined) {
          num = num.max(field.max, { message: `Must be at most ${field.max}` });
        }

        if (field.required) {
          fieldValidator = z.preprocess((val) => {
            if (val === "" || val === null || val === undefined) return undefined;
            const parsed = Number(val);
            return Number.isNaN(parsed) ? val : parsed;
          }, num);
        } else {
          fieldValidator = z.preprocess((val) => {
            if (val === "" || val === null || val === undefined) return undefined;
            const parsed = Number(val);
            return Number.isNaN(parsed) ? val : parsed;
          }, num.optional());
        }
        break;
      }

      case "select": {
        const allowed = field.options || [];
        if (allowed.length === 0) {
          fieldValidator = z.string().optional();
        } else {
          const enumSchema = z.enum(allowed as [string, ...string[]], {
            errorMap: () => ({ message: "Invalid option selected" }),
          });
          if (field.required) {
            fieldValidator = enumSchema;
          } else {
            fieldValidator = enumSchema
              .optional()
              .or(z.literal(""))
              .transform((v) => (v === "" ? undefined : v));
          }
        }
        break;
      }

      case "multiselect": {
        const allowed = new Set(field.options || []);
        const itemSchema = z.string().refine((val) => allowed.has(val), {
          message: "Invalid option in selection",
        });
        const arraySchema = z.array(itemSchema);

        if (field.required) {
          fieldValidator = arraySchema.min(1, { message: "At least one selection required" });
        } else {
          fieldValidator = arraySchema.optional().default([]);
        }
        break;
      }

      case "boolean": {
        const boolSchema = z.boolean({ invalid_type_error: "Must be true or false" });
        if (field.required) {
          fieldValidator = z.preprocess((val) => {
            if (val === "true" || val === true) return true;
            if (val === "false" || val === false) return false;
            return val;
          }, boolSchema);
        } else {
          fieldValidator = z.preprocess((val) => {
            if (val === "true" || val === true) return true;
            if (val === "false" || val === false) return false;
            if (val === "" || val === null || val === undefined) return undefined;
            return val;
          }, boolSchema.optional());
        }
        break;
      }

      default:
        fieldValidator = z.any();
    }

    shape[field.key] = fieldValidator;
  }

  // Unknown fields are cleanly discarded (A6)
  return z.object(shape).strip();
}

/**
 * Validates listing input attributes, ensuring description is provided for "other".
 */
export function validateListingAttributes(
  categorySlug: string,
  schema: AttributeSchema,
  attributes: Record<string, any>,
  description?: string | null
) {
  if (categorySlug === "other") {
    if (!description || description.trim().length === 0) {
      throw new Error("Description is required for category 'other'");
    }
    return {};
  }

  const validator = buildAttributeZod(schema);
  return validator.parse(attributes);
}
