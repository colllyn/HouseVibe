import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { VisualSummarySection } from "../visual-summary-section";
import type { VisualFactFlag } from "../visual-summary-section";

describe("VisualSummarySection", () => {
  const sampleSummary = "房源图片显示精装修，客厅宽敞明亮。";

  const sampleFlags: VisualFactFlag[] = [
    {
      field: "decoration",
      label: "装修情况",
      verdict: "confirmed_visual_support",
      detail: "图片中可见精装修，地板和墙面状况良好",
    },
    {
      field: "appliances",
      label: "家电配置",
      verdict: "possible_conflict",
      detail: "描述中提到有洗碗机，但图片中未见到",
    },
    {
      field: "orientation",
      label: "朝向",
      verdict: "insufficient_evidence",
      detail: "无法从图片判断房屋朝向",
    },
    {
      field: "pets",
      label: "宠物",
      verdict: "not_verified_by_images",
      detail: "图片中未发现宠物痕迹",
    },
  ];

  it("renders nothing when both visualSummary and flags are null/empty", () => {
    const { container } = render(
      <VisualSummarySection visualSummary={null} visualFactFlags={null} />
    );
    expect(container.innerHTML).toBe("");
  });

  it("renders nothing when visualSummary is null and flags is empty array", () => {
    const { container } = render(
      <VisualSummarySection visualSummary={null} visualFactFlags={[]} />
    );
    expect(container.innerHTML).toBe("");
  });

  it("renders visual summary text", () => {
    render(
      <VisualSummarySection visualSummary={sampleSummary} visualFactFlags={null} />
    );
    expect(screen.getByText("AI 图片分析")).toBeDefined();
    expect(screen.getByText("视觉摘要")).toBeDefined();
    expect(screen.getByText(sampleSummary)).toBeDefined();
  });

  it("renders fact flags section", () => {
    render(
      <VisualSummarySection visualSummary={null} visualFactFlags={sampleFlags} />
    );
    expect(screen.getByText("AI 图片分析")).toBeDefined();
    expect(screen.getByText("事实交叉校验")).toBeDefined();
    expect(screen.getByText("视觉摘要尚未生成")).toBeDefined();
  });

  it("renders both summary and flags together", () => {
    render(
      <VisualSummarySection visualSummary={sampleSummary} visualFactFlags={sampleFlags} />
    );
    expect(screen.getByText("视觉摘要")).toBeDefined();
    expect(screen.getByText("事实交叉校验")).toBeDefined();
    expect(screen.getByText(sampleSummary)).toBeDefined();
  });

  it("shows correct verdict labels for each flag type", () => {
    render(
      <VisualSummarySection visualSummary={null} visualFactFlags={sampleFlags} />
    );
    expect(screen.getByText("图片已验证")).toBeDefined();
    expect(screen.getByText("疑似冲突")).toBeDefined();
    expect(screen.getByText("证据不足")).toBeDefined();
    expect(screen.getByText("图片未验证")).toBeDefined();
  });

  it("shows flag field labels", () => {
    render(
      <VisualSummarySection visualSummary={null} visualFactFlags={sampleFlags} />
    );
    expect(screen.getByText("装修情况")).toBeDefined();
    expect(screen.getByText("家电配置")).toBeDefined();
    expect(screen.getByText("朝向")).toBeDefined();
    expect(screen.getByText("宠物")).toBeDefined();
  });

  it("shows flag detail text when provided", () => {
    render(
      <VisualSummarySection visualSummary={null} visualFactFlags={sampleFlags} />
    );
    expect(screen.getByText("图片中可见精装修，地板和墙面状况良好")).toBeDefined();
    expect(screen.getByText("描述中提到有洗碗机，但图片中未见到")).toBeDefined();
  });

  it("renders unknown verdict with insufficient_evidence fallback", () => {
    const unknownFlag: VisualFactFlag[] = [
      { field: "unknown", label: "未知", verdict: "not_verified_by_images" },
    ];
    render(
      <VisualSummarySection visualSummary={null} visualFactFlags={unknownFlag} />
    );
    expect(screen.getByText("图片未验证")).toBeDefined();
  });
});
