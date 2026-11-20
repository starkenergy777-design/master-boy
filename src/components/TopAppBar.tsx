import { localizeTree } from '../i18n.js';
import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Home, Wrench, Globe } from 'lucide-react';
import { translations } from '../i18n.js';
import { Language, User } from '../types.js';

interface TopAppBarProps {
  currentScreen: string;
  lang: Language;
  onBack: () => void;
  onHome: () => void;
  currentUser: User | null;
  onOpenCraftsman: () => void;
  onLanguageChange: (lang: Language) => void;
  wizardStep?: number;
}

export const TopAppBar: React.FC<TopAppBarProps> = ({
  currentScreen,
  lang,
  onBack,
  onHome,
  currentUser,
  onOpenCraftsman,
  onLanguageChange,
  wizardStep,
}) => {
  const t = translations[lang] || translations.ka;
  const isRoot = currentScreen === 'main';
  const [languageOpen, setLanguageOpen] = useState(false);
  const languageMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!languageOpen) return;
    const closeOutside = (event: PointerEvent) => {
      if (!languageMenuRef.current?.contains(event.target as Node)) setLanguageOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setLanguageOpen(false);
    };
    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [languageOpen]);

  useEffect(() => {
    if (!isRoot) setLanguageOpen(false);
  }, [isRoot]);

  // Determine localized title for the current sub-screen
  const getScreenTitle = (): { title: string; subtitle?: string } => {
    switch (currentScreen) {
      case 'results':
        return {
          title: lang === 'ka' ? 'ძიების შედეგები' : lang === 'ru' ? 'Результаты поиска' : 'Search Results',
          subtitle: lang === 'ka' ? 'ოსტატების კატალოგი' : 'Craftsmen Directory',
        };
      case 'detail':
        return {
          title: lang === 'ka' ? 'ხელოსნის პროფილი' : lang === 'ru' ? 'Профиль мастера' : 'Craftsman Profile',
          subtitle: lang === 'ka' ? 'კონტაქტი და საათები' : 'Contact & Hours',
        };
      case 'login':
        return {
          title: t.craftsmanLogin,
          subtitle: lang === 'ka' ? 'ავტორიზაცია' : 'Authentication',
        };
      case 'wizard':
        return {
          title: t.registrationWizard,
          subtitle: lang === 'ka' ? `ნაბიჯი ${wizardStep || 1} / 3` : `Step ${wizardStep || 1} / 3`,
        };
      case 'dashboard':
        return {
          title: t.dashboard,
          subtitle: lang === 'ka' ? 'მართვის პანელი' : 'Control Panel',
        };
      case 'top15':
        return {
          title: t.top15Badge,
          subtitle: lang === 'ka' ? 'პრიორიტეტული სლოტი' : 'Priority Slot',
        };
      case 'chat':
        return {
          title: t.supportChat,
          subtitle: t.supportSubtitle,
        };
      case 'admin':
        return {
          title: lang === 'ka' ? 'ადმინისტრაცია' : lang === 'ru' ? 'Администрация' : 'Administration',
          subtitle: t.managerPortal,
        };
      case 'superadmin':
        return {
          title: lang === 'ka' ? 'სუპერ ადმინი' : 'Super Admin',
          subtitle: lang === 'ka' ? 'სისტემური მართვა' : 'System Governance',
        };
      case 'adpartner':
        return {
          title: lang === 'ka' ? 'სარეკლამო კაბინეტი' : lang === 'ru' ? 'Рекламный кабинет' : 'Ad Partner Portal',
          subtitle: lang === 'ka' ? 'ბანერის მართვა და გადახდა' : 'Banner Management',
        };
      case 'settings':
        return {
          title: t.settings,
          subtitle: lang === 'ka' ? 'ენები და პროფილი' : lang === 'ru' ? 'Язык и профиль' : 'Languages & Profile',
        };
      default:
        return { title: 'MASTER_BOY' };
    }
  };

  const { title, subtitle } = getScreenTitle();

  return localizeTree(lang, (
    <div className="sticky top-0 z-40 bg-slate-950/95 backdrop-blur-md border-b border-slate-800/80 px-3 py-2 flex items-center justify-between text-slate-100 shadow-md transition-all select-none min-h-[52px]">
      {/* Left side: Back Button or Brand Logo */}
      <div className="flex items-center gap-2">
        {!isRoot ? (
          <button
            onClick={onBack}
            className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-900 border border-slate-700/90 hover:bg-slate-850 hover:border-amber-500/70 text-slate-100 hover:text-amber-400 transition-all active:scale-95 text-xs font-bold shadow-sm group min-h-[38px]"
            title={t.back}
          >
            <ArrowLeft className="w-4 h-4 text-amber-400 group-hover:-translate-x-1 transition-transform stroke-[2.5]" />
            <span className="tracking-wide font-bold">{t.back}</span>
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <img
              src="/icons/icon-192.jpg"
              alt="MASTER_BOY"
              width={32}
              height={32}
              className="w-8 h-8 rounded-lg object-cover shadow-md"
            />
            <span className="font-black text-sm tracking-wider text-white max-[350px]:hidden">
              MASTER_BOY
            </span>
          </div>
        )}

        {/* Current Screen Title (if not on root) */}
        {!isRoot && (
          <div className="flex flex-col ml-1 max-w-[170px] truncate">
            <span className="text-xs font-bold text-white truncate leading-tight">
              {title}
            </span>
            {subtitle && (
              <span className="text-[10px] text-slate-400 truncate leading-tight">
                {subtitle}
              </span>
            )}
          </div>
        )}
      </div>

      {isRoot && (
        <div ref={languageMenuRef} className="absolute left-1/2 z-10 -translate-x-1/2">
          <button
            type="button"
            aria-label={lang === 'ka' ? 'ენის არჩევა' : lang === 'ru' ? 'Выбрать язык' : 'Choose language'}
            aria-expanded={languageOpen}
            aria-controls="home-language-options"
            onClick={() => setLanguageOpen(open => !open)}
            className="flex h-8 min-w-10 items-center justify-center gap-0.5 rounded-lg border border-slate-700 bg-slate-900 px-1 text-[11px] font-bold text-slate-200 hover:border-amber-500 hover:text-amber-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400"
          >
            <Globe aria-hidden="true" className="h-3 w-3" />
            <span>{lang}</span>
          </button>
          {languageOpen && (
            <div id="home-language-options" className="absolute left-1/2 top-full mt-2 w-28 -translate-x-1/2 rounded-xl border border-slate-700 bg-slate-900 p-1 shadow-xl">
              {([['ka', 'ქართული ენა'], ['ru', 'Русский'], ['en', 'English']] as const).map(([code, label]) => (
                <button
                  key={code}
                  type="button"
                  onClick={() => { onLanguageChange(code); setLanguageOpen(false); }}
                  aria-current={lang === code ? 'true' : undefined}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-xs text-slate-200 hover:bg-slate-800 hover:text-amber-400 focus-visible:outline-2 focus-visible:outline-amber-400"
                >
                  <span className="font-bold text-amber-400">{code}</span>
                  <span>{label}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Right side: Quick Action Buttons */}
      <div className="flex items-center gap-1.5">
        {/* If not root, provide quick "Home" button */}
        {!isRoot && (
          <button
            onClick={onHome}
            className="p-2 rounded-xl bg-slate-900 border border-slate-800 hover:bg-slate-800 hover:text-amber-400 text-slate-300 transition-all text-xs font-semibold flex items-center gap-1"
            title={t.home}
          >
            <Home className="w-3.5 h-3.5" />
            <span className="hidden xs:inline text-[11px]">{t.home}</span>
          </button>
        )}

        {/* Craftsman Portal Shortcut */}
        {isRoot && (
          <button
            onClick={onOpenCraftsman}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-900 border border-amber-500/40 hover:border-amber-400 text-amber-400 hover:text-white transition-all text-[11px] font-bold max-[350px]:gap-0.5 max-[350px]:px-1 max-[350px]:text-[9px]"
          >
            <Wrench className="w-3 h-3" />
            <span>{currentUser ? t.dashboard : t.craftsmanLogin}</span>
          </button>
        )}
      </div>
    </div>
  ));
};

