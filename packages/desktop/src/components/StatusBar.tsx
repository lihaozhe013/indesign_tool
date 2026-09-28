import { useTranslation } from 'react-i18next';
import type { HostAvailability } from '../bridge.js';

type StatusBarProps = {
  host: HostAvailability | null;
  busy: boolean;
  progressText: string;
  errorCount: number;
  warningCount: number;
  onRefreshHost: () => void;
  onOpenPreview: () => void;
  onOpenReport: () => void;
};

export function StatusBar({
  host,
  busy,
  progressText,
  errorCount,
  warningCount,
  onRefreshHost,
  onOpenPreview,
  onOpenReport
}: StatusBarProps) {
  const { t } = useTranslation();
  const hasIssues = errorCount > 0 || warningCount > 0;
  const badgeTone = errorCount > 0 ? 'errors' : warningCount > 0 ? 'warnings' : 'clear';
  return (
    <footer className="statusbar">
      <div className={`host-chip ${host?.available ? 'online' : 'offline'}`}>
        <span className="status-dot" />
        <span className="host-chip-text">
          {host === null
            ? t('app.host.checking')
            : host.available
              ? t('app.host.connected', { version: host.version ?? t('app.host.ready') })
              : t('app.host.unavailable')}
        </span>
        <button className="text-button" type="button" onClick={onRefreshHost}>
          {t('app.host.refresh')}
        </button>
      </div>

      <div className="statusbar-progress" role="status">
        {busy && <span className="progress-spinner" />}
        {busy ? <span>{progressText || t('app.progress.working')}</span> : null}
      </div>

      <div className="statusbar-actions">
        <button
          type="button"
          className={`report-badge ${badgeTone}`}
          onClick={onOpenReport}
          aria-label={t('app.status.reportAria')}
          title={t('app.status.reportAria')}
        >
          <span className="badge-indicator">{hasIssues ? (errorCount > 0 ? '!' : '△') : '✓'}</span>
          <span className="badge-text">
            {hasIssues ? (
              <>
                {t('app.preflight.errorCount', { count: errorCount })} ·{' '}
                {t('app.preflight.warningCount', { count: warningCount })}
              </>
            ) : (
              t('app.status.allPassed')
            )}
          </span>
          <span className="badge-action">{t('app.status.viewReport')} ↗</span>
        </button>
        <button
          type="button"
          className="button"
          onClick={onOpenPreview}
          aria-label={t('app.status.previewAria')}
          title={t('app.status.previewAria')}
        >
          <span className="button-icon">▭</span> {t('app.status.preview')}
        </button>
      </div>
    </footer>
  );
}
