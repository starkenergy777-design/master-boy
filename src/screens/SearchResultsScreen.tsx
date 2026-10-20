import { formatCraftsmanCount, localizeTree } from '../i18n.js';
import React, { useState, useEffect } from 'react';
import { Star, Phone, EyeOff, Search, Clock, Users, ChevronDown, ChevronUp } from 'lucide-react';
import { translations } from '../i18n.js';
import { Language, CraftsmanPublic, City, Profession } from '../types.js';
import { api } from '../api.js';

interface SearchResultsScreenProps {
  lang: Language;
  initialCityId?: string;
  initialProfessionId?: string;
  onBack: () => void;
  onSelectCraftsman: (craftsman: CraftsmanPublic) => void;
  onCall: (craftsman: CraftsmanPublic) => void;
}

export const SearchResultsScreen: React.FC<SearchResultsScreenProps> = ({
  lang,
  initialCityId,
  initialProfessionId,
  onBack,
  onSelectCraftsman,
  onCall,
}) => {
  const t = translations[lang] || translations.ka;
  const [top15, setTop15] = useState<CraftsmanPublic[]>([]);
  const [allCraftsmen, setAllCraftsmen] = useState<CraftsmanPublic[]>([]);
  const [loading, setLoading] = useState(true);
  const [cities, setCities] = useState<City[]>([]);
  const [professions, setProfessions] = useState<Profession[]>([]);
  const [cityId, setCityId] = useState(initialCityId || '');
  const [professionId, setProfessionId] = useState(initialProfessionId || '');
  const [showOtherCraftsmen, setShowOtherCraftsmen] = useState(false);

  const hasBothFilters = !!(cityId && professionId);

  const fetchData = async (cId: string, pId: string) => {
    try {
      setLoading(true);
      const res = await api.search(cId, pId, 1, 50);
      setTop15(res.top15 || []);
      setAllCraftsmen(res.items?.content || []);
    } catch (err) {
      console.error('Failed to load search results:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    async function loadMeta() {
      try {
        const [cList, pList] = await Promise.all([api.getCities(), api.getProfessions()]);
        setCities(cList);
        setProfessions(pList);
      } catch (e) {
        console.error(e);
      }
    }
    loadMeta();
    fetchData(cityId, professionId);
  }, [lang]);

  useEffect(() => {
    const nextCity = initialCityId || '';
    const nextProf = initialProfessionId || '';
    if (nextCity !== cityId || nextProf !== professionId) {
      setCityId(nextCity);
      setProfessionId(nextProf);
      setShowOtherCraftsmen(false);
      fetchData(nextCity, nextProf);
    }
  }, [initialCityId, initialProfessionId]);

  const handleFilterChange = (newCityId: string, newProfId: string) => {
    setCityId(newCityId);
    setProfessionId(newProfId);
    setShowOtherCraftsmen(false); // Reset on filter change
    fetchData(newCityId, newProfId);
  };

  const renderCraftsmanCard = (c: CraftsmanPublic, rankNumber?: number) => (
    <div
      key={c.id}
      onClick={() => onSelectCraftsman(c)}
      className={`rounded-2xl p-3.5 flex flex-col gap-2.5 transition-all cursor-pointer border ${
        rankNumber
          ? 'bg-gradient-to-br from-amber-950/40 via-slate-900 to-slate-900 border-amber-500/50 shadow-md shadow-amber-950/20'
          : 'bg-slate-900/90 border-slate-800 hover:border-slate-700 shadow-sm'
      }`}
    >
      <div className="flex items-start gap-3">
        {/* Photo with rank indicator */}
        <div className="w-16 h-16 rounded-xl overflow-hidden bg-slate-800 shrink-0 border border-slate-700/60 relative">
          {c.primaryPhotoUrl ? (
            <img
              src={c.primaryPhotoUrl}
              alt={c.name}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-slate-800 text-amber-400 font-bold text-xl">
              {c.name.charAt(0)}
            </div>
          )}
          {rankNumber && (
            <div className="absolute top-0 right-0 bg-amber-500 text-slate-950 text-[10px] font-black px-1.5 py-0.5 rounded-bl flex items-center gap-0.5">
              <Star className="w-2.5 h-2.5 fill-slate-950" />
              <span>#{rankNumber}</span>
            </div>
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-1 mb-0.5">
            <h4 className="text-sm font-bold text-white truncate">{c.name}</h4>
          </div>
          <p className="text-xs text-amber-300 font-medium truncate mb-1">
            {c.professionName} • {c.cityName}
          </p>
          <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed">
            {c.description || (lang === 'ka' ? 'აღწერა არ არის მითითებული' : 'No description provided')}
          </p>
        </div>
      </div>

      {/* Action Row: Contact */}
      <div className="flex items-center justify-end pt-2 border-t border-slate-800/80 mt-1">
        {/* Call Button logic per §3.4: Hide completely if phoneVisible is false! */}
        {c.phoneVisible && c.phone ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onCall(c);
            }}
            className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold px-3.5 py-1.5 rounded-xl shadow-md shadow-emerald-900/30 transition-transform active:scale-95"
          >
            <Phone className="w-3.5 h-3.5 fill-white" />
            <span>{t.call} ({c.phone})</span>
          </button>
        ) : (
          <div className="flex items-center gap-1 text-[11px] text-slate-500 italic px-2">
            <EyeOff className="w-3 h-3 text-slate-500" />
            <span>{t.phoneHidden}</span>
          </div>
        )}
      </div>
    </div>
  );

  return localizeTree(lang, (
    <div className="flex-1 flex flex-col p-4 pb-20 space-y-4 animate-fade-in text-slate-100">
      {/* Top Filter Bar */}
      <div className="flex items-center gap-2">
        <div className="flex-1 flex gap-2">
          <select
            value={cityId}
            onChange={(e) => handleFilterChange(e.target.value, professionId)}
            className="flex-1 bg-slate-900 border border-slate-800 rounded-xl px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-amber-500"
          >
            <option value="">{t.selectCity}...</option>
            {cities.map((ct) => (
              <option key={ct.id} value={ct.id}>
                {ct.name}
              </option>
            ))}
          </select>

          <select
            value={professionId}
            onChange={(e) => handleFilterChange(cityId, e.target.value)}
            className="flex-1 bg-slate-900 border border-slate-800 rounded-xl px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-amber-500"
          >
            <option value="">{t.selectProfession}...</option>
            {professions.map((pr) => (
              <option key={pr.id} value={pr.id}>
                {pr.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="py-20 flex flex-col items-center justify-center text-slate-400 gap-2">
          <div className="w-7 h-7 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-xs">
            {lang === 'ka' ? 'მიმდინარეობს ძიება...' : 'Searching...'}
          </span>
        </div>
      ) : !hasBothFilters ? (
        /* Prompt when user has not selected both city and profession, but display matching craftsmen! */
        <div className="space-y-4">
          <div className="flex items-center justify-between px-1 pb-1">
            <span className="text-xs font-bold text-slate-200">
              {lang === 'ka' ? 'მოძებნილი ხელოსნები' : 'Craftsmen Directory'}
            </span>
            <span className="text-[11px] text-amber-400 font-semibold bg-amber-500/10 px-2.5 py-0.5 rounded-full border border-amber-500/20">
              {formatCraftsmanCount(lang, allCraftsmen.length)}
            </span>
          </div>

          {allCraftsmen.length === 0 ? (
            <div className="py-12 text-center text-slate-500 bg-slate-900/40 rounded-2xl border border-slate-800 text-xs">
              {t.noCraftsmenFound}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-2.5">
              {allCraftsmen.map((c) => renderCraftsmanCard(c))}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-5">
          {/* ⭐ TOP 15 Block (Strictly filtered to this City + Profession) */}
          <div className="space-y-3">
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center gap-2">
                <Star className="w-4 h-4 text-amber-400 fill-amber-400" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-amber-400">
                  {t.top15Badge} ({top15.length}/15)
                </h3>
              </div>
              <span className="text-[10px] text-slate-400 font-medium">
                {cities.find(c => c.id === cityId)?.name} • {professions.find(p => p.id === professionId)?.name}
              </span>
            </div>

            {top15.length === 0 ? (
              <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 text-center text-xs text-slate-400">
                {lang === 'ka'
                  ? 'ამ კატეგორიაში Top 15 სლოტი ჯერ თავისუფალია (ხელოსნებს შეუძლიათ ადგილის შეძენა).'
                  : 'Top 15 slots in this category are currently available for purchase.'}
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-2.5">
                {top15.map((c, index) => renderCraftsmanCard(c, index + 1))}
              </div>
            )}

            {/* BUTTON #16: "სხვა ხელოსნები" (User Rule Requirement) */}
            <div className="pt-2">
              <button
                onClick={() => setShowOtherCraftsmen(!showOtherCraftsmen)}
                className={`w-full rounded-2xl p-4 flex items-center justify-between text-left transition-all border shadow-lg ${
                  showOtherCraftsmen
                    ? 'bg-amber-500/10 border-amber-500/80 shadow-amber-500/10'
                    : 'bg-slate-900 hover:bg-slate-850 border-amber-500/40 hover:border-amber-500'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 text-slate-950 font-black flex items-center justify-center text-sm shadow">
                    #16
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-white flex items-center gap-2">
                      <span>{lang === 'ka' ? 'სხვა ხელოსნები' : lang === 'ru' ? 'Другие мастера' : 'Other Craftsmen'}</span>
                      <span className="text-[10px] bg-slate-800 text-amber-300 px-2 py-0.5 rounded-full border border-slate-700">
                        {formatCraftsmanCount(lang, allCraftsmen.length)}
                      </span>
                    </h4>
                    <p className="text-[11px] text-slate-400 flex items-center gap-1 mt-0.5">
                      <Users className="w-3 h-3 text-amber-400" />
                      <span>
                        {lang === 'ka'
                          ? 'სრული კატალოგი • პირდაპირი კონტაქტი'
                          : 'Full Directory • Direct Contact'}
                      </span>
                    </p>
                  </div>
                </div>

                <div className="text-right">
                  <span className="text-xs font-bold text-amber-400 bg-slate-950 px-3 py-1.5 rounded-xl border border-amber-500/30 inline-flex items-center gap-1">
                    {showOtherCraftsmen ? (
                      <>
                        <span>{lang === 'ka' ? 'დახურვა' : 'Close'}</span>
                        <ChevronUp className="w-3.5 h-3.5" />
                      </>
                    ) : (
                      <>
                        <span>{lang === 'ka' ? 'გახსნა' : 'Open'}</span>
                        <ChevronDown className="w-3.5 h-3.5" />
                      </>
                    )}
                  </span>
                </div>
              </button>
            </div>
          </div>

          {/* 👷 UNLIMITED OTHER CRAFTSMEN LIST (Expanded upon clicking #16) */}
          {showOtherCraftsmen && (
            <div className="space-y-3 pt-2 animate-fade-in border-t border-slate-800">
              <div className="flex items-center justify-between px-1">
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-slate-400" />
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                    {lang === 'ka' ? 'სხვა ხელოსნების ულიმიტო სია' : 'Unlimited Craftsmen List'} ({allCraftsmen.length})
                  </h3>
                </div>
                <span className="text-[10px] text-amber-400 font-mono bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                  {lang === 'ka' ? '30 წუთიანი როტაცია' : '30-min shuffle'}
                </span>
              </div>

              {allCraftsmen.length === 0 ? (
                <div className="py-8 text-center text-slate-500 bg-slate-900/40 rounded-2xl border border-slate-800 text-xs">
                  {lang === 'ka' ? 'დამატებითი ხელოსნები ამ კატეგორიაში არ მოიძებნა' : 'No other craftsmen in this category'}
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-2.5">
                  {allCraftsmen.map((c) => renderCraftsmanCard(c))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  ));
};

