import { useEffect, useRef, useState } from 'preact/hooks';
import { href, routes } from '../router';

const isTyping = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName));

const ROWS: [string, string][] = [
  ['1 – 4', 'Dashboard, Workout, History, Settings'],
  ['?', 'Show or hide this list'],
  ['Enter', 'In a set: fill empty fields with the grey values, tick it, jump to the next set'],
  ['Tab / Shift-Tab', 'Move between fields'],
  ['↑ / ↓', 'In routine number fields: step by 1 (Shift: by 10)'],
  ['← / →', 'On a focused chart: move between points'],
  ['Esc', 'Close this list, or undo an unsaved name edit'],
];

/** Global single-key shortcuts; ignored while typing or with modifier keys held. */
export function Shortcuts() {
  const [open, setOpenState] = useState(false);
  const openRef = useRef(false);
  const closeBtn = useRef<HTMLButtonElement>(null);

  // The listener reads a ref so a key pressed right after toggling sees the new state.
  const setOpen = (v: boolean) => {
    openRef.current = v;
    setOpenState(v);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'Escape' && openRef.current) {
        setOpen(false);
        return;
      }
      if (isTyping(e.target)) return;
      if (e.key === '?') {
        e.preventDefault();
        setOpen(!openRef.current);
      } else if (/^[1-4]$/.test(e.key)) {
        e.preventDefault();
        setOpen(false);
        location.hash = href(routes[Number(e.key) - 1]);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (open) closeBtn.current?.focus();
  }, [open]);

  if (!open) return null;
  return (
    <div class="overlay" onClick={() => setOpen(false)}>
      <div class="dialog" role="dialog" aria-modal="true" aria-labelledby="shortcuts-title" onClick={(e) => e.stopPropagation()}>
        <div class="dialog-head">
          <h2 id="shortcuts-title">Keyboard shortcuts</h2>
          <button type="button" class="text-btn" ref={closeBtn} onClick={() => setOpen(false)}>
            Close
          </button>
        </div>
        <table class="shortcut-table">
          <tbody>
            {ROWS.map(([k, d]) => (
              <tr key={k}>
                <td>
                  <kbd>{k}</kbd>
                </td>
                <td>{d}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
