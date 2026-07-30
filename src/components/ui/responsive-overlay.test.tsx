import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// ---------------------------------------------------------------------------
// Mock useIsMobile before the component module is imported.
// The vi.mock call is hoisted above all imports by vitest, so the mock
// function must be created inside vi.hoisted to avoid reference errors.
// ---------------------------------------------------------------------------

const { mockUseIsMobile } = vi.hoisted(() => ({
  mockUseIsMobile: vi.fn<() => boolean>(),
}));

vi.mock("@/hooks/use-responsive", () => ({
  useIsMobile: mockUseIsMobile,
}));

import { ResponsiveOverlay } from "@/components/ui/responsive-overlay";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ResponsiveOverlay", () => {
  beforeEach(() => {
    mockUseIsMobile.mockReset();
  });

  // -------------------------------------------------------------------
  // Mobile path (Drawer)
  // -------------------------------------------------------------------

  describe("mobile (Drawer)", () => {
    beforeEach(() => {
      mockUseIsMobile.mockReturnValue(true);
    });

    it("renders Drawer content when isMobile is true", () => {
      render(
        <ResponsiveOverlay open={true} onOpenChange={() => {}}>
          <p>移动端内容</p>
        </ResponsiveOverlay>
      );

      // Children should appear in the DOM
      expect(screen.getByText("移动端内容")).toBeInTheDocument();
    });

    it("renders title inside Drawer when provided", () => {
      render(
        <ResponsiveOverlay
          open={true}
          onOpenChange={() => {}}
          title="筛选条件"
        >
          <p>内容</p>
        </ResponsiveOverlay>
      );

      expect(screen.getByText("筛选条件")).toBeInTheDocument();
    });

    it("renders description inside Drawer when provided", () => {
      render(
        <ResponsiveOverlay
          open={true}
          onOpenChange={() => {}}
          description="请选择筛选条件"
        >
          <p>内容</p>
        </ResponsiveOverlay>
      );

      expect(screen.getByText("请选择筛选条件")).toBeInTheDocument();
    });

    it("renders footer inside Drawer when provided", () => {
      render(
        <ResponsiveOverlay
          open={true}
          onOpenChange={() => {}}
          footer={<button type="button">确认</button>}
        >
          <p>内容</p>
        </ResponsiveOverlay>
      );

      expect(screen.getByRole("button", { name: "确认" })).toBeInTheDocument();
    });

    it("calls onOpenChange when Drawer close is triggered", async () => {
      const onOpenChange = vi.fn();
      const user = userEvent.setup();

      render(
        <ResponsiveOverlay open={true} onOpenChange={onOpenChange}>
          <p>内容</p>
        </ResponsiveOverlay>
      );

      // Vaul Drawer renders a close button (sr-only "关闭")
      // The Drawer component from vaul includes a close button in the overlay.
      // We look for it and click.
      const closeButton = screen.queryByRole("button", { name: "关闭" });
      if (closeButton) {
        await user.click(closeButton);
      }

      // onOpenChange might be called by the overlay/close interaction
      // or it may fire when Escape is pressed.
      // We verify the component renders without error; Escape key is a
      // reliable way to trigger the controlled close.
      await user.keyboard("{Escape}");

      // Either the close button or Escape should trigger onOpenChange
      expect(onOpenChange).toHaveBeenCalled();
    });

    it("renders children content inside Drawer", () => {
      render(
        <ResponsiveOverlay open={true} onOpenChange={() => {}}>
          <div data-testid="child-div">
            <span>子元素</span>
          </div>
        </ResponsiveOverlay>
      );

      expect(screen.getByTestId("child-div")).toBeInTheDocument();
      expect(screen.getByText("子元素")).toBeInTheDocument();
    });

    it("does not render content when open is false (mobile)", () => {
      render(
        <ResponsiveOverlay open={false} onOpenChange={() => {}}>
          <p>不应该渲染的内容</p>
        </ResponsiveOverlay>
      );

      // When the Drawer is closed, Vaul does not render the portal content.
      expect(screen.queryByText("不应该渲染的内容")).not.toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------
  // Desktop path (Dialog)
  // -------------------------------------------------------------------

  describe("desktop (Dialog)", () => {
    beforeEach(() => {
      mockUseIsMobile.mockReturnValue(false);
    });

    it("renders Dialog content when isMobile is false", () => {
      render(
        <ResponsiveOverlay open={true} onOpenChange={() => {}}>
          <p>桌面端内容</p>
        </ResponsiveOverlay>
      );

      // Radix Dialog renders into a Portal inside document.body.
      // @testing-library queries the full document, so we can find it.
      expect(screen.getByText("桌面端内容")).toBeInTheDocument();
    });

    it("renders title inside Dialog when provided", () => {
      render(
        <ResponsiveOverlay
          open={true}
          onOpenChange={() => {}}
          title="详情编辑"
        >
          <p>内容</p>
        </ResponsiveOverlay>
      );

      expect(screen.getByText("详情编辑")).toBeInTheDocument();
    });

    it("renders description inside Dialog when provided", () => {
      render(
        <ResponsiveOverlay
          open={true}
          onOpenChange={() => {}}
          description="修改房源的基本信息"
        >
          <p>内容</p>
        </ResponsiveOverlay>
      );

      expect(screen.getByText("修改房源的基本信息")).toBeInTheDocument();
    });

    it("renders footer inside Dialog when provided", () => {
      render(
        <ResponsiveOverlay
          open={true}
          onOpenChange={() => {}}
          footer={<button type="button">保存</button>}
        >
          <p>内容</p>
        </ResponsiveOverlay>
      );

      expect(screen.getByRole("button", { name: "保存" })).toBeInTheDocument();
    });

    it("calls onOpenChange when Dialog close button is clicked", async () => {
      const onOpenChange = vi.fn();
      const user = userEvent.setup();

      render(
        <ResponsiveOverlay open={true} onOpenChange={onOpenChange}>
          <p>内容</p>
        </ResponsiveOverlay>
      );

      // The Dialog's X close button has an accessible name "关闭"
      const closeButton = screen.getByRole("button", { name: "关闭" });
      await user.click(closeButton);

      expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    it("renders children content inside Dialog", () => {
      render(
        <ResponsiveOverlay open={true} onOpenChange={() => {}}>
          <div data-testid="desktop-child">
            <span>桌面端子元素</span>
          </div>
        </ResponsiveOverlay>
      );

      expect(screen.getByTestId("desktop-child")).toBeInTheDocument();
      expect(screen.getByText("桌面端子元素")).toBeInTheDocument();
    });

    it("does not render content when open is false (desktop)", () => {
      render(
        <ResponsiveOverlay open={false} onOpenChange={() => {}}>
          <p>不应该渲染的内容</p>
        </ResponsiveOverlay>
      );

      expect(screen.queryByText("不应该渲染的内容")).not.toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------
  // Edge cases
  // -------------------------------------------------------------------

  describe("edge cases", () => {
    it("renders without title and description gracefully", () => {
      mockUseIsMobile.mockReturnValue(false);

      render(
        <ResponsiveOverlay open={true} onOpenChange={() => {}}>
          <p>无标题内容</p>
        </ResponsiveOverlay>
      );

      expect(screen.getByText("无标题内容")).toBeInTheDocument();
      // The component renders an sr-only fallback title
      expect(screen.getByText("对话框")).toBeInTheDocument();
    });

    it("renders without footer gracefully", () => {
      mockUseIsMobile.mockReturnValue(true);

      render(
        <ResponsiveOverlay open={true} onOpenChange={() => {}}>
          <p>无页脚内容</p>
        </ResponsiveOverlay>
      );

      expect(screen.getByText("无页脚内容")).toBeInTheDocument();
      // No footer element should be present
      // Vaul's DrawerFooter is a div, but when no footer prop is passed
      // nothing renders with that role.
    });
  });
});
