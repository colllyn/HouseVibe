import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  usePathname: vi.fn(() => "/"),
}));

import { MobileBottomNav } from "@/components/layout/mobile-bottom-nav";
import { DesktopSidebar } from "@/components/layout/desktop-sidebar";

function getAllHrefs(container: HTMLElement): string[] {
  const anchors = container.querySelectorAll("a");
  return Array.from(anchors).map((a) => a.getAttribute("href")).filter(Boolean) as string[];
}

describe("MobileBottomNav", () => {
  function renderNav() {
    const { container } = render(<MobileBottomNav />);
    return container;
  }

  describe("disabled items", () => {
    const disabledLabels = []; // Phase 2: 客户 is now enabled, all items active

    it.each(disabledLabels)("%s item has aria-disabled=\"true\"", (label) => {
      render(<MobileBottomNav />);
      const el = screen.getByText(label);
      const disabledContainer = el.closest('[aria-disabled="true"]');
      expect(disabledContainer).not.toBeNull();
    });

    it.each(disabledLabels)("%s is rendered as <span> not <a>", (label) => {
      render(<MobileBottomNav />);
      const el = screen.getByText(label);
      const disabledContainer = el.closest('[aria-disabled="true"]');
      expect(disabledContainer).not.toBeNull();
      expect((disabledContainer as HTMLElement).tagName).toBe("SPAN");
    });

    it("all disabled items display 即将开放 badge", () => {
      render(<MobileBottomNav />);
      const badges = screen.queryAllByText("即将开放");
      expect(badges.length).toBe(0); // Phase 2: 客户 enabled, no disabled items
    });
  });

  describe("enabled items", () => {
    it.each(["首页", "房源", "我的"])("%s is a <Link> component (renders as <a>)", (label) => {
      renderNav();
      const el = screen.getByText(label);
      const anchor = el.closest("a");
      expect(anchor).not.toBeNull();
    });

    it.each(["首页", "房源", "我的"])("%s does NOT have aria-disabled", (label) => {
      render(<MobileBottomNav />);
      const el = screen.getByText(label);
      const disabledAncestor = el.closest('[aria-disabled="true"]');
      expect(disabledAncestor).toBeNull();
    });
  });

  describe("navigation integrity", () => {
    it("no nav element uses href=\"#\"", () => {
      const container = renderNav();
      const hrefs = getAllHrefs(container);
      expect(hrefs).not.toContain("#");
    });

    it("disabled items are NOT links (no link role)", () => {
      render(<MobileBottomNav />);
      const links = screen.getAllByRole("link");
      expect(links.length).toBe(4); // Phase 2: 首页, 房源, 客户, 我的
      const linkTexts = links.map((l) => l.textContent);
      expect(linkTexts.some((t) => t?.includes("首页"))).toBe(true);
      expect(linkTexts.some((t) => t?.includes("房源"))).toBe(true);
      expect(linkTexts.some((t) => t?.includes("客户"))).toBe(true);
      expect(linkTexts.some((t) => t?.includes("我的"))).toBe(true);
    });
  });
});

describe("DesktopSidebar", () => {
  function renderSidebar() {
    const { container } = render(<DesktopSidebar />);
    return container;
  }

  describe("disabled items", () => {
    const disabledLabels = []; // Phase 2: 客户 is now enabled, all items active

    it.each(disabledLabels)("%s item has aria-disabled=\"true\"", (label) => {
      render(<DesktopSidebar />);
      const allMatching = screen.getAllByText(label);
      for (const el of allMatching) {
        const disabledContainer = el.closest('[aria-disabled="true"]');
        if (disabledContainer) {
          expect(disabledContainer).not.toBeNull();
          return;
        }
      }
      throw new Error(`No disabled container found for label: ${label}`);
    });

    it.each(disabledLabels)("%s is rendered as <span> not <a>", (label) => {
      render(<DesktopSidebar />);
      const allMatching = screen.getAllByText(label);
      let found = false;
      for (const el of allMatching) {
        const disabledContainer = el.closest('[aria-disabled="true"]');
        if (disabledContainer) {
          expect(disabledContainer.tagName).toBe("SPAN");
          found = true;
          break;
        }
      }
      expect(found).toBe(true);
    });

    it("all disabled items display 即将开放 badge", () => {
      render(<DesktopSidebar />);
      const badges = screen.queryAllByText("即将开放");
      expect(badges.length).toBe(0); // Phase 2: 客户 enabled, no disabled items
    });
  });

  describe("enabled items", () => {
    it.each(["工作台", "首页", "房源", "设置"])("%s is a <Link> component (renders as <a>)", (label) => {
      render(<DesktopSidebar />);
      const allMatching = screen.getAllByText(label);
      let found = false;
      for (const el of allMatching) {
        const anchor = el.closest("a");
        if (anchor) {
          expect(anchor).not.toBeNull();
          found = true;
          break;
        }
      }
      expect(found).toBe(true);
    });

    it.each(["工作台", "首页", "房源", "设置"])("%s does NOT have aria-disabled", (label) => {
      render(<DesktopSidebar />);
      const allMatching = screen.getAllByText(label);
      let checked = false;
      for (const el of allMatching) {
        const disabledAncestor = el.closest('[aria-disabled="true"]');
        const isLink = el.closest("a") !== null;
        if (isLink) {
          expect(disabledAncestor).toBeNull();
          checked = true;
          break;
        }
      }
      expect(checked).toBe(true);
    });
  });

  describe("navigation integrity", () => {
    it("no sidebar element uses href=\"#\"", () => {
      const container = renderSidebar();
      const hrefs = getAllHrefs(container);
      expect(hrefs).not.toContain("#");
    });

    it("disabled items are NOT links", () => {
      render(<DesktopSidebar />);
      const links = screen.getAllByRole("link");
      const linkTexts = links.map((l) => l.textContent);
      expect(linkTexts.some((t) => t?.includes("工作台"))).toBe(true);
      expect(linkTexts.some((t) => t?.includes("首页"))).toBe(true);
      expect(linkTexts.some((t) => t?.includes("房源"))).toBe(true); // Phase 2: enabled
      expect(linkTexts.some((t) => t?.includes("设置"))).toBe(true);
      expect(linkTexts.some((t) => t?.includes("客户"))).toBe(true);
    });
  });
});
