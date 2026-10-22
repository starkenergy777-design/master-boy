import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  AirVent,
  Anvil,
  Armchair,
  BrickWall,
  BriefcaseBusiness,
  Camera,
  Check,
  ChevronDown,
  DoorClosed,
  Droplets,
  Drill,
  Flame,
  Frame,
  Grid2X2,
  Heater,
  KeyRound,
  LampCeiling,
  Paintbrush,
  PaintRoller,
  PanelsTopLeft,
  Search,
  Snowflake,
  Trash2,
  Waves,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { Profession } from '../types.js';

const professionIcons: Record<string, LucideIcon> = {
  'prof-electrician': Zap,
  'prof-plumber': Droplets,
  'prof-ac': Snowflake,
  'prof-carpenter': Armchair,
  'prof-painter': Paintbrush,
  'prof-tiler': Grid2X2,
  'prof-locksmith': KeyRound,
  'prof-heating': Heater,
  'prof-demolition-drill': Drill,
  'prof-waste-removal': Trash2,
  'prof-gas-water-heater': Flame,
  'prof-sewer-cleaning': Waves,
  'prof-drywall': PanelsTopLeft,
  'prof-stretch-ceiling': LampCeiling,
  'prof-plasterer': PaintRoller,
  'prof-masonry': BrickWall,
  'prof-window-door': Frame,
  'prof-door-lock': DoorClosed,
  'prof-cctv-alarm': Camera,
  'prof-welder': Anvil,
};

interface ProfessionIconProps {
  professionId: string;
  size?: 'sm' | 'md';
}

export const ProfessionIcon: React.FC<ProfessionIconProps> = ({ professionId, size = 'md' }) => {
  const Icon = professionIcons[professionId] || AirVent;
  const sizeClassName = size === 'sm' ? 'h-8 w-8 rounded-lg' : 'h-9 w-9 rounded-xl';

  return (
    <span
      aria-hidden="true"
      className={`flex shrink-0 items-center justify-center overflow-hidden border border-amber-500/25 bg-amber-500/10 ${sizeClassName}`}
    >
      <Icon className="h-[18px] w-[18px] max-h-full max-w-full shrink-0 text-amber-300" strokeWidth={2} />
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
  allowClear = false,
  label,
  labelClassName = '',
  className = '',
  buttonClassName = '',
}) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const pickerId = useId().replace(/:/g, '');
  const triggerId = `profession-trigger-${pickerId}`;
  const optionsId = `profession-options-${pickerId}`;
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const selectedProfession = professions.find((profession) => profession.id === value);
  const filteredProfessions = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    if (!normalizedQuery) return professions;
    return professions.filter((profession) => profession.name.toLocaleLowerCase().includes(normalizedQuery));
  }, [professions, query]);

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
        className={`flex w-full min-w-0 items-center gap-2 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white transition-colors hover:border-amber-500/70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400 ${buttonClassName}`}
      >
        {selectedProfession ? (
          <ProfessionIcon professionId={selectedProfession.id} size="sm" />
        ) : (
          <span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-700 bg-slate-900 text-amber-300">
            <BriefcaseBusiness className="h-4 w-4" />
          </span>
        )}
        <span className="min-w-0 flex-1 break-words text-left leading-snug">
          {selectedProfession?.name || (allowClear ? allLabel : placeholder)}
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="mt-2 overflow-hidden rounded-xl border border-slate-700 bg-slate-950 shadow-xl shadow-black/40">
          <div className="border-b border-slate-800 p-2">
            <div className="relative">
              <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                aria-label={searchPlaceholder}
                placeholder={searchPlaceholder}
                className="w-full rounded-lg border border-slate-800 bg-slate-900 py-2 pl-9 pr-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-amber-500"
              />
            </div>
          </div>
          <div id={optionsId} role="listbox" aria-label={ariaLabel} className="max-h-60 overflow-y-auto overscroll-contain p-1.5">
            {allowClear && (
              <button
                type="button"
                role="option"
                aria-selected={!value}
                onClick={() => selectProfession('')}
                className={`flex min-h-11 w-full min-w-0 items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition-colors focus-visible:outline-2 focus-visible:outline-amber-400 ${!value ? 'bg-emerald-500/10 text-emerald-100' : 'text-slate-200 hover:bg-slate-800'}`}
              >
                <span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-700 bg-slate-900 text-slate-300">
                  <BriefcaseBusiness className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1 break-words leading-snug">{allLabel}</span>
                {!value && <Check aria-hidden="true" className="h-4 w-4 shrink-0 text-emerald-300" />}
              </button>
            )}
            {filteredProfessions.map((profession) => {
              const selected = profession.id === value;
              return (
                <button
                  key={profession.id}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onClick={() => selectProfession(profession.id)}
                  className={`flex min-h-11 w-full min-w-0 items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition-colors focus-visible:outline-2 focus-visible:outline-amber-400 ${selected ? 'bg-emerald-500/10 text-emerald-100' : 'text-slate-200 hover:bg-slate-800'}`}
                >
                  <ProfessionIcon professionId={profession.id} size="sm" />
                  <span className="min-w-0 flex-1 break-words leading-snug">{profession.name}</span>
                  {selected && <Check aria-hidden="true" className="h-4 w-4 shrink-0 text-emerald-300" />}
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
