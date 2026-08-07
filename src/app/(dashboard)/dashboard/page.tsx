import { Suspense } from "react";
import { getDashboardData } from "@/features/dashboard/actions";
import type { DashboardData } from "@/features/dashboard/schemas";
import {
  CalendarDays,
  Users,
  Building2,
  FileText,
  FileEdit,
  Plus,
  UserPlus,
  Share2,
  MessageSquare,
  AlertTriangle,
  TrendingUp,
  Clock,
  Sparkles,
  ChevronRight,
} from "lucide-react";
import Link from "next/link";

// ============================================================
// Today's Workbench — PRD §7.2 (今日工作台)
// Owner: property-crm-engineer
//
// Differentiated dashboard: all users see task/client/property stats.
// Content users also see content stats and quick-actions.
// ============================================================

function DashboardSkeleton() {
  return (
    <div className="p-4 space-y-6 max-w-4xl animate-pulse">
      <div className="h-8 bg-muted rounded w-24" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="rounded-lg border bg-card p-4 space-y-3">
            <div className="h-4 bg-muted rounded w-16" />
            <div className="h-8 bg-muted rounded w-12" />
            <div className="h-3 bg-muted rounded w-24" />
          </div>
        ))}
      </div>
    </div>
  );
}

function DashboardError() {
  return (
    <div className="p-4 max-w-4xl">
      <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-6 text-center">
        <AlertTriangle className="mx-auto h-8 w-8 text-destructive mb-2" />
        <p className="text-sm font-medium text-destructive">数据加载失败</p>
        <p className="text-xs text-muted-foreground mt-1">请检查网络后刷新重试</p>
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1 mt-3 text-sm text-primary hover:underline"
        >
          重新加载
        </Link>
      </div>
    </div>
  );
}

interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: number;
  subtitle?: string;
  href?: string;
  highlight?: boolean;
}

function StatCard({ icon, label, value, subtitle, href, highlight }: StatCardProps) {
  const content = (
    <div
      className={`rounded-lg border bg-card p-4 transition-colors ${
        href ? "hover:bg-accent/50 cursor-pointer" : ""
      } ${highlight ? "border-amber-500/50 bg-amber-50/30 dark:bg-amber-950/10" : ""}`}
    >
      <div className="flex items-center gap-2 text-muted-foreground mb-2">
        {icon}
        <span className="text-xs font-medium uppercase tracking-wide">{label}</span>
      </div>
      <div className={`text-2xl font-bold ${highlight ? "text-amber-600 dark:text-amber-400" : ""}`}>
        {value}
      </div>
      {subtitle && (
        <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
      )}
    </div>
  );

  if (href) {
    return <Link href={href}>{content}</Link>;
  }
  return content;
}

function QuickAction({ icon, label, href }: { icon: React.ReactNode; label: string; href: string }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-lg border p-3 min-h-[48px] hover:bg-accent/50 transition-colors active:scale-[0.98] touch-manipulation"
    >
      <span className="text-primary shrink-0">{icon}</span>
      <span className="text-sm font-medium flex-1">{label}</span>
      <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
    </Link>
  );
}

function QuickActions({ isContentUser }: { isContentUser: boolean }) {
  const actions = [
    { icon: <Plus className="h-5 w-5" />, label: "快速录房源", href: "/properties/new" },
    { icon: <UserPlus className="h-5 w-5" />, label: "新增客户", href: "/clients/new" },
    { icon: <MessageSquare className="h-5 w-5" />, label: "记录咨询", href: "/clients" },
    { icon: <Share2 className="h-5 w-5" />, label: "发布共享房源", href: "/properties" },
  ];

  if (isContentUser) {
    actions.splice(2, 0, {
      icon: <Sparkles className="h-5 w-5" />,
      label: "生成内容",
      href: "/content/new",
    });
  }

  return (
    <section>
      <h2 className="text-sm font-semibold mb-3 flex items-center gap-2">
        <TrendingUp className="h-4 w-4 text-muted-foreground" />
        快捷操作
      </h2>
      <div className="grid gap-2 sm:grid-cols-2">
        {actions.map((action) => (
          <QuickAction key={action.href} {...action} />
        ))}
      </div>
    </section>
  );
}

async function DashboardContent() {
  let data: DashboardData;
  try {
    data = await getDashboardData();
  } catch {
    return <DashboardError />;
  }

  const { tasks, clients, properties, content, isContentUser } = data;

  const hasOverdue = tasks.overdue_count > 0;
  const hasFollowUps = clients.need_follow_up > 0;

  return (
    <div className="p-4 space-y-8 max-w-4xl">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold tracking-tight">工作台</h1>
        <p className="text-sm text-muted-foreground mt-1">
          欢迎回来，以下是您的工作概览
        </p>
      </div>

      {/* Stats Grid */}
      <section>
        <h2 className="text-sm font-semibold mb-3 flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-muted-foreground" />
          数据概览
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {/* Tasks */}
          <StatCard
            icon={<CalendarDays className="h-4 w-4" />}
            label="待办任务"
            value={tasks.total_pending}
            subtitle={
              hasOverdue
                ? `${tasks.overdue_count} 项已逾期`
                : tasks.total_pending === 0
                  ? "暂无待办"
                  : undefined
            }
            href="/tasks"
            highlight={hasOverdue}
          />

          {/* Clients */}
          <StatCard
            icon={<Users className="h-4 w-4" />}
            label="客户"
            value={clients.total}
            subtitle={
              hasFollowUps
                ? `${clients.need_follow_up} 位需要跟进`
                : clients.new_today > 0
                  ? `今日新增 ${clients.new_today} 位`
                  : clients.total === 0
                    ? "暂无客户"
                    : undefined
            }
            href="/clients"
            highlight={hasFollowUps}
          />

          {/* Properties */}
          <StatCard
            icon={<Building2 className="h-4 w-4" />}
            label="房源"
            value={properties.total}
            subtitle={
              properties.available_soon > 0
                ? `${properties.available_soon} 套即将可租`
                : properties.recent_count > 0
                  ? `近 7 日新增 ${properties.recent_count} 套`
                  : properties.total === 0
                    ? "暂无房源"
                    : undefined
            }
            href="/properties"
          />

          {/* Content (content users only) */}
          {isContentUser && content && (
            <>
              <StatCard
                icon={<FileText className="h-4 w-4" />}
                label="近期内容"
                value={content.recent_count}
                subtitle="近 30 日生成"
                href="/content"
              />
              <StatCard
                icon={<FileEdit className="h-4 w-4" />}
                label="未发布内容"
                value={content.unpublished_count}
                subtitle={content.unpublished_count > 0 ? "待编辑发布" : "全部已发布"}
                href="/content"
                highlight={content.unpublished_count > 0}
              />
            </>
          )}

          {/* View matching */}
          <StatCard
            icon={<Sparkles className="h-4 w-4" />}
            label="房客匹配"
            value={clients.total > 0 ? clients.total : 0}
            subtitle="查看匹配结果"
            href="/matches"
          />
        </div>
      </section>

      {/* Overdue / Follow-up Alerts */}
      {(hasOverdue || hasFollowUps) && (
        <section>
          <div className="space-y-2">
            {hasOverdue && (
              <Link
                href="/tasks"
                className="flex items-center gap-3 rounded-lg border border-amber-500/30 bg-amber-50/50 dark:bg-amber-950/10 p-3 hover:bg-amber-50 dark:hover:bg-amber-950/20 transition-colors"
              >
                <Clock className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">
                    {tasks.overdue_count} 项任务已逾期
                  </p>
                  <p className="text-xs text-muted-foreground">点击查看并处理</p>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
              </Link>
            )}
            {hasFollowUps && (
              <Link
                href="/clients"
                className="flex items-center gap-3 rounded-lg border border-blue-500/30 bg-blue-50/50 dark:bg-blue-950/10 p-3 hover:bg-blue-50 dark:hover:bg-blue-950/20 transition-colors"
              >
                <Users className="h-5 w-5 text-blue-600 dark:text-blue-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">
                    {clients.need_follow_up} 位客户需要跟进
                  </p>
                  <p className="text-xs text-muted-foreground">查看客户列表</p>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
              </Link>
            )}
          </div>
        </section>
      )}

      {/* Quick Actions */}
      <QuickActions isContentUser={isContentUser} />
    </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <DashboardContent />
    </Suspense>
  );
}
