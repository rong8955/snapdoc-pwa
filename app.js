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
  a.cl
