import React, { useState } from "react";
import Sidebar from "./Sidebar";
import JournalSection from "./JournalSection";
import SectorWatchlist from "./SectorWatchlist";
import GroupLeaderboard from "./GroupLeaderboard";
import GroupDetailDrawer from "./GroupDetailDrawer";
import { GROUPS_DATA } from "../lib/mockGroupData";

export default function TradingDashboard() {
  const [activeTab, setActiveTab] = useState<string>("dashboard");
  const [selectedGroupId, setSelectedGroupId] = useState<string | undefined>(GROUPS_DATA[0]?.id);
  const formattedDate = new Date().toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  const selectedGroup = GROUPS_DATA.find((group) => group.id === selectedGroupId);

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
              <div className="space-y-6">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <h1 className="text-2xl font-semibold text-gray-100">
                      Industry Group Leaderboard
                    </h1>
                    <p className="text-sm text-gray-400">
                      Composite score blends price, breadth, and volume to focus your 2–6 week swing book.
                    </p>
                  </div>
                  <div className="text-xs font-medium uppercase tracking-wide text-gray-400">
                    Updated {formattedDate}
                  </div>
                </div>

                <div className="flex flex-col gap-6 xl:flex-row">
                  <GroupLeaderboard
                    groups={GROUPS_DATA}
                    selectedGroupId={selectedGroupId}
                    onSelect={setSelectedGroupId}
                  />
                  <GroupDetailDrawer group={selectedGroup} />
                </div>

                <div className="xl:hidden">
                  <div className="rounded-2xl border border-gray-800 bg-gray-950/60 p-4 text-sm text-gray-300">
                    Tap a group to view detail. For full drawer view, open on desktop (&ge;1280px).
                  </div>
                </div>
              </div>
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
