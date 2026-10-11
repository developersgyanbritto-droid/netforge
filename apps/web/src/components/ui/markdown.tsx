import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import clsx from 'clsx';

/** Safe markdown: react-markdown never renders raw HTML (no rehype-raw), so content cannot inject scripts. */
export function Markdown({ children, className }: { children: string; className?: string }) {
  return (
    <div className={clsx('prose-nf', className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown>
    </div>
  );
}
