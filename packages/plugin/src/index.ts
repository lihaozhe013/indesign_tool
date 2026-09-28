import { parseArticle } from '@folio/core';
import {
  createPanelValidationModel,
  type PanelBlockPreview,
  type PanelValidationModel
} from './panel-model.js';

const sampleArticle = `# A better publishing workflow

This sample article shows how structured content can be checked before it is composed in InDesign.

## Keep the source semantic

Use headings, paragraphs, quotes, and standalone images to describe the article. The template supplies the visual styles.

> InDesign remains responsible for typography and text composition.
`;

export function mountFolioPanel(panelDocument: Document = document): void {
  const query = <T extends Element>(selector: string): T | null =>
    panelDocument.querySelector(selector) as T | null;
  const input = query<HTMLTextAreaElement>('#article-input');
  const validateButton = query<HTMLButtonElement>('#validate-article');
  const sampleButton = query<HTMLButtonElement>('#load-example');
  const status = query('#validation-status');
  const title = query('#article-title');
  const byline = query('#article-byline');
  const blockCount = query('#block-count');
  const issueCount = query('#issue-count');
  const tabIssueCount = query('#tab-issue-count');
  const outline = query('#article-outline');
  const diagnostics = query('#diagnostic-list');
  const emptyOutline = query('#outline-empty');
  const emptyDiagnostics = query('#diagnostics-empty');
  const tabs = panelDocument.querySelectorAll("[role='tab']");
  const tabPanels = panelDocument.querySelectorAll("[role='tabpanel']");

  if (
    !input ||
    !validateButton ||
    !status ||
    !title ||
    !byline ||
    !blockCount ||
    !issueCount ||
    !tabIssueCount ||
    !outline ||
    !diagnostics ||
    !emptyOutline ||
    !emptyDiagnostics
  )
    return;

  const clearList = (element: Element): void => {
    while (element.firstChild) element.removeChild(element.firstChild);
  };

  const eachElement = (elements: NodeList, callback: (element: Element) => void): void => {
    for (let index = 0; index < elements.length; index += 1) {
      callback(elements.item(index) as Element);
    }
  };

  const showTab = (tabName: string): void => {
    eachElement(tabs, (tab) => {
      const selected = tab.getAttribute('data-tab') === tabName;
      tab.setAttribute('aria-selected', String(selected));
    });
    eachElement(tabPanels, (panel) => {
      if (panel.getAttribute('data-panel') === tabName) panel.removeAttribute('hidden');
      else panel.setAttribute('hidden', '');
    });
  };

  const resetResults = (): void => {
    status.textContent = 'Changes not validated';
    status.setAttribute('data-state', 'idle');
    title.textContent = 'No article preview';
    byline.textContent = '';
    blockCount.textContent = '—';
    issueCount.textContent = '—';
    tabIssueCount.textContent = '';
    clearList(outline);
    clearList(diagnostics);
    emptyOutline.removeAttribute('hidden');
    emptyDiagnostics.removeAttribute('hidden');
  };

  const renderOutline = (blocks: PanelBlockPreview[]): void => {
    clearList(outline);
    emptyOutline.setAttribute('hidden', '');
    blocks.forEach((block) => {
      const item = panelDocument.createElement('li');
      item.className = 'outline-item';
      item.setAttribute('data-block-type', block.label.toLowerCase());

      const badge = panelDocument.createElement('span');
      badge.className = 'block-badge';
      badge.textContent = block.type;

      const content = panelDocument.createElement('span');
      content.className = 'block-preview';
      content.textContent = block.preview || block.label;

      item.appendChild(badge);
      item.appendChild(content);
      outline.appendChild(item);
    });
    if (blocks.length === 0) emptyOutline.removeAttribute('hidden');
  };

  const renderDiagnostics = (model: PanelValidationModel): void => {
    clearList(diagnostics);
    const issueTotal = model.errorCount + model.warningCount;
    issueCount.textContent = issueTotal === 0 ? 'None' : String(issueTotal);
    tabIssueCount.textContent = issueTotal === 0 ? '' : String(issueTotal);
    if (model.diagnostics.length > 0) emptyDiagnostics.setAttribute('hidden', '');
    else emptyDiagnostics.removeAttribute('hidden');
    model.diagnostics.forEach((diagnostic) => {
      const item = panelDocument.createElement('li');
      item.className = 'diagnostic-item';
      item.setAttribute('data-severity', diagnostic.severity);

      const heading = panelDocument.createElement('strong');
      heading.className = 'diagnostic-severity';
      heading.textContent = diagnostic.severity;

      const message = panelDocument.createElement('span');
      message.className = 'diagnostic-message';
      message.textContent = diagnostic.message;

      item.appendChild(heading);
      item.appendChild(message);
      const code = panelDocument.createElement('small');
      code.className = 'diagnostic-code';
      code.textContent = diagnostic.code;
      item.appendChild(code);
      if (diagnostic.path) {
        const path = panelDocument.createElement('small');
        path.className = 'diagnostic-path';
        path.textContent = diagnostic.path;
        item.appendChild(path);
      }
      diagnostics.appendChild(item);
    });
  };

  const validate = (): void => {
    const model = createPanelValidationModel(parseArticle(input.value));
    status.textContent = model.status;
    status.setAttribute('data-state', model.state);
    title.textContent = model.title;
    byline.textContent = model.byline || '';
    blockCount.textContent = String(model.blockCount);
    renderOutline(model.blocks);
    renderDiagnostics(model);
  };

  validateButton.addEventListener('click', validate);
  input.addEventListener('input', resetResults);
  sampleButton?.addEventListener('click', () => {
    input.value = sampleArticle;
    validate();
    showTab('outline');
  });
  eachElement(tabs, (tab) =>
    tab.addEventListener('click', () => {
      showTab(tab.getAttribute('data-tab') ?? 'article');
    })
  );
}

if (document.querySelector('#folio-panel')) mountFolioPanel(document);
