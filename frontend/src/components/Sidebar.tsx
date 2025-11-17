import React from "react";
import type { LucideIcon } from "lucide-react";
import {
  BarChart2,
  Building2,
  NotebookPen,
  Scroll,
  Settings2,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface SidebarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

type NavItem = {
  id: string;
  label: string;
  icon: LucideIcon;
  badge?: React.ReactNode;
};

export default function Sidebar({ activeTab, onTabChange }: SidebarProps) {
  const tabs: NavItem[] = [
    { id: "dashboard", label: "Dashboard", icon: BarChart2 },
    { id: "sectors", label: "Sectors", icon: Building2 },
    {
      id: "journal",
      label: "Journal",
      icon: NotebookPen,
      badge: <Badge variant="accent">new</Badge>,
    },
  ];

  return (
    <aside className="group/sidebar flex min-h-screen w-20 flex-col border-r border-border bg-background-raised text-muted-foreground transition-[width] duration-300 lg:w-64">
      <div className="flex items-center gap-3 px-gutter py-panel">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-trading-cyan to-trading-emerald text-heading-md font-bold text-background shadow-card">
          MI
        </div>
        <div className="hidden flex-1 lg:block">
          <p className="text-heading-sm font-semibold text-foreground">
            Market Insights
          </p>
          <p className="text-body-xs text-muted-foreground">Alpha desk</p>
        </div>
      </div>

      <nav className="flex-1 space-y-1 px-1 py-gutter">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={cn(
                "group inline-flex w-full items-center gap-3 rounded-lg px-gutter py-3 text-left text-body font-medium text-muted-foreground transition-colors hover:bg-background-muted hover:text-foreground",
                isActive &&
                  "bg-primary/10 text-primary shadow-inner shadow-primary/30"
              )}
            >
              <Icon
                className={cn(
                  "h-5 w-5 text-muted-foreground transition-colors group-hover:text-primary",
                  isActive && "text-primary"
                )}
              />
              <span className="hidden flex-1 lg:inline">{tab.label}</span>
              <span className="hidden lg:inline">{tab.badge}</span>
            </button>
          );
        })}
      </nav>

      <div className="px-gutter pb-panel pt-gutter">
        <div className="hidden lg:flex items-center justify-between rounded-lg border border-border bg-background px-3 py-3">
          <div>
            <p className="text-body-xs uppercase tracking-wide text-muted-foreground">
              Desk notes
            </p>
            <p className="text-body text-foreground">Pre-market ready</p>
          </div>
          <Scroll className="h-5 w-5 text-muted-foreground" />
        </div>
        <div className="mt-gutter flex items-center justify-between rounded-lg border border-border bg-background px-3 py-3">
          <div className="hidden lg:block">
            <p className="text-body-xs uppercase tracking-wide text-muted-foreground">
              Settings
            </p>
            <p className="text-body text-foreground">Desk preferences</p>
          </div>
          <Button variant="ghost" size="icon" className="text-muted-foreground">
            <Settings2 className="h-5 w-5" />
          </Button>
        </div>
      </div>
    </aside>
  );
}
