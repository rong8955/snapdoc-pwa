const picker = document.getElementById("picker");
const gallery = document.getElementById("gallery");
const statusEl = document.getElementById("status");

const exportSinglePdfBtn = document.getElementById("exportSinglePdf");
const exportAllPdfBtn = document.getElementById("exportAllPdf");
const exportSinglePngBtn = document.getElementById("exportSinglePng");
const clearAllBtn = document.getElementById("clearAll");

let pages = []; // { name, blob, url, rotation }

function setStatus(msg) {
  statusEl.textContent = msg;
}

function render() {
  gallery.innerHTML = "";
  pages.forEach((p, idx) => {
    const div = document.createElement("div");
    div.className = "thumb";
    div.innerHTML = `
      <img src="${p.url}" alt="page ${idx+1}">
      <small>${idx+1}. ${p.name}</small>
      <div style="margin-top:6px; display:flex; gap:6px; flex-wrap:wrap;">
        <button data-rotl="${idx}">↺ 左轉</button>
        <button data-rotr="${idx}">↻ 右轉</button>
        <button data-del="${idx}">刪除</button>
      </div>
    `;
    gallery.appendChild(div);
  });

  gallery.querySelectorAll("button[data-del]").forEach(btn => {
    btn.addEventListener("click", () => {
      const i = Number(btn.dataset.del);
      URL.revokeObjectURL(pages[i].url);
      pages.splice(i, 1);
      render();
      setStatus(`剩餘 ${pages.length} 頁`);
    });
  });

  gallery.querySelectorAll("button[data-rotl]").forEach(btn => {
    btn.addEventListener("click", () => {
      const i = Number(btn.dataset.rotl);
      pages[i].rotation = ((pages[i].rotation ?? 0) - 90 + 360) % 360;
      render();
      setStatus(`第 ${i+1} 頁旋轉為 ${pages[i].rotation}°（匯出時生效）`);
    });
  });

  gallery.querySelectorAll("button[data-rotr]").forEach(btn => {
    btn.addEventListener("click", () => {
      const i = Number(btn.dataset.rotr);
      pages[i].rotation = ((pages[i].rotation ?? 0) + 90) % 360;
      render();
      setStatus(`第 ${i+1} 頁旋轉為 ${pages[i].rotation}°（匯出時生效）`);
    });
  });
}

async function blobToImage(blob) {
  const url = URL.createObjectURL(blob);
  const img = new Image();
  img.src = url;
  await img.decode();
  return { img, url };
}

async function readFiles(fileList) {
  const files = Array.from(fileList);
  for (const f of files) {
    const blob = f.slice(0, f.size, f.type);
    const { url } = await blobToImage(blob);
    pages.push({ name: f.name, blob, url, rotation: 0 });
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

async function renderPageToPngBlob(p) {
  const img = new Image();
  img.src = p.url;
  await img.decode();

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
  const { blob, width, height } = await renderPageToPngBlob(p);
  const bytes = await blob.arrayBuffer();
  const embedded = await pdfDoc.embedPng(bytes);

  const page = pdfDoc.addPage([width, height]);
  page.drawImage(embedded, { x: 0, y: 0, width, height });

  const pdfBytes = await pdfDoc.save();
  downloadBlob(new Blob([pdfBytes], { type: "application/pdf" }), "snapdoc-single.pdf");
  setStatus("已匯出：單頁 PDF（已套用旋轉）");
}

async function exportAllPdf() {
  if (pages.length === 0) return setStatus("沒有頁面可匯出");
  const { PDFDocument } = PDFLib;
  const pdfDoc = await PDFDocument.create();

  for (const p of pages) {
    const { blob, width, height } = await renderPageToPngBlob(p);
    const bytes = await blob.arrayBuffer();
    const embedded = await pdfDoc.embedPng(bytes);

    const page = pdfDoc.addPage([width, height]);
    page.drawImage(embedded, { x: 0, y: 0, width, height });
  }

  const pdfBytes = await pdfDoc.save();
  downloadBlob(new Blob([pdfBytes], { type: "application/pdf" }), "snapdoc-multipage.pdf");
  setStatus("已匯出：多頁合併 PDF（已套用旋轉）");
}

async function exportSinglePng() {
  if (pages.length === 0) return setStatus("沒有頁面可匯出");
  const p = pages[0];
  const { blob } = await renderPageToPngBlob(p);
  downloadBlob(blob, "snapdoc-single.png");
  setStatus("已匯出：單頁 PNG（已套用旋轉）");
}

function clearAll() {
  pages.forEach(p => URL.revokeObjectURL(p.url));
  pages = [];
  render();
  setStatus("已清空");
}

exportSinglePdfBtn.addEventListener("click", exportSinglePdf);
exportAllPdfBtn.addEventListener("click", exportAllPdf);
exportSinglePngBtn.addEventListener("click", exportSinglePng);
clearAllBtn.addEventListener("click", clearAll);

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js");
}
