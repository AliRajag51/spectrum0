"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";

export type SelectOption = { value: string; label: string };

type CustomSelectProps = {
  id: string;
  value: string;
  onChange?: (event: { target: { value: string } }) => void;
  options?: SelectOption[];
  placeholder?: string;
  className?: string;
  disabled?: boolean;
};

export default function CustomSelect({
  id,
  value,
  onChange,
  options = [],
  placeholder = "Select option",
  className = "",
  disabled = false,
}: CustomSelectProps) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const selected = options.find((option) => option.value === value);

  useEffect(() => {
    const handleClick = (e: PointerEvent) => {
      if (!wrapperRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("pointerdown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, []);

  const handleSelect = (option: SelectOption) => {
    onChange?.({ target: { value: option.value } });
    setOpen(false);
  };

  return (
    <div ref={wrapperRef} className={`relative min-w-0 ${className}`}>
      <button
        id={id}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={`${id}-options`}
        onClick={() => setOpen(!open)}
        className={`text-primary focus-visible:ring-primary/30 flex h-11 w-full items-center justify-between gap-2 rounded-xl border bg-white px-3 text-left text-sm font-semibold transition-all outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50 sm:px-4 ${
          open ? "border-primary" : "hover:border-primary/50 border-[#E8DCEA]"
        }`}
      >
        <span className="truncate">{selected?.label || placeholder}</span>
        <ChevronDown
          size={16}
          className={`shrink-0 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div
          id={`${id}-options`}
          role="listbox"
          aria-label={placeholder}
          className="animate-in fade-in slide-in-from-top-1 absolute top-full right-0 left-0 z-50 mt-2 overflow-hidden rounded-2xl border border-[#E8DCEA] bg-white p-1.5 shadow-[0_15px_40px_rgba(40,20,50,0.15)] duration-200"
        >
          {options.map((option) => {
            const active = option.value === value;

            return (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={active}
                onClick={() => handleSelect(option)}
                className={`flex w-full items-center justify-between gap-3 rounded-xl px-3 py-3 text-left text-[13px] transition-colors sm:text-sm ${
                  active
                    ? "text-primary bg-[#F3E7F6] font-semibold"
                    : "text-[#29232D] hover:bg-[#FAF7FA]"
                }`}
              >
                <span>{option.label}</span>
                {active && (
                  <Check size={17} className="text-primary shrink-0" />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
