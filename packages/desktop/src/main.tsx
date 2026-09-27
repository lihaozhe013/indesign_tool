import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";
import { getStoredLocale, onLocaleChanged, setStoredLocale } from "./bridge.js";
import { applyDocumentLocale, createLocaleApplier, setupI18n, systemLocale, type Locale } from "./i18n/index.js";
import { isSupportedLocale } from "./i18n/locale.js";
import "./styles.css";

const root = document.getElementById("root");
if (!root) throw new Error("Application root is missing");

const instance = setupI18n(systemLocale());
applyDocumentLocale(instance.language as Locale);
const applyLocale = createLocaleApplier(instance);

// The stored preference wins, then the system language. On a first run the resolved value is
// written back so the native menu checkmark matches what the WebView is showing.
void getStoredLocale()
  .then((stored) => {
    const resolved: Locale = isSupportedLocale(stored) ? stored : systemLocale();
    applyLocale(resolved);
    return isSupportedLocale(stored) ? undefined : setStoredLocale(resolved);
  })
  .catch(() => undefined);

// The View menu is the other control for the same preference; Rust has already persisted it.
void onLocaleChanged(applyLocale).catch(() => undefined);

createRoot(root).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
