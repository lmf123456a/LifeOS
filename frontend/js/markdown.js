/* 轻量 Markdown 渲染（本地离线，无外部依赖） */
function mdToHtml(md) {
  if (!md) return '';
  const lines = String(md).replace(/\r\n/g, '\n').split('\n');
  let html = '';
  let inCode = false, codeBuf = [];
  let listType = null;
  let paraBuf = [];

  const flushPara = () => {
    if (paraBuf.length) { html += '<p>' + paraBuf.join('<br>') + '</p>'; paraBuf = []; }
  };
  const flushList = () => {
    if (listType) { html += '</' + listType + '>'; listType = null; }
  };

  const inline = (s) => {
    s = escapeHtml(s);
    s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
    s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    s = s.replace(/~~([^~]+)~~/g, '<del>$1</del>');
    s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, '<img src="$2" alt="$1" loading="lazy">');
    s = s.replace(/\[([^\]]+)\]\(([a-z]+:\/\/[^)\s]+|\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    return s;
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    const trimmed = line.trim();

    if (trimmed.startsWith('```')) {
      if (inCode) {
        html += '<pre><code>' + escapeHtml(codeBuf.join('\n')) + '</code></pre>';
        inCode = false; codeBuf = [];
      } else {
        flushPara(); flushList(); inCode = true;
      }
      continue;
    }
    if (inCode) { codeBuf.push(line); continue; }

    if (!trimmed) { flushPara(); flushList(); continue; }

    const h = trimmed.match(/^(#{1,6})\s+(.*)/);
    if (h) {
      flushPara(); flushList();
      html += '<h' + h[1].length + '>' + inline(h[2]) + '</h' + h[1].length + '>';
      continue;
    }
    if (/^[-*+]\s+/.test(trimmed)) {
      flushPara();
      if (listType !== 'ul') { flushList(); html += '<ul>'; listType = 'ul'; }
      html += '<li>' + inline(trimmed.replace(/^[-*+]\s+/, '')) + '</li>';
      continue;
    }
    if (/^\d+[.)]\s+/.test(trimmed)) {
      flushPara();
      if (listType !== 'ol') { flushList(); html += '<ol>'; listType = 'ol'; }
      html += '<li>' + inline(trimmed.replace(/^\d+[.)]\s+/, '')) + '</li>';
      continue;
    }
    if (/^>\s?/.test(trimmed)) {
      flushPara(); flushList();
      html += '<blockquote>' + inline(trimmed.replace(/^>\s?/, '')) + '</blockquote>';
      continue;
    }
    if (/^---+$/.test(trimmed)) { flushPara(); flushList(); html += '<hr>'; continue; }

    if (listType) flushList();
    paraBuf.push(inline(line));
  }
  if (inCode) html += '<pre><code>' + escapeHtml(codeBuf.join('\n')) + '</code></pre>';
  flushPara(); flushList();
  return html;
}
