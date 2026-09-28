import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Diagnostic } from '@folio/contracts';
import { getLastOutput, getLastReport, onReportUpdated, openOutput } from '../bridge.js';
import { countDiagnostics, translateDiagnostic } from '../diagnostics.js';
import { DiagnosticRow } from '../components/DiagnosticRow.js';

type ReportFilter = 'all' | 'error' | 'warning';

export function ReportWindow() {
  const { t } = useTranslation();
  const [diagnostics, setDiagnostics] = useState<Diagnostic[]>([]);
  const [filter, setFilter] = useState<ReportFilter>('all');
  const [reportPath, setReportPath] = useState<string | null>(null);

  useEffect(() => {
    document.title = t('app.preflight.title');
  }, [t]);

  // Pull the current list, then follow pushes from the main window while this window is open.
  useEffect(() => {
    let active = true;
    void getLastReport()
      .then((value) => {
        if (active) setDiagnostics(value);
      })
      .catch(() => undefined);
    void getLastOutput()
      .then((value) => {
        if (active) setReportPath(value?.reportPath ?? null);
      })
      .catch(() => undefined);
    const unlisten = onReportUpdated((value) => setDiagnostics(value));
    return () => {
      active = false;
      void unlisten.then((off) => off());
    };
  }, []);

  const counts = useMemo(() => countDiagnostics(diagnostics), [diagnostics]);
  const visible =
    filter === 'all' ? diagnostics : diagnostics.filter((item) => item.severity === filter);

  const filters: Array<{ id: ReportFilter; label: string; count: number }> = [
    { id: 'all', label: t('app.reportWindow.filterAll'), count: diagnostics.length },
    { id: 'error', label: t('app.reportWindow.filterErrors'), count: counts.errors },
    { id: 'warning', label: t('app.reportWindow.filterWarnings'), count: counts.warnings }
  ];

  return (
    <div className="aux-shell">
      <header className="aux-header">
        <div className="aux-heading-copy">
          <span className="section-overline">{t('app.preflight.overline')}</span>
          <h1>{t('app.preflight.title')}</h1>
          <p>{t('app.reportWindow.hint')}</p>
        </div>
        {reportPath && (
          <div className="aux-header-actions">
            <button className="button" type="button" onClick={() => void openOutput(reportPath)}>
              {t('app.preview.openReport')}
            </button>
          </div>
        )}
      </header>

      <div className="report-toolbar" role="group" aria-label={t('app.preflight.title')}>
        {filters.map((entry) => (
          <button
            key={entry.id}
            type="button"
            className={`filter-chip ${filter === entry.id ? 'active' : ''} ${entry.id}`}
            aria-pressed={filter === entry.id}
            onClick={() => setFilter(entry.id)}
          >
            {entry.label}
            <span className="filter-count">{entry.count}</span>
          </button>
        ))}
      </div>

      <div className="aux-body">
        {visible.length > 0 ? (
          <div className="diagnostic-list report-list">
            {visible.map((item, index) => (
              <DiagnosticRow
                key={`${item.code}-${item.path ?? index}-${index}`}
                diagnostic={item}
                message={translateDiagnostic(t, item)}
              />
            ))}
          </div>
        ) : diagnostics.length === 0 ? (
          <div className="empty-checks">
            <span className="checks-mark">✓</span>
            <div>
              <strong>{t('app.preflight.emptyTitle')}</strong>
              <span>{t('app.preflight.emptyHint')}</span>
            </div>
          </div>
        ) : (
          <div className="empty-checks">
            <span className="checks-mark">✓</span>
            <div>
              <strong>{t('app.reportWindow.emptyFiltered')}</strong>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
