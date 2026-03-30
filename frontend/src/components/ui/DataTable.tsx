import { useState, useMemo, ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronUp, ChevronDown, ChevronLeft, ChevronRight, Database } from 'lucide-react';

export interface Column<T> {
  key: string;
  header: string;
  sortable?: boolean;
  render?: (row: T, index: number) => ReactNode;
  align?: 'left' | 'center' | 'right';
  width?: string;
}

interface PaginationConfig {
  pageSize: number;
  currentPage?: number;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  keyExtractor: (row: T, index: number) => string;
  onRowClick?: (row: T, index: number) => void;
  pagination?: PaginationConfig;
  emptyMessage?: string;
}

type SortDir = 'asc' | 'desc' | null;

export default function DataTable<T>({
  columns,
  data,
  keyExtractor,
  onRowClick,
  pagination,
  emptyMessage = 'No data available',
}: DataTableProps<T>) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>(null);
  const [page, setPage] = useState(pagination?.currentPage ?? 1);

  const handleSort = (key: string) => {
    if (sortKey === key) {
      if (sortDir === 'asc') {
        setSortDir('desc');
      } else if (sortDir === 'desc') {
        setSortDir(null);
        setSortKey(null);
      }
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const sortedData = useMemo(() => {
    if (!sortKey || !sortDir) return data;
    return [...data].sort((a, b) => {
      const aVal = (a as Record<string, unknown>)[sortKey];
      const bVal = (b as Record<string, unknown>)[sortKey];
      if (aVal == null) return 1;
      if (bVal == null) return -1;
      const cmp =
        typeof aVal === 'number' && typeof bVal === 'number'
          ? aVal - bVal
          : String(aVal).localeCompare(String(bVal));
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [data, sortKey, sortDir]);

  const pageSize = pagination?.pageSize ?? data.length;
  const totalPages = Math.max(1, Math.ceil(sortedData.length / pageSize));
  const paginatedData = pagination
    ? sortedData.slice((page - 1) * pageSize, page * pageSize)
    : sortedData;

  const alignClass = (align?: string) => {
    if (align === 'center') return 'text-center';
    if (align === 'right') return 'text-right';
    return 'text-left';
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
      className="bg-[#0D1321]/60 backdrop-blur-xl border border-[#1A2035] rounded-lg overflow-hidden"
    >
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-[#1A2035]">
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={`
                    px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.15em]
                    text-white/40 select-none
                    ${alignClass(col.align)}
                    ${col.sortable ? 'cursor-pointer hover:text-white/70 transition-colors' : ''}
                  `}
                  style={col.width ? { width: col.width } : undefined}
                  onClick={() => col.sortable && handleSort(col.key)}
                >
                  <div
                    className={`flex items-center gap-1.5 ${
                      col.align === 'right'
                        ? 'justify-end'
                        : col.align === 'center'
                        ? 'justify-center'
                        : ''
                    }`}
                  >
                    {col.header}
                    {col.sortable && sortKey === col.key && sortDir && (
                      <span className="text-[#00D4FF]">
                        {sortDir === 'asc' ? (
                          <ChevronUp className="w-3 h-3" />
                        ) : (
                          <ChevronDown className="w-3 h-3" />
                        )}
                      </span>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <AnimatePresence mode="popLayout">
              {paginatedData.length === 0 ? (
                <tr>
                  <td colSpan={columns.length} className="px-4 py-12 text-center">
                    <div className="flex flex-col items-center gap-3 text-white/20">
                      <Database className="w-8 h-8" />
                      <p className="text-sm">{emptyMessage}</p>
                    </div>
                  </td>
                </tr>
              ) : (
                paginatedData.map((row, rowIndex) => (
                  <motion.tr
                    key={keyExtractor(row, rowIndex)}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.3, delay: rowIndex * 0.04 }}
                    onClick={() => onRowClick?.(row, rowIndex)}
                    className={`
                      border-b border-[#1A2035]/40 last:border-b-0
                      transition-colors duration-150
                      hover:bg-[#00D4FF]/[0.03]
                      ${onRowClick ? 'cursor-pointer' : ''}
                    `}
                  >
                    {columns.map((col) => (
                      <td
                        key={col.key}
                        className={`px-4 py-3 text-sm font-['JetBrains_Mono',monospace] text-white/80 ${alignClass(col.align)}`}
                      >
                        {col.render
                          ? col.render(row, rowIndex)
                          : String((row as Record<string, unknown>)[col.key] ?? '')}
                      </td>
                    ))}
                  </motion.tr>
                ))
              )}
            </AnimatePresence>
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {pagination && totalPages > 1 && (
        <div className="flex items-center justify-between px-4 py-3 border-t border-[#1A2035]">
          <span className="text-xs text-white/30 font-['JetBrains_Mono',monospace]">
            {(page - 1) * pageSize + 1}-{Math.min(page * pageSize, sortedData.length)} of{' '}
            {sortedData.length}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage(Math.max(1, page - 1))}
              disabled={page === 1}
              className="p-1.5 rounded-md text-white/30 hover:text-white/70 hover:bg-white/5 disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter((p) => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
              .map((p, idx, arr) => (
                <span key={p} className="flex items-center">
                  {idx > 0 && arr[idx - 1] !== p - 1 && (
                    <span className="text-white/20 text-xs px-1">...</span>
                  )}
                  <button
                    onClick={() => setPage(p)}
                    className={`
                      w-7 h-7 text-xs rounded-md transition-colors
                      font-['JetBrains_Mono',monospace]
                      ${
                        p === page
                          ? 'bg-[#00D4FF]/15 text-[#00D4FF] border border-[#00D4FF]/30'
                          : 'text-white/40 hover:text-white/70 hover:bg-white/5'
                      }
                    `}
                  >
                    {p}
                  </button>
                </span>
              ))}
            <button
              onClick={() => setPage(Math.min(totalPages, page + 1))}
              disabled={page === totalPages}
              className="p-1.5 rounded-md text-white/30 hover:text-white/70 hover:bg-white/5 disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </motion.div>
  );
}
