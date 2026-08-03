// ─────────────────────────────────────────────────────────────────────────
// Especies en Riesgo de Aguascalientes — IMBIO
// Catálogo interactivo basado en el "Catálogo de Especies en Riesgo y
// Prioritarias del Estado de Aguascalientes" (2008), contrastado especie
// por especie contra la NOM-059-SEMARNAT-2010 vigente. Sin backend: corre
// en el navegador, resolviendo fotos en vivo contra iNaturalist/Wikipedia,
// igual que el Catálogo de Biodiversidad de Aguascalientes.
// ─────────────────────────────────────────────────────────────────────────

const GRUPOS = {
  Anfibios:  { label: 'Anfibios',          icon: '🐸' },
  Aves:      { label: 'Aves',              icon: '🐦' },
  Mamiferos: { label: 'Mamíferos',         icon: '🦊' },
  Peces:     { label: 'Peces',             icon: '🐟' },
  Reptiles:  { label: 'Reptiles',          icon: '🦎' },
  Plantas:   { label: 'Plantas y hongos',  icon: '🌿' },
};

let ESPECIES = [];
async function cargarEspecies() {
  if (ESPECIES.length) return ESPECIES;
  const r = await fetch('data/especies.json');
  ESPECIES = await r.json();
  return ESPECIES;
}

// ── Resolución de fotos (idéntico al Catálogo de Biodiversidad) ──────────
const IMG_CACHE_KEY = 'imbio_riesgo_img_cache_v1';
function _imgCache() {
  try { return JSON.parse(localStorage.getItem(IMG_CACHE_KEY) || '{}'); } catch (e) { return {}; }
}
function _imgCacheSet(key, url) {
  try {
    const c = _imgCache();
    c[key] = url || '';
    localStorage.setItem(IMG_CACHE_KEY, JSON.stringify(c));
  } catch (e) {}
}

async function resolveSpeciesPhoto(nombreCientifico) {
  const key = (nombreCientifico || '').trim().toLowerCase();
  if (!key) return null;
  const cache = _imgCache();
  if (key in cache) return cache[key] || null;

  try {
    const r = await fetch(`https://api.inaturalist.org/v1/taxa?q=${encodeURIComponent(nombreCientifico)}&rank=species,genus&per_page=1`);
    if (r.ok) {
      const d = await r.json();
      const t = d.results && d.results[0];
      const photo = t && t.default_photo && (t.default_photo.medium_url || t.default_photo.square_url);
      if (photo) { _imgCacheSet(key, photo); return photo; }
    }
  } catch (e) {}

  try {
    const r = await fetch(`https://es.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(nombreCientifico)}`);
    if (r.ok) {
      const d = await r.json();
      const thumb = d.thumbnail && d.thumbnail.source;
      if (thumb) { _imgCacheSet(key, thumb); return thumb; }
    }
  } catch (e) {}

  try {
    const r = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(nombreCientifico)}`);
    if (r.ok) {
      const d = await r.json();
      const thumb = d.thumbnail && d.thumbnail.source;
      if (thumb) { _imgCacheSet(key, thumb); return thumb; }
    }
  } catch (e) {}

  _imgCacheSet(key, '');
  return null;
}

const GALLERY_CACHE_KEY = 'imbio_riesgo_gallery_cache_v1';
function _galleryCache() {
  try { return JSON.parse(localStorage.getItem(GALLERY_CACHE_KEY) || '{}'); } catch (e) { return {}; }
}
function _galleryCacheSet(key, items) {
  try {
    const c = _galleryCache();
    c[key] = items || [];
    localStorage.setItem(GALLERY_CACHE_KEY, JSON.stringify(c));
  } catch (e) {}
}
function _cleanAttribution(text) {
  if (!text) return '';
  return text.replace(/^\(c\)\s*/i, '© ').trim();
}

async function resolveSpeciesGallery(nombreCientifico) {
  const key = (nombreCientifico || '').trim().toLowerCase();
  if (!key) return [];
  const cache = _galleryCache();
  if (key in cache && cache[key].length) return cache[key];

  const items = [];
  const seen = new Set();
  const push = (url, credit, sourceUrl) => {
    if (!url || seen.has(url)) return;
    seen.add(url);
    items.push({ url, credit: credit || '', sourceUrl: sourceUrl || '' });
  };

  try {
    const r1 = await fetch(`https://api.inaturalist.org/v1/taxa?q=${encodeURIComponent(nombreCientifico)}&rank=species,genus&per_page=1`);
    if (r1.ok) {
      const d1 = await r1.json();
      const found = d1.results && d1.results[0];
      if (found) {
        try {
          const r2 = await fetch(`https://api.inaturalist.org/v1/taxa/${found.id}`);
          if (r2.ok) {
            const d2 = await r2.json();
            const t = d2.results && d2.results[0];
            if (t && Array.isArray(t.taxon_photos)) {
              t.taxon_photos.forEach((tp) => {
                const p = tp.photo;
                const u = p && (p.medium_url || p.square_url);
                const credit = p && (_cleanAttribution(p.attribution) || (p.attribution_name ? `© ${p.attribution_name} (iNaturalist)` : 'iNaturalist'));
                push(u, credit, `https://www.inaturalist.org/taxa/${found.id}`);
              });
            }
          }
        } catch (e) {}
        if (!items.length && found.default_photo) {
          const p = found.default_photo;
          const u = p.medium_url || p.square_url;
          const credit = _cleanAttribution(p.attribution) || 'iNaturalist';
          push(u, credit, `https://www.inaturalist.org/taxa/${found.id}`);
        }
      }
    }
  } catch (e) {}

  for (const lang of ['es', 'en']) {
    if (items.length >= 8) break;
    try {
      const r = await fetch(`https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(nombreCientifico)}`);
      if (r.ok) {
        const d = await r.json();
        const thumb = d.thumbnail && d.thumbnail.source;
        const pageUrl = d.content_urls && d.content_urls.desktop && d.content_urls.desktop.page;
        push(thumb, `Wikipedia (${lang.toUpperCase()})`, pageUrl);
      }
    } catch (e) {}
  }

  const result = items.slice(0, 8);
  _galleryCacheSet(key, result);
  return result;
}

const _photoObserver = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (!entry.isIntersecting) return;
    const el = entry.target;
    _photoObserver.unobserve(el);
    const nc = el.dataset.cientifico;
    const icon = el.dataset.icon;
    resolveSpeciesPhoto(nc).then((url) => {
      if (url) {
        const img = document.createElement('img');
        img.loading = 'lazy';
        img.alt = nc;
        img.src = url;
        img.onerror = () => { el.innerHTML = icon; };
        el.innerHTML = '';
        el.appendChild(img);
      }
    });
  });
}, { rootMargin: '200px' });

function attachLazyPhoto(el) { _photoObserver.observe(el); }

// ── Helpers ────────────────────────────────────────────────────────────
function esc(s) {
  if (s === null || s === undefined) return '';
  return String(s).replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function badgeEstatus2010(sp) {
  if (sp.delisted_2010) return '<span class="badge delisted">Excluida de la NOM-059-2010</span>';
  if (!sp.estatus_2010_codigo) return '';
  const cls = sp.estatus_2010_codigo.toLowerCase();
  return `<span class="badge ${cls}">NOM-059-2010: ${esc(sp.estatus_2010_codigo)} — ${esc(sp.estatus_2010_label)}</span>`;
}

// ── Tarjeta ────────────────────────────────────────────────────────────
function speciesCardHTML(sp) {
  const g = GRUPOS[sp.grupo] || { icon: '🔎' };
  const badges = [];
  if (sp.endemismo_2010 === 'endémica') badges.push('<span class="badge end">Endémica</span>');
  badges.push(badgeEstatus2010(sp));

  return `
  <div class="sp-card" data-uid="${esc(sp.uid)}">
    <div class="sp-thumb" data-cientifico="${esc(sp.nombre_busqueda)}" data-icon="${g.icon}">${g.icon}</div>
    <div class="sp-body">
      <div class="comun">${esc(sp.nombre_comun || sp.nombre_cientifico_2008)}</div>
      <div class="cientifico">${esc(sp.nombre_cientifico_2008)}</div>
      <div class="sp-badges">${badges.join('')}</div>
    </div>
  </div>`;
}

// ── Ficha de detalle ───────────────────────────────────────────────────
function tField(label, value) {
  if (!value) return '';
  return `<tr><td>${esc(label)}</td><td>${esc(value)}</td></tr>`;
}

function buildFichaHTML(sp) {
  const g = GRUPOS[sp.grupo] || { icon: '🔎' };
  const tx = sp.taxonomia || {};
  const taxoRows = [
    tField('Reino / Phylum', tx.reino_phylum),
    tField('Clase', tx.clase),
    tField('Orden', tx.orden),
    tField('Familia', tx.familia),
    tField('Subfamilia', tx.subfamilia),
    tField('Género', tx.genero),
  ].join('');

  const badges = [];
  if (sp.endemismo_2010 === 'endémica') badges.push('<span class="badge end">Endémica</span>');
  badges.push(badgeEstatus2010(sp));
  if (sp.iucn) badges.push(`<span class="badge nom">IUCN: ${esc(sp.iucn)}</span>`);
  if (sp.cites) badges.push(`<span class="badge nom">CITES: ${esc(sp.cites)}</span>`);

  const notaTaxo = sp.nota_taxonomica
    ? `<div class="nota-taxo">🔎 <strong>Nota taxonómica:</strong> ${esc(sp.nota_taxonomica)}</div>`
    : '';

  const estatus2010Texto = sp.delisted_2010
    ? 'No aparece en la NOM-059-SEMARNAT-2010 vigente (fue excluida de la lista).'
    : (sp.estatus_2010_codigo ? `${esc(sp.estatus_2010_codigo)} — ${esc(sp.estatus_2010_label)}${sp.endemismo_2010 ? ' · ' + esc(sp.endemismo_2010) : ''}` : 'Sin dato');

  const compareBox = `
    <div class="compare-box">
      <div class="col">
        <div class="yr">Catálogo 2008 (NOM-059-2001)</div>
        <div class="val">${esc(sp.estatus_2001 || 'Sin dato')}</div>
      </div>
      <div class="col">
        <div class="yr">Vigente (NOM-059-2010)</div>
        <div class="val">${estatus2010Texto}</div>
      </div>
    </div>`;

  const sections = [];
  if (sp.descripcion) sections.push(`<div class="fsection"><h4>Descripción</h4><p>${esc(sp.descripcion)}</p></div>`);
  if (sp.habitat) sections.push(`<div class="fsection"><h4>Hábitat</h4><p>${esc(sp.habitat)}</p></div>`);
  if (sp.distribucion_texto) sections.push(`<div class="fsection"><h4>Área de distribución</h4><p>${esc(sp.distribucion_texto)}</p></div>`);
  if (sp.distribucion_ags) sections.push(`<div class="fsection"><h4>Distribución en Aguascalientes</h4><p>${esc(sp.distribucion_ags)}</p></div>`);
  if (sp.amenazas) sections.push(`<div class="fsection"><h4>Factores de amenaza</h4><p>${esc(sp.amenazas)}</p></div>`);
  if (sp.conservacion) sections.push(`<div class="fsection"><h4>Medidas de conservación</h4><p>${esc(sp.conservacion)}</p></div>`);

  const q = encodeURIComponent(sp.nombre_busqueda || sp.nombre_cientifico_2008);
  const links = [
    `<a href="https://www.inaturalist.org/taxa/search?q=${q}" target="_blank" rel="noopener">🔎 iNaturalist</a>`,
    `<a href="https://www.gbif.org/species/search?q=${q}" target="_blank" rel="noopener">🌍 GBIF</a>`,
    `<a href="https://es.wikipedia.org/wiki/${q.replace(/%20/g,'_')}" target="_blank" rel="noopener">📖 Wikipedia</a>`,
  ];

  return `
    <button class="ficha-close" onclick="closeFicha()">✕</button>
    <div class="ficha-gallery" id="ficha-gallery">
      <div class="ficha-photo" id="ficha-photo">${g.icon}</div>
    </div>
    <div class="ficha-body">
      <h2>${esc(sp.nombre_comun || sp.nombre_cientifico_2008)}</h2>
      <div class="cientifico">${esc(sp.nombre_cientifico_2008)}${sp.nota_taxonomica ? ' *' : ''}</div>
      <div class="ficha-badges">${badges.join('')}</div>
      ${notaTaxo}
      <div class="fsection"><h4>Contraste NOM-059: 2001 → 2010</h4>${compareBox}</div>
      <div class="fsection"><h4>Taxonomía</h4><table class="ftable">${taxoRows}</table></div>
      ${sections.join('')}
      <div class="fsection"><h4>Más información</h4><div class="flinks">${links.join('')}</div></div>
    </div>`;
}

let _currentList = [];
let _galleryIdx = 0;
function openFicha(uid) {
  const sp = _currentList.find((s) => s.uid === uid);
  if (!sp) return;
  const overlay = document.getElementById('modal-overlay');
  const ficha = document.getElementById('ficha');
  ficha.innerHTML = buildFichaHTML(sp);
  overlay.classList.add('open');
  document.body.style.overflow = 'hidden';
  _galleryIdx = 0;
  resolveSpeciesGallery(sp.nombre_busqueda || sp.nombre_cientifico_2008).then((items) => {
    const gal = document.getElementById('ficha-gallery');
    if (!gal || !items.length) return;
    const alt = esc(sp.nombre_comun || sp.nombre_cientifico_2008);
    gal.innerHTML = `
      <div class="ficha-carrete" id="ficha-carrete">
        ${items.map((it, i) => `<div class="ficha-slide"><img src="${it.url}" alt="${alt} (${i+1}/${items.length})" loading="${i === 0 ? 'eager' : 'lazy'}"></div>`).join('')}
      </div>
      <div class="carrete-credit" id="carrete-credit">${_creditHTML(items[0])}</div>
      ${items.length > 1 ? `
        <button class="carrete-arrow prev" onclick="_carreteMove(-1)">‹</button>
        <button class="carrete-arrow next" onclick="_carreteMove(1)">›</button>
        <div class="carrete-dots">${items.map((_, i) => `<span class="dot${i===0?' sel':''}" data-i="${i}" onclick="_carreteGoTo(${i})"></span>`).join('')}</div>
        <div class="carrete-count">1 / ${items.length}</div>
      ` : ''}`;
    gal._items = items;
  });
}
function _creditHTML(item) {
  if (!item || !item.credit) return '';
  const text = `📷 ${esc(item.credit)}`;
  return item.sourceUrl
    ? `<a href="${esc(item.sourceUrl)}" target="_blank" rel="noopener">${text}</a>`
    : text;
}
function _carreteMove(delta) {
  const track = document.getElementById('ficha-carrete');
  if (!track) return;
  const n = track.children.length;
  _galleryIdx = (_galleryIdx + delta + n) % n;
  _carreteGoTo(_galleryIdx);
}
function _carreteGoTo(i) {
  const track = document.getElementById('ficha-carrete');
  const gal = document.getElementById('ficha-gallery');
  if (!track) return;
  _galleryIdx = i;
  track.style.transform = `translateX(-${i * 100}%)`;
  document.querySelectorAll('.carrete-dots .dot').forEach((d, idx) => d.classList.toggle('sel', idx === i));
  const countEl = document.querySelector('.carrete-count');
  if (countEl) countEl.textContent = `${i + 1} / ${track.children.length}`;
  const creditEl = document.getElementById('carrete-credit');
  if (creditEl && gal && gal._items) creditEl.innerHTML = _creditHTML(gal._items[i]);
}
function closeFicha() {
  document.getElementById('modal-overlay').classList.remove('open');
  document.body.style.overflow = '';
}

// ── Estado de catálogo (búsqueda, filtro, paginación) ────────────────────
const PAGE_SIZE = 30;
let state = { grupo: 'todas', q: '', page: 1, filter: 'todas' };

function matchesQuery(sp, q) {
  if (!q) return true;
  q = q.toLowerCase();
  return (sp.nombre_comun || '').toLowerCase().includes(q)
    || (sp.nombre_cientifico_2008 || '').toLowerCase().includes(q)
    || (sp.nombre_cientifico_actual || '').toLowerCase().includes(q)
    || ((sp.taxonomia && sp.taxonomia.familia) || '').toLowerCase().includes(q)
    || ((sp.taxonomia && sp.taxonomia.orden) || '').toLowerCase().includes(q);
}

function applyFilter(list, filter) {
  if (filter === 'endemicas') return list.filter((s) => s.endemismo_2010 === 'endémica');
  if (filter === 'peligro') return list.filter((s) => s.estatus_2010_codigo === 'P');
  if (filter === 'amenazada') return list.filter((s) => s.estatus_2010_codigo === 'A');
  if (filter === 'proteccion') return list.filter((s) => s.estatus_2010_codigo === 'Pr');
  if (filter === 'excluidas') return list.filter((s) => s.delisted_2010);
  return list;
}

async function renderCatalogo() {
  const grid = document.getElementById('sp-grid');
  const countEl = document.getElementById('resultcount');
  grid.innerHTML = '<div class="empty">Cargando catálogo…</div>';

  const data = await cargarEspecies();
  let list = state.grupo === 'todas' ? data : data.filter((s) => s.grupo === state.grupo);
  list = list.filter((sp) => matchesQuery(sp, state.q));
  list = applyFilter(list, state.filter);
  _currentList = list;

  countEl.textContent = `${list.length} especie${list.length === 1 ? '' : 's'} encontrada${list.length === 1 ? '' : 's'}`;

  const totalPages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
  state.page = Math.min(state.page, totalPages);
  const pageItems = list.slice((state.page - 1) * PAGE_SIZE, state.page * PAGE_SIZE);

  if (!pageItems.length) {
    grid.innerHTML = '<div class="empty">🔍 No se encontraron especies con esos criterios.</div>';
  } else {
    grid.innerHTML = pageItems.map(speciesCardHTML).join('');
    grid.querySelectorAll('.sp-thumb').forEach(attachLazyPhoto);
    grid.querySelectorAll('.sp-card').forEach((card) => {
      card.addEventListener('click', () => openFicha(card.dataset.uid));
    });
  }

  document.getElementById('pager-info').textContent = `Página ${state.page} de ${totalPages}`;
  document.getElementById('pager-prev').disabled = state.page <= 1;
  document.getElementById('pager-next').disabled = state.page >= totalPages;
}

function initCatalogo() {
  document.querySelectorAll('.chip[data-grupo]').forEach((chip) => {
    chip.classList.toggle('sel', chip.dataset.grupo === state.grupo);
    chip.addEventListener('click', () => {
      state.grupo = chip.dataset.grupo;
      state.page = 1;
      document.querySelectorAll('.chip[data-grupo]').forEach((c) => c.classList.toggle('sel', c === chip));
      renderCatalogo();
    });
  });
  document.querySelectorAll('.chip[data-filter]').forEach((chip) => {
    chip.classList.toggle('sel', chip.dataset.filter === state.filter);
    chip.addEventListener('click', () => {
      state.filter = chip.dataset.filter;
      state.page = 1;
      document.querySelectorAll('.chip[data-filter]').forEach((c) => c.classList.toggle('sel', c === chip));
      renderCatalogo();
    });
  });
  const searchInput = document.getElementById('search-input');
  let debounce;
  searchInput.addEventListener('input', () => {
    clearTimeout(debounce);
    debounce = setTimeout(() => { state.q = searchInput.value.trim(); state.page = 1; renderCatalogo(); }, 250);
  });
  document.getElementById('pager-prev').addEventListener('click', () => { state.page--; renderCatalogo(); window.scrollTo({top:0,behavior:'smooth'}); });
  document.getElementById('pager-next').addEventListener('click', () => { state.page++; renderCatalogo(); window.scrollTo({top:0,behavior:'smooth'}); });
  document.getElementById('modal-overlay').addEventListener('click', (e) => { if (e.target.id === 'modal-overlay') closeFicha(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeFicha(); });

  renderCatalogo();
}
