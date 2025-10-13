import React, { useMemo, useState } from "react";
import TradeJournalList from "./TradeJournalList";

type JournalTabKey = "trades" | "daily" | "weekly";

interface JournalEntry {
  id: number;
  [key: string]: string | number;
}

interface TradeEntry {
  id: number;
  date: string;
  symbol: string;
  callPut: "Call" | "Put";
  strike: number;
  expiration: string;
  price: number;
  qty: number;
  totalCost: number;
  setup: string;
  status: "Open" | "Closed";
  result: string;
  comments?: string;
}

interface FormData {
  date: string;
  symbol: string;
  callPut: "Call" | "Put";
  strike: string;
  expiration: string;
  price: string;
  qty: string;
  totalCost: string;
  setup: string;
  status: "Open" | "Closed";
  result: string;
  comments: string;
}

interface TabDefinition {
  id: JournalTabKey;
  label: string;
  subtitle: string;
}

const TAB_DEFINITIONS: TabDefinition[] = [
  {
    id: "trades",
    label: "Trades",
    subtitle: "Track executions, notes, and follow-ups",
  },
  {
    id: "daily",
    label: "Daily Log",
    subtitle: "Capture daily observations and market context",
  },
  {
    id: "weekly",
    label: "Weekly Review",
    subtitle: "Summarize progress and lessons learned",
  },
];

const TRADES_PLACEHOLDERS: TradeEntry[] = [
  { 
    id: 1, 
    date: "Oct 10 25", 
    symbol: "AAPL", 
    callPut: "Call",
    strike: 150, 
    expiration: "Dec 20 25", 
    price: 2.50, 
    qty: 10, 
    totalCost: 2500, 
    setup: "Earnings momentum", 
    status: "Closed", 
    result: "+2.4%" 
  },
  { 
    id: 2, 
    date: "Oct 09 25", 
    symbol: "TSLA", 
    callPut: "Put",
    strike: 200, 
    expiration: "Nov 15 25", 
    price: 1.75, 
    qty: 5, 
    totalCost: 875, 
    setup: "Breakout pullback", 
    status: "Open", 
    result: "-1.1%" 
  },
];

const DAILY_PLACEHOLDERS: JournalEntry[] = [
  { id: 1, date: "2024-03-08", focus: "Watch liquidity rotation", sentiment: "Cautiously bullish" },
  { id: 2, date: "2024-03-07", focus: "Gap and go failed", sentiment: "Neutral" },
];

const WEEKLY_PLACEHOLDERS: JournalEntry[] = [
  { id: 1, week: "2024-W10", theme: "Leaders consolidating", takeaway: "Size down until breadth improves" },
  { id: 2, week: "2024-W09", theme: "Momentum returning", takeaway: "Add watchlist names around MAs" },
];

const TABLE_CONFIG = {
  trades: {
    columns: [
      { key: "date", label: "Date" },
      { key: "symbol", label: "Symbol" },
      { key: "callPut", label: "Call/Put" },
      { key: "strike", label: "Strike" },
      { key: "expiration", label: "Exp." },
      { key: "price", label: "Price" },
      { key: "qty", label: "Qty" },
      { key: "totalCost", label: "Total Cost" },
      { key: "setup", label: "Setup" },
      { key: "status", label: "Open/Closed" },
      { key: "result", label: "Result" },
    ],
    rows: TRADES_PLACEHOLDERS,
  },
  daily: {
    columns: [
      { key: "date", label: "Date" },
      { key: "focus", label: "Focus" },
      { key: "sentiment", label: "Sentiment" },
    ],
    rows: DAILY_PLACEHOLDERS,
  },
  weekly: {
    columns: [
      { key: "week", label: "Week" },
      { key: "theme", label: "Theme" },
      { key: "takeaway", label: "Key Takeaway" },
    ],
    rows: WEEKLY_PLACEHOLDERS,
  },
} as const;

export default function JournalSection() {
  const [activeTab, setActiveTab] = useState<JournalTabKey>("trades");
  const [showEntryForm, setShowEntryForm] = useState(false);
  const [editingTrade, setEditingTrade] = useState<TradeEntry | null>(null);
  const [trades, setTrades] = useState<TradeEntry[]>(TRADES_PLACEHOLDERS);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [formData, setFormData] = useState<FormData>({
    date: "",
    symbol: "",
    callPut: "Call",
    strike: "",
    expiration: "",
    price: "",
    qty: "",
    totalCost: "",
    setup: "",
    status: "Open",
    result: "",
    comments: ""
  });

  const { columns, rows } = useMemo(() => {
    if (activeTab === "trades") {
      return { columns: TABLE_CONFIG.trades.columns, rows: trades };
    }
    return TABLE_CONFIG[activeTab];
  }, [activeTab, trades]);

  const formatDate = (dateStr: string) => {
    if (!dateStr) return "";
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", { 
      month: "short", 
      day: "numeric", 
      year: "2-digit" 
    });
  };

  const validateNumericField = (field: string, value: string): string => {
    if (value === "") return ""; // Allow empty values
    const numValue = parseFloat(value);
    if (isNaN(numValue)) {
      return `Please enter a valid number for ${field}`;
    }
    if (numValue < 0) {
      return `${field} cannot be negative`;
    }
    return "";
  };

  const handleInputChange = (field: keyof FormData, value: string) => {
    setFormData(prev => {
      const updated = { ...prev, [field]: value } as FormData;
      
      // Clear validation error for this field
      setValidationErrors(prevErrors => {
        const newErrors = { ...prevErrors };
        delete newErrors[field];
        return newErrors;
      });

      // Auto-calculate total cost when price or quantity changes
      if (field === "price" || field === "qty") {
        const price = field === "price" ? parseFloat(value) : parseFloat(prev.price || "0");
        const qty = field === "qty" ? parseFloat(value) : parseFloat(prev.qty || "0");
        if (!isNaN(price) && !isNaN(qty)) {
          updated.totalCost = (price * qty).toString();
        } else {
          updated.totalCost = "";
        }
      }
      
      return updated;
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate numeric fields
    const errors: Record<string, string> = {};
    const numericFields = ['strike', 'price', 'qty'];
    
    numericFields.forEach(field => {
      const value = formData[field as keyof FormData] as string;
      const error = validateNumericField(field, value);
      if (error) {
        errors[field] = error;
      }
    });

    // Check required fields
    if (!formData.symbol?.trim()) {
      errors.symbol = "Symbol is required";
    }
    if (!formData.date) {
      errors.date = "Entry date is required";
    }
    if (!formData.expiration) {
      errors.expiration = "Exit date is required";
    }

    if (Object.keys(errors).length > 0) {
      setValidationErrors(errors);
      return;
    }

    const tradeData: TradeEntry = {
      id: editingTrade?.id || trades.length + 1,
      date: formatDate(formData.date || ""),
      symbol: formData.symbol || "",
      callPut: formData.callPut as "Call" | "Put",
      strike: parseFloat(formData.strike || "0"),
      expiration: formatDate(formData.expiration || ""),
      price: parseFloat(formData.price || "0"),
      qty: parseInt(formData.qty || "0"),
      totalCost: parseFloat(formData.totalCost || "0"),
      setup: formData.setup || "",
      status: formData.status as "Open" | "Closed",
      result: formData.result || "",
      comments: formData.comments || ""
    };
    
    if (editingTrade) {
      setTrades(prev => prev.map(trade => trade.id === editingTrade.id ? tradeData : trade));
    } else {
      setTrades(prev => [tradeData, ...prev]);
    }
    
    setFormData({
      date: "",
      symbol: "",
      callPut: "Call",
      strike: "",
      expiration: "",
      price: "",
      qty: "",
      totalCost: "",
      setup: "",
      status: "Open",
      result: "",
      comments: ""
    } as FormData);
    setValidationErrors({});
    setShowEntryForm(false);
    setEditingTrade(null);
  };

  const handleViewTrade = (trade: TradeEntry) => {
    // For now, just show an alert. In a real app, this would open a modal or navigate to a detail view
    alert(`Viewing trade: ${trade.symbol} ${trade.callPut} ${trade.strike} - ${trade.setup}`);
  };

  const handleEditTrade = (trade: TradeEntry) => {
    setEditingTrade(trade);
    setFormData({
      date: trade.date,
      symbol: trade.symbol,
      callPut: trade.callPut,
      strike: trade.strike.toString(),
      expiration: trade.expiration,
      price: trade.price.toString(),
      qty: trade.qty.toString(),
      totalCost: trade.totalCost.toString(),
      setup: trade.setup,
      status: trade.status,
      result: trade.result,
      comments: trade.comments || ""
    } as FormData);
    setValidationErrors({});
    setShowEntryForm(true);
  };

  const handleDeleteTrade = (tradeId: number) => {
    if (confirm("Are you sure you want to delete this trade?")) {
      setTrades(prev => prev.filter(trade => trade.id !== tradeId));
    }
  };

  return (
    <section className="w-full bg-gray-800 rounded shadow p-4">
      <header className="flex flex-col gap-2 mb-4">
        <h2 className="text-xl font-bold text-gray-100">Journal</h2>
        <p className="text-sm text-gray-400">
          Personalized workspace for capturing trade insights and routines.
        </p>
      </header>

        <div className="flex flex-col gap-4 md:flex-row md:gap-6">
        <nav className="flex overflow-x-auto md:flex-col md:overflow-visible gap-2 md:gap-1 md:pr-4 md:border-r md:border-gray-700 md:w-48 md:flex-none">
            {TAB_DEFINITIONS.map((tab) => {
              const isActive = tab.id === activeTab;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex-1 md:flex-none rounded-md px-4 py-2 text-sm font-medium text-left transition-colors hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 ${
                    isActive
                      ? "text-gray-100 border-b-2 border-accent-500"
                      : "text-gray-400 hover:text-gray-100 focus:ring-gray-500 focus:ring-offset-gray-800"
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </nav>

          <div className="flex-1 space-y-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <p className="text-sm text-gray-400">
                {
                  TAB_DEFINITIONS.find((tab) => tab.id === activeTab)
                    ?.subtitle
                }
              </p>
              <button
                type="button"
                onClick={() => {
                  setEditingTrade(null);
                  setShowEntryForm(true);
                }}
                className="inline-flex items-center justify-center rounded-md bg-primary-500 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-primary-600 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 focus:ring-offset-gray-800"
              >
                Add Entry
              </button>
            </div>

            {showEntryForm && activeTab === "trades" ? (
              <div className="bg-gray-700 rounded border border-gray-600 p-4">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-xl font-bold text-gray-100">
                    {editingTrade ? "Edit Trade Entry" : "Add Trade Entry"}
                  </h3>
                  <button
                    type="button"
                    onClick={() => {
                      setShowEntryForm(false);
                      setEditingTrade(null);
                      setValidationErrors({});
                    }}
                    className="text-gray-400 hover:text-gray-200"
                  >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                
                <form onSubmit={handleSubmit} className="space-y-6">
                  {/* Symbol, Entry Date, Exit Date Row */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-200 mb-1">Symbol</label>
                      <input
                        type="text"
                        value={formData.symbol}
                        onChange={(e) => handleInputChange("symbol", e.target.value.toUpperCase())}
                        placeholder="AAPL"
                        className={`w-full px-3 py-2 border rounded bg-gray-700 text-gray-100 focus:outline-none focus:ring-2 ${
                          validationErrors.symbol 
                            ? 'border-red-500 focus:ring-red-500' 
                            : 'border-gray-600 focus:ring-accent-500'
                        }`}
                        required
                      />
                      {validationErrors.symbol && (
                        <p className="mt-1 text-sm text-red-400">{validationErrors.symbol}</p>
                      )}
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-200 mb-1">Entry Date</label>
                      <input
                        type="date"
                        value={formData.date}
                        onChange={(e) => handleInputChange("date", e.target.value)}
                        className={`w-full px-3 py-2 border rounded bg-gray-700 text-gray-100 focus:outline-none focus:ring-2 ${
                          validationErrors.date 
                            ? 'border-red-500 focus:ring-red-500' 
                            : 'border-gray-600 focus:ring-accent-500'
                        }`}
                        required
                      />
                      {validationErrors.date && (
                        <p className="mt-1 text-sm text-red-400">{validationErrors.date}</p>
                      )}
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-200 mb-1">Exit Date</label>
                      <input
                        type="date"
                        value={formData.expiration}
                        onChange={(e) => handleInputChange("expiration", e.target.value)}
                        className={`w-full px-3 py-2 border rounded bg-gray-700 text-gray-100 focus:outline-none focus:ring-2 ${
                          validationErrors.expiration 
                            ? 'border-red-500 focus:ring-red-500' 
                            : 'border-gray-600 focus:ring-accent-500'
                        }`}
                        required
                      />
                      {validationErrors.expiration && (
                        <p className="mt-1 text-sm text-red-400">{validationErrors.expiration}</p>
                      )}
                    </div>
                  </div>

                  {/* Call/Put, Strike Row */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-200 mb-1">Call/Put</label>
                      <select
                        value={formData.callPut}
                        onChange={(e) => handleInputChange("callPut", e.target.value)}
                        className="w-full px-3 py-2 border border-gray-600 rounded bg-gray-700 text-gray-100 focus:outline-none focus:ring-2 focus:ring-accent-500"
                        required
                      >
                        <option value="Call">Call</option>
                        <option value="Put">Put</option>
                      </select>
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-200 mb-1">Strike</label>
                      <input
                        type="number"
                        step="0.01"
                        value={formData.strike}
                        onChange={(e) => handleInputChange("strike", e.target.value)}
                        placeholder="150.00"
                        className={`w-full px-3 py-2 border rounded bg-gray-700 text-gray-100 focus:outline-none focus:ring-2 ${
                          validationErrors.strike 
                            ? 'border-red-500 focus:ring-red-500' 
                            : 'border-gray-600 focus:ring-accent-500'
                        }`}
                        required
                      />
                      {validationErrors.strike && (
                        <p className="mt-1 text-sm text-red-400">{validationErrors.strike}</p>
                      )}
                    </div>
                  </div>

                  {/* Price, Quantity, Total Cost Row */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-200 mb-1">Price ($)</label>
                      <input
                        type="number"
                        step="0.01"
                        value={formData.price}
                        onChange={(e) => handleInputChange("price", e.target.value)}
                        placeholder="2.50"
                        className={`w-full px-3 py-2 border rounded bg-gray-700 text-gray-100 focus:outline-none focus:ring-2 ${
                          validationErrors.price 
                            ? 'border-red-500 focus:ring-red-500' 
                            : 'border-gray-600 focus:ring-accent-500'
                        }`}
                        required
                      />
                      {validationErrors.price && (
                        <p className="mt-1 text-sm text-red-400">{validationErrors.price}</p>
                      )}
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-200 mb-1">Quantity</label>
                      <input
                        type="number"
                        value={formData.qty}
                        onChange={(e) => handleInputChange("qty", e.target.value)}
                        placeholder="10"
                        className={`w-full px-3 py-2 border rounded bg-gray-700 text-gray-100 focus:outline-none focus:ring-2 ${
                          validationErrors.qty 
                            ? 'border-red-500 focus:ring-red-500' 
                            : 'border-gray-600 focus:ring-accent-500'
                        }`}
                        required
                      />
                      {validationErrors.qty && (
                        <p className="mt-1 text-sm text-red-400">{validationErrors.qty}</p>
                      )}
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-200 mb-1">Total Cost</label>
                      <input
                        type="text"
                        value={formData.totalCost ? `$${parseFloat(formData.totalCost).toFixed(2)}` : "$0.00"}
                        className="w-full px-3 py-2 border border-gray-600 rounded bg-gray-600 text-gray-300"
                        readOnly
                      />
                    </div>
                  </div>

                  {/* Setup, Status, Result Row */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-200 mb-1">Setup</label>
                      <input
                        type="text"
                        value={formData.setup}
                        onChange={(e) => handleInputChange("setup", e.target.value)}
                        placeholder="Earnings momentum"
                        className="w-full px-3 py-2 border border-gray-600 rounded bg-gray-700 text-gray-100 focus:outline-none focus:ring-2 focus:ring-accent-500"
                        required
                      />
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-200 mb-1">Status</label>
                      <select
                        value={formData.status}
                        onChange={(e) => handleInputChange("status", e.target.value)}
                        className="w-full px-3 py-2 border border-gray-600 rounded bg-gray-700 text-gray-100 focus:outline-none focus:ring-2 focus:ring-accent-500"
                        required
                      >
                        <option value="Open">Open</option>
                        <option value="Closed">Closed</option>
                      </select>
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-200 mb-1">Result</label>
                      <input
                        type="text"
                        value={formData.result}
                        onChange={(e) => handleInputChange("result", e.target.value)}
                        placeholder="+2.4%"
                        className="w-full px-3 py-2 border border-gray-600 rounded bg-gray-700 text-gray-100 focus:outline-none focus:ring-2 focus:ring-accent-500"
                      />
                    </div>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-200 mb-1">Comments</label>
                    <textarea
                      value={formData.comments}
                      onChange={(e) => handleInputChange("comments", e.target.value)}
                      placeholder="Additional notes about this trade..."
                      rows={3}
                      className="w-full px-3 py-2 border border-gray-600 rounded bg-gray-700 text-gray-100 focus:outline-none focus:ring-2 focus:ring-accent-500"
                    />
                  </div>
                  
                  <div className="flex justify-end space-x-3">
                    <button
                      type="button"
                      onClick={() => {
                        setShowEntryForm(false);
                        setEditingTrade(null);
                        setValidationErrors({});
                      }}
                      className="px-4 py-2 text-sm font-medium text-gray-300 bg-gray-600 rounded hover:bg-gray-500 focus:outline-none focus:ring-2 focus:ring-gray-500"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="px-4 py-2 text-sm font-medium text-white bg-primary-500 rounded hover:bg-primary-600 focus:outline-none focus:ring-2 focus:ring-primary-500"
                    >
                      {editingTrade ? "Update Trade" : "Save Trade"}
                    </button>
                  </div>
                </form>
              </div>
            ) : activeTab === "trades" ? (
              <TradeJournalList
                trades={trades}
                onEditTrade={handleEditTrade}
                onDeleteTrade={handleDeleteTrade}
              />
            ) : (
              <div className="overflow-hidden rounded border border-gray-600">
                <table className="min-w-full divide-y divide-gray-700">
                  <thead className="bg-gray-700">
                  <tr>
                    {columns.map((column) => (
                      <th
                        key={column.key}
                        scope="col"
                          className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-300"
                      >
                        {column.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                  <tbody className="divide-y divide-gray-700 bg-gray-800">
                  {rows.map((row) => (
                    <tr key={row.id}>
                      {columns.map((column) => (
                          <td key={column.key} className="px-4 py-3 text-sm text-gray-200">
                        {column.key === "price" ? `$${(row as any)[column.key]}` : 
                         column.key === "totalCost" ? `$${(row as any)[column.key]}` :
                         (row as any)[column.key]}
                        </td>
                      ))}
                    </tr>
                  ))}
                  {rows.length === 0 && (
                    <tr>
                      <td
                        colSpan={columns.length}
                          className="px-4 py-6 text-center text-sm text-gray-400"
                      >
                          No entries yet. Start documenting your process with "Add Entry".
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            )}
        </div>
      </div>
    </section>
  );
}
