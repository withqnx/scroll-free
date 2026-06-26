// 디자인 스위처 — 4종(기본/Orderful/PostHog/Ease)을 우상단에 띄우고 <html>의 data-theme를 토글.
// localStorage로 페이지 이동 간 유지.
(function () {
  const THEMES = [['default', '기본'], ['orderful', 'Orderful'], ['posthog', 'PostHog'], ['ease', 'Ease']];
  const saved = localStorage.getItem('sf-theme') || 'default';
  if (saved !== 'default') document.documentElement.dataset.theme = saved;

  function apply(id) {
    if (id === 'default') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = id;
    localStorage.setItem('sf-theme', id);
  }
  function build() {
    const bar = document.createElement('div');
    bar.className = 'theme-switch';
    THEMES.forEach(([id, label]) => {
      const b = document.createElement('button');
      b.textContent = label;
      if (id === saved) b.classList.add('on');
      b.addEventListener('click', () => {
        apply(id);
        bar.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
      });
      bar.appendChild(b);
    });
    document.body.appendChild(bar);
  }
  if (document.readyState !== 'loading') build();
  else document.addEventListener('DOMContentLoaded', build);
})();
