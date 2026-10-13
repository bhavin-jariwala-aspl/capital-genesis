import { useState, useRef, Fragment } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Upload, ArrowRight, CheckCircle, AlertTriangle, RotateCcw, FileText, ChevronRight, Download } from 'lucide-react';
import { runtimeService } from '../../services/runtime.service';
import { metadataService } from '../../services/metadata.service';
import Button   from '../../components/ui/Button';
import Alert    from '../../components/ui/Alert';
import ObjectPicker, { useAllObjects } from '../../components/ui/ObjectPicker';

const STEPS = ['Upload', 'Map Fields', 'Preview', 'Execute'];

const STRATEGIES = [
  { value: 'skip',   label: 'Skip duplicates', desc: 'Only import rows with no existing match' },
  { value: 'create', label: 'Create all',       desc: 'Import every row regardless of duplicates' },
  { value: 'merge',  label: 'Merge',            desc: 'Update existing records with CSV values' },
];

// ── Sample-template generation ───────────────────────────────────────────────
// Escape a value for a CSV cell (RFC 4180): wrap in quotes when it contains a
// comma, quote, or newline, and double any embedded quotes.
const csvEscape = (v) => {
  const s = String(v ?? '');
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

// A realistic example value for a field, so uploaders see the expected format.
const sampleValue = (f) => {
  if (Array.isArray(f.options) && f.options.length) {
    return f.options[0].value ?? f.options[0].label ?? '';
  }
  const name = (f.name || '').toLowerCase();
  switch (f.field_type) {
    case 'email':                return 'jane.doe@example.com';
    case 'date':                 return '2026-01-15';
    case 'datetime':             return '2026-01-15T09:00';
    case 'checkbox':
    case 'boolean':              return 'false';
    case 'number':
      if (/(revenue|income|amount|coverage|premium|value|salary)/.test(name)) return '50000';
      if (name.includes('age'))          return '35';
      if (name.includes('probability'))  return '50';
      return '100';
    default: break;
  }
  if (/(phone|mobile|tel)/.test(name))        return '+1-555-0100';
  if (name.includes('email'))                 return 'jane.doe@example.com';
  if (name.includes('first'))                 return 'Jane';
  if (name.includes('last'))                  return 'Doe';
  if (name === 'name' || name.includes('company') || name.includes('account')) return 'Acme Corp';
  if (name.includes('city'))                  return 'San Francisco';
  if (name.includes('state'))                 return 'CA';
  if (name.includes('country'))               return 'USA';
  if (name.includes('zip') || name.includes('postal')) return '94105';
  if (name.includes('street') || name.includes('address')) return '100 Market St';
  if (name.includes('website') || name.includes('url')) return 'https://example.com';
  if (name.includes('title') || name.includes('job')) return 'Manager';
  if (name.includes('description') || name.includes('note')) return 'Sample notes';
  return `Sample ${f.label || f.name}`;
};

// Fields a user can actually supply — skip engine/auto-generated & disabled columns.
const importableFields = (fields) =>
  fields
    .filter(f => !f.config?.always_disabled && !f.config?.auto_number)
    .sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0));

// Build a two-line CSV (labels header + one example row) from an object's fields.
const buildSampleCsv = (fields) => {
  const cols = importableFields(fields);
  const use  = cols.length ? cols : fields;
  const header  = use.map(f => csvEscape(f.label || f.name)).join(',');
  const example = use.map(f => csvEscape(sampleValue(f))).join(',');
  return `${header}\r\n${example}`;
};

function StepIndicator({ current }) {
  return (
    <div className="flex items-center gap-1 mb-8">
      {STEPS.map((step, idx) => (
        <Fragment key={step}>
          <div className={`flex items-center gap-1.5 text-sm font-medium ${idx <= current ? 'text-primary-600' : 'text-gray-400'}`}>
            <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0
              ${idx < current ? 'bg-primary-600 text-on-primary' : idx === current ? 'ring-2 ring-primary-600 text-primary-600 bg-white' : 'bg-gray-100 dark:bg-white/10 text-gray-400'}`}>
              {idx < current ? '✓' : idx + 1}
            </span>
            <span className="hidden sm:inline">{step}</span>
          </div>
          {idx < STEPS.length - 1 && (
            <div className={`flex-1 h-px mx-1 ${idx < current ? 'bg-primary-300' : 'bg-gray-200 dark:bg-white/10'}`} />
          )}
        </Fragment>
      ))}
    </div>
  );
}

export default function ImportPage() {
  const qc      = useQueryClient();
  const fileRef = useRef(null);
  const [searchParams] = useSearchParams();
  const { objects } = useAllObjects();

  const [step, setStep]             = useState(0);
  const [objectId, setObjectId]     = useState(searchParams.get('object_id') || '');
  const [file, setFile]             = useState(null);
  const [fileData, setFileData]     = useState(null);
  const [headers, setHeaders]       = useState([]);
  const [mapping, setMapping]       = useState({});
  const [dedupeKeys, setDedupeKeys] = useState([]);
  const [strategy, setStrategy]     = useState('skip');
  const [jobId, setJobId]           = useState(null);
  const [preview, setPreview]       = useState(null);
  const [execResult, setExecResult] = useState(null);
  const [error, setError]           = useState(null);
  const [dragging, setDragging]     = useState(false);

  const selectedObject = objects.find(o => String(o.id) === String(objectId));
  const objectLabel    = selectedObject?.label || selectedObject?.name || '';
  const moduleLabel    = selectedObject?.module?.label || '';

  // Load object fields for the mapping step
  const fieldsQ = useQuery({
    queryKey: ['import-fields', objectId],
    queryFn:  () => metadataService.getFields(objectId),
    enabled:  !!objectId,
    staleTime: 5 * 60 * 1000,
  });
  const objectFields = fieldsQ.data?.data ?? [];

  const jobsQ = useQuery({
    queryKey: ['import-jobs', objectId],
    queryFn:  () => runtimeService.listImportJobs(objectId),
    enabled:  !!objectId && step === 0,
  });
  const jobs = jobsQ.data?.data ?? [];

  const processFile = (f) => {
    setFile(f);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text   = ev.target.result;
      const base64 = btoa(unescape(encodeURIComponent(text)));
      setFileData(base64);
      const hdrs = text.split('\n')[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
      setHeaders(hdrs);
      // Auto-map headers to matching field names
      const initMap = {};
      hdrs.forEach(h => {
        // Try to find a matching field by name or label
        const match = objectFields.find(
          f => f.name === h || f.label?.toLowerCase() === h.toLowerCase() || f.name?.toLowerCase() === h.toLowerCase()
        );
        initMap[h] = match?.name ?? h;
      });
      setMapping(initMap);
    };
    reader.readAsText(f);
  };

  const handleFileChange = (e) => {
    const f = e.target.files?.[0];
    if (f) processFile(f);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files?.[0];
    if (f) processFile(f);
  };

  const handleNextFromUpload = async () => {
    if (!objectId) return setError('Please select an object to import into.');
    if (!file)     return setError('Please choose a CSV file.');
    setError(null);
    try {
      const job = await runtimeService.createImportJob({ object_id: objectId, filename: file.name });
      setJobId(job.data.id);
      setStep(1);
    } catch (e) {
      setError(e.response?.data?.message ?? e.message);
    }
  };

  const handlePreview = async () => {
    setError(null);
    try {
      const res = await runtimeService.previewImport(jobId, {
        csv_data:      fileData,
        field_mapping: mapping,
        dedupe_keys:   dedupeKeys,
        strategy,
      });
      setPreview(res.data);
      setStep(2);
    } catch (e) {
      setError(e.response?.data?.message ?? e.message);
    }
  };

  const handleExecute = async () => {
    setError(null);
    try {
      const res = await runtimeService.executeImport(jobId, { csv_data: fileData });
      setExecResult(res.data);
      setStep(3);
      qc.invalidateQueries({ queryKey: ['import-jobs'] });
    } catch (e) {
      setError(e.response?.data?.message ?? e.message);
    }
  };

  const reset = () => {
    setStep(0); setFile(null); setFileData(null); setHeaders([]);
    setMapping({}); setDedupeKeys([]); setStrategy('skip');
    setJobId(null); setPreview(null); setExecResult(null); setError(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  // Download a ready-to-fill CSV template for the selected object. Headers come
  // from the object's own fields, plus one example row. The UTF-8 BOM makes
  // Excel open it with correct encoding.
  const downloadSample = () => {
    if (!objectFields.length) return;
    const csv  = buildSampleCsv(objectFields);
    const BOM  = String.fromCharCode(0xFEFF); // helps Excel detect UTF-8
    const blob = new Blob([BOM + csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `${selectedObject?.name || 'import'}_sample_template.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="max-w-3xl mx-auto py-8 px-4 space-y-6">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-primary-50 border border-primary-100 flex items-center justify-center shrink-0">
            <Upload className="w-5 h-5 text-primary-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Import Records</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Upload a CSV to bulk-import records into any object</p>
          </div>
        </div>
        {step > 0 && (
          <button
            onClick={reset}
            className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-white/10 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors"
          >
            <RotateCcw size={13} /> Start over
          </button>
        )}
      </div>

      <StepIndicator current={step} />

      {error && (
        <Alert variant="error">
          <div className="flex items-center gap-2">
            <AlertTriangle size={14} className="shrink-0" />
            {error}
          </div>
        </Alert>
      )}

      {/* ── Step 0: Upload ──────────────────────────────────────────────── */}
      {step === 0 && (
        <div className="space-y-5">
          {/* Object selection */}
          <div className="bg-white dark:bg-night-2 border border-gray-200 dark:border-white/10 rounded-2xl p-5">
            <ObjectPicker
              label="Import into"
              required
              value={objectId}
              onChange={setObjectId}
              placeholder="Choose an object…"
              help="Records will be created inside this object."
            />
            {selectedObject && (
              <div className="mt-3 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  {moduleLabel && (
                    <span className="text-xs px-2.5 py-1 rounded-full bg-gray-100 dark:bg-white/10 text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-white/10">
                      {moduleLabel}
                    </span>
                  )}
                  <span className="text-xs text-gray-400 truncate">
                    {objectFields.length > 0
                      ? `${objectFields.length} fields available for mapping`
                      : fieldsQ.isLoading ? 'Loading fields…' : ''}
                  </span>
                </div>
                {objectFields.length > 0 && (
                  <button
                    type="button"
                    onClick={downloadSample}
                    className="flex items-center gap-1.5 shrink-0 text-xs font-medium text-primary-600 dark:text-primary-400 hover:text-primary-800 dark:hover:text-primary-300 px-2.5 py-1.5 rounded-lg border border-primary-200 dark:border-primary-500/30 hover:bg-primary-50 dark:hover:bg-primary-500/10 transition-colors"
                    title={`Download a sample CSV template for ${objectLabel}`}
                  >
                    <Download size={13} /> Download sample CSV
                  </button>
                )}
              </div>
            )}
          </div>

          {/* File drop zone */}
          <div
            className={`border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all
              ${dragging ? 'border-primary-400 bg-primary-50/40' : 'border-gray-200 dark:border-white/10 hover:border-primary-300 hover:bg-gray-50/40'}`}
            onClick={() => fileRef.current?.click()}
            onDragOver={e => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
          >
            {file ? (
              <div className="flex items-center justify-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-green-50 border border-green-200 flex items-center justify-center">
                  <FileText className="w-5 h-5 text-green-600" />
                </div>
                <div className="text-left">
                  <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">{file.name}</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {(file.size / 1024).toFixed(1)} KB · {headers.length} columns detected
                  </p>
                </div>
              </div>
            ) : (
              <>
                <Upload className="mx-auto mb-3 text-gray-300 w-8 h-8" />
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Drop a CSV file here, or click to browse</p>
                <p className="text-xs text-gray-400 mt-1">UTF-8 encoded, comma-separated</p>
              </>
            )}
            <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={handleFileChange} />
          </div>

          {/* Recent jobs */}
          {jobs.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Recent imports</p>
              <div className="space-y-1">
                {jobs.slice(0, 5).map(j => (
                  <div key={j.id} className="flex items-center gap-3 text-xs bg-gray-50 dark:bg-white/5 border border-gray-100 dark:border-white/[0.07] rounded-xl px-4 py-2.5">
                    <FileText size={13} className="text-gray-400 shrink-0" />
                    <span className="font-medium text-gray-600 dark:text-gray-400 flex-1 truncate">{j.filename}</span>
                    <span className={`px-2 py-0.5 rounded-full font-medium
                      ${j.status === 'done' ? 'bg-emerald-100 text-emerald-700' : j.status === 'failed' ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-700'}`}>
                      {j.status}
                    </span>
                    <span className="text-gray-400 shrink-0">{new Date(j.created_at).toLocaleDateString()}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <Button
            onClick={handleNextFromUpload}
            disabled={!objectId || !file}
            className="w-full sm:w-auto"
          >
            Continue to Field Mapping <ChevronRight size={15} />
          </Button>
        </div>
      )}

      {/* ── Step 1: Map fields ──────────────────────────────────────────── */}
      {step === 1 && (
        <div className="space-y-6">
          <div className="bg-white dark:bg-night-2 border border-gray-200 dark:border-white/10 rounded-2xl p-5">
            <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-1">Map CSV columns to {objectLabel} fields</h2>
            <p className="text-xs text-gray-500 mb-5">
              Each CSV column on the left maps to a target field on the right.
              Leave a field blank to skip that column.
            </p>
            <div className="space-y-2">
              {headers.map(h => (
                <div key={h} className="flex items-center gap-3">
                  <div className="w-40 shrink-0">
                    <p className="text-xs font-mono text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 px-2.5 py-2 rounded-lg truncate">
                      {h}
                    </p>
                  </div>
                  <ArrowRight size={13} className="text-gray-300 shrink-0" />
                  <div className="flex-1 relative">
                    {objectFields.length > 0 ? (
                      <>
                        <select
                          className="form-input appearance-none pr-8 text-sm"
                          value={mapping[h] ?? ''}
                          onChange={e => setMapping(p => ({ ...p, [h]: e.target.value }))}
                        >
                          <option value="">— skip this column —</option>
                          {objectFields.map(f => (
                            <option key={f.id} value={f.name}>
                              {f.label || f.name}
                            </option>
                          ))}
                        </select>
                        <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400">
                          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                          </svg>
                        </span>
                      </>
                    ) : (
                      <input
                        className="form-input text-sm"
                        placeholder="target_field_name"
                        value={mapping[h] ?? ''}
                        onChange={e => setMapping(p => ({ ...p, [h]: e.target.value }))}
                      />
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Dedupe keys */}
          {headers.filter(h => mapping[h]).length > 0 && (
            <div className="bg-white dark:bg-night-2 border border-gray-200 dark:border-white/10 rounded-2xl p-5">
              <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-1">Deduplicate by</h3>
              <p className="text-xs text-gray-500 mb-3">
                Check the fields that uniquely identify a record. Used to detect existing rows.
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {headers.filter(h => mapping[h]).map(h => {
                  const key = mapping[h];
                  const field = objectFields.find(f => f.name === key);
                  return (
                    <label key={h} className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer py-1">
                      <input
                        type="checkbox"
                        checked={dedupeKeys.includes(key)}
                        onChange={e => setDedupeKeys(p => e.target.checked ? [...p, key] : p.filter(k => k !== key))}
                        className="rounded border-gray-300 dark:border-gray-600 text-primary-600"
                      />
                      <span className="text-sm text-gray-700 dark:text-gray-300">{field?.label || key}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          {/* Strategy */}
          <div className="bg-white dark:bg-night-2 border border-gray-200 dark:border-white/10 rounded-2xl p-5">
            <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-3">Duplicate strategy</h3>
            <div className="space-y-2.5">
              {STRATEGIES.map(s => (
                <label key={s.value} className="flex items-start gap-3 cursor-pointer group">
                  <input
                    type="radio"
                    name="strategy"
                    value={s.value}
                    checked={strategy === s.value}
                    onChange={() => setStrategy(s.value)}
                    className="mt-0.5 text-primary-600 border-gray-300 dark:border-gray-600"
                  />
                  <div>
                    <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{s.label}</p>
                    <p className="text-xs text-gray-500">{s.desc}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          <Button onClick={handlePreview}>
            Preview Import <ChevronRight size={15} />
          </Button>
        </div>
      )}

      {/* ── Step 2: Preview ─────────────────────────────────────────────── */}
      {step === 2 && preview && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: 'Total Rows',  value: preview.stats.total_rows,    color: 'text-gray-800 dark:text-gray-200',    bg: 'bg-white dark:bg-night-2' },
              { label: 'Valid',       value: preview.stats.valid_rows,     color: 'text-emerald-600', bg: 'bg-emerald-50 border-emerald-200' },
              { label: 'Duplicates', value: preview.stats.duplicate_rows,  color: 'text-amber-600',   bg: 'bg-amber-50 border-amber-200' },
              { label: 'Errors',     value: preview.stats.error_rows,      color: 'text-red-500',     bg: 'bg-red-50 border-red-200' },
            ].map(c => (
              <div key={c.label} className={`border rounded-2xl p-4 text-center ${c.bg}`}>
                <p className={`text-2xl font-bold ${c.color}`}>{c.value}</p>
                <p className="text-xs text-gray-500 mt-1">{c.label}</p>
              </div>
            ))}
          </div>

          {preview.error_sample?.length > 0 && (
            <Alert variant="error">
              <p className="font-medium mb-1.5">Sample errors</p>
              {preview.error_sample.map((e, i) => (
                <div key={i} className="text-xs font-mono opacity-80">{JSON.stringify(e)}</div>
              ))}
            </Alert>
          )}

          {preview.duplicate_sample?.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
              <p className="text-sm font-medium text-amber-800 mb-2">
                Sample duplicates (strategy: <strong>{strategy}</strong>)
              </p>
              {preview.duplicate_sample.slice(0, 3).map((d, i) => (
                <div key={i} className="text-xs text-amber-700 font-mono">
                  Match #{d.match_record_id}: {JSON.stringify(d.row)}
                </div>
              ))}
            </div>
          )}

          <div className="flex gap-3">
            <Button variant="secondary" onClick={() => setStep(1)}>Back</Button>
            <Button
              onClick={handleExecute}
              disabled={preview.stats.valid_rows === 0}
            >
              Run Import <ChevronRight size={15} />
            </Button>
          </div>
        </div>
      )}

      {/* ── Step 3: Done ────────────────────────────────────────────────── */}
      {step === 3 && execResult && (
        <div className="text-center py-14 bg-white dark:bg-night-2 rounded-2xl border border-gray-200 dark:border-white/10 space-y-5">
          <div className="w-16 h-16 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-center mx-auto">
            <CheckCircle className="w-8 h-8 text-emerald-500" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-800 dark:text-gray-200">Import complete</h2>
            <p className="text-sm text-gray-500 mt-1">
              Successfully processed into <strong>{objectLabel || 'the object'}</strong>
            </p>
          </div>
          <div className="flex justify-center gap-8 text-sm text-gray-600 dark:text-gray-400">
            <div className="text-center">
              <p className="text-3xl font-bold text-emerald-600">{execResult.created}</p>
              <p className="text-xs text-gray-500 mt-1">Created</p>
            </div>
            <div className="text-center">
              <p className="text-3xl font-bold text-primary-600">{execResult.merged ?? 0}</p>
              <p className="text-xs text-gray-500 mt-1">Merged</p>
            </div>
            <div className="text-center">
              <p className="text-3xl font-bold text-amber-500">{execResult.skipped ?? 0}</p>
              <p className="text-xs text-gray-500 mt-1">Skipped</p>
            </div>
          </div>
          <Button onClick={reset} variant="secondary">Import another file</Button>
        </div>
      )}
    </div>
  );
}
