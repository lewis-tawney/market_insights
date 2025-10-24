import React, { useState } from "react";
import Sidebar from "./Sidebar";
import { TickerCard } from "./TickerCard";
import { IndexDivergenceCard, INDEX_SERIES } from "./IndexDivergenceCard";
import JournalSection from "./JournalSection";
import SectorWatchlist from "./SectorWatchlist";
import SectorEtfOverview from "./SectorEtfOverview";

const INDEX_COLOR_MAP: Record<string, string> = Object.fromEntries(
  INDEX_SERIES.map(({ symbol, color }) => [symbol, color])
);

export default function TradingDashboard() {
  const [activeTab, setActiveTab] = useState<string>("dashboard");
  const formattedDate = new Date().toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  return (
    <div className="flex w-full min-h-screen bg-gray-900">
      {/* Fixed Left Sidebar */}
      <div className="w-64 border-r border-gray-700">
        <Sidebar activeTab={activeTab} onTabChange={setActiveTab} />
      </div>

      {/* Fluid Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Main Content */}
        <main className="flex-1 overflow-auto p-4">
          <div className="max-w-7xl mx-auto">
            {activeTab === "dashboard" && (
              <>
                {/* Top Controls */}
                <div className="mb-6 flex justify-end">
                  <div className="text-sm font-medium text-gray-200">{formattedDate}</div>
                </div>

                <div className="flex flex-col gap-6 xl:flex-row">
                  <div className="flex-1">
                    <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
                      {INDEX_SERIES.map(({ symbol: indexSymbol }) => (
                        <TickerCard
                          key={indexSymbol}
                          symbol={indexSymbol}
                          accentColor={INDEX_COLOR_MAP[indexSymbol]}
                        />
                      ))}
                      <div className="md:col-span-2 xl:col-span-3">
                        <IndexDivergenceCard />
                      </div>
                    </div>
                  </div>

                  <div className="xl:w-80 xl:flex-shrink-0 xl:self-stretch">
                    <SectorEtfOverview />
                  </div>
                </div>
              </>
            )}
            {activeTab === "sectors" && (
              <div className="pb-6">
                <SectorWatchlist />
              </div>
            )}
            {activeTab === "journal" && (
              <div className="pb-6">
                <JournalSection />
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
