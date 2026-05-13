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

// ═══════════ TIMELINE SCROLL STATE ═══════════
let rafScrollId = null;
window.addEventListener('scroll', () => {
  if (rafScrollId) return;
  rafScrollId = requestAnimationFrame(() => {
    updateTimelineFill();
    rafScrollId = null;
  });
});

// ═══════════ INIT ═══════════
updateTimelineFill();
