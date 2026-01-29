const picker = document.getElementById("picker");
const gallery = document.getElementById("gallery");
const statusEl = document.getElementById("status");

const exportSinglePdfBtn = document.getElementById("exportSinglePdf");
const exportAllPdfBtn = document.getElementById("exportAllPdf");
const exportSinglePngBtn = document.getElementById("exportSinglePng");
const clearAllBtn = document.getElementById("clearAll");

let pages = []; // { name, blob, url, width, height }

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
      <button data-del="${idx}" style="margin-top:6px;">刪除</button>
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
    const { img, url } = await blobToImage(blob);
    pages.push({ name: f.name, blob, url, width: img.naturalWidth, height: img.naturalHeight });
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

async function exportSinglePdf() {
  if (pages.length === 0) return setStatus("沒有頁面可匯出");
  const { PDFDocument } = PDFLib;
  const pdfDoc = await PDFDocument.create();

  // 目前固定取第 1 頁（你後續要做頁面選取很容易）
  const p = pages[0];
  const bytes = await p.blob.arrayBuffer();

  const isPng = p.blob.type === "image/png";
  const embedded = isPng ? await pdfDoc.embedPng(bytes) : await pdfDoc.embedJpg(bytes);

  const page = pdfDoc.addPage([embedded.width, embedded.height]);
  page.drawImage(embedded, { x: 0, y: 0, width: embedded.width, height: embedded.height });

  const pdfBytes = await pdfDoc.save();
  downloadBlob(new Blob([pdfBytes], { type: "application/pdf" }), "snapdoc-single.pdf");
  setStatus("已匯出：單頁 PDF");
}

async function exportAllPdf() {
  if (pages.length === 0) return setStatus("沒有頁面可匯出");
  const { PDFDocument } = PDFLib;
  const pdfDoc = await PDFDocument.create();

  for (const p of pages) {
    const bytes = await p.blob.arrayBuffer();
    const isPng = p.blob.type === "image/png";
    const embedded = isPng ? await pdfDoc.embedPng(bytes) : await pdfDoc.embedJpg(bytes);

    const page = pdfDoc.addPage([embedded.width, embedded.height]);
    page.drawImage(embedded, { x: 0, y: 0, width: embedded.width, height: embedded.height });
  }

  const pdfBytes = await pdfDoc.save();
  downloadBlob(new Blob([pdfBytes], { type: "application/pdf" }), "snapdoc-multipage.pdf");
  setStatus("已匯出：多頁合併 PDF");
}

async function exportSinglePng() {
  if (pages.length === 0) return setStatus("沒有頁面可匯出");
  const p = pages[0];

  // 若原圖非 PNG，仍可直接下載原 blob；這裡統一輸出 PNG：用 canvas 轉檔
  const img = new Image();
  img.src = p.url;
  await img.decode();

  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0);

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png", 1.0));
  downloadBlob(blob, "snapdoc-single.png");
  setStatus("已匯出：單頁 PNG");
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

// PWA：註冊 Service Worker
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js");
}
