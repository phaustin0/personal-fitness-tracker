import { render } from 'preact';
import { App } from './app';
import { getDB } from './db/db';
import { seedIfNeeded } from './db/seed';
import { requestPersistentStorage } from './db/storage';
import './styles.css';

const root = document.getElementById('app')!;

getDB()
  .then(async (db) => {
    await seedIfNeeded(db);
    void requestPersistentStorage();
    render(<App />, root);
  })
  .catch((err: unknown) => {
    console.error(err);
    render(
      <div class="fatal">
        <h1>Couldn't open your data</h1>
        <p>
          The browser refused access to local storage. This can happen in a private window or if website data is
          blocked in Safari's settings. Your existing data hasn't been changed.
        </p>
        <pre>{String(err)}</pre>
      </div>,
      root,
    );
  });
