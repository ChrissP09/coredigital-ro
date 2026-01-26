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

