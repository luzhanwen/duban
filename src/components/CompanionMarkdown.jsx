import ReactMarkdown from "react-markdown";
import { COMPANION_MARKDOWN_ALLOWED_ELEMENTS } from "../lib/companionMarkdown.js";

export default function CompanionMarkdown({ content = "", className = "" }) {
  return (
    <div className={`companion-markdown ${className}`.trim()}>
      <ReactMarkdown
        allowedElements={COMPANION_MARKDOWN_ALLOWED_ELEMENTS}
        skipHtml
        unwrapDisallowed
        components={{
          a: ({ children, ...props }) => (
            <a {...props} target="_blank" rel="noreferrer">
              {children}
            </a>
          ),
        }}
      >
        {String(content || "")}
      </ReactMarkdown>
    </div>
  );
}
