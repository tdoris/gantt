/*
 * tutorial.js — in-app tutorial viewer.
 *
 * Opens TUTORIAL.md in a full-screen overlay, rendered with a small purpose-
 * built Markdown converter (headings, bold, inline/fenced code, ordered &
 * unordered lists, tables, blockquotes, links, rules, paragraphs) — enough for
 * our tutorial without pulling in a dependency. TUTORIAL.md stays the single
 * source of truth. If it can't be fetched (e.g. opened via file://), we fall
 * back to a link to the rendered copy on GitHub.
 */
(function (GA) {
  'use strict';

  var GITHUB_TUTORIAL = 'https://github.com/tdoris/gantt/blob/main/TUTORIAL.md';
  var cachedHtml = null;

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  // Inline: escape, then apply `code`, **bold**, [text](url). Order matters:
  // pull out code spans first so their contents aren't further formatted.
  function inline(text) {
    var out = '';
    var i = 0;
    while (i < text.length) {
      var tick = text.indexOf('`', i);
      if (tick === -1) { out += fmt(text.slice(i)); break; }
      out += fmt(text.slice(i, tick));
      var end = text.indexOf('`', tick + 1);
      if (end === -1) { out += fmt(text.slice(tick)); break; }
      out += '<code>' + esc(text.slice(tick + 1, end)) + '</code>';
      i = end + 1;
    }
    return out;
  }
  function fmt(text) {
    text = esc(text);
    text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, function (m, t, u) {
      return '<a href="' + esc(u) + '" target="_blank" rel="noopener">' + t + '</a>';
    });
    return text;
  }

  function isTableSep(line) {
    return /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)+\|?\s*$/.test(line);
  }
  function splitRow(line) {
    var s = line.trim().replace(/^\|/, '').replace(/\|$/, '');
    return s.split('|').map(function (c) { return c.trim(); });
  }

  function renderMarkdown(md) {
    var lines = md.replace(/\r\n/g, '\n').split('\n');
    var html = [];
    var i = 0;
    var para = [];
    function flushPara() {
      if (para.length) { html.push('<p>' + inline(para.join(' ')) + '</p>'); para = []; }
    }

    while (i < lines.length) {
      var line = lines[i];

      // fenced code
      if (/^```/.test(line)) {
        flushPara();
        var code = [];
        i++;
        while (i < lines.length && !/^```/.test(lines[i])) { code.push(lines[i]); i++; }
        i++; // skip closing fence
        html.push('<pre><code>' + esc(code.join('\n')) + '</code></pre>');
        continue;
      }

      // heading
      var h = /^(#{1,6})\s+(.*)$/.exec(line);
      if (h) {
        flushPara();
        var level = h[1].length;
        html.push('<h' + level + '>' + inline(h[2]) + '</h' + level + '>');
        i++;
        continue;
      }

      // horizontal rule
      if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) {
        flushPara();
        html.push('<hr/>');
        i++;
        continue;
      }

      // table: header row followed by a separator row
      if (line.indexOf('|') !== -1 && i + 1 < lines.length && isTableSep(lines[i + 1])) {
        flushPara();
        var header = splitRow(line);
        i += 2;
        var rows = [];
        while (i < lines.length && lines[i].indexOf('|') !== -1 && lines[i].trim() !== '') {
          rows.push(splitRow(lines[i]));
          i++;
        }
        var t = '<table><thead><tr>' +
          header.map(function (c) { return '<th>' + inline(c) + '</th>'; }).join('') +
          '</tr></thead><tbody>' +
          rows.map(function (r) {
            return '<tr>' + r.map(function (c) { return '<td>' + inline(c) + '</td>'; }).join('') + '</tr>';
          }).join('') +
          '</tbody></table>';
        html.push(t);
        continue;
      }

      // blockquote (consecutive > lines)
      if (/^\s*>\s?/.test(line)) {
        flushPara();
        var quote = [];
        while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
          quote.push(lines[i].replace(/^\s*>\s?/, ''));
          i++;
        }
        html.push('<blockquote>' + inline(quote.join(' ')) + '</blockquote>');
        continue;
      }

      // unordered list
      if (/^\s*[-*]\s+/.test(line)) {
        flushPara();
        var items = [];
        while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
          items.push('<li>' + inline(lines[i].replace(/^\s*[-*]\s+/, '')) + '</li>');
          i++;
        }
        html.push('<ul>' + items.join('') + '</ul>');
        continue;
      }

      // ordered list
      if (/^\s*\d+\.\s+/.test(line)) {
        flushPara();
        var oitems = [];
        while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
          oitems.push('<li>' + inline(lines[i].replace(/^\s*\d+\.\s+/, '')) + '</li>');
          i++;
        }
        html.push('<ol>' + oitems.join('') + '</ol>');
        continue;
      }

      // blank line -> paragraph break
      if (/^\s*$/.test(line)) { flushPara(); i++; continue; }

      // otherwise accumulate into paragraph
      para.push(line.trim());
      i++;
    }
    flushPara();
    return html.join('\n');
  }

  function open() {
    var overlay = document.createElement('div');
    overlay.className = 'tut-overlay';
    overlay.innerHTML =
      '<div class="tut-panel">' +
      '  <div class="tut-head">' +
      '    <span class="tut-title">📘 Tutorial &amp; Concepts Guide</span>' +
      '    <button class="tut-close" aria-label="Close">×</button>' +
      '  </div>' +
      '  <div class="tut-body"><div class="tut-content md">Loading…</div></div>' +
      '</div>';
    document.body.appendChild(overlay);

    var content = overlay.querySelector('.tut-content');
    function close() { overlay.remove(); document.removeEventListener('keydown', onKey); }
    function onKey(e) { if (e.key === 'Escape') close(); }
    overlay.querySelector('.tut-close').addEventListener('click', close);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
    document.addEventListener('keydown', onKey);

    if (cachedHtml) { content.innerHTML = cachedHtml; return; }

    fetch('TUTORIAL.md')
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); })
      .then(function (md) { cachedHtml = renderMarkdown(md); content.innerHTML = cachedHtml; content.parentElement.scrollTop = 0; })
      .catch(function () {
        content.innerHTML =
          '<p>The tutorial couldn\'t be loaded directly (this happens when the app is opened as a local file).</p>' +
          '<p>Read it here instead: <a href="' + GITHUB_TUTORIAL + '" target="_blank" rel="noopener">TUTORIAL.md on GitHub →</a></p>';
      });
  }

  GA.tutorial = { open: open, renderMarkdown: renderMarkdown };
})(window.GA = window.GA || {});
