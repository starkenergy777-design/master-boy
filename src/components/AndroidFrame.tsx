import React from 'react';

interface AndroidFrameProps {
  children: React.ReactNode;
  onAndroidBack?: () => void;
  onAndroidHome?: () => void;
}

export const AndroidFrame: React.FC<AndroidFrameProps> = ({ children }) => {
  return (
    <div className="h-[100dvh] max-h-[100dvh] bg-slate-950 flex justify-center text-slate-100 antialiased selection:bg-amber-500 selection:text-black overflow-hidden">
      <div className="w-full max-w-lg h-full max-h-[100dvh] bg-slate-950 sm:border-x sm:border-slate-800/80 sm:shadow-2xl flex flex-col relative overflow-hidden">
        {children}
      </div>
    </div>
  );
};
