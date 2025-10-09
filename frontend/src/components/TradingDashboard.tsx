import React, { useState, useCallback, useRef } from "react";
import { SearchBar } from "./SearchBar";
import TickerSummary from "./TickerSummary";
import Sidebar from "./Sidebar";
import { TickerCard } from "./TickerCard";
import { IndexComparisonCard, INDEX_SERIES } from "./IndexComparisonCard";

const INDEX_COLOR_MAP: Record<string, string> = Object.fromEntries(
  INDEX_SERIES.map(({ symbol, color }) => [symbol, color])
);

export default function TradingDashboard() {
  const [symbol, setSymbol] = useState<string>("SPY");
  const [refreshKey, setRefreshKey] = useState(0);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<string>("dashboard");
  const debounceTimeoutRef = useRef<number | null>(null);
  const formattedDate = new Date().toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  // Debounced symbol change handler
  const handleSymbolChange = useCallback((newSymbol: string) => {
    const clean = newSymbol.trim().toUpperCase();
    setSymbol(clean);

    // Clear existing timeout
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }

    // Set new timeout to trigger refresh after user stops typing
    debounceTimeoutRef.current = setTimeout(() => {
      setRefreshKey((k) => k + 1);
    }, 1000); // 1 second delay
  }, []);

  const handleRefresh = useCallback(() => {
    setLoading(true);
    setRefreshKey((k) => k + 1);
    // Reset loading state after a short delay
    setTimeout(() => setLoading(false), 1000);
  }, []);

  return (
    <div className="flex h-screen bg-gray-100">
      {/* Main Sidebar */}
      <Sidebar activeTab={activeTab} onTabChange={setActiveTab} />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Main Content */}
        <main className="flex-1 overflow-auto p-4">
          <div className="max-w-7xl mx-auto">
            {activeTab === "dashboard" && (
              <>
                {/* Top Controls */}
                <div className="mb-6">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="w-full sm:max-w-[calc((100%-2rem)/3)]">
                      <SearchBar
                        symbol={symbol}
                        onChange={handleSymbolChange}
                        onRefresh={handleRefresh}
                        loading={loading}
                      />
                    </div>
                    <div className="text-sm font-medium text-gray-700 sm:text-right">
                      {formattedDate}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 mb-6">
                  <div className="lg:col-span-3">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 h-full">
                      {INDEX_SERIES.map(({ symbol: indexSymbol }) => (
                        <TickerCard
                          key={indexSymbol}
                          symbol={indexSymbol}
                          accentColor={INDEX_COLOR_MAP[indexSymbol]}
                        />
                      ))}
                    </div>
                  </div>
                  <div className="lg:col-span-2">
                    <IndexComparisonCard />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 mb-6">
                  <TickerSummary
                    key={`${symbol}-${refreshKey}-summary`}
                    symbol={symbol}
                  />
                </div>
              </>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
