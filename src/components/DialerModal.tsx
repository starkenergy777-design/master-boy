import { localizeTree } from '../i18n.js';
import React, { useState, useEffect } from 'react';
import { Phone, PhoneOff, Mic, Volume2, Grid3X3, UserCheck } from 'lucide-react';
import { translations } from '../i18n.js';
import { Language } from '../types.js';

interface DialerModalProps {
  craftsmanName: string;
  phone: string;
  lang: Language;
  onClose: () => void;
}

export const DialerModal: React.FC<DialerModalProps> = ({
  craftsmanName,
  phone,
  lang,
  onClose,
}) => {
  const t = translations[lang] || translations.ka;
  const [callDuration, setCallDuration] = useState(0);
  const [callState, setCallState] = useState<'calling' | 'connected'>('calling');
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeaker, setIsSpeaker] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setCallState('connected');
    }, 2200);

    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    let interval: any;
    if (callState === 'connected') {
      interval = setInterval(() => {
        setCallDuration(d => d + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [callState]);

  const formatDuration = (secs: number) => {
    const m = Math.floor(secs / 60)
      .toString()
      .padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  return localizeTree(lang, (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-sm animate-fade-in p-2 sm:p-4">
      <div className="w-full max-w-sm bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950 border border-slate-700/80 rounded-3xl p-6 shadow-2xl flex flex-col items-center text-center animate-slide-up">
        {/* Android Phone Dialer Header */}
        <div className="w-12 h-1 bg-slate-700 rounded-full mb-6" />

        <div className="w-20 h-20 rounded-full bg-slate-800 border-2 border-amber-500/50 flex items-center justify-center mb-4 relative shadow-lg">
          <UserCheck className="w-10 h-10 text-amber-400" />
          {callState === 'calling' && (
            <span className="absolute -inset-1 rounded-full border border-amber-500/40 animate-ping pointer-events-none" />
          )}
        </div>

        <h3 className="text-xl font-bold text-white mb-1">{craftsmanName}</h3>
        <p className="text-amber-400 font-mono text-base tracking-wider mb-2">{phone}</p>

        <p className="text-xs text-slate-400 font-medium mb-6">
          {callState === 'calling' ? (
            <span className="text-amber-300 animate-pulse">{t.callingNumber}</span>
          ) : (
            <span className="text-emerald-400 font-mono">{formatDuration(callDuration)}</span>
          )}
        </p>

        {/* Dialer controls */}
        <div className="grid grid-cols-3 gap-4 w-full max-w-xs mb-8">
          <button
            onClick={() => setIsMuted(!isMuted)}
            className={`p-3.5 rounded-full flex flex-col items-center justify-center transition-colors ${
              isMuted ? 'bg-amber-500 text-slate-950' : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700'
            }`}
          >
            <Mic className="w-5 h-5 mb-1" />
            <span className="text-[10px]">Mute</span>
          </button>

          <button
            onClick={() => setIsSpeaker(!isSpeaker)}
            className={`p-3.5 rounded-full flex flex-col items-center justify-center transition-colors ${
              isSpeaker ? 'bg-amber-500 text-slate-950' : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700'
            }`}
          >
            <Volume2 className="w-5 h-5 mb-1" />
            <span className="text-[10px]">Speaker</span>
          </button>

          <button className="p-3.5 rounded-full bg-slate-800/80 text-slate-300 hover:bg-slate-700 flex flex-col items-center justify-center transition-colors">
            <Grid3X3 className="w-5 h-5 mb-1" />
            <span className="text-[10px]">Keypad</span>
          </button>
        </div>

        {/* End Call Button & Real Device SIM Call */}
        <div className="flex flex-col items-center gap-3">
          <button
            onClick={onClose}
            className="w-16 h-16 rounded-full bg-rose-600 hover:bg-rose-500 text-white flex items-center justify-center shadow-lg shadow-rose-900/40 transition-transform active:scale-95"
            title="End Call"
          >
            <PhoneOff className="w-7 h-7" />
          </button>

          <a
            href={`tel:${phone}`}
            className="flex items-center gap-1.5 text-xs text-amber-400 bg-amber-500/10 hover:bg-amber-500/20 px-3.5 py-1.5 rounded-xl border border-amber-500/30 font-semibold transition-colors"
          >
            <Phone className="w-3.5 h-3.5" />
            <span>{lang === 'ka' ? 'დარეკვა ტელეფონით (SIM)' : 'Open in Phone (SIM)'}</span>
          </a>
        </div>
      </div>
    </div>
  ));
};
