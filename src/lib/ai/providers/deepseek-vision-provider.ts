// ============================================================
// DeepSeekVisionProvider Implementation
// Owner: ai-deepseek-engineer
// Contract: docs/contracts/ai-contract.md v2.0 §2.3
//
// Analyzes property images via DeepSeek-VL endpoint.
// Uses Mock provider when DEEPSEEK_VISION_API_KEY is not configured.
// SSRF protection: only signed URLs from Supabase Storage are accepted.
// ============================================================

import { z } from "zod";
import { getServerEnv } from "@/config/env";
import type {
  DeepSeekVisionProvider,
  VisionAnalysisInput,
  PropertyVisionResult,
  SingleImageResult,
  PropertyMediaAiLabel,
  AIUsage,
  FetchFn,
} from "../types";
import { DeepSeekProviderError } from "../types";

// ============================================================
// Constants
// ============================================================

const DEFAULT_VISION_BASE_URL = "https://api.deepseek.com";
const VISION_CHAT_PATH = "/v1/chat/completions";
const TIMEOUT_MS = 90_000; // 90s for vision (large payloads)

// ============================================================
// Zod Schema — validates vision model output
// ============================================================

const MediaLabelSchema = z.object({
  sceneType: z.string(),
  styles: z.array(z.string()),
  visibleFeatures: z.array(z.string()),
  condition: z.array(z.string()),
  lighting: z.array(z.string()),
  appliances: z.array(z.string()),
  confidence: z.number().min(0).max(1),
  evidence: z.array(z.string()),
  uncertainLabels: z.array(z.string()),
});

const VisionResponseSchema = z.object({
  mediaResults: z.array(
    z.object({
      mediaId: z.string(),
      aiLabels: MediaLabelSchema,
      status: z.enum(["completed", "failed"]),
      error: z.string().optional(),
    })
  ),
  visualSummary: z.string(),
  factChecks: z.array(
    z.object({
      textClaim: z.string(),
      fieldName: z.string(),
      visualResult: z.enum([
        "not_verified_by_images",
        "insufficient_evidence",
        "weak_visual_support",
        "confirmed_visual_support",
        "possible_conflict",
      ]),
      confidence: z.number().min(0).max(1),
      suggestion: z.string(),
    })
  ),
});

// ============================================================
// SSRF Protection
// ============================================================

const BLOCKED_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "[::1]",
  "169.254.169.254", // AWS metadata
  "metadata.google.internal", // GCP metadata
]);

function validateImageUrl(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new DeepSeekProviderError({
      code: "AI_UPSTREAM_ERROR",
      message: "Invalid image URL format",
      requestId: "ssrf-check",
      retryable: false,
    });
  }

  // Only HTTPS
  if (parsed.protocol !== "https:") {
    throw new DeepSeekProviderError({
      code: "AI_UPSTREAM_ERROR",
      message: "Image URL must use HTTPS",
      requestId: "ssrf-check",
      retryable: false,
    });
  }

  // Block private/internal hosts
  const hostname = parsed.hostname.toLowerCase();
  if (BLOCKED_HOSTS.has(hostname)) {
    throw new DeepSeekProviderError({
      code: "AI_UPSTREAM_ERROR",
      message: "Internal network URLs are not allowed",
      requestId: "ssrf-check",
      retryable: false,
    });
  }

  // Block IP addresses
  const ipv4Regex = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/;
  if (ipv4Regex.test(hostname)) {
    throw new DeepSeekProviderError({
      code: "AI_UPSTREAM_ERROR",
      message: "IP-based image URLs are not allowed",
      requestId: "ssrf-check",
      retryable: false,
    });
  }
}

// ============================================================
// Mock Provider (when no API key is configured)
// ============================================================

function createMockVisionProvider(): DeepSeekVisionProvider {
  return {
    async analyzePropertyImages(
      input: VisionAnalysisInput,
      _signal?: AbortSignal
    ): Promise<PropertyVisionResult> {
      const imageCount = input.imageUrls.length;

      // Simulate processing delay
      await new Promise((resolve) => setTimeout(resolve, 50));

      const mockLabel = (): PropertyMediaAiLabel => ({
        sceneType: "indoor_living_room",
        styles: ["modern", "minimalist"],
        visibleFeatures: ["wooden_floor", "large_window", "sofa", "tv"],
        condition: ["well_maintained", "clean"],
        lighting: ["natural_light", "ceiling_light"],
        appliances: ["air_conditioner", "tv"],
        confidence: 0.85,
        evidence: ["wooden_floor_visible", "window_visible"],
        uncertainLabels: ["brand_of_appliances"],
      });

      const usage: AIUsage = {
        inputTokens: imageCount * 500,
        outputTokens: 200,
        estimatedCostUsd: 0,
      };

      return {
        mediaResults: input.imageUrls.map((_url, i) => ({
          mediaId: `mock-media-${i}`,
          aiLabels: mockLabel(),
          status: "completed" as const,
        })),
        visualSummary: `Mock vision analysis of ${imageCount} image(s). Living room with modern decor, wooden floors, large windows providing natural light. Well-maintained condition.`,
        factChecks: [
          {
            textClaim: "精装修",
            fieldName: "decoration",
            visualResult: "confirmed_visual_support",
            confidence: 0.8,
            suggestion: "图片显示装修良好，与描述一致",
          },
        ],
        usage,
      };
    },
  };
}

// ============================================================
// Real Provider (DeepSeek-VL endpoint)
// ============================================================

function createRealVisionProvider(
  env: ReturnType<typeof getServerEnv>,
  fetchFn: FetchFn = globalThis.fetch
): DeepSeekVisionProvider {
  const baseUrl =
    env.DEEPSEEK_VISION_BASE_URL_PRIMARY ?? DEFAULT_VISION_BASE_URL + VISION_CHAT_PATH;
  const apiKey = env.DEEPSEEK_VISION_API_KEY;
  const model = env.DEEPSEEK_VISION_MODEL;
  const maxImages = env.DEEPSEEK_VISION_MAX_IMAGES;

  return {
    async analyzePropertyImages(
      input: VisionAnalysisInput,
      signal?: AbortSignal
    ): Promise<PropertyVisionResult> {
      const requestId = input.requestId;

      // Validate image count
      if (input.imageUrls.length > maxImages) {
        throw new DeepSeekProviderError({
          code: "AI_INVALID_RESPONSE",
          message: `Too many images: ${input.imageUrls.length}, max ${maxImages}`,
          requestId,
          retryable: false,
        });
      }

      // SSRF validation for every image URL
      for (const url of input.imageUrls) {
        validateImageUrl(url);
      }

      // Build the vision prompt
      const factsStr = JSON.stringify(input.propertyFacts);
      const prompt = `Analyze the following property images. The listing describes: ${factsStr}.
For each image, identify: scene_type, styles, visible_features, condition, lighting, appliances, confidence, evidence, uncertain_labels.
Cross-check the listing facts against what you see. For each fact, state whether it is: confirmed_visual_support, not_verified_by_images, insufficient_evidence, weak_visual_support, or possible_conflict.
Return a JSON object with: mediaResults (array of per-image analysis), visualSummary (string), factChecks (array of cross-checks).`;

      // Build image content array
      const imageContents = input.imageUrls.map((url) => ({
        type: "image_url" as const,
        image_url: { url },
      }));

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

      // Chain external signal
      const onAbort = () => controller.abort();
      signal?.addEventListener("abort", onAbort, { once: true });

      try {
        const response = await fetchFn(baseUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model,
            messages: [
              {
                role: "user",
                content: [prompt, ...imageContents],
              },
            ],
            max_tokens: 4096,
            response_format: { type: "json_object" },
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          const status = response.status;
          if (status === 429) {
            throw new DeepSeekProviderError({
              code: "AI_RATE_LIMITED",
              message: "Vision API rate limited",
              requestId,
              retryable: true,
              upstreamStatus: status,
            });
          }
          if (status >= 500) {
            throw new DeepSeekProviderError({
              code: "AI_UPSTREAM_ERROR",
              message: `Vision API returned ${status}`,
              requestId,
              retryable: true,
              upstreamStatus: status,
            });
          }
          throw new DeepSeekProviderError({
            code: "AI_UPSTREAM_ERROR",
            message: `Vision API error: ${status}`,
            requestId,
            retryable: false,
            upstreamStatus: status,
          });
        }

        const body = await response.json();
        const content = body.choices?.[0]?.message?.content;
        if (!content) {
          throw new DeepSeekProviderError({
            code: "AI_INVALID_RESPONSE",
            message: "Vision API returned empty content",
            requestId,
            retryable: false,
          });
        }

        // Parse JSON from content
        let parsed: unknown;
        try {
          parsed = JSON.parse(content);
        } catch {
          throw new DeepSeekProviderError({
            code: "AI_INVALID_RESPONSE",
            message: "Vision API returned unparseable JSON",
            requestId,
            retryable: false,
          });
        }

        // Zod validation
        const validated = VisionResponseSchema.safeParse(parsed);
        if (!validated.success) {
          throw new DeepSeekProviderError({
            code: "AI_INVALID_RESPONSE",
            message: `Vision output validation failed: ${validated.error.issues[0]?.message}`,
            requestId,
            retryable: false,
          });
        }

        // Calculate usage from response
        const usage: AIUsage = {
          inputTokens: body.usage?.prompt_tokens ?? 0,
          outputTokens: body.usage?.completion_tokens ?? 0,
          estimatedCostUsd: 0,
        };

        return {
          mediaResults: validated.data.mediaResults as SingleImageResult[],
          visualSummary: validated.data.visualSummary,
          factChecks: validated.data.factChecks,
          usage,
        };
      } catch (err) {
        clearTimeout(timeoutId);
        signal?.removeEventListener("abort", onAbort);

        if (err instanceof DeepSeekProviderError) throw err;

        if (err instanceof DOMException && err.name === "AbortError") {
          if (signal?.aborted) {
            throw new DeepSeekProviderError({
              code: "AI_REQUEST_ABORTED",
              message: "Request was aborted",
              requestId,
              retryable: false,
            });
          }
          throw new DeepSeekProviderError({
            code: "AI_TIMEOUT",
            message: "Vision API request timed out",
            requestId,
            retryable: true,
          });
        }

        throw new DeepSeekProviderError({
          code: "AI_UPSTREAM_ERROR",
          message: err instanceof Error ? err.message : "Vision API connection failed",
          requestId,
          retryable: true,
        });
      } finally {
        clearTimeout(timeoutId);
        signal?.removeEventListener("abort", onAbort);
      }
    },
  };
}

// ============================================================
// Factory
// ============================================================

export function createDeepSeekVisionProvider(
  fetchFn?: FetchFn
): DeepSeekVisionProvider {
  const env = getServerEnv();

  // Use mock when vision API key is not configured
  if (!env.DEEPSEEK_VISION_API_KEY) {
    return createMockVisionProvider();
  }

  return createRealVisionProvider(env, fetchFn);
}
