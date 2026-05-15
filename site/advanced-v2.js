(() => {
  const root = document.documentElement;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function setPointer(x, y) {
    root.style.setProperty('--mx', `${x}px`);
    root.style.setProperty('--my', `${y}px`);
  }

  setPointer(window.innerWidth * 0.5, window.innerHeight * 0.18);
  window.addEventListener('pointermove', (event) => setPointer(event.clientX, event.clientY), { passive: true });

  const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        revealObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });
  document.querySelectorAll('[data-reveal]').forEach((element) => revealObserver.observe(element));

  document.querySelectorAll('.hero-lab, .terminal-card, .bento-card, .stage-screen, .dashboard-shell, .final-cta').forEach((card) => {
    card.addEventListener('pointermove', (event) => {
      const rect = card.getBoundingClientRect();
      card.style.setProperty('--card-x', `${event.clientX - rect.left}px`);
      card.style.setProperty('--card-y', `${event.clientY - rect.top}px`);
    });
  });

  const labLines = Array.from(document.querySelectorAll('.lab-line'));
  const labButton = document.getElementById('labButton');
  let labIndex = 0;

  function tickLab(forceRestart = false) {
    if (!labLines.length) return;
    if (forceRestart) labIndex = 0;
    labLines.forEach((line, index) => line.classList.toggle('is-active', index === labIndex));
    labIndex = (labIndex + 1) % labLines.length;
  }

  tickLab(true);
  if (!reduceMotion) setInterval(tickLab, 1100);
  labButton?.addEventListener('click', () => {
    tickLab(true);
    labButton.textContent = 'Route generated';
    setTimeout(() => { labButton.textContent = 'Generate 402 route'; }, 1400);
  });

  const flowSteps = [
    {
      step: '01',
      title: 'Request hits a protected route',
      text: 'The agent calls a paid API endpoint without needing a subscription, account, or shared API key.',
      code: ['<b>$</b> curl https://api.yourapp.com/signals', '<b>&gt;</b> route protected by Meterflow', '<b>&gt;</b> payment required before response']
    },
    {
      step: '02',
      title: 'Meterflow returns a 402 quote',
      text: 'The provider declares price, asset, route metadata, and policy requirements before serving value.',
      code: ['<b>&gt;</b> 402 Payment Required', '<b>&gt;</b> quote: 0.004 USDC', '<b>&gt;</b> route: /signals/edge-score']
    },
    {
      step: '03',
      title: 'Budget vault checks the agent',
      text: 'The agent wallet can only pay if the route is allowed and the spend cap has not been exceeded.',
      code: ['<b>&gt;</b> wallet: ag_7c2', '<b>&gt;</b> daily cap: $8.04 / $12.00', '<b>&gt;</b> allowlist: pass']
    },
    {
      step: '04',
      title: 'Payment is verified',
      text: 'Meterflow verifies the payment context and connects it to the request that created the quote.',
      code: ['<b>&gt;</b> USDC payment: confirmed', '<b>&gt;</b> signature: verified', '<b>&gt;</b> provider revenue: attributed']
    },
    {
      step: '05',
      title: 'Response unlocks with a receipt',
      text: 'The API response is returned and both sides keep an auditable receipt for usage, revenue, and debugging.',
      code: ['<b>&gt;</b> response: unlocked', '<b>&gt;</b> receipt: rcpt_41bd', '<b>&gt;</b> status: complete']
    }
  ];

  const stage = document.getElementById('flowStage');
  const progress = document.getElementById('stageProgress');
  const stageStep = document.getElementById('stageStep');
  const stageTitle = document.getElementById('stageTitle');
  const stageText = document.getElementById('stageText');
  const stageCode = document.getElementById('stageCode');
  const pipeDots = Array.from(document.querySelectorAll('.pipe-dot'));
  let activeStep = -1;

  function updateStage(index) {
    if (index === activeStep || !flowSteps[index]) return;
    activeStep = index;
    const data = flowSteps[index];
    stageStep.textContent = data.step;
    stageTitle.textContent = data.title;
    stageText.textContent = data.text;
    stageCode.innerHTML = data.code.map((line) => `<div>${line}</div>`).join('');
    if (progress) progress.style.width = `${((index + 1) / flowSteps.length) * 100}%`;
    pipeDots.forEach((dot, dotIndex) => dot.classList.toggle('is-active', dotIndex <= index));
  }

  function syncScrollStage() {
    if (!stage) return;
    const rect = stage.getBoundingClientRect();
    const viewport = window.innerHeight;
    const raw = (viewport * 0.72 - rect.top) / Math.max(rect.height, viewport * 0.8);
    const clamped = Math.max(0, Math.min(0.999, raw));
    updateStage(Math.min(flowSteps.length - 1, Math.floor(clamped * flowSteps.length)));
  }

  window.addEventListener('scroll', syncScrollStage, { passive: true });
  window.addEventListener('resize', syncScrollStage);
  syncScrollStage();

  const canvas = document.getElementById('flowCanvas');
  const ctx = canvas?.getContext('2d');
  if (!ctx || reduceMotion) return;

  let width = 0;
  let height = 0;
  let dpr = 1;
  const nodes = [];
  const packets = [];

  function resizeCanvas() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    nodes.length = 0;
    const count = width < 720 ? 22 : 48;
    for (let i = 0; i < count; i += 1) {
      nodes.push({ x: Math.random() * width, y: Math.random() * height, vx: (Math.random() - 0.5) * 0.12, vy: (Math.random() - 0.5) * 0.12, r: Math.random() * 1.6 + 0.7 });
    }
    packets.length = 0;
    for (let i = 0; i < 7; i += 1) {
      packets.push({ from: Math.floor(Math.random() * count), to: Math.floor(Math.random() * count), t: Math.random(), speed: 0.0018 + Math.random() * 0.0024 });
    }
  }

  function draw() {
    ctx.clearRect(0, 0, width, height);
    for (const node of nodes) {
      node.x += node.vx;
      node.y += node.vy;
      if (node.x < -20) node.x = width + 20;
      if (node.x > width + 20) node.x = -20;
      if (node.y < -20) node.y = height + 20;
      if (node.y > height + 20) node.y = -20;
    }
    for (let i = 0; i < nodes.length; i += 1) {
      for (let j = i + 1; j < nodes.length; j += 1) {
        const a = nodes[i];
        const b = nodes[j];
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 170) {
          ctx.strokeStyle = `rgba(125,247,255,${(1 - dist / 170) * 0.13})`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }
    }
    for (const node of nodes) {
      ctx.fillStyle = 'rgba(225,245,255,.38)';
      ctx.beginPath();
      ctx.arc(node.x, node.y, node.r, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const packet of packets) {
      const a = nodes[packet.from];
      const b = nodes[packet.to];
      if (!a || !b || packet.from === packet.to) continue;
      packet.t += packet.speed;
      if (packet.t >= 1) {
        packet.from = packet.to;
        packet.to = Math.floor(Math.random() * nodes.length);
        packet.t = 0;
      }
      const x = a.x + (b.x - a.x) * packet.t;
      const y = a.y + (b.y - a.y) * packet.t;
      const gradient = ctx.createRadialGradient(x, y, 0, x, y, 24);
      gradient.addColorStop(0, 'rgba(125,247,255,.95)');
      gradient.addColorStop(0.38, 'rgba(120,184,255,.38)');
      gradient.addColorStop(1, 'rgba(120,184,255,0)');
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(x, y, 24, 0, Math.PI * 2);
      ctx.fill();
    }
    requestAnimationFrame(draw);
  }

  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);
  draw();
})();
