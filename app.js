(() => {
  const canvas = document.getElementById('canvas');
  const ctx = canvas.getContext('2d');
  const hint = document.getElementById('hint');
  const modeBar = document.getElementById('mode-bar');

  let dpr = Math.max(1, window.devicePixelRatio || 1);

  function resize() {
    dpr = Math.max(1, window.devicePixelRatio || 1);
    canvas.width = Math.floor(window.innerWidth * dpr);
    canvas.height = Math.floor(window.innerHeight * dpr);
    canvas.style.width = window.innerWidth + 'px';
    canvas.style.height = window.innerHeight + 'px';
  }
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', resize);
  resize();

  // Vivid, distinct hues
  const COLORS = [
    '#FF5252', '#FFD740', '#69F0AE', '#40C4FF',
    '#E040FB', '#FF6E40', '#B388FF', '#7FFFD4',
    '#F06292', '#AED581',
  ];

  // Modes: 'one' (pick one winner), 'order' (rank all), 'teams' (split colors into 2 teams)
  let mode = 'one';

  // Rigged: in 'one' mode, the earliest finger placed always wins.
  // Flip to false to restore fair random selection.
  const CHEAT_FIRST_FINGER_WINS = true;

  // State
  // touches: identifier -> { x, y, color, joinedAt, rank?, team? }
  const touches = new Map();
  let usedColors = new Set();
  let pickTimer = null;
  const PICK_DELAY_MS = 2500;

  // Phase: 'collecting' (waiting for fingers + timer), 'picked' (winner selected; locked)
  let phase = 'collecting';
  let phaseStartedAt = 0;

  // Track of when the timer was last (re)started, for the countdown ring
  let timerStartedAt = 0;

  // Frozen snapshot of touches at pick time. Rendering in 'picked' phase reads
  // from this so the result persists even after every finger is lifted.
  let snapshot = null;

  function pickColor() {
    for (const c of COLORS) {
      if (!usedColors.has(c)) { usedColors.add(c); return c; }
    }
    return COLORS[touches.size % COLORS.length];
  }

  function releaseColor(c) { usedColors.delete(c); }

  function clearTimer() {
    if (pickTimer) { clearTimeout(pickTimer); pickTimer = null; }
    timerStartedAt = 0;
  }

  function maybeStartTimer() {
    clearTimer();
    if (phase !== 'collecting') return;
    if (touches.size < 2) return;
    timerStartedAt = performance.now();
    pickTimer = setTimeout(runPick, PICK_DELAY_MS);
  }

  function shuffled(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function runPick() {
    if (touches.size < 2) return;
    phase = 'picked';
    phaseStartedAt = performance.now();
    const ids = [...touches.keys()];

    if (mode === 'one') {
      let winnerId;
      if (CHEAT_FIRST_FINGER_WINS) {
        // Earliest joinedAt = first finger down
        winnerId = ids.reduce((best, id) =>
          touches.get(id).joinedAt < touches.get(best).joinedAt ? id : best
        );
      } else {
        winnerId = ids[Math.floor(Math.random() * ids.length)];
      }
      for (const id of ids) {
        touches.get(id).isWinner = id === winnerId;
      }
    } else if (mode === 'order') {
      const order = shuffled(ids);
      order.forEach((id, idx) => { touches.get(id).rank = idx + 1; });
    } else if (mode === 'teams') {
      // Split into two teams as evenly as possible. Random assignment.
      const order = shuffled(ids);
      const half = Math.ceil(order.length / 2);
      order.forEach((id, idx) => {
        touches.get(id).team = idx < half ? 0 : 1;
      });
    }

    // Freeze a copy for persistent display
    snapshot = [...touches.values()].map((t) => ({ ...t }));

    if (navigator.vibrate) {
      try { navigator.vibrate(mode === 'order' ? [80, 60, 80, 60, 120] : 220); } catch {}
    }
  }

  function resetAll() {
    touches.clear();
    usedColors.clear();
    clearTimer();
    phase = 'collecting';
    snapshot = null;
  }

  function setHint(text) {
    if (text === null) { hint.classList.add('hidden'); return; }
    hint.textContent = text;
    hint.classList.remove('hidden');
  }

  // ---- Touch handling -------------------------------------------------------

  function addTouches(list) {
    for (const t of list) {
      if (touches.has(t.identifier)) continue;
      touches.set(t.identifier, {
        x: t.clientX * dpr,
        y: t.clientY * dpr,
        color: pickColor(),
        joinedAt: performance.now(),
      });
    }
    maybeStartTimer();
  }

  function moveTouches(list) {
    for (const t of list) {
      const tt = touches.get(t.identifier);
      if (tt) { tt.x = t.clientX * dpr; tt.y = t.clientY * dpr; }
    }
  }

  function endTouches(list) {
    for (const t of list) {
      const tt = touches.get(t.identifier);
      if (tt) { releaseColor(tt.color); touches.delete(t.identifier); }
    }
    if (phase === 'picked') {
      // Stay locked on the snapshot regardless of which fingers lift.
      // New touches (touchstart) trigger the actual restart.
      return;
    }
    if (touches.size === 0) {
      resetAll();
    } else {
      maybeStartTimer();
    }
  }

  canvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    if (phase === 'picked') {
      // Restart cleanly using ALL currently-down fingers, not just the new one
      resetAll();
      addTouches(e.touches);
    } else {
      addTouches(e.changedTouches);
    }
  }, { passive: false });

  canvas.addEventListener('touchmove', (e) => {
    e.preventDefault();
    moveTouches(e.changedTouches);
  }, { passive: false });

  canvas.addEventListener('touchend', (e) => {
    e.preventDefault();
    endTouches(e.changedTouches);
  }, { passive: false });

  canvas.addEventListener('touchcancel', (e) => {
    e.preventDefault();
    endTouches(e.changedTouches);
  }, { passive: false });

  // Mouse fallback for desktop testing (single "finger" only)
  let mouseId = null;
  canvas.addEventListener('mousedown', (e) => {
    mouseId = `mouse-${Date.now()}`;
    addTouches([{ identifier: mouseId, clientX: e.clientX, clientY: e.clientY }]);
  });
  canvas.addEventListener('mousemove', (e) => {
    if (mouseId === null) return;
    moveTouches([{ identifier: mouseId, clientX: e.clientX, clientY: e.clientY }]);
  });
  canvas.addEventListener('mouseup', () => {
    if (mouseId === null) return;
    endTouches([{ identifier: mouseId }]);
    mouseId = null;
  });

  // Mode buttons
  modeBar.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    mode = btn.dataset.mode;
    for (const b of modeBar.querySelectorAll('button')) {
      b.classList.toggle('active', b === btn);
    }
    resetAll();
  });

  // Prevent iOS bounce, double-tap zoom, gestures on body
  document.addEventListener('gesturestart', (e) => e.preventDefault());
  document.addEventListener('touchmove', (e) => {
    if (e.target === canvas) e.preventDefault();
  }, { passive: false });

  // ---- Rendering ------------------------------------------------------------

  const TEAM_COLORS = ['#40C4FF', '#FF5252'];

  function drawRing(x, y, radius, color, lineWidth, alpha = 1) {
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  function drawArc(x, y, radius, color, lineWidth, startA, endA, alpha = 1) {
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(x, y, radius, startA, endA);
    ctx.stroke();
    ctx.lineCap = 'butt';
    ctx.globalAlpha = 1;
  }

  function drawDot(x, y, radius, color, alpha = 1) {
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  function drawDisk(x, y, radius, color, alpha = 1) {
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  function drawText(text, x, y, color, sizePx, weight = 700, alpha = 1) {
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.font = `${weight} ${sizePx}px -apple-system, BlinkMacSystemFont, system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x, y);
    ctx.globalAlpha = 1;
  }

  function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }

  function render() {
    // Clear
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const now = performance.now();
    const baseRadius = 56 * dpr;
    const ringWidth = 6 * dpr;
    const dotRadius = 9 * dpr;

    // Hint visibility
    if (touches.size === 0 && phase === 'collecting') {
      setHint('Place 2+ fingers to begin');
    } else if (touches.size === 1 && phase === 'collecting') {
      setHint('Add another finger…');
    } else {
      setHint(null);
    }

    // -- Collecting phase --
    if (phase === 'collecting') {
      const ringActive = touches.size >= 2 && timerStartedAt > 0;
      const elapsed = ringActive ? (now - timerStartedAt) : 0;
      const progress = Math.min(1, elapsed / PICK_DELAY_MS);

      for (const [, t] of touches) {
        // Spawn pop-in
        const age = (now - t.joinedAt) / 220;
        const pop = age < 1 ? easeOutCubic(age) : 1;
        const r = baseRadius * pop;

        drawRing(t.x, t.y, r, t.color, ringWidth, 0.85);
        drawDot(t.x, t.y, dotRadius * pop, t.color, 0.95);

        // Countdown arc when timer running
        if (ringActive) {
          const startA = -Math.PI / 2;
          const endA = startA + Math.PI * 2 * progress;
          drawArc(t.x, t.y, r + ringWidth + 4 * dpr, t.color, 4 * dpr, startA, endA, 1);
        }
      }
      requestAnimationFrame(render);
      return;
    }

    // -- Picked phase -- (renders from `snapshot`, not live touches)
    const sincePick = now - phaseStartedAt;
    const items = snapshot || [];

    if (mode === 'one') {
      const winner = items.find((t) => t.isWinner);
      const maxDim = Math.hypot(canvas.width, canvas.height);
      const EXPAND_MS = 850;
      const expandT = Math.min(1, sincePick / EXPAND_MS);
      const e = easeOutCubic(expandT);

      // Losers fade fast, drawn under the growing disk
      const fadeT = Math.min(1, sincePick / 280);
      for (const t of items) {
        if (t.isWinner) continue;
        const a = (1 - fadeT) * 0.85;
        if (a > 0.01) {
          drawRing(t.x, t.y, baseRadius, t.color, ringWidth, a);
          drawDot(t.x, t.y, dotRadius, t.color, a);
        }
      }

      // Filled disk grows from winner's finger to cover the screen
      if (winner) {
        const r = baseRadius + e * maxDim * 1.05;
        drawDisk(winner.x, winner.y, r, winner.color, 1);

        // Once the screen is covered, show the persistent marker
        if (expandT >= 0.92) {
          const settleT = Math.min(1, (expandT - 0.92) / 0.08);
          const elapsedAfter = Math.max(0, sincePick - EXPAND_MS);
          const pulse = (Math.sin(elapsedAfter / 380) + 1) / 2;

          // White dot at winner's finger position, ringed by a pulsing halo
          const dotR = (16 + pulse * 4) * dpr;
          const haloR = (44 + pulse * 14) * dpr;
          const outerR = (78 + pulse * 22) * dpr;

          drawRing(winner.x, winner.y, outerR, '#ffffff', 2 * dpr, 0.35 * (1 - pulse * 0.5) * settleT);
          drawRing(winner.x, winner.y, haloR, '#ffffff', 5 * dpr, 0.9 * settleT);
          drawDot(winner.x, winner.y, dotR, '#ffffff', settleT);

          // Bottom hint
          drawText(
            'Tap anywhere to play again',
            canvas.width / 2,
            canvas.height - 56 * dpr,
            '#ffffff',
            16 * dpr,
            600,
            0.85 * settleT
          );
        }
      }
    } else if (mode === 'order') {
      const STAGGER = 140;
      for (const t of items) {
        const showAt = (t.rank - 1) * STAGGER;
        if (sincePick < showAt) continue;
        const localT = Math.min(1, (sincePick - showAt) / 280);
        const e = easeOutCubic(localT);
        const r = baseRadius * (0.6 + 0.4 * e);
        drawRing(t.x, t.y, r, t.color, ringWidth, 1);
        drawDot(t.x, t.y, dotRadius, t.color, 1);
        drawText(String(t.rank), t.x, t.y - r - 22 * dpr, '#fff', 28 * dpr, 800, e);
      }
      // Settle hint after all numbers shown
      const settleAt = items.length * STAGGER + 320;
      if (sincePick > settleAt) {
        const a = Math.min(1, (sincePick - settleAt) / 400) * 0.7;
        drawText(
          'Tap anywhere to play again',
          canvas.width / 2,
          canvas.height - 56 * dpr,
          '#ffffff',
          16 * dpr,
          600,
          a
        );
      }
    } else if (mode === 'teams') {
      const fadeT = Math.min(1, sincePick / 500);
      for (const t of items) {
        const target = TEAM_COLORS[t.team];
        const originalAlpha = 1 - fadeT;
        const teamAlpha = fadeT;
        drawRing(t.x, t.y, baseRadius, t.color, ringWidth, originalAlpha);
        drawRing(t.x, t.y, baseRadius, target, ringWidth + 2 * dpr, teamAlpha);
        drawDot(t.x, t.y, dotRadius, target, teamAlpha);
        drawDot(t.x, t.y, dotRadius, t.color, originalAlpha);
      }
      if (sincePick > 700) {
        const a = Math.min(1, (sincePick - 700) / 400) * 0.7;
        drawText(
          'Tap anywhere to play again',
          canvas.width / 2,
          canvas.height - 56 * dpr,
          '#ffffff',
          16 * dpr,
          600,
          a
        );
      }
    }

    requestAnimationFrame(render);
  }

  requestAnimationFrame(render);
})();
