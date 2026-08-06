// ============================================================
// AI Correction Diff Unit Tests — P3-AI-012
// ============================================================

import { describe, it, expect } from "vitest";
import { computeFieldDiff, shouldRecordDiff } from "../diff";

describe("computeFieldDiff", () => {
  it("detects modified fields", () => {
    const diffs = computeFieldDiff(
      { title: "Original Title", bedrooms: 2 },
      { title: "Modified Title", bedrooms: 2 }
    );
    expect(diffs).toHaveLength(1);
    expect(diffs[0]?.field).toBe("title");
    expect(diffs[0]?.changeType).toBe("modified");
    expect(diffs[0]?.originalValue).toBe("Original Title");
    expect(diffs[0]?.confirmedValue).toBe("Modified Title");
  });

  it("detects added fields (user filled what AI missed)", () => {
    const diffs = computeFieldDiff(
      { title: "Test" },
      { title: "Test", areaSqm: 80 }
    );
    const added = diffs.find((d) => d.field === "areaSqm");
    expect(added?.changeType).toBe("added");
    expect(added?.confirmedValue).toBe(80);
  });

  it("detects removed fields", () => {
    const diffs = computeFieldDiff(
      { title: "Test", petsAllowed: true },
      { title: "Test" }
    );
    const removed = diffs.find((d) => d.field === "petsAllowed");
    expect(removed?.changeType).toBe("removed");
  });

  it("returns empty for identical data", () => {
    const diffs = computeFieldDiff(
      { title: "Same", city: "Beijing" },
      { title: "Same", city: "Beijing" }
    );
    expect(diffs).toHaveLength(0);
  });

  it("excludes owner phone from diff", () => {
    const diffs = computeFieldDiff(
      { title: "Test", ownerPhone: "13800138000" },
      { title: "Test", ownerPhone: "13900139000" }
    );
    const phone = diffs.find((d) => d.field === "ownerPhone");
    expect(phone).toBeUndefined();
  });

  it("excludes exact address from diff", () => {
    const diffs = computeFieldDiff(
      { title: "Test", exactAddress: "Room 101, Building 5" },
      { title: "Test", exactAddress: "Room 202" }
    );
    expect(diffs.find((d) => d.field === "exactAddress")).toBeUndefined();
  });

  it("excludes client phone from diff", () => {
    const diffs = computeFieldDiff(
      { budgetMin: 3000, clientPhone: "13800000000" },
      { budgetMin: 3500, clientPhone: "13900000000" }
    );
    const budget = diffs.find((d) => d.field === "budgetMin");
    expect(budget?.changeType).toBe("modified");
    expect(diffs.find((d) => d.field === "clientPhone")).toBeUndefined();
  });

  it("excludes key location from diff", () => {
    const diffs = computeFieldDiff(
      { title: "Test", keyLocation: "Under mat" },
      { title: "Test", keyLocation: "With security" }
    );
    expect(diffs.find((d) => d.field === "keyLocation")).toBeUndefined();
  });

  it("handles null vs undefined gracefully", () => {
    const diffs = computeFieldDiff(
      { title: "Test", floor: null },
      { title: "Test", floor: undefined }
    );
    expect(diffs).toHaveLength(0);
  });

  it("handles boolean changes", () => {
    const diffs = computeFieldDiff(
      { hasElevator: false },
      { hasElevator: true }
    );
    expect(diffs[0]?.changeType).toBe("modified");
    expect(diffs[0]?.originalValue).toBe(false);
    expect(diffs[0]?.confirmedValue).toBe(true);
  });

  it("handles array changes", () => {
    const diffs = computeFieldDiff(
      { facilities: ["fridge", "washer"] },
      { facilities: ["fridge", "washer", "ac"] }
    );
    expect(diffs[0]?.changeType).toBe("modified");
  });

  it("returns empty for empty objects", () => {
    expect(computeFieldDiff({}, {})).toHaveLength(0);
  });

  it("number comparison works (2 vs '2' is different)", () => {
    const diffs = computeFieldDiff(
      { monthlyRent: 3000 },
      { monthlyRent: 3500 }
    );
    expect(diffs[0]?.changeType).toBe("modified");
  });
});

describe("shouldRecordDiff", () => {
  it("returns true when requestId is present", () => {
    expect(shouldRecordDiff("req-123")).toBe(true);
  });

  it("returns false when requestId is null", () => {
    expect(shouldRecordDiff(null)).toBe(false);
  });

  it("returns false when requestId is undefined", () => {
    expect(shouldRecordDiff(undefined)).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(shouldRecordDiff("")).toBe(false);
  });
});
