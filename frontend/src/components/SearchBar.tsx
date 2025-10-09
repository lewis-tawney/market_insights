import { Search } from "lucide-react";

interface Props {
  symbol: string;
  onChange: (s: string) => void;
  onRefresh?: () => void;
  loading?: boolean;
}

export function SearchBar({ symbol, onChange }: Props) {
  return (
    <div className="relative">
      <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
      <input
        className="w-full pl-8 pr-2 py-2 border rounded"
        value={symbol}
        placeholder="Search ticker"
        onChange={(e) => onChange(e.target.value.toUpperCase())}
      />
    </div>
  );
}
