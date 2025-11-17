import React, { useMemo, useState } from "react";
import { Bell, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import Sidebar from "./Sidebar";
import { IndexDivergenceCard, INDEX_SERIES } from "./IndexDivergenceCard";
import JournalSection from "./JournalSection";
import SectorEtfOverview from "./SectorEtfOverview";
import SectorWatchlist from "./SectorWatchlist";
import { TickerCard } from "./TickerCard";

const INDEX_COLOR_MAP: Record<string, string> = Object.fromEntries(
  INDEX_SERIES.map(({ symbol, color }) => [symbol, color])
);

const VIEW_TABS = [
  { id: "dashboard", label: "Dashboard" },
  { id: "sectors", label: "Sectors" },
  { id: "journal", label: "Journal" },
];

export default function TradingDashboard() {
  const [activeTab, setActiveTab] = useState<string>("dashboard");
  const formattedDate = useMemo(
    () =>
      new Date().toLocaleDateString("en-US", {
        weekday: "short",
        month: "long",
        day: "numeric",
      }),
    []
  );

  return (
    <div className="flex min-h-screen w-full bg-gradient-to-br from-background via-background to-trading-graphite text-foreground">
      <Sidebar activeTab={activeTab} onTabChange={setActiveTab} />
      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        className="flex flex-1 flex-col overflow-hidden"
      >
        <header className="sticky top-0 z-18 flex flex-col gap-5 border-b border-border bg-background/95 px-shell py-panel shadow-[0_10px_30px_rgba(3,5,10,0.35)] backdrop-blur">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-body-xs uppercase tracking-[0.3em] text-muted-foreground">
                Session date
              </p>
              <p className="text-heading-lg font-semibold text-foreground">
                {formattedDate}
              </p>
            </div>
            <div className="flex flex-1 flex-wrap items-center justify-end gap-3">
              <div className="relative w-full max-w-md">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="bg-background-raised pl-9"
                  placeholder="Global symbol search"
                />
              </div>
              <Button variant="ghost" size="icon" className="text-muted-foreground">
                <Bell className="h-5 w-5" />
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <TabsList className="bg-background-raised">
              {VIEW_TABS.map((tab) => (
                <TabsTrigger key={tab.id} value={tab.id}>
                  {tab.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
        </header>

        <div className="flex flex-1 flex-col overflow-hidden">
          <main className="flex-1 overflow-y-auto px-shell pb-shell pt-gutter">
            <TabsContent
              value="dashboard"
              className="mt-0 flex-1"
            >
              <div className="mx-auto w-full max-w-[1440px] space-y-stack">
                <div className="grid items-start gap-stack xl:grid-cols-[minmax(0,2.35fr)_minmax(280px,1fr)]">
                  <div className="flex flex-col gap-stack">
                    <div className="grid grid-cols-1 gap-panel sm:grid-cols-2 xl:grid-cols-3">
                      {INDEX_SERIES.map(({ symbol: indexSymbol }) => (
                        <TickerCard
                          key={indexSymbol}
                          symbol={indexSymbol}
                          accentColor={INDEX_COLOR_MAP[indexSymbol]}
                        />
                      ))}
                    </div>
                    <div className="min-w-0">
                      <IndexDivergenceCard />
                    </div>
                  </div>
                  <div className="flex flex-col gap-stack">
                    <SectorEtfOverview />
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="sectors" className="mt-0 flex-1">
              <div className="mx-auto w-full max-w-[1600px] px-0">
                <SectorWatchlist />
              </div>
            </TabsContent>

            <TabsContent value="journal" className="mt-0 flex-1">
              <div className="mx-auto w-full max-w-[1400px]">
                <JournalSection />
              </div>
            </TabsContent>
          </main>
        </div>
      </Tabs>
    </div>
  );
}
