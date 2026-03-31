import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useDropzone } from 'react-dropzone';
import {
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  ArrowLeft,
  MapPin,
  Eye,
  Zap,
  ExternalLink,
  SkipForward,
  Loader2,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import HudPanel from '../components/ui/HudPanel';
import DataTable, { Column } from '../components/ui/DataTable';
import Button from '../components/ui/Button';
import Select from '../components/ui/Select';
import GlowBadge from '../components/ui/GlowBadge';
import { csv, statements } from '../services/api';
import { formatCurrency, formatDate } from '../utils/format';
import type { CsvUpload as CsvUploadType } from '../types';

// ── Constants ───────────────────────────────────────────────────────────────

const REQUIRED_FIELDS = ['date', 'description', 'amount'] as const;
const OPTIONAL_FIELDS = ['category'] as const;
const ALL_FIELDS = [...REQUIRED_FIELDS, ...OPTIONAL_FIELDS];

const FIELD_LABELS: Record<string, string> = {
  date: 'Date',
  description: 'Description',
  amount: 'Amount',
  category: 'Category (optional)',
};

// Auto-detect common Citibank column name patterns
const COLUMN_HINTS: Record<string, string[]> = {
  date: ['date', 'transaction date', 'trans date', 'posting date', 'post date', 'debit date'],
  description: ['description', 'desc', 'memo', 'narrative', 'details', 'transaction description', 'merchant'],
  amount: ['amount', 'debit', 'credit', 'value', 'transaction amount', 'debit amount'],
  category: ['category', 'type', 'transaction type', 'trans type'],
};

function autoDetectMapping(columns: string[]): Record<string, string> {
  const mapping: Record<string, string> = {};
  for (const field of ALL_FIELDS) {
    const hints = COLUMN_HINTS[field] || [];
    const match = columns.find((col) =>
      hints.some((hint) => col.toLowerCase().trim() === hint)
    );
    if (match) mapping[field] = match;
  }
  return mapping;
}

// ── Step indicator ──────────────────────────────────────────────────────────

const STEPS = [
  { num: 1, label: 'Upload', icon: Upload },
  { num: 2, label: 'Map Columns', icon: MapPin },
  { num: 3, label: 'Review', icon: Eye },
  { num: 4, label: 'Complete', icon: CheckCircle2 },
];

function StepIndicator({ current }: { current: number }) {
  return (
    <div className="flex items-center justify-center gap-2 mb-8">
      {STEPS.map((step, idx) => {
        const isActive = step.num === current;
        const isCompleted = step.num < current;
        const StepIcon = step.icon;
        return (
          <div key={step.num} className="flex items-center gap-2">
            <motion.div
              animate={{
                scale: isActive ? 1.1 : 1,
                boxShadow: isActive ? '0 0 20px rgba(0,212,255,0.4)' : '0 0 0px transparent',
              }}
              className={`
                flex items-center gap-2 px-4 py-2 rounded-full border text-xs font-semibold uppercase tracking-wider transition-all duration-300
                ${
                  isActive
                    ? 'bg-[#00D4FF]/15 border-[#00D4FF]/50 text-[#00D4FF]'
                    : isCompleted
                    ? 'bg-[#00FF88]/10 border-[#00FF88]/30 text-[#00FF88]'
                    : 'bg-[#0D1321]/60 border-[#1A2035] text-white/30'
                }
              `}
            >
              {isCompleted ? (
                <CheckCircle2 className="w-3.5 h-3.5" />
              ) : (
                <StepIcon className="w-3.5 h-3.5" />
              )}
              {step.label}
            </motion.div>
            {idx < STEPS.length - 1 && (
              <div
                className={`w-8 h-[1px] ${
                  isCompleted ? 'bg-[#00FF88]/40' : 'bg-[#1A2035]'
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Slide transition variants ───────────────────────────────────────────────

const slideVariants = {
  enter: (direction: number) => ({
    x: direction > 0 ? 300 : -300,
    opacity: 0,
  }),
  center: {
    x: 0,
    opacity: 1,
  },
  exit: (direction: number) => ({
    x: direction > 0 ? -300 : 300,
    opacity: 0,
  }),
};

// ── Main Component ──────────────────────────────────────────────────────────

export default function CsvUploadPage() {
  const navigate = useNavigate();

  // Step state
  const [step, setStep] = useState(1);
  const [direction, setDirection] = useState(1);

  // Upload state
  const [uploadId, setUploadId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [fileName, setFileName] = useState('');
  const [rowCount, setRowCount] = useState(0);

  // Mapping state
  const [columns, setColumns] = useState<string[]>([]);
  const [sampleData, setSampleData] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [saveMapping, setSaveMapping] = useState(true);
  const [loadingMapping, setLoadingMapping] = useState(false);

  // PDF / Statement state
  const [isPdf, setIsPdf] = useState(false);
  const [statementSummary, setStatementSummary] = useState<{
    period?: string | { start: string; end: string };
    beginningBalance?: number;
    endingBalance?: number;
    totalDebits?: number;
    totalCredits?: number;
    calculatedEndingBalance?: number;
  } | null>(null);

  // Import state
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{
    imported: number;
    duplicatesSkipped: number;
  } | null>(null);
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const [previewData, setPreviewData] = useState<
    Array<{ date: string; description: string; amount: string; type?: string; category: string; isDuplicate?: boolean }>
  >([]);

  // Upload history
  const [uploads, setUploads] = useState<CsvUploadType[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);

  // ── Step navigation ───────────────────────────────────────────────────────

  const goToStep = (target: number) => {
    setDirection(target > step ? 1 : -1);
    setStep(target);
  };

  // ── Load upload history ───────────────────────────────────────────────────

  const loadHistory = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const data = await csv.getUploads();
      setUploads(Array.isArray(data) ? data : []);
    } catch {
      // Silent fail
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  // ── Dropzone ──────────────────────────────────────────────────────────────

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    if (acceptedFiles.length === 0) return;
    const file = acceptedFiles[0];
    const fileIsPdf = file.name.toLowerCase().endsWith('.pdf');
    setFileName(file.name);
    setIsPdf(fileIsPdf);
    setUploading(true);
    setUploadError(null);

    try {
      if (fileIsPdf) {
        // PDF statement upload — auto-parsed with categories
        const result = await statements.uploadStatement(file);
        setUploadId(result.id || result.fileUploadId || null);
        const txns = result.transactions || [];
        setRowCount(txns.length);

        // Store statement summary if available
        if (result.summary) {
          setStatementSummary(result.summary);
        }

        // Build preview from parsed transactions
        const preview = txns.map((t: any) => ({
          date: t.date || '',
          description: t.description || '',
          amount: String(t.amount || ''),
          type: t.type || (Number(t.amount) >= 0 ? 'income' : 'expense'),
          category: t.category || 'Uncategorized',
          isDuplicate: t.isDuplicate || false,
        }));
        setPreviewData(preview);

        // Skip column mapping for PDF — go straight to review
        goToStep(3);
      } else {
        // CSV upload — existing flow
        const result = await csv.upload(file);
        setUploadId(result.id);
        setRowCount(result.rowCount);

        // Load column mapping info
        setLoadingMapping(true);
        const mappingInfo = await csv.getMapping(result.id);
        setColumns(mappingInfo.columns);
        setSampleData(mappingInfo.sampleData);

        // Auto-detect column mapping
        const detected =
          mappingInfo.suggestedMapping && Object.keys(mappingInfo.suggestedMapping).length > 0
            ? mappingInfo.suggestedMapping
            : autoDetectMapping(mappingInfo.columns);
        setMapping(detected);
        setLoadingMapping(false);

        goToStep(2);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Upload failed';
      setUploadError(message);
    } finally {
      setUploading(false);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'text/csv': ['.csv'], 'application/pdf': ['.pdf'] },
    maxFiles: 1,
    disabled: uploading,
  });

  // ── Mapping handlers ──────────────────────────────────────────────────────

  const updateMapping = (field: string, column: string) => {
    setMapping((prev) => {
      const next = { ...prev };
      if (column) {
        next[field] = column;
      } else {
        delete next[field];
      }
      return next;
    });
  };

  const isMappingValid = REQUIRED_FIELDS.every((f) => mapping[f]);

  const handleProceedToReview = async () => {
    if (!uploadId || !isMappingValid) return;

    if (saveMapping) {
      try {
        await csv.saveMapping(uploadId, mapping);
      } catch {
        // Non-blocking
      }
    }

    // Build preview from sample data using current mapping
    const preview = sampleData.map((row) => ({
      date: row[mapping.date] || '',
      description: row[mapping.description] || '',
      amount: row[mapping.amount] || '',
      category: mapping.category ? row[mapping.category] || 'Uncategorized' : 'Uncategorized',
      isDuplicate: false, // Backend will determine actual duplicates during import
    }));
    setPreviewData(preview);
    goToStep(3);
  };

  // ── Import handler ────────────────────────────────────────────────────────

  const handleImport = async () => {
    setImporting(true);
    try {
      if (isPdf) {
        // PDF statement import — send parsed transactions directly
        const txnsToImport = skipDuplicates
          ? previewData.filter((t) => !t.isDuplicate)
          : previewData;
        const result = await statements.importStatement({
          transactions: txnsToImport.map((t) => ({
            date: t.date,
            description: t.description,
            amount: t.amount,
            type: t.type,
            category: t.category,
          })),
          fileUploadId: uploadId || undefined,
          endingBalance: statementSummary?.endingBalance,
          statementDate: typeof statementSummary?.period === 'object' ? statementSummary.period.end : undefined,
        });
        setImportResult({
          imported: result.importedCount ?? result.imported ?? txnsToImport.length,
          duplicatesSkipped: result.duplicatesSkipped ?? 0,
        });
      } else {
        if (!uploadId) return;
        const importMapping = { ...mapping };
        if (skipDuplicates) {
          (importMapping as Record<string, string>)._skipDuplicates = 'true';
        }
        const result = await csv.import(uploadId, importMapping);
        setImportResult({
          imported: result.importedCount,
          duplicatesSkipped: result.errorCount,
        });
      }
      goToStep(4);
      loadHistory();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Import failed';
      setUploadError(message);
    } finally {
      setImporting(false);
    }
  };

  // ── Reset to upload another ───────────────────────────────────────────────

  const handleReset = () => {
    setStep(1);
    setDirection(-1);
    setUploadId(null);
    setFileName('');
    setRowCount(0);
    setColumns([]);
    setSampleData([]);
    setMapping({});
    setPreviewData([]);
    setImportResult(null);
    setUploadError(null);
    setIsPdf(false);
    setStatementSummary(null);
  };

  // ── Upload history table columns ──────────────────────────────────────────

  const historyColumns: Column<CsvUploadType>[] = [
    {
      key: 'filename',
      header: 'Filename',
      render: (row) => (
        <div className="flex items-center gap-2">
          <FileSpreadsheet className="w-4 h-4 text-[#00D4FF]/60" />
          <span className="text-white/80">{row.filename}</span>
        </div>
      ),
    },
    {
      key: 'rowCount',
      header: 'Rows',
      align: 'center',
      render: (row) => (
        <span className="font-mono text-white/60">{row.rowCount}</span>
      ),
    },
    {
      key: 'importedCount',
      header: 'Imported',
      align: 'center',
      render: (row) => (
        <span className="font-mono text-[#00FF88]">{row.importedCount}</span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      align: 'center',
      render: (row) => {
        const statusMap: Record<string, 'good' | 'warning' | 'danger'> = {
          imported: 'good',
          pending: 'warning',
          mapped: 'warning',
          failed: 'danger',
        };
        return <GlowBadge status={statusMap[row.status] || 'warning'} label={row.status} />;
      },
    },
    {
      key: 'createdAt',
      header: 'Upload Date',
      render: (row) => (
        <span className="text-white/50 font-mono text-xs">
          {formatDate(row.createdAt, 'MMM d, yyyy HH:mm')}
        </span>
      ),
    },
  ];

  // ── Render steps ──────────────────────────────────────────────────────────

  const renderStep1 = () => (
    <div className="space-y-6">
      {/* Dropzone */}
      <div
        {...getRootProps()}
        className={`
          relative cursor-pointer rounded-lg p-12 text-center transition-all duration-300
          border-2 border-dashed
          ${
            isDragActive
              ? 'border-[#00D4FF] bg-[#00D4FF]/5 shadow-[0_0_40px_rgba(0,212,255,0.15)]'
              : 'border-[#1A2035] hover:border-[#00D4FF]/40 hover:bg-[#00D4FF]/3'
          }
          ${uploading ? 'pointer-events-none opacity-60' : ''}
        `}
      >
        <input {...getInputProps()} />

        {/* Animated corner brackets for HUD feel */}
        <div className="absolute top-2 left-2 w-6 h-6 border-t-2 border-l-2 border-[#00D4FF]/30" />
        <div className="absolute top-2 right-2 w-6 h-6 border-t-2 border-r-2 border-[#00D4FF]/30" />
        <div className="absolute bottom-2 left-2 w-6 h-6 border-b-2 border-l-2 border-[#00D4FF]/30" />
        <div className="absolute bottom-2 right-2 w-6 h-6 border-b-2 border-r-2 border-[#00D4FF]/30" />

        {uploading ? (
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="w-12 h-12 text-[#00D4FF] animate-spin" />
            <p className="text-sm text-[#00D4FF] font-semibold uppercase tracking-wider">
              Processing upload...
            </p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4">
            <motion.div
              animate={isDragActive ? { scale: 1.15, y: -5 } : { scale: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className="p-4 rounded-full bg-[#00D4FF]/10"
              style={{ boxShadow: isDragActive ? '0 0 30px rgba(0,212,255,0.3)' : 'none' }}
            >
              <Upload className="w-10 h-10 text-[#00D4FF]" />
            </motion.div>
            <div>
              <p className="text-lg font-bold text-white/90 uppercase tracking-wide mb-1">
                {isDragActive ? 'Release to Upload' : 'Drop Citibank Statement Here'}
              </p>
              <p className="text-sm text-white/40">
                or click to browse your files. Accepts PDF statements and CSV exports.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Error display */}
      {uploadError && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-3 px-4 py-3 bg-[#FF3B3B]/10 border border-[#FF3B3B]/30 rounded-lg"
        >
          <AlertTriangle className="w-4 h-4 text-[#FF3B3B] flex-shrink-0" />
          <span className="text-sm text-[#FF3B3B]">{uploadError}</span>
        </motion.div>
      )}
    </div>
  );

  const renderStep2 = () => (
    <div className="space-y-6">
      {/* Info bar */}
      <div className="flex items-center justify-between px-4 py-3 bg-[#00D4FF]/5 border border-[#00D4FF]/20 rounded-lg">
        <div className="flex items-center gap-3">
          <FileSpreadsheet className="w-4 h-4 text-[#00D4FF]" />
          <span className="text-sm text-white/70">
            <span className="text-white font-medium">{fileName}</span> — {rowCount} rows detected
          </span>
        </div>
      </div>

      {/* Preview table */}
      {sampleData.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wider text-white/40 mb-3">
            Preview (first {sampleData.length} rows)
          </h4>
          <div className="overflow-x-auto rounded-lg border border-[#1A2035]">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[#1A2035] bg-[#0D1321]/60">
                  {columns.map((col) => (
                    <th
                      key={col}
                      className="px-3 py-2 text-left font-semibold uppercase tracking-wider text-white/40"
                    >
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sampleData.map((row, idx) => (
                  <tr key={idx} className="border-b border-[#1A2035]/30">
                    {columns.map((col) => (
                      <td key={col} className="px-3 py-2 text-white/60 font-mono">
                        {row[col] || '—'}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Column mapping */}
      <div>
        <h4 className="text-xs font-semibold uppercase tracking-wider text-white/40 mb-3">
          Column Mapping
        </h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {ALL_FIELDS.map((field) => (
            <div key={field}>
              <Select
                label={FIELD_LABELS[field]}
                options={columns.map((c) => ({ value: c, label: c }))}
                value={mapping[field] || ''}
                onChange={(e) => updateMapping(field, e.target.value)}
                placeholder={`Map to ${field}...`}
              />
              {REQUIRED_FIELDS.includes(field as typeof REQUIRED_FIELDS[number]) && !mapping[field] && (
                <p className="mt-1 text-xs text-[#FFB800]">Required</p>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Save mapping checkbox */}
      <label className="flex items-center gap-3 cursor-pointer group">
        <div
          className={`
            w-5 h-5 rounded border flex items-center justify-center transition-all
            ${
              saveMapping
                ? 'bg-[#00D4FF]/20 border-[#00D4FF]/50'
                : 'bg-transparent border-[#1A2035] group-hover:border-[#00D4FF]/30'
            }
          `}
          onClick={() => setSaveMapping(!saveMapping)}
        >
          {saveMapping && <CheckCircle2 className="w-3.5 h-3.5 text-[#00D4FF]" />}
        </div>
        <span className="text-sm text-white/60">Save mapping for future uploads</span>
      </label>

      {/* Navigation */}
      <div className="flex items-center justify-between pt-4 border-t border-[#1A2035]">
        <Button variant="ghost" icon={<ArrowLeft className="w-4 h-4" />} onClick={handleReset}>
          Back
        </Button>
        <Button
          variant="primary"
          icon={<ArrowRight className="w-4 h-4" />}
          onClick={handleProceedToReview}
          disabled={!isMappingValid}
          loading={loadingMapping}
        >
          Review Import
        </Button>
      </div>
    </div>
  );

  const handleRecategorize = (idx: number, newCategory: string) => {
    setPreviewData((prev) => {
      const updated = [...prev];
      updated[idx] = { ...updated[idx], category: newCategory };
      return updated;
    });
  };

  const renderStep3 = () => (
    <div className="space-y-6">
      {/* Summary bar */}
      <div className="flex items-center justify-between px-4 py-3 bg-[#00D4FF]/5 border border-[#00D4FF]/20 rounded-lg">
        <div className="flex items-center gap-4">
          <span className="text-sm text-white/70">
            <span className="text-white font-semibold font-mono">{previewData.length}</span> transactions ready
            {isPdf && <GlowBadge status="good" label="PDF" />}
          </span>
          {previewData.some((r) => r.isDuplicate) && (
            <span className="text-sm text-[#FFB800]">
              <AlertTriangle className="w-3.5 h-3.5 inline mr-1" />
              {previewData.filter((r) => r.isDuplicate).length} potential duplicates
            </span>
          )}
        </div>
      </div>

      {/* Statement Import Summary (PDF only) */}
      {isPdf && statementSummary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {statementSummary.period && (
            <div className="px-4 py-3 bg-[#0D1321]/80 border border-[#1A2035] rounded-lg">
              <p className="text-[10px] uppercase tracking-wider text-white/40 mb-1">Statement Period</p>
              <p className="text-sm font-mono text-white/80">
                {typeof statementSummary.period === 'object'
                  ? `${statementSummary.period.start} – ${statementSummary.period.end}`
                  : statementSummary.period}
              </p>
            </div>
          )}
          {statementSummary.beginningBalance != null && (
            <div className="px-4 py-3 bg-[#0D1321]/80 border border-[#1A2035] rounded-lg">
              <p className="text-[10px] uppercase tracking-wider text-white/40 mb-1">Beginning Balance</p>
              <p className="text-sm font-mono text-white/80">
                {formatCurrency(statementSummary.beginningBalance, { decimals: 2 })}
              </p>
            </div>
          )}
          {statementSummary.endingBalance != null && (
            <div className="px-4 py-3 bg-[#0D1321]/80 border border-[#1A2035] rounded-lg">
              <p className="text-[10px] uppercase tracking-wider text-white/40 mb-1">Ending Balance</p>
              <p className="text-sm font-mono text-white/80">
                {formatCurrency(statementSummary.endingBalance, { decimals: 2 })}
              </p>
            </div>
          )}
          {statementSummary.totalDebits != null && statementSummary.totalCredits != null && (
            <div className="px-4 py-3 bg-[#0D1321]/80 border border-[#1A2035] rounded-lg">
              <p className="text-[10px] uppercase tracking-wider text-white/40 mb-1">Debits / Credits</p>
              <p className="text-sm font-mono">
                <span className="text-[#FF3B3B]">{formatCurrency(statementSummary.totalDebits, { decimals: 2 })}</span>
                {' / '}
                <span className="text-[#00FF88]">{formatCurrency(statementSummary.totalCredits, { decimals: 2 })}</span>
              </p>
            </div>
          )}
          {statementSummary.beginningBalance != null && statementSummary.endingBalance != null && statementSummary.calculatedEndingBalance != null && (
            <div className="px-4 py-3 bg-[#0D1321]/80 border border-[#1A2035] rounded-lg col-span-2 md:col-span-4">
              <p className="text-[10px] uppercase tracking-wider text-white/40 mb-1">Balance Verification</p>
              <p className="text-sm font-mono">
                <span className="text-white/60">Calculated: </span>
                <span className={
                  Math.abs(statementSummary.calculatedEndingBalance - statementSummary.endingBalance) < 0.01
                    ? 'text-[#00FF88]'
                    : 'text-[#FFB800]'
                }>
                  {formatCurrency(statementSummary.calculatedEndingBalance, { decimals: 2 })}
                </span>
                <span className="text-white/40 mx-2">vs</span>
                <span className="text-white/60">Stated: </span>
                <span className="text-white/80">{formatCurrency(statementSummary.endingBalance, { decimals: 2 })}</span>
                {Math.abs(statementSummary.calculatedEndingBalance - statementSummary.endingBalance) < 0.01 ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-[#00FF88] inline ml-2" />
                ) : (
                  <AlertTriangle className="w-3.5 h-3.5 text-[#FFB800] inline ml-2" />
                )}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Categorized preview */}
      <div>
        <h4 className="text-xs font-semibold uppercase tracking-wider text-white/40 mb-3">
          Categorized Preview
        </h4>
        <div className="overflow-x-auto rounded-lg border border-[#1A2035]">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-[#1A2035] bg-[#0D1321]/60">
                <th className="px-3 py-2 text-left font-semibold uppercase tracking-wider text-white/40">
                  Status
                </th>
                <th className="px-3 py-2 text-left font-semibold uppercase tracking-wider text-white/40">
                  Date
                </th>
                <th className="px-3 py-2 text-left font-semibold uppercase tracking-wider text-white/40">
                  Description
                </th>
                <th className="px-3 py-2 text-right font-semibold uppercase tracking-wider text-white/40">
                  Amount
                </th>
                <th className="px-3 py-2 text-left font-semibold uppercase tracking-wider text-white/40">
                  Category
                </th>
              </tr>
            </thead>
            <tbody>
              {previewData.map((row, idx) => (
                <tr
                  key={idx}
                  className={`border-b border-[#1A2035]/30 ${
                    row.isDuplicate ? 'bg-[#FFB800]/5' : ''
                  }`}
                >
                  <td className="px-3 py-2">
                    {row.isDuplicate ? (
                      <span className="text-[#FFB800] text-xs flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" /> Duplicate
                      </span>
                    ) : (
                      <span className="text-[#00FF88] text-xs flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" /> New
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-white/60 font-mono">{row.date}</td>
                  <td className="px-3 py-2 text-white/80">{row.description}</td>
                  <td className="px-3 py-2 text-right text-white/70 font-mono">{row.amount}</td>
                  <td className="px-3 py-2">
                    {isPdf ? (
                      <select
                        value={row.category}
                        onChange={(e) => handleRecategorize(idx, e.target.value)}
                        className="bg-[#0D1321] border border-[#1A2035] rounded px-2 py-0.5 text-xs text-[#00D4FF] focus:border-[#00D4FF]/50 outline-none"
                      >
                        <option value={row.category}>{row.category}</option>
                        <option value="COGS">COGS</option>
                        <option value="Sales & Marketing">Sales &amp; Marketing</option>
                        <option value="Infrastructure">Infrastructure</option>
                        <option value="Payroll">Payroll</option>
                        <option value="Software">Software</option>
                        <option value="Subscriptions">Subscriptions</option>
                        <option value="Utilities">Utilities</option>
                        <option value="Travel">Travel</option>
                        <option value="Office">Office</option>
                        <option value="Insurance">Insurance</option>
                        <option value="Taxes">Taxes</option>
                        <option value="Revenue">Revenue</option>
                        <option value="Consulting">Consulting</option>
                        <option value="Rent">Rent</option>
                        <option value="Equipment">Equipment</option>
                        <option value="Uncategorized">Uncategorized</option>
                      </select>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#00D4FF]/10 text-[#00D4FF] text-xs">
                        {row.category}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Skip duplicates option */}
      <label className="flex items-center gap-3 cursor-pointer group">
        <div
          className={`
            w-5 h-5 rounded border flex items-center justify-center transition-all
            ${
              skipDuplicates
                ? 'bg-[#FFB800]/20 border-[#FFB800]/50'
                : 'bg-transparent border-[#1A2035] group-hover:border-[#FFB800]/30'
            }
          `}
          onClick={() => setSkipDuplicates(!skipDuplicates)}
        >
          {skipDuplicates && <SkipForward className="w-3.5 h-3.5 text-[#FFB800]" />}
        </div>
        <span className="text-sm text-white/60">
          Skip duplicate transactions (match on date + amount + description)
        </span>
      </label>

      {/* Error display */}
      {uploadError && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-3 px-4 py-3 bg-[#FF3B3B]/10 border border-[#FF3B3B]/30 rounded-lg"
        >
          <AlertTriangle className="w-4 h-4 text-[#FF3B3B] flex-shrink-0" />
          <span className="text-sm text-[#FF3B3B]">{uploadError}</span>
        </motion.div>
      )}

      {/* Navigation */}
      <div className="flex items-center justify-between pt-4 border-t border-[#1A2035]">
        <Button variant="ghost" icon={<ArrowLeft className="w-4 h-4" />} onClick={() => isPdf ? handleReset() : goToStep(2)}>
          Back
        </Button>
        <Button
          variant="primary"
          icon={<Zap className="w-4 h-4" />}
          onClick={handleImport}
          loading={importing}
        >
          Import Transactions
        </Button>
      </div>
    </div>
  );

  const renderStep4 = () => (
    <div className="flex flex-col items-center justify-center py-12 space-y-6">
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: 'spring', stiffness: 200, damping: 15 }}
        className="p-6 rounded-full bg-[#00FF88]/10"
        style={{ boxShadow: '0 0 40px rgba(0,255,136,0.2)' }}
      >
        <CheckCircle2 className="w-16 h-16 text-[#00FF88]" />
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="text-center space-y-2"
      >
        <h2 className="text-2xl font-bold text-white">Import Complete</h2>
        <p className="text-lg text-[#00FF88] font-mono">
          {importResult?.imported ?? 0} transactions imported, sir
        </p>
        {(importResult?.duplicatesSkipped ?? 0) > 0 && (
          <p className="text-sm text-[#FFB800]">
            {importResult?.duplicatesSkipped} duplicates skipped
          </p>
        )}
      </motion.div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.6 }}
        className="flex items-center gap-4"
      >
        <Button
          variant="primary"
          icon={<ExternalLink className="w-4 h-4" />}
          onClick={() => navigate('/transactions')}
        >
          View Transactions
        </Button>
        <Button variant="ghost" icon={<Upload className="w-4 h-4" />} onClick={handleReset}>
          Upload Another
        </Button>
      </motion.div>
    </div>
  );

  const stepRenderers: Record<number, () => React.ReactNode> = {
    1: renderStep1,
    2: renderStep2,
    3: renderStep3,
    4: renderStep4,
  };

  // ── Main Render ───────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Page header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <h1 className="text-2xl font-bold text-white tracking-tight">
          Statement Import
        </h1>
        <p className="text-sm text-white/40 mt-1">
          Upload and import Citibank PDF statements or CSV transaction files
        </p>
      </motion.div>

      {/* Upload Flow */}
      <HudPanel delay={0.1}>
        <StepIndicator current={step} />

        <AnimatePresence mode="wait" custom={direction}>
          <motion.div
            key={step}
            custom={direction}
            variants={slideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] }}
          >
            {stepRenderers[step]?.()}
          </motion.div>
        </AnimatePresence>
      </HudPanel>

      {/* Upload History */}
      <HudPanel title="Upload History" delay={0.2}>
        {loadingHistory ? (
          <div className="flex items-center justify-center py-8">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
              className="w-6 h-6 border-2 border-[#00D4FF]/20 border-t-[#00D4FF] rounded-full"
            />
          </div>
        ) : (
          <DataTable
            columns={historyColumns}
            data={uploads}
            keyExtractor={(row) => row.id}
            emptyMessage="No CSV files uploaded yet. Drop a file above to get started."
          />
        )}
      </HudPanel>
    </div>
  );
}
