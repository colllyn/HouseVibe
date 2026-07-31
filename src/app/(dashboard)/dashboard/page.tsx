import { EmptyState } from "@/components/ui/empty-state";
import { CalendarDays, Building2, Users } from "lucide-react";

export default function DashboardPage() {
  return (
    <div className="p-4 space-y-6 max-w-4xl">
      <div>
        <h1 className="text-xl font-bold tracking-tight">工作台</h1>
        <p className="text-sm text-muted-foreground mt-1">
          欢迎使用阳光智家，这里是您的管理后台。
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-lg border bg-card p-4">
          <h2 className="text-sm font-semibold mb-3">今日待办</h2>
          <EmptyState
            icon={<CalendarDays className="h-8 w-8" />}
            title="暂无待办"
            description="待办功能将在后续版本中开放"
          />
        </div>

        <div className="rounded-lg border bg-card p-4">
          <h2 className="text-sm font-semibold mb-3">最近房源</h2>
          <EmptyState
            icon={<Building2 className="h-8 w-8" />}
            title="暂无房源"
            description="房源管理功能将在后续版本中开放"
          />
        </div>

        <div className="rounded-lg border bg-card p-4">
          <h2 className="text-sm font-semibold mb-3">最近客户</h2>
          <EmptyState
            icon={<Users className="h-8 w-8" />}
            title="暂无客户"
            description="客户管理功能将在后续版本中开放"
          />
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        此页面为 Phase 1-B2 占位框架，认证与工作区功能将在本阶段实现。
      </p>
    </div>
  );
}
