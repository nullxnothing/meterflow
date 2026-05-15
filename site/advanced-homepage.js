(() => {
  const root = document.documentElement;
  const orb = document.getElementById('cursorOrb');
  const canvas = document.getElementById('flowCanvas');
  const ctx = canvas?.getContext('2d');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const flowSteps = [
    {
      step: '01',
      title: 'Agent calls endpoint',
      text: 'A bot, AI agent, or trading workflow requests a protected route without a traditional API subscription.',
      code: [
        '<b>$</b> curl https://api.provider.fun/signals',
        '<b>&gt;</b> 402 Payment Required',
        '<b>&gt;</b> x-meterflow-quote: 0.004 USDC'
      ]
    },
    {
      step: '02',
      title: 'Meterflow returns a quote',
      text: 'The endpoint declares price, accepted asset, route metadata, and policy requirements before value is served.',
      code: [
        '<b>&gt;</b> price: 0.004 USDC',
        '<b>&gt;</b> route: /signals/edge-score',
        '<b>&gt;</b> policy: allowlist + daily cap'
      ]
    },
    {
      step: '03',
      title: 'Wallet pays within budget',
      text: 'The agent wallet signs payment only if the route is allowed and spend remains under its configured cap.',
      code: [
        '<b>&gt;</b> wallet: ag_7c2',
        '<b>&gt;</b> budget: $8.04 / $12.00',
        '<b>&gt;</b> payment: confirmed'
      ]
    },
    {
      step: '04',
      title: 'Payment proof is verified',
      text: 'Meterflow validates payment context and attaches the payment to the API request that created it.',
      code: [
        '<b>&gt;</b> signature: verified',
        '<b>&gt;</b> payer: agent wallet',
        '<b>&gt;</b> provider: endpoint owner'
      ]
    },
    {
      step: '05',
      title: 'Response unlocks with receipt',
      text: 'The provider serves the response, the agent gets the data, and both sides keep an auditable usage receipt.',
      code: [
        '<b>&gt;</b> response: streamed',
        '<b>&gt;</b> receipt: rcpt_41bd',
        '<b>&gt;</b> status: complete'
      ]
    }
  ];

  function setPointer(x, y) {
    root.style.setProperty('--mx', `${x}px`);
    root.style.setProperty('--my', `${y}px`);
    if (orb) {
      orb.style.left = `${x}px`;
      orb.style.top = `${y}px`;
    }
  }

  setPointer(window.innerWidth * 0.55, window.innerHeight * 0.25);
  window.addEventListener('pointermove', (event) => {
    setPointer(event.clientX, event.clientY);
  }, { passive: true });

  const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        revealObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.14, rootMargin: '0px 0px -8% 0px' });

  document.querySelectorAll('[data-reveal]').forEach((element) => revealObserver.observe(element));

  document.querySelectorAll('.bento-card').forEach((card) => {
    card.addEventListener('pointermove', (event) => {
      const rect = card.getBoundingClientRect();
      card.style.setProperty('--card-x', `${event.clientX - rect.left}px`);
      card.style.setProperty('--card-y', `${event.clientY - rect.top}px`);
    });
  });

  const stage = document.getElementById('flowStage');
  const progress = document.getElementById('stageProgress');
  const stageStep = document.getElementById('stageStep');
  const stageTitle = document.getElementById('stageTitle');
  const stageText = document.getElementById('stageText');
  const stageCode = document.getElementById('stageCode');
  const pipeDots = Array.from(document.querySelectorAll('.pipe-dot'));
  let activeStep = 0;

  function updateStage(index) {
    if (!stageStep || index === activeStep && stageStep.textContent === flowSteps[index].step) return;
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
    const raw = (viewport * 0.74 - rect.top) / (rect.height || viewport);
    const clamped = Math.max(0, Math.min(0.999, raw));
    const index = Math.min(flowSteps.length - 1, Math.floor(clamped * flowSteps.length));
    updateStage(index);
  }

  window.addEventListener('scroll', syncScrollStage, { passive: true });
  window.addEventListener('resize', syncScrollStage);
  syncScrollStage();

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
    const count = width < 720 ? 28 : 52;
    for (let i = 0; i < count; i += 1) {
      nodes.push({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.18,
        vy: (Math.random() - 0.5) * 0.18,
        r: Math.random() * 1.8 + 0.6
      });
    }

    packets.length = 0;
    for (let i = 0; i < 8; i += 1) {
      packets.push({
        from: Math.floor(Math.random() * count),
        to: Math.floor(Math.random() * count),
        t: Math.random(),
        speed: 0.002 + Math.random() * 0.003
      });
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

    ctx.lineWidth = 1;
    for (let i = 0; i < nodes.length; i += 1) {
      for (let j = i + 1; j < nodes.length; j += 1) {
        const a = nodes[i];
        const b = nodes[j];
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 190) {
          const alpha = (1 - dist / 190) * 0.16;
          ctx.strokeStyle = `rgba(99, 168, 255, ${alpha})`;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }
    }

    for (const node of nodes) {
      ctx.fillStyle = 'rgba(145, 199, 255, 0.38)';
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
        packet.speed = 0.002 + Math.random() * 0.003;
      }
      const x = a.x + (b.x - a.x) * packet.t;
      const y = a.y + (b.y - a.y) * packet.t;
      const gradient = ctx.createRadialGradient(x, y, 0, x, y, 20);
      gradient.addColorStop(0, 'rgba(98, 244, 255, 0.88)');
      gradient.addColorStop(0.34, 'rgba(99, 168, 255, 0.4)');
      gradient.addColorStop(1, 'rgba(99, 168, 255, 0)');
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(x, y, 20, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(235, 249, 255, 0.95)';
      ctx.beginPath();
      ctx.arc(x, y, 2.4, 0, Math.PI * 2);
      ctx.fill();
    }

    requestAnimationFrame(draw);
  }

  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);
  draw();
})();
