(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  /* ---------- language (interface text) ---------- */
  const KO = {
    'nav.about': '소개', 'nav.articles': '아티클 & 리포트', 'nav.campaigns': '캠페인', 'nav.members': '멤버', 'nav.memos': '정책 메모',
    'ui.skip': '본문으로 건너뛰기', 'ui.explore': '둘러보기', 'ui.rights': 'All rights reserved.',
    'home.memos': 'UN 정책 메모', 'home.featuredArticle': '추천 아티클', 'home.featuredReport': '추천 리포트', 'home.spotlight': '스포트라이트:', 'home.fromYii': 'Youth Impact Institute 소식',
    'ui.viewAll': '전체 보기', 'ui.readArticle': '아티클 읽기', 'ui.presentedBy': '발표:', 'ui.commentaryBy': '논평:', 'ui.allArticles': '모든 아티클 보기',
    'page.articles': '모든 아티클 & 리포트', 'page.memos': 'UN 정책 메모', 'page.memosLede': 'YII 멤버들이 작성한 간결하고 실행 가능한 정책 제안서입니다.', 'page.campaigns': '캠페인', 'page.members': '멤버',
    'ui.search': '아티클 검색', 'ui.allAuthors': '모든 작성자', 'ui.results': '개 결과', 'ui.noResults': '검색 결과가 없습니다.', 'ui.loadMore': '더 보기', 'ui.report': '리포트',
    'ui.share': '공유', 'ui.copyLink': '링크 복사', 'ui.copied': '복사됨', 'ui.minRead': '분 분량', 'ui.references': '참고 문헌', 'ui.moreFrom': 'Youth Impact Institute의 다른 글',
    'ui.comingSoon': '이 아티클의 전문은 곧 공개됩니다.', 'ui.memoSoon': '이 메모의 전문은 곧 공개됩니다.', 'ui.subject': '주제:', 'ui.date': '날짜:', 'ui.subjectL': '주제', 'ui.dateL': '날짜', 'ui.authorL': '작성자', 'ui.previous': '이전', 'ui.next': '다음',
    'ui.by': '작성:', 'ui.viewDetails': '자세히 보기', 'ui.joined': '명이 참여했습니다', 'ui.joinCampaign': '캠페인 참여하기', 'ui.lastName': '성', 'ui.firstName': '이름', 'ui.email': '이메일',
    'ui.thanks': '참여해 주셔서 감사합니다! 소중한 지지가 기록되었습니다.', 'ui.visitWebsite': '웹사이트 방문', 'ui.article': '편의 글', 'ui.articlesN': '편의 글', 'ui.publications': '작성한 글', 'ui.noPubs': '아직 작성한 글이 없습니다.',
    'nf.title': '페이지를 찾을 수 없습니다', 'nf.text': '페이지가 이동되었거나 주소가 잘못 입력되었을 수 있습니다.', 'nf.home': '홈으로',
  };
  const store = { get: (k) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch {} } };
  const orig = new Map();
  function applyLang(lang) {
    document.documentElement.lang = lang;
    $$('[data-i18n]').forEach((el) => {
      if (!orig.has(el)) orig.set(el, el.textContent);
      el.textContent = lang === 'ko' && KO[el.dataset.i18n] ? KO[el.dataset.i18n] : orig.get(el);
    });
    $$('[data-i18n-ph]').forEach((el) => {
      if (!el.dataset.phEn) el.dataset.phEn = el.placeholder;
      el.placeholder = lang === 'ko' ? KO[el.dataset.i18nPh] || el.dataset.phEn : el.dataset.phEn;
    });
    $$('[data-lang-code]').forEach((el) => (el.textContent = lang === 'ko' ? 'KO' : 'EN'));
    $$('[data-set-lang]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.setLang === lang)));
  }
  let lang = 'en';
  const setLang = (l) => { lang = l; store.set('yii-lang', l); applyLang(l); };
  applyLang(lang);
  $$('[data-lang-toggle]').forEach((b) => b.addEventListener('click', () => setLang(lang === 'en' ? 'ko' : 'en')));
  $$('[data-set-lang]').forEach((b) => b.addEventListener('click', () => setLang(b.dataset.setLang)));
  const t = (k, en) => (lang === 'ko' && KO[k]) || en;

  /* ---------- mobile menu ---------- */
  const menu = $('#mobile-menu');
  const openBtn = $('[data-menu-open]');
  function openMenu() {
    menu.hidden = false; document.body.classList.add('menu-open');
    openBtn.setAttribute('aria-expanded', 'true'); $('[data-menu-close]', menu).focus();
  }
  function closeMenu() {
    menu.hidden = true; document.body.classList.remove('menu-open');
    openBtn.setAttribute('aria-expanded', 'false'); openBtn.focus();
  }
  openBtn && openBtn.addEventListener('click', openMenu);
  menu && $('[data-menu-close]', menu).addEventListener('click', closeMenu);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && menu && !menu.hidden) closeMenu(); });
  window.matchMedia('(min-width: 901px)').addEventListener('change', (e) => { if (e.matches && !menu.hidden) closeMenu(); });

  /* ---------- reading progress (one listener, reads current page) ---------- */
  function updProgress() {
    const bar = $('.reading .progress span'), art = $('.article');
    if (!bar || !art) return;
    const r = art.getBoundingClientRect();
    const p = Math.min(1, Math.max(0, -r.top / (r.height - innerHeight)));
    bar.style.width = (p * 100).toFixed(1) + '%';
  }
  addEventListener('scroll', updProgress, { passive: true });

  /* ---------- per-page setup (re-run when a page's content is swapped in) ---------- */
  function initPage() {
  applyLang(lang);
  /* ---------- reading progress ---------- */
  updProgress();

  /* ---------- share ---------- */
  $$('[data-copy]').forEach((b) => b.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(location.href.split('?')[0]); } catch { return; }
    const s = $('span', b); b.classList.add('ok'); s.textContent = t('ui.copied', 'Copied');
    setTimeout(() => { b.classList.remove('ok'); s.textContent = t('ui.copyLink', 'Copy link'); }, 1800);
  }));
  $$('[data-share]').forEach((b) => {
    if (!navigator.share) { b.hidden = true; return; }
    b.addEventListener('click', () => navigator.share({ title: document.title, url: location.href.split('?')[0] }).catch(() => {}));
  });

  /* ---------- article list: search, author filter, load more ---------- */
  const list = $('[data-list]');
  if (list) {
    const PAGE = 12;
    const items = $$('.list-item', list);
    const q = $('[data-filter-q]'), au = $('[data-filter-author]'), more = $('[data-load-more]');
    let shown = PAGE;
    const params = new URLSearchParams(location.search);
    if (params.get('q')) q.value = params.get('q');
    if (params.get('author')) au.value = params.get('author');
    function render() {
      const term = q.value.trim().toLowerCase(), who = au.value;
      const matches = items.filter((li) => (!who || li.dataset.author === who) && (!term || term.split(/\s+/).every((w) => li.dataset.text.includes(w))));
      items.forEach((li) => (li.hidden = true));
      matches.slice(0, shown).forEach((li) => (li.hidden = false));
      $('[data-count]').textContent = matches.length;
      $('[data-empty]').hidden = matches.length > 0;
      more.hidden = matches.length <= shown;
    }
    const reset = () => { shown = PAGE; render(); };
    q.addEventListener('input', reset); au.addEventListener('change', reset);
    more.addEventListener('click', () => { shown += PAGE; render(); });
    render();
  }

  /* ---------- contact form ---------- */
  const contact = $('[data-contact]');
  if (contact && new URLSearchParams(location.search).get('sent')) $('[data-thanks]', contact).hidden = false;

  /* ---------- campaign form: counted by assets/campaign.js (Firebase); never posts the page ---------- */
  const join = $('[data-join]');
  if (join && !window.YII_FIREBASE) join.addEventListener('submit', (e) => { e.preventDefault(); $('[data-error]', join).hidden = false; });
  }
  window.YII = { initPage };
  initPage();
})();
