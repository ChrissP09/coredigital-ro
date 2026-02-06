const prefersReducedMotion =
  typeof window !== 'undefined' &&
  window.matchMedia &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const setupTestimonials = (section) => {
  const tabs = Array.from(section.querySelectorAll('[role="tab"]'));
  const panes = Array.from(section.querySelectorAll('[role="tabpanel"]'));
  if (!tabs.length || !panes.length) return;

  const activate = (nextId, { focus = false } = {}) => {
    if (!nextId) return;
    const nextTab = tabs.find((t) => t.dataset.tab === nextId);
    const nextPane = panes.find((p) => p.dataset.panel === nextId);
    if (!nextTab || !nextPane) return;

    const currentTab = tabs.find((t) => t.classList.contains('is-active'));
    const currentPane = panes.find((p) => p.classList.contains('is-active'));
    if (currentTab === nextTab) return;

    if (currentTab) {
      currentTab.classList.remove('is-active');
      currentTab.setAttribute('aria-selected', 'false');
      currentTab.setAttribute('tabindex', '-1');
    }

    if (currentPane) {
      currentPane.classList.remove('is-active');
      currentPane.hidden = true;
      currentPane.setAttribute('tabindex', '-1');
    }

    nextTab.classList.add('is-active');
    nextTab.setAttribute('aria-selected', 'true');
    nextTab.setAttribute('tabindex', '0');

    nextPane.hidden = false;
    nextPane.classList.add('is-active');
    nextPane.setAttribute('tabindex', '0');

    if (focus) nextTab.focus();

    if (prefersReducedMotion) return;
    nextPane.animate(
      [
        { opacity: 0, transform: 'translateY(10px)' },
        { opacity: 1, transform: 'translateY(0px)' },
      ],
      { duration: 260, easing: 'ease-out' }
    );
  };

  tabs.forEach((tab) => {
    tab.addEventListener('click', () => activate(tab.dataset.tab, { focus: false }));
    tab.addEventListener('keydown', (event) => {
      const key = event.key;
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(key)) return;
      event.preventDefault();

      const currentIndex = tabs.indexOf(tab);
      if (currentIndex < 0) return;

      let nextIndex = currentIndex;
      if (key === 'ArrowLeft') nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
      if (key === 'ArrowRight') nextIndex = (currentIndex + 1) % tabs.length;
      if (key === 'Home') nextIndex = 0;
      if (key === 'End') nextIndex = tabs.length - 1;

      const nextTab = tabs[nextIndex];
      if (!nextTab) return;
      activate(nextTab.dataset.tab, { focus: true });
    });
  });
};

const init = () => {
  const sections = Array.from(document.querySelectorAll('[data-testimonials]'));
  sections.forEach(setupTestimonials);
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}

