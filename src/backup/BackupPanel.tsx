import { useEffect, useRef, useState } from 'preact/hooks';
import { getDB } from '../db/db';
import { meta } from '../db/repos';
import {
  MAX_BYTES,
  applyMerge,
  applyReplace,
  backupFilename,
  buildBackup,
  downloadJson,
  dumpAll,
  parseBackup,
  planMerge,
  summarize,
  type Backup,
} from './backup';

type Summary = ReturnType<typeof summarize>;

const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '–';

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

const describe = (s: Summary) =>
  `${plural(s.workouts, 'workout')}${s.workouts ? ` (${when(s.firstWorkout)} – ${when(s.lastWorkout)})` : ''}, ${plural(s.measurements, 'measurement')}, ${plural(s.routines, 'routine')}, ${plural(s.exercises, 'exercise')}`;

interface Pending {
  fileName: string;
  backup: Backup;
  warnings: string[];
  incoming: Summary;
  current: Summary;
}

export function BackupPanel() {
  const [lastBackup, setLastBackup] = useState<string | null | undefined>(undefined);
  const [pending, setPending] = useState<Pending | null>(null);
  const [mode, setMode] = useState<'replace' | 'merge'>('replace');
  const [errors, setErrors] = useState<string[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void (async () => setLastBackup((await meta.get(await getDB(), 'lastBackupAt')) ?? null))();
  }, []);

  const exportNow = async (): Promise<boolean> => {
    try {
      const db = await getDB();
      downloadJson(buildBackup(await dumpAll(db)), backupFilename());
      const at = new Date().toISOString();
      await meta.set(db, 'lastBackupAt', at);
      setLastBackup(at);
      return true;
    } catch (err) {
      console.error(err);
      setErrors(['Couldn’t create the backup file.']);
      return false;
    }
  };

  const onFile = async (file: File | undefined) => {
    setErrors([]);
    setStatus(null);
    setPending(null);
    if (!file) return;
    if (file.size > MAX_BYTES) return setErrors(['That file is too large to be a Fitness Tracker backup.']);
    const result = parseBackup(await file.text());
    if (!result.ok) return setErrors(result.errors);
    const current = summarize(await dumpAll(await getDB()));
    const incoming = summarize(result.backup.data);
    setMode(current.workouts === 0 && current.measurements === 0 ? 'replace' : 'merge');
    setPending({ fileName: file.name, backup: result.backup, warnings: result.warnings, incoming, current });
  };

  const runImport = async () => {
    if (!pending) return;
    if (mode === 'replace') {
      const ok = confirm(
        'Replace all data in this browser with the backup? A safety backup of your current data will download first.',
      );
      if (!ok) return;
    }
    setBusy(true);
    try {
      const db = await getDB();
      if (mode === 'replace') {
        if (!(await exportNow())) return;
        await applyReplace(db, pending.backup.data);
        setStatus('Backup restored. Reloading…');
      } else {
        const plan = planMerge(await dumpAll(db), pending.backup.data);
        await applyMerge(db, plan);
        setStatus(`Merged: ${plan.added} added, ${plan.updated} updated, ${plan.unchanged} already up to date. Reloading…`);
      }
      setPending(null);
      setTimeout(() => location.reload(), 1200);
    } catch (err) {
      console.error(err);
      setErrors(['The import failed and nothing was changed. Try again.']);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div class="backup">
      <p class="muted small storage-note">
        Your data lives only in this browser on this Mac. It doesn’t sync to other devices, and Safari keeps the Dock
        app’s data separate from regular Safari tabs. Clearing website data in Safari deletes it. Export a backup
        regularly and keep it somewhere safe, like iCloud Drive.
      </p>
      <div class="row">
        <span class="row-label">Last backup</span>
        <span class="row-value">{lastBackup === undefined ? '…' : lastBackup ? when(lastBackup) : 'Never'}</span>
      </div>
      <div class="backup-actions">
        <button type="button" class="btn" onClick={() => void exportNow()}>
          Export backup
        </button>
        <button type="button" class="btn" onClick={() => fileInput.current?.click()}>
          Import backup…
        </button>
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => {
            const input = e.target as HTMLInputElement;
            void onFile(input.files?.[0]);
            input.value = '';
          }}
        />
      </div>

      {errors.length > 0 && (
        <div class="banner-error">
          {errors.map((e) => (
            <div key={e}>{e}</div>
          ))}
        </div>
      )}
      {status && <p class="small">{status}</p>}

      {pending && (
        <div class="import-preview">
          <h3>Import {pending.fileName}</h3>
          <dl>
            <dt>Exported</dt>
            <dd>{new Date(pending.backup.exportedAt).toLocaleString()}</dd>
            <dt>In the file</dt>
            <dd>{describe(pending.incoming)}</dd>
            <dt>In this browser</dt>
            <dd>{describe(pending.current)}</dd>
          </dl>
          {pending.warnings.map((w) => (
            <p key={w} class="small warn-text">
              {w}
            </p>
          ))}
          <fieldset class="import-modes">
            <label>
              <input type="radio" name="import-mode" checked={mode === 'replace'} onChange={() => setMode('replace')} />
              <span>
                <strong>Replace</strong>: this browser ends up exactly like the backup. Best for restoring or moving to a
                new browser. A safety backup of what’s here now downloads first.
                {pending.current.active && ' Your workout in progress will be removed (it’s in the safety backup).'}
              </span>
            </label>
            <label>
              <input type="radio" name="import-mode" checked={mode === 'merge'} onChange={() => setMode('merge')} />
              <span>
                <strong>Merge</strong>: adds anything missing and updates records the backup has newer versions of.
                Nothing here is deleted, and your settings are kept. If both places started from fresh defaults,
                routines can appear twice; use Replace in that case.
              </span>
            </label>
          </fieldset>
          <div class="backup-actions">
            <button type="button" class="btn primary" disabled={busy} onClick={() => void runImport()}>
              {mode === 'replace' ? 'Replace my data' : 'Merge into my data'}
            </button>
            <button type="button" class="text-btn" onClick={() => setPending(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
