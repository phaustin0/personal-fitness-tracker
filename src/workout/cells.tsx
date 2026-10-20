import { useEffect, useRef, useState } from 'preact/hooks';

export const fmt = (n: number | null) => (n === null ? '' : String(Number(n.toFixed(2))));

function parse(kind: 'load' | 'reps', raw: string): { ok: boolean; value: number | null } {
  const t = raw.trim().replace(',', '.');
  if (t === '') return { ok: true, value: null };
  if (kind === 'reps') {
    if (!/^\d+$/.test(t)) return { ok: false, value: null };
    const n = Number(t);
    return n <= 500 ? { ok: true, value: n } : { ok: false, value: null };
  }
  if (!/^\d+(\.\d+)?$/.test(t)) return { ok: false, value: null };
  const n = Number(t);
  return n <= 1000 ? { ok: true, value: n } : { ok: false, value: null };
}

interface CellProps {
  kind: 'load' | 'reps';
  label: string;
  value: number | null;
  placeholder: string;
  first?: boolean;
  nudge?: boolean;
  inputRef?: { current: HTMLInputElement | null };
  onCommit: (v: number | null) => void;
  onKeyDown: (e: KeyboardEvent) => void;
}

export function CellInput({ kind, label, value, placeholder, first, nudge, inputRef, onCommit, onKeyDown }: CellProps) {
  const [text, setText] = useState(fmt(value));
  const [bad, setBad] = useState(false);
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) setText(fmt(value));
  }, [value]);

  return (
    <input
      ref={inputRef}
      type="text"
      inputMode={kind === 'load' ? 'decimal' : 'numeric'}
      class={`cell ${bad ? 'invalid' : ''} ${nudge && value === null && !placeholder ? 'invalid' : ''}`}
      aria-label={label}
      aria-invalid={bad || undefined}
      data-first={first ? '' : undefined}
      value={text}
      placeholder={placeholder}
      onFocus={(e) => {
        focused.current = true;
        (e.target as HTMLInputElement).select();
      }}
      onBlur={() => {
        focused.current = false;
        if (bad) {
          setText(fmt(value));
          setBad(false);
        }
      }}
      onInput={(e) => {
        const raw = (e.target as HTMLInputElement).value;
        setText(raw);
        const p = parse(kind, raw);
        setBad(!p.ok);
        if (p.ok && p.value !== value) onCommit(p.value);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && bad) {
          e.preventDefault();
          return;
        }
        onKeyDown(e);
      }}
    />
  );
}
