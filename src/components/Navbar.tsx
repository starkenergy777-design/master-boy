import { localizeTree } from '../i18n.js';
import React from 'react';
import { Search, Wrench, Settings } from 'lucide-react';
import { translations } from '../i18n.js';
import { Language, User } from '../types.js';

export type NavTab = 'search' | 'craftsman' | 'settings';

interface NavbarProps {
  currentTab: NavTab;
  onTabChange: (tab: NavTab) => void;
  lang: Language;
  currentUser: User | null;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentTab,
  onTabChange,
  lang,
  currentUser,
}) => {
  const t = translations[lang] || translations.ka;

  return localizeTree(lang, (
    <nav className="bg-slate-950/95 backdrop-blur-md border-t border-slate-800/80 px-2 py-1.5 flex items-center justify-around z-30 select-none shrink-0">
      <button
        onClick={() => onTabChange('search')}
        className={`flex flex-col items-center justify-center py-1 px-3 rounded-xl transition-all ${
          currentTab === 'search'
            ? 'text-amber-400 font-semibold'
            : 'text-slate-400 hover:text-slate-200'
        }`}
      >
        <Search className={`w-5 h-5 mb-0.5 ${currentTab === 'search' ? 'stroke-[2.5]' : 'stroke-2'}`} />
        <span className="text-[10px] tracking-tight">{t.searchCraftsmen.split(' ')[0]}</span>
      </button>

      <button
        onClick={() => onTabChange('craftsman')}
        className={`flex flex-col items-center justify-center py-1 px-3 rounded-xl transition-all relative ${
          currentTab === 'craftsman'
            ? 'text-amber-400 font-semibold'
            : 'text-slate-400 hover:text-slate-200'
        }`}
      >
        <Wrench className={`w-5 h-5 mb-0.5 ${currentTab === 'craftsman' ? 'stroke-[2.5]' : 'stroke-2'}`} />
        <span className="text-[10px] tracking-tight">
          {currentUser ? t.dashboard : t.signIn}
        </span>
        {currentUser && (
          <span className="absolute top-1 right-2.5 w-2 h-2 rounded-full bg-amber-400 shadow-sm" />
        )}
      </button>

      <button
        onClick={() => onTabChange('settings')}
        className={`flex flex-col items-center justify-center py-1 px-3 rounded-xl transition-all ${
          currentTab === 'settings'
            ? 'text-amber-400 font-semibold'
            : 'text-slate-400 hover:text-slate-200'
        }`}
      >
        <Settings className={`w-5 h-5 mb-0.5 ${currentTab === 'settings' ? 'stroke-[2.5]' : 'stroke-2'}`} />
        <span className="text-[10px] tracking-tight">{t.settings}</span>
      </button>
    </nav>
  ));
};
