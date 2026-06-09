document.addEventListener("DOMContentLoaded", () => {
  const form = document.querySelector("[data-score-form]");
  if (!form) return;

  const button = form.querySelector("button[type='submit']");
  const input = form.querySelector("input[name='websiteUrl']");

  const overlay = document.createElement("div");
  overlay.id = "loading-overlay";
  overlay.setAttribute("aria-live", "polite");
  overlay.setAttribute("aria-label", "Analiză în curs");
  overlay.style.cssText = [
    "display:none",
    "position:fixed",
    "inset:0",
    "z-index:9999",
    "background:rgba(0,0,0,0.82)",
    "backdrop-filter:blur(4px)",
    "flex-direction:column",
    "align-items:center",
    "justify-content:center",
    "gap:20px",
    "color:#fff",
    "font-family:inherit"
  ].join(";");

  overlay.innerHTML = `
    <svg width="44" height="44" viewBox="0 0 44 44" fill="none" style="animation:spin 1s linear infinite">
      <circle cx="22" cy="22" r="18" stroke="#ffffff22" stroke-width="4"/>
      <path d="M22 4a18 18 0 0 1 18 18" stroke="#a3e635" stroke-width="4" stroke-linecap="round"/>
    </svg>
    <p style="font-size:1.1rem;font-weight:600;margin:0" id="loading-step">Se analizează website-ul...</p>
    <p style="font-size:0.82rem;color:#ffffff66;margin:0">Crawlăm până la 25 de pagini și verificăm prezența externă</p>
  `;
  document.body.appendChild(overlay);

  const style = document.createElement("style");
  style.textContent = "@keyframes spin{to{transform:rotate(360deg)}}";
  document.head.appendChild(style);

  const steps = [
    [3000,  "Se verifică robots.txt și sitemap-ul..."],
    [7000,  "Se crawlează paginile importante..."],
    [13000, "Se analizează conținutul și structura..."],
    [20000, "Se verifică prezența externă și recenziile..."],
    [28000, "Se testează vizibilitatea în AI search..."],
    [38000, "Se calculează scorul final..."]
  ];
  let timers = [];

  function startLoading() {
    form.classList.add("is-loading");
    button.disabled = true;
    button.textContent = "Se analizează...";
    button.classList.add("opacity-80", "cursor-wait");
    overlay.style.display = "flex";
    const stepEl = overlay.querySelector("#loading-step");
    timers = steps.map(([delay, text]) =>
      setTimeout(() => { stepEl.textContent = text; }, delay)
    );
  }

  const getToken = () => form.querySelector("[name='cf-turnstile-response']")?.value || "";

  form.addEventListener("submit", (e) => {
    if (!button || !input.value.trim()) return;

    const widget = form.querySelector(".cf-turnstile");
    // No Turnstile on the page, or token already solved → submit straight away.
    if (!window.turnstile || !widget || getToken()) {
      startLoading();
      return;
    }

    // Token not ready: high-risk sessions (e.g. incognito) need a tap on the
    // visible widget. Do NOT show the full-screen overlay — it would cover the
    // checkbox. Wait for the token, then show the loader and submit.
    e.preventDefault();
    button.disabled = true;
    button.textContent = "Verificare...";
    let waited = 0;
    const iv = setInterval(() => {
      if (getToken()) {
        clearInterval(iv);
        startLoading();
        form.submit();
      } else if ((waited += 250) >= 30000) {
        clearInterval(iv);
        button.disabled = false;
        button.textContent = "Analizează gratuit →";
      }
    }, 250);
  });

  window.addEventListener("pageshow", () => {
    overlay.style.display = "none";
    timers.forEach(clearTimeout);
    if (button) {
      button.disabled = false;
      button.textContent = "Analizează gratuit →";
      button.classList.remove("opacity-80", "cursor-wait");
    }
    form.classList.remove("is-loading");
  });
});
