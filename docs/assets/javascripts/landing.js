(() => {
  const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

  function initReveal(home) {
    home.classList.add("nuzo-motion-ready");
    const targets = [...home.querySelectorAll(".nuzo-reveal")];

    if (motionQuery.matches || !("IntersectionObserver" in window)) {
      targets.forEach((target) => target.classList.add("nuzo-in-view"));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("nuzo-in-view");
          observer.unobserve(entry.target);
        });
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.12 },
    );

    targets.forEach((target) => observer.observe(target));
  }

  function initTrace(trace) {
    const tabs = [...trace.querySelectorAll("[data-trace-step]")];
    const panels = [...trace.querySelectorAll("[data-trace-panel]")];
    const toggle = trace.querySelector("[data-trace-toggle]");
    if (tabs.length === 0 || tabs.length !== panels.length) return;

    let activeIndex = 0;
    let timer;
    let isVisible = true;
    let isInteractionPaused = false;
    let isUserPaused = false;

    const activate = (index, { focus = false } = {}) => {
      activeIndex = (index + tabs.length) % tabs.length;
      tabs.forEach((tab, tabIndex) => {
        const selected = tabIndex === activeIndex;
        tab.setAttribute("aria-selected", String(selected));
        tab.tabIndex = selected ? 0 : -1;
        panels[tabIndex].hidden = !selected;
      });
      if (focus) tabs[activeIndex].focus();
    };

    const stop = () => {
      window.clearInterval(timer);
      timer = undefined;
    };

    const start = () => {
      stop();
      if (motionQuery.matches || isInteractionPaused || isUserPaused || !isVisible || document.hidden) return;
      timer = window.setInterval(() => activate(activeIndex + 1), 4600);
    };

    tabs.forEach((tab, index) => {
      tab.addEventListener("click", () => {
        activate(index);
        start();
      });
      tab.addEventListener("keydown", (event) => {
        if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
        event.preventDefault();
        if (event.key === "Home") activate(0, { focus: true });
        else if (event.key === "End") activate(tabs.length - 1, { focus: true });
        else activate(activeIndex + (event.key === "ArrowRight" ? 1 : -1), { focus: true });
        start();
      });
    });

    trace.addEventListener("mouseenter", () => {
      isInteractionPaused = true;
      stop();
    });
    trace.addEventListener("mouseleave", () => {
      isInteractionPaused = false;
      start();
    });
    trace.addEventListener("focusin", () => {
      isInteractionPaused = true;
      stop();
    });
    trace.addEventListener("focusout", (event) => {
      if (trace.contains(event.relatedTarget)) return;
      isInteractionPaused = false;
      start();
    });

    toggle?.addEventListener("click", () => {
      isUserPaused = !isUserPaused;
      toggle.setAttribute("aria-pressed", String(isUserPaused));
      toggle.textContent = isUserPaused ? "Play" : "Pause";
      if (isUserPaused) stop();
      else {
        isInteractionPaused = false;
        start();
      }
    });

    if ("IntersectionObserver" in window) {
      const visibilityObserver = new IntersectionObserver(([entry]) => {
        isVisible = entry.isIntersecting;
        start();
      }, { threshold: 0.1 });
      visibilityObserver.observe(trace);
    }

    document.addEventListener("visibilitychange", start);
    motionQuery.addEventListener?.("change", start);
    activate(0);
    start();

    if (window.matchMedia("(pointer: fine)").matches && !motionQuery.matches) {
      trace.addEventListener("pointermove", (event) => {
        const bounds = trace.getBoundingClientRect();
        trace.style.setProperty("--trace-x", `${event.clientX - bounds.left}px`);
        trace.style.setProperty("--trace-y", `${event.clientY - bounds.top}px`);
      });
    }
  }

  function initHosts(home) {
    const hosts = [...home.querySelectorAll("[data-host]")];
    hosts.forEach((host) => {
      host.addEventListener("click", () => {
        hosts.forEach((candidate) => {
          const active = candidate === host;
          candidate.classList.toggle("is-active", active);
          candidate.setAttribute("aria-pressed", String(active));
        });
      });
    });
  }

  function initCopy(home) {
    const button = home.querySelector("[data-copy-command]");
    const command = home.querySelector("[data-nuzo-command] code");
    const status = home.querySelector(".nuzo-copy-status");
    if (!button || !command || !status) return;

    button.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(command.textContent.trim());
        button.textContent = "Copied";
        status.textContent = "Commands copied to clipboard";
      } catch {
        status.textContent = "Select the commands and copy them manually";
      }
      window.setTimeout(() => {
        button.textContent = "Copy";
        status.textContent = "";
      }, 2400);
    });
  }

  function init() {
    const home = document.querySelector(".nuzo-home");
    if (!home || home.dataset.nuzoInitialized === "true") return;
    home.dataset.nuzoInitialized = "true";
    initReveal(home);
    const trace = home.querySelector("[data-nuzo-trace]");
    if (trace) initTrace(trace);
    initHosts(home);
    initCopy(home);
  }

  if (typeof document$ !== "undefined") document$.subscribe(init);
  else if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
