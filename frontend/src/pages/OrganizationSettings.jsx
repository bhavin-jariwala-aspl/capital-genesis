import { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  Building2, Globe, Clock, Shield, Bell, FolderOpen, Settings as SettingsIcon, Save, Palette, ArrowRight,
} from 'lucide-react';
import { settingsService } from '../services/settings.service';
import { useCurrencyStore } from '../store/currencyStore';
import Input from '../components/ui/Input';
import Select from '../components/ui/Select';
import Checkbox from '../components/ui/Checkbox';
import Button from '../components/ui/Button';
import Spinner from '../components/ui/Spinner';
import Alert from '../components/ui/Alert';

const GROUP_ICONS = { Building2, Globe, Clock, Shield, Bell, FolderOpen, Palette };

/** Render a single setting control bound to the working-copy state. */
function SettingField({ groupKey, setting, value, onChange }) {
  const flatKey = `${groupKey}.${setting.key}`;
  const set = (v) => onChange(flatKey, v);

  if (setting.type === 'boolean') {
    return (
      <Checkbox
        label={setting.label}
        checked={!!value}
        onChange={(e) => set(e.target.checked)}
      />
    );
  }
  if (setting.type === 'select') {
    // `options` stays a plain code list (the server validates against it);
    // `option_labels` is the optional display map, e.g. "INR — Indian Rupee (₹)".
    const options = (setting.options ?? []).map((o) =>
      setting.option_labels?.[o] ? { value: o, label: setting.option_labels[o] } : o,
    );
    return (
      <Select
        label={setting.label}
        options={options}
        value={value ?? ''}
        onChange={(e) => set(e.target.value)}
        help={setting.help}
      />
    );
  }
  return (
    <Input
      label={setting.label}
      type={setting.type === 'number' ? 'number' : setting.type === 'email' ? 'email' : 'text'}
      value={value ?? ''}
      min={setting.min}
      max={setting.max}
      onChange={(e) => set(setting.type === 'number' ? e.target.value : e.target.value)}
    />
  );
}

export default function OrganizationSettings() {
  const queryClient = useQueryClient();
  const { data, isLoading, isError } = useQuery({
    queryKey: ['app-settings'],
    queryFn: settingsService.get,
  });

  const schema = useMemo(() => data?.data?.schema ?? [], [data]);
  const serverValues = useMemo(() => data?.data?.values ?? {}, [data]);
  const applyCurrency = useCurrencyStore((s) => s.applySettings);

  const [draft, setDraft] = useState({});
  const [activeGroup, setActiveGroup] = useState(null);

  // Seed the working copy whenever server data arrives.
  useEffect(() => {
    if (data?.data?.values) setDraft(data.data.values);
  }, [data]);

  useEffect(() => {
    if (!activeGroup && schema.length) setActiveGroup(schema[0].key);
  }, [schema, activeGroup]);

  const mutation = useMutation({
    mutationFn: (values) => settingsService.update(values),
    onSuccess: (res) => {
      queryClient.setQueryData(['app-settings'], res);
      if (res?.data?.values) {
        setDraft(res.data.values);
        // Push Localization straight into the currency store so every amount in
        // the app reformats immediately — no reload, no stale "$" anywhere.
        applyCurrency(res.data.values);
      }
    },
  });

  // Only send changed keys.
  const changedKeys = useMemo(
    () => Object.keys(draft).filter((k) => draft[k] !== serverValues[k]),
    [draft, serverValues],
  );
  const dirty = changedKeys.length > 0;

  const onChange = (key, val) => setDraft((d) => ({ ...d, [key]: val }));
  const handleSave = () => {
    const patch = {};
    for (const k of changedKeys) patch[k] = draft[k];
    mutation.mutate(patch);
  };
  const handleReset = () => setDraft(serverValues);

  if (isLoading) {
    return <div className="flex h-full items-center justify-center"><Spinner /></div>;
  }
  if (isError) {
    return (
      <div className="p-8">
        <Alert variant="error" title="Failed to load settings">
          Could not load application settings. Please try again.
        </Alert>
      </div>
    );
  }

  const current = schema.find((g) => g.key === activeGroup) ?? schema[0];

  return (
    <div className="min-h-full bg-surface px-4 py-6 dark:bg-transparent">
      <div className="mx-auto max-w-5xl">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary-500 to-mid-600 text-on-primary shadow-primary">
              <SettingsIcon className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Settings</h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Configuration that drives your entire workspace.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {dirty && (
              <Button variant="ghost" size="sm" onClick={handleReset} disabled={mutation.isPending}>
                Discard
              </Button>
            )}
            <Button size="sm" onClick={handleSave} loading={mutation.isPending} disabled={!dirty}>
              <Save className="h-4 w-4" />
              {dirty ? `Save${changedKeys.length ? ` (${changedKeys.length})` : ''}` : 'Saved'}
            </Button>
          </div>
        </div>

        {mutation.isError && (
          <Alert variant="error" title="Save failed" className="mb-4">
            {mutation.error?.response?.data?.error || 'Could not save settings.'}
          </Alert>
        )}
        {mutation.isSuccess && !dirty && (
          <Alert variant="success" className="mb-4">Settings saved.</Alert>
        )}

        <div className="grid grid-cols-1 gap-5 md:grid-cols-[200px_1fr]">
          {/* Group nav */}
          <nav className="flex flex-row gap-1 overflow-x-auto md:flex-col">
            {schema.map((g) => {
              const Icon = GROUP_ICONS[g.icon] ?? SettingsIcon;
              const active = g.key === activeGroup;
              return (
                <button
                  key={g.key}
                  onClick={() => setActiveGroup(g.key)}
                  className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors whitespace-nowrap ${
                    active
                      ? 'bg-primary-50 text-primary-700 dark:bg-primary-500/15 dark:text-primary-300'
                      : 'text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-white/5'
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {g.label}
                </button>
              );
            })}
          </nav>

          {/* Active group form */}
          {current && (
            <div className="card">
              <div className="card-header">
                <p className="text-sm font-semibold text-gray-900 dark:text-white">{current.label}</p>
                {current.description && (
                  <p className="text-xs text-gray-500 dark:text-gray-400">{current.description}</p>
                )}
              </div>
              {current.key === 'appearance' && (
                <Link to="/builder/appearance" className="mx-6 mt-5 flex items-center justify-between gap-3 rounded-2xl border border-primary-200/70 bg-primary-50/60 px-4 py-3 text-sm text-primary-800 hover:bg-primary-100/70 dark:border-primary-500/30 dark:bg-primary-500/10 dark:text-primary-200 transition-colors pressable">
                  <span className="flex items-center gap-3">
                    <span className="icon-chip h-9 w-9"><Palette className="h-4 w-4" /></span>
                    <span>
                      <span className="block font-semibold">Open the Appearance Studio</span>
                      <span className="block text-xs opacity-80">Theme gallery, logo upload, live preview and the sign-in page — the raw values below are here for completeness.</span>
                    </span>
                  </span>
                  <ArrowRight className="h-4 w-4 shrink-0" />
                </Link>
              )}
              <div className="card-body grid grid-cols-1 gap-4 sm:grid-cols-2">
                {current.settings.map((s) => (
                  <SettingField
                    key={s.key}
                    groupKey={current.key}
                    setting={s}
                    value={draft[`${current.key}.${s.key}`]}
                    onChange={onChange}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
