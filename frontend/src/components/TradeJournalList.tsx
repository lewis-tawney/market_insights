import React from 'react';
import {
  CheckCircleIcon,
  ClockIcon,
  ArrowUpIcon,
  ArrowDownIcon,
  TrashIcon,
} from 'lucide-react';

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

interface TradeJournalListProps {
  trades: TradeEntry[];
  onEditTrade: (trade: TradeEntry) => void;
  onDeleteTrade: (tradeId: number) => void;
}

const TradeJournalList: React.FC<TradeJournalListProps> = ({
  trades,
  onEditTrade,
  onDeleteTrade,
}) => {
  return (
    <div className="bg-gray-800 rounded shadow overflow-hidden">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-700">
          <thead className="bg-gray-700">
            <tr>
              <th
                scope="col"
                className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider"
              >
                Date
              </th>
              <th
                scope="col"
                className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider"
              >
                Symbol
              </th>
              <th
                scope="col"
                className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider"
              >
                Type
              </th>
              <th
                scope="col"
                className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider"
              >
                Strike
              </th>
              <th
                scope="col"
                className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider"
              >
                Exp.
              </th>
              <th
                scope="col"
                className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider"
              >
                Price
              </th>
              <th
                scope="col"
                className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider"
              >
                Qty
              </th>
              <th
                scope="col"
                className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider"
              >
                Total
              </th>
              <th
                scope="col"
                className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider"
              >
                Status
              </th>
              <th
                scope="col"
                className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider"
              >
                Result
              </th>
            </tr>
          </thead>
          <tbody className="bg-gray-800 divide-y divide-gray-700">
            {trades.length === 0 ? (
              <tr>
                <td
                  colSpan={10}
                  className="px-4 py-8 text-center text-gray-400"
                >
                  No trades recorded yet. Add your first trade entry!
                </td>
              </tr>
            ) : (
              trades.map((trade) => (
                <tr 
                  key={trade.id} 
                  className="hover:bg-gray-700 cursor-pointer relative group"
                  onClick={() => onEditTrade(trade)}
                >
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-200">
                    {trade.date}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-white">
                    {trade.symbol}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm">
                    <span
                      className={`px-2 py-1 rounded-full text-xs font-medium ${
                        trade.callPut === 'Call'
                          ? 'bg-green-900 text-green-200'
                          : 'bg-red-900 text-red-200'
                      }`}
                    >
                      {trade.callPut === 'Call' ? (
                        <span className="flex items-center">
                          <ArrowUpIcon size={12} className="mr-1" />
                          Call
                        </span>
                      ) : (
                        <span className="flex items-center">
                          <ArrowDownIcon size={12} className="mr-1" />
                          Put
                        </span>
                      )}
                    </span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-200">
                    ${trade.strike.toFixed(2)}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-200">
                    {trade.expiration}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-200">
                    ${trade.price.toFixed(2)}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-200">
                    {trade.qty}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-200">
                    ${trade.totalCost.toFixed(2)}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm">
                    {trade.status === 'Open' ? (
                      <span className="flex items-center text-blue-400">
                        <ClockIcon size={14} className="mr-1" />
                        Open
                      </span>
                    ) : (
                      <span className="flex items-center text-green-400">
                        <CheckCircleIcon size={14} className="mr-1" />
                        Closed
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm relative">
                    {trade.status === 'Closed' && trade.result ? (
                      <span
                        className={`font-medium ${
                          trade.result.startsWith('+')
                            ? 'text-green-400'
                            : trade.result.startsWith('-')
                            ? 'text-red-400'
                            : 'text-gray-400'
                        }`}
                      >
                        {trade.result}
                      </span>
                    ) : (
                      <span className="text-gray-500">-</span>
                    )}
                    {/* Delete button appears on hover */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm("Do you want to delete this entry?")) {
                          onDeleteTrade(trade.id);
                        }
                      }}
                      className="absolute right-2 top-1/2 transform -translate-y-1/2 opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-400 transition-all duration-200"
                      title="Delete"
                    >
                      <TrashIcon size={16} />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default TradeJournalList;
