import { load, type Store } from "@tauri-apps/plugin-store";
import { isSupportedLocale, systemLocale, type Locale } from "./locale.js";

const SETTINGS_FILE = "settings.json";
const LOCALE_KEY = "locale";

async function openStore(): Promise<Store | null> {
  try {
    return await load(SETTINGS_FILE, { autoSave: false });
  } catch {
    // The store plugin is unavailable outside the Tauri shell (unit tests, browser preview).
    return null;
  }
}

export async function loadLocale(): Promise<Locale> {
  const store = await openStore();
  if (!store) return systemLocale();
  try {
    const saved = await store.get(LOCALE_KEY);
    return isSupportedLocale(saved) ? saved : systemLocale();
  } catch {
    return systemLocale();
  } finally {
    await store.close().catch(() => undefined);
  }
}

export async function saveLocale(locale: Locale): Promise<void> {
  const store = await openStore();
  if (!store) return;
  try {
    await store.set(LOCALE_KEY, locale);
    await store.save();
  } catch {
    // Persistence is best effort; the in-memory language still applies this session.
  } finally {
    await store.close().catch(() => undefined);
  }
}
