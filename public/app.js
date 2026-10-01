// Flow: start → aftellen → foto → filmpje (terwijl AI schildert) → schilderij.

const $ = (id) => document.getElementById(id);
const camera = $("camera");
const waitVideo = $("wait-video");
const statusEl = $("status");
const btnStart = $("btn-start");
let aiEnabled = false;

function show(screen) {
  document.querySelectorAll(".screen").forEach((s) => s.classList.toggle("active", s.id === `screen-${screen}`));
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function initCamera() {
  try {
    camera.srcObject = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 1280 } },
      audio: false,
    });
  } catch (e) {
    statusEl.textContent = "Geen toegang tot de camera (gebruik https en geef toestemming).";
    btnStart.disabled = true;
  }
}

async function countdown() {
  const el = $("countdown");
  el.classList.add("show");
  for (const n of [3, 2, 1]) {
    el.textContent = n;
    await sleep(900);
  }
  el.classList.remove("show");
  const flash = $("flash");
  flash.classList.remove("go");
  void flash.offsetWidth; // animatie herstarten
  flash.classList.add("go");
}

// Vierkante, gespiegelde uitsnede van de camera als JPEG data-URL.
function takePhoto(size = 1024) {
  const canvas = $("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  const { videoWidth: w, videoHeight: h } = camera;
  const s = Math.min(w, h);
  ctx.translate(size, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(camera, (w - s) / 2, (h - s) / 2, s, s, 0, 0, size, size);
  return canvas.toDataURL("image/jpeg", 0.92);
}

async function makePainting(photo) {
  if (aiEnabled) {
    try {
      const r = await fetch("/api/paint", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: photo }),
      });
      const data = await r.json();
      if (r.ok) return data.image;
      console.warn("AI mislukt, val terug op demo-filter:", data.error);
    } catch (e) {
      console.warn("AI mislukt, val terug op demo-filter:", e);
    }
  }
  return demoPaintFilter(photo);
}

// Speelt het filmpje één keer helemaal af; loopt door zolang het schilderij nog niet klaar is.
function playWaitVideo(paintingReady) {
  return new Promise((resolve) => {
    let ready = false;
    paintingReady.finally(() => (ready = true));
    waitVideo.currentTime = 0;
    waitVideo.onended = () => {
      if (ready) return resolve();
      waitVideo.currentTime = 0;
      waitVideo.play();
      paintingReady.finally(resolve);
    };
    // Filmpje kan niet afspelen → niet blijven hangen, gewoon op het schilderij wachten.
    const giveUp = (e) => {
      console.warn("Wachtfilmpje speelt niet af:", e);
      paintingReady.finally(resolve);
    };
    waitVideo.play().catch((e) => {
      if (e.name !== "NotAllowedError") return giveUp(e);
      // Autoplay met geluid geblokkeerd → dan maar zonder geluid.
      waitVideo.muted = true;
      waitVideo.play().catch(giveUp);
    });
  });
}

async function start() {
  btnStart.disabled = true;
  await countdown();
  const photo = takePhoto();
  await sleep(400);

  const painting = makePainting(photo);
  show("wait");
  await playWaitVideo(painting);
  waitVideo.pause();

  $("painting").src = await painting;
  show("result");
  btnStart.disabled = false;
}

btnStart.addEventListener("click", start);
$("btn-again").addEventListener("click", () => show("start"));

fetch("/api/config")
  .then((r) => r.json())
  .then((c) => (aiEnabled = c.ai))
  .catch(() => {});
initCamera();

// ---------------------------------------------------------------------------
// Demo-filter zonder AI: Kuwahara-filter (olieverf-effect) + extra verzadiging.
// ---------------------------------------------------------------------------
async function demoPaintFilter(dataUrl, size = 640, radius = 5) {
  const img = new Image();
  img.src = dataUrl;
  await img.decode();

  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0, size, size);
  const src = ctx.getImageData(0, 0, size, size).data;
  const out = ctx.createImageData(size, size);
  const W = size + 1;

  // Integraalbeelden voor som en kwadratensom per kanaal.
  const sum = [0, 1, 2].map(() => new Float64Array(W * W));
  const sq = new Float64Array(W * W);
  for (let y = 1; y <= size; y++) {
    for (let x = 1; x <= size; x++) {
      const i = ((y - 1) * size + (x - 1)) * 4;
      const k = y * W + x;
      let lum = 0;
      for (let c = 0; c < 3; c++) {
        const v = src[i + c];
        sum[c][k] = v + sum[c][k - 1] + sum[c][k - W] - sum[c][k - W - 1];
        lum += v;
      }
      lum /= 3;
      sq[k] = lum * lum + sq[k - 1] + sq[k - W] - sq[k - W - 1];
    }
  }
  const rect = (a, x0, y0, x1, y1) => a[y1 * W + x1] - a[y0 * W + x1] - a[y1 * W + x0] + a[y0 * W + x0];
  const clamp = (v) => Math.max(0, Math.min(size, v));

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let best = Infinity, br = 0, bg = 0, bb = 0;
      for (const [dx, dy] of [[-1, -1], [0, -1], [-1, 0], [0, 0]]) {
        const x0 = clamp(x + dx * radius), y0 = clamp(y + dy * radius);
        const x1 = clamp(x0 + radius + 1), y1 = clamp(y0 + radius + 1);
        const n = (x1 - x0) * (y1 - y0);
        const r = rect(sum[0], x0, y0, x1, y1) / n;
        const g = rect(sum[1], x0, y0, x1, y1) / n;
        const b = rect(sum[2], x0, y0, x1, y1) / n;
        const m = (r + g + b) / 3;
        const variance = rect(sq, x0, y0, x1, y1) / n - m * m;
        if (variance < best) { best = variance; br = r; bg = g; bb = b; }
      }
      // Verzadiging en wat warmte erbij.
      const m = (br + bg + bb) / 3;
      const i = (y * size + x) * 4;
      out.data[i] = m + (br - m) * 1.4 + 8;
      out.data[i + 1] = m + (bg - m) * 1.4 + 2;
      out.data[i + 2] = m + (bb - m) * 1.4 - 6;
      out.data[i + 3] = 255;
    }
  }
  ctx.putImageData(out, 0, 0);
  return canvas.toDataURL("image/jpeg", 0.92);
}
