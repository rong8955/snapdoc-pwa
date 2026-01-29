const picker = document.getElementById("picker");
const gallery = document.getElementById("gallery");
const statusEl = document.getElementById("status");

const exportSinglePdfBtn = document.getElementById("exportSinglePdf");
const exportAllPdfBtn = document.getElementById("exportAllPdf");
const exportSinglePngBtn = document.getElementById("exportSinglePng");
const clearAllBtn = document.getElementById("clearAll");

// Modal editor elements
const editorModal = document.getElementById("editorModal");
const editorCanvas = document.getElementById("editorCanvas");
const autoDetectBtn = document.getElementById("autoDetectBtn");
const applyBtn = document.getElementById("applyBtn");
const resetBtn = document.getElementById("resetBtn");
const closeBtn = document.getElementById("closeBtn");
const cvState = document.getElementById("cvState");
const ectx = editorCanvas.getContext("2d");

let pages = []; 
// page: {
//   name, originalBlob, originalUrl,
//   blob, url, rotation,
//   points: [{x,y}*4] in image pixel coords,
// }
let editingIndex = -1;

// ---------- Utilities ----------
function setStatus(msg) { statusEl.textContent = msg; }

function downloadBlob(blob, filename) {
  const a = document.createElement("a");
  const url = URL.createObjectURL(blob);
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function blobToImage(blobOrUrl) {
  const img = new Image();
  if (typeof blobOrUrl === "string") {
    img.src = blobOrUrl;
  } else {
    img.src = URL.createObjectURL(blobOrUrl);
  }
  await img.decode();
  return img;
}

function revokeIfObjectUrl(url) {
  // We created object URLs for blobs; revoke when replacing
  if (typeof url === "string" && url.startsWith("blob:")) URL.revokeObjectURL(url);
}

function openModal() {
  editorModal.classList.add("show");
  editorModal.setAttribute("aria-hidden", "false");
}
function closeModal() {
  editorModal.classList.remove("show");
  editorModal.setAttribute("aria-hidden", "true");
  editingIndex = -1;
}

// ---------- Render gallery ----------
function render() {
  gallery.innerHTML = "";
  pages.forEach((p, idx) => {
    const div = document.createElement("div");
    div.className = "thumb";
    div.innerHTML = `
      <img src="${p.url}" alt="page ${idx+1}">
      <small>${idx+1}. ${p.name}</small>
      <div class="btns">
        <button data-rotl="${idx}">↺</button>
        <button data-rotr="${idx}">↻</button>
        <button data-auto="${idx}">Auto</button>
        <button data-manual="${idx}">Manual</button>
        <button data-reset="${idx}">Reset</button>
        <button data-del="${idx}">刪除</button>
      </div>
    `;
    gallery.appendChild(div);
  });

  gallery.querySelectorAll("button[data-del]").forEach(btn => {
    btn.addEventListener("click", () => {
      const i = Number(btn.dataset.del);
      revokeIfObjectUrl(pages[i].url);
      revokeIfObjectUrl(pages[i].originalUrl);
      pages.splice(i, 1);
      render();
      setStatus(`剩餘 ${pages.length} 頁`);
    });
  });

  gallery.querySelectorAll("button[data-rotl]").forEach(btn => {
    btn.addEventListener("click", () => {
      const i = Number(btn.dataset.rotl);
      pages[i].rotation = ((pages[i].rotation ?? 0) - 90 + 360) % 360;
      setStatus(`第 ${i+1} 頁：旋轉 ${pages[i].rotation}°（匯出時生效）`);
    });
  });

  gallery.querySelectorAll("button[data-rotr]").forEach(btn => {
    btn.addEventListener("click", () => {
      const i = Number(btn.dataset.rotr);
      pages[i].rotation = ((pages[i].rotation ?? 0) + 90) % 360;
      setStatus(`第 ${i+1} 頁：旋轉 ${pages[i].rotation}°（匯出時生效）`);
    });
  });

  gallery.querySelectorAll("button[data-auto]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const i = Number(btn.dataset.auto);
      await startEditor(i, "auto");
    });
  });

  gallery.querySelectorAll("button[data-manual]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const i = Number(btn.dataset.manual);
      await startEditor(i, "manual");
    });
  });

  gallery.querySelectorAll("button[data-reset]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const i = Number(btn.dataset.reset);
      resetToOriginal(i);
      render();
      setStatus(`第 ${i+1} 頁已重設回原圖`);
    });
  });
}

// ---------- Read files ----------
async function readFiles(fileList) {
  const files = Array.from(fileList);
  for (const f of files) {
    const blob = f.slice(0, f.size, f.type);
    const originalUrl = URL.createObjectURL(blob);
    pages.push({
      name: f.name,
      originalBlob: blob,
      originalUrl,
      blob,
      url: originalUrl,
      rotation: 0,
      points: null
    });
  }
  render();
  setStatus(`已加入 ${files.length} 張，目前共 ${pages.length} 頁`);
}

picker.addEventListener("change", async (e) => {
  if (!e.target.files || e.target.files.length === 0) return;
  setStatus("讀取中…");
  await readFiles(e.target.files);
  picker.value = "";
});

// ---------- Export (apply rotation only) ----------
async function renderPageToPngBlobForExport(p) {
  const img = await blobToImage(p.url);

  const rot = (p.rotation ?? 0) % 360;
  const rad = rot * Math.PI / 180;

  const w = img.naturalWidth;
  const h = img.naturalHeight;

  const swap = rot === 90 || rot === 270;
  const canvas = document.createElement("canvas");
  canvas.width = swap ? h : w;
  canvas.height = swap ? w : h;

  const ctx = canvas.getContext("2d");
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate(rad);
  ctx.drawImage(img, -w / 2, -h / 2);

  const outBlob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png", 1.0));
  return { blob: outBlob, width: canvas.width, height: canvas.height };
}

async function exportSinglePdf() {
  if (pages.length === 0) return setStatus("沒有頁面可匯出");
  const { PDFDocument } = PDFLib;
  const pdfDoc = await PDFDocument.create();

  const p = pages[0];
  const { blob, width, height } = await renderPageToPngBlobForExport(p);
  const bytes = await blob.arrayBuffer();
  const embedded = await pdfDoc.embedPng(bytes);

  const page = pdfDoc.addPage([width, height]);
  page.drawImage(embedded, { x: 0, y: 0, width, height });

  const pdfBytes = await pdfDoc.save();
  downloadBlob(new Blob([pdfBytes], { type: "application/pdf" }), "snapdoc-single.pdf");
  setStatus("已匯出：單頁 PDF");
}

async function exportAllPdf() {
  if (pages.length === 0) return setStatus("沒有頁面可匯出");
  const { PDFDocument } = PDFLib;
  const pdfDoc = await PDFDocument.create();

  for (const p of pages) {
    const { blob, width, height } = await renderPageToPngBlobForExport(p);
    const bytes = await blob.arrayBuffer();
    const embedded = await pdfDoc.embedPng(bytes);

    const page = pdfDoc.addPage([width, height]);
    page.drawImage(embedded, { x: 0, y: 0, width, height });
  }

  const pdfBytes = await pdfDoc.save();
  downloadBlob(new Blob([pdfBytes], { type: "application/pdf" }), "snapdoc-multipage.pdf");
  setStatus("已匯出：多頁合併 PDF");
}

async function exportSinglePng() {
  if (pages.length === 0) return setStatus("沒有頁面可匯出");
  const p = pages[0];
  const { blob } = await renderPageToPngBlobForExport(p);
  downloadBlob(blob, "snapdoc-single.png");
  setStatus("已匯出：單頁 PNG");
}

function clearAll() {
  pages.forEach(p => { revokeIfObjectUrl(p.url); revokeIfObjectUrl(p.originalUrl); });
  pages = [];
  render();
  setStatus("已清空");
}

exportSinglePdfBtn.addEventListener("click", exportSinglePdf);
exportAllPdfBtn.addEventListener("click", exportAllPdf);
exportSinglePngBtn.addEventListener("click", exportSinglePng);
clearAllBtn.addEventListener("click", clearAll);

// ---------- PWA SW ----------
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js");
}

// =======================
// Perspective editor (Auto + Manual) using OpenCV.js
// =======================

// OpenCV runtime state
let cvReady = false;
function waitForCvReady() {
  return new Promise((resolve) => {
    const check = () => {
      if (window.cv && window.cv.Mat) {
        // cv may still be initializing; onRuntimeInitialized is reliable
        if (cvReady) return resolve(true);
      }
      setTimeout(check, 100);
    };
    check();
  });
}

// Hook onRuntimeInitialized once
(function initCvHook() {
  const timer = setInterval(() => {
    if (window.cv) {
      window.cv.onRuntimeInitialized = () => {
        cvReady = true;
        cvState.textContent = "OpenCV 已就緒";
      };
      clearInterval(timer);
    }
  }, 100);
})();

// Editor state
let editorImg = null;      // HTMLImageElement (original)
let displayScale = 1;      // canvas display scale
let dragIndex = -1;        // which point is dragging
let points = null;         // points in IMAGE pixel coords: [{x,y}*4]

// Helpers for points
function defaultRectPoints(imgW, imgH) {
  const padX = imgW * 0.06;
  const padY = imgH * 0.06;
  return [
    { x: padX, y: padY },               // TL
    { x: imgW - padX, y: padY },        // TR
    { x: imgW - padX, y: imgH - padY }, // BR
    { x: padX, y: imgH - padY }         // BL
  ];
}

function drawEditor() {
  if (!editorImg || !points) return;

  // Fit image into canvas width (device width friendly)
  const maxW = Math.min(900, window.innerWidth - 32);
  const ratio = editorImg.naturalWidth / editorImg.naturalHeight;
  const canvasW = Math.max(320, Math.floor(maxW));
  const canvasH = Math.floor(canvasW / ratio);

  editorCanvas.width = canvasW;
  editorCanvas.height = canvasH;

  displayScale = canvasW / editorImg.naturalWidth;

  // Clear and draw image
  ectx.clearRect(0, 0, canvasW, canvasH);
  ectx.drawImage(editorImg, 0, 0, canvasW, canvasH);

  // Draw polygon
  ectx.lineWidth = 3;
  ectx.strokeStyle = "rgba(0, 150, 255, 0.95)";
  ectx.beginPath();
  const p0 = toCanvas(points[0]);
  ectx.moveTo(p0.x, p0.y);
  for (let i = 1; i < 4; i++) {
    const pi = toCanvas(points[i]);
    ectx.lineTo(pi.x, pi.y);
  }
  ectx.closePath();
  ectx.stroke();

  // Draw handles
  for (let i = 0; i < 4; i++) {
    const p = toCanvas(points[i]);
    ectx.fillStyle = "rgba(255,255,255,0.95)";
    ectx.strokeStyle = "rgba(0, 150, 255, 0.95)";
    ectx.lineWidth = 3;
    ectx.beginPath();
    ectx.arc(p.x, p.y, 10, 0, Math.PI * 2);
    ectx.fill();
    ectx.stroke();
  }
}

function toCanvas(ptImg) {
  return { x: ptImg.x * displayScale, y: ptImg.y * displayScale };
}
function toImage(ptCanvas) {
  return { x: ptCanvas.x / displayScale, y: ptCanvas.y / displayScale };
}

function hitTestHandle(x, y) {
  // x,y in canvas coords
  for (let i = 0; i < 4; i++) {
    const p = toCanvas(points[i]);
    const dx = x - p.x;
    const dy = y - p.y;
    if (dx*dx + dy*dy <= 12*12) return i;
  }
  return -1;
}

function clampPoint(pt) {
  const w = editorImg.naturalWidth;
  const h = editorImg.naturalHeight;
  return {
    x: Math.max(0, Math.min(w, pt.x)),
    y: Math.max(0, Math.min(h, pt.y))
  };
}

// Mouse/touch handlers
function getCanvasXY(evt) {
  const rect = editorCanvas.getBoundingClientRect();
  let clientX, clientY;
  if (evt.touches && evt.touches[0]) {
    clientX = evt.touches[0].clientX;
    clientY = evt.touches[0].clientY;
  } else {
    clientX = evt.clientX;
    clientY = evt.clientY;
  }
  return { x: clientX - rect.left, y: clientY - rect.top };
}

editorCanvas.addEventListener("mousedown", (e) => {
  if (!points) return;
  const { x, y } = getCanvasXY(e);
  dragIndex = hitTestHandle(x, y);
});
editorCanvas.addEventListener("mousemove", (e) => {
  if (dragIndex < 0) return;
  const { x, y } = getCanvasXY(e);
  const imgPt = clampPoint(toImage({ x, y }));
  points[dragIndex] = imgPt;
  drawEditor();
});
window.addEventListener("mouseup", () => { dragIndex = -1; });

editorCanvas.addEventListener("touchstart", (e) => {
  if (!points) return;
  e.preventDefault();
  const { x, y } = getCanvasXY(e);
  dragIndex = hitTestHandle(x, y);
}, { passive: false });

editorCanvas.addEventListener("touchmove", (e) => {
  if (dragIndex < 0) return;
  e.preventDefault();
  const { x, y } = getCanvasXY(e);
  const imgPt = clampPoint(toImage({ x, y }));
  points[dragIndex] = imgPt;
  drawEditor();
}, { passive: false });

editorCanvas.addEventListener("touchend", () => { dragIndex = -1; });

// Start editor
async function startEditor(index, mode) {
  editingIndex = index;
  const p = pages[index];

  // Use original image for editing (to avoid re-warp stacking)
  editorImg = await blobToImage(p.originalUrl);

  // Init points
  points = p.points ? JSON.parse(JSON.stringify(p.points)) : defaultRectPoints(editorImg.naturalWidth, editorImg.naturalHeight);

  openModal();
  cvState.textContent = "OpenCV 載入中…（第一次會較久）";

  // Wait cv ready then proceed
  await waitForCvReady();

  if (mode === "auto") {
    await autoDetect();
  } else {
    drawEditor();
    setStatus(`第 ${index+1} 頁：手動拉直（拖曳四角）`);
  }
}

// Auto detect document edges (OpenCV)
function orderPoints(pts) {
  // pts: [{x,y}*4]
  // order TL, TR, BR, BL by sums and diffs
  const sum = pts.map(p => p.x + p.y);
  const diff = pts.map(p => p.x - p.y);

  const tl = pts[sum.indexOf(Math.min(...sum))];
  const br = pts[sum.indexOf(Math.max(...sum))];
  const tr = pts[diff.indexOf(Math.max(...diff))];
  const bl = pts[diff.indexOf(Math.min(...diff))];

  return [tl, tr, br, bl];
}

async function autoDetect() {
  if (!cvReady) return;

  // Load image into cv Mat
  const img = editorImg;
  const src = cv.imread(img); // RGBA
  const gray = new cv.Mat();
  cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

  const blur = new cv.Mat();
  cv.GaussianBlur(gray, blur, new cv.Size(5, 5), 0);

  const edges = new cv.Mat();
  cv.Canny(blur, edges, 75, 200);

  const contours = new cv.MatVector();
  const hierarchy = new cv.Mat();
  cv.findContours(edges, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);

  // Find best 4-point contour by area
  let best = null;
  let bestArea = 0;

  for (let i = 0; i < contours.size(); i++) {
    const cnt = contours.get(i);
    const area = cv.contourArea(cnt);
    if (area < bestArea) { cnt.delete(); continue; }

    const peri = cv.arcLength(cnt, true);
    const approx = new cv.Mat();
    cv.approxPolyDP(cnt, approx, 0.02 * peri, true);

    if (approx.rows === 4 && area > bestArea) {
      bestArea = area;
      best = approx.clone();
    }
    approx.delete();
    cnt.delete();
  }

  // Clean mats
  src.delete(); gray.delete(); blur.delete(); edges.delete(); contours.delete(); hierarchy.delete();

  if (!best) {
    // If no contour found, keep default rect
    points = defaultRectPoints(img.naturalWidth, img.naturalHeight);
    drawEditor();
    setStatus(`第 ${editingIndex+1} 頁：Auto 未抓到四邊，已切換為手動拉直`);
    return;
  }

  // Extract points from best Mat
  const pts = [];
  for (let r = 0; r < 4; r++) {
    const x = best.intAt(r, 0);
    const y = best.intAt(r, 1);
    pts.push({ x, y });
  }
  best.delete();

  points = orderPoints(pts);
  drawEditor();
  setStatus(`第 ${editingIndex+1} 頁：Auto 已抓邊（可拖曳微調）`);
}

// Apply warp perspective and replace current page blob/url
function distance(a, b) {
  const dx = a.x - b.x; const dy = a.y - b.y;
  return Math.sqrt(dx*dx + dy*dy);
}

async function applyPerspective() {
  if (editingIndex < 0) return;
  if (!cvReady) return;

  const p = pages[editingIndex];
  const img = await blobToImage(p.originalUrl);

  const ordered = orderPoints(points);

  // Compute output size
  const wA = distance(ordered[2], ordered[3]);
  const wB = distance(ordered[1], ordered[0]);
  const maxW = Math.max(wA, wB);

  const hA = distance(ordered[1], ordered[2]);
  const hB = distance(ordered[0], ordered[3]);
  const maxH = Math.max(hA, hB);

  const srcMat = cv.imread(img);
  const dstMat = new cv.Mat();

  const srcTri = cv.matFromArray(4, 1, cv.CV_32FC2, [
    ordered[0].x, ordered[0].y,
    ordered[1].x, ordered[1].y,
    ordered[2].x, ordered[2].y,
    ordered[3].x, ordered[3].y,
  ]);

  const dstTri = cv.matFromArray(4, 1, cv.CV_32FC2, [
    0, 0,
    maxW - 1, 0,
    maxW - 1, maxH - 1,
    0, maxH - 1,
  ]);

  const M = cv.getPerspectiveTransform(srcTri, dstTri);
  const dsize = new cv.Size(Math.floor(maxW), Math.floor(maxH));
  cv.warpPerspective(srcMat, dstMat, M, dsize, cv.INTER_LINEAR, cv.BORDER_REPLICATE);

  // Convert dstMat -> PNG blob
  const outCanvas = document.createElement("canvas");
  outCanvas.width = dstMat.cols;
  outCanvas.height = dstMat.rows;
  cv.imshow(outCanvas, dstMat);

  const outBlob = await new Promise((resolve) => outCanvas.toBlob(resolve, "image/jpeg", 0.92));

  // cleanup
  srcMat.delete(); dstMat.delete(); srcTri.delete(); dstTri.delete(); M.delete();

  // Replace current working image with corrected
  revokeIfObjectUrl(p.url);
  const newUrl = URL.createObjectURL(outBlob);

  p.blob = outBlob;
  p.url = newUrl;
  p.points = JSON.parse(JSON.stringify(points)); // store points for next manual tweak

  render();
  setStatus(`第 ${editingIndex+1} 頁：已套用拉直（透視校正）`);
  closeModal();
}

function resetToOriginal(index) {
  const p = pages[index];
  if (p.url !== p.originalUrl) revokeIfObjectUrl(p.url);
  p.blob = p.originalBlob;
  p.url = p.originalUrl;
  p.points = null;
  p.rotation = 0;
}

// Modal buttons
autoDetectBtn.addEventListener("click", async () => {
  if (editingIndex < 0) return;
  await autoDetect();
});

applyBtn.addEventListener("click", async () => {
  await applyPerspective();
});

resetBtn.addEventListener("click", () => {
  if (editingIndex < 0) return;
  resetToOriginal(editingIndex);
  render();
  setStatus(`第 ${editingIndex+1} 頁已重設回原圖`);
  closeModal();
});

closeBtn.addEventListener("click", () => {
  closeModal();
});

// Close modal by clicking outside panel
editorModal.addEventListener("click", (e) => {
  if (e.target === editorModal) closeModal();
});
