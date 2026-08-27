(() => {
  'use strict';
  const OUTPUT_WIDTH = 1004;
  const OUTPUT_HEIGHT = 2048;
  const OUTPUT_RATIO = OUTPUT_WIDTH / OUTPUT_HEIGHT;
  const state = { source: null, fileName: '', objectUrl: '', x: 0, y: 0, zoom: 100, split: 3, mode: 'fixed', drag: null, cache: null, job: null, messageTimer: null };
  const $ = (id) => document.getElementById(id);
  const el = { input: $('file-input'), drop: $('dropzone'), fileLabel: $('file-label'), fileDetail: $('file-detail'), split: $('split-picker'), mode: $('mode-picker'), output: $('output-size'), zoom: $('zoom'), zoomValue: $('zoom-value'), x: $('position-x'), xValue: $('position-x-value'), y: $('position-y'), yValue: $('position-y-value'), all: $('download-all'), status: $('status'), help: $('preview-help'), panels: $('panels'), empty: $('empty-note') };

  function key() { return state.source ? [state.objectUrl,state.mode,state.split,state.zoom,state.x,state.y].join('|') : ''; }
  function setMessage(text, clearAfter = 0) { clearTimeout(state.messageTimer); el.status.textContent = text; if (clearAfter) state.messageTimer = setTimeout(() => { el.status.textContent = ''; }, clearAfter); }
  function axis(value, negative, positive) { return value === 0 ? '中央' : `${value < 0 ? negative : positive} ${Math.abs(Math.round(value))}`; }

  function loadFile(file) {
    if (!file || !file.type.startsWith('image/')) return setMessage('画像ファイルを選んでください');
    if (state.objectUrl) URL.revokeObjectURL(state.objectUrl);
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      state.source = image; state.fileName = file.name.replace(/\.[^.]+$/, ''); state.objectUrl = url;
      state.zoom = 100; state.x = 0; state.y = 0; invalidate(); render();
    };
    image.onerror = () => setMessage('画像を読み込めませんでした');
    image.src = url;
  }

  function getCrop() {
    const source = state.source; if (!source) return null;
    if (state.mode === 'original') return { x: 0, y: 0, width: source.width, height: source.height };
    const targetRatio = OUTPUT_RATIO * state.split;
    let baseWidth = source.width, baseHeight = baseWidth / targetRatio;
    if (baseHeight > source.height) { baseHeight = source.height; baseWidth = baseHeight * targetRatio; }
    const scale = 100 / state.zoom;
    const width = baseWidth * scale, height = baseHeight * scale;
    const spanX = source.width - width, spanY = source.height - height;
    return { x: spanX / 2 + (state.x / 100) * (Math.abs(spanX) / 2), y: spanY / 2 + (state.y / 100) * (Math.abs(spanY) / 2), width, height };
  }

  function drawVisiblePanel(ctx, source, crop, index, split, outWidth, outHeight) {
    const panelWidth = crop.width / split, panelX = crop.x + panelWidth * index;
    const visibleX = Math.max(0, panelX), visibleY = Math.max(0, crop.y);
    const visibleRight = Math.min(source.width, panelX + panelWidth), visibleBottom = Math.min(source.height, crop.y + crop.height);
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, outWidth, outHeight);
    if (visibleRight <= visibleX || visibleBottom <= visibleY) return;
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    const dx = ((visibleX - panelX) / panelWidth) * outWidth, dy = ((visibleY - crop.y) / crop.height) * outHeight;
    const dw = ((visibleRight - visibleX) / panelWidth) * outWidth, dh = ((visibleBottom - visibleY) / crop.height) * outHeight;
    ctx.drawImage(source, visibleX, visibleY, visibleRight - visibleX, visibleBottom - visibleY, dx, dy, dw, dh);
  }

  function drawPanel(index) {
    const source = state.source, crop = getCrop(); if (!source || !crop) return null;
    const canvas = document.createElement('canvas'), ctx = canvas.getContext('2d'); if (!ctx) return null;
    if (state.mode === 'original') {
      const startX = Math.round(source.width * index / state.split), endX = Math.round(source.width * (index + 1) / state.split);
      canvas.width = endX - startX; canvas.height = source.height;
      ctx.drawImage(source, startX, 0, canvas.width, source.height, 0, 0, canvas.width, canvas.height);
    } else {
      canvas.width = OUTPUT_WIDTH; canvas.height = OUTPUT_HEIGHT;
      drawVisiblePanel(ctx, source, crop, index, state.split, canvas.width, canvas.height);
    }
    return canvas;
  }

  function canvasToBlob(canvas) { return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('PNG conversion failed')), 'image/png')); }
  async function createBlobs() { return Promise.all(Array.from({ length: state.split }, (_, i) => canvasToBlob(drawPanel(i)))); }
  function invalidate() {
    state.cache = null; state.job = null;
    if (state.source) { setMessage('PNGを準備中…'); setTimeout(() => { if (state.source) getBlobs().then(() => setMessage('')).catch(() => setMessage('')); }, 300); }
  }
  function getBlobs() {
    const exportKey = key();
    if (state.cache?.key === exportKey) return Promise.resolve(state.cache.blobs);
    if (state.job?.key === exportKey) return state.job.promise;
    const promise = createBlobs(); state.job = { key: exportKey, promise };
    promise.then((blobs) => { if (state.job?.key === exportKey) state.cache = { key: exportKey, blobs }; });
    return promise;
  }
  function saveBlob(blob, name) {
    const url = URL.createObjectURL(blob), link = document.createElement('a');
    link.href = url; link.download = name; link.rel = 'noopener'; link.hidden = true;
    document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 30000);
  }
  async function download(index) {
    try { const blobs = await getBlobs(); saveBlob(blobs[index], `${state.fileName || 'photo-split'}-${index + 1}.png`); setMessage(`${index + 1}枚目を保存しました`, 1800); }
    catch { setMessage('保存に失敗しました。別のブラウザでお試しください'); }
  }
  async function downloadAll() {
    try {
      const blobs = await getBlobs();
      blobs.forEach((blob, i) => setTimeout(() => saveBlob(blob, `${state.fileName || 'photo-split'}-${i + 1}.png`), i * 300));
      setMessage(`${state.split}枚のPNGを保存しました`, 2400);
    } catch { setMessage('保存に失敗しました。1枚ずつ保存してください'); }
  }

  function previewCanvas(index, crop) {
    const canvas = document.createElement('canvas'); canvas.width = 540; canvas.height = Math.round(540 * crop.height / (crop.width / state.split));
    canvas.setAttribute('aria-label', `${index + 1}枚目のプレビュー`);
    drawVisiblePanel(canvas.getContext('2d'), state.source, crop, index, state.split, canvas.width, canvas.height); return canvas;
  }
  function renderPanels() {
    const crop = getCrop(); el.panels.replaceChildren();
    el.panels.style.setProperty('--split-count', state.split);
    const ratio = state.mode === 'original' && state.source ? state.source.width / state.source.height / state.split : OUTPUT_RATIO;
    el.panels.style.setProperty('--panel-ratio', ratio);
    el.panels.className = `panels${state.source ? ' ready' : ''}${state.source && state.mode === 'fixed' ? ' adjustable' : ''}`;
    for (let i = 0; i < state.split; i++) {
      const article = document.createElement('article'); article.className = 'panel';
      const number = document.createElement('div'); number.className = 'number'; number.textContent = `0${i + 1}`;
      const frame = document.createElement('div'); frame.className = 'preview-frame';
      if (state.source && crop) frame.append(previewCanvas(i, crop)); else { const ph = document.createElement('div'); ph.className = 'placeholder'; ph.innerHTML = `<span>${i + 1}</span>`; frame.append(ph); }
      const button = document.createElement('button'); button.type = 'button'; button.disabled = !state.source; button.innerHTML = 'この1枚を保存 <span aria-hidden="true">↓</span>'; button.addEventListener('click', () => download(i));
      frame.addEventListener('pointerdown', startDrag); frame.addEventListener('pointermove', moveDrag); frame.addEventListener('pointerup', endDrag); frame.addEventListener('pointercancel', endDrag);
      article.append(number, frame, button); el.panels.append(article);
    }
  }
  function render() {
    const has = Boolean(state.source), fixed = state.mode === 'fixed';
    el.drop.classList.toggle('has-file', has); el.fileLabel.textContent = has ? state.fileName : '画像をドロップ'; el.fileDetail.textContent = has ? `${state.source.width} × ${state.source.height}px` : 'またはクリックして選択';
    [...el.split.children].forEach((b) => b.classList.toggle('active', Number(b.dataset.count) === state.split));
    [...el.mode.children].forEach((b) => b.classList.toggle('active', b.dataset.mode === state.mode));
    el.output.textContent = fixed ? '1004 × 2048 px' : has ? `幅を${state.split}等分 × ${state.source.height}px` : `元画像を${state.split}等分`;
    el.zoom.value = state.zoom; el.x.value = state.x; el.y.value = state.y;
    el.zoomValue.textContent = `${state.zoom}%`; el.xValue.textContent = axis(state.x, '左', '右'); el.yValue.textContent = axis(state.y, '上', '下');
    el.zoom.disabled = el.x.disabled = el.y.disabled = !has || !fixed; el.all.disabled = !has; el.all.querySelector('span').textContent = `${state.split}枚まとめて保存`;
    el.help.textContent = has ? (fixed ? '画像をドラッグして位置調整' : '元画像をそのまま等分') : `左から1〜${state.split}の順番`;
    el.empty.hidden = has; if (!has) el.empty.querySelector('p').innerHTML = `<strong>まずは画像を選んでください</strong><br>ここに${state.split}枚のプレビューが表示されます`;
    renderPanels();
  }

  function startDrag(event) {
    if (!state.source || state.mode !== 'fixed') return;
    const crop = getCrop(); event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId);
    state.drag = { id: event.pointerId, clientX: event.clientX, clientY: event.clientY, cropX: crop.x, cropY: crop.y, width: crop.width, height: crop.height };
    event.currentTarget.classList.add('dragging');
  }
  function moveDrag(event) {
    const d = state.drag; if (!state.source || !d || d.id !== event.pointerId) return;
    event.preventDefault(); const bounds = event.currentTarget.getBoundingClientRect(); const spanX = state.source.width - d.width, spanY = state.source.height - d.height;
    const nextX = d.cropX - (event.clientX - d.clientX) * ((d.width / state.split) / bounds.width), nextY = d.cropY - (event.clientY - d.clientY) * (d.height / bounds.height);
    if (Math.abs(spanX) > .01) state.x = Math.max(-100, Math.min(100, ((nextX - spanX / 2) / (Math.abs(spanX) / 2)) * 100));
    if (Math.abs(spanY) > .01) state.y = Math.max(-100, Math.min(100, ((nextY - spanY / 2) / (Math.abs(spanY) / 2)) * 100));
    el.x.value = state.x; el.y.value = state.y; el.xValue.textContent = axis(state.x, '左', '右'); el.yValue.textContent = axis(state.y, '上', '下'); renderPanels();
  }
  function endDrag(event) { if (!state.drag || state.drag.id !== event.pointerId) return; state.drag = null; event.currentTarget.classList.remove('dragging'); invalidate(); }

  el.drop.addEventListener('click', () => el.input.click()); el.input.addEventListener('change', () => loadFile(el.input.files[0]));
  el.drop.addEventListener('dragover', (e) => { e.preventDefault(); el.drop.classList.add('is-dragging'); });
  el.drop.addEventListener('dragleave', () => el.drop.classList.remove('is-dragging'));
  el.drop.addEventListener('drop', (e) => { e.preventDefault(); el.drop.classList.remove('is-dragging'); loadFile(e.dataTransfer.files[0]); });
  el.split.addEventListener('click', (e) => { const count = Number(e.target.dataset.count); if (![2,3,4].includes(count)) return; state.split = count; invalidate(); render(); });
  el.mode.addEventListener('click', (e) => { const mode = e.target.dataset.mode; if (!mode) return; state.mode = mode; invalidate(); render(); });
  [[el.zoom,'zoom'],[el.x,'x'],[el.y,'y']].forEach(([input, prop]) => input.addEventListener('input', () => { state[prop] = Number(input.value); invalidate(); render(); }));
  el.all.addEventListener('click', downloadAll); window.addEventListener('beforeunload', () => { if (state.objectUrl) URL.revokeObjectURL(state.objectUrl); });
  render();
})();

