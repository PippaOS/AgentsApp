import { marked } from 'marked';
import DOMPurify from 'dompurify';
import hljs from 'highlight.js';

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Configure marked with custom renderer for code blocks with copy menu.
 *
 * NOTE: this uses the same DOM structure/classes as the chat UI so existing
 * event delegation keeps working (`.code-menu-container`, `.code-menu-btn`, etc).
 */
let isMarkedConfigured = false;

function configureMarked(): void {
  console.log("configureMarked");
  if (isMarkedConfigured) return;

  const renderer = new marked.Renderer();

  // Custom code block renderer with three-dot menu
  renderer.code = ({ text, lang }) => {
    const language = lang || 'text';
    let highlighted: string;

    try {
      if (lang && hljs.getLanguage(lang)) {
        highlighted = hljs.highlight(text, { language: lang }).value;
      } else {
        highlighted = hljs.highlightAuto(text).value;
      }
    } catch {
      highlighted = escapeHtml(text);
    }

    // Store code in data attribute (base64 encoded to avoid HTML escaping issues)
    const codeData = btoa(unescape(encodeURIComponent(text)));

    return `
      <div class="code-block-wrapper">
        <div class="code-block-header">
          <span class="code-block-language">${escapeHtml(language)}</span>
          <div class="code-menu-container">
            <button class="code-menu-btn" data-code="${codeData}" type="button" aria-label="Code actions">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M6 9l6 6 6-6"></path>
              </svg>
            </button>
            <div class="code-menu-popup" data-code="${codeData}">
              <button class="code-menu-item" data-action="copy" data-code="${codeData}">
                Copy
              </button>
            </div>
          </div>
        </div>
        <pre><code class="hljs language-${escapeHtml(language)}">${highlighted}</code></pre>
      </div>
    `;
  };

  // Custom inline code renderer
  renderer.codespan = ({ text }) => {
    return `<code class="inline-code">${escapeHtml(text)}</code>`;
  };

  marked.setOptions({
    renderer,
    breaks: true, // Convert \n to <br>
    gfm: true, // GitHub Flavored Markdown
  });

  isMarkedConfigured = true;
}

/**
 * Render markdown to sanitized HTML with syntax highlighting and copy menu.
 */
export function renderMarkdown(text: string): string {
  if (!text) return '';

  configureMarked();

  const rawHtml = marked.parse(text, { async: false }) as string;

  return DOMPurify.sanitize(rawHtml, {
    ALLOWED_TAGS: [
      'p',
      'br',
      'strong',
      'em',
      'u',
      's',
      'code',
      'pre',
      'a',
      'ul',
      'ol',
      'li',
      'blockquote',
      'h1',
      'h2',
      'h3',
      'h4',
      'h5',
      'h6',
      'div',
      'span',
      'button',
      'svg',
      'rect',
      'path',
      'table',
      'thead',
      'tbody',
      'tr',
      'th',
      'td',
    ],
    ALLOWED_ATTR: [
      'href',
      'target',
      'rel',
      'class',
      'data-code',
      'data-action',
      'type',
      'width',
      'height',
      'viewBox',
      'fill',
      'stroke',
      'stroke-width',
      'stroke-linecap',
      'stroke-linejoin',
      'x',
      'y',
      'rx',
      'ry',
      'd',
      'cx',
      'cy',
      'r',
      'aria-label',
    ],
  }) as string;
}

