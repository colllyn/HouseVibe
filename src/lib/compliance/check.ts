/**
 * Content Compliance Check — Deterministic pre-publication scan.
 *
 * Owner: ai-deepseek-engineer
 * Contract: docs/contracts/api-contract.md §10.6
 *           docs/plans/implementation-plan.md P3-AI-010
 *
 * This module performs a pure, deterministic scan of generated marketing
 * content against frozen compliance rules. It does NOT call AI models,
 * network services, or databases. Rules are hardcoded to match the
 * compliance_terms table schema but do not read the table at runtime.
 *
 * Severity levels (per api-contract §10.6):
 *   blocked  → 200 with copyAllowed=false + complianceStatus="blocked", or 422 COMPLIANCE_BLOCKED
 *   review   → copyAllowed=false, complianceStatus="review", content returned for human review
 *   highlight → informational only; does not block copying
 */

// ============================================================
// Types
// ============================================================

export type ComplianceSeverity = "blocked" | "review" | "highlight";

export type ComplianceCategory =
  | "absolute_claim"
  | "investment_promise"
  | "education_policy"
  | "scarcity_urgency"
  | "price_qualification"
  | "discriminatory"
  | "contact_leak"
  | "address_leak"
  | "fact_conflict"
  | "illegal_content";

export interface ComplianceFlag {
  /** Stable machine-readable code. */
  code: string;
  /** Severity: blocked / review / highlight. */
  severity: ComplianceSeverity;
  /** Human-readable category label (Chinese). */
  category: string;
  /** The matched term or pattern that triggered the flag. */
  term: string;
  /** Suggested replacement text or action. */
  suggestion: string;
}

export type ComplianceStatus = "allowed" | "review" | "blocked";

export interface ComplianceResult {
  /** Overall status — derived from the highest-severity flag. */
  status: ComplianceStatus;
  /** Whether the content may be copied without modification. */
  copyAllowed: boolean;
  /** All flags found, ordered by severity (blocked first). */
  flags: readonly ComplianceFlag[];
}

// ============================================================
// Input
// ============================================================

export interface ComplianceInput {
  /** The full generated content text to scan. */
  contentText: string;
  /** Platform (affects which fields are scanned). */
  platform: "xiaohongshu" | "douyin" | "wechat_moments";
  /** Input property facts used for generation (for fact-conflict detection). */
  propertyFacts?: {
    district?: string;
    monthlyRent?: number;
    bedrooms?: number;
    areaSqm?: number;
    hasElevator?: boolean;
    petsAllowed?: boolean;
    cookingAllowed?: boolean;
    [key: string]: unknown;
  };
}

// ============================================================
// Rule Definitions
// ============================================================

interface ComplianceRule {
  code: string;
  severity: ComplianceSeverity;
  category: ComplianceCategory;
  /** Regex pattern to match violating text. */
  pattern: RegExp;
  /** Description of what triggers the rule. */
  description: string;
  /** Suggested action or replacement. */
  suggestion: string;
}

/**
 * Frozen compliance rules. Each rule maps to a compliance_terms row concept
 * but is hardcoded for determinism. Rules are ordered by severity.
 */
const RULES: readonly ComplianceRule[] = [
  // --- BLOCKED: Contact/identity leaks ---
  {
    code: "CONTACT_PHONE",
    severity: "blocked",
    category: "contact_leak",
    pattern: /1[3-9]\d{9}/,
    description: "内容包含手机号码",
    suggestion: "移除所有手机号码；联系方式不得出现在营销内容中",
  },
  {
    code: "CONTACT_WECHAT",
    severity: "blocked",
    category: "contact_leak",
    pattern: /(?:微信|微信号|[Ww]e[Cc]hat)[:：\s]*[a-zA-Z0-9_-]{5,}/g,
    description: "内容包含微信号",
    suggestion: "移除微信号；可通过私信口令替代直接联系方式",
  },
  {
    code: "CONTACT_EMAIL",
    severity: "blocked",
    category: "contact_leak",
    pattern: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/,
    description: "内容包含邮箱地址",
    suggestion: "移除邮箱地址",
  },
  {
    code: "ADDRESS_EXACT",
    severity: "blocked",
    category: "address_leak",
    pattern: /[一-鿿0-9]{1,6}?(?:栋|幢|号楼|单元|座)[一-鿿0-9-]{1,10}(?:单元|楼|层|室|号|房)/,
    description: "内容包含精确门牌地址",
    suggestion: "将精确地址替换为区域级位置（如'天河区体育西路附近'）",
  },
  {
    code: "ADDRESS_KEY",
    severity: "blocked",
    category: "address_leak",
    pattern: /(?:钥匙|key|门禁卡|密码锁密码|电子锁密码|门锁密码)/i,
    description: "内容包含钥匙或密码信息",
    suggestion: "移除所有钥匙位置、密码等安全信息",
  },
  {
    code: "ID_CARD_LEAK",
    severity: "blocked",
    category: "contact_leak",
    pattern: /\d{17}[\dXx]/,
    description: "内容包含身份证号码",
    suggestion: "移除身份证号码",
  },

  // --- BLOCKED: Discriminatory content ---
  {
    code: "DISCRIMINATORY",
    severity: "blocked",
    category: "discriminatory",
    pattern: /(?:不租给|谢绝|拒绝)\s*(?:外[地国省人]|黑[人龙]|某[省市区县]|单[身亲]|[老病残孕]|少数民族|[男女]士|[A-Za-z]+人)/,
    description: "内容包含歧视性租售条件",
    suggestion: "移除歧视性表述；租售条件不得针对受保护群体",
  },

  // --- BLOCKED: Illegal/dangerous ---
  {
    code: "ILLEGAL_CONTENT",
    severity: "blocked",
    category: "illegal_content",
    pattern: /(?:群租|隔断房|日租|短租|民宿|可按天|按日计费)(?!.*(?:酒店|公寓式))/,
    description: "内容可能涉及违规短租或群租",
    suggestion: "确认房源符合当地租赁法规；移除违规租赁方式描述",
  },

  // --- BLOCKED: Absolute investment promises ---
  {
    code: "INVESTMENT_GUARANTEE",
    severity: "blocked",
    category: "investment_promise",
    pattern: /(?:保证|绝对|一定|肯定|必然|稳[赚挣]|必[赚挣升涨]|只[赚挣]不[赔亏]|稳[定]?回报|保[底证]收[益入]|年[化收]益[率]?\s*(?:[1-9]\d*%|[1-9]\d*％|超过|高于))/,
    description: "内容包含投资回报保证",
    suggestion: "移除收益承诺；不得对租金回报、升值前景作出保证性描述",
  },
  {
    code: "ABSOLUTE_SUPERLATIVE",
    severity: "blocked",
    category: "absolute_claim",
    pattern: /(?:最好|最佳|第一|唯一|绝无仅有|独一无二|最[优低高]|顶级|极[致品]|首[选屈]|无与伦比|无可挑剔|完美无缺)/,
    description: "内容包含绝对化极限用语",
    suggestion: "将绝对化表述替换为客观描述（如'采光好'代替'采光最好'）",
  },

  // --- REVIEW: Education/policy claims ---
  {
    code: "EDUCATION_CLAIM",
    severity: "review",
    category: "education_policy",
    pattern: /(?:学区|学位|对口学校|重点学校|名校|入学|落户|积分|划片|派位|指标到校)/,
    description: "内容包含学区、学位或落户相关声明",
    suggestion: "学区/学位信息需人工核实；添加'具体学区以教育局当年公布为准'免责声明",
  },
  {
    code: "POLICY_CLAIM",
    severity: "review",
    category: "education_policy",
    pattern: /(?:公积金|贷款[成数]|首付|税费|契税|增值税|个人所得税|房产税|限购|购房资格|社保|个税)/,
    description: "内容包含贷款、税费或购房政策声明",
    suggestion: "贷款/税费/政策信息需人工核实；建议添加'具体以银行/税务部门为准'",
  },

  // --- REVIEW: Scarcity/urgency ---
  {
    code: "SCARCITY_URGENCY",
    severity: "review",
    category: "scarcity_urgency",
    pattern: /(?:仅[剩余]|最后|快[要]?没了|马上[就]?[没无]|抢[购手]|疯[抢狂]|手慢无|错过[就再]|限时|倒计时|即将[涨下]|马上[涨调]|不[买租]就[亏没])/,
    description: "内容包含稀缺紧迫性用语",
    suggestion: "将稀缺性表述替换为客观房源信息；如确为最后一套，需标注核实日期",
  },

  // --- REVIEW: Fact conflict ---
  {
    code: "FACT_CONFLICT",
    severity: "review",
    category: "fact_conflict",
    pattern: /.*/, // checked programmatically, not by regex
    description: "内容与输入房源事实存在冲突",
    suggestion: "标记为需要事实复核；修复文案使其与房源事实一致",
  },

  // --- HIGHLIGHT: Price qualification ---
  {
    code: "PRICE_QUALIFICATION",
    severity: "highlight",
    category: "price_qualification",
    pattern: /(?:性价比[超极高]|超[值低]?价|白菜价|跳楼价|亏本|血亏|骨折价|全网最低|全城最低|全市最低|史低|低至|仅需|只要)/,
    description: "内容包含价格资质/夸张促销用语",
    suggestion: "将价格资质用语替换为实际租金数字；避免夸张促销语言",
  },
];

// ============================================================
// Core Check Function
// ============================================================

/**
 * Scan generated content against frozen compliance rules.
 *
 * Pure function — no side effects, no AI, no network, no database.
 * Same input always produces the same output.
 *
 * @param input — generated content text + platform + optional property facts
 * @returns ComplianceResult with status, copyAllowed, and flags
 */
export function checkCompliance(input: ComplianceInput): ComplianceResult {
  const flags: ComplianceFlag[] = [];
  const { contentText, propertyFacts } = input;

  // 1. Pattern-based rules
  for (const rule of RULES) {
    // FACT_CONFLICT is handled separately below
    if (rule.code === "FACT_CONFLICT") continue;

    // Reset lastIndex for global regexes
    rule.pattern.lastIndex = 0;

    const match = rule.pattern.test(contentText);
    if (match) {
      flags.push({
        code: rule.code,
        severity: rule.severity,
        category: rule.description,
        term: rule.code, // stable code, not the matched text
        suggestion: rule.suggestion,
      });
    }
  }

  // 2. Fact conflict detection (programmatic)
  if (propertyFacts) {
    const factConflicts = detectFactConflicts(contentText, propertyFacts);
    if (factConflicts.length > 0) {
      flags.push({
        code: "FACT_CONFLICT",
        severity: "review",
        category: "内容与输入房源事实存在冲突",
        term: "FACT_CONFLICT",
        suggestion: factConflicts.join("；"),
      });
    }
  }

  // 3. Derive status from highest severity flag
  let status: ComplianceStatus = "allowed";
  for (const flag of flags) {
    if (flag.severity === "blocked") {
      status = "blocked";
      break;
    }
    if (flag.severity === "review") {
      status = "review";
      // keep scanning — a blocked flag later would override
    }
  }

  // 4. copyAllowed: false if any blocked or review flags exist
  const hasBlockOrReview = flags.some(
    (f) => f.severity === "blocked" || f.severity === "review"
  );
  const copyAllowed = !hasBlockOrReview;

  // Sort: blocked first, then review, then highlight
  flags.sort((a, b) => {
    const order: Record<ComplianceSeverity, number> = {
      blocked: 0,
      review: 1,
      highlight: 2,
    };
    return order[a.severity] - order[b.severity];
  });

  return { status, copyAllowed, flags };
}

// ============================================================
// Fact Conflict Detection
// ============================================================

/**
 * Compare generated content claims against known property facts.
 * Returns human-readable conflict descriptions, or empty array if none.
 */
function detectFactConflicts(
  contentText: string,
  facts: ComplianceInput["propertyFacts"]
): string[] {
  if (!facts) return [];
  const conflicts: string[] = [];

  // District check
  if (facts.district && contentText.includes(facts.district) === false) {
    // Only flag if content mentions a different district
    const districtPattern = /(?:天河区|越秀区|海珠区|荔湾区|白云区|番禺区|黄埔区|南沙区|花都区|增城区|从化区|福田区|南山区|罗湖区|宝安区|龙岗区|龙华区|坪山区|光明区|朝阳区|海淀区|东城区|西城区|丰台区|通州区)/g;
    const contentDistricts = contentText.match(districtPattern);
    if (contentDistricts && contentDistricts.some((d) => d !== facts.district)) {
      conflicts.push(
        `文案中的区域（${contentDistricts.filter((d) => d !== facts.district).join("、")}）与房源所在区域（${facts.district}）不一致`
      );
    }
  }

  // Rent check
  const actualRent = facts.monthlyRent;
  if (actualRent != null) {
    const rentMatches = contentText.match(/(\d{3,5})\s*元?[/每]月/g);
    if (rentMatches) {
      for (const m of rentMatches) {
        const num = parseInt(m.replace(/[^0-9]/g, ""), 10);
        if (Math.abs(num - actualRent) > 200) {
          conflicts.push(
            `文案中的租金（${num}元）与房源实际租金（${facts.monthlyRent}元）差异较大`
          );
          break;
        }
      }
    }
  }

  // Bedroom check
  const bedroomCount = facts.bedrooms;
  if (bedroomCount != null) {
    const bedMatch = contentText.match(/(\d)\s*[房室]/);
    if (bedMatch && bedMatch[1]) {
      const bedNum = parseInt(bedMatch[1], 10);
      if (bedNum !== bedroomCount) {
        conflicts.push(
          `文案中的户型（${bedNum}房）与房源实际户型（${bedroomCount}房）不一致`
        );
      }
    }
  }

  // Elevator check
  if (facts.hasElevator === true && /没有?电梯|无电梯|步[梯行]/.test(contentText)) {
    conflicts.push("文案称'无电梯'，但房源实际有电梯");
  }
  if (facts.hasElevator === false && /有电梯|带电梯|电梯房/.test(contentText)) {
    conflicts.push("文案称'有电梯'，但房源实际无电梯");
  }

  // Pet check
  if (facts.petsAllowed === true && /不[允能]养|禁[止养]|谢绝宠物|不可养/.test(contentText)) {
    conflicts.push("文案称'不可养宠物'，但房源实际允许养宠物");
  }
  if (facts.petsAllowed === false && /可[以]养|能养|允许[养]|宠物友好/.test(contentText)) {
    conflicts.push("文案称'可养宠物'，但房源实际不允许养宠物");
  }

  return conflicts;
}

// ============================================================
// Helpers
// ============================================================

/**
 * Map internal ComplianceStatus to the §10.6 response complianceStatus field.
 */
export function toResponseStatus(status: ComplianceStatus): string {
  switch (status) {
    case "allowed":
      return "clean";
    case "review":
      return "review";
    case "blocked":
      return "blocked";
  }
}

