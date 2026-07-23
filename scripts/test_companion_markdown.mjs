import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ReactMarkdown from "react-markdown";
import { COMPANION_MARKDOWN_ALLOWED_ELEMENTS } from "../src/lib/companionMarkdown.js";

const html = renderToStaticMarkup(
  createElement(
    ReactMarkdown,
    {
      allowedElements: COMPANION_MARKDOWN_ALLOWED_ELEMENTS,
      skipHtml: true,
      unwrapDisallowed: true,
    },
    "* **管辖范围**：正文\n* **主要任务**：协调事务\n\n<script>alert('x')</script>"
  )
);

assert.match(html, /<ul>/);
assert.match(html, /<strong>管辖范围<\/strong>/);
assert.match(html, /<strong>主要任务<\/strong>/);
assert.doesNotMatch(html, /<script|alert\('x'\)/);

console.log("Companion Markdown tests passed.");
