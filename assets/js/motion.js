import { isReducedMotion } from "./theme.js";

function unique(elements) {
  return Array.from(new Set(elements));
}

function getHash(link) {
  try {
    const url = new URL(link.href, document.baseURI);
    const current = new URL(window.location.href);

    if (url.pathname !== current.pathname || url.origin !== current.origin) {
      return "";
    }

    return decodeURIComponent(url.hash.slice(1));
  } catch {
    return "";
  }
}

function initReveals() {
  const revealItems = unique([
    ...document.querySelectorAll("[data-reveal]"),
    ...document.querySelectorAll(".reveal"),
  ]);

  if (!revealItems.length) {
    return () => {};
  }

  let observer = null;

  const reveal = (item) => {
    item.classList.remove("is-reveal-pending");
    item.classList.add("is-visible");
    item.dataset.revealState = "visible";
  };

  const observePending = () => {
    if (observer) {
      observer.disconnect();
      observer = null;
    }

    if (isReducedMotion() || !("IntersectionObserver" in window)) {
      revealItems.forEach(reveal);
      return;
    }

    observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) {
            return;
          }

          reveal(entry.target);
          observer.unobserve(entry.target);
        });
      },
      {
        rootMargin: "0px 0px -10% 0px",
        threshold: 0.08,
      },
    );

    revealItems.forEach((item, index) => {
      if (item.classList.contains("is-visible")) {
        return;
      }

      const authoredDelay = Number.parseInt(item.dataset.revealDelay || "", 10);
      const delay = Number.isFinite(authoredDelay)
        ? Math.max(0, Math.min(authoredDelay, 1000))
        : Math.min(index % 4, 3) * 70;

      item.style.setProperty("--reveal-delay", `${delay}ms`);
      item.classList.add("is-reveal-pending");
      item.dataset.revealState = "pending";
      observer.observe(item);
    });
  };

  const onMotionChange = (event) => {
    if (event.detail?.reduced) {
      if (observer) {
        observer.disconnect();
        observer = null;
      }
      revealItems.forEach(reveal);
    }
  };

  observePending();
  window.addEventListener("portfolio:motionchange", onMotionChange);

  return () => {
    observer?.disconnect();
    window.removeEventListener("portfolio:motionchange", onMotionChange);
  };
}

function initActiveNavigation() {
  const links = unique([
    ...document.querySelectorAll('[data-site-nav] a[href*="#"]'),
    ...document.querySelectorAll('.site-nav a[href^="#"]'),
  ]);
  const linkSections = links
    .map((link) => ({ link, section: document.getElementById(getHash(link)) }))
    .filter(({ section }) => section);

  if (!linkSections.length) {
    return () => {};
  }

  const ratios = new Map();
  let observer = null;
  let activeId = "";

  const setActive = (id) => {
    if (!id || id === activeId) {
      return;
    }

    activeId = id;
    linkSections.forEach(({ link, section }) => {
      const active = section.id === id;
      link.classList.toggle("is-active", active);
      link.dataset.active = String(active);

      if (active) {
        link.setAttribute("aria-current", "location");
      } else {
        link.removeAttribute("aria-current");
      }
    });

    window.dispatchEvent(
      new CustomEvent("portfolio:sectionchange", { detail: { id } }),
    );
  };

  const chooseActive = () => {
    const intersecting = linkSections
      .map(({ section }) => ({ section, ratio: ratios.get(section) || 0 }))
      .filter(({ ratio }) => ratio > 0)
      .sort((a, b) => b.ratio - a.ratio);

    if (intersecting[0]) {
      setActive(intersecting[0].section.id);
      return;
    }

    const marker = window.scrollY + window.innerHeight * 0.38;
    const passed = linkSections
      .filter(({ section }) => section.offsetTop <= marker)
      .at(-1);

    setActive((passed || linkSections[0]).section.id);
  };

  if ("IntersectionObserver" in window) {
    observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => ratios.set(entry.target, entry.intersectionRatio));
        chooseActive();
      },
      {
        rootMargin: "-22% 0px -58% 0px",
        threshold: [0, 0.15, 0.35, 0.65, 1],
      },
    );

    linkSections.forEach(({ section }) => observer.observe(section));
  }

  let frame = 0;
  const onScroll = () => {
    if (frame) {
      return;
    }

    frame = window.requestAnimationFrame(() => {
      frame = 0;
      if (!observer) {
        chooseActive();
      }
    });
  };

  window.addEventListener("scroll", onScroll, { passive: true });
  chooseActive();

  return () => {
    observer?.disconnect();
    window.removeEventListener("scroll", onScroll);
    if (frame) {
      window.cancelAnimationFrame(frame);
    }
  };
}

function initScrollProgress() {
  const indicators = Array.from(
    document.querySelectorAll("[data-scroll-progress]"),
  );

  if (!indicators.length) {
    return () => {};
  }

  let frame = 0;

  const update = () => {
    frame = 0;
    const scrollable = Math.max(
      0,
      document.documentElement.scrollHeight - window.innerHeight,
    );
    const progress = scrollable
      ? Math.min(1, Math.max(0, window.scrollY / scrollable))
      : 0;
    const percentage = progress * 100;

    indicators.forEach((indicator) => {
      indicator.style.setProperty("--scroll-progress", `${percentage}%`);
      indicator.style.transform = `scaleX(${progress})`;
      indicator.dataset.progress = percentage.toFixed(2);
      indicator.setAttribute("aria-valuemin", "0");
      indicator.setAttribute("aria-valuemax", "100");
      indicator.setAttribute("aria-valuenow", String(Math.round(percentage)));

      if (indicator instanceof HTMLProgressElement) {
        indicator.max = 100;
        indicator.value = percentage;
      }
    });
  };

  const requestUpdate = () => {
    if (!frame) {
      frame = window.requestAnimationFrame(update);
    }
  };

  window.addEventListener("scroll", requestUpdate, { passive: true });
  window.addEventListener("resize", requestUpdate, { passive: true });
  update();

  return () => {
    window.removeEventListener("scroll", requestUpdate);
    window.removeEventListener("resize", requestUpdate);
    if (frame) {
      window.cancelAnimationFrame(frame);
    }
  };
}

export function initMotion() {
  const cleanups = [
    initReveals(),
    initActiveNavigation(),
    initScrollProgress(),
  ];

  return () => cleanups.forEach((cleanup) => cleanup());
}
