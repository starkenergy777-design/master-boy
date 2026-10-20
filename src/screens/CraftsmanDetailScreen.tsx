import { localizeInlineText, localizeTree } from '../i18n.js';
import React, { useState } from 'react';
import { ArrowLeft, Phone, MapPin, Clock, ShieldCheck, Star, EyeOff, Info, Share2, MessageSquare, Check, MessageCircle } from 'lucide-react';
import { translations } from '../i18n.js';
import { Language, CraftsmanPublic } from '../types.js';

interface CraftsmanDetailScreenProps {
  craftsman: CraftsmanPublic;
  lang: Language;
  onBack: () => void;
  onCall: (craftsman: CraftsmanPublic) => void;
}

export const CraftsmanDetailScreen: React.FC<CraftsmanDetailScreenProps> = ({
  craftsman,
  lang,
  onBack,
  onCall,
}) => {
  const t = translations[lang] || translations.ka;
  const [selectedPhotoIndex, setSelectedPhotoIndex] = useState(0);
  const [copiedLink, setCopiedLink] = useState(false);

  const photos = craftsman.photos && craftsman.photos.length > 0
    ? craftsman.photos
    : craftsman.primaryPhotoUrl
    ? [{ id: '1', url: craftsman.primaryPhotoUrl, displayOrder: 0, isPrimary: true, craftsmanId: craftsman.id, createdAt: '', updatedAt: '' }]
    : [];

  const daysOfWeek = [
    { key: 'monday', ka: 'ორშაბათი', ru: 'Понедельник', en: 'Monday' },
    { key: 'tuesday', ka: 'სამშაბათი', ru: 'Вторник', en: 'Tuesday' },
    { key: 'wednesday', ka: 'ოთხშაბათი', ru: 'Среда', en: 'Wednesday' },
    { key: 'thursday', ka: 'ხუთშაბათი', ru: 'Четверг', en: 'Thursday' },
    { key: 'friday', ka: 'პარასკევი', ru: 'Пятница', en: 'Friday' },
    { key: 'saturday', ka: 'შაბათი', ru: 'Суббота', en: 'Saturday' },
    { key: 'sunday', ka: 'კვირა', ru: 'Воскресенье', en: 'Sunday' },
  ];

  // Calculate if the craftsman is currently open
  const getOpenStatus = (): { isOpen: boolean; label: string } => {
    if (!craftsman.workingHours) {
      return { isOpen: true, label: t.openNow };
    }
    const now = new Date();
    const dayKeys = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const currentDayKey = dayKeys[now.getDay()];
    const todayHours = (craftsman.workingHours as any)[currentDayKey];

    if (!todayHours || typeof todayHours !== 'string') {
      return { isOpen: false, label: t.closedNow };
    }

    const match = todayHours.match(/(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/);
    if (!match) return { isOpen: true, label: t.openNow };

    const [_, startH, startM, endH, endM] = match;
    const currentMins = now.getHours() * 60 + now.getMinutes();
    const startMins = parseInt(startH, 10) * 60 + parseInt(startM, 10);
    const endMins = parseInt(endH, 10) * 60 + parseInt(endM, 10);

    const isOpen = currentMins >= startMins && currentMins <= endMins;
    return {
      isOpen,
      label: isOpen ? t.openNow : t.closedNow,
    };
  };

  const openStatus = getOpenStatus();

  // Normalize phone for WhatsApp and Viber links (e.g. 599112233 -> 995599112233)
  const getNormalizedPhone = (rawPhone?: string | null): string => {
    if (!rawPhone) return '';
    let digits = rawPhone.replace(/[^0-9]/g, '');
    if (digits.length === 9) {
      digits = '995' + digits;
    }
    return digits;
  };
  const cleanPhone = getNormalizedPhone(craftsman.phone);

  const handleShare = async () => {
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({
          title: `${craftsman.name} - ${craftsman.professionName} (MASTER_BOY)`,
          text: lang === 'ka'
            ? `სანდო ხელოსანი ${craftsman.cityName}-ში: ${craftsman.name} (${craftsman.professionName})`
            : lang === 'ru'
              ? `Надёжный мастер в городе ${craftsman.cityName}: ${craftsman.name} (${craftsman.professionName})`
              : `Trusted craftsman in ${craftsman.cityName}: ${craftsman.name} (${craftsman.professionName})`,
          url,
        });
        return;
      } catch (e) {
        // Fallback to clipboard
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    } catch (e) {
      // ignore
    }
  };

  return localizeTree(lang, (
    <div className="flex-1 flex flex-col p-4 pb-28 space-y-4 animate-fade-in text-slate-100">
      {/* Top Breadcrumb & Share */}
      <div className="flex items-center justify-between pb-1">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-amber-400 bg-slate-900 px-3 py-1.5 rounded-xl border border-slate-800 shadow-sm">
            {craftsman.cityName} • {craftsman.professionName}
          </span>
          <span
            className={`text-[11px] font-bold px-2 py-0.5 rounded-lg border ${
              openStatus.isOpen
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
            }`}
          >
            {openStatus.label}
          </span>
        </div>

        <button
          onClick={handleShare}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300 hover:text-white transition-colors text-xs font-semibold shadow-sm"
          title={t.shareProfile}
        >
          {copiedLink ? <Check className="w-4 h-4 text-emerald-400" /> : <Share2 className="w-4 h-4" />}
          <span className="text-[11px]">{copiedLink ? t.linkCopied : t.shareProfile}</span>
        </button>
      </div>

      {copiedLink && (
        <div className="bg-emerald-950/80 border border-emerald-800/80 text-emerald-400 text-xs py-2 px-3 rounded-xl text-center font-medium animate-scale-up">
          ✓ {t.linkCopied}
        </div>
      )}

      {/* Photo Gallery Carousel */}
      <div className="space-y-2">
        <div className="w-full h-56 rounded-3xl overflow-hidden bg-slate-900 border border-slate-800 relative shadow-md">
          {photos.length > 0 ? (
            <img
              src={photos[selectedPhotoIndex]?.url}
              alt={craftsman.name}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-slate-900 text-amber-400 font-bold text-4xl">
              {craftsman.name.charAt(0)}
            </div>
          )}

          {craftsman.isTop15 && (
            <div className="absolute top-3 left-3 bg-amber-500 text-slate-950 px-2.5 py-1 rounded-full text-xs font-black flex items-center gap-1 shadow-lg">
              <Star className="w-3.5 h-3.5 fill-slate-950" />
              <span>TOP 15</span>
            </div>
          )}

          {/* Working Status Badge */}
          <div className="absolute top-3 right-3">
            <span
              className={`px-2.5 py-1 rounded-full text-[11px] font-bold shadow-md flex items-center gap-1.5 backdrop-blur-md ${
                openStatus.isOpen
                  ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-700/60'
                  : 'bg-slate-950/80 text-rose-400 border border-rose-800/60'
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${openStatus.isOpen ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'}`} />
              <span>{openStatus.label}</span>
            </span>
          </div>
        </div>

        {/* Thumbnail Selector */}
        {photos.length > 1 && (
          <div className="flex gap-2 overflow-x-auto py-1 scrollbar-none">
            {photos.map((photo, idx) => (
              <button
                key={photo.id || idx}
                onClick={() => setSelectedPhotoIndex(idx)}
                className={`w-14 h-14 rounded-xl overflow-hidden border-2 shrink-0 transition-all ${
                  selectedPhotoIndex === idx
                    ? 'border-amber-400 scale-105'
                    : 'border-slate-800 opacity-60 hover:opacity-100'
                }`}
              >
                <img src={photo.url} alt="" className="w-full h-full object-cover" />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Main Info Card */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-4 shadow-sm space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h1 className="text-xl font-black text-white">{craftsman.name}</h1>
            <p className="text-xs font-semibold text-amber-400 mt-0.5">
              {craftsman.professionName}
            </p>
          </div>
          <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
            <ShieldCheck className="w-3 h-3" />
            <span>{craftsman.status}</span>
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400 pt-1">
          <span className="flex items-center gap-1 bg-slate-950 px-2.5 py-1 rounded-lg border border-slate-800">
            <MapPin className="w-3.5 h-3.5 text-amber-400" />
            <span>{craftsman.cityName}</span>
          </span>

        </div>

        {/* Quick Georgian Contact Channels (WhatsApp, Viber, SMS) */}
        {craftsman.phoneVisible && craftsman.phone && (
          <div className="pt-2 border-t border-slate-800/80">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-2">
              სწრაფი დაკავშირების არხები:
            </span>
            <div className="grid grid-cols-3 gap-2">
              <a
                href={`https://wa.me/${cleanPhone}`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-center gap-1.5 py-2 px-2 bg-emerald-950/60 hover:bg-emerald-900/60 border border-emerald-700/50 rounded-xl text-emerald-400 text-xs font-bold transition-all active:scale-95"
              >
                <MessageSquare className="w-3.5 h-3.5" />
                <span>WhatsApp</span>
              </a>

              <a
                href={`viber://chat?number=${cleanPhone}`}
                className="flex items-center justify-center gap-1.5 py-2 px-2 bg-purple-950/60 hover:bg-purple-900/60 border border-purple-700/50 rounded-xl text-purple-400 text-xs font-bold transition-all active:scale-95"
              >
                <MessageCircle className="w-3.5 h-3.5" />
                <span>Viber</span>
              </a>

              <a
                href={`sms:${craftsman.phone}`}
                className="flex items-center justify-center gap-1.5 py-2 px-2 bg-slate-950 hover:bg-slate-800 border border-slate-700 rounded-xl text-slate-300 text-xs font-bold transition-all active:scale-95"
              >
                <Phone className="w-3.5 h-3.5 text-amber-400" />
                <span>SMS</span>
              </a>
            </div>
          </div>
        )}

        {/* Description */}
        <div className="pt-2 border-t border-slate-800/80">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">
            {t.aboutCraftsman}
          </h3>
          <p className="text-xs text-slate-300 leading-relaxed whitespace-pre-line">
            {craftsman.description || (lang === 'ka' ? 'აღწერა არ არის მითითებული.' : 'No description provided.')}
          </p>
        </div>

        {/* Bank Account (IBAN) */}
        {craftsman.bankAccount && (
          <div className="pt-2 border-t border-slate-800/80">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1 flex items-center justify-between">
              <span>საბანკო ანგარიში (IBAN)</span>
              <span className="text-amber-400 font-mono text-[10px]">საქართველოს ბანკი</span>
            </h3>
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-2.5 flex items-center justify-between gap-2">
              <span className="font-mono text-xs text-amber-300 font-bold tracking-wider select-all">
                {craftsman.bankAccount}
              </span>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard?.writeText(craftsman.bankAccount || '');
                  alert(localizeInlineText(lang, 'ანგარიშის ნომერი დაკოპირდა!'));
                }}
                className="text-[10px] bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 px-2.5 py-1 rounded-lg border border-amber-500/30 transition-colors shrink-0"
              >
                კოპირება
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Working Hours (§7.1) */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-4 shadow-sm space-y-2">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5 mb-2">
          <Clock className="w-3.5 h-3.5 text-amber-400" />
          <span>{t.workingHours}</span>
          <span className="text-[10px] text-slate-500 lowercase">(Georgia Local Time)</span>
        </h3>

        <div className="space-y-1 text-xs">
          {daysOfWeek.map((day) => {
            const hours = (craftsman.workingHours as any)?.[day.key];
            const isClosed = !hours;
            const dayName = (day as any)[lang] || day.ka;

            return (
              <div
                key={day.key}
                className="flex items-center justify-between py-1 px-1 border-b border-slate-800/50 last:border-none"
              >
                <span className="text-slate-400">{dayName}</span>
                <span className={`font-mono ${isClosed ? 'text-rose-400/80 text-[11px]' : 'text-slate-200'}`}>
                  {isClosed ? (lang === 'ka' ? 'დასვენება' : 'Closed') : hours}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Strict Section 1 Notice: NO REVIEWS */}
      <div className="bg-slate-950/60 border border-slate-800/80 rounded-2xl p-3 flex items-start gap-2.5 text-[11px] text-slate-400">
        <Info className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
        <p className="leading-snug">
          {t.noReviewsNotice}
        </p>
      </div>

      {/* Bottom Sticky Action Bar */}
      <div className="fixed bottom-0 left-0 right-0 p-3 bg-slate-950/95 backdrop-blur-md border-t border-slate-800 z-40 max-w-5xl mx-auto flex items-center justify-between gap-3">
        <div className="flex-1 min-w-0">
          <span className="text-[10px] text-slate-400 block truncate">
            {craftsman.name}
          </span>
          <span className="text-xs font-bold text-white block truncate">
            {craftsman.professionName}
          </span>
        </div>

        {/* If phoneVisible === false: Button is completely hidden! (§3.4) */}
        {craftsman.phoneVisible && craftsman.phone ? (
          <button
            onClick={() => onCall(craftsman)}
            className="flex items-center gap-2 bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white font-bold py-2.5 px-6 rounded-2xl shadow-lg shadow-emerald-900/40 active:scale-95 transition-all text-sm"
          >
            <Phone className="w-4 h-4 fill-white" />
            <span>{t.call}</span>
          </button>
        ) : (
          <div className="flex items-center gap-1.5 text-xs text-slate-400 bg-slate-900 px-4 py-2 rounded-xl border border-slate-800 italic">
            <EyeOff className="w-4 h-4 text-slate-500" />
            <span>{t.phoneHidden}</span>
          </div>
        )}
      </div>
    </div>
  ));
};

