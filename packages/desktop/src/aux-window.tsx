import React from "react";
import { createRoot } from "react-dom/client";
import type { ReactNode } from "react";
import { getStoredLocale, onLocaleChanged } from "./bridge.js";
import { applyDocumentLocale, createLocaleApplier, setupI18n, systemLocale, type Locale } from "./i18n/index.js";
import { isSupportedLocale } from "./i18n/locale.js";
import "./styles.css";

/**
 * Auxiliary windows follow the stored locale but never write it: the main window settles the
 * first-run preference, and the View menu broadcasts changes to every window through the same
 * locale-changed event.
 */
export function mountAuxWindow(component: ReactNode): void {
  const root = document.getElementById("root");
  if (!root) throw new Error("Application root is missing");

  const instance = setupI18n(systemLocale());
  applyDocumentLocale(instance.language as Locale);
  const applyLocale = createLocaleApplier(instance);

  void getStoredLocale()
    .then((stored) => {
      if (isSupportedLocale(stored)) applyLocale(stored);
    })
    .catch(() => undefined);
  void onLocaleChanged(applyLocale).catch(() => undefined);

  createRoot(root).render(
    <React.StrictMode>
      {component}
    </React.StrictMode>
  );
}
