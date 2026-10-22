import { formatLocalizedTime, localizeTree } from '../i18n.js';
import React, { useState, useEffect, useRef } from 'react';
import { Send, Sparkles, AlertTriangle, ShieldCheck, RefreshCw, Bot, User } from 'lucide-react';
import { translations } from '../i18n.js';
import { Language, ChatMessage } from '../types.js';
import { api } from '../api.js';

interface SupportChatScreenProps {
  lang: Language;
  onBack: () => void;
}

export const SupportChatScreen: React.FC<SupportChatScreenProps> = ({
  lang,
  onBack,
}) => {
  const t = translations[lang] || translations.ka;
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [remainingToday, setRemainingToday] = useState(7);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [hasDisputeFlag, setHasDisputeFlag] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const loadMessages = async () => {
    try {
      const res = await api.getSupportMessages();
      setMessages(res.messages || []);
      // Calculate remaining messages
      const todayStr = new Date().toISOString().split('T')[0];
      const sentToday = (res.messages || []).filter(
        (m: ChatMessage) => m.sender === 'CRAFTSMAN' && m.createdAt.startsWith(todayStr)
      ).length;
      setRemainingToday(Math.max(0, 7 - sentToday));

      const flagged = (res.messages || []).some((m: ChatMessage) => m.flaggedForHuman);
      if (flagged) setHasDisputeFlag(true);
    } catch (err: any) {
      console.error('Failed to load support chat:', err);
    }
  };

  useEffect(() => {
    loadMessages();
    const interval = setInterval(loadMessages, 8000); // Polling per §3.7
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || loading) return;
    setErrorMsg('');

    const textToSend = inputText.trim();
    setInputText('');

    try {
      setLoading(true);
      const res = await api.sendSupportMessage(textToSend);
      if (res.userMessage && res.replyMessage) {
        setMessages((prev) => [...prev, res.userMessage, res.replyMessage]);
      }
      if (res.remainingToday !== undefined) {
        setRemainingToday(res.remainingToday);
      }
      if (res.flaggedForHuman) {
        setHasDisputeFlag(true);
      }
    } catch (err: any) {
      if (err.status === 429) {
        setErrorMsg(t.maxMessagesPerDay);
        setRemainingToday(0);
      } else if (err.status === 503) {
        setErrorMsg(lang === 'ka'
          ? '⚠️ მხარდაჭერის ჩათი დროებით მიუწვდომელია. სუპერ ადმინისტრატორმა უნდა აირჩიოს და გამართოს AI პროვაიდერი.'
          : lang === 'ru'
            ? '⚠️ Чат поддержки временно недоступен. Суперадминистратору нужно выбрать и настроить провайдера ИИ.'
            : '⚠️ Support chat is temporarily unavailable. The super administrator must select and configure an AI provider.');
      } else {
        setErrorMsg(err.message || 'Failed to send message');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleQuickPrompt = (prompt: string) => {
    setInputText(prompt);
  };

  return localizeTree(lang, (
    <div className="flex-1 flex flex-col p-4 pb-4 h-full justify-between animate-fade-in text-slate-100">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <div>
            <h2 className="text-xs font-bold text-white flex items-center gap-1.5">
              <span>{t.supportChat}</span>
              <span className="text-[10px] bg-amber-500/20 text-amber-300 px-1.5 py-0.2 rounded border border-amber-500/30">
                {lang === 'ka' ? 'ონლაინ დახმარება' : 'Online Support'}
              </span>
            </h2>
            <p className="text-[10px] text-slate-400">
              {t.supportSubtitle}
            </p>
          </div>
        </div>

        <div className="text-right">
          <span className="text-[10px] text-slate-400 block">{t.remainingMessages}:</span>
          <span className="text-xs font-bold text-amber-400 font-mono">
            {remainingToday} / 7
          </span>
        </div>
      </div>

      {/* Financial Dispute Flag Banner */}
      {hasDisputeFlag && (
        <div className="my-2 bg-amber-500/10 border border-amber-500/40 rounded-xl p-2.5 flex items-center gap-2 text-xs text-amber-300">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
          <span className="text-[11px] leading-tight">{t.disputeNotice}</span>
        </div>
      )}

      {/* Message List */}
      <div className="flex-1 overflow-y-auto py-3 space-y-3 scrollbar-thin">
        {messages.length === 0 ? (
          <div className="py-12 text-center space-y-2">
            <Bot className="w-10 h-10 text-amber-400 mx-auto opacity-70" />
            <p className="text-xs text-slate-400 max-w-xs mx-auto">
              {lang === 'ka'
                ? 'მოგესალმებით! რით შეგვიძლია დაგეხმაროთ? დასვით კითხვა პროფილის, Top 15-ის ან სერვისების შესახებ.'
                : 'Welcome! How can we help you? Ask any question about profiles, Top 15, or services.'}
            </p>

            {/* Quick Prompt Suggestions */}
            <div className="flex flex-wrap gap-1.5 justify-center pt-3 max-w-xs mx-auto">
              <button
                onClick={() =>
                  handleQuickPrompt(
                    lang === 'ka' ? 'როგორ შევიძინო Top 15 სლოტი?' : 'How do I purchase a Top 15 slot?'
                  )
                }
                className="bg-slate-900 hover:bg-slate-800 text-[10px] text-amber-300 px-2.5 py-1 rounded-lg border border-slate-800"
              >
                ⭐ Top 15-ის ადგილის დაჯავშნა
              </button>
              <button
                onClick={() =>
                  handleQuickPrompt(
                    lang === 'ka' ? 'როგორ დავმალო ჩემი ტელეფონის ნომერი?' : 'How do I hide my phone number?'
                  )
                }
                className="bg-slate-900 hover:bg-slate-800 text-[10px] text-slate-300 px-2.5 py-1 rounded-lg border border-slate-800"
              >
                👁️ ნომრის დამალვა
              </button>
              <button
                onClick={() =>
                  handleQuickPrompt(
                    lang === 'ka' ? 'თანხა დამექვითა და სლოტი არ გააქტიურდა' : 'Payment was charged but slot not active'
                  )
                }
                className="bg-slate-900 hover:bg-slate-800 text-[10px] text-rose-300 px-2.5 py-1 rounded-lg border border-slate-800"
              >
                ⚠️ ფინანსური დავა
              </button>
            </div>
          </div>
        ) : (
          messages.map((m) => {
            const isMe = m.sender === 'CRAFTSMAN';
            return (
              <div
                key={m.id}
                className={`flex gap-2.5 ${isMe ? 'justify-end' : 'justify-start'}`}
              >
                {!isMe && (
                  <div className="w-7 h-7 rounded-lg bg-indigo-500/20 border border-indigo-500/40 text-indigo-400 flex items-center justify-center shrink-0 mt-1">
                    <Bot className="w-4 h-4" />
                  </div>
                )}

                <div
                  className={`max-w-[82%] rounded-2xl p-3 text-xs leading-relaxed ${
                    isMe
                      ? 'bg-amber-500 text-slate-950 font-medium rounded-tr-sm shadow-md'
                      : 'bg-slate-900 border border-slate-800 text-slate-200 rounded-tl-sm shadow-sm'
                  }`}
                >
                  <p className="whitespace-pre-line">{m.body}</p>
                  <span
                    className={`block text-[9px] mt-1 text-right ${
                      isMe ? 'text-slate-900/60' : 'text-slate-500'
                    }`}
                  >
                    {formatLocalizedTime(lang, m.createdAt, { hour: '2-digit', minute: '2-digit' })}
                    {m.flaggedForHuman && ' • Flagged for Admin'}
                  </span>
                </div>

                {isMe && (
                  <div className="w-7 h-7 rounded-lg bg-amber-500/20 border border-amber-500/40 text-amber-400 flex items-center justify-center shrink-0 mt-1">
                    <User className="w-4 h-4" />
                  </div>
                )}
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div className="pt-2 border-t border-slate-800">
        {errorMsg && (
          <p className="text-[11px] text-rose-400 text-center mb-1.5">{errorMsg}</p>
        )}

        <form onSubmit={handleSendMessage} className="flex gap-2">
          <input
            type="text"
            maxLength={1000}
            disabled={remainingToday <= 0 || loading}
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder={remainingToday > 0 ? t.typeMessage : t.maxMessagesPerDay}
            className="flex-1 bg-slate-900 border border-slate-700/80 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-amber-500 disabled:opacity-50"
          />
          <button
            type="submit"
            aria-label={lang === 'ka' ? 'შეტყობინების გაგზავნა' : lang === 'ru' ? 'Отправить сообщение' : 'Send message'}
            aria-busy={loading}
            disabled={!inputText.trim() || remainingToday <= 0 || loading}
            className="bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 px-3.5 py-2.5 rounded-xl font-bold transition-all shrink-0 active:scale-95"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>

        <p className="text-[10px] text-slate-500 text-center mt-1">
          {lang === 'ka'
            ? 'მაქს. 1000 სიმბოლო • 7 შეტყობინება დღეში • მხარდაჭერის სისტემა'
            : lang === 'ru'
            ? 'Макс. 1000 символов • 7 сообщений в день • Система поддержки'
            : 'Max 1000 characters • 7 messages/day • support system'}
        </p>
      </div>
    </div>
  ));
};


