import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Bell, Send, Users, Shield, User, Clock, Plus, ExternalLink,
} from 'lucide-react';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import Modal from '../../components/ui/Modal';
import Badge from '../../components/ui/Badge';
import Spinner from '../../components/ui/Spinner';
import PageHeader from '../../components/ui/PageHeader';
import BuilderGuide from '../../components/builder/BuilderGuide';
import StatTile from '../../components/ui/StatTile';
import { builderService } from '../../services/builder.service';

const TARGET_OPTIONS = [
  { value: 'all',      label: 'All Users' },
  { value: 'role',     label: 'By Role' },
  { value: 'employee', label: 'Specific Employees' },
];

const ROLE_OPTIONS = [
  { value: 'admin',   label: 'Admin' },
  { value: 'manager', label: 'Manager' },
  { value: 'user',    label: 'User' },
];

const emptyForm = () => ({
  title: '', body: '', link: '', target_type: 'all', roles: [], employee_ids: [],
});

export default function PushNotificationsPage() {
  const qc = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(emptyForm());

  const { data: logs = [], isLoading } = useQuery({
    queryKey: ['push-notifications'],
    queryFn: () => builderService.getPushNotifications().then(r => r.data || []),
  });

  const { data: employees = [] } = useQuery({
    queryKey: ['employees-for-push'],
    queryFn: () => builderService.getEmployees().then(r => r.data || []),
    enabled: modalOpen,
  });

  const sendMut = useMutation({
    mutationFn: (d) => builderService.sendPushNotification(d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['push-notifications'] });
      setModalOpen(false);
      setForm(emptyForm());
    },
  });

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const handleSend = () => {
    const payload = {
      title: form.title,
      body: form.body || null,
      link: form.link || null,
      target_type: form.target_type,
      target_value: form.target_type === 'role'
        ? form.roles
        : form.target_type === 'employee'
          ? form.employee_ids
          : null,
    };
    sendMut.mutate(payload);
  };

  const canSend = form.title.trim() && (
    form.target_type === 'all' ||
    (form.target_type === 'role' && form.roles.length > 0) ||
    (form.target_type === 'employee' && form.employee_ids.length > 0)
  );

  const employeeOptions = employees.map(e => ({
    value: e.employee_id,
    label: `${e.employee_name} (${e.employee_id})`,
  }));

  const targetLabel = (log) => {
    if (log.target_type === 'all') return 'All Users';
    if (log.target_type === 'role') {
      const roles = Array.isArray(log.target_value) ? log.target_value : [];
      return `Roles: ${roles.join(', ')}`;
    }
    if (log.target_type === 'employee') {
      const ids = Array.isArray(log.target_value) ? log.target_value : [];
      return `${ids.length} employee${ids.length !== 1 ? 's' : ''}`;
    }
    return log.target_type;
  };

  const TargetIcon = ({ type }) => {
    if (type === 'all') return <Users className="h-3.5 w-3.5 text-blue-500" />;
    if (type === 'role') return <Shield className="h-3.5 w-3.5 text-violet-500" />;
    return <User className="h-3.5 w-3.5 text-emerald-500" />;
  };

  return (
    <div className="min-h-full bg-surface px-4 py-8">
      <div className="mx-auto max-w-5xl space-y-6">
        {/* Header */}
        <PageHeader
          icon={Bell}
          eyebrow="Builder"
          title="Push Notifications"
          subtitle="Send targeted in-app notifications to users, roles, or the entire team."
          className="!mb-0"
          actions={(
            <Button variant="primary" size="md" onClick={() => { setForm(emptyForm()); setModalOpen(true); }} className="shrink-0">
              <Plus className="h-4 w-4" /> Send Notification
            </Button>
          )}
        />

      <BuilderGuide section="/builder/push-notifications" />

        {/* Stats */}
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
          <StatTile label="Total Sent"       value={logs.length}                                              icon={Send}  tone="primary" />
          <StatTile label="Total Recipients" value={logs.reduce((s, l) => s + (l.recipient_count || 0), 0)}    icon={Users} tone="sky" />
          <StatTile label="Latest"           value={logs[0] ? new Date(logs[0].created_at).toLocaleDateString() : '\u2014'} icon={Clock} tone="amber" />
        </div>

        {/* History */}
        <div className="card overflow-hidden">
          <div className="border-b border-gray-100 dark:border-white/[0.07] px-5 py-3">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2">
              <Clock className="h-4 w-4 text-gray-400" /> Sent Notifications
            </h3>
          </div>
          {isLoading ? (
            <div className="flex justify-center py-12"><Spinner size="lg" /></div>
          ) : logs.length === 0 ? (
            <div className="px-5 py-12 text-center text-sm text-gray-400">
              No push notifications sent yet. Click &ldquo;Send Notification&rdquo; to get started.
            </div>
          ) : (
            <div className="divide-y divide-gray-50 dark:divide-white/[0.04]">
              {logs.map(log => (
                <div key={log.id} className="flex items-center gap-4 px-5 py-3 hover:bg-gray-50/50 dark:hover:bg-white/[0.02]">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-rose-50">
                    <Send className="h-4 w-4 text-rose-600" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{log.title}</p>
                    {log.body && <p className="text-xs text-gray-400 truncate">{log.body}</p>}
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-gray-500">
                    <TargetIcon type={log.target_type} />
                    {targetLabel(log)}
                  </div>
                  <Badge variant="default" className="text-xs">
                    {log.recipient_count} recipient{log.recipient_count !== 1 ? 's' : ''}
                  </Badge>
                  {log.link && (
                    <a href={log.link} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:text-blue-700">
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  )}
                  <div className="text-xs text-gray-400 whitespace-nowrap">
                    {new Date(log.created_at).toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Send Modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Send Push Notification" size="lg">
        <div className="space-y-4">
          <Input
            label="Title"
            required
            placeholder="Important: Q4 pricing update"
            value={form.title}
            onChange={e => set('title', e.target.value)}
          />
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Message</label>
            <textarea
              className="form-input resize-none"
              rows={3}
              placeholder="Details about this notification..."
              value={form.body}
              onChange={e => set('body', e.target.value)}
            />
          </div>
          <Input
            label="Link (optional)"
            placeholder="/quotes or https://..."
            value={form.link}
            onChange={e => set('link', e.target.value)}
          />

          <Select
            label="Target Audience"
            options={TARGET_OPTIONS}
            value={form.target_type}
            onChange={e => set('target_type', e.target.value)}
          />

          {form.target_type === 'role' && (
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Select Roles</label>
              <div className="flex flex-wrap gap-2">
                {ROLE_OPTIONS.map(r => (
                  <label key={r.value} className="flex items-center gap-1.5 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.roles.includes(r.value)}
                      onChange={e => {
                        set('roles', e.target.checked
                          ? [...form.roles, r.value]
                          : form.roles.filter(x => x !== r.value));
                      }}
                      className="rounded border-gray-300"
                    />
                    {r.label}
                  </label>
                ))}
              </div>
            </div>
          )}

          {form.target_type === 'employee' && (
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Select Employees</label>
              <div className="max-h-40 overflow-y-auto rounded-lg border border-gray-200 dark:border-white/10 divide-y divide-gray-50 dark:divide-white/[0.04]">
                {employeeOptions.length === 0 ? (
                  <p className="px-3 py-4 text-sm text-gray-400 text-center">Loading employees...</p>
                ) : (
                  employeeOptions.map(e => (
                    <label key={e.value} className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer hover:bg-gray-50 dark:hover:bg-white/5">
                      <input
                        type="checkbox"
                        checked={form.employee_ids.includes(e.value)}
                        onChange={ev => {
                          set('employee_ids', ev.target.checked
                            ? [...form.employee_ids, e.value]
                            : form.employee_ids.filter(x => x !== e.value));
                        }}
                        className="rounded border-gray-300"
                      />
                      {e.label}
                    </label>
                  ))
                )}
              </div>
              {form.employee_ids.length > 0 && (
                <p className="text-xs text-gray-500">{form.employee_ids.length} selected</p>
              )}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setModalOpen(false)} disabled={sendMut.isPending}>Cancel</Button>
            <Button variant="primary" onClick={handleSend} loading={sendMut.isPending} disabled={!canSend}>
              <Send className="h-3.5 w-3.5" /> Send Notification
            </Button>
          </div>

          {sendMut.isError && (
            <p className="text-sm text-red-500">Failed to send: {sendMut.error?.message || 'Unknown error'}</p>
          )}
        </div>
      </Modal>
    </div>
  );
}
