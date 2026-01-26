const root = document.documentElement;
root.classList.remove('no-js');
root.classList.add('js');

// Mobile menu (Header.astro uses these ids).
const mobileMenu = document.getElementById('mobile-menu');
const mobileMenuButton = document.getElementById('mobile-menu-button');
const mobileMenuClose = document.getElementById('mobile-menu-close');

const prefersReducedMotion =
  typeof window !== 'undefined' &&
  window.matchMedia &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const setMobileMenuOpen = (open) => {
  if (!mobileMenu) return;

  mobileMenu.classList.toggle('translate-x-full', !open);
  mobileMenu.classList.toggle('translate-x-0', open);
  mobileMenu.setAttribute('aria-hidden', open ? 'false' : 'true');

  if (mobileMenuButton) mobileMenuButton.setAttribute('aria-expanded', open ? 'true' : 'false');

  // Prevent background scroll while the menu is open.
  document.body.style.overflow = open ? 'hidden' : '';
};

if (mobileMenuButton && mobileMenu) {
  mobileMenuButton.addEventListener('click', () => setMobileMenuOpen(true));
}

if (mobileMenuClose && mobileMenu) {
  mobileMenuClose.addEventListener('click', () => setMobileMenuOpen(false));
}

// Close menu on overlay click (outside the panel content).
if (mobileMenu) {
  mobileMenu.addEventListener('click', (e) => {
    if (e.target === mobileMenu) setMobileMenuOpen(false);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') setMobileMenuOpen(false);
  });
}

// Smooth scroll to in-page anchors with fixed-header offset.
const scrollToHash = (hash) => {
  if (!hash || hash === '#') return false;
  const target = document.querySelector(hash);
  if (!target) return false;

  const header = document.querySelector('header');
  const headerOffset = header ? Math.ceil(header.getBoundingClientRect().height) : 0;
  const targetTop = target.getBoundingClientRect().top + window.scrollY - headerOffset - 12;

  window.scrollTo({
    top: Math.max(0, targetTop),
    behavior: prefersReducedMotion ? 'auto' : 'smooth',
  });

  return true;
};

document.addEventListener('click', (e) => {
  const a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
  if (!a) return;

  const url = new URL(a.getAttribute('href'), window.location.href);
  const isSamePath = url.pathname === window.location.pathname;
  if (!isSamePath || !url.hash) return;

  if (scrollToHash(url.hash)) {
    e.preventDefault();
    history.pushState(null, '', url.hash);
    setMobileMenuOpen(false);
  }
});

// If we load the page with a hash, jump to it after layout.
if (window.location.hash) {
  window.requestAnimationFrame(() => scrollToHash(window.location.hash));
}

// Reveal-on-scroll for sections (homepage uses .fade-in-up).
const revealEls = Array.from(document.querySelectorAll('.fade-in-up'));
if (revealEls.length) {
  if (prefersReducedMotion || !('IntersectionObserver' in window)) {
    revealEls.forEach((el) => el.classList.add('is-visible'));
  } else {
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            io.unobserve(entry.target);
          }
        }
      },
      { threshold: 0.12 }
    );

    revealEls.forEach((el) => io.observe(el));
  }
}

// Lightweight "live chat" demo (homepage AI section).
const chatDemos = Array.from(document.querySelectorAll('[data-chat-demo]'));
if (chatDemos.length) {
  chatDemos.forEach((demo) => {
    const steps = Array.from(demo.querySelectorAll('[data-chat-step]'));
    const typing = demo.querySelector('[data-chat-typing]');
    const messages = demo.querySelector('[data-chat-messages]');

    if (!steps.length) return;

    // If the user prefers reduced motion, keep everything visible.
    if (prefersReducedMotion) {
      steps.forEach((el) => el.classList.remove('hidden'));
      if (typing) typing.classList.add('hidden');
      return;
    }

    const scrollToBottom = () => {
      if (!messages) return;
      messages.scrollTo({
        top: messages.scrollHeight,
        behavior: prefersReducedMotion ? 'auto' : 'smooth',
      });
    };

    const animateIn = (el) => {
      el.classList.add('chat-demo-in');
      window.setTimeout(() => el.classList.remove('chat-demo-in'), 380);
    };

    const showStep = (index) => {
      steps.forEach((el, i) => {
        const shouldShow = i <= index;
        const wasHidden = el.classList.contains('hidden');
        el.classList.toggle('hidden', !shouldShow);
        if (shouldShow && wasHidden && i === index) animateIn(el);
      });

      if (typing) typing.classList.add('hidden');
      scrollToBottom();
    };

    const reset = () => {
      steps.forEach((el) => el.classList.add('hidden'));
      showStep(0);
    };
    reset();

    let stepIndex = 0;
    let timeoutId = null;

    const schedule = (fn, delay) => {
      timeoutId = window.setTimeout(fn, delay);
    };

    const typingDelayMs = 850;
    const betweenMessagesMs = 1500;
    const loopPauseMs = 2200;

    const tick = () => {
      // Show typing indicator briefly before the next message.
      if (typing) {
        typing.classList.remove('hidden');
        animateIn(typing);
        scrollToBottom();
      }

      schedule(() => {
        if (typing) typing.classList.add('hidden');

        stepIndex += 1;
        if (stepIndex >= steps.length) {
          // Pause, then loop.
          schedule(() => {
            stepIndex = 0;
            reset();
            schedule(tick, 1200);
          }, loopPauseMs);
          return;
        }

        showStep(stepIndex);
        schedule(tick, betweenMessagesMs);
      }, typingDelayMs);
    };

    // Start after a short delay so it feels "live".
    schedule(tick, 1200);

    // Stop animation if the element is removed.
    const stop = () => {
      if (timeoutId) window.clearTimeout(timeoutId);
      timeoutId = null;
    };

    window.addEventListener('beforeunload', stop, { once: true });
  });
}
