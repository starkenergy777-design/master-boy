import { formatLocalizedDate, formatLocalizedDateTime, localizeTree } from '../i18n.js';
import React, { useState, useEffect } from 'react';
import { Shield, Users, DollarSign, BarChart3, FileText, AlertOctagon, Lock, Unlock, Trash2, Ban, CheckCircle, RefreshCw, X, PhoneCall, Search } from 'lucide-react';
import { translations } from '../i18n.js';
import { Language, User, Analytics, AiReport } from '../types.js';
import { api } from '../api.js';

const reportFieldLabels: Record<string, string> = {
  title: 'სათაური',
  summary: 'შეჯამება',
  overview: 'მიმოხილვა',
  description: 'აღწერა',
  suggestions: 'რეკომენდაციები',
  recommendations: 'რეკომენდაციები',
  activeSlots: 'აქტიური Top 15 წევრობები',
  totalCraftsmen: 'ხელოსნების რაოდენობა',
  estimatedMonthlyRevenueGEL: 'სავარაუდო თვიური შემოსავალი (₾)',
  refundCount: 'თანხის დაბრუნებები',
  ledgerHealth: 'გადახდების სტატუსი',
  uptime: 'მუშაობის დრო',
  dbLatencyMs: 'ბაზის პასუხის დრო (ms)',
  errorRate: 'შეცდომების წილი',
  activeSessions: 'აქტიური სესიები',
  craftsmanId: 'ხელოსნის ID',
  craftsmanName: 'ხელოსნის სახელი',
  phone: 'ტელეფონი',
  messageSnippet: 'შეტყობინება',
  disputeStatus: 'დავის სტატუსი',
  aiAssessment: 'AI შეფასება',
};

const legacyGeorgianReportText: Record<string, string> = {
  'Autonomous Financial Audit': 'ფინანსური ანგარიში',
  'Autonomous System Optimization Advice': 'სისტემის გაუმჯობესების რეკომენდაციები',
  'System Health & Latency Metric': 'სისტემის მდგომარეობის ანგარიში',
  'PERFECT': 'გამართული',
  'PENDING_HUMAN_REVIEW': 'ადამიანის განხილვას ელოდება',
  'Consider introducing holiday weekend discounts on select craft categories.': 'განიხილე ფასდაკლება ხელოსნების შერჩეულ კატეგორიებზე დღესასწაულების პერიოდში.',
  'SMS verification latency is nominal across Magti and Silknet networks.': 'გადაამოწმე SMS შეტყობინებების მიწოდების დრო ყველა ოპერატორთან.',
  'Recommend keeping 6-month Configuration Lock active for uncompromised runtime integrity.': 'შეინარჩუნე კონფიგურაციის დაბლოკვა უსაფრთხოების წესების შესაბამისად.',
};

function readableReportText(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'boolean') return value ? 'დიახ' : 'არა';
  if (typeof value === 'number') return value.toLocaleString('ka-GE');
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return '—';
    if (/^\s*[{[]/.test(trimmed)) {
      try { return readableReportText(JSON.parse(trimmed)); } catch { /* display as text below */ }
    }
    if (legacyGeorgianReportText[trimmed]) return legacyGeorgianReportText[trimmed];
    if (!/[\u10A0-\u10FF]/.test(trimmed) && /[A-Za-z]{3}/.test(trimmed)) {
      return 'ძველი ანგარიშის ეს ტექსტი ქართულად არ არის შენახული.';
    }
    return trimmed;
  }
  if (Array.isArray(value)) {
    return value.map(item => readableReportText(item)).filter(Boolean).join('\n');
  }
  if (typeof value === 'object') {
    const fields = Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !['generatedBy', 'type', 'format'].includes(key))
      .map(([key, item]) => {
        const label = reportFieldLabels[key] || 'დამატებითი ინფორმაცია';
        return label + ': ' + readableReportText(item);
      });
    return fields.join('\n');
  }
  return String(value);
}

function reportTypeLabel(type: string, lang: Language): string {
  const labels: Record<string, Record<Language, string>> = {
    ACCOUNTING: { ka: 'ფინანსური ანგარიში', ru: 'Финансовый отчёт', en: 'Financial report' },
    RECOMMENDATIONS: { ka: 'რეკომენდაციები', ru: 'Рекомендации', en: 'Recommendations' },
    HEALTH: { ka: 'სისტემის მდგომარეობა', ru: 'Состояние системы', en: 'System health' },
    DISPUTE: { ka: 'დავა', ru: 'Спор', en: 'Dispute' },
  };
  return labels[type]?.[lang] || labels.RECOMMENDATIONS[lang];
}

const ReadableReportContent: React.FC<{ content: unknown }> = ({ content }) => (
  <div className="bg-slate-950 p-3 rounded-xl border border-slate-800/80 text-[12px] leading-relaxed text-slate-200 whitespace-pre-wrap break-words">
    {readableReportText(content)}
  </div>
);

interface AdminDashboardProps {
  lang: Language;
  currentUser: User;
  onOpenSuperAdmin: () => void;
  onBack?: () => void;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({
  lang,
  currentUser,
  onOpenSuperAdmin,
  onBack,
}) => {
  const t = translations[lang] || translations.ka;
  const isSuperAdmin = currentUser.roles.includes('SUPER_ADMIN');

  const [activeTab, setActiveTab] = useState<'craftsmen' | 'prices' | 'analytics' | 'reports'>('analytics');
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [craftsmen, setCraftsmen] = useState<any[]>([]);
  const [prices, setPrices] = useState<any[]>([]);
  const [reports, setReports] = useState<AiReport[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // CRM Filters
  const [crmSearch, setCrmSearch] = useState('');
  const [crmStatusFilter, setCrmStatusFilter] = useState<'ALL' | 'ACTIVE' | 'UNPAID_DRAFT' | 'BLOCKED'>('ALL');

  // Modals (replaces window.prompt/confirm)
  const [deleteConfirmCraftsmanId, setDeleteConfirmCraftsmanId] = useState<string | null>(null);
  const [editingPrice, setEditingPrice] = useState<{
    cityId: string;
    professionId: string;
    currentGEL: string;
  } | null>(null);
  const [newPriceInput, setNewPriceInput] = useState('');
  const [priceUpdating, setPriceUpdating] = useState(false);

  const loadData = async () => {
    try {
      setLoading(true);
      const [anData, cmData, prData, repData] = await Promise.all([
        api.getAnalytics(),
        api.getAdminCraftsmen(),
        api.getAdminTop15Prices(),
        api.getReports(),
      ]);
      setAnalytics(anData);
      setCraftsmen(cmData.content || []);
      setPrices(prData || []);
      setReports(repData.content || []);
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'Error loading admin data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleBlockUser = async (userId: string, isBlocked: boolean) => {
    setErrorMsg('');
    setSuccessMsg('');
    try {
      if (isBlocked) {
        await api.unblockUser(userId);
        setSuccessMsg('User unblocked');
      } else {
        await api.blockUser(userId);
        setSuccessMsg('User blocked');
      }
      loadData();
    } catch (err: any) {
      if (err.status === 423) {
        setErrorMsg('423 CONFIG_LOCKED: Configuration is locked for 6 months. Human edits are prohibited.');
      } else {
        setErrorMsg(err.message);
      }
    }
  };

  const confirmDeleteCraftsman = async () => {
    if (!deleteConfirmCraftsmanId) return;
    setErrorMsg('');
    setSuccessMsg('');
    try {
      await api.deleteCraftsman(deleteConfirmCraftsmanId);
      setSuccessMsg('Craftsman deleted');
      setDeleteConfirmCraftsmanId(null);
      loadData();
    } catch (err: any) {
      if (err.status === 423) {
        setErrorMsg('423 CONFIG_LOCKED: Configuration is locked for 6 months. Cannot delete during lock.');
      } else {
        setErrorMsg(err.message);
      }
    }
  };

  const submitUpdatePrice = async () => {
    if (!editingPrice || !newPriceInput || isNaN(parseFloat(newPriceInput))) return;
    const amountMinor = Math.round(parseFloat(newPriceInput) * 100);
    setErrorMsg('');
    setSuccessMsg('');
    setPriceUpdating(true);
    try {
      await api.updateTop15Price(editingPrice.cityId, editingPrice.professionId, amountMinor);
      setSuccessMsg('Price updated successfully');
      setEditingPrice(null);
      loadData();
    } catch (err: any) {
      if (err.status === 423) {
        setErrorMsg('423 CONFIG_LOCKED: Cannot modify prices during 6-month Configuration Lock.');
      } else {
        setErrorMsg(err.message);
      }
    } finally {
      setPriceUpdating(false);
    }
  };

  const handleTriggerAiReport = async (type: string) => {
    try {
      setLoading(true);
      await api.generateReport(type);
      setSuccessMsg(lang === 'ru' ? 'Отчёт создан на грузинском языке.' : lang === 'en' ? 'Report created in Georgian.' : 'ანგარიში ქართულ ენაზე შეიქმნა.');
      loadData();
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  return localizeTree(lang, (
    <div className="flex-1 flex flex-col p-4 pb-20 space-y-4 animate-fade-in text-slate-100">
      {/* Top Banner */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/30">
            <Shield className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-white flex items-center gap-1.5">
              <span>{t.adminCabinet}</span>
              <span className="text-[10px] bg-slate-800 text-slate-300 px-2 py-0.5 rounded font-mono">
                {currentUser.roles.join(', ')}
              </span>
            </h2>
            <p className="text-[10px] text-slate-400">
              {currentUser.phone}
            </p>
          </div>
        </div>

        {isSuperAdmin && (
          <button
            onClick={onOpenSuperAdmin}
            className="text-xs font-bold text-purple-400 bg-purple-950/60 border border-purple-800/80 px-3 py-1.5 rounded-xl hover:bg-purple-900 transition-colors shadow-sm"
          >
            ⚙️ Super Admin
          </button>
        )}
      </div>

      {/* Lock Status Alert */}
      {analytics?.configLocked && (
        <div className="bg-amber-500/10 border border-amber-500/40 rounded-2xl p-3 flex items-center justify-between text-xs text-amber-300">
          <div className="flex items-center gap-2">
            <Lock className="w-4 h-4 text-amber-400" />
            <span>{t.lockStatus}:</span>
          </div>
          <span className="font-mono font-bold text-[11px] bg-slate-950 px-2 py-0.5 rounded border border-amber-500/30">
            {formatLocalizedDate(lang, analytics.configLockedUntil || '')}
          </span>
        </div>
      )}

      {errorMsg && (
        <div className="bg-rose-500/10 border border-rose-500/30 rounded-xl p-3 text-xs text-rose-300 flex items-center gap-2">
          <AlertOctagon className="w-4 h-4 shrink-0 text-rose-400" />
          <span>{errorMsg}</span>
        </div>
      )}

      {successMsg && (
        <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-3 text-xs text-emerald-300 flex items-center gap-2">
          <CheckCircle className="w-4 h-4 shrink-0 text-emerald-400" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Tabs */}
      <div className="flex rounded-2xl bg-slate-900 p-1 border border-slate-800 text-[11px] font-semibold">
        <button
          onClick={() => setActiveTab('analytics')}
          className={`flex-1 py-1.5 rounded-xl transition-all ${
            activeTab === 'analytics' ? 'bg-amber-500 text-slate-950 font-bold shadow' : 'text-slate-400 hover:text-white'
          }`}
        >
          {lang === 'ka' ? 'ანალიტიკა' : lang === 'ru' ? 'Аналитика' : 'Analytics'}
        </button>
        <button
          onClick={() => setActiveTab('craftsmen')}
          className={`flex-1 py-1.5 rounded-xl transition-all ${
            activeTab === 'craftsmen' ? 'bg-amber-500 text-slate-950 font-bold shadow' : 'text-slate-400 hover:text-white'
          }`}
        >
          {lang === 'ka' ? 'ხელოსნები (CRM)' : lang === 'ru' ? 'Мастера (CRM)' : 'Craftsmen'}
        </button>
        <button
          onClick={() => setActiveTab('prices')}
          className={`flex-1 py-1.5 rounded-xl transition-all ${
            activeTab === 'prices' ? 'bg-amber-500 text-slate-950 font-bold shadow' : 'text-slate-400 hover:text-white'
          }`}
        >
          {lang === 'ka' ? 'Top 15 ფასები' : lang === 'ru' ? 'Цены Top 15' : 'Top 15 Prices'}
        </button>
        <button
          onClick={() => setActiveTab('reports')}
          className={`flex-1 py-1.5 rounded-xl transition-all ${
            activeTab === 'reports' ? 'bg-amber-500 text-slate-950 font-bold shadow' : 'text-slate-400 hover:text-white'
          }`}
        >
          {lang === 'ka' ? 'AI ანგარიშები' : lang === 'ru' ? 'AI Отчёты' : 'AI Reports'}
        </button>
      </div>

      {/* Analytics Tab */}
      {activeTab === 'analytics' && analytics && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3.5 space-y-1">
              <span className="text-[10px] text-slate-400 uppercase font-bold">Revenue (Top 15)</span>
              <p className="text-xl font-black text-amber-400 font-mono">
                {analytics.totalRevenueGEL.toFixed(2)} GEL
              </p>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3.5 space-y-1">
              <span className="text-[10px] text-slate-400 uppercase font-bold">Active Top 15</span>
              <p className="text-xl font-black text-emerald-400 font-mono">
                {analytics.activeTop15Slots} slots
              </p>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3.5 space-y-1">
              <span className="text-[10px] text-slate-400 uppercase font-bold">Total Craftsmen</span>
              <p className="text-xl font-black text-white font-mono">
                {analytics.totalCraftsmen}
              </p>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3.5 space-y-1">
              <span className="text-[10px] text-slate-400 uppercase font-bold">Disputes Flagged</span>
              <p className="text-xl font-black text-rose-400 font-mono">
                {analytics.totalDisputes}
              </p>
            </div>
          </div>

          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-3 text-[11px] text-slate-400">
            All accounting and ledger verification is automatically audited by AI_ADMIN (Gemini).
          </div>
        </div>
      )}

      {/* Craftsmen Moderation Tab */}
      {activeTab === 'craftsmen' && (
        <div className="space-y-3">
          {/* CRM Search & Filters */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3 space-y-2">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={crmSearch}
                onChange={(e) => setCrmSearch(e.target.value)}
                placeholder="ხელოსნის ან ნომრის ძიება..."
                className="w-full bg-slate-950 border border-slate-700/80 rounded-xl pl-9 pr-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
              />
            </div>

            <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none text-[10px]">
              {(['ALL', 'ACTIVE', 'UNPAID_DRAFT', 'BLOCKED'] as const).map((st) => (
                <button
                  key={st}
                  onClick={() => setCrmStatusFilter(st)}
                  className={`px-2.5 py-1 rounded-lg font-bold transition-all whitespace-nowrap ${
                    crmStatusFilter === st
                      ? 'bg-amber-500 text-slate-950'
                      : 'bg-slate-950 border border-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  {st === 'ALL'
                    ? t.allStatuses
                    : st === 'ACTIVE'
                    ? 'აქტიური'
                    : st === 'UNPAID_DRAFT'
                    ? 'გადასახდელი (10₾)'
                    : 'დაბლოკილი'}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            {craftsmen
              .filter((c) => {
                const q = crmSearch.toLowerCase().trim();
                const matchesSearch =
                  !q ||
                  c.name?.toLowerCase().includes(q) ||
                  c.phone?.includes(q) ||
                  c.cityId?.toLowerCase().includes(q) ||
                  c.professionId?.toLowerCase().includes(q);
                const matchesStatus =
                  crmStatusFilter === 'ALL' || c.status === crmStatusFilter;
                return matchesSearch && matchesStatus;
              })
              .map((c) => {
                const isBlocked = c.status === 'BLOCKED';
                return (
                  <div
                    key={c.id}
                    className="bg-slate-900 border border-slate-800 rounded-xl p-3 flex items-center justify-between text-xs hover:border-slate-700 transition-colors"
                  >
                    <div className="min-w-0 flex-1 pr-2">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <h4 className="font-bold text-white truncate">{c.name}</h4>
                        <span
                          className={`text-[9px] px-1.5 py-0.2 rounded font-mono ${
                            isBlocked
                              ? 'bg-rose-500/20 text-rose-400'
                              : c.status === 'ACTIVE'
                              ? 'bg-emerald-500/20 text-emerald-400'
                              : 'bg-amber-500/20 text-amber-400'
                          }`}
                        >
                          {c.status}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 font-mono mt-0.5">
                        {c.phone} • {c.cityId?.replace('city-', '').toUpperCase()}
                      </p>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {c.phone && (
                        <a
                          href={`tel:${c.phone}`}
                          title="Call Craftsman"
                          className="p-1.5 rounded-lg bg-emerald-950/80 border border-emerald-800 text-emerald-400 hover:bg-emerald-900 transition-colors"
                        >
                          <PhoneCall className="w-3.5 h-3.5" />
                        </a>
                      )}
                      <button
                        onClick={() => handleBlockUser(c.userId, isBlocked)}
                        title={isBlocked ? 'Unblock' : 'Block'}
                        className={`p-1.5 rounded-lg border text-xs ${
                          isBlocked
                            ? 'bg-emerald-950 border-emerald-800 text-emerald-400'
                            : 'bg-rose-950 border-rose-800 text-rose-400'
                        }`}
                      >
                        <Ban className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setDeleteConfirmCraftsmanId(c.id)}
                        title="Delete"
                        className="p-1.5 rounded-lg bg-slate-950 border border-slate-800 text-slate-400 hover:text-rose-400"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* Prices Tab (§7.3) */}
      {activeTab === 'prices' && (
        <div className="space-y-2">
          <p className="text-[11px] text-slate-400 px-1">
            Top 15 slot price per city + profession. Click to change price.
          </p>
          {prices.map((p) => (
            <div
              key={`${p.cityId}:${p.professionId}`}
              onClick={() => {
                setEditingPrice({
                  cityId: p.cityId,
                  professionId: p.professionId,
                  currentGEL: (p.amountMinor / 100).toString(),
                });
                setNewPriceInput((p.amountMinor / 100).toString());
              }}
              className="bg-slate-900 border border-slate-800 rounded-xl p-3 flex items-center justify-between hover:border-slate-700 cursor-pointer text-xs"
            >
              <div>
                <span className="font-bold text-white block">
                  {p.cityId.replace('city-', '').toUpperCase()} • {p.professionId.replace('prof-', '').toUpperCase()}
                </span>
                <span className="text-[10px] text-slate-500 font-mono">
                  Updated: {formatLocalizedDate(lang, p.updatedAt)}
                </span>
              </div>
              <span className="font-mono font-bold text-amber-400 text-sm bg-slate-950 px-2.5 py-1 rounded-lg border border-slate-800">
                {(p.amountMinor / 100).toFixed(2)} GEL
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Reports Tab (§3.6 & §7.5) */}
      {activeTab === 'reports' && (
        <div className="space-y-3">
          <div className="flex gap-2">
            <button
              onClick={() => handleTriggerAiReport('ACCOUNTING')}
              className="flex-1 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs font-semibold py-2 rounded-xl text-amber-300"
            >
              + Accounting Report
            </button>
            <button
              onClick={() => handleTriggerAiReport('RECOMMENDATIONS')}
              className="flex-1 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs font-semibold py-2 rounded-xl text-indigo-300"
            >
              + Strategy Report
            </button>
          </div>

          <div className="space-y-2.5">
            {reports.map((r) => (
              <div
                key={r.id}
                className="bg-slate-900 border border-slate-800 rounded-2xl p-3.5 space-y-2 text-xs"
              >
                <div className="flex items-center justify-between">
                  <span
                    className={`font-black text-[10px] px-2 py-0.5 rounded-full border ${
                      r.type === 'DISPUTE'
                        ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                        : r.type === 'ACCOUNTING'
                        ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                        : 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40'
                    }`}
                  >
                    {reportTypeLabel(r.type, lang)}
                  </span>
                  <span className="text-[10px] text-slate-500 font-mono">
                    {formatLocalizedDateTime(lang, r.createdAt)}
                  </span>
                </div>

                {r.craftsmanName && (
                  <p className="text-[11px] text-amber-400 font-semibold">
                    ხელოსანი: {r.craftsmanName}
                  </p>
                )}

                <ReadableReportContent content={r.content} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Edit Top 15 Price Modal (Replaces window.prompt) */}
      {editingPrice && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 max-w-xs w-full space-y-4 shadow-2xl animate-scale-up">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                Update Top 15 Price
              </h3>
              <button
                type="button"
                onClick={() => setEditingPrice(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div>
              <p className="text-[11px] text-slate-400">
                {editingPrice.cityId.replace('city-', '').toUpperCase()} • {editingPrice.professionId.replace('prof-', '').toUpperCase()}
              </p>
              <p className="text-[10px] text-slate-500">Current: {editingPrice.currentGEL} GEL</p>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] text-slate-400">New Price (GEL)</label>
              <input
                type="number"
                step="0.5"
                value={newPriceInput}
                onChange={(e) => setNewPriceInput(e.target.value)}
                placeholder="50.00"
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500 font-mono"
              />
            </div>

            <div className="pt-2 flex gap-2">
              <button
                type="button"
                onClick={() => setEditingPrice(null)}
                className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submitUpdatePrice}
                disabled={priceUpdating}
                className="flex-1 py-2.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 text-slate-950 rounded-xl text-xs font-bold disabled:opacity-50"
              >
                {priceUpdating ? '...' : 'Save Price'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Craftsman Confirmation Modal (Replaces window.confirm) */}
      {deleteConfirmCraftsmanId && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 max-w-xs w-full space-y-4 shadow-2xl animate-scale-up text-center">
            <div className="w-12 h-12 rounded-2xl bg-rose-500/10 text-rose-400 border border-rose-500/30 flex items-center justify-center mx-auto">
              <Trash2 className="w-6 h-6" />
            </div>

            <div>
              <h3 className="text-sm font-bold text-white mb-1">Delete Craftsman</h3>
              <p className="text-xs text-slate-400">
                Are you sure you want to permanently delete this craftsman profile?
              </p>
            </div>

            <div className="pt-2 flex gap-2">
              <button
                type="button"
                onClick={() => setDeleteConfirmCraftsmanId(null)}
                className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDeleteCraftsman}
                className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  ));
};

