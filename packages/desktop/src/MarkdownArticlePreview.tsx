import { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkFrontmatter from 'remark-frontmatter';
import remarkGfm from 'remark-gfm';
import { useTranslation } from 'react-i18next';
import { readMarkdownImage } from './bridge.js';

type MarkdownNode = {
  type: string;
  depth?: number;
  value?: string;
  children?: MarkdownNode[];
};

type MarkdownArticlePreviewProps = {
  markdown: string;
  articlePath: string | null;
  title: string;
  subtitle?: string | undefined;
};

export function MarkdownArticlePreview({
  markdown,
  articlePath,
  title,
  subtitle
}: MarkdownArticlePreviewProps) {
  const { t } = useTranslation();

  return (
    <article className="markdown-preview" aria-label={t('app.editor.previewAriaLabel')}>
      <header className="markdown-preview-header">
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </header>
      <div className="markdown-preview-body">
        <ReactMarkdown
          remarkPlugins={[
            remarkGfm,
            [remarkFrontmatter, ['yaml']],
            [remarkRemoveDuplicateTitle, title]
          ]}
          skipHtml
          components={{
            img: ({ src, alt, title: caption }) => (
              <MarkdownImage
                src={src}
                alt={alt ?? ''}
                caption={caption}
                articlePath={articlePath}
              />
            ),
            a: ({ children }) => <span className="markdown-preview-link">{children}</span>
          }}
        >
          {markdown}
        </ReactMarkdown>
      </div>
    </article>
  );
}

function MarkdownImage({
  src,
  alt,
  caption,
  articlePath
}: {
  src: string | undefined;
  alt: string;
  caption: string | undefined;
  articlePath: string | null;
}) {
  const { t } = useTranslation();
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    setDataUrl(null);
    setFailed(false);
    if (!src || !articlePath) {
      setFailed(true);
      return () => {
        active = false;
      };
    }
    void readMarkdownImage(articlePath, src)
      .then((value) => {
        if (active) setDataUrl(value);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, [articlePath, src]);

  return (
    <span className="markdown-preview-image">
      {dataUrl && !failed ? (
        <img src={dataUrl} alt={alt} onError={() => setFailed(true)} />
      ) : (
        <span
          className="markdown-preview-image-placeholder"
          role="img"
          aria-label={alt || t('app.editor.imageUnavailable')}
        >
          {failed ? t('app.editor.imageUnavailable') : t('app.editor.imageLoading')}
        </span>
      )}
      {caption && <span className="markdown-preview-image-caption">{caption}</span>}
    </span>
  );
}

function remarkRemoveDuplicateTitle(title: string) {
  return (tree: MarkdownNode) => {
    if (!Array.isArray(tree.children)) return;
    const headingIndex = tree.children.findIndex(
      (node) => node.type === 'heading' && node.depth === 1
    );
    if (headingIndex >= 0 && markdownText(tree.children[headingIndex]!) === title)
      tree.children.splice(headingIndex, 1);
  };
}

function markdownText(node: MarkdownNode): string {
  if (node.type === 'text' || node.type === 'inlineCode') return node.value ?? '';
  return node.children?.map(markdownText).join('') ?? '';
}
