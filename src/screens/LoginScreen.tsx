import { localizeTree } from '../i18n.js';
import React, { useState } from 'react';
import { Phone, Lock, KeyRound, Eye, EyeOff, UserPlus, AlertCircle, Sparkles } from 'lucide-react';
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
  
  // Default to PASSWORD login for craftsmen: Phone + Password (§User requirement)
  const [authMethod, setAuthMethod] = useState<'PASSWORD' | 'OTP'>('PASSWORD');
  const [phone, setPhone] = useState('+9955');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // OTP flow state
  const [otpStep, setOtpStep] = useState<'REQUEST' | 'VERIFY'>('REQUEST');
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [otpCode, setOtpCode] = useState('');
  const [testHint, setTestHint] = useState<string | null>(null);

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

  // 2. Request SMS OTP
  const handleRequestOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setUserNotRegistered(false);

    if (!phone || phone.trim().length < 8) {
      setErrorMsg(lang === 'ka' ? 'შეიყვანეთ ვალიდური ტელეფონის ნომერი' : 'Enter valid phone number');
      return;
    }

    try {
      setLoading(true);
      const res = await api.requestOtp(phone.trim());
      setChallengeId(res.challengeId);
      setOtpStep('VERIFY');
      if (res.testCodeHint) {
        setTestHint(res.testCodeHint);
        setOtpCode(res.testCodeHint);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to send SMS');
    } finally {
      setLoading(false);
    }
  };

  // 3. Verify SMS OTP
  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!challengeId || !otpCode) return;
    setErrorMsg('');

    try {
      setLoading(true);
      const res = await api.verifyOtp(challengeId, otpCode);
      api.setToken(res.sessionToken);
      onLoginSuccess(res.user, res.isNewUser);
    } catch (err: any) {
      setErrorMsg(err.message || 'Invalid SMS code');
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
              {authMethod === 'PASSWORD' ? (
                <Lock className="w-8 h-8" />
              ) : (
                <KeyRound className="w-8 h-8" />
              )}
            </div>

            <h2 className="text-xl font-black text-white">
              {authMethod === 'PASSWORD' ? t.craftsmanLogin : t.verifyOtp}
            </h2>

            <p className="text-xs text-slate-400">
              {authMethod === 'PASSWORD'
                ? (lang === 'ka'
                    ? 'შესვლა ტელეფონის ნომრითა და პაროლით'
                    : 'Log in with phone number and password')
                : (lang === 'ka'
                    ? 'შესვლა ერთჯერადი SMS კოდით'
                    : 'Log in with one-time SMS verification code')}
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
          {authMethod === 'PASSWORD' && (
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

              {/* Option to switch to SMS OTP */}
              <div className="text-center pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setAuthMethod('OTP');
                    setOtpStep('REQUEST');
                    setErrorMsg('');
                  }}
                  className="text-xs text-slate-400 hover:text-amber-300 underline"
                >
                  {t.orLoginWithOtp}
                </button>
              </div>

            </form>
          )}

          {/* ALTERNATIVE FORM: SMS OTP */}
          {authMethod === 'OTP' && (
            <div className="space-y-4">
              {otpStep === 'REQUEST' ? (
                <form onSubmit={handleRequestOtp} className="space-y-4">
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
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-10 pr-4 py-3 text-sm text-white font-mono focus:outline-none focus:border-amber-500"
                        required
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 text-slate-950 font-bold py-3.5 px-4 rounded-xl shadow-lg shadow-amber-500/20 active:scale-95 transition-all text-sm disabled:opacity-50"
                  >
                    {loading ? '...' : (lang === 'ka' ? 'SMS კოდის მიღება' : 'Send SMS Code')}
                  </button>
                </form>
              ) : (
                <form onSubmit={handleVerifyOtp} className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-medium text-slate-400 px-1">
                      {t.verifyOtp}
                    </label>
                    <input
                      type="text"
                      maxLength={6}
                      value={otpCode}
                      onChange={(e) => setOtpCode(e.target.value)}
                      placeholder="6-digit code"
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-center text-xl tracking-[0.5em] text-white font-mono focus:outline-none focus:border-amber-500"
                      autoFocus
                      required
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 text-slate-950 font-bold py-3.5 px-4 rounded-xl shadow-lg shadow-amber-500/20 active:scale-95 transition-all text-sm disabled:opacity-50"
                  >
                    {loading ? '...' : t.submit}
                  </button>

                  <button
                    type="button"
                    onClick={() => setOtpStep('REQUEST')}
                    className="w-full text-xs text-slate-400 hover:text-white py-1"
                  >
                    {lang === 'ka' ? 'ნომრის შეცვლა' : 'Change Phone'}
                  </button>
                </form>
              )}

              {/* Back to Password Login */}
              <div className="text-center pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    setAuthMethod('PASSWORD');
                    setErrorMsg('');
                  }}
                  className="text-xs text-amber-400 hover:underline font-semibold"
                >
                  {t.orLoginWithPassword}
                </button>
              </div>
            </div>
          )}
        </div>
    </div>
  ));
};

