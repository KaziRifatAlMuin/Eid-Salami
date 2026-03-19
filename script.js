(() => {
  const wheelCanvas = document.getElementById('wheel');
  const fxCanvas = document.getElementById('fx');
  const spinBtn = document.getElementById('spinBtn');
  const statusEl = document.getElementById('status');
  const resultEl = document.getElementById('result');
  const resultValueEl = resultEl.querySelector('.result-value');
  const festoonEl = document.getElementById('festoon');
  const modalEl = document.getElementById('modal');
  const modalAmountEl = document.getElementById('modalAmount');
  const closeModalBtn = document.getElementById('closeModal');
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

  // Values (same set, intentionally NOT in sorted order for the wheel layout)
  const values = [35, 12, 80, 23, 50, 10, 90, 15, 70, 26, 100, 20, 60, 45, 30, 40];

  // Target cumulative probabilities (CDF):
  // P(value <= 20) = 50%
  // P(value <= 30) = 90%
  // P(value <= 40) = 99%
  // P(value <= 50) = 99.9%
  // ...continuing with extra 9s for later ranges.
  const cdfTargets = [
    { max: 20, p: 0.5 },
    { max: 30, p: 0.9 },
    { max: 40, p: 0.99 },
    { max: 50, p: 0.999 },
    { max: 60, p: 0.9999 },
    { max: 70, p: 0.99999 },
    { max: 80, p: 0.999999 },
    { max: 90, p: 0.9999999 },
    { max: 100, p: 1 },
  ];

  function buildWeightsFromCdf(valuesList, cdfPoints) {
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
    return weights.map((w) => w / total);
  }

  const weights = buildWeightsFromCdf(values, cdfTargets);

  function pickWeighted(valuesList, weightsList) {
    const total = weightsList.reduce((a, b) => a + b, 0);
    let r = Math.random() * total;
    for (let i = 0; i < weightsList.length; i++) {
      r -= weightsList[i];
      if (r <= 0) return { index: i, value: valuesList[i] };
    }
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

  const wheel = {
    rotation: 0,
    spinning: false,
    targetRotation: 0,
    startRotation: 0,
    selectedIndex: 0,
    startTime: 0,
    duration: 0,
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

    wheelCtx.fillStyle = 'rgba(6,20,19,.95)';
    wheelCtx.font = '900 16px ui-sans-serif, system-ui, Segoe UI, Arial';
    wheelCtx.textAlign = 'center';
    wheelCtx.textBaseline = 'middle';
    wheelCtx.fillText('EID', 0, -9);
    wheelCtx.fillText('SALAMI', 0, 11);

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
    modalEl.hidden = false;
    // Focus for accessibility
    closeModalBtn.focus({ preventScroll: true });
  }

  function hideModal() {
    modalEl.hidden = true;
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
    // If the user provides an `eid.mp3` in the same folder, prefer that.
    // Otherwise fall back to an original, non-copyrighted WebAudio melody.
    // Requires a user gesture (the spin click provides that).
    try {
      const audio = new Audio('eid.mp3');
      audio.preload = 'auto';
      audio.volume = 0.75;
      const p = audio.play();
      if (p && typeof p.catch === 'function') {
        p.catch(() => {});
      }
      window.setTimeout(() => {
        audio.pause();
        audio.currentTime = 0;
      }, durationMs);
      return;
    } catch {
      // ignore and use WebAudio
    }

    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;

    try {
      const ctx = new AudioCtx();
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

      window.setTimeout(() => {
        ctx.close().catch(() => {});
      }, durationMs + 250);
    } catch {
      // Ignore audio failures.
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

    const picked = pickWeighted(values, weights);
    wheel.selectedIndex = picked.index;

    // Disable button for 30 seconds after spin starts
    spinBtn.disabled = true;
    setTimeout(() => {
      spinBtn.disabled = false;
    }, 30000);

    setStatus('Spinning…');
    setResult(null);
    lockUI(true);
    hideModal();

    wheel.spinning = true;
    wheel.startRotation = wheel.rotation;
    wheel.targetRotation = rotationToLandOnIndex(wheel.selectedIndex);

    // Time-based animation: spin duration is 6–7 seconds for smooth feel.
    wheel.startTime = performance.now();
    wheel.duration = 6200 + Math.random() * 800; // 6.2–7.0 seconds

    requestAnimationFrame(tickPhysics);

    // Prepare result text (revealed at end)
    wheel._pendingValue = picked.value;
  }

  function tickPhysics(now) {
    if (!wheel.spinning) return;

    const elapsed = (now - wheel.startTime) / wheel.duration;
    const t = Math.max(0, Math.min(1, elapsed));
    // Distance-aware easing so deceleration begins when the wheel is ~6–7 segments away
    const segmentCount = values.length;
    const arc = (Math.PI * 2) / segmentCount;
    const slowdownSegments = 6.5; // target slowdown span in segments

    const totalAngle = wheel.targetRotation - wheel.startRotation;
    let eased = 0;

    if (totalAngle <= 0) {
      eased = t; // fallback linear
    } else {
      const desiredRemaining = slowdownSegments * arc;
      const remainingFraction = Math.min(0.95, desiredRemaining / totalAngle);
      const switchAt = Math.max(0.05, 1 - remainingFraction);

      if (t < switchAt) {
        // Acceleration phase mapped to cover up to (1 - remainingFraction) of distance
        const a = t / switchAt;
        eased = Math.pow(a, 2) * (1 - remainingFraction);
      } else {
        // Deceleration phase: easeOutCubic across the final `remainingFraction` portion
        const late = (t - switchAt) / (1 - switchAt);
        const lateEased = 1 - Math.pow(1 - Math.max(0, Math.min(1, late)), 3);
        eased = (1 - remainingFraction) + lateEased * remainingFraction;
      }
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
    window.setTimeout(() => showModal(won), 2000);

    window.setTimeout(() => {
      lockUI(false);
      setStatus('Want another spin?');
    }, 900);
  }

  function redrawAll() {
    fitWheelCanvasToCSS();
    drawWheel();
    resizeFx();
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
})();
