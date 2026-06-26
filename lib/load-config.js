// 설정 로더 — ?d=<이름> 으로 data/<이름>.json 을 불러와 콜백에 넘긴다.
// 템플릿 = 제네릭 HTML, 데이터 = data/*.json. 새 상세는 JSON만 추가하면 됨.
function loadConfig(expectedType, render) {
  const name = new URLSearchParams(location.search).get('d');
  if (!name) { document.body.innerHTML = '<p style="padding:2rem;font-family:sans-serif">?d=&lt;데이터이름&gt; 이 필요합니다. 예: ?d=세종</p>'; return; }
  fetch('../data/' + encodeURIComponent(name) + '.json')
    .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then((cfg) => {
      if (expectedType && cfg.template && cfg.template !== expectedType)
        console.warn(`이 데이터(${cfg.template})는 ${expectedType} 템플릿용이 아닙니다.`);
      render(cfg);
    })
    .catch((e) => { document.body.innerHTML = `<p style="padding:2rem;font-family:sans-serif">데이터 "${name}" 를 불러오지 못했습니다 (${e.message}).</p>`; });
}
