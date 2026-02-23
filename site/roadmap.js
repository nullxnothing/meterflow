// ═══════════ MOBILE MENU ═══════════
const hamburger = document.getElementById('hamburger');
const mobileMenu = document.getElementById('mobileMenu');

hamburger.addEventListener('click', () => {
  hamburger.classList.toggle('active');
  mobileMenu.classList.toggle('open');
});

function closeMobile() {
  hamburger.classList.remove('active');
  mobileMenu.classList.remove('open');
}

// ═══════════ SCROLL REVEAL — TIMELINE PHASES ═══════════
const phaseObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('visible');
      phaseObserver.unobserve(entry.target);
    }
  });
}, { threshold: 0.1, rootMargin: '0px 0px -60px 0px' });

document.querySelectorAll('.timeline-phase').forEach(phase => {
  phaseObserver.observe(phase);
});

// ═══════════ SCROLL REVEAL — SECTIONS ═══════════
const sectionObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('visible');
      sectionObserver.unobserve(entry.target);
    }
  });
}, { threshold: 0.08, rootMargin: '0px 0px -60px 0px' });

document.querySelectorAll('.vision-section, .cta-section').forEach(el => {
  el.classList.add('scroll-reveal');
  sectionObserver.observe(el);
});

// ═══════════ TIMELINE FILL ON SCROLL ═══════════
const timelineFill = document.getElementById('timelineFill');
const timelineSection = document.querySelector('.timeline-section');

function updateTimelineFill() {
  if (!timelineFill || !timelineSection) return;

  const rect = timelineSection.getBoundingClientRect();
  const sectionTop = rect.top;
  const sectionHeight = rect.height;
  const viewportHeight = window.innerHeight;

  const scrollProgress = Math.max(0, Math.min(1,
    (viewportHeight - sectionTop) / (sectionHeight + viewportHeight * 0.3)
  ));

  timelineFill.style.height = (scrollProgress * 100) + '%';
}

// ═══════════ PROGRESS BAR ANIMATION ═══════════
const progressFill = document.getElementById('progressFill');
let hasAnimatedProgress = false;

const progressObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting && !hasAnimatedProgress) {
      hasAnimatedProgress = true;
      setTimeout(() => {
        progressFill.style.width = '35%';
      }, 400);
    }
  });
}, { threshold: 0.5 });

if (progressFill) {
  progressFill.style.width = '0%';
  const bar = document.querySelector('.roadmap-progress-bar');
  if (bar) progressObserver.observe(bar);
}

// ═══════════ CARD MOUSE GLOW ═══════════
document.querySelectorAll('.phase-item, .mobile-card, .vision-stat').forEach(card => {
  card.addEventListener('mousemove', (e) => {
    const rect = card.getBoundingClientRect();
    card.style.setProperty('--mouse-x', `${e.clientX - rect.left}px`);
    card.style.setProperty('--mouse-y', `${e.clientY - rect.top}px`);
  });
  card.addEventListener('mouseleave', () => {
    card.style.setProperty('--mouse-x', '50%');
    card.style.setProperty('--mouse-y', '50%');
  });
});

// ═══════════ PARALLAX ═══════════
let rafScrollId = null;
window.addEventListener('scroll', () => {
  if (rafScrollId) return;
  rafScrollId = requestAnimationFrame(() => {
    updateTimelineFill();
    const glow = document.querySelector('.hero-glow');
    if (glow) {
      const scroll = window.scrollY;
      glow.style.transform = `translateX(-50%) translateY(${scroll * 0.3}px)`;
    }
    rafScrollId = null;
  });
});

// ═══════════ BACKGROUND PARTICLES ═══════════
const bgCanvas = document.getElementById('bgCanvas');
if (bgCanvas && window.innerWidth > 768) {
  const ctx = bgCanvas.getContext('2d');
  const particles = [];
  const isTablet = window.innerWidth <= 1024;
  const PARTICLE_COUNT = isTablet ? 20 : 50;

  function resizeBg() {
    bgCanvas.width = window.innerWidth;
    bgCanvas.height = window.innerHeight;
  }

  function initParticles() {
    particles.length = 0;
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      particles.push({
        x: Math.random() * bgCanvas.width,
        y: Math.random() * bgCanvas.height,
        vx: (Math.random() - 0.5) * 0.15,
        vy: (Math.random() - 0.5) * 0.15,
        r: Math.random() * 1.5 + 0.5,
        a: Math.random() * 0.15 + 0.03,
      });
    }
  }

  function drawParticles() {
    ctx.clearRect(0, 0, bgCanvas.width, bgCanvas.height);
    particles.forEach(p => {
      p.x += p.vx;
      p.y += p.vy;
      if (p.x < 0) p.x += bgCanvas.width;
      if (p.x > bgCanvas.width) p.x -= bgCanvas.width;
      if (p.y < 0) p.y += bgCanvas.height;
      if (p.y > bgCanvas.height) p.y -= bgCanvas.height;
      ctx.fillStyle = `rgba(200, 255, 0, ${p.a})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    });
    if (!isTablet) {
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const dist = dx * dx + dy * dy;
          if (dist < 22500) {
            ctx.strokeStyle = `rgba(200, 255, 0, ${0.02 * (1 - dist / 22500)})`;
            ctx.lineWidth = 0.5;
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.stroke();
          }
        }
      }
    }
    requestAnimationFrame(drawParticles);
  }

  resizeBg();
  initParticles();
  drawParticles();
  window.addEventListener('resize', () => { resizeBg(); initParticles(); });
}

// ═══════════ INIT ═══════════
updateTimelineFill();
