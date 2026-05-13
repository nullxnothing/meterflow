// Meterflow landing polish: mobile menu, zauth-style motion, cleaner demo, scroll text reveal, integration slider, and footer.
(function () {
  const ready = (fn) => document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', fn, { once: true })
    : fn();

  ready(() => {
    const $ = (selector, root = document) => root.querySelector(selector);
    const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
    const reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const style = document.createElement('style');
    style.textContent = `
      .hero-actions,.nav-cta,.mobile-menu-cta.primary,.free-access-topbar-btn,a[href='/dashboard'].btn-primary,a[href='/dashboard'].nav-cta{display:none!important}
      .hero{padding-bottom:clamp(52px,8vh,92px)!important}.hero-sub{margin-bottom:0!important}body.mobile-menu-open{overflow:hidden}
      #hamburger{position:relative;z-index:10001}#mobileMenu.mobile-menu.open,body.mobile-menu-open #mobileMenu.mobile-menu{display:flex!important;position:fixed!important;top:60px!important;left:0!important;right:0!important;z-index:10000!important;max-height:calc(100vh - 60px);overflow-y:auto;background:rgba(6,7,10,.98)!important;border-bottom:1px solid rgba(255,255,255,.08)!important;box-shadow:0 30px 80px rgba(0,0,0,.48)}
      .mf-load{opacity:0;transform:translateY(18px) scale(.985);filter:blur(10px);transition:opacity .9s cubic-bezier(.2,.65,.3,1),transform .9s cubic-bezier(.2,.65,.3,1),filter .9s cubic-bezier(.2,.65,.3,1)}.mf-load.mf-in{opacity:1;transform:none;filter:blur(0)}
      .hero-headline,.section-title,.cta-title{letter-spacing:-.035em}.hero-sub,.section-sub{color:rgba(225,228,236,.62)!important}

      .integration-logo-marquee{position:relative;overflow:hidden;padding:46px 0 56px;border-top:1px solid rgba(255,255,255,.045);border-bottom:1px solid rgba(255,255,255,.045);background:radial-gradient(circle at 50% 0%,rgba(59,130,246,.08),transparent 42%),linear-gradient(180deg,rgba(255,255,255,.018),rgba(255,255,255,.006))}.integration-logo-marquee:before,.integration-logo-marquee:after{content:'';position:absolute;z-index:2;top:0;bottom:0;width:min(18vw,220px);pointer-events:none}.integration-logo-marquee:before{left:0;background:linear-gradient(90deg,var(--bg,#08090b),transparent)}.integration-logo-marquee:after{right:0;background:linear-gradient(270deg,var(--bg,#08090b),transparent)}.integration-marquee-label{display:flex;align-items:center;justify-content:center;gap:10px;margin:0 24px 26px;font-family:var(--font-mono,monospace);font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--text-muted,#7b8190)}.integration-marquee-label span{display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:7px;color:#4ade80;background:rgba(74,222,128,.12);border:1px solid rgba(74,222,128,.18);font-weight:800;letter-spacing:0}.integration-marquee-viewport{overflow:hidden;width:100%}.integration-marquee-track{display:flex;align-items:center;gap:28px;width:max-content;animation:meterflowIntegrationMarquee 34s linear infinite;will-change:transform}.integration-logo-marquee:hover .integration-marquee-track{animation-play-state:paused}.integration-tile{width:154px;min-width:154px;display:grid;justify-items:center;gap:14px;text-decoration:none;color:inherit;opacity:.72;transition:opacity .22s ease,transform .22s ease}.integration-tile:hover{opacity:1;transform:translateY(-2px)}.integration-icon-shell{width:74px;height:74px;display:grid;place-items:center;border-radius:22px;background:linear-gradient(180deg,rgba(255,255,255,.055),rgba(255,255,255,.018)),#15161b;border:1px solid rgba(255,255,255,.075);box-shadow:inset 0 1px 0 rgba(255,255,255,.055),0 20px 48px rgba(0,0,0,.32)}.integration-icon-shell img{width:42px;height:42px;object-fit:contain;border-radius:12px;filter:saturate(1.08) contrast(1.05)}.integration-name{max-width:154px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px;color:var(--text-muted,#7b8190);letter-spacing:-.01em}@keyframes meterflowIntegrationMarquee{from{transform:translateX(0)}to{transform:translateX(-50%)}}

      .mf-plan-demo{position:relative;padding:clamp(84px,12vw,150px) 20px;background:radial-gradient(circle at 50% 0%,rgba(59,130,246,.08),transparent 38%),#0b0c10;overflow:hidden}.mf-plan-demo:before{content:'';position:absolute;inset:0;opacity:.22;background-image:linear-gradient(rgba(255,255,255,.035) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.035) 1px,transparent 1px);background-size:56px 56px;mask-image:radial-gradient(circle at 50% 40%,black,transparent 72%)}.mf-plan-wrap{position:relative;z-index:1;max-width:1040px;margin:0 auto;display:grid;grid-template-columns:minmax(0,.85fr) minmax(420px,1.15fr);gap:clamp(26px,5vw,64px);align-items:center}.mf-plan-copy .eyebrow{display:inline-flex;align-items:center;gap:10px;margin-bottom:18px;font-family:var(--font-mono);font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--text-muted)}.mf-plan-copy .eyebrow span{display:grid;place-items:center;width:25px;height:25px;border-radius:7px;color:var(--accent);background:rgba(59,130,246,.14);border:1px solid rgba(59,130,246,.18);letter-spacing:0;font-weight:800}.mf-plan-copy h2{margin:0;color:var(--text);font-family:var(--font-display);font-size:clamp(34px,5vw,66px);line-height:1.02;font-weight:500;letter-spacing:-.035em}.mf-plan-copy h2 em{font-family:var(--font-serif);font-style:italic;font-weight:400}.mf-plan-copy p{margin:20px 0 0;max-width:470px;color:rgba(225,228,236,.62);font-size:17px;line-height:1.65}.mf-plan-card{border-radius:22px;overflow:hidden;background:linear-gradient(180deg,rgba(255,255,255,.048),rgba(255,255,255,.018)),#111217;border:1px solid rgba(255,255,255,.08);box-shadow:0 40px 100px rgba(0,0,0,.5),inset 0 1px 0 rgba(255,255,255,.06)}.mf-plan-card-head{display:flex;align-items:center;justify-content:space-between;padding:14px 16px;border-bottom:1px solid rgba(255,255,255,.06);color:var(--text-muted);font-family:var(--font-mono);font-size:11px;letter-spacing:.08em;text-transform:uppercase}.mf-plan-card-head strong{color:var(--text);font-family:var(--font-body);font-size:13px;letter-spacing:0;text-transform:none}.mf-plan-list{list-style:none;margin:0;padding:12px}.mf-task{border-radius:14px;overflow:hidden}.mf-task-row,.mf-sub-row{display:flex;align-items:center;gap:10px;width:100%;border:0;background:transparent;color:var(--text);text-align:left;border-radius:12px;padding:10px 12px;cursor:pointer;transition:background .18s ease}.mf-task-row:hover,.mf-sub-row:hover{background:rgba(255,255,255,.04)}.mf-task-title,.mf-sub-title{min-width:0;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:14px}.mf-sub-title{font-size:13px;color:rgba(225,228,236,.78)}.mf-status-dot{width:16px;height:16px;border-radius:50%;border:1px solid rgba(255,255,255,.25);display:grid;place-items:center;flex:0 0 auto}.mf-status-dot:after{content:'';width:7px;height:7px;border-radius:50%;background:currentColor;opacity:.9}.mf-status-dot.completed{color:#34d399}.mf-status-dot.in-progress{color:#60a5fa}.mf-status-dot.need-help{color:#fbbf24}.mf-status-dot.failed{color:#f87171}.mf-status-dot.pending{color:#71717a}.mf-badge{font-family:var(--font-mono);font-size:10px;border-radius:999px;padding:4px 7px;background:rgba(255,255,255,.055);color:var(--text-muted);white-space:nowrap}.mf-badge.high{color:#fca5a5;background:rgba(248,113,113,.1)}.mf-badge.medium{color:#93c5fd;background:rgba(96,165,250,.1)}.mf-subtasks{position:relative;margin:0 10px 8px 20px;padding:0 0 0 18px;list-style:none;max-height:0;opacity:0;overflow:hidden;transition:max-height .36s cubic-bezier(.2,.65,.3,1),opacity .3s ease}.mf-subtasks:before{content:'';position:absolute;left:0;top:0;bottom:0;border-left:1px dashed rgba(255,255,255,.16)}.mf-task.open .mf-subtasks{max-height:340px;opacity:1}.mf-sub-detail{margin:-2px 0 8px 28px;padding-left:12px;border-left:1px dashed rgba(255,255,255,.14);color:var(--text-muted);font-size:12px;line-height:1.5;display:none}.mf-sub.open .mf-sub-detail{display:block}.mf-tool-row{display:flex;flex-wrap:wrap;gap:6px;margin-top:7px}.mf-tool{border-radius:999px;padding:3px 7px;background:rgba(59,130,246,.1);color:#93c5fd;font-family:var(--font-mono);font-size:10px}

      .mf-text-reveal{position:relative;height:190vh;background:#0a0a0c}.mf-text-reveal-sticky{position:sticky;top:0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:9vh 20px}.mf-reveal-words{max-width:990px;margin:0 auto;text-align:left;font-family:var(--font-display);font-size:clamp(30px,5.2vw,70px);line-height:1.08;font-weight:600;letter-spacing:-.04em}.mf-word{position:relative;display:inline-block;margin:.08em .12em;color:rgba(255,255,255,.16)}.mf-word span{position:absolute;inset:0;color:#fff;opacity:0;will-change:opacity}.mf-word em{font-family:var(--font-serif);font-style:italic;font-weight:400;color:inherit}

      .zauth-footer-cta,.zauth-footer{position:relative;overflow:hidden;background:#17171b!important}.zauth-footer-cta{padding:clamp(74px,9vw,116px) 24px 64px}.zauth-footer-cta:before,.zauth-footer:before{content:'';position:absolute;inset:0;pointer-events:none;opacity:.42;background-image:url("data:image/svg+xml,%3Csvg width='900' height='520' viewBox='0 0 900 520' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' stroke='%23383d45' stroke-width='1.2' opacity='.72'%3E%3Cpath d='M-80 88 C120 58 210 150 365 158 C535 167 650 72 980 60'/%3E%3Cpath d='M-70 128 C130 98 225 195 382 202 C548 210 660 118 980 104'/%3E%3Cpath d='M-90 180 C122 138 235 230 405 238 C575 246 690 160 980 148'/%3E%3Cpath d='M-90 236 C130 188 245 270 430 282 C606 294 720 205 990 195'/%3E%3Cpath d='M-70 300 C160 242 285 330 470 342 C660 355 745 260 990 248'/%3E%3Cpath d='M-90 365 C162 302 315 383 500 392 C695 402 780 320 990 310'/%3E%3Cpath d='M-80 430 C145 385 335 450 540 455 C720 460 820 392 990 386'/%3E%3C/g%3E%3C/svg%3E");background-size:980px 560px;background-position:center}.zauth-footer-cta-card{position:relative;z-index:1;max-width:1080px;margin:0 auto;padding:clamp(28px,5vw,58px);border-radius:28px;background:radial-gradient(circle at 88% 14%,rgba(59,130,246,.08),transparent 38%),linear-gradient(180deg,rgba(255,255,255,.045),rgba(255,255,255,.015)),#16171a;border:1px solid rgba(255,255,255,.09);box-shadow:0 30px 90px rgba(0,0,0,.32),inset 0 1px 0 rgba(255,255,255,.055)}.zauth-footer-cta-card h2{margin:0;color:var(--text);font-family:var(--font-display);font-size:clamp(34px,4.4vw,58px);line-height:1.02;font-weight:500;letter-spacing:-.028em}.zauth-footer-cta-card p{max-width:760px;margin:20px 0 0;color:var(--text-dim);font-size:clamp(16px,1.8vw,20px);line-height:1.62}.zauth-footer-cta-actions{display:flex;gap:14px;flex-wrap:wrap;margin-top:36px}.zauth-footer-cta-actions a{display:inline-flex;align-items:center;justify-content:center;min-height:48px;padding:0 26px;border-radius:13px;text-decoration:none;font-weight:600;font-size:15px}.zauth-footer-cta-actions a:first-child{background:var(--accent);color:#fff;border:1px solid var(--accent)}.zauth-footer-cta-actions a:last-child{color:var(--text);background:rgba(255,255,255,.018);border:1px solid rgba(255,255,255,.2)}.zauth-footer{display:block!important;padding:76px 24px 48px!important;margin:0!important;border-top:1px solid rgba(255,255,255,.06)!important}.zauth-footer>*{position:relative;z-index:1}.zauth-footer-shell{max-width:1080px;margin:0 auto}.zauth-footer-brand{display:flex;align-items:center;justify-content:center;gap:clamp(14px,2.4vw,24px);margin:0 auto 18px;color:var(--text);text-decoration:none;font-family:var(--font-display);font-size:clamp(46px,9vw,112px);line-height:.95;font-weight:700;letter-spacing:-.055em}.zauth-footer-brand img{width:.7em;height:.7em;flex:0 0 auto}.zauth-footer-tagline{margin:0 auto 50px;max-width:560px;text-align:center;color:var(--text-muted);font-size:clamp(16px,2vw,22px);line-height:1.5}.zauth-footer-grid{display:grid;grid-template-columns:repeat(3,minmax(150px,180px));justify-content:center;justify-items:center;gap:clamp(36px,8vw,118px);width:100%;margin:0 auto 56px}.zauth-footer-col{width:100%;text-align:left}.zauth-footer-col h3{margin:0 0 18px;color:var(--text-dim);font-size:18px;font-weight:600;letter-spacing:-.012em}.zauth-footer-col a{display:flex;align-items:center;gap:10px;width:fit-content;margin:0 0 14px;color:var(--text-muted);text-decoration:none;font-size:16px;line-height:1.25}.zauth-footer-bottom{display:flex;align-items:center;justify-content:center;gap:28px;flex-wrap:wrap;padding-top:30px;border-top:1px solid rgba(255,255,255,.08);color:rgba(161,161,170,.52);font-size:14px;text-align:center}.zauth-footer-bottom a{color:rgba(161,161,170,.6);text-decoration:none}

      @media(max-width:880px){.mf-plan-wrap{grid-template-columns:1fr}.mf-plan-card{max-width:100%}.mf-plan-copy{text-align:center}.mf-plan-copy p{margin-left:auto;margin-right:auto}.mf-text-reveal{height:160vh}.mf-reveal-words{text-align:center}}
      @media(max-width:760px){.integration-logo-marquee{padding:34px 0 42px}.integration-marquee-track{gap:20px;animation-duration:26s}.integration-tile{width:122px;min-width:122px;gap:11px}.integration-icon-shell{width:62px;height:62px;border-radius:18px}.integration-icon-shell img{width:36px;height:36px}.integration-name{max-width:122px;font-size:12px}.zauth-footer-cta{padding:72px 20px 48px}.zauth-footer-cta-card{padding:28px;border-radius:22px}.zauth-footer-cta-actions a{width:100%}.zauth-footer{padding:56px 20px 42px!important}.zauth-footer-grid{grid-template-columns:repeat(3,minmax(0,1fr));gap:18px}.zauth-footer-col h3{font-size:14px}.zauth-footer-col a{font-size:13px}.zauth-footer-bottom{gap:16px;font-size:12px}}
      @media(max-width:430px){.zauth-footer-grid{grid-template-columns:1fr;max-width:210px;gap:28px}.zauth-footer-col{text-align:center}.zauth-footer-col a{margin-left:auto;margin-right:auto}}
      @media(prefers-reduced-motion:reduce){.integration-marquee-track{animation:none;flex-wrap:wrap;justify-content:center;width:100%}.mf-load{opacity:1;transform:none;filter:none}.mf-word span{opacity:1!important}}
    `;
    document.head.appendChild(style);

    function closeMobile() {
      $('#hamburger')?.classList.remove('active');
      $('#mobileMenu')?.classList.remove('open');
      document.body.classList.remove('mobile-menu-open');
      $('#hamburger')?.setAttribute('aria-expanded', 'false');
    }
    window.closeMobile = closeMobile;

    const hamburger = $('#hamburger');
    const mobileMenu = $('#mobileMenu');
    if (hamburger && mobileMenu) {
      hamburger.setAttribute('type', 'button');
      hamburger.setAttribute('aria-expanded', 'false');
      hamburger.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        const open = !mobileMenu.classList.contains('open');
        hamburger.classList.toggle('active', open);
        mobileMenu.classList.toggle('open', open);
        document.body.classList.toggle('mobile-menu-open', open);
        hamburger.setAttribute('aria-expanded', String(open));
      });
      mobileMenu.addEventListener('click', (event) => { if (event.target.closest('a')) closeMobile(); });
      document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeMobile(); });
    }

    const integrations = [['payai.cash','payai.cash'],['heurist.xyz','heurist.xyz'],['silverbackdefi.app','silverbackdefi.app'],['minifetch.com','minifetch.com'],['kodaoracle.com','kodaoracle.com'],['x402.org','x402.org'],['solana.com','solana.com'],['phantom.com','phantom.com']];
    const favicon = (domain) => `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128`;

    function buildIntegrationMarquee() {
      if ($('.integration-logo-marquee')) return;
      const section = document.createElement('section');
      section.className = 'integration-logo-marquee reveal';
      section.setAttribute('aria-label', 'Meterflow integration ecosystem');
      section.innerHTML = `<div class="integration-marquee-label"><span>In</span> Integration ecosystem</div><div class="integration-marquee-viewport" aria-live="off"><div class="integration-marquee-track"></div></div>`;
      const track = $('.integration-marquee-track', section);
      integrations.concat(integrations).forEach(([name, domain]) => {
        const tile = document.createElement('a');
        tile.className = 'integration-tile';
        tile.href = `https://${domain}`;
        tile.target = '_blank';
        tile.rel = 'noopener';
        tile.innerHTML = `<span class="integration-icon-shell"><img src="${favicon(domain)}" alt="${name} logo" loading="lazy"></span><span class="integration-name">${name}</span>`;
        track.appendChild(tile);
      });
      const anchor = $('.trusted') || $('.showcase') || $('.stats');
      if (anchor?.parentNode) anchor.parentNode.replaceChild(section, anchor);
    }

    const planTasks = [
      { id:'1', title:'Meter endpoint request', status:'in-progress', priority:'high', deps:[], subtasks:[['1.1','Issue quote','completed','Return x402 price and route metadata',['gateway','quote-engine']],['1.2','Verify payment','in-progress','Confirm USDC settlement before response release',['solana-rpc','receipt-writer']],['1.3','Attach receipt','need-help','Write request, payer, route, amount, and latency proof',['receipt-graph']]] },
      { id:'2', title:'Apply agent budget policy', status:'in-progress', priority:'high', deps:[], subtasks:[['2.1','Check daily cap','pending','Confirm the agent is inside daily spend limits',['policy-engine']],['2.2','Match route allowlist','pending','Verify the requested endpoint is approved for this wallet',['allowlist','wallet-link']],['2.3','Handle failed policy','pending','Return clean failure state instead of burning calls',['failure-router']]] },
      { id:'3', title:'Provider revenue sync', status:'pending', priority:'medium', deps:['1','2'], subtasks:[['3.1','Attribute revenue','pending','Group receipts by endpoint and provider',['analytics']],['3.2','Emit webhook','pending','Notify provider systems when a paid call settles',['webhooks']],['3.3','Update registry signal','pending','Feed uptime, price, and volume back into discovery',['registry']]] }
    ];

    function statusDot(status) { return `<span class="mf-status-dot ${status}"></span>`; }
    function buildPlanDemo() {
      const oldTabs = $('.showcase-tabs');
      const oldShowcase = $('.showcase');
      if (!oldShowcase || $('.mf-plan-demo')) return;
      const section = document.createElement('section');
      section.className = 'mf-plan-demo mf-load';
      section.innerHTML = `
        <div class="mf-plan-wrap">
          <div class="mf-plan-copy">
            <div class="eyebrow"><span>Dm</span> Live payment workflow</div>
            <h2>A cleaner demo for <em>agent tasks.</em></h2>
            <p>Instead of a generic dashboard mock, Meterflow now shows the work an agent payment system actually performs: quote, verify, budget, receipt, and provider sync.</p>
          </div>
          <div class="mf-plan-card" role="region" aria-label="Meterflow agent payment task plan">
            <div class="mf-plan-card-head"><strong>Agent payment run</strong><span>live preview</span></div>
            <ul class="mf-plan-list"></ul>
          </div>
        </div>`;
      const list = $('.mf-plan-list', section);
      planTasks.forEach((task, index) => {
        const item = document.createElement('li');
        item.className = `mf-task ${index === 0 ? 'open' : ''}`;
        item.innerHTML = `<button class="mf-task-row" type="button">${statusDot(task.status)}<span class="mf-task-title">${task.title}</span>${task.deps.length ? `<span class="mf-badge">dep ${task.deps.join(',')}</span>` : ''}<span class="mf-badge ${task.priority}">${task.priority}</span></button><ul class="mf-subtasks"></ul>`;
        const subs = $('.mf-subtasks', item);
        task.subtasks.forEach((sub, subIndex) => {
          const [id, title, status, desc, tools] = sub;
          const subItem = document.createElement('li');
          subItem.className = `mf-sub ${index === 0 && subIndex === 1 ? 'open' : ''}`;
          subItem.innerHTML = `<button class="mf-sub-row" type="button">${statusDot(status)}<span class="mf-sub-title">${title}</span><span class="mf-badge">${status}</span></button><div class="mf-sub-detail"><p>${desc}</p><div class="mf-tool-row">${tools.map((tool) => `<span class="mf-tool">${tool}</span>`).join('')}</div></div>`;
          subs.appendChild(subItem);
        });
        list.appendChild(item);
      });
      oldTabs?.remove();
      oldShowcase.replaceWith(section);
      $$('.mf-task-row', section).forEach((btn) => btn.addEventListener('click', () => btn.closest('.mf-task')?.classList.toggle('open')));
      $$('.mf-sub-row', section).forEach((btn) => btn.addEventListener('click', (e) => { e.stopPropagation(); btn.closest('.mf-sub')?.classList.toggle('open'); }));
    }

    function buildTextReveal() {
      if ($('.mf-text-reveal')) return;
      const text = 'Agents do not need another SaaS dashboard. They need a payment surface that can quote value, verify settlement, enforce budgets, and leave a receipt trail every time software buys software.';
      const section = document.createElement('section');
      section.className = 'mf-text-reveal';
      section.innerHTML = `<div class="mf-text-reveal-sticky"><p class="mf-reveal-words">${text.split(' ').map((word) => `<span class="mf-word"><span>${word}</span>${word}</span>`).join(' ')}</p></div>`;
      const anchor = $('.tools') || $('.how') || $('.cta');
      if (anchor?.parentNode) anchor.parentNode.insertBefore(section, anchor);
    }

    function buildFooter() {
      const footer = $('.site-footer');
      if (!footer) return;
      const cta = $('.cta');
      const ctaMarkup = `<section class="zauth-footer-cta reveal" aria-label="Build with Meterflow"><div class="zauth-footer-cta-card"><h2>Become one with <em>Meterflow.</em></h2><p>Join the providers building the payment, receipt, and spend-control layer for autonomous agents on Solana.</p><div class="zauth-footer-cta-actions"><a href="/apply">Strategic Collaboration</a><a href="/docs">Read Documentation</a></div></div></section>`;
      if (cta) cta.outerHTML = ctaMarkup;
      footer.className = 'site-footer zauth-footer';
      footer.innerHTML = `<div class="zauth-footer-shell"><a class="zauth-footer-brand" href="/" aria-label="Meterflow home"><img src="/assets/brand/meterflow-mark.svg" alt="" aria-hidden="true"><span>Meterflow</span></a><p class="zauth-footer-tagline">Payment infrastructure for agent commerce.</p><div class="zauth-footer-grid" aria-label="Footer navigation"><div class="zauth-footer-col"><h3>Products</h3><a href="/dashboard">Dashboard</a><a href="/#tools">Surfaces</a><a href="/token">Token</a><a href="/how-it-works">How it works</a></div><div class="zauth-footer-col"><h3>Resources</h3><a href="/docs">Documentation</a><a href="/roadmap">Roadmap</a><a href="/status">Status</a><a href="/apply">Apply as provider</a></div><div class="zauth-footer-col"><h3>Connect</h3><a href="https://x.com/meterflowsol" target="_blank" rel="noopener">Twitter</a><a href="https://discord.gg/tned74z4eN" target="_blank" rel="noopener">Discord</a><a href="https://github.com/nullxnothing/meterflow" target="_blank" rel="noopener">GitHub</a></div></div><div class="zauth-footer-bottom"><span>© 2026 Meterflow. All rights reserved.</span><a href="/privacy">Privacy Policy</a><a href="/terms">Terms of Service</a></div></div>`;
    }

    function initMotion() {
      const targets = ['nav','.hero-headline','.hero-sub','.integration-logo-marquee','.mf-plan-demo','.section-header','.tools-grid','.how-step','.zauth-footer-cta-card','.zauth-footer-brand','.zauth-footer-grid'].flatMap((selector) => $$(selector));
      targets.forEach((el, i) => {
        el.classList.add('mf-load');
        el.style.transitionDelay = `${Math.min(i * 45, 360)}ms`;
      });
      if (reducedMotion || !('IntersectionObserver' in window)) {
        targets.forEach((el) => el.classList.add('mf-in'));
        return;
      }
      const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('mf-in','in','visible');
            observer.unobserve(entry.target);
          }
        });
      }, { threshold: .14, rootMargin: '0px 0px -8% 0px' });
      targets.forEach((el) => observer.observe(el));
    }

    function initTextReveal() {
      const section = $('.mf-text-reveal');
      const words = $$('.mf-word span', section || document);
      if (!section || !words.length || reducedMotion) return;
      const tick = () => {
        const rect = section.getBoundingClientRect();
        const max = Math.max(1, section.offsetHeight - window.innerHeight);
        const progress = Math.min(1, Math.max(0, -rect.top / max));
        words.forEach((word, i) => {
          const start = i / words.length;
          const end = start + 1 / words.length * 1.5;
          const opacity = Math.min(1, Math.max(0, (progress - start) / (end - start)));
          word.style.opacity = opacity.toFixed(3);
        });
      };
      window.addEventListener('scroll', tick, { passive: true });
      window.addEventListener('resize', tick);
      tick();
    }

    function statFallbacks() {
      const data = { 'ps-alltime-calls':'Preview','ps-alltime-tokens':'USDC','ps-money-saved':'Live','ps-active-keys':'Keys','ps-models':'Routes','ps-uptime':'Online' };
      Object.entries(data).forEach(([id, value]) => { const el = document.getElementById(id); if (el && (!el.textContent || el.textContent.trim() === '---')) el.textContent = value; });
    }

    buildIntegrationMarquee();
    buildPlanDemo();
    buildTextReveal();
    buildFooter();
    initMotion();
    initTextReveal();
    statFallbacks();
  });
})();
