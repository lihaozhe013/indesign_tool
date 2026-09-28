import { useTranslation } from 'react-i18next';
import { supportedLocales, type Locale } from '../i18n/index.js';
import { fileName } from '../paths.js';

type SidebarProps = {
  title: string;
  articlePath: string | null;
  dirty: boolean;
  locale: Locale;
  onChangeLocale: (locale: Locale) => void;
};

export function Sidebar({ title, articlePath, dirty, locale, onChangeLocale }: SidebarProps) {
  const { t } = useTranslation();
  return (
    <aside className="sidebar">
      <div className="brand-lockup">
        <div className="brand-mark" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <div>
          <div className="brand-name">Folio</div>
          <div className="brand-caption">DESKTOP PUBLISHING</div>
        </div>
      </div>

      <div className="sidebar-section-label">{t('app.nav.workspace')}</div>
      <button className="side-link active" type="button">
        <span className="side-icon">▤</span> {t('app.nav.publish')}
      </button>
      <div className="sidebar-divider" />
      <div className="sidebar-section-label">{t('app.nav.currentArticle')}</div>
      <div className="article-card">
        <div className="article-card-icon">MD</div>
        <div className="article-card-copy">
          <div className="article-card-title">{title}</div>
          <div className="article-card-meta">
            {articlePath ? fileName(articlePath) : t('app.article.unsavedDraft')}
          </div>
        </div>
        {dirty && <span className="dirty-dot" title={t('app.article.unsavedChanges')} />}
      </div>
      <div className="sidebar-footer">
        <div className="locale-switch" role="group" aria-label={t('app.locale.label')}>
          {supportedLocales.map((option) => (
            <button
              key={option}
              type="button"
              className={locale === option ? 'active' : ''}
              aria-pressed={locale === option}
              onClick={() => onChangeLocale(option)}
            >
              {t(`app.locale.${option}`)}
            </button>
          ))}
        </div>
        <div className="sidebar-version">Folio · 0.1.0</div>
      </div>
    </aside>
  );
}
