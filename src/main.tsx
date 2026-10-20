import React, { Component, ErrorInfo, ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { localizeInlineText } from './i18n.js';
import { Language } from './types.js';
import './index.css';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class RootErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('RootErrorBoundary caught error:', error, errorInfo);
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      const savedLanguage = localStorage.getItem('mb_lang') as Language | null;
      const lang: Language = savedLanguage && ['ka', 'ru', 'en'].includes(savedLanguage) ? savedLanguage : 'ka';
      return (
        <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-6 text-center select-none font-sans">
          <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500 mb-4 shadow-lg shadow-amber-500/10">
            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </div>
          <h2 className="text-xl font-bold mb-2">{localizeInlineText(lang, 'MASTER_BOY — კავშირის განახლება')}</h2>
          <p className="text-sm text-slate-400 max-w-xs mb-6">
            {localizeInlineText(lang, 'სერვერი იღვიძებს ან მონაცემები განახლდა. გთხოვთ დააჭიროთ განახლებას.')}
          </p>
          <button
            onClick={this.handleReload}
            className="px-6 py-2.5 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold rounded-xl text-sm transition-all shadow-lg shadow-amber-500/20 active:scale-95 cursor-pointer"
          >
            {localizeInlineText(lang, 'გადატვირთვა')}
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

createRoot(document.getElementById('root')!).render(
  <RootErrorBoundary>
    <App />
  </RootErrorBoundary>
);
