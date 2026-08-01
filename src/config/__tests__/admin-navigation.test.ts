import { describe, it, expect } from "vitest";
import { adminNavigation, type AdminNavItem } from "@/config/admin-navigation";

describe("adminNavigation", () => {
  it("has at least 3 items", () => {
    expect(adminNavigation.length).toBeGreaterThanOrEqual(3);
  });

  it("each item has required fields", () => {
    for (const item of adminNavigation) {
      expect(item.label, `item ${item.href} has label`).toBeTruthy();
      expect(item.href, `item ${item.href} has href`).toMatch(/^\/admin\//);
      expect(item.icon, `item ${item.href} has icon`).toBeTruthy();
      expect(typeof item.order, `item ${item.href} has numeric order`).toBe(
        "number",
      );
      expect(item.owner, `item ${item.href} has owner`).toBeTruthy();
    }
  });

  it("items are in ascending order by order field", () => {
    for (let i = 1; i < adminNavigation.length; i++) {
      const current = adminNavigation[i];
      const previous = adminNavigation[i - 1];
      if (!current || !previous) continue;
      expect(
        current.order,
        `item at index ${i} (${current.href}) order > previous`,
      ).toBeGreaterThan(previous.order);
    }
  });

  it("all hrefs start with /admin/", () => {
    for (const item of adminNavigation) {
      expect(
        item.href.startsWith("/admin/"),
        `${item.href} should start with /admin/`,
      ).toBe(true);
    }
  });

  it("all items have unique order values", () => {
    const orders = adminNavigation.map((item) => item.order);
    const uniqueOrders = new Set(orders);
    expect(uniqueOrders.size).toBe(orders.length);
  });

  it("all items have unique hrefs", () => {
    const hrefs = adminNavigation.map((item) => item.href);
    const uniqueHrefs = new Set(hrefs);
    expect(uniqueHrefs.size).toBe(hrefs.length);
  });

  it("all items conform to AdminNavItem interface", () => {
    const validateAdminNavItem = (item: AdminNavItem): boolean => {
      return (
        typeof item.label === "string" &&
        typeof item.href === "string" &&
        typeof item.icon === "string" &&
        typeof item.order === "number" &&
        typeof item.owner === "string"
      );
    };

    for (const item of adminNavigation) {
      expect(validateAdminNavItem(item)).toBe(true);
    }
  });
});
