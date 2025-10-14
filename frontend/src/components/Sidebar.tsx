import React from "react";

interface SidebarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

export default function Sidebar({ activeTab, onTabChange }: SidebarProps) {
  const tabs = [
    { id: "dashboard", label: "Dashboard", icon: "📊" },
    { id: "sectors", label: "Sectors", icon: "🏭" },
    { id: "journal", label: "Journal", icon: "📝" },
    // Future tabs can be added here
    // { id: "reports", label: "Reports", icon: "📈" },
    // { id: "analytics", label: "Analytics", icon: "📋" },
    // { id: "settings", label: "Settings", icon: "⚙️" },
  ];

  return (
    <aside className="w-full bg-gray-800 text-gray-100 h-screen flex flex-col">
      {/* Sidebar Header */}
      <div className="p-4 border-b border-gray-700">
        <h2 className="text-lg font-semibold text-gray-100">Market Insights</h2>
      </div>

      {/* Navigation Tabs */}
      <nav className="flex-1 p-4">
        <ul className="space-y-2">
          {tabs.map((tab) => (
            <li key={tab.id}>
              <button
                onClick={() => onTabChange(tab.id)}
                className={`w-full flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                  activeTab === tab.id
                    ? "bg-primary-500 text-white hover:bg-primary-600"
                    : "text-gray-300 hover:bg-gray-700 hover:text-gray-100"
                }`}
              >
                <span className="mr-3 text-lg">{tab.icon}</span>
                {tab.label}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      {/* Sidebar Footer */}
      <div className="p-4 border-t border-gray-700">
        <div className="text-xs text-gray-400">
          Market Insights v1.0
        </div>
      </div>
    </aside>
  );
}
