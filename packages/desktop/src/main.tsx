import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";
import { applyDocumentLocale, setupI18n, systemLocale, type Locale } from "./i18n/index.js";
import { loadLocale } from "./i18n/preference.js";
import "./styles.css";

const root = document.getElementById("root");
if (!root) throw new Error("Application root is missing");

const instance = setupI18n(systemLocale());
applyDocumentLocale(instance.language as Locale);

void loadLocale().then((locale) => {
  if (locale !== instance.language) {
    void instance.changeLanguage(locale);
    applyDocumentLocale(locale);
  }
});

createRoot(root).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
