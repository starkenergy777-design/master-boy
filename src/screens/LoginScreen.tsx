import { localizeTree } from '../i18n.js';
import React, { useState } from 'react';
import { Phone, Lock, Eye, EyeOff, UserPlus, AlertCircle } from 'lucide-react';
import { translations } from '../i18n.js';
import { Language, User } from '../types.js';
import { api } from '../api.js';

interface LoginScreenProps {
  lang: Language;
  onBack: () => void;
  onLoginSuccess: (user: User, isNewUser: boolean) => void;
  onOpenRegister?: () => void;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({
  lang,
  onBack,
  onLoginSuccess,
  onOpenRegister,
}) => {
  const t = translations[lang] || translations.ka;
  
  // Craftsman and administrator sign-in uses phone number and password.
  const [phone, setPhone] = useState('+9955');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [errorMsg, setErrorMsg] = useState('');
  const [userNotRegistered, setUserNotRegistered] = useState(false);
  const [loading, setLoading] = useState(false);

  // 1. Password Login (Craftsman & Admin Phone + Password)
  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setUserNotRegistered(false);

    if (!phone || phone.trim().length < 8) {
      setErrorMsg(lang === 'ka' ? 'შეიყვანეთ ვალიდური ტელეფონის ნომერი' : 'Enter valid phone number');
      return;
    }
    if (!password) {
      setErrorMsg(lang === 'ka' ? 'შეიყვანეთ პაროლი' : 'Enter password');
      return;
    }

    try {
      setLoading(true);
      const res = await api.loginWithPassword(phone.trim(), password);
      api.setToken(res.sessionToken);
      onLoginSuccess(res.user, res.isNewUser || false);
    } catch (err: any) {
      if (err.data?.notRegistered || err.code === 'USER_NOT_FOUND') {
        setUserNotRegistered(true);
        setErrorMsg(
          lang === 'ka'
            ? 'ხელოსნის ანგარიში ამ ნომრით არ არის რეგისტრირებული. თუ გსურთ დარეგისტრირდეთ როგორც ხელოსანი, გაიარეთ ხელოსნის რეგისტრაცია.'
            : 'No craftsman account exists for this number. Register only if you are a craftsman.'
        );
      } else if (err.code === 'INVALID_PASSWORD') {
        setErrorMsg(lang === 'ka' ? 'არასწორი პაროლი. სცადეთ თავიდან.' : 'Incorrect password. Try again.');
      } else {
        setErrorMsg(err.message || 'Login failed');
      }
    } finally {
      setLoading(false);
    }
  };

  return localizeTree(lang, (
    <div className="flex-1 flex flex-col p-4 pb-20 justify-between animate-fade-in text-slate-100">
        <div className="max-w-sm mx-auto space-y-6 pt-2">
          {/* Header */}
          <div className="text-center space-y-1.5">
            <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center mx-auto mb-3 text-amber-400 shadow-inner">
              <Lock className="w-8 h-8" />
            </div>

            <h2 className="text-xl font-black text-white">{t.craftsmanLogin}</h2>

            <p className="text-xs text-slate-400">
              {lang === 'ka'
                ? 'შესვლა ტელეფონის ნომრითა და პაროლით'
                : lang === 'ru'
                  ? 'Вход по номеру телефона и паролю'
                  : 'Log in with phone number and password'}
            </p>
          </div>

          {errorMsg && (
            <div className="bg-rose-500/10 border border-rose-500/30 rounded-xl p-3 flex flex-col gap-2 text-xs text-rose-300">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                <span>{errorMsg}</span>
              </div>
              {userNotRegistered && onOpenRegister && (
                <button
                  type="button"
                  onClick={onOpenRegister}
                  className="mt-1 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold py-2 px-3 rounded-lg text-xs transition-colors flex items-center justify-center gap-1.5"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>{lang === 'ka' ? 'ხელოსნის რეგისტრაცია' : lang === 'ru' ? 'Регистрация мастера' : 'Craftsman registration'}</span>
                </button>
              )}
            </div>
          )}

          {/* MAIN FORM: PHONE NUMBER + PASSWORD */}
          <form onSubmit={handlePasswordLogin} className="space-y-4">
              {/* Phone input */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-medium text-slate-400 px-1">
                  {t.phoneInput}
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <Phone className="w-4 h-4" />
                  </div>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+995599000000"
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-10 pr-4 py-3 text-sm text-white font-mono focus:outline-none focus:border-amber-500 transition-colors"
                    required
                  />
                </div>
              </div>

              {/* Password input */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-medium text-slate-400 px-1 flex items-center justify-between">
                  <span>{t.passwordPlaceholder}</span>
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <Lock className="w-4 h-4" />
                  </div>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-10 pr-10 py-3 text-sm text-white font-mono focus:outline-none focus:border-amber-500 transition-colors"
                    required
                  />
                  <button
                    type="button"
                    aria-label={showPassword
                      ? (lang === 'ka' ? 'პაროლის დამალვა' : lang === 'ru' ? 'Скрыть пароль' : 'Hide password')
                      : (lang === 'ka' ? 'პაროლის ჩვენება' : lang === 'ru' ? 'Показать пароль' : 'Show password')}
                    aria-pressed={showPassword}
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-white"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Sign In Button */}
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold py-3.5 px-4 rounded-xl shadow-lg shadow-amber-500/20 active:scale-95 transition-all text-sm disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {loading ? (
                  <div className="w-5 h-5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                ) : (
                  <span>{t.signIn}</span>
                )}
              </button>

              {/* NOT REGISTERED? PROMINENT REGISTRATION BUTTON (§User Requirement) */}
              {onOpenRegister && (
                <div className="pt-2 text-center border-t border-slate-800/80 space-y-2">
                  <span className="text-xs text-slate-400 block">
                    {lang === 'ka' ? 'ხელოსანი ჯერ არ ხართ რეგისტრირებული?' : lang === 'ru' ? 'Вы ещё не зарегистрированы как мастер?' : 'Not registered as a craftsman yet?'}
                  </span>
                  <button
                    type="button"
                    onClick={onOpenRegister}
                    className="w-full bg-slate-900 hover:bg-slate-800 text-amber-400 border border-amber-500/40 hover:border-amber-400 font-bold py-3 px-4 rounded-xl text-xs transition-all flex items-center justify-center gap-2 shadow-sm"
                  >
                    <UserPlus className="w-4 h-4" />
                    <span>{lang === 'ka' ? 'ხელოსნის რეგისტრაცია' : lang === 'ru' ? 'Регистрация мастера' : 'Craftsman registration'}</span>
                  </button>
                </div>
              )}

            </form>
          <p role="note" className="text-center text-[11px] text-slate-500">
            {lang === 'ka'
              ? 'SMS-ით შესვლა დროებით მიუწვდომელია. გამოიყენეთ ტელეფონის ნომერი და პაროლი.'
              : lang === 'ru'
                ? 'Вход по SMS временно недоступен. Используйте номер телефона и пароль.'
                : 'SMS sign-in is temporarily unavailable. Use your phone number and password.'}
          </p>
        </div>
    </div>
  ));
};

