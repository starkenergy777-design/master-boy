import { formatLocalizedDate, formatLocalizedDateTime, localizeTree } from '../i18n.js';
import React, { useState, useEffect } from 'react';
import { Shield, Users, DollarSign, BarChart3, FileText, AlertOctagon, Lock, Unlock, Trash2, Ban, CheckCircle, RefreshCw, X, PhoneCall, Search } from 'lucide-react';
import { translations } from '../i18n.js';
import { Language, User, Analytics, AiReport, AdminTop15Member } from '../types.js';
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

  const [activeTab, setActiveTab] = useState<'craftsmen' | 'prices' | 'analytics' | 'reports' | 'top15'>('analytics');
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [craftsmen, setCraftsmen] = useState<any[]>([]);
  const [prices, setPrices] = useState<any[]>([]);
  const [top15Members, setTop15Members] = useState<AdminTop15Member[]>([]);
  const [reports, setReports] = useState<AiReport[]>([]);
  const [loading, setLoading] = useState(false);
  const [reportGenerating, setReportGenerating] = useState(false);
  const [deletingCraftsman, setDeletingCraftsman] = useState(false);
  const [craftsmanActionsInProgress, setCraftsmanActionsInProgress] = useState<Set<string>>(() => new Set());
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

  const loadAllCraftsmen = async () => {
    const firstPage = await api.getAdminCraftsmen('', '', 1, 50);
    const allCraftsmen = [...(firstPage.content || [])];
    const totalPages = Number(firstPage.totalPages) || 1;
    for (let page = 2; page <= totalPages; page += 4) {
      const pageNumbers = Array.from({ length: Math.min(4, totalPages - page + 1) }, (_, index) => page + index);
      const pageResults = await Promise.all(pageNumbers.map(pageNumber => api.getAdminCraftsmen('', '', pageNumber, 50)));
      for (const pageResult of pageResults) allCraftsmen.push(...(pageResult.content || []));
    }
    return allCraftsmen;
  };

  const loadData = async () => {
    try {
      setLoading(true);
      const [anData, cmData, prData, repData, top15Data] = await Promise.all([
        api.getAnalytics(),
        loadAllCraftsmen(),
        api.getAdminTop15Prices(),
        api.getReports(),
        api.getAdminTop15Members().catch(() => []),
      ]);
      setAnalytics(anData);
      setCraftsmen(cmData);
      setPrices(prData || []);
      setTop15Members(top15Data || []);
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

  const handleBlockUser = async (craftsmanId: string, isBlocked: boolean) => {
    if (!craftsmanId || craftsmanActionsInProgress.has(craftsmanId)) return;
    setErrorMsg('');
    setSuccessMsg('');
    setCraftsmanActionsInProgress(current => new Set(current).add(craftsmanId));
    try {
      if (isBlocked) {
        await api.unblockUser(craftsmanId);
        setSuccessMsg(lang === 'ka' ? 'ხელოსანი განიბლოკა' : lang === 'ru' ? 'Мастер разблокирован' : 'Craftsman unblocked');
      } else {
        await api.blockUser(craftsmanId);
        setSuccessMsg(lang === 'ka' ? 'ხელოსანი დაიბლოკა' : lang === 'ru' ? 'Мастер заблокирован' : 'Craftsman blocked');
      }
      await loadData();
    } catch (err: any) {
      setErrorMsg(err.message || (lang === 'ka' ? 'მოქმედება ვერ შესრულდა' : 'The action failed'));
    } finally {
      setCraftsmanActionsInProgress(current => {
        const next = new Set(current);
        next.delete(craftsmanId);
        return next;
      });
    }
  };

  const confirmDeleteCraftsman = async () => {
    if (!deleteConfirmCraftsmanId || deletingCraftsman) return;
    setErrorMsg('');
    setSuccessMsg('');
    setDeletingCraftsman(true);
    try {
      await api.deleteCraftsman(deleteConfirmCraftsmanId);
      setSuccessMsg(lang === 'ka' ? 'ხელოსანი სიიდან წაიშალა' : lang === 'ru' ? 'Мастер удалён из списка' : 'Craftsman removed from the list');
      setDeleteConfirmCraftsmanId(null);
      await loadData();
    } catch (err: any) {
      setErrorMsg(err.message || (lang === 'ka' ? 'წაშლა ვერ შესრულდა' : 'Delete failed'));
    } finally {
      setDeletingCraftsman(false);
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
    if (reportGenerating) return;
    setErrorMsg('');
    setSuccessMsg('');
    setReportGenerating(true);
    try {
      await api.generateReport(type);
      setSuccessMsg(lang === 'ru' ? 'Отчёт создан на грузинском языке.' : lang === 'en' ? 'Report created in Georgian.' : 'ანგარიში ქართულ ენაზე შეიქმნა.');
      await loadData();
    } catch (err: any) {
      setErrorMsg(err.message || (lang === 'ka' ? 'ანგარიშის შექმნა ვერ მოხერხდა' : 'Report generation failed'));
    } finally {
      setReportGenerating(false);
    }
  };

  return localizeTree(lang, (
    <div className="admin-console relative isolate mx-auto flex w-full max-w-[1440px] flex-1 flex-col gap-5 px-4 pb-24 pt-5 text-slate-100 animate-fade-in sm:gap-6 lg:px-6">
      {/* Admin cabinet identity */}
      <header className="relative overflow-hidden rounded-[1.75rem] border border-cyan-400/20 bg-[radial-gradient(ellipse_at_top_right,_rgba(34,211,238,0.12),_transparent_45%),linear-gradient(135deg,_rgba(15,23,42,0.98),_rgba(17,24,39,0.96)_58%,_rgba(12,74,110,0.36))] p-5 shadow-[0_18px_50px_rgba(2,6,23,0.34)] sm:p-6">
        <div className="pointer-events-none absolute -right-12 -top-20 h-56 w-56 rounded-full border border-cyan-300/10" />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-cyan-300/25 bg-cyan-400/10 text-cyan-200 shadow-inner shadow-cyan-100/5">
              <Shield className="h-6 w-6" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-xl font-bold tracking-tight text-white sm:text-2xl">{t.adminCabinet}</h2>
                <span className="inline-flex max-w-full items-center truncate rounded-full border border-slate-500/40 bg-slate-800/70 px-3 py-1 text-xs font-semibold text-slate-200">
                  {currentUser.roles.join(', ')}
                </span>
              </div>
              <p className="mt-1.5 text-sm text-slate-300">{currentUser.phone}</p>
            </div>
          </div>
          {isSuperAdmin && (
            <button
              onClick={onOpenSuperAdmin}
              className="min-h-10 shrink-0 rounded-xl border border-violet-300/25 bg-violet-400/10 px-4 py-2 text-sm font-bold text-violet-100 transition-colors hover:border-violet-200/40 hover:bg-violet-400/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-300"
            >
              ⚙️ Super Admin
            </button>
          )}
        </div>
      </header>

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
      <div className="admin-console-tabs grid grid-cols-2 gap-1.5 rounded-2xl border border-slate-700/70 bg-slate-950/50 p-1.5 text-xs font-semibold sm:grid-cols-5">
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
          onClick={() => setActiveTab('top15')}
          className={`flex-1 py-1.5 rounded-xl transition-all ${
            activeTab === 'top15' ? 'bg-amber-500 text-slate-950 font-bold shadow' : 'text-slate-400 hover:text-white'
          }`}
        >
          {lang === 'ka' ? 'Top 15 წევრები' : lang === 'ru' ? 'Участники Top 15' : 'Top 15 Members'}
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

      {/* Current Top 15 members */}
      {activeTab === 'top15' && (
        <div className="space-y-3">
          <section className="admin-console-panel space-y-4 rounded-2xl p-4 sm:p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-white">
                  {lang === 'ka' ? 'აქტიური Top 15 წევრები' : lang === 'ru' ? 'Активные участники Top 15' : 'Active Top 15 members'}
                </h3>
                <p className="mt-1 text-xs text-slate-400">
                  {lang === 'ka'
                    ? 'აქ ჩანს მხოლოდ მოქმედი წევრობები, რომლებიც წაშლილ ან დაბლოკილ ხელოსნებს არ უკავშირდება.'
                    : lang === 'ru'
                    ? 'Здесь показаны действующие членства, не связанные с удалёнными или заблокированными мастерами.'
                    : 'Only current memberships attached to non-deleted, non-blocked craftsmen are shown.'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void loadData()}
                disabled={loading}
                className="inline-flex min-h-10 shrink-0 items-center gap-2 rounded-xl border border-cyan-300/20 bg-cyan-400/10 px-3 py-2 text-xs font-semibold text-cyan-100 disabled:opacity-50"
              >
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                {lang === 'ka' ? 'განახლება' : lang === 'ru' ? 'Обновить' : 'Refresh'}
              </button>
            </div>

            {top15Members.length === 0 ? (
              <p className="rounded-xl border border-slate-700/70 bg-slate-950/40 p-4 text-sm text-slate-400">
                {lang === 'ka' ? 'აქტიური Top 15 წევრობა არ მოიძებნა.' : lang === 'ru' ? 'Активных членств Top 15 не найдено.' : 'No active Top 15 memberships found.'}
              </p>
            ) : (
              <div className="space-y-2">
                {top15Members.map((member) => (
                  <article key={member.id} className="admin-console-panel rounded-xl p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <h4 className="font-bold text-white">{member.craftsmanName}</h4>
                      <span className="rounded-full border border-emerald-300/20 bg-emerald-400/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-200">
                        {lang === 'ka' ? 'აქტიური' : lang === 'ru' ? 'Активно' : 'Active'}
                      </span>
                    </div>
                    <p className="mt-1.5 text-sm text-slate-300">
                      {member.cityName[lang]} · {member.professionName[lang]}
                    </p>
                    <p className="mt-2 text-xs text-slate-400">
                      {lang === 'ka' ? 'იწურება:' : lang === 'ru' ? 'Истекает:' : 'Expires:'} {formatLocalizedDateTime(lang, member.expiresAt)}
                    </p>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {/* Analytics Tab */}
      {activeTab === 'analytics' && analytics && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="admin-console-panel rounded-2xl p-4 sm:p-5 space-y-2">
              <span className="text-[10px] text-slate-400 uppercase font-bold">Revenue (Top 15)</span>
              <p className="text-xl font-black text-amber-400 font-mono">
                {analytics.totalRevenueGEL.toFixed(2)} GEL
              </p>
            </div>

            <div className="admin-console-panel rounded-2xl p-4 sm:p-5 space-y-2">
              <span className="text-[10px] text-slate-400 uppercase font-bold">Active Top 15</span>
              <p className="text-xl font-black text-emerald-400 font-mono">
                {analytics.activeTop15Slots} slots
              </p>
            </div>

            <div className="admin-console-panel rounded-2xl p-4 sm:p-5 space-y-2">
              <span className="text-[10px] text-slate-400 uppercase font-bold">Total Craftsmen</span>
              <p className="text-xl font-black text-white font-mono">
                {analytics.totalCraftsmen}
              </p>
            </div>

            <div className="admin-console-panel rounded-2xl p-4 sm:p-5 space-y-2">
              <span className="text-[10px] text-slate-400 uppercase font-bold">Disputes Flagged</span>
              <p className="text-xl font-black text-rose-400 font-mono">
                {analytics.totalDisputes}
              </p>
            </div>
          </div>

          <div className="admin-console-note rounded-2xl p-4 text-xs text-slate-300">
            All accounting and ledger verification is automatically audited by AI_ADMIN (Gemini).
          </div>
        </div>
      )}

      {/* Craftsmen Moderation Tab */}
      {activeTab === 'craftsmen' && (
        <div className="space-y-3">
          {/* CRM Search & Filters */}
          <div className="admin-console-panel rounded-2xl p-4 space-y-3">
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
                    className="admin-console-panel admin-console-row rounded-2xl p-3 sm:p-4 flex items-center justify-between text-sm transition-colors"
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
                        onClick={() => handleBlockUser(c.id, isBlocked)}
                        title={isBlocked ? 'Unblock' : 'Block'}
                        aria-label={isBlocked ? 'Unblock craftsman' : 'Block craftsman'}
                        disabled={craftsmanActionsInProgress.has(c.id)}
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
                        aria-label="Delete craftsman"
                        disabled={deletingCraftsman || craftsmanActionsInProgress.has(c.id)}
                        className="p-1.5 rounded-lg bg-slate-950 border border-slate-800 text-slate-400 hover:text-rose-400 disabled:opacity-50 disabled:cursor-wait"
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
            <button
              type="button"
              key={`${p.cityId}:${p.professionId}`}
              onClick={() => {
                setEditingPrice({
                  cityId: p.cityId,
                  professionId: p.professionId,
                  currentGEL: (p.amountMinor / 100).toString(),
                });
                setNewPriceInput((p.amountMinor / 100).toString());
              }}
              className="admin-console-panel admin-console-row w-full text-left rounded-2xl p-4 flex items-center justify-between text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400"
            >
              <span>
                <span className="font-bold text-white block">
                  {p.cityId.replace('city-', '').toUpperCase()} • {p.professionId.replace('prof-', '').toUpperCase()}
                </span>
                <span className="text-[10px] text-slate-500 font-mono block">
                  Updated: {formatLocalizedDate(lang, p.updatedAt)}
                </span>
              </span>
              <span className="font-mono font-bold text-amber-400 text-sm bg-slate-950 px-2.5 py-1 rounded-lg border border-slate-800">
                {(p.amountMinor / 100).toFixed(2)} GEL
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Reports Tab (§3.6 & §7.5) */}
      {activeTab === 'reports' && (
        <div className="space-y-3">
          <section className="admin-console-note space-y-3 rounded-2xl p-4">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-bold text-cyan-100">
                {lang === 'ka' ? 'მონაცემთა ბაზის მიმდინარე სურათი' : lang === 'ru' ? 'Текущий срез базы данных' : 'Current database snapshot'}
              </h3>
              <button
                type="button"
                onClick={() => void loadData()}
                disabled={loading}
                className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-cyan-300/20 bg-slate-950/40 px-3 py-2 text-xs font-semibold text-cyan-100 disabled:opacity-50"
              >
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                {lang === 'ka' ? 'განახლება' : lang === 'ru' ? 'Обновить' : 'Refresh'}
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-slate-700/60 bg-slate-950/40 p-3">
                <p className="text-[11px] text-slate-400">{lang === 'ka' ? 'ხელოსნები' : lang === 'ru' ? 'Мастера' : 'Craftsmen'}</p>
                <p className="mt-1 text-lg font-bold text-white">{analytics?.totalCraftsmen ?? 0}</p>
              </div>
              <div className="rounded-xl border border-slate-700/60 bg-slate-950/40 p-3">
                <p className="text-[11px] text-slate-400">{lang === 'ka' ? 'აქტიური Top 15 წევრობები' : lang === 'ru' ? 'Активные членства Top 15' : 'Active Top 15 memberships'}</p>
                <p className="mt-1 text-lg font-bold text-emerald-200">{analytics?.activeTop15Slots ?? top15Members.length}</p>
              </div>
            </div>
            <p className="text-xs text-slate-400">
              {lang === 'ka'
                ? 'ქვემოთ მოცემული AI ანგარიშები შენახულია შექმნის დროის მდგომარეობით; თარიღი თითოეულ ანგარიშზეა მითითებული.'
                : lang === 'ru'
                ? 'Отчёты ИИ ниже отражают данные на момент создания; дата указана в каждом отчёте.'
                : 'AI reports below reflect data from when they were created; each report shows its timestamp.'}
            </p>
          </section>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <button
              onClick={() => handleTriggerAiReport('ACCOUNTING')}
              disabled={reportGenerating}
              aria-busy={reportGenerating}
              className="flex-1 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs font-semibold py-2 rounded-xl text-amber-300 disabled:opacity-50 disabled:cursor-wait"
            >
              + Accounting Report
            </button>
            <button
              onClick={() => handleTriggerAiReport('RECOMMENDATIONS')}
              disabled={reportGenerating}
              aria-busy={reportGenerating}
              className="flex-1 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs font-semibold py-2 rounded-xl text-indigo-300 disabled:opacity-50 disabled:cursor-wait"
            >
              + Strategy Report
            </button>
          </div>

          <div className="space-y-2.5">
            {reports.map((r) => (
              <div
                key={r.id}
                className="admin-console-panel rounded-2xl p-4 space-y-3 text-xs"
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
          <div className="admin-console-modal bg-slate-900 border border-slate-800 rounded-3xl p-5 max-w-xs w-full space-y-4 shadow-2xl animate-scale-up">
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
          <div className="admin-console-modal bg-slate-900 border border-slate-800 rounded-3xl p-5 max-w-xs w-full space-y-4 shadow-2xl animate-scale-up text-center">
            <div className="w-12 h-12 rounded-2xl bg-rose-500/10 text-rose-400 border border-rose-500/30 flex items-center justify-center mx-auto">
              <Trash2 className="w-6 h-6" />
            </div>

            <div>
              <h3 className="text-sm font-bold text-white mb-1">
                {lang === 'ka' ? 'ხელოსნის წაშლა' : lang === 'ru' ? 'Удалить мастера' : 'Remove craftsman'}
              </h3>
              <p className="text-xs text-slate-400">
                {lang === 'ka'
                  ? 'ხელოსნის პროფილი სიიდან დაიმალება და ანგარიშზე წვდომა გაითიშება.'
                  : lang === 'ru'
                    ? 'Анкета мастера будет скрыта из списка, доступ к аккаунту будет отключён.'
                    : 'The craftsman profile will be hidden from the list and account access will be disabled.'}
              </p>
            </div>

            <div className="pt-2 flex gap-2">
              <button
                type="button"
                onClick={() => setDeleteConfirmCraftsmanId(null)}
                disabled={deletingCraftsman}
                className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold disabled:opacity-50"
              >
                {lang === 'ka' ? 'გაუქმება' : lang === 'ru' ? 'Отмена' : 'Cancel'}
              </button>
              <button
                type="button"
                onClick={confirmDeleteCraftsman}
                disabled={deletingCraftsman}
                className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold disabled:opacity-50 disabled:cursor-wait"
              >
                {deletingCraftsman ? '...' : lang === 'ka' ? 'წაშლა' : lang === 'ru' ? 'Удалить' : 'Remove'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  ));
};

