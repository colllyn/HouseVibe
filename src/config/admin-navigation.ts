// Owner: integration-engineer
// 各 Agent 通过 handoff 请求修改此文件

export interface AdminNavItem {
  label: string;
  href: string;
  icon: string;          // Lucide icon name
  requiredFeature?: string;
  order: number;
  owner: string;
}

export const adminNavigation: AdminNavItem[] = [
  {
    label: '用户管理',
    href: '/admin/users',
    icon: 'Users',
    order: 1,
    owner: 'data-security-engineer',
  },
  {
    label: '功能授权',
    href: '/admin/feature-entitlements',
    icon: 'ShieldCheck',
    order: 2,
    owner: 'data-security-engineer',
  },
  {
    label: '邀请管理',
    href: '/admin/invites',
    icon: 'UserPlus',
    order: 3,
    owner: 'data-security-engineer',
  },
  {
    label: '合规词库',
    href: '/admin/compliance',
    icon: 'ShieldCheck',
    order: 4,
    owner: 'ai-deepseek-engineer',
  },
  {
    label: 'AI 用量',
    href: '/admin/ai-usage',
    icon: 'BarChart3',
    order: 5,
    owner: 'ai-deepseek-engineer',
  },
  {
    label: 'AI 模型',
    href: '/admin/ai-models',
    icon: 'Cpu',
    order: 6,
    owner: 'ai-deepseek-engineer',
  },
];
