import React from 'react';

interface FormattedChatMessageProps {
  text: string;
  isUser?: boolean;
  className?: string;
}

function renderInlineFormatting(line: string, isUser?: boolean): React.ReactNode[] {
  // Clean stray markdown headers if any remain inline
  const cleanedLine = line.replace(/^#{1,4}\s+/, '');
  // Match **bold** or `code`
  const tokenRegex = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  const parts = cleanedLine.split(tokenRegex);

  return parts.map((part, idx) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      const content = part.slice(2, -2);
      return (
        <strong
          key={idx}
          className={
            isUser
              ? 'font-bold text-white'
              : 'font-semibold text-[#0F172A] dark:text-[#ECFDF5]'
          }
        >
          {content}
        </strong>
      );
    }
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
      const content = part.slice(1, -1);
      return (
        <span
          key={idx}
          className={
            isUser
              ? 'px-1.5 py-0.5 rounded bg-white/20 font-mono text-[11px] font-semibold text-white'
              : 'px-1.5 py-0.5 rounded-md bg-[#E6F7EF] dark:bg-[#0D281D] border border-[#10B981]/25 font-mono text-[11px] font-semibold text-[#059669] dark:text-[#34D399]'
          }
        >
          {content}
        </span>
      );
    }
    // Strip any stray unmatched ** or `
    return <React.Fragment key={idx}>{part.replace(/\*\*/g, '').replace(/`/g, '')}</React.Fragment>;
  });
}

export const FormattedChatMessage: React.FC<FormattedChatMessageProps> = ({
  text,
  isUser = false,
  className = '',
}) => {
  if (!text) return null;

  // Normalize inline bullets that may have been joined on a single line
  const normalized = text
    .replace(/\r\n/g, '\n')
    .replace(/([:.!?])\s+-\s+\*\*/g, '$1\n- **')
    .replace(/\s+👉\s+/g, '\n\n👉 ');

  const rawLines = normalized
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const blocks: Array<
    | { type: 'paragraph'; content: string }
    | { type: 'heading'; content: string }
    | { type: 'list'; items: string[] }
  > = [];

  for (const line of rawLines) {
    if (/^#{1,4}\s+/.test(line)) {
      blocks.push({
        type: 'heading',
        content: line.replace(/^#{1,4}\s+/, ''),
      });
      continue;
    }

    if (/^([-•*]|\d+\.)\s+/.test(line)) {
      const itemContent = line.replace(/^([-•*]|\d+\.)\s+/, '');
      const prev = blocks[blocks.length - 1];
      if (prev && prev.type === 'list') {
        prev.items.push(itemContent);
      } else {
        blocks.push({ type: 'list', items: [itemContent] });
      }
      continue;
    }

    blocks.push({ type: 'paragraph', content: line });
  }

  return (
    <div className={`space-y-2.5 text-xs sm:text-sm leading-relaxed ${className}`}>
      {blocks.map((block, bIdx) => {
        if (block.type === 'heading') {
          return (
            <div
              key={bIdx}
              className={`font-bold text-sm pt-1 ${
                isUser ? 'text-white' : 'text-[#0F172A] dark:text-[#ECFDF5]'
              }`}
            >
              {renderInlineFormatting(block.content, isUser)}
            </div>
          );
        }

        if (block.type === 'list') {
          return (
            <ul key={bIdx} className="space-y-2 pl-1">
              {block.items.map((item, iIdx) => (
                <li key={iIdx} className="flex items-start gap-2.5">
                  <span
                    className={`w-1.5 h-1.5 rounded-full mt-2 shrink-0 ${
                      isUser ? 'bg-white' : 'bg-[#10B981]'
                    }`}
                  />
                  <span className="flex-1">{renderInlineFormatting(item, isUser)}</span>
                </li>
              ))}
            </ul>
          );
        }

        return (
          <p key={bIdx} className="leading-relaxed">
            {renderInlineFormatting(block.content, isUser)}
          </p>
        );
      })}
    </div>
  );
};
