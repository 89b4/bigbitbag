/* Terminal-notes theme: top bar, file-tree navigation, article footer.
   Extends Docsify 5 through plugins only — no extra dependencies. */
(function () {
  'use strict';

  var root = document.documentElement;
  var system = matchMedia('(prefers-color-scheme: dark)');
  var collapseState = new Map();
  var sequence = 0;
  var tocObserver;
  var tocScrollHandler;

  var THEMES = ['dark', 'light', 'system'];
  var THEME_LABEL = { dark: '深色', light: '浅色', system: '跟随系统' };
  var THEME_GLYPH = { dark: '◐', light: '☀', system: '◑' };

  var site = window.knowledgeSite || {};
  var repo = site.repository || '';
  var repoName = (repo.replace(/\/+$/, '').split('/').pop() || site.name || 'notes')
    .replace(/\.git$/, '') || 'notes';
  var branch = 'main';

  /* ------------------------------------------------------------------ */
  /* Theme                                                               */
  /* ------------------------------------------------------------------ */
  function applyTheme(mode) {
    root.dataset.mode = mode;
    root.dataset.theme = mode === 'system' ? (system.matches ? 'dark' : 'light') : mode;
  }

  var initial = site.defaultTheme || 'dark';
  try { initial = localStorage.getItem('knowledge-theme') || initial; } catch (_) {}
  applyTheme(THEMES.indexOf(initial) >= 0 ? initial : 'dark');

  system.addEventListener('change', function () {
    if (root.dataset.mode === 'system') applyTheme('system');
  });

  window.addEventListener('storage', function (event) {
    if (event.key !== 'knowledge-theme') return;
    applyTheme(THEMES.indexOf(event.newValue) >= 0 ? event.newValue : 'dark');
    paintThemeButton();
  });

  function paintThemeButton() {
    var button = document.querySelector('.term-theme-btn');
    if (!button) return;
    var mode = root.dataset.mode || 'dark';
    button.textContent = THEME_GLYPH[mode] || '◐';
    button.title = '外观：' + (THEME_LABEL[mode] || '深色') + '（点击切换）';
    button.setAttribute('aria-label', '切换外观，当前' + (THEME_LABEL[mode] || '深色'));
  }

  function cycleTheme() {
    var mode = root.dataset.mode || 'dark';
    var next = THEMES[(THEMES.indexOf(mode) + 1) % THEMES.length];
    applyTheme(next);
    try { localStorage.setItem('knowledge-theme', next); } catch (_) {}
    paintThemeButton();
  }

  /* ------------------------------------------------------------------ */
  /* Top bar                                                             */
  /* ------------------------------------------------------------------ */
  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function installBar() {
    if (document.querySelector('.term-bar')) return;
    var bar = el('header', 'term-bar');
    bar.setAttribute('role', 'banner');

    var brand = el('div', 'term-brand');
    var toggle = el('button', 'term-nav-toggle', '≡');
    toggle.type = 'button';
    toggle.title = '显示或隐藏导航';
    toggle.setAttribute('aria-label', '显示或隐藏导航');
    toggle.addEventListener('click', toggleSidebar);

    var prompt = el('div', 'term-prompt');
    prompt.innerHTML = '<b>' + repoName + '</b>:<span class="tilde">~</span><span class="path"></span>';
    prompt.title = (site.description || '') || site.name || '';
    brand.append(toggle, prompt);

    var searchSlot = el('div', 'term-search-slot');

    var actions = el('div', 'term-actions');
    if (repo) {
      var gh = el('a', 'term-repo', 'github ↗');
      gh.href = repo; gh.target = '_blank'; gh.rel = 'noopener noreferrer';
      gh.title = '在 GitHub 上查看仓库';
      actions.appendChild(gh);
    }
    var themeButton = el('button', 'term-theme-btn', '◐');
    themeButton.type = 'button';
    themeButton.addEventListener('click', cycleTheme);
    actions.appendChild(themeButton);

    bar.append(brand, searchSlot, actions);
    document.body.insertBefore(bar, document.body.firstChild);
    /* The theme owns the toggle now; Docsify's own handle is hidden by CSS. */
    document.body.classList.add('term-app');

    var sidebar = document.querySelector('.sidebar');
    if (sidebar && !document.querySelector('.term-side-label')) {
      var label = el('div', 'term-side-label', '~/notes');
      sidebar.insertBefore(label, sidebar.firstChild);
    }
    if (sidebar) {
      var description = site.description || '';
      if (description && sidebar.querySelector('.term-side-label') && !document.querySelector('.site-description')) {
        sidebar.querySelector('.term-side-label').after(el('p', 'site-description', description));
      }
      if (!sidebar.querySelector('.term-side-foot')) {
        sidebar.appendChild(el('div', 'term-side-foot', 'markdown · docsify'));
      }
    }
    paintThemeButton();
  }

  function toggleSidebar() {
    var sidebar = document.querySelector('.sidebar');
    if (!sidebar) return;
    sidebar.classList.toggle('show');
    document.querySelector('.term-nav-toggle')?.setAttribute('aria-expanded', String(sidebar.classList.contains('show')));
  }

  function relocateSearch() {
    var slot = document.querySelector('.term-search-slot');
    var search = document.querySelector('.sidebar .search') || document.querySelector('.search');
    if (!slot || !search || slot.contains(search)) return;
    var input = search.querySelector('input');
    if (input && !input.placeholder) input.placeholder = '搜索笔记…';
    slot.appendChild(search);
  }

  /* Docsify publishes the current file on <body data-page>. */
  function currentFile() {
    var file = (document.body && document.body.dataset.page) || '';
    if (file) return file;
    var hash = location.hash.replace(/^#\/?/, '').split('?')[0];
    return hash || 'HOME.md';
  }

  function updatePrompt() {
    var path = document.querySelector('.term-prompt .path');
    if (!path) return;
    var file = currentFile().replace(/\.md$/i, '');
    if (!file || /^(HOME|index)$/i.test(file)) {
      path.textContent = '/';
    } else {
      path.textContent = '/' + file.split('/').map(decodeURIComponent).join('/');
    }
  }

  /* ------------------------------------------------------------------ */
  /* Search shortcuts                                                    */
  /* ------------------------------------------------------------------ */
  /* The bundled search plugin opens the drawer to reach its input; ours
     lives in the top bar, so claim "/" and Ctrl/Cmd+K here. */
  window.addEventListener('keydown', function (event) {
    if (event.defaultPrevented || event.altKey || event.shiftKey) return;
    var target = event.target;
    if (target && target.closest && target.closest('input, textarea, select, [contenteditable]')) return;
    var isSlash = event.key === '/';
    var isCmdK = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k';
    if (event.key.toLowerCase() === 't' && !event.ctrlKey && !event.metaKey) {
      event.preventDefault();
      cycleTheme();
      return;
    }
    if (!isSlash && !isCmdK) return;
    event.preventDefault();
    event.stopPropagation();
    var input = document.querySelector('.term-bar .search input');
    if (input) { input.focus(); input.select(); }
  }, true);

  /* ------------------------------------------------------------------ */
  /* Navigation tree                                                     */
  /* ------------------------------------------------------------------ */
  function decorateTree(nav) {
    nav.querySelectorAll('li > ul').forEach(function (list) {
      var children = Array.from(list.children).filter(function (node) { return node.tagName === 'LI'; });
      children.forEach(function (item) {
        var anchor = item.querySelector(':scope > a');
        if (!anchor) return;
        var last = item === children[children.length - 1];
        anchor.dataset.guide = last ? '└' : '├';
      });
    });
  }

  function enhanceNavigation() {
    var nav = document.querySelector('.sidebar-nav');
    if (!nav) return;
    nav.setAttribute('aria-label', '知识库导航');
    nav.querySelectorAll('li').forEach(function (item) {
      var list = Array.from(item.children).find(function (child) { return child.tagName === 'UL'; });
      if (!list || item.querySelector(':scope > .nav-disclosure')) return;
      item.classList.add('has-children');
      var anchor = item.querySelector(':scope > a, :scope > p > a');
      if (!anchor) {
        var label = el('span', 'folder-label');
        Array.from(item.childNodes).forEach(function (child) {
          if (child.nodeType === Node.TEXT_NODE || (child.nodeType === Node.ELEMENT_NODE && child.tagName === 'P')) label.appendChild(child);
        });
        item.insertBefore(label, list);
        anchor = label;
      }
      var name = anchor.textContent.trim();
      var key = anchor.getAttribute('href') || name;
      var button = el('button', 'nav-disclosure');
      button.type = 'button';
      button.setAttribute('aria-label', '展开或收起 ' + name);
      list.id = 'nav-group-' + (++sequence);
      button.setAttribute('aria-controls', list.id);
      button.dataset.key = key;
      var expanded = list.querySelector('li.active') ? true : collapseState.get(key) !== false;
      button.setAttribute('aria-expanded', String(expanded));
      list.hidden = !expanded;
      item.insertBefore(button, list);
    });
    nav.querySelectorAll('li.active').forEach(function (active) {
      var parent = active.parentElement;
      while (parent && parent !== nav) {
        if (parent.tagName === 'UL' && parent.hidden) {
          parent.hidden = false;
          var button = parent.parentElement.querySelector(':scope > .nav-disclosure');
          if (button) button.setAttribute('aria-expanded', 'true');
        }
        parent = parent.parentElement;
      }
    });
    decorateTree(nav);
  }

  /* Delegated disclosure clicks survive sidebar re-renders. */
  document.addEventListener('click', function (event) {
    var button = event.target.closest('.nav-disclosure');
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();
    var list = document.getElementById(button.getAttribute('aria-controls'));
    if (!list) return;
    var open = button.getAttribute('aria-expanded') !== 'true';
    button.setAttribute('aria-expanded', String(open));
    list.hidden = !open;
    collapseState.set(button.dataset.key, open);
  }, true);

  /* Close the mobile drawer after following a link or tapping the page. */
  document.addEventListener('click', function (event) {
    if (matchMedia('(min-width: 1025px)').matches) return;
    var sidebar = document.querySelector('.sidebar');
    if (!sidebar || !sidebar.classList.contains('show')) return;
    if (event.target.closest('.sidebar-nav a') || !event.target.closest('.sidebar')) {
      sidebar.classList.remove('show');
      document.querySelector('.term-nav-toggle')?.setAttribute('aria-expanded', 'false');
    }
  });

  /* ------------------------------------------------------------------ */
  /* Code blocks                                                         */
  /* ------------------------------------------------------------------ */
  async function copyText(text) {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        return;
      }
    } catch (_) { /* fall through to the legacy path */ }
    var field = document.createElement('textarea');
    field.value = text;
    field.style.cssText = 'position:fixed;left:-9999px;top:0';
    document.body.appendChild(field);
    field.select();
    var ok = document.execCommand('copy');
    field.remove();
    if (!ok) throw new Error('copy failed');
  }

  function enhanceCode(article) {
    article.querySelectorAll('pre').forEach(function (pre) {
      var code = pre.querySelector('code');
      if (!code || pre.closest('.code-block')) return;
      var wrap = el('div', 'code-block');
      var toolbar = el('div', 'code-toolbar');
      var language = el('span', null, '');
      var match = code.className.match(/language-([\w-]+)/);
      language.textContent = match ? match[1] : (pre.getAttribute('data-lang') || 'text');
      var actions = el('div');

      var wrapButton = el('button', null, '换行');
      wrapButton.type = 'button';
      wrapButton.setAttribute('aria-pressed', 'false');
      wrapButton.onclick = function () {
        var active = wrap.classList.toggle('wrap-lines');
        wrapButton.setAttribute('aria-pressed', String(active));
      };

      var fold = el('button', null, '折叠');
      fold.type = 'button';
      fold.setAttribute('aria-expanded', 'true');
      fold.onclick = function () {
        pre.hidden = !pre.hidden;
        fold.textContent = pre.hidden ? '展开' : '折叠';
        fold.setAttribute('aria-expanded', String(!pre.hidden));
      };

      var copy = el('button', 'copy-code', '复制');
      copy.type = 'button';
      copy.setAttribute('aria-live', 'polite');
      copy.addEventListener('click', async function () {
        try { await copyText(code.textContent); copy.textContent = '已复制'; }
        catch (_) { copy.textContent = '复制失败'; }
        copy.focus({ preventScroll: true });
        setTimeout(function () { copy.textContent = '复制'; }, 2200);
      });

      actions.append(wrapButton, fold, copy);
      toolbar.append(language, actions);
      pre.parentNode.insertBefore(wrap, pre);
      wrap.append(toolbar, pre);
      pre.tabIndex = 0;
      pre.setAttribute('aria-label', language.textContent + ' 代码，可横向滚动');
    });
  }

  /* ------------------------------------------------------------------ */
  /* Article footer                                                      */
  /* ------------------------------------------------------------------ */
  function countUnits(text) {
    var cjk = (text.match(/[\u3400-\u9fff\u3000-\u303f]/g) || []).length;
    var latin = text.replace(/[\u3400-\u9fff\u3000-\u303f]/g, ' ')
      .split(/\s+/).filter(function (word) { return word.length > 1; }).length;
    return cjk + latin;
  }

  function buildFoot(article) {
    if (article.querySelector('.article-foot')) return;
    var foot = el('footer', 'article-foot');
    var units = countUnits(article.textContent || '');
    foot.appendChild(el('span', null, '≈ ' + (units > 1000 ? (units / 1000).toFixed(1) + 'k' : units) + ' 字'));

    var route = currentFile().replace(/^\/+/, '');
    if (repo && route && !/^HOME\.md$/i.test(route)) {
      foot.appendChild(el('span', 'dot', '·'));
      var edit = el('a', null, 'view source ↗');
      edit.href = repo.replace(/\/+$/, '') + '/blob/' + branch + '/' + route;
      edit.target = '_blank'; edit.rel = 'noopener noreferrer';
      foot.appendChild(edit);
    }
    foot.appendChild(el('span', 'eof', 'EOF'));
    article.appendChild(foot);
  }

  /* ------------------------------------------------------------------ */
  /* Home index                                                          */
  /* ------------------------------------------------------------------ */
  /* The sidebar is loaded asynchronously; defer the home index until it exists. */
  var homeIndexReady = false;
  function watchHomeIndex(article) {
    if (homeIndexReady) return;
    var nav = document.querySelector('.sidebar-nav li');
    if (!nav) {
      var observer = new MutationObserver(function () {
        if (document.querySelector('.sidebar-nav li')) {
          observer.disconnect();
          homeIndexReady = true;
          buildHomeIndex(article);
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });
      setTimeout(function () { observer.disconnect(); homeIndexReady = true; buildHomeIndex(article); }, 5000);
      return;
    }
    homeIndexReady = true;
    buildHomeIndex(article);
  }

  function buildHomeIndex(article) {
    if (article.querySelector('.term-index')) return;
    var file = currentFile();
    if (!/^(HOME\.md|index\.md|)$/i.test(file)) return;

    var nav = document.querySelector('.sidebar-nav');
    var groups = nav ? Array.from(nav.querySelectorAll(':scope > ul > li')).filter(function (item) {
      return item.querySelector(':scope > a') || item.querySelector(':scope > p > a');
    }) : [];
    /* Root-level loose notes come before the folder groups in the sidebar. */
    var items = groups.map(function (item) {
      var anchor = item.querySelector(':scope > a') || item.querySelector(':scope > p > a');
      var children = item.querySelectorAll(':scope ul li a').length;
      return { anchor: anchor, count: children };
    }).filter(function (entry) {
      return entry.anchor && !/images\.md$/.test(entry.anchor.getAttribute('href') || '');
    });
    if (!items.length) return;

    var index = el('section', 'term-index');
    index.appendChild(el('h3', 'term-index-title', 'index'));
    items.forEach(function (entry) {
      var href = entry.anchor.getAttribute('href');
      if (!href) return;
      var row = el('a', 'term-index-row');
      row.href = href;
      row.appendChild(el('span', 'term-index-path', 'tree/'));
      row.appendChild(el('span', 'term-index-name', entry.anchor.textContent.trim()));
      row.appendChild(el('span', 'term-index-count', entry.count ? entry.count + ' notes' : 'index'));
      index.appendChild(row);
    });
    article.appendChild(index);
  }

  /* ------------------------------------------------------------------ */
  /* Table of contents                                                   */
  /* ------------------------------------------------------------------ */
  function buildToc(article) {
    if (tocObserver) tocObserver.disconnect();
    if (tocScrollHandler) window.removeEventListener('scroll', tocScrollHandler);
    var depth = Math.max(1, Math.min(6, Number(site.tocDepth) || 6));
    var headings = Array.from(article.querySelectorAll('h1,h2,h3,h4,h5,h6'))
      .filter(function (h) { return Number(h.tagName.slice(1)) <= depth; });
    var used = new Set();
    headings.forEach(function (h, i) {
      var id = h.id || 'section-' + i;
      while (used.has(id)) id += '-section-' + i;
      used.add(id);
      h.id = id;
    });
    var links = new Map();

    function makeNav() {
      var nav = el('nav');
      nav.setAttribute('aria-label', '文章目录');
      var base = headings.length ? Math.min.apply(null, headings.map(function (h) { return Number(h.tagName.slice(1)); })) : 1;
      var list = el('ul');
      nav.appendChild(list);
      var stack = [{ level: base, list: list, item: null }];
      headings.forEach(function (h) {
        var level = Number(h.tagName.slice(1));
        while (stack.length > 1 && level < stack[stack.length - 1].level) stack.pop();
        var top = stack[stack.length - 1];
        if (level > top.level && top.item) {
          var sub = el('ul');
          top.item.appendChild(sub);
          top = { level: level, list: sub, item: null };
          stack.push(top);
        }
        var item = el('li');
        var a = el('a', null, h.textContent);
        a.href = location.hash.split('?')[0] + '?id=' + encodeURIComponent(h.id);
        a.onclick = function (event) {
          event.preventDefault();
          history.replaceState(null, '', a.href);
          h.scrollIntoView({ block: 'start' });
          updateCurrent();
        };
        item.appendChild(a);
        top.list.appendChild(item);
        top.item = item;
        if (!links.has(h)) links.set(h, []);
        links.get(h).push(a);
      });
      if (!headings.length) nav.appendChild(el('span', 'toc-empty', '本页暂无章节'));
      return nav;
    }

    var toc = el('details', 'article-toc');
    toc.open = matchMedia('(min-width: 1400px)').matches;
    var summary = el('summary', null, '本页目录');
    toc.append(summary, makeNav());
    article.prepend(toc);

    article.querySelectorAll('p').forEach(function (p) {
      if (p.textContent.trim().toUpperCase() === '[TOC]' && !p.closest('pre,blockquote,li') && p.childElementCount === 0) {
        var box = el('details', 'inline-toc');
        box.open = true;
        box.append(el('summary', null, '目录'), makeNav());
        p.replaceWith(box);
      }
    });

    function updateCurrent() {
      var current = headings[0];
      headings.forEach(function (h) { if (h.getBoundingClientRect().top <= 120) current = h; });
      links.forEach(function (group, h) {
        group.forEach(function (a) {
          if (h === current) a.setAttribute('aria-current', 'location');
          else a.removeAttribute('aria-current');
        });
      });
    }

    var scheduled = false;
    tocScrollHandler = function () {
      if (!scheduled) {
        scheduled = true;
        requestAnimationFrame(function () { updateCurrent(); scheduled = false; });
      }
    };
    window.addEventListener('scroll', tocScrollHandler, { passive: true });
    updateCurrent();
  }

  /* ------------------------------------------------------------------ */
  /* Docsify plugin hooks                                                */
  /* ------------------------------------------------------------------ */
  function themePlugin(hook) {
    hook.mounted(function () {
      installBar();
      relocateSearch();
      var sidebar = document.querySelector('.sidebar');
      if (sidebar) new MutationObserver(function () { enhanceNavigation(); }).observe(sidebar, { childList: true, subtree: true });
      var page = document.querySelector('.content');
      if (page) new MutationObserver(function () { relocateSearch(); updatePrompt(); }).observe(page, { childList: true, subtree: true });
    });

    hook.doneEach(function () {
      installBar();
      relocateSearch();
      enhanceNavigation();
      updatePrompt();

      var article = document.querySelector('.markdown-section');
      if (!article) return;
      article.tabIndex = -1;
      enhanceCode(article);
      buildToc(article);
      watchHomeIndex(article);
      buildFoot(article);

      var title = article.querySelector('h1');
      document.title = title ? title.textContent + ' · ' + (site.name || repoName) : (site.name || repoName);
    });
  }

  window.$docsify = window.$docsify || {};
  window.$docsify.plugins = (window.$docsify.plugins || []).concat(themePlugin);
})();
