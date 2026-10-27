import { describe, it, expect } from "vitest";
import {
  buildAttributeZod,
  validateListingAttributes,
  AttributeSchema,
} from "@/lib/attributes";

describe("Phase 2 - A. Attribute System (§6)", () => {
  const sampleSchema: AttributeSchema = {
    fields: [
      {
        key: "material",
        type: "select",
        required: true,
        filterable: true,
        comparable: true,
        options: ["paper", "kraft", "plastic_pp", "aluminium", "foam"],
      },
      {
        key: "capacity_ml",
        type: "number",
        required: true,
        min: 50,
        max: 5000,
        unit: "ml",
        filterable: true,
        comparable: true,
      },
      {
        key: "size",
        type: "text",
        required: false,
        comparable: true,
      },
      {
        key: "has_lid",
        type: "boolean",
        required: true,
        filterable: true,
        comparable: true,
      },
      {
        key: "certifications",
        type: "multiselect",
        required: false,
        options: ["iso", "fda", "halal", "eco"],
      },
      {
        key: "required_multi",
        type: "multiselect",
        required: true,
        options: ["opt_a", "opt_b"],
      },
    ],
  };

  it("A2 & A6: validates valid values for all attribute types", () => {
    const validator = buildAttributeZod(sampleSchema);
    const validData = {
      material: "kraft",
      capacity_ml: 500,
      size: "Large 10x10",
      has_lid: true,
      certifications: ["iso", "eco"],
      required_multi: ["opt_a"],
    };

    const parsed = validator.parse(validData);
    expect(parsed.material).toBe("kraft");
    expect(parsed.capacity_ml).toBe(500);
    expect(parsed.size).toBe("Large 10x10");
    expect(parsed.has_lid).toBe(true);
    expect(parsed.certifications).toEqual(["iso", "eco"]);
    expect(parsed.required_multi).toEqual(["opt_a"]);
  });

  it("A6: throws error when required fields are missing or empty", () => {
    const validator = buildAttributeZod(sampleSchema);

    // Missing material (required select)
    expect(() =>
      validator.parse({
        capacity_ml: 500,
        has_lid: true,
        required_multi: ["opt_a"],
      })
    ).toThrow();

    // Missing capacity_ml (required number)
    expect(() =>
      validator.parse({
        material: "kraft",
        has_lid: true,
        required_multi: ["opt_a"],
      })
    ).toThrow();

    // Missing has_lid (required boolean)
    expect(() =>
      validator.parse({
        material: "kraft",
        capacity_ml: 500,
        required_multi: ["opt_a"],
      })
    ).toThrow();

    // Empty array for required_multi
    expect(() =>
      validator.parse({
        material: "kraft",
        capacity_ml: 500,
        has_lid: true,
        required_multi: [],
      })
    ).toThrow();
  });

  it("A2 & A6: rejects invalid types and out-of-range/out-of-options values", () => {
    const validator = buildAttributeZod(sampleSchema);

    // Invalid select option
    expect(() =>
      validator.parse({
        material: "invalid_plastic_xyz",
        capacity_ml: 500,
        has_lid: true,
        required_multi: ["opt_a"],
      })
    ).toThrow();

    // Number below min (min: 50)
    expect(() =>
      validator.parse({
        material: "kraft",
        capacity_ml: 20,
        has_lid: true,
        required_multi: ["opt_a"],
      })
    ).toThrow();

    // Number above max (max: 5000)
    expect(() =>
      validator.parse({
        material: "kraft",
        capacity_ml: 9999,
        has_lid: true,
        required_multi: ["opt_a"],
      })
    ).toThrow();

    // Non-numeric string for number
    expect(() =>
      validator.parse({
        material: "kraft",
        capacity_ml: "not-a-number",
        has_lid: true,
        required_multi: ["opt_a"],
      })
    ).toThrow();

    // Invalid option in multiselect
    expect(() =>
      validator.parse({
        material: "kraft",
        capacity_ml: 500,
        has_lid: true,
        required_multi: ["opt_a"],
        certifications: ["invalid_cert"],
      })
    ).toThrow();
  });

  it("A6: strips unknown fields from attribute payload automatically", () => {
    const validator = buildAttributeZod(sampleSchema);

    const dataWithUnknown = {
      material: "paper",
      capacity_ml: 250,
      has_lid: false,
      required_multi: ["opt_b"],
      injectedDangerousField: "hack_attempt",
      arbitraryOtherKey: 12345,
    };

    const parsed = validator.parse(dataWithUnknown);
    expect(parsed.material).toBe("paper");
    expect(parsed.capacity_ml).toBe(250);
    expect(parsed.has_lid).toBe(false);
    expect(parsed.required_multi).toEqual(["opt_b"]);
    expect((parsed as any).injectedDangerousField).toBeUndefined();
    expect((parsed as any).arbitraryOtherKey).toBeUndefined();
  });

  it("A4: 'other' category enforces mandatory description and has no attributes", () => {
    const otherSchema: AttributeSchema = { fields: [] };

    // Fails without description
    expect(() =>
      validateListingAttributes("other", otherSchema, {}, "")
    ).toThrow("Description is required for category 'other'");

    expect(() =>
      validateListingAttributes("other", otherSchema, {}, "   ")
    ).toThrow("Description is required for category 'other'");

    // Passes with non-empty description
    const res = validateListingAttributes(
      "other",
      otherSchema,
      { ignoredExtra: "val" },
      "Custom wooden skewers description"
    );
    expect(res).toEqual({});
  });

  it("A5: schema field deletion does not throw error on existing data with removed fields", () => {
    // E.g. Previous data had "compartments", but current schema no longer includes it
    const updatedSchemaWithoutCompartments: AttributeSchema = {
      fields: [
        {
          key: "material",
          type: "select",
          required: true,
          options: ["paper", "kraft"],
        },
      ],
    };

    const previousRecordData = {
      material: "kraft",
      compartments: 3, // removed field
      legacyNote: "Special order", // removed field
    };

    const validator = buildAttributeZod(updatedSchemaWithoutCompartments);
    const parsed = validator.parse(previousRecordData);
    expect(parsed.material).toBe("kraft");
    // Removed fields do not cause parsing error and are cleanly stripped from schema validation
    expect((parsed as any).compartments).toBeUndefined();
  });
});
