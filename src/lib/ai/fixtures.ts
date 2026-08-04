// ============================================================
// AI Output Fixtures — shared between prompts & tests
// Owner: ai-deepseek-engineer
// Purpose: Single source of truth for valid JSON examples.
//   Prompt builders reference these to construct example outputs.
//   Unit tests validate these fixtures pass their Zod schemas.
//   This prevents prompt↔schema drift.
// ============================================================

// --- parsePropertySearch valid example ---

export const SEARCH_FILTER_FIXTURE = {
  districts: ["天河区"],
  monthlyRentMax: 3500,
  bedrooms: 1,
  petsAllowed: true,
  sortBy: "updated_at",
  sortOrder: "desc" as const,
  parsedQuery: "预算3500以内，天河区，一房，允许养宠物",
  unrecognizedTerms: [] as string[],
};

// Minimal valid example — model must return this shape even for vague input
export const SEARCH_FILTER_MINIMAL_FIXTURE = {
  parsedQuery: "广州租房",
  unrecognizedTerms: [] as string[],
};

// --- xiaohongshu valid example ---

export const XIAOHONGSHU_FIXTURE = {
  platform: "xiaohongshu" as const,
  titleOptions: ["温馨一房 | 天河核心地段"],
  coverText: "温馨一房等你来",
  hook: "想要在天河区找到温馨的家吗？",
  body: "这是一套位于天河区的精装修一房，月租3500元，有电梯，可养猫，拎包入住。",
  imageSequence: [
    {
      order: 1,
      description: "客厅全景，展示采光和空间布局",
      suggestedMediaType: "photo",
    },
    {
      order: 2,
      description: "卧室特写，展示床品和衣柜",
      suggestedMediaType: "photo",
    },
  ],
  imageCaptions: ["宽敞明亮的客厅", "温馨舒适的卧室"],
  factualSummary: "房源位于天河区XX花园，精装修一房一厅，月租3500元，押二付一，有电梯，可养猫",
  interactionQuestion: "你最看重租房的哪一点呢？",
  privateMessageKeyword: "温馨一房",
  hashtags: ["#广州租房", "#天河租房", "#精装修"],
  factsUsed: [
    { field: "district", value: "天河区" },
    { field: "monthlyRent", value: "3500" },
    { field: "bedrooms", value: "1" },
  ],
  visualFactsUsed: [],
  missingInformation: ["depositTerms"],
  riskFlags: [],
  complianceFlags: [],
  requiresFactReview: false,
};

// --- douyin valid example ---

export const DOUYIN_FIXTURE = {
  platform: "douyin" as const,
  hookOptions: ["天河区3500精装修一房，你心动了吗？"],
  coverText: "天河一房 | 3500/月",
  fullVoiceover: "今天带大家看一套天河区的精装修一房，月租只要3500...",
  shots: [
    {
      order: 1,
      durationSeconds: 3,
      description: "小区外景",
      visualSuggestion: "拍摄小区大门和周边环境",
    },
    {
      order: 2,
      durationSeconds: 5,
      description: "客厅展示",
      visualSuggestion: "从左到右摇镜展示客厅全貌",
    },
  ],
  subtitles: "天河区精装修一房 | 月租3500",
  caption: "天河区精装修一房一厅，月租3500，有电梯可养猫，感兴趣私信我！",
  commentCta: "想看房的评论区扣1",
  privateMessageKeyword: "天河一房",
  hashtags: ["#广州租房", "#天河租房"],
  missingShots: ["厨房", "卫生间"],
  factsUsed: [
    { field: "district", value: "天河区" },
    { field: "monthlyRent", value: "3500" },
  ],
  visualFactsUsed: [],
  missingInformation: ["depositTerms"],
  riskFlags: [],
  complianceFlags: [],
  requiresFactReview: false,
};

// --- wechat_moments valid example ---

export const WECHAT_MOMENTS_FIXTURE = {
  platform: "wechat_moments" as const,
  copyOptions: ["天河区精装修一房，月租3500，有电梯可养猫，随时看房！"],
  nineGridSuggestion: "1-3张客厅，4-6张卧室，7-9张小区环境",
  shortCta: "私信我获取更多房源信息",
  privateMessageKeyword: "天河一房",
  factsUsed: [
    { field: "district", value: "天河区" },
    { field: "monthlyRent", value: "3500" },
  ],
  visualFactsUsed: [],
  riskFlags: [],
  complianceFlags: [],
  requiresFactReview: false,
};
