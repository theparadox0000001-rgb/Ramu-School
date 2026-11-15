import React, { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  Bell,
  Database,
  RefreshCw,
  Send,
  Settings,
  ShieldAlert,
  Trash2,
} from 'lucide-react';
import type {
  NotificationItem,
  PlatformConfig,
  SystemHealthMetrics,
} from '../../types/portal';
import { portalApi } from '../../services/api';

interface AdminPlatformControlPanelProps {
  onNotify: (msg: string) => void;
  onConfigUpdated?: () => Promise<void> | void;
}

const EXPLORER_TABLES = [
  'users',
  'batches',
  'courses',
  'coupons',
  'orders',
  'enrollments',
  'mock_tests',
  'dpp_sheets',
  'questions',
  'chapters',
  'live_classes',
  'community_posts',
  'mentorship_sessions',
  'notifications',
  'scholarships',
  'support_tickets',
  'admin_audit_logs',
];

export const AdminPlatformControlPanel: React.FC<AdminPlatformControlPanelProps> = ({
  onNotify,
  onConfigUpdated,
}) => {
  const [health, setHealth] = useState<SystemHealthMetrics | null>(null);
  const [config, setConfig] = useState<PlatformConfig | null>(null);
  const [selectedTable, setSelectedTable] = useState('users');
  const [tableRows, setTableRows] = useState<Array<Record<string, unknown>>>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');

  // Broadcast form
  const [bcTitle, setBcTitle] = useState('');
  const [bcBody, setBcBody] = useState('');
  const [bcCategory, setBcCategory] = useState<NotificationItem['category']>('Announcement');

  const loadHealthAndConfig = useCallback(async () => {
    setLoading(true);
    setErrorMsg('');
    try {
      const [h, c, tbl] = await Promise.all([
        portalApi.getAdminSystemHealth(),
        portalApi.getAdminConfig(),
        portalApi.getAdminTableRows(selectedTable),
      ]);
      setHealth(h);
      setConfig(c.config);
      setTableRows(tbl.rows);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to load OS control data.');
    } finally {
      setLoading(false);
    }
  }, [selectedTable]);

  useEffect(() => {
    void loadHealthAndConfig();
  }, [loadHealthAndConfig]);

  const handleToggleFlag = async (key: keyof PlatformConfig, value: boolean | number | string) => {
    if (!config) return;
    setErrorMsg('');
    try {
      const res = await portalApi.updateAdminConfig({ [key]: value });
      setConfig(res.config);
      onNotify(`Updated platform setting "${String(key)}".`);
      if (onConfigUpdated) await onConfigUpdated();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to update platform setting.');
    }
  };

  const handleBroadcast = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bcTitle.trim() || !bcBody.trim()) return;
    try {
      await portalApi.broadcastAdminNotification({
        title: bcTitle.trim(),
        body: bcBody.trim(),
        category: bcCategory,
        userId: 'ALL',
      });
      onNotify(`Broadcast notification "${bcTitle.trim()}" pushed to all users.`);
      setBcTitle('');
      setBcBody('');
      await loadHealthAndConfig();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Broadcast failed.');
    }
  };

  const handleDeleteTableRow = async (row: Record<string, unknown>) => {
    const pk = String(row.id ?? row.code ?? '');
    if (!pk) return;
    try {
      await portalApi.deleteAdminTableRow(selectedTable, pk);
      onNotify(`Deleted record ${pk} from ${selectedTable}.`);
      const tbl = await portalApi.getAdminTableRows(selectedTable);
      setTableRows(tbl.rows);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Delete blocked or failed.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white font-display">
            OS Master Control, 1L+ Scale Health & Raw Database Explorer
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Inspect SQLite WAL throughput, 23 B-Tree indexes, rate limiter stats, active device sessions, and edit any table directly.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadHealthAndConfig()}
          className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold inline-flex items-center gap-1.5 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer self-start"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Refresh Telemetry</span>
        </button>
      </div>

      {errorMsg && (
        <div className="p-3 rounded-xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/40 text-xs text-red-700 dark:text-red-300">
          {errorMsg}
        </div>
      )}

      {loading || !health || !config ? (
        <div className="p-8 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-center text-sm text-slate-500">
          Inspecting database engine & feature controls...
        </div>
      ) : (
        <>
          {/* Infrastructure Scale Telemetry KPIs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
              <p className="text-xs text-slate-500 dark:text-slate-400">SQLite Engine & Storage</p>
              <p className="text-xl font-bold text-slate-900 dark:text-white mt-1 tabular-nums font-display">
                {health.walMode ? 'WAL Active' : 'Standard'} · {health.dbSizeKb} KB
              </p>
              <p className="text-xs text-emerald-700 dark:text-emerald-400 mt-1 tabular-nums">
                {health.indexCount} B-Tree Indexes Verified
              </p>
            </div>
            <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
              <p className="text-xs text-slate-500 dark:text-slate-400">In-Memory Query Cache</p>
              <p className="text-xl font-bold text-blue-700 dark:text-blue-400 mt-1 tabular-nums font-display">
                {health.cacheStats.hitRatePercent}% Hit Rate
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 tabular-nums">
                {health.cacheStats.hits} hits · {health.cacheStats.entries} hot keys
              </p>
            </div>
            <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
              <p className="text-xs text-slate-500 dark:text-slate-400">API Rate Guard & Uptime</p>
              <p className="text-xl font-bold text-slate-900 dark:text-white mt-1 tabular-nums font-display">
                {health.rateLimiterStats.totalRequests} Reqs
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 tabular-nums">
                {health.rateLimiterStats.blockedRequests} throttled · {health.uptimeSec}s uptime
              </p>
            </div>
            <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
              <p className="text-xs text-slate-500 dark:text-slate-400">Concurrent Sessions</p>
              <p className="text-xl font-bold text-slate-900 dark:text-white mt-1 tabular-nums font-display">
                {health.activeSessionsCount} Active
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Max {config.maxSessionsPerUser} devices/user
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
            {/* Left: Feature Flags & Broadcast Publisher */}
            <div className="xl:col-span-5 space-y-5">
              <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2 font-display">
                  <Settings className="w-4 h-4 text-blue-700 dark:text-blue-400" />
                  <span>Live OS Feature Flags & Branding</span>
                </h3>
                <div className="space-y-2.5 text-xs">
                  <div>
                    <label className="block font-medium text-slate-600 dark:text-slate-400 mb-1">
                      Top Institution Header Name
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={config.institutionName}
                        onChange={(e) =>
                          setConfig({ ...config, institutionName: e.target.value })
                        }
                        className="flex-1 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
                      />
                      <button
                        type="button"
                        onClick={() => void handleToggleFlag('institutionName', config.institutionName)}
                        className="px-3 py-1.5 rounded-lg bg-blue-700 text-white font-semibold cursor-pointer"
                      >
                        Apply
                      </button>
                    </div>
                  </div>

                  {(
                    [
                      { key: 'aiMentorEnabled', label: 'AINA Gemini AI Engines' },
                      { key: 'marketplaceEnabled', label: 'Course Marketplace & Checkout' },
                      { key: 'communityEnabled', label: 'Peer Doubt Community & Mentorship' },
                      { key: 'parentPortalEnabled', label: 'Parent Telemetry Portal' },
                      { key: 'scholarshipOpen', label: 'RSAT Scholarship Registrations' },
                      { key: 'allowPublicSignup', label: 'Public Student Self-Registration' },
                      { key: 'maintenanceMode', label: 'Maintenance Lock (Admin-Only Bypass)' },
                    ] as const
                  ).map((item) => {
                    const enabled = Boolean(config[item.key]);
                    return (
                      <div
                        key={item.key}
                        className="flex items-center justify-between py-2 border-b border-slate-100 dark:border-slate-800 last:border-b-0"
                      >
                        <span className="font-medium text-slate-800 dark:text-slate-200">
                          {item.label}
                        </span>
                        <button
                          type="button"
                          onClick={() => void handleToggleFlag(item.key, !enabled)}
                          className={`px-3 py-1 rounded-lg font-semibold cursor-pointer ${
                            enabled
                              ? item.key === 'maintenanceMode'
                                ? 'bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-300'
                                : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                              : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                          }`}
                        >
                          {enabled ? 'Enabled' : 'Disabled'}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </section>

              <form
                onSubmit={handleBroadcast}
                className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3"
              >
                <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2 font-display">
                  <Bell className="w-4 h-4 text-blue-700 dark:text-blue-400" />
                  <span>Broadcast Notification to All Portals</span>
                </h3>
                <select
                  value={bcCategory}
                  onChange={(e) => setBcCategory(e.target.value as NotificationItem['category'])}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
                >
                  <option value="Announcement">Institutional Announcement</option>
                  <option value="LiveClass">Live Class Alert</option>
                  <option value="Quiz">AITS / Quiz Window</option>
                  <option value="Scholarship">RSAT Scholarship Alert</option>
                </select>
                <input
                  type="text"
                  value={bcTitle}
                  onChange={(e) => setBcTitle(e.target.value)}
                  placeholder="Notification headline..."
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
                />
                <textarea
                  rows={2}
                  value={bcBody}
                  onChange={(e) => setBcBody(e.target.value)}
                  placeholder="Detailed message visible inside every student & parent bell drawer..."
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
                />
                <button
                  type="submit"
                  className="w-full py-2 px-4 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Push Platform-Wide Broadcast</span>
                </button>
              </form>
            </div>

            {/* Right: Active Sessions, Learning Events & Universal SQLite Table Explorer */}
            <div className="xl:col-span-7 space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2 font-display">
                    <ShieldAlert className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                    <span>Live Authenticated Sessions</span>
                  </h3>
                  <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                    {health.activeSessions.map((s) => (
                      <div
                        key={s.tokenPrefix}
                        className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 flex items-center justify-between gap-2 text-xs"
                      >
                        <div className="min-w-0">
                          <p className="font-semibold text-slate-900 dark:text-white truncate">
                            {s.userName} ({s.userRole})
                          </p>
                          <p className="text-slate-500 dark:text-slate-400 font-mono truncate">
                            {s.tokenPrefix}… · {s.loginMethod}
                          </p>
                        </div>
                        {s.isCurrent ? (
                          <span className="text-emerald-700 dark:text-emerald-400 font-semibold shrink-0">
                            Current
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={async () => {
                              await portalApi.revokeAdminSession(s.tokenPrefix);
                              onNotify(`Revoked session ${s.tokenPrefix}* for ${s.userName}.`);
                              await loadHealthAndConfig();
                            }}
                            className="px-2 py-1 rounded border border-red-200 dark:border-red-900 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 font-semibold cursor-pointer shrink-0"
                          >
                            Revoke
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </section>

                <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2 font-display">
                    <Activity className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
                    <span>Recent Learning Telemetry Stream</span>
                  </h3>
                  <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                    {health.recentEvents.map((ev) => (
                      <div
                        key={ev.id}
                        className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 flex items-center justify-between gap-2 text-xs"
                      >
                        <div className="min-w-0">
                          <p className="font-semibold text-slate-900 dark:text-white truncate">
                            {ev.userName} · {ev.eventType}
                          </p>
                          <p className="text-slate-500 dark:text-slate-400 truncate">
                            {ev.entityType} ({ev.entityId})
                          </p>
                        </div>
                        <span className="font-bold text-emerald-700 dark:text-emerald-400 tabular-nums shrink-0">
                          +{ev.xpDelta} XP
                        </span>
                      </div>
                    ))}
                  </div>
                </section>
              </div>

              {/* Universal SQLite Table Explorer */}
              <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2 font-display">
                    <Database className="w-4 h-4 text-blue-700 dark:text-blue-400" />
                    <span>Universal SQLite Table Inspector & Record Editor</span>
                  </h3>
                  <select
                    value={selectedTable}
                    onChange={(e) => setSelectedTable(e.target.value)}
                    className="px-3 py-1.5 text-xs font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
                  >
                    {EXPLORER_TABLES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="overflow-x-auto max-h-80 overflow-y-auto border border-slate-200 dark:border-slate-800 rounded-xl">
                  {tableRows.length === 0 ? (
                    <p className="p-4 text-xs text-slate-500">No rows in {selectedTable}.</p>
                  ) : (
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 sticky top-0">
                        <tr>
                          {Object.keys(tableRows[0])
                            .slice(0, 5)
                            .map((col) => (
                              <th
                                key={col}
                                className="px-3 py-2 font-semibold text-slate-600 dark:text-slate-300 font-mono"
                              >
                                {col}
                              </th>
                            ))}
                          <th className="px-3 py-2 text-right font-semibold text-slate-600 dark:text-slate-300">
                            Action
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {tableRows.map((r, idx) => (
                          <tr key={idx} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                            {Object.keys(tableRows[0])
                              .slice(0, 5)
                              .map((col) => (
                                <td
                                  key={col}
                                  className="px-3 py-2 max-w-[180px] truncate text-slate-700 dark:text-slate-300"
                                >
                                  {String(r[col] ?? '')}
                                </td>
                              ))}
                            <td className="px-3 py-2 text-right">
                              {(r.id !== undefined || r.code !== undefined) && (
                                <button
                                  type="button"
                                  onClick={() => void handleDeleteTableRow(r)}
                                  className="p-1 rounded text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 cursor-pointer"
                                  title="Delete row"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </section>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
