(() => {
  const wheelCanvas = document.getElementById('wheel');
  const fxCanvas = document.getElementById('fx');
  const spinBtn = document.getElementById('spinBtn');
  const statusEl = document.getElementById('status');
  const resultEl = document.getElementById('result');
  const resultValueEl = resultEl.querySelector('.result-value');
  const festoonEl = document.getElementById('festoon');

  if (!wheelCanvas || !fxCanvas || !spinBtn || !statusEl || !resultEl || !resultValueEl || !festoonEl) {
    return;
  }

  const wheelCtx = wheelCanvas.getContext('2d');
  const fxCtx = fxCanvas.getContext('2d');
  if (!wheelCtx || !fxCtx) return;

  // Values: 10..100 (inclusive) step 10
  const values = Array.from({ length: 10 }, (_, i) => (i + 1) * 10);

  // Log-weighted toward higher values.
  // weight(v) = ln(v + 1) - gives gently increasing weight.
  function pickLogWeighted(valuesList) {
    const weights = valuesList.map((v) => Math.log(v + 1));
    const total = weights.reduce((a, b) => a + b, 0);
    let r = Math.random() * total;
    for (let i = 0; i < weights.length; i++) {
      r -= weights[i];
      if (r <= 0) return { index: i, value: valuesList[i] };
    }
    return { index: valuesList.length - 1, value: valuesList[valuesList.length - 1] };
  }

  const colors = {
    bg: '#071a1a',
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
    startTime: 0,
    duration: 0,
    selectedIndex: 0,
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
      wheelCtx.font = '800 18px ui-sans-serif, system-ui, Segoe UI, Arial';
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

  function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
  }

  function normalizeAngle(a) {
    const two = Math.PI * 2;
    return ((a % two) + two) % two;
  }

  function rotationToLandOnIndex(index) {
    // Pointer is at top (angle -90deg), canvas rotation is clockwise.
    // For segment i centered at angle mid, we want mid + rotation = -PI/2.
    const segmentCount = values.length;
    const arc = (Math.PI * 2) / segmentCount;
    const mid = index * arc + arc / 2;
    const desired = -Math.PI / 2;

    // Compute minimal rotation that aligns, then add multiple full spins for drama.
    const current = normalizeAngle(wheel.rotation);
    const base = normalizeAngle(desired - mid);

    // choose a target that's ahead of current by adding k*2π.
    const spins = 7 + Math.floor(Math.random() * 4); // 7-10 full spins
    const ahead = base + spins * Math.PI * 2;

    // ensure monotonic increase from current
    const delta = ahead - current;
    return wheel.rotation + delta;
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
        ttl: 1.6 + Math.random() * 0.9,
        size: 1.4 + Math.random() * 2.4,
        color,
        drag: 0.985,
      });
    }
  }

  function sprinkleFestoon() {
    festoonEl.classList.add('on');
    window.setTimeout(() => festoonEl.classList.remove('on'), 2600);
  }

  function startFinale() {
    resizeFx();
    fx.running = true;
    fx.particles.length = 0;
    fx.lastT = performance.now();
    fx.endAt = fx.lastT + 2600;

    sprinkleFestoon();

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

    const picked = pickLogWeighted(values);
    wheel.selectedIndex = picked.index;

    setStatus('Spinning…');
    setResult(null);
    lockUI(true);

    wheel.spinning = true;
    wheel.startRotation = wheel.rotation;
    wheel.targetRotation = rotationToLandOnIndex(wheel.selectedIndex);
    wheel.startTime = performance.now();
    wheel.duration = 4600 + Math.random() * 800;

    requestAnimationFrame(tick);

    // Prepare result text (revealed at end)
    wheel._pendingValue = picked.value;
  }

  function tick(now) {
    const t = (now - wheel.startTime) / wheel.duration;
    const clamped = Math.max(0, Math.min(1, t));
    const eased = easeOutCubic(clamped);

    wheel.rotation = wheel.startRotation + (wheel.targetRotation - wheel.startRotation) * eased;
    drawWheel();

    if (clamped < 1) {
      requestAnimationFrame(tick);
      return;
    }

    wheel.spinning = false;
    wheel.rotation = wheel.targetRotation;
    drawWheel();

    const won = wheel._pendingValue;
    setResult(won);
    setStatus('Eid Mubarak! Enjoy your salami.');

    startFinale();

    window.setTimeout(() => {
      lockUI(false);
      setStatus('Want another spin?');
    }, 1200);
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

  // First paint after layout
  requestAnimationFrame(() => {
    redrawAll();
    setResult(null);
  });
})();
