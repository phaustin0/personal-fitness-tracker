import { useEffect, useState } from 'preact/hooks';

interface NumberFieldProps {
  value: number;
  min: number;
  max: number;
  onCommit: (n: number) => void;
  /** Extra rule beyond min/max; return an error message or null. */
  validate?: (n: number) => string | null;
  label: string;
  class?: string;
}

/** Integer input that saves on every valid keystroke and reverts on blur if left invalid. */
export function NumberField({ value, min, max, onCommit, validate, label, class: cls }: NumberFieldProps) {
  const [text, setText] = useState(String(value));
  const [error, setError] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setText(String(value));
  }, [value, focused]);

  const check = (raw: string): [number | null, string | null] => {
    if (!/^\d+$/.test(raw.trim())) return [null, 'Enter a whole number'];
    const n = Number(raw);
    if (n < min || n > max) return [null, `Use ${min}–${max}`];
    const custom = validate?.(n);
    return custom ? [null, custom] : [n, null];
  };

  const apply = (raw: string) => {
    setText(raw);
    const [n, err] = check(raw);
    setError(err);
    if (n !== null && n !== value) onCommit(n);
  };

  return (
    <input
      type="text"
      inputMode="numeric"
      class={`num ${error ? 'invalid' : ''} ${cls ?? ''}`}
      value={text}
      aria-label={label}
      aria-invalid={error ? true : undefined}
      title={error ?? label}
      onFocus={(e) => {
        setFocused(true);
        (e.target as HTMLInputElement).select();
      }}
      onBlur={() => {
        setFocused(false);
        if (error) {
          setText(String(value));
          setError(null);
        }
      }}
      onInput={(e) => apply((e.target as HTMLInputElement).value)}
      onKeyDown={(e) => {
        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
          e.preventDefault();
          const base = check(text)[0] ?? value;
          const step = e.shiftKey ? 10 : 1;
          const next = Math.min(max, Math.max(min, base + (e.key === 'ArrowUp' ? step : -step)));
          apply(String(next));
        } else if (e.key === 'Enter') {
          (e.target as HTMLInputElement).blur();
        }
      }}
    />
  );
}

interface TextFieldProps {
  value: string;
  onCommit: (s: string) => void;
  validate?: (s: string) => string | null;
  label: string;
  placeholder?: string;
  class?: string;
}

/** Text input that saves on blur or Enter; Escape or an invalid value reverts. */
export function TextField({ value, onCommit, validate, label, placeholder, class: cls }: TextFieldProps) {
  const [text, setText] = useState(value);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setText(value), [value]);

  const commit = (): boolean => {
    const trimmed = text.trim();
    const err = trimmed ? (validate?.(trimmed) ?? null) : 'Can’t be empty';
    if (err) {
      setError(err);
      return false;
    }
    setError(null);
    if (trimmed !== value) onCommit(trimmed);
    else setText(value);
    return true;
  };

  return (
    <span class="field-wrap">
      <input
        type="text"
        class={`text ${error ? 'invalid' : ''} ${cls ?? ''}`}
        value={text}
        aria-label={label}
        aria-invalid={error ? true : undefined}
        placeholder={placeholder}
        onInput={(e) => {
          setText((e.target as HTMLInputElement).value);
          setError(null);
        }}
        onBlur={() => {
          if (!commit()) {
            setText(value);
            setError(null);
          }
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') {
            setText(value);
            setError(null);
          }
        }}
      />
      {error && <span class="field-error">{error}</span>}
    </span>
  );
}
