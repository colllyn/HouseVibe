"use client";

// ============================================================
// New Content Project Page — P3-AI-021
// /content/new — Create content project: select property → platform → params
// ============================================================

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2 } from "lucide-react";
import { PLATFORM_LABELS } from "@/features/content-projects/schemas";

// ============================================================
// Types
// ============================================================

interface PropertyOption {
  id: string;
  title: string;
  community_name: string | null;
  city: string | null;
  district: string | null;
  allow_marketing_reuse: boolean;
}

interface FormState {
  submitting: boolean;
  error: string | null;
}

// ============================================================
// Page
// ============================================================

export default function NewContentPage() {
  const router = useRouter();
  const [properties, setProperties] = useState<PropertyOption[]>([]);
  const [propertiesLoading, setPropertiesLoading] = useState(true);
  const [propertiesError, setPropertiesError] = useState<string | null>(null);

  const [selectedProperty, setSelectedProperty] = useState<string>("");
  const [platform, setPlatform] = useState<string>("xiaohongshu");
  const [targetAudience, setTargetAudience] = useState("");
  const [contentAngle, setContentAngle] = useState("");
  const [contentGoal, setContentGoal] = useState("");
  const [tone, setTone] = useState("");
  const [form, setForm] = useState<FormState>({ submitting: false, error: null });
  const [created, setCreated] = useState<string | null>(null);

  // Fetch properties
  const fetchProperties = useCallback(async () => {
    setPropertiesLoading(true);
    setPropertiesError(null);
    try {
      const res = await fetch("/api/properties?limit=100");
      const json = await res.json();
      if (!res.ok || json.error) {
        setPropertiesError(json.error?.message ?? "加载房源失败");
        return;
      }
      const list = (json.data?.data ?? []) as PropertyOption[];
      setProperties(list.filter(p => p.allow_marketing_reuse));
    } catch {
      setPropertiesError("网络错误");
    } finally {
      setPropertiesLoading(false);
    }
  }, []);

  useEffect(() => { fetchProperties(); }, [fetchProperties]);

  // Submit
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProperty) return;

    setForm({ submitting: true, error: null });
    try {
      const body: Record<string, unknown> = {
        property_id: selectedProperty,
        platform,
      };
      if (targetAudience.trim()) body.target_audience = targetAudience.trim();
      if (contentAngle.trim()) body.content_angle = contentAngle.trim();
      if (contentGoal.trim()) body.content_goal = contentGoal.trim();
      if (tone.trim()) body.tone = tone.trim();

      const res = await fetch("/api/content/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();

      if (!res.ok) {
        setForm({ submitting: false, error: json.error?.message ?? "创建失败" });
        return;
      }

      setCreated(json.data.id);
      setTimeout(() => router.push(`/content/${json.data.id}`), 500);
    } catch {
      setForm({ submitting: false, error: "网络错误" });
    }
  };

  // Success state
  if (created) {
    return (
      <div className="p-4 sm:p-6">
        <h1 className="text-2xl font-bold">创建内容项目</h1>
        <div className="mt-6 rounded-lg border border-green-200 bg-green-50 p-6 text-center">
          <p className="text-sm text-green-700">项目创建成功！正在跳转...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.push("/content")}
          className="rounded-md p-1 hover:bg-muted"
          aria-label="返回"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="text-2xl font-bold">创建内容项目</h1>
      </div>

      {/* Error */}
      {form.error && (
        <div className="mt-4 rounded-md border border-destructive/30 bg-destructive/10 p-3">
          <p className="text-sm text-destructive">{form.error}</p>
        </div>
      )}

      {/* Form */}
      <form onSubmit={handleSubmit} className="mt-6 space-y-6 max-w-lg">
        {/* Property selector */}
        <div>
          <label className="text-sm font-medium" htmlFor="property">房源 <span className="text-destructive">*</span></label>
          {propertiesLoading ? (
            <div className="mt-1.5 h-10 animate-pulse rounded-md bg-muted" />
          ) : propertiesError ? (
            <div className="mt-1.5 rounded-md border border-destructive/20 p-2">
              <p className="text-xs text-destructive">{propertiesError}</p>
              <button type="button" onClick={fetchProperties} className="mt-1 text-xs text-primary">重试</button>
            </div>
          ) : properties.length === 0 ? (
            <div className="mt-1.5 rounded-md border border-dashed p-4 text-center">
              <p className="text-xs text-muted-foreground">没有可用的房源</p>
              <p className="mt-1 text-xs text-muted-foreground">
                需要先创建房源并开启&ldquo;营销复用&rdquo;授权
              </p>
            </div>
          ) : (
            <select
              id="property"
              value={selectedProperty}
              onChange={e => setSelectedProperty(e.target.value)}
              required
              className="mt-1.5 w-full rounded-md border px-3 py-2 text-sm"
            >
              <option value="">请选择房源</option>
              {properties.map(p => (
                <option key={p.id} value={p.id}>
                  {p.title} {p.community_name ? `· ${p.community_name}` : ""}
                  {p.district ? ` · ${p.district}` : ""}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Platform */}
        <div>
          <label className="text-sm font-medium" htmlFor="platform">目标平台 <span className="text-destructive">*</span></label>
          <select
            id="platform"
            value={platform}
            onChange={e => setPlatform(e.target.value)}
            required
            className="mt-1.5 w-full rounded-md border px-3 py-2 text-sm"
          >
            {Object.entries(PLATFORM_LABELS).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
        </div>

        {/* Target audience */}
        <div>
          <label className="text-sm font-medium" htmlFor="audience">目标客群</label>
          <input
            id="audience"
            type="text"
            value={targetAudience}
            onChange={e => setTargetAudience(e.target.value)}
            maxLength={200}
            placeholder="如：年轻白领、学生群体"
            className="mt-1.5 w-full rounded-md border px-3 py-2 text-sm"
          />
        </div>

        {/* Content angle */}
        <div>
          <label className="text-sm font-medium" htmlFor="angle">内容角度</label>
          <input
            id="angle"
            type="text"
            value={contentAngle}
            onChange={e => setContentAngle(e.target.value)}
            maxLength={200}
            placeholder="如：通勤便利、装修豪华"
            className="mt-1.5 w-full rounded-md border px-3 py-2 text-sm"
          />
        </div>

        {/* Content goal */}
        <div>
          <label className="text-sm font-medium" htmlFor="goal">内容目标</label>
          <input
            id="goal"
            type="text"
            value={contentGoal}
            onChange={e => setContentGoal(e.target.value)}
            maxLength={200}
            placeholder="如：吸引咨询、展示房源亮点"
            className="mt-1.5 w-full rounded-md border px-3 py-2 text-sm"
          />
        </div>

        {/* Tone */}
        <div>
          <label className="text-sm font-medium" htmlFor="tone">语气风格</label>
          <input
            id="tone"
            type="text"
            value={tone}
            onChange={e => setTone(e.target.value)}
            maxLength={100}
            placeholder="如：亲切随和、专业正式"
            className="mt-1.5 w-full rounded-md border px-3 py-2 text-sm"
          />
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={form.submitting || !selectedProperty}
          className="w-full rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {form.submitting ? (
            <span className="inline-flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              创建中...
            </span>
          ) : "创建项目"}
        </button>
      </form>
    </div>
  );
}
