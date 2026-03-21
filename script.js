(() => {
  const wheelCanvas = document.getElementById('wheel');
  const fxCanvas = document.getElementById('fx');
  const spinBtn = document.getElementById('spinBtn');
  const cooldownCanvas = document.getElementById('cooldownCanvas');
  const cooldownSecondsEl = document.getElementById('cooldownSeconds');
  const statusEl = document.getElementById('status');
  const resultEl = document.getElementById('result');
  const resultValueEl = resultEl.querySelector('.result-value');
  const festoonEl = document.getElementById('festoon');
  const modalEl = document.getElementById('modal');
  const modalAmountEl = document.getElementById('modalAmount');
  const closeModalBtn = document.getElementById('closeModal');
  const sendScreenshotBtn = document.getElementById('sendScreenshotBtn');
  const downloadShotLink = document.getElementById('downloadShot');
  const spinAgainBtn = document.getElementById('spinAgain');

  if (
    !wheelCanvas ||
    !fxCanvas ||
    !spinBtn ||
    !statusEl ||
    !resultEl ||
    !resultValueEl ||
    !festoonEl ||
    !modalEl ||
    !modalAmountEl ||
    !closeModalBtn
  ) {
    return;
  }

  const wheelCtx = wheelCanvas.getContext('2d');
  const fxCtx = fxCanvas.getContext('2d');
  if (!wheelCtx || !fxCtx) return;

  // Values (user-provided set, intentionally NOT in sorted order for the wheel layout)
  const values = [35, 10, 80, 25, 60, 12, 70, 17, 100, 27, 45, 20, 50, 30, 40, 23, 90, 15];

  // Probability Distribution (CDF) — updated targets
  // ======================================================
  // Requested pattern:
  // - P(value ≤ 15) = 90%    (0.9)
  // - P(value ≤ 20) = 99%    (0.99)
  // - P(value ≤ 25) = 99.9%  (0.999)
  // - and so on: each +5 increases the number of 9s by one until capped at 1
  const cdfTargets = [
    { max: 15, p: 0.90 },
    { max: 20, p: 0.99 },
    { max: 25, p: 0.999 },
    { max: 30, p: 0.9999 },
    { max: 35, p: 0.99999 },
    { max: 40, p: 0.999999 },
    { max: 50, p: 0.9999999 },
    { max: 60, p: 0.99999999 },
    { max: 70, p: 0.999999999 },
    { max: 80, p: 0.9999999999 },
    { max: 90, p: 0.99999999999 },
    { max: 100, p: 1 },
  ];

  function buildWeightsFromCdf(valuesList, cdfPoints) {
    // Build per-value probabilities from cumulative distribution targets.
    // For each CDF target, we identify which values fall in that range and
    // distribute the probability equally among them. Result: individual
    // weights that respect the CDF curve and make higher values rarer.
    const weights = new Array(valuesList.length).fill(0);
    let prevP = 0;
    let prevMax = -Infinity;

    for (const point of cdfPoints) {
      const bucketProb = Math.max(0, Math.min(1, point.p) - prevP);
      const bucketIdx = [];
      for (let i = 0; i < valuesList.length; i++) {
        const v = valuesList[i];
        if (v > prevMax && v <= point.max) bucketIdx.push(i);
      }

      if (bucketIdx.length > 0 && bucketProb > 0) {
        const each = bucketProb / bucketIdx.length;
        for (const i of bucketIdx) weights[i] += each;
      }

      prevP = Math.max(prevP, Math.min(1, point.p));
      prevMax = point.max;
    }

    // Normalize (floating-point safety)
    const total = weights.reduce((a, b) => a + b, 0);
    if (total <= 0) {
      // Fallback to uniform if misconfigured.
      return weights.map(() => 1 / weights.length);
    }
    // Each value now has a probability proportional to its position in the CDF.
    // Lower values (e.g., 10–30) get ~8% each. Higher values (e.g., 60–100) get <0.1%.
    return weights.map((w) => w / total);
  }

  const weights = buildWeightsFromCdf(values, cdfTargets);

  function pickWeighted(valuesList, weightsList) {
    // Pick an index according to the provided weights (CDF-derived).
    // This preserves the probability distribution: higher values with smaller
    // weights are rarer. We compute a cumulative sum and select by a single
    // uniform random in [0, total).
    const total = weightsList.reduce((s, w) => s + w, 0);
    if (total <= 0) {
      // Fallback to uniform if weights are invalid
      const idx = Math.floor(Math.random() * valuesList.length);
      return { index: idx, value: valuesList[idx] };
    }

    let r = Math.random() * total;
    for (let i = 0; i < weightsList.length; i++) {
      r -= weightsList[i];
      if (r <= 0) return { index: i, value: valuesList[i] };
    }
    // Numerical safety: return last
    return { index: valuesList.length - 1, value: valuesList[valuesList.length - 1] };
  }

  const colors = {
    bg: '#0a0720',
    ink: 'rgba(232,255,247,.95)',
    muted: 'rgba(232,255,247,.65)',
    gold: '#f6d77f',
    teal: '#26f3d2',
    pink: '#ff5f87',
  };

  // Center salami image for the wheel medallion. If `salami.png` is present
  // it will be drawn in the wheel center; otherwise the existing text is used.
  let salamiImg = new Image();
  let salamiImgLoaded = false;
  salamiImg.onload = () => { salamiImgLoaded = true; redrawAll(); };
  salamiImg.onerror = () => { salamiImgLoaded = false; };
  salamiImg.src = 'salami.png';

  // Shared AudioContext (created/resumed on first user gesture) to avoid autoplay restrictions
  let sharedAudioCtx = null;
  let backgroundAudio = null;
  let backgroundLooping = false;
  function initAudioContext() {
    if (sharedAudioCtx) return;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    try {
      sharedAudioCtx = new AudioCtx();
      if (sharedAudioCtx.state === 'suspended') {
        sharedAudioCtx.resume().catch(() => {});
      }
      // Start background music loop when audio becomes available
      try { playEidMusic(); } catch (e) {}
    } catch (e) {
      sharedAudioCtx = null;
    }
  }

  // Attempt to unlock the audio system by resuming and briefly playing a silent buffer.
  function unlockAudio() {
    if (!sharedAudioCtx) return;
    if (sharedAudioCtx.state === 'suspended') {
      sharedAudioCtx.resume().catch(() => {});
    }

    try {
      const ctx = sharedAudioCtx;
      const g = ctx.createGain();
      g.gain.value = 0.0001; // effectively silent but will unlock
      g.connect(ctx.destination);
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = 220;
      o.connect(g);
      o.start();
      o.stop(ctx.currentTime + 0.03);
      // disconnect after short while
      window.setTimeout(() => {
        try { o.disconnect(); g.disconnect(); } catch (e) {}
      }, 120);
    } catch (e) {
      // ignore
    }
  }

  const wheel = {
    rotation: 0,
    spinning: false,
    targetRotation: 0,
    startRotation: 0,
    selectedIndex: 0,
    startTime: 0,
    duration: 0,
    decelDuration: 0,
    fastDuration: 0,
  };

  function resizeFx() {
    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    fxCanvas.width = Math.floor(window.innerWidth * dpr);
    fxCanvas.height = Math.floor(window.innerHeight * dpr);
    fxCanvas.style.width = `${window.innerWidth}px`;
    fxCanvas.style.height = `${window.innerHeight}px`;
    fxCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function fitWheelCanvasToCSS() {
    // Keep wheel canvas crisp on HiDPI while respecting its CSS size.
    const rect = wheelCanvas.getBoundingClientRect();
    const size = Math.floor(Math.min(rect.width, rect.height));
    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    const px = Math.max(260, size);
    wheelCanvas.width = Math.floor(px * dpr);
    wheelCanvas.height = Math.floor(px * dpr);
    wheelCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function drawWheel() {
    const rect = wheelCanvas.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;
    const cx = w / 2;
    const cy = h / 2;
    const r = Math.min(w, h) * 0.46;

    wheelCtx.clearRect(0, 0, w, h);

    // Outer glow
    wheelCtx.save();
    wheelCtx.translate(cx, cy);
    wheelCtx.beginPath();
    wheelCtx.arc(0, 0, r * 1.05, 0, Math.PI * 2);
    wheelCtx.fillStyle = 'rgba(246,215,127,.08)';
    wheelCtx.fill();
    wheelCtx.restore();

    wheelCtx.save();
    wheelCtx.translate(cx, cy);
    wheelCtx.rotate(wheel.rotation);

    const segmentCount = values.length;
    const arc = (Math.PI * 2) / segmentCount;

    const labelFontSize = segmentCount > 12 ? 14 : 18;

    for (let i = 0; i < segmentCount; i++) {
      const start = i * arc;
      const end = start + arc;

      // alternating palette with subtle gradients
      const isAlt = i % 2 === 0;
      const fillA = isAlt ? 'rgba(38,243,210,.18)' : 'rgba(246,215,127,.18)';
      const fillB = isAlt ? 'rgba(38,243,210,.06)' : 'rgba(246,215,127,.06)';

      const grad = wheelCtx.createRadialGradient(0, 0, r * 0.05, 0, 0, r);
      grad.addColorStop(0, fillA);
      grad.addColorStop(1, fillB);

      wheelCtx.beginPath();
      wheelCtx.moveTo(0, 0);
      wheelCtx.arc(0, 0, r, start, end);
      wheelCtx.closePath();
      wheelCtx.fillStyle = grad;
      wheelCtx.fill();

      // segment divider
      wheelCtx.strokeStyle = 'rgba(232,255,247,.14)';
      wheelCtx.lineWidth = 1;
      wheelCtx.stroke();

      // label
      const mid = (start + end) / 2;
      wheelCtx.save();
      wheelCtx.rotate(mid);
      wheelCtx.translate(r * 0.70, 0);
      wheelCtx.rotate(Math.PI / 2);
      wheelCtx.fillStyle = colors.ink;
      wheelCtx.font = `800 ${labelFontSize}px ui-sans-serif, system-ui, Segoe UI, Arial`;
      wheelCtx.textAlign = 'center';
      wheelCtx.textBaseline = 'middle';
      wheelCtx.fillText(`৳${values[i]}`, 0, 0);
      wheelCtx.restore();

      // tiny star ornament near edge
      wheelCtx.save();
      wheelCtx.rotate(mid);
      wheelCtx.translate(r * 0.93, 0);
      drawStar(wheelCtx, 0, 0, 5, 2.4, 5, isAlt ? 'rgba(246,215,127,.8)' : 'rgba(38,243,210,.8)');
      wheelCtx.restore();
    }

    // center medallion
    wheelCtx.beginPath();
    wheelCtx.arc(0, 0, r * 0.22, 0, Math.PI * 2);
    const centerGrad = wheelCtx.createRadialGradient(0, 0, 1, 0, 0, r * 0.22);
    centerGrad.addColorStop(0, 'rgba(255,255,255,.28)');
    centerGrad.addColorStop(1, 'rgba(246,215,127,.22)');
    wheelCtx.fillStyle = centerGrad;
    wheelCtx.fill();
    wheelCtx.strokeStyle = 'rgba(246,215,127,.32)';
    wheelCtx.lineWidth = 2;
    wheelCtx.stroke();

    // Pulsing halo/glow behind center image (makes medallion more lively)
    if (salamiImgLoaded) {
      try {
        const t = (Date.now() % 1200) / 1200; // 0..1
        const alpha = 0.18 + 0.12 * Math.sin(t * Math.PI * 2);
        const halo = wheelCtx.createRadialGradient(0, 0, r * 0.22, 0, 0, r * 0.9);
        halo.addColorStop(0, `rgba(246,215,127,${alpha.toFixed(3)})`);
        halo.addColorStop(1, 'rgba(246,215,127,0)');
        wheelCtx.save();
        wheelCtx.globalCompositeOperation = 'lighter';
        wheelCtx.globalAlpha = 1;
        wheelCtx.beginPath();
        wheelCtx.arc(0, 0, r * 0.9, 0, Math.PI * 2);
        wheelCtx.fillStyle = halo;
        wheelCtx.fill();
        wheelCtx.restore();
      } catch (e) {}
    }

    // Draw center medallion content: prefer the salami image if available,
    // otherwise fall back to textual label.
    if (salamiImgLoaded) {
      try {
        const imgW = r * 0.9 * 0.9; // size relative to medallion radius
        const imgH = imgW * (salamiImg.height / Math.max(1, salamiImg.width));
        wheelCtx.drawImage(salamiImg, -imgW / 2, -imgH / 2 - 4, imgW, imgH);
      } catch (e) {
        // fallback to text on any drawing error
        wheelCtx.fillStyle = 'rgba(6,20,19,.95)';
        wheelCtx.font = '900 16px ui-sans-serif, system-ui, Segoe UI, Arial';
        wheelCtx.textAlign = 'center';
        wheelCtx.textBaseline = 'middle';
        wheelCtx.fillText('EID', 0, -9);
        wheelCtx.fillText('SALAMI', 0, 11);
      }
    } else {
      wheelCtx.fillStyle = 'rgba(6,20,19,.95)';
      wheelCtx.font = '900 16px ui-sans-serif, system-ui, Segoe UI, Arial';
      wheelCtx.textAlign = 'center';
      wheelCtx.textBaseline = 'middle';
      wheelCtx.fillText('EID', 0, -9);
      wheelCtx.fillText('SALAMI', 0, 11);
    }

    wheelCtx.restore();

    // subtle inner vignette
    wheelCtx.save();
    wheelCtx.translate(cx, cy);
    const vign = wheelCtx.createRadialGradient(0, 0, r * 0.5, 0, 0, r * 1.02);
    vign.addColorStop(0, 'rgba(0,0,0,0)');
    vign.addColorStop(1, 'rgba(0,0,0,.30)');
    wheelCtx.fillStyle = vign;
    wheelCtx.beginPath();
    wheelCtx.arc(0, 0, r, 0, Math.PI * 2);
    wheelCtx.fill();
    wheelCtx.restore();
  }

  function drawStar(ctx, x, y, spikes, outerRadius, innerRadius, fillStyle) {
    let rot = (Math.PI / 2) * 3;
    let cx = x;
    let cy = y;
    const step = Math.PI / spikes;

    ctx.beginPath();
    ctx.moveTo(cx, cy - outerRadius);
    for (let i = 0; i < spikes; i++) {
      ctx.lineTo(cx + Math.cos(rot) * outerRadius, cy + Math.sin(rot) * outerRadius);
      rot += step;
      ctx.lineTo(cx + Math.cos(rot) * innerRadius, cy + Math.sin(rot) * innerRadius);
      rot += step;
    }
    ctx.lineTo(cx, cy - outerRadius);
    ctx.closePath();
    ctx.fillStyle = fillStyle;
    ctx.fill();
  }

  function showModal(amount) {
    modalAmountEl.textContent = `৳${amount}`;
    // Reveal modal
    modalEl.hidden = false;

    // Spectacular salami image reveal (if available)
    try {
      const img = document.getElementById('salamiImg');
      if (img) {
        img.hidden = false;
        img.classList.remove('pop');
        // Force reflow to restart animation
        void img.offsetWidth;
        img.classList.add('pop');
        // add shine class to wrapper to animate overlay
        const wrap = img.closest('.salami-wrap');
        if (wrap) {
          wrap.classList.remove('shine');
          void wrap.offsetWidth;
          wrap.classList.add('shine');
          // also add a subtle ongoing shiny pulse
          img.classList.add('shiny');
        }
      }
    } catch (e) {}

    // Small visual finale when the modal appears
    try { startFinale(3000); } catch (e) {}

    // Focus for accessibility
    closeModalBtn.focus({ preventScroll: true });
  }

  // Compose a spectacular share image, trigger download, then open FB profile.
  async function composeAndSendScreenshot() {
    try {
      // composition size (1200x630 for shareable preview)
      const W = 1200, H = 630;
      const off = document.createElement('canvas');
      off.width = W; off.height = H;
      const ctx = off.getContext('2d');

      // background gradient
      const bg = ctx.createLinearGradient(0, 0, W, H);
      bg.addColorStop(0, '#0a0720');
      bg.addColorStop(1, '#120b36');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);

      // subtle radial glow
      const rg = ctx.createRadialGradient(W * 0.15, H * 0.18, 10, W * 0.15, H * 0.18, W * 0.9);
      rg.addColorStop(0, 'rgba(246,215,127,0.12)');
      rg.addColorStop(1, 'rgba(246,215,127,0)');
      ctx.fillStyle = rg; ctx.fillRect(0,0,W,H);

      // draw wheel snapshot (center-left)
      const rect = wheelCanvas.getBoundingClientRect();
      const tempW = Math.min(W * 0.56, rect.width);
      const tempH = tempW;
      // draw wheel canvas scaled
      ctx.save();
      ctx.translate(W * 0.12, H * 0.5 - tempH/2);
      try { ctx.drawImage(wheelCanvas, 0, 0, wheelCanvas.width, wheelCanvas.height, 0, 0, tempW, tempH); } catch (e) {}
      ctx.restore();

      // Draw salami image if loaded (center-right)
      if (salamiImgLoaded) {
        const imgW = Math.min(260, W * 0.28);
        const imgH = imgW * (salamiImg.height / Math.max(1, salamiImg.width));
        ctx.save();
        ctx.translate(W * 0.72 - imgW/2, H * 0.34 - imgH/2);
        try { ctx.drawImage(salamiImg, 0, 0, salamiImg.width, salamiImg.height, 0, 0, imgW, imgH); } catch(e) {}
        ctx.restore();
      }

      // Big uppercase instruction (centered, spectacular)
      ctx.save();
      ctx.fillStyle = 'rgba(255,255,255,0.98)';
      ctx.textAlign = 'center';
      ctx.font = '900 28px ui-sans-serif, system-ui, Segoe UI, Arial';
      ctx.shadowColor = 'rgba(0,0,0,0.6)';
      ctx.shadowBlur = 18;
      const instr = 'TAKE A SCREENSHOT AND SEND THIS TO YOUR RIFAT VAIYA TO GET YOUR EID SALAMI';
      // wrap text
      const maxW = W * 0.64;
      const lines = [];
      const words = instr.split(' ');
      let line = '';
      for (const w of words) {
        const test = (line ? line + ' ' : '') + w;
        const m = ctx.measureText(test).width;
        if (m > maxW && line) { lines.push(line); line = w; } else { line = test; }
      }
      if (line) lines.push(line);
      const startY = H * 0.68 - (lines.length-1) * 26;
      ctx.fillStyle = 'white';
      for (let i=0;i<lines.length;i++) {
        ctx.fillText(lines[i], W * 0.62, startY + i * 42);
      }
      ctx.restore();

      // Add modal amount box
      ctx.save();
      ctx.fillStyle = 'rgba(6,20,19,0.88)';
      const boxW = 300, boxH = 96;
      const bx = W * 0.72 - boxW/2, by = H * 0.86 - boxH/2 - 20;
      roundRect(ctx, bx, by, boxW, boxH, 14);
      ctx.fill();
      ctx.fillStyle = '#ffd28a';
      ctx.font = '900 36px ui-sans-serif, system-ui, Segoe UI, Arial';
      ctx.textAlign = 'center';
      ctx.fillText(modalAmountEl.textContent || '৳—', bx + boxW/2, by + boxH/2 + 12);
      ctx.restore();

      // Open the Facebook profile in a new tab for the user to share
      const fb = 'https://www.facebook.com/rifatalmuin21';
      window.open(fb, '_blank');
      // small visual confirmation
      try { sprinkleFestoon(2400); startFinale(2400); } catch(e){}
    } catch (e) {
      console.error('screenshot failed', e);
      alert('Unable to create screenshot automatically. The wheel image will download and the Facebook profile will open — please upload manually.');
      const fb = 'https://www.facebook.com/rifatalmuin21';
      window.open(fb, '_blank');
    }
  }

  function hideModal() {
    modalEl.hidden = true;
    try {
      const img = document.getElementById('salamiImg');
      if (img) {
        img.hidden = true;
        img.classList.remove('pop', 'shiny');
        const wrap = img.closest('.salami-wrap');
        if (wrap) wrap.classList.remove('shine');
      }
    } catch (e) {}
  }

  function rotationToLandOnIndex(index) {
    // Calculate the exact rotation so segment `index` center aligns with the pointer (top).
    // The pointer is at angle -π/2 (top). We want the center of segment `index` to align there.
    
    const segmentCount = values.length;
    const arc = (Math.PI * 2) / segmentCount;
    const segmentCenterAngle = index * arc + arc / 2;
    const pointerAngle = -Math.PI / 2; // Pointer at top
    
    // Base rotation needed to align the segment with the pointer.
    let targetRotation = pointerAngle - segmentCenterAngle;
    
    // Normalize to [0, 2π) range.
    while (targetRotation < 0) {
      targetRotation += Math.PI * 2;
    }
    
    // Ensure the target is always AHEAD of the current rotation (no backwards spin).
    while (targetRotation <= wheel.rotation) {
      targetRotation += Math.PI * 2;
    }
    
    // Add 6–9 full spins for visual drama.
    const spinCount = 6 + Math.floor(Math.random() * 4);
    targetRotation += spinCount * Math.PI * 2;
    
    // Add small jitter within the segment for natural feel.
    const jitter = (Math.random() - 0.5) * arc * 0.3;
    
    return targetRotation + jitter;
  }

  function setStatus(text) {
    statusEl.textContent = text;
  }

  function setResult(value) {
    resultValueEl.textContent = value ? `৳${value}` : '—';
  }

  function lockUI(locked) {
    spinBtn.disabled = locked;
  }

  function playEidMusic(durationMs = 6500) {
    // Start or ensure a continuous looping background track `romjan.m4a` is playing.
    // This is idempotent and safe to call multiple times. If file playback is
    // blocked or missing, a soft WebAudio ambient loop will be used instead.
    function doWebAudio() {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;

      try {
        const ctx = sharedAudioCtx || new AudioCtx();
        if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
        const master = ctx.createGain();
        master.gain.value = 0.18;
        master.connect(ctx.destination);

        const now = ctx.currentTime;
        const endT = now + durationMs / 1000;

        // Hijaz-ish flavor (approx): A, Bb, C#, D, E, F, G, A
        const scale = [440, 466.16, 554.37, 587.33, 659.25, 698.46, 783.99, 880];
        const seq = [0, 1, 2, 3, 2, 1, 0, 4, 3, 2, 3, 4, 6, 7, 6, 4, 3, 2, 1, 0];

        function note(t0, freq, dur, type, gain) {
          const osc = ctx.createOscillator();
          const g = ctx.createGain();
          osc.type = type;
          osc.frequency.setValueAtTime(freq, t0);
          g.gain.setValueAtTime(0.0001, t0);
          g.gain.exponentialRampToValueAtTime(gain, t0 + 0.02);
          g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
          osc.connect(g);
          g.connect(master);
          osc.start(t0);
          osc.stop(t0 + dur + 0.03);
        }

        // Light click percussion via short noise bursts.
        const noiseBuf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 1.0), ctx.sampleRate);
        const data = noiseBuf.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * 0.2;

        function click(t0) {
          const src = ctx.createBufferSource();
          const g = ctx.createGain();
          src.buffer = noiseBuf;
          g.gain.setValueAtTime(0.0001, t0);
          g.gain.exponentialRampToValueAtTime(0.12, t0 + 0.01);
          g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.08);
          src.connect(g);
          g.connect(master);
          src.start(t0);
          src.stop(t0 + 0.1);
        }

        let t = now + 0.02;
        const step = 0.15;
        let i = 0;
        while (t < endT - 0.25) {
          const f = scale[seq[i % seq.length]];
          note(t, f, 0.13, 'triangle', 0.75);
          // gentle drone/harmony
          if (i % 3 === 0) note(t, scale[0] / 2, 0.22, 'sine', 0.18);
          // occasional ornament
          if (i % 7 === 0) note(t + 0.06, f * 1.01, 0.08, 'sine', 0.22);
          // subtle percussion
          if (i % 2 === 0) click(t + 0.02);
          t += step;
          i++;
        }

        // Close only if we created a private context; if using sharedAudioCtx, keep it open.
        if (ctx !== sharedAudioCtx) {
          window.setTimeout(() => {
            try { ctx.close().catch(() => {}); } catch (e) {}
          }, durationMs + 250);
        }
      } catch {
        // Ignore audio failures.
      }
    }

    if (backgroundLooping) return; // already running

    // Try to start a looping HTMLAudio using romjan first.
    try {
      const candidate = 'romjan.m4a';
      const a = new Audio(candidate);
      a.loop = true;
      a.preload = 'auto';
      a.volume = 0.5;
      const p = a.play();
      if (p && typeof p.then === 'function') {
        p.then(() => {
          backgroundAudio = a;
          backgroundLooping = true;
        }).catch(() => {
          // fallback to WebAudio
          doWebAudio();
        });
      } else {
        backgroundAudio = a;
        backgroundLooping = true;
      }
      return;
    } catch (e) {
      // fallthrough
    }

    doWebAudio();
  }

  // Play a drum track once per spin. Tries drum.m4a / drum.mp3 then falls back to a
  // short WebAudio percussion sequence matching the spin duration (6s).
  function playDrumOnce() {
    // If we have a backgroundAudio that is muted or not available, still attempt drum.
    const candidates = ['drum.m4a', 'drum.mp3'];
    for (const src of candidates) {
      try {
        const a = new Audio(src);
        a.preload = 'auto';
        a.volume = 0.9;
        const p = a.play();
        if (p && typeof p.catch === 'function') {
          p.catch(() => {
            // continue to next candidate or fallback below
          });
        }
        // We attempt to play the first candidate and return immediately; if it fails
        // the catch above will not throw but we still consider the attempt made.
        return;
      } catch (e) {
        // try next
      }
    }

    // Fallback: synthesize a drum pattern for 6.4s (match spin duration)
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    try {
      const ctx = sharedAudioCtx || new AudioCtx();
      if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
      const master = ctx.createGain();
      master.gain.value = 0.6;
      master.connect(ctx.destination);

      const now = ctx.currentTime + 0.02;
      const duration = 6.4; // 6.4 seconds (match spin duration)

      function kick(t) {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = 'sine';
        o.frequency.setValueAtTime(120, t);
        o.frequency.exponentialRampToValueAtTime(50, t + 0.25);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(1.0, t + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
        o.connect(g);
        g.connect(master);
        o.start(t);
        o.stop(t + 0.45);
      }

      function snare(t) {
        const buf = ctx.createBuffer(1, ctx.sampleRate * 0.2, ctx.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * Math.exp(-i / 2000);
        const src = ctx.createBufferSource();
        const g = ctx.createGain();
        src.buffer = buf;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.9, t + 0.005);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
        src.connect(g);
        g.connect(master);
        src.start(t);
        src.stop(t + 0.2);
      }

      // Simple pattern: 4/4 kick on beats, snare on 2 and 4, small fills.
      const step = 0.25;
      const ticks = Math.ceil(duration / step);
      for (let i = 0; i < ticks; i++) {
        const t = now + i * step;
        if (i % 4 === 0) kick(t);
        if (i % 4 === 2) snare(t + 0.01);
        if (i % 8 === 7) snare(t + 0.12);
      }

      if (ctx !== sharedAudioCtx) {
        window.setTimeout(() => {
          try { ctx.close().catch(() => {}); } catch (e) {}
        }, duration * 1000 + 300);
      }
    } catch (e) {
      // ignore
    }
  }

  // Fireworks / particles
  const fx = {
    running: false,
    particles: [],
    lastT: 0,
    endAt: 0,
  };

  function burst(x, y, color) {
    const count = 80 + Math.floor(Math.random() * 50);
    for (let i = 0; i < count; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = 90 + Math.random() * 260;
      fx.particles.push({
        x,
        y,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd,
        life: 0,
        ttl: 1.1 + Math.random() * 0.7,
        size: 1.4 + Math.random() * 2.4,
        color,
        drag: 0.985,
      });
    }
  }

  function sprinkleFestoon(durationMs) {
    festoonEl.classList.add('on');
    window.setTimeout(() => festoonEl.classList.remove('on'), durationMs);
  }

  function startFinale(durationMs = 6500) {
    resizeFx();
    fx.running = true;
    fx.particles.length = 0;
    fx.lastT = performance.now();
    fx.endAt = fx.lastT + durationMs;

    sprinkleFestoon(Math.min(durationMs, 6500));

    // initial bursts
    const w = window.innerWidth;
    const h = window.innerHeight;
    for (let i = 0; i < 4; i++) {
      const x = w * (0.2 + 0.6 * Math.random());
      const y = h * (0.18 + 0.25 * Math.random());
      const c = i % 3 === 0 ? colors.gold : i % 3 === 1 ? colors.teal : colors.pink;
      burst(x, y, c);
    }

      requestAnimationFrame(fxTick);
      // Play fireworks sound effect alongside visuals
      playFireworks(durationMs);
  }

    function playFireworks(durationMs = 6500) {
      // Try audio file fallback first
      // If we don't have a shared AudioContext, try the audio file fallback first.
      if (!sharedAudioCtx) {
        try {
          const a = new Audio('fireworks.mp3');
          a.preload = 'auto';
          a.volume = 0.7;
          const p = a.play();
          if (p && typeof p.catch === 'function') p.catch(() => {});
          // stop after duration
          window.setTimeout(() => {
            try { a.pause(); a.currentTime = 0; } catch (e) {}
          }, durationMs);
          return;
        } catch (e) {
          // fall back to WebAudio
        }
      }

      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;

      try {
        const ctx = sharedAudioCtx || new AudioCtx();
        if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
        const master = ctx.createGain();
        master.gain.value = 0.18;
        master.connect(ctx.destination);

        // create a short noise buffer for pops
        const noiseBuf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 1.0), ctx.sampleRate);
        const data = noiseBuf.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * 0.6;

        function pop(t0, vol = 0.6) {
          const src = ctx.createBufferSource();
          src.buffer = noiseBuf;
          const bp = ctx.createBiquadFilter();
          bp.type = 'bandpass';
          bp.frequency.setValueAtTime(1200 + Math.random() * 2800, t0);
          bp.Q.value = 0.8 + Math.random() * 3.0;
          const g = ctx.createGain();
          g.gain.setValueAtTime(0.0001, t0);
          g.gain.exponentialRampToValueAtTime(vol, t0 + 0.01);
          g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.35 + Math.random() * 0.15);
          src.connect(bp);
          bp.connect(g);
          g.connect(master);
          src.start(t0);
          src.stop(t0 + 0.5 + Math.random() * 0.2);
        }

        function boom(t0, vol = 0.8) {
          const osc = ctx.createOscillator();
          const g = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(60 + Math.random() * 40, t0);
          g.gain.setValueAtTime(0.0001, t0);
          g.gain.exponentialRampToValueAtTime(vol, t0 + 0.02);
          g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.6 + Math.random() * 0.6);
          const lp = ctx.createBiquadFilter();
          lp.type = 'lowpass';
          lp.frequency.setValueAtTime(400 + Math.random() * 600, t0);
          osc.connect(lp);
          lp.connect(g);
          g.connect(master);
          osc.start(t0);
          osc.stop(t0 + 1.4 + Math.random() * 0.6);
        }

        const now = ctx.currentTime + 0.02;
        const endT = now + durationMs / 1000;
        let t = now;
        while (t < endT) {
          // schedule a small cluster
          const clusterCount = 1 + Math.floor(Math.random() * 3);
          for (let i = 0; i < clusterCount; i++) {
            const dt = Math.random() * 0.5;
            pop(t + dt, 0.3 + Math.random() * 0.9);
          }
          // occasional boom
          if (Math.random() < 0.33) boom(t + 0.06, 0.5 + Math.random() * 0.9);
          t += 0.35 + Math.random() * 0.7;
        }

        // close only if we created a private context
        if (ctx !== sharedAudioCtx) {
          window.setTimeout(() => {
            try { ctx.close().catch(() => {}); } catch (e) {}
          }, durationMs + 500);
        }
      } catch (e) {
        // fail gracefully
      }
    }

  function fxTick(t) {
    if (!fx.running) return;

    const dt = Math.min(0.033, (t - fx.lastT) / 1000);
    fx.lastT = t;

    const w = window.innerWidth;
    const h = window.innerHeight;

    fxCtx.clearRect(0, 0, w, h);

    // occasional bursts while active
    if (t < fx.endAt && Math.random() < 0.08) {
      const x = w * (0.18 + 0.64 * Math.random());
      const y = h * (0.12 + 0.35 * Math.random());
      const pick = Math.random();
      const c = pick < 0.4 ? colors.gold : pick < 0.75 ? colors.teal : colors.pink;
      burst(x, y, c);
    }

    // draw a faint crescent glow
    drawCrescentGlow(w, h);

    // update particles
    const gravity = 260;
    fx.particles = fx.particles.filter((p) => {
      p.life += dt;
      p.vx *= p.drag;
      p.vy *= p.drag;
      p.vy += gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;

      const alpha = 1 - p.life / p.ttl;
      if (alpha <= 0) return false;

      fxCtx.save();
      fxCtx.globalAlpha = Math.max(0, Math.min(1, alpha));
      fxCtx.fillStyle = p.color;
      fxCtx.beginPath();
      fxCtx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      fxCtx.fill();
      fxCtx.restore();
      return true;
    });

    if (t >= fx.endAt && fx.particles.length === 0) {
      fx.running = false;
      fxCtx.clearRect(0, 0, w, h);
      return;
    }

    requestAnimationFrame(fxTick);
  }

  function drawCrescentGlow(w, h) {
    const x = w * 0.86;
    const y = h * 0.18;
    const r = Math.min(w, h) * 0.07;

    fxCtx.save();
    fxCtx.globalAlpha = 0.18;
    const glow = fxCtx.createRadialGradient(x, y, r * 0.2, x, y, r * 2.3);
    glow.addColorStop(0, 'rgba(246,215,127,.40)');
    glow.addColorStop(1, 'rgba(246,215,127,0)');
    fxCtx.fillStyle = glow;
    fxCtx.beginPath();
    fxCtx.arc(x, y, r * 2.2, 0, Math.PI * 2);
    fxCtx.fill();

    // crescent
    fxCtx.globalAlpha = 0.32;
    fxCtx.fillStyle = 'rgba(246,215,127,.8)';
    fxCtx.beginPath();
    fxCtx.arc(x, y, r, 0, Math.PI * 2);
    fxCtx.arc(x + r * 0.35, y - r * 0.1, r * 0.85, 0, Math.PI * 2, true);
    fxCtx.fill('evenodd');
    fxCtx.restore();
  }

  function spin() {
    if (wheel.spinning) return;

    // Ensure an AudioContext exists / is resumed (must be called during user gesture)
    initAudioContext();
    unlockAudio();

    const picked = pickWeighted(values, weights);
    wheel.selectedIndex = picked.index;

    // Start a 20s cooldown visual + lock UI
    startCooldown(20000);

    setStatus('Spinning…');
    setResult(null);
    lockUI(true);
    hideModal();

    wheel.spinning = true;
    wheel.startRotation = wheel.rotation;
    wheel.targetRotation = rotationToLandOnIndex(wheel.selectedIndex);

    // Fixed spin duration: exactly 6400ms per user request.
    wheel.duration = 6400;
    // Keep a deceleration window ~2.5s (so negative acceleration is felt).
    wheel.decelDuration = 2500;
    wheel.fastDuration = Math.max(0, wheel.duration - wheel.decelDuration);
    wheel.startTime = performance.now();

    // Play the drum track once for this spin.
    try { playDrumOnce(); } catch (e) {}

    requestAnimationFrame(tickPhysics);

    // Prepare result text (revealed at end)
    wheel._pendingValue = picked.value;
  }

  function tickPhysics(now) {
    if (!wheel.spinning) return;
    const elapsedMs = now - wheel.startTime;
    const total = wheel.duration;
    const t = Math.max(0, Math.min(1, elapsedMs / total));

    const totalAngle = wheel.targetRotation - wheel.startRotation;
    let eased = 0;

    // Phase split: [0 .. switchAt) => fast phase (ease-in); [switchAt .. 1] => controlled deceleration
    const switchAt = wheel.fastDuration / total;
    function easeInQuad(x) { return x * x; }
    function easeOutCubic(x) { return 1 - Math.pow(1 - x, 3); }

    if (elapsedMs <= wheel.fastDuration) {
      const local = Math.max(0, Math.min(1, elapsedMs / wheel.fastDuration));
      // Use ease-in to build speed
      eased = easeInQuad(local) * switchAt; // cover the switchAt fraction of distance
    } else {
      const lateMs = elapsedMs - wheel.fastDuration;
      const lateT = Math.max(0, Math.min(1, lateMs / wheel.decelDuration));
      // eased portion covered before deceleration
      const before = switchAt;
      // decel eased from before .. 1
      const decelEased = easeOutCubic(lateT);
      eased = before + decelEased * (1 - before);
    }

    wheel.rotation = wheel.startRotation + totalAngle * eased;
    drawWheel();

    if (t >= 1) {
      finishSpin();
      return;
    }

    requestAnimationFrame(tickPhysics);
  }

  function finishSpin() {
    wheel.spinning = false;
    wheel.rotation = wheel.targetRotation;
    drawWheel();

    const won = wheel._pendingValue;
    setResult(won);
    setStatus('Eid Mubarak! Enjoy your salami.');

    // Instant celebration (fireworks + music), then popup after 2 seconds.
    // Both fireworks and music stop within ~6–7 seconds.
    startFinale(6500);
    playEidMusic(6500);
    window.setTimeout(() => showModal(won), 1000);

    window.setTimeout(() => {
      // Only re-enable if there is no active cooldown running.
      const now = performance.now();
      if (!cooldownEnd || now >= cooldownEnd) {
        lockUI(false);
        setStatus('Want another spin?');
      } else {
        // Keep disabled until cooldownTick clears it; update status to reflect remaining time
        setStatus('Cooldown active — please wait');
      }
    }, 900);
  }

  function redrawAll() {
    fitWheelCanvasToCSS();
    drawWheel();
    resizeFx();
  }

  // Cooldown visualization
  let cooldownRAF = null;
  let cooldownEnd = 0;
  let cooldownDuration = 0;
  const cooldownCtx = cooldownCanvas ? cooldownCanvas.getContext('2d') : null;

  function startCooldown(durationMs) {
    spinBtn.disabled = true;
    cooldownDuration = durationMs;
    cooldownEnd = performance.now() + durationMs;

    if (cooldownCanvas && cooldownCtx) {
      const rect = cooldownCanvas.getBoundingClientRect();
      const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
      cooldownCanvas.width = Math.floor(rect.width * dpr);
      cooldownCanvas.height = Math.floor(rect.height * dpr);
      cooldownCanvas.style.width = `${rect.width}px`;
      cooldownCanvas.style.height = `${rect.height}px`;
      cooldownCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    if (cooldownRAF) cancelAnimationFrame(cooldownRAF);
    cooldownRAF = requestAnimationFrame(cooldownTick);
  }

  function cooldownTick(now) {
    const tNow = now || performance.now();
    const remaining = Math.max(0, cooldownEnd - tNow);
    const frac = Math.max(0, Math.min(1, remaining / cooldownDuration));

    if (cooldownCtx && cooldownCanvas) {
      const w = cooldownCanvas.width / (window.devicePixelRatio || 1);
      const h = cooldownCanvas.height / (window.devicePixelRatio || 1);
      const ctx = cooldownCtx;
      ctx.clearRect(0, 0, w, h);

      const pad = 6;
      const barW = Math.max(24, w - pad * 2);
      const barH = Math.max(8, h - pad * 2);
      const x = pad;
      const y = (h - barH) / 2;
      const radius = barH / 2;

      // background track
      ctx.beginPath();
      roundRect(ctx, x, y, barW, barH, radius);
      ctx.fillStyle = 'rgba(232,255,247,.06)';
      ctx.fill();

      // progress (remaining)
      const fillW = Math.max(0, barW * frac);
      if (fillW > 0) {
        ctx.beginPath();
        roundRect(ctx, x, y, fillW, barH, radius);
        const grad = ctx.createLinearGradient(x, y, x + barW, y);
        grad.addColorStop(0, 'rgba(246,215,127,0.98)');
        grad.addColorStop(1, 'rgba(38,243,210,0.98)');
        ctx.fillStyle = grad;
        ctx.fill();
      }
    }

    if (cooldownSecondsEl) cooldownSecondsEl.textContent = String(Math.ceil(remaining / 1000));

    if (remaining <= 0) {
      spinBtn.disabled = false;
      if (cooldownCtx && cooldownCanvas) cooldownCtx.clearRect(0, 0, cooldownCanvas.width, cooldownCanvas.height);
      if (cooldownSecondsEl) cooldownSecondsEl.textContent = '0';
      cooldownRAF = null;
      return;
    }

    cooldownRAF = requestAnimationFrame(cooldownTick);
  }

  function roundRect(ctx, x, y, w, h, r) {
    const radius = Math.min(r, h / 2, w / 2);
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
  }

  // init
  window.addEventListener('resize', () => {
    redrawAll();
  });

  spinBtn.addEventListener('click', spin);
  spinBtn.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') spin();
  });

  closeModalBtn.addEventListener('click', () => {
    hideModal();
    spinBtn.focus({ preventScroll: true });
  });

  // If a spin-again control exists, wire it up; otherwise modal shows only top-close.
  if (spinAgainBtn) {
    spinAgainBtn.addEventListener('click', () => {
      hideModal();
      if (!wheel.spinning && !spinBtn.disabled) spin();
    });
  }

  if (sendScreenshotBtn) {
    sendScreenshotBtn.addEventListener('click', () => {
      // ensure modal amount is visible and compose image
      composeAndSendScreenshot();
    });
  }

  modalEl.addEventListener('click', (e) => {
    const target = e.target;
    if (target && target.dataset && target.dataset.close === 'true') {
      hideModal();
      spinBtn.focus({ preventScroll: true });
    }
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !modalEl.hidden) {
      hideModal();
      spinBtn.focus({ preventScroll: true });
    }
  });

  // First paint after layout
  requestAnimationFrame(() => {
    redrawAll();
    setResult(null);
  });

  // Try to start background music at launch. This attempts to play `romjan.m4a` immediately;
  // browsers may block autoplay until a user gesture, but we'll make a best-effort attempt.
  try { playEidMusic(); } catch (e) {}
})();
