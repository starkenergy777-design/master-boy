import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  AirVent,
  Armchair,
  BrickWall,
  BriefcaseBusiness,
  Cctv,
  Check,
  ChevronDown,
  DoorClosed,
  Drill,
  Flame,
  Frame,
  Grid2X2,
  Heater,
  KeyRound,
  LampCeiling,
  PaintRoller,
  PanelsTopLeft,
  PlugZap,
  Search,
  Trash2,
  X,
  type LucideIcon,
} from 'lucide-react';
import { Profession } from '../types.js';

const professionIcons: Record<string, LucideIcon> = {
  'prof-electrician': PlugZap,
  'prof-ac': AirVent,
  'prof-carpenter': Armchair,
  'prof-painter': PaintRoller,
  'prof-tiler': Grid2X2,
  'prof-locksmith': KeyRound,
  'prof-heating': Heater,
  'prof-demolition-drill': Drill,
  'prof-waste-removal': Trash2,
  'prof-gas-water-heater': Flame,
  'prof-drywall': PanelsTopLeft,
  'prof-stretch-ceiling': LampCeiling,
  'prof-masonry': BrickWall,
  'prof-window-door': Frame,
  'prof-door-lock': DoorClosed,
  'prof-cctv-alarm': Cctv,
};

interface CustomProfessionGlyphProps {
  className?: string;
  strokeWidth?: number;
}

const FaucetGlyph: React.FC<CustomProfessionGlyphProps> = ({ className, strokeWidth = 2 }) => (
  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M3 9h5a2 2 0 0 0 2-2V5h6v4h4a2 2 0 0 1 2 2v1" />
    <path d="M12 5V3m-2 0h4" />
    <path d="M19 12v2" />
    <path d="M19 17c-.8 1-1.5 1.7-1.5 2.5a1.5 1.5 0 0 0 3 0c0-.8-.7-1.5-1.5-2.5Z" />
  </svg>
);

const SewerSnakeGlyph: React.FC<CustomProfessionGlyphProps> = ({ className, strokeWidth = 2 }) => (
  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M5 4v5a5 5 0 0 0 5 5h3a4 4 0 0 1 4 4v2" />
    <path d="M3 4h4m-2-2v4" />
    <path d="M15 10h4v3" />
    <path d="M15 20h4m-2-2v4" />
  </svg>
);

const TrowelGlyph: React.FC<CustomProfessionGlyphProps> = ({ className, strokeWidth = 2 }) => (
  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="m4 4 8 2.7-5.7 5.7L4 4Z" />
    <path d="m7 12 7.5 7.5" />
    <path d="m13.1 17.9 1.4 1.4a2 2 0 0 0 2.8-2.8l-1.4-1.4" />
  </svg>
);

const WeldingHelmetGlyph: React.FC<CustomProfessionGlyphProps> = ({ className, strokeWidth = 2 }) => (
  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M5 11a7 7 0 0 1 14 0v5H5v-5Z" />
    <path d="M8 12h8v4H8zM9 20h6m-8-4-2 2m12-2 2 2" />
    <path d="m3 8-1-1m19 1 1-1m-10-5V1" />
  </svg>
);

const customProfessionGlyphs: Record<string, React.FC<CustomProfessionGlyphProps>> = {
  'prof-plumber': FaucetGlyph,
  'prof-sewer-cleaning': SewerSnakeGlyph,
  'prof-plasterer': TrowelGlyph,
  'prof-welder': WeldingHelmetGlyph,
};

export function getProfessionDisplayNumber(professions: Profession[], professionId: string): string | null {
  const index = professions.findIndex((profession) => profession.id === professionId);
  return index < 0 ? null : String(index + 1).padStart(2, '0');
}

interface ProfessionIconProps {
  professionId: string;
  size?: 'sm' | 'md';
}

export const ProfessionIcon: React.FC<ProfessionIconProps> = ({ professionId, size = 'md' }) => {
  const Icon = professionIcons[professionId];
  const CustomGlyph = customProfessionGlyphs[professionId];
  const sizeClassName = size === 'sm' ? 'h-11 w-11 rounded-xl' : 'h-12 w-12 rounded-2xl';

  return (
    <span
      aria-hidden="true"
      className={`flex shrink-0 items-center justify-center overflow-hidden border border-amber-500/25 bg-amber-500/10 ${sizeClassName}`}
    >
      {CustomGlyph ? (
        <CustomGlyph className="h-6 w-6 max-h-full max-w-full shrink-0 text-amber-300" strokeWidth={2} />
      ) : Icon ? (
        <Icon className="h-6 w-6 max-h-full max-w-full shrink-0 text-amber-300" strokeWidth={2} />
      ) : (
        <BriefcaseBusiness className="h-6 w-6 max-h-full max-w-full shrink-0 text-amber-300" strokeWidth={2} />
      )}
    </span>
  );
};

interface ProfessionPickerProps {
  professions: Profession[];
  value: string;
  onChange: (professionId: string) => void;
  ariaLabel: string;
  placeholder: string;
  allLabel: string;
  searchPlaceholder: string;
  noResultsLabel: string;
  closeLabel: string;
  allowClear?: boolean;
  label?: string;
  labelClassName?: string;
  className?: string;
  buttonClassName?: string;
}

export const ProfessionPicker: React.FC<ProfessionPickerProps> = ({
  professions,
  value,
  onChange,
  ariaLabel,
  placeholder,
  allLabel,
  searchPlaceholder,
  noResultsLabel,
  closeLabel,
  allowClear = false,
  label,
  labelClassName = '',
  className = '',
  buttonClassName = '',
}) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [isMobile, setIsMobile] = useState(false);
  const pickerId = useId().replace(/:/g, '');
  const triggerId = `profession-trigger-${pickerId}`;
  const optionsId = `profession-options-${pickerId}`;
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const selectedProfession = professions.find((profession) => profession.id === value);
  const professionNumberById = useMemo(
    () => new Map<string, string>(professions.map((profession, index) => [profession.id, String(index + 1).padStart(2, '0')])),
    [professions],
  );
  const filteredProfessions = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    if (!normalizedQuery) return professions;
    return professions.filter((profession) => profession.name.toLocaleLowerCase().includes(normalizedQuery));
  }, [professions, query]);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(max-width: 639px)');
    const updateIsMobile = () => setIsMobile(mediaQuery.matches);
    updateIsMobile();
    mediaQuery.addEventListener('change', updateIsMobile);
    return () => mediaQuery.removeEventListener('change', updateIsMobile);
  }, []);

  useEffect(() => {
    if (open && isMobile) closeButtonRef.current?.focus();
  }, [open, isMobile]);

  useEffect(() => {
    if (!open) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) {
        setOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('pointerdown', closeOnOutsidePointer);
    return () => document.removeEventListener('pointerdown', closeOnOutsidePointer);
  }, [open]);

  const close = () => {
    setOpen(false);
    setQuery('');
  };

  const selectProfession = (professionId: string) => {
    onChange(professionId);
    close();
  };

  return (
    <div
      ref={rootRef}
      className={`relative min-w-0 ${className}`}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && open) {
          event.preventDefault();
          close();
          triggerRef.current?.focus();
        }
      }}
    >
      {label && (
        <label htmlFor={triggerId} className={`mb-1.5 block text-sm font-semibold text-slate-300 ${labelClassName}`}>
          {label}
        </label>
      )}
      <button
        ref={triggerRef}
        id={triggerId}
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={optionsId}
        onClick={() => setOpen((current) => !current)}
        className={`flex min-h-14 w-full min-w-0 items-center gap-3 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-base text-white transition-colors hover:border-amber-500/70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400 ${buttonClassName}`}
      >
        {selectedProfession ? (
          <ProfessionIcon professionId={selectedProfession.id} size="sm" />
        ) : (
          <span aria-hidden="true" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-700 bg-slate-900 text-amber-300">
            <BriefcaseBusiness className="h-6 w-6" />
          </span>
        )}
        {selectedProfession && (
          <span aria-hidden="true" className="shrink-0 rounded-lg border border-amber-500/20 bg-amber-500/10 px-2 py-1.5 text-sm font-extrabold tabular-nums text-amber-300">
            {professionNumberById.get(selectedProfession.id)}
          </span>
        )}
        <span className="min-w-0 flex-1 break-words text-left text-lg font-semibold leading-snug">
          {selectedProfession?.name || (allowClear ? allLabel : placeholder)}
        </span>
        <ChevronDown className={`h-5 w-5 shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal={isMobile ? true : undefined}
          aria-label={label || ariaLabel}
          className="fixed inset-0 z-[100] mx-auto flex min-h-0 w-full max-w-lg flex-col overflow-hidden bg-slate-950 p-3 pt-[max(env(safe-area-inset-top),0.75rem)] pb-[max(env(safe-area-inset-bottom),0.75rem)] sm:static sm:z-auto sm:mt-2 sm:block sm:w-auto sm:max-w-none sm:rounded-xl sm:border sm:border-slate-700 sm:p-0 sm:shadow-xl sm:shadow-black/40"
        >
          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-800 px-1 pb-3 sm:hidden">
            <h2 className="text-lg font-bold text-white">{label || ariaLabel}</h2>
            <button
              ref={closeButtonRef}
              type="button"
              aria-label={closeLabel}
              onClick={() => {
                close();
                triggerRef.current?.focus();
              }}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-amber-400"
            >
              <X aria-hidden="true" className="h-6 w-6" />
            </button>
          </div>
          <div className="shrink-0 border-b border-slate-800 p-2">
            <div className="relative">
              <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-500" />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                aria-label={searchPlaceholder}
                placeholder={searchPlaceholder}
                className="w-full rounded-lg border border-slate-800 bg-slate-900 py-3 pl-10 pr-3 text-base text-white outline-none placeholder:text-slate-500 focus:border-amber-500"
              />
            </div>
          </div>
          <div id={optionsId} role="listbox" aria-label={ariaLabel} className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2 sm:max-h-[60vh] sm:flex-none">
            {allowClear && (
              <button
                type="button"
                role="option"
                aria-selected={!value}
                onClick={() => selectProfession('')}
                className={`flex min-h-14 w-full min-w-0 items-center gap-3 rounded-xl px-3 py-2 text-left text-base transition-colors focus-visible:outline-2 focus-visible:outline-amber-400 ${!value ? 'bg-emerald-500/10 text-emerald-100' : 'text-slate-200 hover:bg-slate-800'}`}
              >
                <span aria-hidden="true" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-700 bg-slate-900 text-slate-300">
                  <BriefcaseBusiness className="h-6 w-6" />
                </span>
                <span className="min-w-0 flex-1 break-words text-lg font-medium leading-snug">{allLabel}</span>
                {!value && <Check aria-hidden="true" className="h-4 w-4 shrink-0 text-emerald-300" />}
              </button>
            )}
            {filteredProfessions.map((profession) => {
              const selected = profession.id === value;
              const displayNumber = professionNumberById.get(profession.id);
              return (
                <button
                  key={profession.id}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onClick={() => selectProfession(profession.id)}
                  className={`flex min-h-14 w-full min-w-0 items-center gap-3 rounded-xl px-3 py-2 text-left text-base transition-colors focus-visible:outline-2 focus-visible:outline-amber-400 ${selected ? 'bg-emerald-500/10 text-emerald-100' : 'text-slate-200 hover:bg-slate-800'}`}
                >
                  <ProfessionIcon professionId={profession.id} size="sm" />
                  <span aria-hidden="true" className="w-10 shrink-0 rounded-lg border border-slate-700 bg-slate-900 px-1.5 py-2 text-center text-sm font-extrabold tabular-nums text-slate-200">
                    {displayNumber}
                  </span>
                  <span className="min-w-0 flex-1 break-words text-lg font-medium leading-snug">{profession.name}</span>
                  {selected && <Check aria-hidden="true" className="h-5 w-5 shrink-0 text-emerald-300" />}
                </button>
              );
            })}
            {filteredProfessions.length === 0 && (
              <p className="px-3 py-4 text-center text-sm text-slate-400">{noResultsLabel}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
