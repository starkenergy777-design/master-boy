import { localizeTree } from '../i18n.js';
import React from 'react';
import { Globe, Shield, LogOut, Check, Copy, Link2, Download } from 'lucide-react';
import { translations } from '../i18n.js';
import { Language, User } from '../types.js';
import { getPwaInstallState, promptPwaInstall, subscribePwaInstallState, PwaInstallState } from '../pwaInstall.js';

interface SettingsScreenProps {
  lang: Language;
  onLanguageChange: (lang: Language) => void;
  currentUser: User | null;
  onLogout: () => void;
  onBack?: () => void;
}

export const SettingsScreen: React.FC<SettingsScreenProps> = ({
  lang,
  onLanguageChange,
  currentUser,
  onLogout,
  onBack,
}) => {
  const t = translations[lang] || translations.ka;
  const appUrl = typeof window !== 'undefined'
    ? new URL('/', window.location.origin).toString()
    : 'https://master-boy.onrender.com/';
  const [linkCopyStatus, setLinkCopyStatus] = React.useState<'idle' | 'copied' | 'error'>('idle');
  const [installState, setInstallState] = React.useState<PwaInstallState>(getPwaInstallState);
  const [showInstallInstructions, setShowInstallInstructions] = React.useState(false);

  React.useEffect(() => subscribePwaInstallState(setInstallState), []);

  const handleInstallApp = async () => {
    try {
      const outcome = await promptPwaInstall();
      setShowInstallInstructions(outcome === 'unavailable');
    } catch {
      setShowInstallInstructions(true);
    }
  };

  const handleCopyAppLink = async () => {
    let copied = false;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(appUrl);
        copied = true;
      }
    } catch {
      // Use the selection-based fallback if clipboard permission is unavailable.
    }

    if (!copied) {
      const input = document.createElement('textarea');
      input.value = appUrl;
      input.setAttribute('readonly', '');
      input.style.position = 'fixed';
      input.style.opacity = '0';
      try {
        document.body.appendChild(input);
        input.select();
        copied = document.execCommand('copy');
      } catch {
        copied = false;
      } finally {
        input.remove();
      }
    }

    setLinkCopyStatus(copied ? 'copied' : 'error');
    window.setTimeout(() => setLinkCopyStatus('idle'), copied ? 2200 : 3500);
  };

  const languages: { code: Language; label: string; flag: string }[] = [
    { code: 'ka', label: 'ქართული', flag: '🇬🇪' },
    { code: 'ru', label: 'Русский', flag: '🇷🇺' },
    { code: 'en', label: 'English', flag: '🇬🇧' },
  ];

  return localizeTree(lang, (
    <div className="flex-1 flex flex-col p-4 pb-20 space-y-4 animate-fade-in text-slate-100">
      <div className="flex items-center gap-2">
        <h2 className="text-base font-bold text-white flex items-center gap-2">
          <Globe className="w-5 h-5 text-amber-400" />
          <span>{t.settings}</span>
        </h2>
      </div>

      {/* Language Selector (§8: 3 languages only: ka, ru, en) */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-4 space-y-3">
        <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
          {t.language}
        </h3>

        <div className="grid grid-cols-1 gap-2">
          {languages.map((l) => (
            <button
              key={l.code}
              onClick={() => onLanguageChange(l.code)}
              className={`flex items-center justify-between p-3 rounded-2xl border text-xs font-semibold transition-all ${
                lang === l.code
                  ? 'bg-amber-500/10 border-amber-500 text-white'
                  : 'bg-slate-950/60 border-slate-800/80 text-slate-400 hover:border-slate-700'
              }`}
            >
              <span className="flex items-center gap-2.5">
                <span className="text-base">{l.flag}</span>
                <span>{l.label}</span>
              </span>
              {lang === l.code && <Check className="w-4 h-4 text-amber-400" />}
            </button>
          ))}
        </div>
      </div>

      {/* Share the app */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-4 space-y-3">
        <div>
          <h3 className="font-bold text-amber-400 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
            <Link2 className="w-3.5 h-3.5" />
            <span>{lang === 'ka' ? 'აპლიკაციის გაზიარება' : lang === 'ru' ? 'Поделиться приложением' : 'Share the app'}</span>
          </h3>
          <p className="text-xs text-slate-400 mt-1.5">
            {lang === 'ka'
              ? 'გაუგზავნეთ ეს ბმული ხელოსნებსა და მომხმარებლებს, რომ აპლიკაცია მეტმა ადამიანმა გამოიყენოს.'
              : lang === 'ru'
                ? 'Отправьте эту ссылку мастерам и клиентам, чтобы больше людей узнали о приложении.'
                : 'Send this link to craftsmen and customers to help more people discover the app.'}
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-2">
          <input
            type="text"
            readOnly
            value={appUrl}
            aria-label={lang === 'ka' ? 'აპლიკაციის ბმული' : lang === 'ru' ? 'Ссылка на приложение' : 'App link'}
            onFocus={(event) => event.currentTarget.select()}
            className="min-w-0 flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-slate-200 font-mono"
          />
          <button
            type="button"
            onClick={handleCopyAppLink}
            className="shrink-0 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold py-2.5 px-4 rounded-xl flex items-center justify-center gap-2 text-xs transition-colors"
          >
            {linkCopyStatus === 'copied' ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            <span aria-live="polite">{linkCopyStatus === 'copied' ? t.linkCopied : t.copyLink}</span>
          </button>
        </div>

        {linkCopyStatus === 'error' && (
          <p role="status" className="text-[11px] text-rose-300">
            {lang === 'ka'
              ? 'ბმული ვერ დაკოპირდა. მონიშნეთ და დააკოპირეთ ველიდან.'
              : lang === 'ru'
                ? 'Не удалось скопировать ссылку. Выделите её в поле и скопируйте вручную.'
                : 'Could not copy the link. Select it in the field and copy it manually.'}
          </p>
        )}
        <button
          type="button"
          onClick={handleInstallApp}
          disabled={installState === 'installed'}
          className="w-full bg-slate-800 hover:bg-slate-700 disabled:bg-slate-800/60 disabled:text-slate-500 text-white font-bold py-2.5 px-4 rounded-xl border border-slate-700 flex items-center justify-center gap-2 text-xs transition-colors"
        >
          {installState === 'installed' ? <Check className="w-4 h-4 text-emerald-400" /> : <Download className="w-4 h-4 text-amber-400" />}
          <span aria-live="polite">
            {installState === 'installed'
              ? lang === 'ka' ? 'აპი უკვე დაყენებულია' : lang === 'ru' ? 'Приложение уже установлено' : 'App is already installed'
              : lang === 'ka' ? 'აპის ინსტალაცია' : lang === 'ru' ? 'Установить приложение' : 'Install app'}
          </span>
        </button>

        {showInstallInstructions && (
          <div role="status" className="rounded-xl border border-slate-700 bg-slate-950/70 p-3 space-y-2 text-[11px] leading-relaxed text-slate-300">
            <p>
              {lang === 'ka'
                ? 'Android / Chrome: გახსენით ⋮ მენიუ და აირჩიეთ „აპის ინსტალაცია“ ან „მთავარ ეკრანზე დამატება“.'
                : lang === 'ru'
                  ? 'Android / Chrome: откройте меню ⋮ и выберите «Установить и создать ярлык» или «Добавить на главный экран».'
                  : 'Android / Chrome: open the ⋮ menu and choose “Install app” or “Add to Home screen”.'}
            </p>
            <p>
              {lang === 'ka'
                ? 'iPhone / iPad: Safari-ში დააჭირეთ „გაზიარებას“ → „მთავარ ეკრანზე დამატება“. თუ ბმული სხვა აპში გაიხსნა, ჯერ Safari-ში გახსენით.'
                : lang === 'ru'
                  ? 'iPhone / iPad: в Safari нажмите «Поделиться» → «На экран „Домой“». Если ссылка открылась в другом приложении, сначала откройте её в Safari.'
                  : 'iPhone / iPad: in Safari, tap “Share” → “Add to Home Screen”. If the link opened inside another app, open it in Safari first.'}
            </p>
            <p>
              {lang === 'ka'
                ? 'კომპიუტერზე: ბრაუზერის მენიუში მოძებნეთ „აპის ინსტალაცია“ ან მისამართის ველთან არსებული ინსტალაციის ხატულა.'
                : lang === 'ru'
                  ? 'На компьютере: найдите «Установить приложение» в меню браузера или нажмите значок установки рядом с адресной строкой.'
                  : 'On a computer: look for “Install app” in the browser menu or select the install icon beside the address bar.'}
            </p>
          </div>
        )}
      </div>

      {/* Platform Info */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-4 space-y-2.5 text-xs">
        <h3 className="font-bold text-amber-400 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
          <Shield className="w-3.5 h-3.5 text-amber-400" />
          <span>
            {lang === 'ka'
              ? 'პლატფორმის შესახებ'
              : lang === 'ru'
                ? 'О платформе'
                : 'About the platform'}
          </span>
        </h3>
        <ul className="space-y-1.5 text-slate-300 text-xs">
          <li className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
            <span>{lang === 'ka' ? 'საქართველოს მასშტაბით ხელოსნებთან პირდაპირი დაკავშირება' : lang === 'ru' ? 'Прямой контакт с мастерами по всей Грузии' : 'Direct contact with craftsmen across Georgia'}</span>
          </li>
          <li className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
            <span>{lang === 'ka' ? 'Top 15 პრიორიტეტული და შემოწმებული პროფესიონალები' : lang === 'ru' ? 'Проверенные специалисты в приоритетном списке ТОП-15' : 'Top 15 premier verified professionals'}</span>
          </li>
          <li className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
            <span>{lang === 'ka' ? 'მომხმარებელთა კონფიდენციალურობა და უსაფრთხოება' : lang === 'ru' ? 'Конфиденциальность и безопасность пользователей' : 'User privacy and data security'}</span>
          </li>
        </ul>
      </div>



      {currentUser && (
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-4 space-y-3 text-xs">
          <h3 className="font-bold text-slate-300 uppercase tracking-wider text-[11px]">
            Active Session
          </h3>
          <div className="space-y-1 text-slate-400 text-[11px]">
            <p>Phone: <strong className="text-white font-mono">{currentUser.phone}</strong></p>
            <p>Roles: <strong className="text-amber-400">{currentUser.roles.join(', ')}</strong></p>
          </div>

          <button
            onClick={onLogout}
            className="w-full mt-2 bg-rose-950/60 hover:bg-rose-900 text-rose-300 font-bold py-2.5 px-3 rounded-xl border border-rose-800/80 flex items-center justify-center gap-2 text-xs transition-colors"
          >
            <LogOut className="w-4 h-4" />
            <span>{t.logout}</span>
          </button>
        </div>
      )}

      <div className="text-center pt-4 text-[11px] text-slate-500">
        MASTER_BOY • {new Date().getFullYear()}
      </div>
    </div>
  ));
};
