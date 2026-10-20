import { localizeTree } from '../i18n.js';
import React, { useState, useEffect } from 'react';
import {
  Search,
  ExternalLink,
} from 'lucide-react';
import { translations } from '../i18n.js';
import { City, Profession, Language, CraftsmanPublic, AdvertisementPublic } from '../types.js';
import { api } from '../api.js';

interface MainScreenProps {
  lang: Language;
  onSearch: (cityId?: string, professionId?: string) => void;
  onOpenCraftsmanLogin: () => void;
  onSelectCraftsman: (craftsman: CraftsmanPublic) => void;
}

export const MainScreen: React.FC<MainScreenProps> = ({
  lang,
  onSearch,
  onOpenCraftsmanLogin,
}) => {
  const t = translations[lang] || translations.ka;
  const [cities, setCities] = useState<City[]>([]);
  const [professions, setProfessions] = useState<Profession[]>([]);
  const [selectedCityId, setSelectedCityId] = useState<string>('');
  const [selectedProfessionId, setSelectedProfessionId] = useState<string>('');
  const [activeAd, setActiveAd] = useState<AdvertisementPublic | null>(null);
  const [, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        const [citiesData, professionsData, adData] = await Promise.all([
          api.getCities(),
          api.getProfessions(),
          api.getActiveAd().catch(() => ({ ad: null })),
        ]);
        setCities(citiesData);
        setProfessions(professionsData);
        if (adData?.ad) {
          setActiveAd(adData.ad);
        }
      } catch (err) {
        console.error('Failed to load initial directory data:', err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [lang]);

  const handleSearchClick = () => {
    onSearch(selectedCityId || undefined, selectedProfessionId || undefined);
  };

  const handleQuickCity = (cityId: string) => {
    const nextCity = selectedCityId === cityId ? '' : cityId;
    setSelectedCityId(nextCity);
    if (selectedProfessionId) {
      onSearch(nextCity || undefined, selectedProfessionId);
    }
  };

  return localizeTree(lang, (
    <div className="flex-1 flex flex-col p-2.5 sm:p-3 pb-0 animate-fade-in text-slate-100 min-h-0">
      {/* Top Banner & Search Controls grouped */}
      <div className="space-y-2 shrink-0">
        {/* Top Banner / Welcome - compact */}
        <div className="bg-gradient-to-br from-amber-500/20 via-slate-900 to-slate-900 border border-amber-500/30 rounded-xl p-2.5 sm:p-3 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 right-0 w-20 h-20 bg-amber-500/10 rounded-full blur-xl pointer-events-none" />
          <div className="flex items-center gap-1.5 mb-0.5">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400">
              {t.appName}
            </span>
          </div>
          <h1 className="text-base sm:text-lg font-black tracking-tight text-white leading-tight">
            {t.tagline}
          </h1>
          <p className="text-[10px] sm:text-[11px] text-slate-400 leading-snug hidden sm:block mt-0.5">
            {lang === 'ka'
              ? 'იპოვეთ საუკეთესო ოსტატები საქართველოს მასშტაბით პირდაპირი დარეკვით.'
              : lang === 'ru'
              ? 'Найдите проверенных мастеров по всей Грузии с прямым звонком.'
              : 'Find verified craftsmen across Georgia with direct phone calling.'}
          </p>
        </div>

        {/* Main Search Controls */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-2.5 sm:p-3 shadow-sm space-y-1.5">
          {/* City selector & Quick chips */}
          <div className="space-y-1">
            <div className="flex items-center justify-between px-0.5">
              <label className="text-[10px] sm:text-[11px] font-medium text-slate-400">
                {t.selectCity}
              </label>
              <span className="text-[9px] text-slate-500">საქართველო</span>
            </div>

            <select
              value={selectedCityId}
              onChange={(e) => setSelectedCityId(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700/80 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-amber-500 transition-colors"
            >
              <option value="">{t.allCities}</option>
              {cities.map((city) => (
                <option key={city.id} value={city.id}>
                  {city.name}
                </option>
              ))}
            </select>

            {/* Quick Georgian City Chips */}
            <div className="flex flex-wrap gap-1 pt-0.5">
              {cities.slice(0, 4).map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => handleQuickCity(c.id)}
                  className={`px-2 py-0.5 rounded text-[10px] font-medium transition-all ${
                    selectedCityId === c.id
                      ? 'bg-amber-500 text-slate-950 font-bold shadow-sm'
                      : 'bg-slate-950 border border-slate-800 text-slate-400 hover:text-white hover:border-slate-700'
                  }`}
                >
                  {c.name}
                </button>
              ))}
            </div>
          </div>

          {/* Profession dropdown */}
          <div className="space-y-1">
            <label className="text-[10px] sm:text-[11px] font-medium text-slate-400 px-0.5">
              {t.selectProfession}
            </label>
            <select
              value={selectedProfessionId}
              onChange={(e) => setSelectedProfessionId(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700/80 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-amber-500 transition-colors"
            >
              <option value="">{t.allProfessions}</option>
              {professions.map((prof) => (
                <option key={prof.id} value={prof.id}>
                  {prof.name}
                </option>
              ))}
            </select>
          </div>

          <div className="pt-1 grid grid-cols-1 gap-1.5">
            <button
              onClick={handleSearchClick}
              className="w-full bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold py-2 px-3 rounded-lg shadow-sm shadow-amber-500/20 flex items-center justify-center gap-1.5 transition-all active:scale-[0.98] text-xs"
            >
              <Search className="w-3.5 h-3.5 stroke-[2.5]" />
              <span className="truncate">{t.searchCraftsmen}</span>
            </button>
          </div>
        </div>

        <div className="mb-2 rounded-xl border border-slate-800 bg-slate-900/60 px-3 py-2">
          <p className="text-[10px] leading-relaxed text-slate-400">
            {lang === 'ka'
              ? 'ხელოსნის მოსაძებნად რეგისტრაცია საჭირო არ არის — აირჩიეთ ქალაქი და პროფესია.'
              : lang === 'ru'
                ? 'Для поиска мастера регистрация не нужна — выберите город и профессию.'
                : 'You do not need an account to find a craftsman — choose a city and profession.'}
          </p>
        </div>

        {/* Craftsman Entry CTA Banner - Compact */}
        <div className="bg-slate-900/60 border border-dashed border-slate-800 rounded-xl px-3 py-1.5 flex items-center justify-between text-xs">
          <div>
            <p className="font-bold text-slate-200 text-[11px] leading-tight">
              {lang === 'ka' ? 'ხართ ხელოსანი?' : lang === 'ru' ? 'Вы мастер?' : 'Are you a craftsman?'}
            </p>
            <p className="text-[9px] text-slate-400 leading-tight">
              {lang === 'ka' ? 'ხელოსნის რეგისტრაცია — მიიღეთ კლიენტების ზარები' : lang === 'ru' ? 'Регистрация мастера — получайте звонки клиентов' : 'Craftsman registration — receive client calls'}
            </p>
          </div>
          <button
            onClick={onOpenCraftsmanLogin}
            className="bg-slate-800 hover:bg-slate-700 text-amber-400 font-semibold px-2 py-1 text-[11px] rounded-lg border border-amber-500/30 transition-colors shrink-0 ml-2"
          >
            {t.craftsmanLogin}
          </button>
        </div>
      </div>

      {/* Commercial Advertisement Banner Container */}
      <div className="flex-1 -mx-2.5 sm:-mx-3 mb-0 mt-2 flex flex-col min-h-[160px]">
        <div className="flex-1 flex flex-col min-h-0 bg-slate-900 border-t border-x border-slate-800/90 overflow-hidden transition-all group shadow-xl">
          {activeAd && activeAd.company_name && activeAd.image_url ? (
            <>
              <div className="px-3 py-1.5 bg-slate-950/95 border-b border-slate-800/80 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="text-[9px] font-black uppercase tracking-wider text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20 shrink-0">
                    {lang === 'ka' ? 'რეკლამა' : lang === 'ru' ? 'Реклама' : 'Sponsored'}
                  </span>
                  <span className="text-xs font-bold text-white truncate" title={activeAd.company_name}>
                    {activeAd.company_name}
                  </span>
                </div>
                {activeAd.target_url && (
                  <ExternalLink className="w-3.5 h-3.5 text-slate-400 group-hover:text-amber-400 shrink-0 transition-colors" />
                )}
              </div>

              <a
                href={activeAd.target_url || '#'}
                target={activeAd.target_url ? '_blank' : undefined}
                rel="noopener noreferrer"
                className="flex-1 w-full min-h-0 relative overflow-hidden bg-slate-950 block"
              >
                <img
                  src={activeAd.image_url}
                  alt={activeAd.company_name}
                  className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-300"
                  loading="lazy"
                />
              </a>
            </>
          ) : (
            <>
              <div className="px-3 py-1.5 bg-slate-950/95 border-b border-slate-800/80 flex items-center justify-between shrink-0">
                <span className="text-[9px] font-black uppercase tracking-wider text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                  {lang === 'ka' ? 'სარეკლამო ადგილი' : lang === 'ru' ? 'Рекламное место' : 'Ad space'}
                </span>
                <span className="text-[10px] text-slate-500">
                  {lang === 'ka' ? 'თავისუფალია' : lang === 'ru' ? 'Свободно' : 'Available'}
                </span>
              </div>
              <div className="flex-1 min-h-[140px] flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-950 to-amber-950/10 border-x border-b border-dashed border-slate-700/80">
                <div className="text-center px-5">
                  <p className="text-sm font-bold text-slate-300">
                    {lang === 'ka' ? 'მოათავსეთ თქვენი რეკლამა აქ' : lang === 'ru' ? 'Разместите здесь свою рекламу' : 'Place your advertisement here'}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    {lang === 'ka' ? 'აქტიური რეკლამის დამატების შემდეგ აქ ბანერი გამოჩნდება.' : lang === 'ru' ? 'Здесь появится баннер после добавления активной рекламы.' : 'An active advertisement banner will appear here.'}
                  </p>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  ));
};

