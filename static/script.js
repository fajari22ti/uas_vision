
let currentImageFile = null;
let mode = 'idle';            // 'idle' | 'image' | 'camera'
let selectedFile = null;
let camStream = null;
let camTimer  = null;
let camInterval = 1500;       // ms antar deteksi saat live camera
let lastFrameTime = performance.now();

let roiList   = [];           // [[x,y,w,h], ...] dalam koordinat gambar asli
let roiActive = false;
let roiDrawing = false;
let roiStart  = null;
let natW = 0, natH = 0;       // ukuran asli gambar/video
let dispW = 0, dispH = 0;     // ukuran tampil di layar
let file=imageInput.files[0];
currentImageFile=file;
const el = (id) => document.getElementById(id);

/* ── Toast Helper ─────────────────────────────────────────────────────── */
function showToast(msg, type = '') {
  const toastEl = el('appToast');
  el('appToastBody').textContent = msg;
  toastEl.classList.remove('text-bg-success', 'text-bg-danger');
  if (type === 'ok')  toastEl.classList.add('text-bg-success');
  if (type === 'err') toastEl.classList.add('text-bg-danger');
  const t = bootstrap.Toast.getOrCreateInstance(toastEl, { delay: 2800 });
  t.show();
}

/* ── Loading Overlay ──────────────────────────────────────────────────── */
function setLoading(on, text = 'Processing...') {
  el('loadingOverlay').classList.toggle('d-none', !on);
  el('loadingText').textContent = text;
}

/* ──────────────────────────────────────────────────────────────────────
   MODE: IMAGE UPLOAD
   ────────────────────────────────────────────────────────────────────── */
el('btnImage').addEventListener('click', () => el('imageInput').click());

el('imageInput').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  loadImageFile(file);
});

function loadImageFile(file) {
  stopCamera();
  selectedFile = file;
  mode = 'image';
  el('modeBadge').textContent = 'Image';
  el('modeBadge').className = 'badge bg-primary';

  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    natW = img.naturalWidth;
    natH = img.naturalHeight;
    el('liveVideo').classList.add('d-none');
    el('preview').classList.remove('d-none');
    el('preview').src = url;
    setupROICanvas();
    detectImage(file);
  };
  img.src = url;
}

async function detectImage(file) {
  setLoading(true, 'Mendeteksi slot parkir...');
  try {
    const fd = new FormData();
    fd.append('image', file);
    fd.append('roi', roiList.length ? JSON.stringify(roiList) : '');

    const res = await fetch('/detect/image', { method: 'POST', body: fd });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Deteksi gagal');

    el('preview').src = 'data:image/jpeg;base64,' + data.image_b64;
    updateStats(data);
    updateTable(data.results);
    showToast(`✅ ${data.total} slot terdeteksi — ${data.n_tersedia ?? data.n_empty ?? 0} kosong`, 'ok');
  } catch (err) {
    showToast('❌ ' + err.message, 'err');
  }
  setLoading(false);
}

/* ──────────────────────────────────────────────────────────────────────
   MODE: LIVE CAMERA (dengan pilihan sumber kamera)
   ────────────────────────────────────────────────────────────────────── */
el('btnCamera').addEventListener('click', async () => {
  await populateCameraList();
  el('cameraSelectWrap').classList.remove('d-none');
  // Jika user belum pilih kamera, langsung start dengan device pertama
  if (!camStream) startCameraWithDevice(el('cameraSelect').value);
});

el('cameraSelect').addEventListener('change', () => {
  startCameraWithDevice(el('cameraSelect').value);
});

async function populateCameraList() {
  try {
    // Minta izin dulu supaya label device muncul
    const tempStream = await navigator.mediaDevices.getUserMedia({ video: true });
    tempStream.getTracks().forEach(t => t.stop());

    const devices = await navigator.mediaDevices.enumerateDevices();
    const videoDevices = devices.filter(d => d.kind === 'videoinput');

    const sel = el('cameraSelect');
    sel.innerHTML = '';
    videoDevices.forEach((d, i) => {
      const opt = document.createElement('option');
      opt.value = d.deviceId;
      opt.textContent = d.label || `Kamera ${i + 1}`;
      sel.appendChild(opt);
    });

    if (videoDevices.length === 0) {
      showToast('❌ Tidak ada kamera ditemukan', 'err');
    }
  } catch (err) {
    showToast('❌ Izin kamera ditolak: ' + err.message, 'err');
  }
}

async function startCameraWithDevice(deviceId) {
  stopCameraStreamOnly();
  try {
    const constraints = {
      video: deviceId ? { deviceId: { exact: deviceId } } : true,
      audio: false
    };
    camStream = await navigator.mediaDevices.getUserMedia(constraints);

    mode = 'camera';
    el('modeBadge').innerHTML = '<span class="live-dot"></span>Live';
    el('modeBadge').className = 'badge bg-danger';

    const video = el('liveVideo');
    video.srcObject = camStream;
    video.classList.remove('d-none');
    el('preview').classList.add('d-none');

    video.onloadedmetadata = () => {
      natW = video.videoWidth;
      natH = video.videoHeight;
      setupROICanvas();
    };

    if (camTimer) clearInterval(camTimer);
    camTimer = setInterval(detectLiveFrame, camInterval);
    showToast('📹 Kamera aktif', 'ok');
  } catch (err) {
    showToast('❌ Kamera gagal diakses: ' + err.message, 'err');
  }
}

async function detectLiveFrame() {
  const video = el('liveVideo');
  if (!video.videoWidth) return;

  const cap = el('captureCanvas');
  cap.width = video.videoWidth;
  cap.height = video.videoHeight;
  cap.getContext('2d').drawImage(video, 0, 0);

  const frameB64 = cap.toDataURL('image/jpeg', 0.8);

  try {
    const res = await fetch('/detect/frame', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ frame: frameB64, roi: roiList.length ? roiList : null })
    });
    const data = await res.json();
    if (!data.success) return;

    // Tampilkan hasil sebagai overlay pada elemen preview (image) di atas video
    el('preview').src = 'data:image/jpeg;base64,' + data.image_b64;
    el('preview').classList.remove('d-none');
    video.classList.add('d-none'); // tampilkan hasil overlay, bukan video mentah

    updateStats(data);
    updateTable(data.results);

    // FPS counter sederhana
    const now = performance.now();
    const fps = Math.round(1000 / (now - lastFrameTime) * (camInterval / 1000));
    lastFrameTime = now;
    el('fps').textContent = Math.min(fps, 30);
  } catch (err) {
    /* silent fail agar live tidak spam toast */
  }
}

function stopCameraStreamOnly() {
  if (camStream) {
    camStream.getTracks().forEach(t => t.stop());
    camStream = null;
  }
  if (camTimer) {
    clearInterval(camTimer);
    camTimer = null;
  }
}

function stopCamera() {
  stopCameraStreamOnly();
  el('cameraSelectWrap').classList.add('d-none');
  el('liveVideo').classList.add('d-none');
}

/* ──────────────────────────────────────────────────────────────────────
   STOP DETECTION
   ────────────────────────────────────────────────────────────────────── */
el('btnStop').addEventListener('click', () => {
  stopCamera();
  mode = 'idle';
  el('modeBadge').textContent = 'Idle';
  el('modeBadge').className = 'badge bg-secondary';
  el('preview').src = 'https://placehold.co/900x520/1e293b/ffffff?text=Waiting+for+Detection';
  el('preview').classList.remove('d-none');
  el('roiCanvas').classList.add('d-none');
  resetStats();
  showToast('Deteksi dihentikan', '');
});

/* ──────────────────────────────────────────────────────────────────────
   ROI MANUAL (Bounding Box buatan user)
   ────────────────────────────────────────────────────────────────────── */
el('btnROIMode').addEventListener('click', () => {
  roiActive = !roiActive;
  el('btnROIMode').classList.toggle('active', roiActive);
  el('roiCanvas').classList.toggle('d-none', !roiActive);
  if (roiActive) setupROICanvas();
});

el('btnROIReset').addEventListener('click', () => {
  roiList = [];
  drawROIOverlay();
  showToast('ROI manual direset — kembali ke mode otomatis', 'ok');
});

function setupROICanvas() {
  const activeEl = mode === 'camera' && !el('liveVideo').classList.contains('d-none')
    ? el('liveVideo')
    : el('preview');

  if (activeEl.classList.contains('d-none') || !natW) return;

  const rect = activeEl.getBoundingClientRect();
  const wrapRect = el('previewWrap').getBoundingClientRect();

  dispW = rect.width;
  dispH = rect.height;

  const canvas = el('roiCanvas');
  canvas.width  = dispW;
  canvas.height = dispH;
  canvas.style.width  = dispW + 'px';
  canvas.style.height = dispH + 'px';
  canvas.style.left = (rect.left - wrapRect.left) + 'px';
  canvas.style.top  = (rect.top - wrapRect.top) + 'px';

  if (roiActive) canvas.classList.remove('d-none');
  drawROIOverlay();
}

function getCanvasPos(e) {
  const rect = el('roiCanvas').getBoundingClientRect();
  const clientX = e.touches ? e.touches[0].clientX : e.clientX;
  const clientY = e.touches ? e.touches[0].clientY : e.clientY;
  return { x: clientX - rect.left, y: clientY - rect.top };
}

function startROIDraw(e) {
  if (!roiActive) return;
  roiDrawing = true;
  roiStart = getCanvasPos(e);
}

function moveROIDraw(e) {
  if (!roiDrawing || !roiActive) return;
  const cur = getCanvasPos(e);
  const ctx = el('roiCanvas').getContext('2d');
  ctx.clearRect(0, 0, dispW, dispH);
  drawExistingROI(ctx);
  ctx.strokeStyle = '#38bdf8';
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 3]);
  ctx.strokeRect(roiStart.x, roiStart.y, cur.x - roiStart.x, cur.y - roiStart.y);
}

function endROIDraw(e) {
  if (!roiDrawing || !roiActive) return;
  roiDrawing = false;
  const cur = getCanvasPos(e);
  const rx = Math.min(roiStart.x, cur.x);
  const ry = Math.min(roiStart.y, cur.y);
  const rw = Math.abs(cur.x - roiStart.x);
  const rh = Math.abs(cur.y - roiStart.y);
  if (rw < 8 || rh < 8) return;

  const scaleX = natW / dispW;
  const scaleY = natH / dispH;
  roiList.push([
    Math.round(rx * scaleX),
    Math.round(ry * scaleY),
    Math.round(rw * scaleX),
    Math.round(rh * scaleY)
  ]);
  drawROIOverlay();
}

function drawROIOverlay() {
  const canvas = el('roiCanvas');
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawExistingROI(ctx);
}

function drawExistingROI(ctx) {
  ctx.setLineDash([]);
  roiList.forEach(([x, y, w, h], i) => {
    if (!natW || !natH) return;
    const scaleX = dispW / natW;
    const scaleY = dispH / natH;
    const dx = x * scaleX, dy = y * scaleY, dw = w * scaleX, dh = h * scaleY;
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 2;
    ctx.strokeRect(dx, dy, dw, dh);
    ctx.fillStyle = 'rgba(245,158,11,.15)';
    ctx.fillRect(dx, dy, dw, dh);
    ctx.fillStyle = '#f59e0b';
    ctx.font = 'bold 12px sans-serif';
    ctx.fillText(`S${i + 1}`, dx + 4, dy + 14);
  });
}

const roiCanvas = el('roiCanvas');
roiCanvas.addEventListener('mousedown', startROIDraw);
roiCanvas.addEventListener('mousemove', moveROIDraw);
roiCanvas.addEventListener('mouseup', endROIDraw);
roiCanvas.addEventListener('touchstart', (e) => { e.preventDefault(); startROIDraw(e); }, { passive: false });
roiCanvas.addEventListener('touchmove',  (e) => { e.preventDefault(); moveROIDraw(e); },  { passive: false });
roiCanvas.addEventListener('touchend',   (e) => { endROIDraw(e); });

window.addEventListener('resize', setupROICanvas);

/* ──────────────────────────────────────────────────────────────────────
   STATS & TABLE
   ────────────────────────────────────────────────────────────────────── */
function updateStats(data) {
  const total = data.total ?? 0;
  const empty = data.n_tersedia ?? data.n_empty ?? 0;
  const occupied = data.n_penuh ?? data.n_occupied ?? (total - empty);

  el('totalSlot').textContent = total;
  el('emptySlot').textContent = empty;
  el('occupiedSlot').textContent = occupied;
}

function resetStats() {
  el('totalSlot').textContent = 0;
  el('emptySlot').textContent = 0;
  el('occupiedSlot').textContent = 0;
  el('fps').textContent = 0;
  el('resultTable').innerHTML = '<tr><td colspan="3" class="text-center text-muted">No Detection</td></tr>';
}

function updateTable(results) {
  if (!results || results.length === 0) {
    el('resultTable').innerHTML = '<tr><td colspan="3" class="text-center text-muted">No Detection</td></tr>';
    return;
  }
  el('resultTable').innerHTML = results.map(r => {
    const isEmpty = (r.status === 'Tersedia' || r.status === 'Empty');
    const badgeClass = isEmpty ? 'bg-success' : 'bg-danger';
    const statusLabel = isEmpty ? 'Empty' : 'Occupied';
    return `
      <tr>
        <td>Slot ${r.slot_id}</td>
        <td><span class="badge ${badgeClass}">${statusLabel}</span></td>
        <td>${r.confidence}%</td>
      </tr>`;
  }).join('');
}
