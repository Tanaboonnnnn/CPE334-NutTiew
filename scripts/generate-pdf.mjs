import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { compileDeliverable, slugify } from './compile-deliverable.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '..');
const mdPath = resolve(rootDir, 'docs/deliverables/deliverable-1.md');
const pdfPath = resolve(rootDir, 'docs/deliverables/CPE334_Deliverable1_NutTiew.pdf');
const imageDataUrlCache = new Map();

function loadImageAsset(src, verifyAssets = true) {
  let resolvedSrc = src;
  if (src.startsWith('../evidence/')) {
    resolvedSrc = resolve(rootDir, 'docs', src.replace('../', ''));
  } else if (!src.startsWith('http://') && !src.startsWith('https://')) {
    resolvedSrc = resolve(dirname(mdPath), src);
  }
  if (resolvedSrc.startsWith('http://') || resolvedSrc.startsWith('https://')) {
    return { dataUrl: resolvedSrc, cropNote: null };
  }
  if (imageDataUrlCache.has(resolvedSrc)) {
    return imageDataUrlCache.get(resolvedSrc);
  }
  if (!existsSync(resolvedSrc)) {
    if (verifyAssets) {
      throw new Error(`Missing image asset referenced in deliverable markdown: ${src} -> ${resolvedSrc}`);
    }
    return { dataUrl: `file:///${resolvedSrc.replace(/\\/g, '/')}`, cropNote: null };
  }
  const ext = extname(resolvedSrc).toLowerCase();
  const mime =
    ext === '.png'
      ? 'image/png'
      : ext === '.jpg' || ext === '.jpeg'
        ? 'image/jpeg'
        : ext === '.webp'
          ? 'image/webp'
          : ext === '.svg'
            ? 'image/svg+xml'
            : 'application/octet-stream';

  let asset = null;
  if (ext === '.png' || ext === '.jpg' || ext === '.jpeg' || ext === '.webp') {
    const cropPy = `
import base64, json, sys, pymupdf
p = sys.argv[1]
pix = pymupdf.Pixmap(p)
if pix.height > pix.width * 2.5:
    h = min(pix.height, int(pix.width * 2.55))
    sub = pymupdf.Pixmap(pix.colorspace, (0, 0, pix.width, h), pix.alpha)
    sub.copy(pix, (0, 0, pix.width, h))
    b64 = base64.b64encode(sub.tobytes("png")).decode("ascii")
    print(json.dumps({"cropped": True, "origW": pix.width, "origH": pix.height, "w": sub.width, "h": sub.height, "b64": b64}))
else:
    print(json.dumps({"cropped": False}))
`;
    const meta = JSON.parse(
      execFileSync('python', ['-c', cropPy, resolvedSrc], {
        encoding: 'utf8',
        maxBuffer: 25 * 1024 * 1024,
      }).trim()
    );
    if (meta.cropped) {
      asset = {
        dataUrl: `data:image/png;base64,${meta.b64}`,
        cropNote: `Top-viewport excerpt (${meta.w}×${meta.h} px) cropped for PDF readability from full-page capture (${meta.origW}×${meta.origH} px) at ${src}`,
      };
    }
  }

  if (!asset) {
    asset = {
      dataUrl: `data:${mime};base64,${readFileSync(resolvedSrc).toString('base64')}`,
      cropNote: null,
    };
  }
  imageDataUrlCache.set(resolvedSrc, asset);
  return asset;
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatLinkLabel(rawLabel) {
  let s = escapeHtml(rawLabel);
  s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
  s = s.replace(/\*\*\*([^*]+)\*\*\*/g, '<strong><em>$1</em></strong>');
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|[\s(])\*([^*\s][^*]*?)\*(?=[\s.,;:)!?]|$)/g, '$1<em>$2</em>');
  return s;
}

function inlineFormat(rawText, verifyAssets = true) {
  const tokens = [];
  const stash = html => {
    const idx = tokens.length;
    tokens.push(html);
    return `\u0000TOK${idx}\u0000`;
  };

  let text = rawText;

  // 1. Stash display math $$...$$
  text = text.replace(/\$\$([^$]+)\$\$/g, (_, expr) =>
    stash(`<div class="math-display"><code>${escapeHtml(expr.trim())}</code></div>`)
  );

  // 2. Stash inline code `...` before HTML escaping or emphasis parsing
  text = text.replace(/`([^`]+)`/g, (_, code) =>
    stash(`<code>${escapeHtml(code)}</code>`)
  );

  // 3. Stash images ![alt](src)
  text = text.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, alt, src) => {
    const { dataUrl, cropNote } = loadImageAsset(src, verifyAssets);
    const captionText = cropNote ? `${alt} — ${cropNote}` : alt;
    return stash(
      `<figure class="doc-image"><img src="${escapeHtml(dataUrl)}" alt="${escapeHtml(alt)}" /><figcaption>${escapeHtml(captionText)}</figcaption></figure>`
    );
  });

  // 4. Stash markdown links [label](href)
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, href) =>
    stash(`<a href="${escapeHtml(href)}">${formatLinkLabel(label)}</a>`)
  );

  // 5. Preserve intentional <br> line breaks inside tables/paragraphs
  text = text.replace(/<br\s*\/?>/gi, () => stash('<br />'));

  // 6. Escape remaining raw HTML characters so TypeScript generics or comparisons (< 60) render visibly
  text = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // 7. Apply emphasis
  text = text
    .replace(/\*\*\*([^*]+)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[\s(])\*([^*\s][^*]*?)\*(?=[\s.,;:)!?]|$)/g, '$1<em>$2</em>');

  // 8. Restore stashed HTML tokens (iteratively for nested tokens if any)
  let prev;
  do {
    prev = text;
    text = text.replace(/\u0000TOK(\d+)\u0000/g, (_, idx) => tokens[Number(idx)]);
  } while (text !== prev);

  return text;
}

function parseMarkdown(md) {
  let html = '';
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const seenIds = new Map();

  let inCode = false;
  let fenceChar = '';
  let fenceLen = 0;
  let codeLang = '';
  let codeLines = [];

  let inTable = false;
  const listStack = []; // Array of { type: 'ul'|'ol', indent: number }
  let inBlockquote = false;
  let blockquoteLines = [];

  const uniqueSlug = raw => {
    const base = slugify(raw) || 'section';
    if (!seenIds.has(base)) {
      seenIds.set(base, 1);
      return base;
    }
    const next = seenIds.get(base) + 1;
    seenIds.set(base, next);
    return `${base}-${next}`;
  };

  const closeLists = (minIndent = -1) => {
    while (listStack.length > 0 && listStack[listStack.length - 1].indent > minIndent) {
      const top = listStack.pop();
      html += `</${top.type}>\n`;
    }
  };

  const closeTable = () => {
    if (inTable) {
      html += '</tbody></table></div>\n';
      inTable = false;
    }
  };

  const closeBlockquote = () => {
    if (inBlockquote) {
      html += `<blockquote>${blockquoteLines.map(l => inlineFormat(l)).join('<br />\n')}</blockquote>\n`;
      inBlockquote = false;
      blockquoteLines = [];
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Fenced code blocks / Mermaid (supports BOTH ``` and ~~~ fences)
    const fenceMatch = trimmed.match(/^(`{3,}|~{3,})(.*)$/);
    if (fenceMatch) {
      const marker = fenceMatch[1];
      const info = fenceMatch[2].trim();
      if (!inCode) {
        closeLists();
        closeTable();
        closeBlockquote();
        inCode = true;
        fenceChar = marker[0];
        fenceLen = marker.length;
        codeLang = info.split(/\s+/)[0].toLowerCase();
        codeLines = [];
        continue;
      } else if (marker[0] === fenceChar && marker.length >= fenceLen && info === '') {
        inCode = false;
        if (codeLang === 'mermaid') {
          html += `<div class="mermaid-wrapper"><div class="mermaid">${escapeHtml(codeLines.join('\n'))}</div></div>\n`;
        } else {
          html += `<pre><code class="language-${escapeHtml(codeLang)}">${escapeHtml(codeLines.join('\n'))}</code></pre>\n`;
        }
        fenceChar = '';
        fenceLen = 0;
        codeLang = '';
        codeLines = [];
        continue;
      }
    }

    if (inCode) {
      codeLines.push(line);
      continue;
    }

    // Horizontal rule
    if (/^(\*{3,}|-{3,}|_{3,})$/.test(trimmed)) {
      closeLists();
      closeTable();
      closeBlockquote();
      html += '<hr />\n';
      continue;
    }

    // Headings
    const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      closeLists();
      closeTable();
      closeBlockquote();
      const level = headingMatch[1].length;
      const headingRaw = headingMatch[2].trim();
      const id = uniqueSlug(headingRaw);
      const isPartBreak = level === 1 && /^Part [A-F]:/i.test(headingRaw);
      const cls = isPartBreak ? ' class="part-break"' : '';
      html += `<h${level} id="${id}"${cls}>${inlineFormat(headingRaw)}</h${level}>\n`;
      continue;
    }

    // Tables
    if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
      closeLists();
      closeBlockquote();
      const cells = trimmed.split('|').slice(1, -1).map(c => c.trim());
      if (cells.length > 0 && cells.every(c => /^:?-+:?$/.test(c))) {
        continue;
      }
      if (!inTable) {
        inTable = true;
        html += '<div class="table-container"><table><thead><tr>';
        for (const c of cells) {
          html += `<th>${inlineFormat(c)}</th>`;
        }
        html += '</tr></thead><tbody>\n';
      } else {
        html += '<tr>';
        for (const c of cells) {
          html += `<td>${inlineFormat(c)}</td>`;
        }
        html += '</tr>\n';
      }
      continue;
    } else {
      closeTable();
    }

    // Blockquotes
    if (trimmed.startsWith('>')) {
      closeLists();
      closeTable();
      inBlockquote = true;
      blockquoteLines.push(trimmed.replace(/^>\s?/, ''));
      continue;
    } else {
      closeBlockquote();
    }

    // Unordered or ordered lists with nesting support
    const ulMatch = line.match(/^(\s*)[-*+]\s+(.*)$/);
    const olMatch = line.match(/^(\s*)\d+\.\s+(.*)$/);
    if (ulMatch || olMatch) {
      closeTable();
      closeBlockquote();
      const type = ulMatch ? 'ul' : 'ol';
      const indent = (ulMatch ? ulMatch[1] : olMatch[1]).length;
      let content = ulMatch ? ulMatch[2] : olMatch[2];

      if (content.startsWith('[x] ') || content.startsWith('[X] ')) {
        content = '<input type="checkbox" checked disabled /> ' + content.slice(4);
      } else if (content.startsWith('[ ] ')) {
        content = '<input type="checkbox" disabled /> ' + content.slice(4);
      }

      closeLists(indent);
      const top = listStack[listStack.length - 1];
      if (!top || indent > top.indent) {
        listStack.push({ type, indent });
        html += `<${type}>\n`;
      } else if (top.type !== type) {
        const popped = listStack.pop();
        html += `</${popped.type}>\n`;
        listStack.push({ type, indent });
        html += `<${type}>\n`;
      }

      const checkboxPrefix = content.startsWith('<input ') ? content.slice(0, content.indexOf('/>') + 2) + ' ' : '';
      const restContent = checkboxPrefix ? content.slice(checkboxPrefix.length) : content;
      const liClass = checkboxPrefix ? ' class="task-item"' : '';
      html += `<li${liClass}>${checkboxPrefix}${inlineFormat(restContent)}</li>\n`;
      continue;
    }

    if (!trimmed) {
      closeLists();
      closeTable();
      closeBlockquote();
      continue;
    }

    closeLists();
    closeTable();
    closeBlockquote();
    const formattedLine = inlineFormat(trimmed);
    if (
      /^!\[[^\]]*\]\([^)]+\)$/.test(trimmed) &&
      formattedLine.startsWith('<figure class="doc-image">') &&
      formattedLine.endsWith('</figure>')
    ) {
      html += `${formattedLine}\n`;
    } else {
      html += `<p>${inlineFormat(line)}</p>\n`;
    }
  }

  closeLists();
  closeTable();
  closeBlockquote();
  return html;
}

function buildHtmlDocument(bodyHtml) {
  return `<!DOCTYPE html>
<html lang="th">
<head>
  <meta charset="UTF-8">
  <title>CPE334 Deliverable 1 — NutTiew</title>
  <style>
    @page {
      size: A4;
      margin: 17mm 13mm 17mm 13mm;
      @bottom-left {
        content: "CPE334 NutTiew — Deliverable 1 (Parts A–F)";
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 8pt;
        color: #64748b;
      }
      @bottom-right {
        content: "Page " counter(page) " / " counter(pages);
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 8pt;
        color: #64748b;
      }
    }
    *, *::before, *::after { box-sizing: border-box; }
    body {
      font-family: 'Sarabun', 'TH Sarabun New', 'Noto Sans Thai', 'Leelawadee UI', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      font-size: 9.5pt;
      line-height: 1.5;
      color: #1e293b;
      background: #ffffff;
      margin: 0;
      padding: 0;
    }
    h1, h2, h3, h4, h5, h6 {
      color: #0f172a;
      font-weight: 700;
      page-break-after: avoid;
      break-after: avoid;
    }
    h1.part-break {
      page-break-before: always;
      break-before: page;
    }
    h1 {
      font-size: 16.5pt;
      border-bottom: 2px solid #2563eb;
      padding-bottom: 5px;
      margin-top: 16pt;
      margin-bottom: 10pt;
    }
    h2 {
      font-size: 13pt;
      border-bottom: 1px solid #cbd5e1;
      padding-bottom: 4px;
      margin-top: 14pt;
      margin-bottom: 7pt;
    }
    h3 { font-size: 11pt; margin-top: 11pt; margin-bottom: 5pt; }
    h4 { font-size: 10pt; margin-top: 9pt; margin-bottom: 4pt; }
    h5, h6 { font-size: 9.5pt; margin-top: 7pt; margin-bottom: 3pt; }
    p, ul, ol { margin-top: 0; margin-bottom: 7pt; }
    ul, ol { padding-left: 16pt; }
    li { margin-bottom: 2.5pt; }
    li.task-item { list-style: none; margin-left: -13pt; }
    hr { border: 0; height: 1px; background: #cbd5e1; margin: 12pt 0; }
    code {
      font-family: 'Fira Code', 'Consolas', 'Courier New', monospace;
      font-size: 8pt;
      background-color: #f1f5f9;
      color: #0f172a;
      padding: 1px 4px;
      border-radius: 3px;
      border: 1px solid #e2e8f0;
      word-break: normal;
      overflow-wrap: break-word;
    }
    pre {
      background-color: #0f172a;
      color: #f8fafc;
      padding: 8px 10px;
      border-radius: 5px;
      font-size: 7.5pt;
      line-height: 1.38;
      white-space: pre-wrap;
      word-break: break-word;
      page-break-inside: avoid;
      break-inside: avoid;
      margin-bottom: 9pt;
    }
    pre code {
      background-color: transparent;
      color: inherit;
      padding: 0;
      border: 0;
      font-size: 7.5pt;
    }
    blockquote {
      margin: 8pt 0;
      padding: 6pt 10pt;
      background-color: #f8fafc;
      border-left: 3.5px solid #3b82f6;
      color: #334155;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .table-container { margin-bottom: 10pt; width: 100%; }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 8pt;
      table-layout: auto;
      page-break-inside: auto;
    }
    thead { display: table-header-group; }
    tr { page-break-inside: avoid; break-inside: avoid; }
    th, td {
      border: 1px solid #cbd5e1;
      padding: 4pt 6pt;
      text-align: left;
      vertical-align: top;
      word-break: normal;
      overflow-wrap: break-word;
    }
    th { background-color: #f1f5f9; font-weight: 600; color: #0f172a; }
    tr:nth-child(even) td { background-color: #f8fafc; }
    .doc-image {
      margin: 10pt 0;
      text-align: center;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .doc-image img {
      max-width: 90%;
      max-height: 460pt;
      width: auto;
      height: auto;
      border-radius: 5px;
      border: 1px solid #cbd5e1;
    }
    .doc-image figcaption {
      font-size: 8pt;
      color: #475569;
      margin-top: 4pt;
      font-style: italic;
    }
    .math-display {
      margin: 8pt 0;
      text-align: center;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .math-display code {
      font-size: 9pt;
      background: #eff6ff;
      border-color: #bfdbfe;
      color: #1d4ed8;
      padding: 3px 8px;
    }
    .mermaid-wrapper {
      text-align: center;
      margin: 10pt 0;
      padding: 6pt;
      border: 1px solid #e2e8f0;
      border-radius: 5px;
      background: #ffffff;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .mermaid svg { max-width: 100% !important; height: auto !important; }
    a { color: #2563eb; text-decoration: none; word-break: normal; overflow-wrap: break-word; }
  </style>
</head>
<body>
${bodyHtml}
<script src="https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js"></script>
<script>
  window.__renderDone = (async () => {
    const nodes = Array.from(document.querySelectorAll('.mermaid'));
    const errors = [];
    if (nodes.length > 0) {
      if (!window.mermaid) {
        errors.push('Mermaid library failed to load');
      } else {
        window.mermaid.initialize({ startOnLoad: false, theme: 'neutral', securityLevel: 'loose' });
        for (let i = 0; i < nodes.length; i++) {
          const el = nodes[i];
          const code = el.textContent || '';
          try {
            const out = await window.mermaid.render('mmd-svg-' + i, code);
            el.innerHTML = out.svg;
          } catch (e) {
            errors.push('Diagram ' + i + ': ' + (e && e.message ? e.message : String(e)));
          }
        }
      }
    }
    await Promise.all(Array.from(document.images).map(img =>
      img.complete ? Promise.resolve() : new Promise(res => { img.onload = res; img.onerror = res; })
    ));
    if (document.fonts && document.fonts.ready) {
      await document.fonts.ready;
    }
    const svgs = nodes.map(n => {
      const s = n.querySelector('svg');
      const r = s ? s.getBoundingClientRect() : null;
      const errIcon = n.querySelector('.error-icon');
      return { hasSvg: Boolean(s), width: r ? r.width : 0, height: r ? r.height : 0, hasErrorIcon: Boolean(errIcon) };
    });
    const imgs = Array.from(document.images).map(img => ({
      alt: img.alt,
      complete: img.complete,
      naturalWidth: img.naturalWidth,
      naturalHeight: img.naturalHeight
    }));
    return {
      mermaidTotal: nodes.length,
      svgs,
      errors,
      imageTotal: imgs.length,
      imgs
    };
  })();
</script>
</body>
</html>`;
}

async function renderPdfPass(browser, passNum) {
  const mdContent = readFileSync(mdPath, 'utf8');
  const bodyHtml = parseMarkdown(mdContent);
  const fullHtml = buildHtmlDocument(bodyHtml);

  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  try {
    await page.setContent(fullHtml, { waitUntil: 'networkidle' });
    const renderReport = await page.evaluate(async () => await window.__renderDone);

    if (renderReport.mermaidTotal < 4) {
      throw new Error(`Expected >= 4 Mermaid diagrams, found ${renderReport.mermaidTotal}`);
    }
    if (renderReport.errors.length > 0) {
      throw new Error(`Mermaid render errors: ${renderReport.errors.join('; ')}`);
    }
    for (let i = 0; i < renderReport.svgs.length; i++) {
      const s = renderReport.svgs[i];
      if (!s.hasSvg || s.width <= 20 || s.height <= 20 || s.hasErrorIcon) {
        throw new Error(`Mermaid diagram #${i} invalid after render: ${JSON.stringify(s)}`);
      }
    }
    if (renderReport.imageTotal < 8) {
      throw new Error(`Expected >= 8 screenshots embedded, found ${renderReport.imageTotal}`);
    }
    for (const img of renderReport.imgs) {
      if (!img.complete || img.naturalWidth <= 0) {
        throw new Error(`Broken image detected during PDF render: ${JSON.stringify(img)}`);
      }
    }

    await page.pdf({
      path: pdfPath,
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
      tagged: true,
      outline: true,
      margin: { top: '17mm', bottom: '17mm', left: '13mm', right: '13mm' },
    });

    console.log(
      `Pass ${passNum}: Verified ${renderReport.svgs.length}/${renderReport.mermaidTotal} Mermaid SVGs and ${renderReport.imgs.length}/${renderReport.imageTotal} images.`
    );
    return renderReport;
  } finally {
    await page.close();
  }
}

function inspectPdfWithPyMuPdf(qaDir = null) {
  const pyScript = `
import hashlib, json, sys, os
import pymupdf

pdf_path = sys.argv[1]
qa_dir = sys.argv[2] if len(sys.argv) > 2 and sys.argv[2] else None
doc = pymupdf.open(pdf_path)
toc = doc.get_toc()
total_pages = len(doc)

def find_page(prefix):
    for lvl, title, pg in toc:
        if title.strip().startswith(prefix):
            return pg
    return None

pA = find_page("Part A:")
pB = find_page("Part B:")
pC = find_page("Part C:")
pD = find_page("Part D:")
pE = find_page("Part E:")
pE1 = find_page("E.1 ")
pE2 = find_page("E.2 ")
pE3 = find_page("E.3 ")
pE4 = find_page("E.4 ")
pE5 = find_page("E.5 ")
pE6 = find_page("E.6 ")
pF = find_page("Part F:")

def span(start, next_start, inclusive_next=False):
    if start is None or next_start is None:
        return "N/A"
    end = next_start if inclusive_next else next_start - 1
    if end < start:
        end = start
    return f"p. {start}" if start == end else f"p. {start}–{end}"

# Because Parts A..F each start on a new page (part-break CSS), end is cleanly next_start - 1
ranges = {
    "totalPages": total_pages,
    "tocCount": len(toc),
    "cover": span(1, pA, False),
    "partA": span(pA, pB, False),
    "partB": span(pB, pC, False),
    "partC": span(pC, pD, False),
    "partD": span(pD, pE, False),
    "partE": span(pE, pF, False),
    "e1": span(pE1, pE2, True),
    "e2": span(pE2, pE3, True),
    "e3": span(pE3, pE4, True),
    "e4": span(pE4, pE5, True),
    "e5": span(pE5, pE6, True),
    "e6": span(pE6, pF if pF else total_pages + 1, False),
    "partF": span(pF, total_pages + 1, False),
}

names = doc.resolve_names()
broken_links = []
for i in range(total_pages):
    for lk in doc[i].get_links():
        if lk.get("kind") == 4:
            nd = lk.get("nameddest")
            if nd and nd not in names:
                broken_links.append((i + 1, nd))
if broken_links:
    raise RuntimeError(f"Broken internal PDF nameddest links: {broken_links[:5]}")

replacement_pages = []
question_mark_pages = []
total_embedded_images = 0
broken_images = []
for i in range(total_pages):
    txt = doc[i].get_text()
    if "\\ufffd" in txt:
        replacement_pages.append(i + 1)
    if "????" in txt:
        question_mark_pages.append(i + 1)
    for img in doc[i].get_images(full=True):
        total_embedded_images += 1
        xref, _smask, w, h = img[0], img[1], img[2], img[3]
        if w <= 0 or h <= 0:
            broken_images.append({"page": i + 1, "xref": xref, "w": w, "h": h})

if replacement_pages:
    raise RuntimeError(f"Unicode replacement characters (U+FFFD) found on pages: {replacement_pages}")
if broken_images:
    raise RuntimeError(f"Invalid image dimensions found in PDF: {broken_images[:5]}")

def first_page_with(needles, start_page=1):
    for i in range(max(0, start_page - 1), total_pages):
        txt = doc[i].get_text()
        if all(n in txt for n in needles):
            return i + 1
    return None

ranges["brokenLinks"] = len(broken_links)
ranges["brokenImages"] = len(broken_images)
ranges["totalEmbeddedImages"] = total_embedded_images
ranges["replacementCharPages"] = replacement_pages
ranges["questionMarkRunPages"] = question_mark_pages

if qa_dir:
    os.makedirs(qa_dir, exist_ok=True)
    with open(pdf_path, "rb") as f:
        pdf_bytes = f.read()
    sha256 = hashlib.sha256(pdf_bytes).hexdigest()

    f_start = pF or 1
    p_login_375 = first_page_with(["login-after-375.png"], f_start)
    p_login_err = first_page_with(["login-after-error-1280.png"], f_start)
    p_m7 = first_page_with(["Milestone 7:"], f_start) or first_page_with(["07-negative-conflict-409.png"], f_start)
    p_m8 = first_page_with(["Milestone 8:"], f_start) or first_page_with(["08-negative-cross-customer-404.png"], f_start)
    p_cal_375 = first_page_with(["09-after-calendar-375.png"], f_start)
    p_a11y = first_page_with(["6.4 Accessibility Verification Layers"], f_start)
    p_dod = first_page_with(["10. Definition of Done"], f_start)

    named_targets = {
        "cover": 1,
        "nav": 2,
        "partC_diagram": (pC + 2) if pC else 1,
        "partE_start": pE or 1,
        "partF_start": f_start,
        "login_mobile_375": p_login_375,
        "login_error_1280": p_login_err,
        "milestone7_conflict_409": p_m7,
        "milestone8_cross_customer_404": p_m8,
        "milestone8_proof_next": (p_m8 + 1) if (p_m8 and p_m8 < total_pages) else None,
        "calendar_mobile_375_excerpt": p_cal_375,
        "a11y_layers_6_4": p_a11y,
        "dod_10": p_dod,
        "last_page": total_pages,
    }

    target_pages = sorted(set(pg for pg in named_targets.values() if pg and 1 <= pg <= total_pages))
    rendered_files = {}
    for pg in target_pages:
        fname = f"page-{pg:03d}.png"
        doc[pg - 1].get_pixmap(dpi=130).save(os.path.join(qa_dir, fname))
        rendered_files[str(pg)] = fname

    sheet_panels = [
        ("Cover (p.{})", 1),
        ("Nav & Page Map (p.{})", 2),
        ("Login Mobile 375px (p.{})", p_login_375),
        ("Login Error & Focus (p.{})", p_login_err),
        ("Milestone 7: 409 Proof (p.{})", p_m7),
        ("Milestone 8: 404 Proof (p.{})", p_m8),
        ("Calendar 375px Excerpt (p.{})", p_cal_375),
        ("Part F Sec 10 DoD (p.{})", p_dod or total_pages),
    ]
    sheet_panels = [(lbl.format(pg), pg) for lbl, pg in sheet_panels if pg and 1 <= pg <= total_pages]

    if sheet_panels:
        cols = 2
        rows = (len(sheet_panels) + cols - 1) // cols
        cell_w, cell_h = 420, 594
        pad, label_h, header_h = 24, 24, 52
        sheet_w = cols * cell_w + (cols + 1) * pad
        sheet_h = header_h + rows * (cell_h + label_h + pad) + pad
        sheet = pymupdf.open()
        sp = sheet.new_page(width=sheet_w, height=sheet_h)
        sp.draw_rect(pymupdf.Rect(0, 0, sheet_w, sheet_h), fill=(0.97, 0.98, 0.99), color=None)
        sp.insert_text(
            pymupdf.Point(pad, 24),
            f"Deliverable 1 PDF QA Contact Sheet - {total_pages} pages | {len(toc)} bookmarks | sha256:{sha256[:12]}...",
            fontsize=14,
            fontname="helv",
            color=(0.12, 0.17, 0.27),
        )
        sp.insert_text(
            pymupdf.Point(pad, 41),
            f"File: {os.path.basename(pdf_path)} ({len(pdf_bytes)} bytes) | Broken links: {len(broken_links)} | Broken images: {len(broken_images)}",
            fontsize=10,
            fontname="helv",
            color=(0.28, 0.35, 0.45),
        )
        for idx, (label, pg) in enumerate(sheet_panels):
            r = idx // cols
            c = idx % cols
            x0 = pad + c * (cell_w + pad)
            y0 = header_h + r * (cell_h + label_h + pad)
            sp.insert_text(
                pymupdf.Point(x0, y0 + 16),
                label,
                fontsize=11,
                fontname="helv",
                color=(0.06, 0.09, 0.16),
            )
            rect = pymupdf.Rect(x0, y0 + label_h, x0 + cell_w, y0 + label_h + cell_h)
            sp.draw_rect(rect, fill=(1, 1, 1), color=(0.78, 0.83, 0.89), width=1.2)
            sp.show_pdf_page(rect, doc, pg - 1)
        contact_path = os.path.join(qa_dir, "qa-contact-sheet.png")
        sp.get_pixmap(dpi=150).save(contact_path)
        sheet.close()
    else:
        contact_path = None

    qa_report = {
        "pdfPath": pdf_path,
        "fileBytes": len(pdf_bytes),
        "sha256": sha256,
        "ranges": ranges,
        "namedTargets": named_targets,
        "renderedPages": rendered_files,
        "contactSheet": contact_path,
    }
    with open(os.path.join(qa_dir, "qa-report.json"), "w", encoding="utf-8") as rf:
        json.dump(qa_report, rf, indent=2, ensure_ascii=False)

print(json.dumps(ranges))
`;
  const out = execFileSync('python', ['-c', pyScript, pdfPath, qaDir || ''], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return JSON.parse(out.trim());
}

async function main() {
  const args = process.argv.slice(2);
  let qaDir = null;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--qa-dir' && args[i + 1]) {
      qaDir = resolve(args[i + 1]);
    }
  }

  console.log('Launching headless Chromium for deterministic PDF build & pagination...');
  const browser = await chromium.launch();
  try {
    let pageRanges = {};
    let stable = false;

    for (let pass = 1; pass <= 3; pass++) {
      compileDeliverable({ pageRanges });
      await renderPdfPass(browser, pass);
      const observed = inspectPdfWithPyMuPdf(null);

      if (pass > 1 && JSON.stringify(observed) === JSON.stringify(pageRanges)) {
        pageRanges = observed;
        stable = true;
        console.log(`Pagination converged cleanly at pass ${pass}:`, JSON.stringify(pageRanges));
        break;
      }
      pageRanges = observed;
      if (pass === 3) {
        console.log('Final pass 3 pagination:', JSON.stringify(pageRanges));
      }
    }

    if (!stable) {
      // Ensure final MD & PDF agree after pass 3
      compileDeliverable({ pageRanges });
      await renderPdfPass(browser, 'final');
      pageRanges = inspectPdfWithPyMuPdf(qaDir);
    } else if (qaDir) {
      inspectPdfWithPyMuPdf(qaDir);
    }

    console.log('PDF Bookmarks count:', pageRanges.tocCount, '| Total PDF pages:', pageRanges.totalPages);
    if (pageRanges.tocCount < 15) {
      throw new Error(`Expected >= 15 PDF outline bookmarks, got ${pageRanges.tocCount}`);
    }
    console.log('Verified PDF generated successfully:', pdfPath);
  } finally {
    await browser.close();
  }
}

main().catch(err => {
  console.error('Failed to generate PDF:', err);
  process.exit(1);
});
