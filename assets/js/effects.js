import { isReducedMotion } from "./theme.js";

// Signature interaction layer. Every effect here is decorative: the page reads
// and works the same without it, and each one steps aside when motion is
// reduced (site toggle or OS setting) or when the pointer cannot hover.

const root = document.documentElement;
const systemReducedQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
const finePointerQuery = window.matchMedia("(hover: hover) and (pointer: fine)");

const clamp = (value, minimum, maximum) =>
  Math.min(maximum, Math.max(minimum, value));

function motionAllowed() {
  return !isReducedMotion() && !systemReducedQuery.matches;
}

function canHover() {
  return finePointerQuery.matches;
}

function onMotionChange(callback) {
  window.addEventListener("portfolio:motionchange", callback);
  return () => window.removeEventListener("portfolio:motionchange", callback);
}

// Wraps each word of an element's text in spans while keeping inline elements
// (such as the headline accent) and the original whitespace intact.
function splitWords(element, { wordClass, innerClass }) {
  const words = [];

  const walk = (node) => {
    Array.from(node.childNodes).forEach((child) => {
      if (child.nodeType === Node.ELEMENT_NODE) {
        walk(child);
        return;
      }

      if (child.nodeType !== Node.TEXT_NODE || !child.textContent.trim()) {
        return;
      }

      const fragment = document.createDocumentFragment();
      child.textContent.split(/(\s+)/).forEach((part) => {
        if (!part) return;
        if (/^\s+$/.test(part)) {
          fragment.append(document.createTextNode(part));
          return;
        }

        const word = document.createElement("span");
        word.className = wordClass;
        if (innerClass) {
          const inner = document.createElement("span");
          inner.className = innerClass;
          inner.textContent = part;
          word.append(inner);
        } else {
          word.textContent = part;
        }
        fragment.append(word);
        words.push(word);
      });
      child.replaceWith(fragment);
    });
  };

  walk(element);
  words.forEach((word, index) => {
    word.style.setProperty("--i", String(index));
  });
  element.style.setProperty("--n", String(words.length));
  return words;
}

/* Hero headline: words rise out of a blur, one after another. */
function initKineticHeadline() {
  const heading = document.querySelector("[data-kinetic]");
  if (!heading) return () => {};

  splitWords(heading, { wordClass: "kinetic-word", innerClass: "kinetic-word__inner" });

  if (!motionAllowed()) {
    heading.classList.add("is-kinetic-done");
    return () => {};
  }

  heading.classList.add("is-kinetic");
  const start = window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => heading.classList.add("is-kinetic-in"));
  });

  return () => window.cancelAnimationFrame(start);
}

/* Small uppercase labels decode from glyph noise when they scroll in. */
function initDecodeLabels() {
  const labels = Array.from(
    document.querySelectorAll(
      ".section-index, .project-chapter__eyebrow, .hero__name, .fivem-card__label",
    ),
  ).filter((label) => label.children.length === 0 && label.textContent.trim());

  if (!labels.length || !("IntersectionObserver" in window)) return () => {};

  const glyphs = "▪▫/\\<>_-+=*#01ABCDEFXYZ";
  const running = new Set();

  const decode = (label) => {
    if (!motionAllowed()) return;
    const finalText = label.textContent;
    const readable = document.createElement("span");
    readable.className = "sr-only";
    readable.textContent = finalText;
    const noise = document.createElement("span");
    noise.setAttribute("aria-hidden", "true");
    label.replaceChildren(readable, noise);

    const duration = 520 + finalText.length * 22;
    const startedAt = performance.now();
    let frame = 0;

    const tick = (now) => {
      const progress = clamp((now - startedAt) / duration, 0, 1);
      const settled = Math.floor(progress * finalText.length);
      let output = finalText.slice(0, settled);
      for (let index = settled; index < finalText.length; index += 1) {
        const character = finalText[index];
        output += character === " "
          ? " "
          : glyphs[Math.floor(Math.random() * glyphs.length)];
      }
      noise.textContent = output;

      if (progress < 1) {
        frame = window.requestAnimationFrame(tick);
        running.add(finish);
      } else {
        finish();
      }
    };

    function finish() {
      window.cancelAnimationFrame(frame);
      running.delete(finish);
      label.textContent = finalText;
    }

    frame = window.requestAnimationFrame(tick);
  };

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        observer.unobserve(entry.target);
        decode(entry.target);
      });
    },
    { rootMargin: "0px 0px -12% 0px", threshold: 0.6 },
  );

  labels.forEach((label) => observer.observe(label));

  return () => {
    observer.disconnect();
    Array.from(running).forEach((finish) => finish());
  };
}

/* Large headings fill word by word as they travel up the viewport. */
function initScrollFill() {
  const headings = Array.from(
    document.querySelectorAll(
      ".section-heading h2, .project-chapter__header h3, .contact h2, .fivem-card h3",
    ),
  ).filter((heading) => heading.children.length === 0);

  if (!headings.length) return () => {};

  headings.forEach((heading) => {
    splitWords(heading, { wordClass: "fill-word" });
    heading.classList.add("fx-fill");
  });

  const active = new Set();
  let frame = 0;

  const update = () => {
    frame = 0;
    const viewport = window.innerHeight || 1;
    active.forEach((heading) => {
      const { top } = heading.getBoundingClientRect();
      // 0 when the heading enters the lower edge, 1 by the upper-middle.
      const progress = clamp((viewport * 0.92 - top) / (viewport * 0.5), 0, 1);
      heading.style.setProperty("--p", progress.toFixed(3));
    });
  };

  const requestUpdate = () => {
    if (!frame) frame = window.requestAnimationFrame(update);
  };

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) active.add(entry.target);
      else active.delete(entry.target);
    });
    requestUpdate();
  });

  headings.forEach((heading) => observer.observe(heading));
  window.addEventListener("scroll", requestUpdate, { passive: true });
  window.addEventListener("resize", requestUpdate, { passive: true });

  return () => {
    observer.disconnect();
    window.removeEventListener("scroll", requestUpdate);
    window.removeEventListener("resize", requestUpdate);
    if (frame) window.cancelAnimationFrame(frame);
  };
}

/* Cursor-tracked light on cards: a soft fill plus an edge that catches it. */
function initSpotlight() {
  // Rows get a soft wash; surfaces that read as cards also get a lit edge.
  const targets = [
    [".hero-project", false],
    [".experience-directory__button", false],
    [".history-row", false],
    [".delivery-stage", false],
    [".credential", false],
    [".experience-chronology__card", true],
    [".vision-showcase", true],
    [".capability-group", true],
  ];

  const hosts = [];
  targets.forEach(([selector, withEdge]) => {
    document.querySelectorAll(selector).forEach((host) => {
      if (host.classList.contains("has-spotlight")) return;
      const layers = withEdge ? ["fx-spotlight", "fx-spotlight-edge"] : ["fx-spotlight"];
      layers.forEach((className) => {
        const layer = document.createElement("span");
        layer.className = className;
        layer.setAttribute("aria-hidden", "true");
        host.append(layer);
      });
      host.classList.add("has-spotlight");
      if (getComputedStyle(host).position === "static") {
        host.classList.add("has-spotlight--anchor");
      }
      hosts.push(host);
    });
  });

  if (!hosts.length) return () => {};

  let lit = null;
  let frame = 0;
  let lastEvent = null;

  const apply = () => {
    frame = 0;
    if (!lastEvent) return;
    const host = lastEvent.target instanceof Element
      ? lastEvent.target.closest(".has-spotlight")
      : null;

    if (lit && lit !== host) lit.classList.remove("is-lit");
    lit = host;
    if (!host || !canHover()) return;

    const bounds = host.getBoundingClientRect();
    host.style.setProperty("--mx", `${lastEvent.clientX - bounds.left}px`);
    host.style.setProperty("--my", `${lastEvent.clientY - bounds.top}px`);
    host.classList.add("is-lit");
  };

  const onPointerMove = (event) => {
    if (event.pointerType === "touch") return;
    lastEvent = event;
    if (!frame) frame = window.requestAnimationFrame(apply);
  };

  const onLeave = () => {
    lit?.classList.remove("is-lit");
    lit = null;
  };

  document.addEventListener("pointermove", onPointerMove, { passive: true });
  document.documentElement.addEventListener("pointerleave", onLeave);

  return () => {
    document.removeEventListener("pointermove", onPointerMove);
    document.documentElement.removeEventListener("pointerleave", onLeave);
    if (frame) window.cancelAnimationFrame(frame);
  };
}

/* Buttons lean toward the pointer and spring back when it leaves. */
function initMagnetic() {
  const buttons = Array.from(document.querySelectorAll(".button"));
  if (!buttons.length) return () => {};
  const cleanups = [];

  buttons.forEach((button) => {
    button.classList.add("is-magnetic");

    const onMove = (event) => {
      if (!canHover() || !motionAllowed()) return;
      const bounds = button.getBoundingClientRect();
      const x = event.clientX - (bounds.left + bounds.width / 2);
      const y = event.clientY - (bounds.top + bounds.height / 2);
      button.style.setProperty("--mag-x", `${(x * 0.22).toFixed(2)}px`);
      button.style.setProperty("--mag-y", `${(y * 0.32).toFixed(2)}px`);
      button.style.setProperty("--shine-x", `${((event.clientX - bounds.left) / bounds.width) * 100}%`);
    };
    const onLeave = () => {
      button.style.setProperty("--mag-x", "0px");
      button.style.setProperty("--mag-y", "0px");
    };

    button.addEventListener("pointermove", onMove);
    button.addEventListener("pointerleave", onLeave);
    cleanups.push(() => button.removeEventListener("pointermove", onMove));
    cleanups.push(() => button.removeEventListener("pointerleave", onLeave));
  });

  return () => cleanups.forEach((cleanup) => cleanup());
}

/* Media frames open like an aperture the first time they scroll in. */
function initMediaReveal() {
  const frames = Array.from(
    document.querySelectorAll(".media-frame, .fivem-card__media, .evidence-reel__surface"),
  );

  if (!frames.length || !("IntersectionObserver" in window) || !motionAllowed()) {
    return () => {};
  }

  frames.forEach((frame) => frame.classList.add("fx-aperture"));

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-open");
        observer.unobserve(entry.target);
      });
    },
    { rootMargin: "0px 0px -8% 0px", threshold: 0.15 },
  );

  frames.forEach((frame) => observer.observe(frame));

  const openAll = (event) => {
    if (event.detail?.reduced) frames.forEach((frame) => frame.classList.add("is-open"));
  };
  const removeMotionListener = onMotionChange(openAll);

  return () => {
    observer.disconnect();
    removeMotionListener();
  };
}

/* Media tilts toward the pointer with a moving highlight. */
function initTilt() {
  const cards = Array.from(document.querySelectorAll(".media-frame, .fivem-card__media"));
  if (!cards.length) return () => {};
  const cleanups = [];

  cards.forEach((card) => {
    const glare = document.createElement("span");
    glare.className = "fx-glare";
    glare.setAttribute("aria-hidden", "true");
    card.append(glare);
    card.classList.add("fx-tilt");

    const onMove = (event) => {
      if (!canHover() || !motionAllowed()) return;
      const bounds = card.getBoundingClientRect();
      const x = (event.clientX - bounds.left) / bounds.width;
      const y = (event.clientY - bounds.top) / bounds.height;
      card.style.setProperty("--tilt-x", `${((0.5 - y) * 7).toFixed(2)}deg`);
      card.style.setProperty("--tilt-y", `${((x - 0.5) * 9).toFixed(2)}deg`);
      card.style.setProperty("--glare-x", `${(x * 100).toFixed(1)}%`);
      card.style.setProperty("--glare-y", `${(y * 100).toFixed(1)}%`);
      card.classList.add("is-tilting");
    };
    const onLeave = () => {
      card.style.setProperty("--tilt-x", "0deg");
      card.style.setProperty("--tilt-y", "0deg");
      card.classList.remove("is-tilting");
    };

    card.addEventListener("pointermove", onMove);
    card.addEventListener("pointerleave", onLeave);
    cleanups.push(() => card.removeEventListener("pointermove", onMove));
    cleanups.push(() => card.removeEventListener("pointerleave", onLeave));
  });

  return () => cleanups.forEach((cleanup) => cleanup());
}

/* Ticker speed and direction follow the reader's scroll. */
function initMarquee() {
  const marquee = document.querySelector("[data-marquee]");
  const track = marquee?.querySelector("[data-marquee-track]");
  if (!marquee || !track || typeof track.getAnimations !== "function") return () => {};

  let lastY = window.scrollY;
  let velocity = 0;
  let direction = 1;
  let frame = 0;
  let visible = true;

  const getAnimation = () =>
    track.getAnimations().find((animation) => animation.animationName === "marquee-run");

  const tick = () => {
    frame = 0;
    const animation = getAnimation();
    if (!animation) return;

    const y = window.scrollY;
    const delta = y - lastY;
    lastY = y;
    if (Math.abs(delta) > 0.5) direction = Math.sign(delta);
    velocity += (delta - velocity) * 0.2;

    const boost = clamp(Math.abs(velocity) / 10, 0, 3.5);
    animation.playbackRate = direction * (1 + boost);
    marquee.style.setProperty("--marquee-skew", `${clamp(-velocity * 0.18, -7, 7).toFixed(2)}deg`);

    if (Math.abs(velocity) > 0.05 && visible) frame = window.requestAnimationFrame(tick);
    else marquee.style.setProperty("--marquee-skew", "0deg");
  };

  const onScroll = () => {
    if (!visible || !motionAllowed()) return;
    if (!frame) frame = window.requestAnimationFrame(tick);
  };

  const observer = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    marquee.classList.toggle("is-offscreen", !visible);
  });
  observer.observe(marquee);
  window.addEventListener("scroll", onScroll, { passive: true });

  return () => {
    observer.disconnect();
    window.removeEventListener("scroll", onScroll);
    if (frame) window.cancelAnimationFrame(frame);
  };
}

/* Footer name: an outline that fills in wherever the pointer shines on it. */
function initWordmark() {
  const mark = document.querySelector("[data-wordmark]");
  if (!mark) return () => {};

  const onMove = (event) => {
    if (!canHover()) return;
    const bounds = mark.getBoundingClientRect();
    mark.style.setProperty("--wx", `${event.clientX - bounds.left}px`);
    mark.style.setProperty("--wy", `${event.clientY - bounds.top}px`);
    mark.classList.add("is-lit");
  };
  const onLeave = () => mark.classList.remove("is-lit");

  mark.addEventListener("pointermove", onMove);
  mark.addEventListener("pointerleave", onLeave);

  return () => {
    mark.removeEventListener("pointermove", onMove);
    mark.removeEventListener("pointerleave", onLeave);
  };
}

/* A trailing ring that eases after the pointer and swells over controls. */
function initCursorRing() {
  const ring = document.createElement("div");
  ring.className = "fx-cursor";
  ring.setAttribute("aria-hidden", "true");
  document.body.append(ring);

  const interactive = "a, button, summary, label, input, textarea, select, [role='tab'], [data-hero-project]";
  const target = { x: -100, y: -100 };
  const current = { x: -100, y: -100 };
  let frame = 0;
  let enabled = false;

  const render = () => {
    current.x += (target.x - current.x) * 0.2;
    current.y += (target.y - current.y) * 0.2;
    ring.style.transform = `translate3d(${current.x}px, ${current.y}px, 0)`;
    const settled = Math.abs(target.x - current.x) < 0.1 && Math.abs(target.y - current.y) < 0.1;
    frame = settled ? 0 : window.requestAnimationFrame(render);
  };

  const onMove = (event) => {
    if (!enabled || event.pointerType !== "mouse") return;
    target.x = event.clientX;
    target.y = event.clientY;
    ring.classList.add("is-visible");
    ring.classList.toggle(
      "is-active",
      event.target instanceof Element && Boolean(event.target.closest(interactive)),
    );
    if (!frame) frame = window.requestAnimationFrame(render);
  };
  const onDown = () => ring.classList.add("is-pressed");
  const onUp = () => ring.classList.remove("is-pressed");
  const onLeave = () => ring.classList.remove("is-visible");

  const sync = () => {
    enabled = canHover() && motionAllowed();
    if (!enabled) ring.classList.remove("is-visible");
  };

  sync();
  document.addEventListener("pointermove", onMove, { passive: true });
  document.addEventListener("pointerdown", onDown);
  document.addEventListener("pointerup", onUp);
  document.documentElement.addEventListener("pointerleave", onLeave);
  const removeMotionListener = onMotionChange(sync);

  return () => {
    document.removeEventListener("pointermove", onMove);
    document.removeEventListener("pointerdown", onDown);
    document.removeEventListener("pointerup", onUp);
    document.documentElement.removeEventListener("pointerleave", onLeave);
    removeMotionListener();
    if (frame) window.cancelAnimationFrame(frame);
    ring.remove();
  };
}

/* Header: glass once scrolled, tucks away on the way down, returns on the way up. */
function initSmartHeader() {
  const header = document.querySelector("[data-site-header]");
  if (!header) return () => {};

  let lastY = window.scrollY;
  let frame = 0;

  const update = () => {
    frame = 0;
    const y = window.scrollY;
    const delta = y - lastY;
    lastY = y;

    header.classList.toggle("is-scrolled", y > 8);

    const keepVisible =
      !motionAllowed() ||
      document.body.classList.contains("nav-open") ||
      header.querySelector(":focus-visible") ||
      y < window.innerHeight * 0.6;

    if (keepVisible || delta < -4) header.classList.remove("is-tucked");
    else if (delta > 6) header.classList.add("is-tucked");
  };

  const requestUpdate = () => {
    if (!frame) frame = window.requestAnimationFrame(update);
  };

  window.addEventListener("scroll", requestUpdate, { passive: true });
  header.addEventListener("focusin", requestUpdate);
  update();

  return () => {
    window.removeEventListener("scroll", requestUpdate);
    header.removeEventListener("focusin", requestUpdate);
    if (frame) window.cancelAnimationFrame(frame);
  };
}

/* A single glowing bar glides between navigation links. */
function initNavIndicator() {
  const nav = document.querySelector("[data-site-nav]");
  const indicator = nav?.querySelector("[data-nav-indicator]");
  if (!nav || !indicator) return () => {};

  const links = Array.from(nav.querySelectorAll(":scope > a"));
  const desktopQuery = window.matchMedia("(min-width: 64.01rem)");

  const moveTo = (link) => {
    if (!link || !desktopQuery.matches) {
      indicator.classList.remove("is-placed");
      return;
    }
    indicator.style.setProperty("--indicator-x", `${link.offsetLeft}px`);
    indicator.style.setProperty("--indicator-w", `${link.offsetWidth}px`);
    indicator.classList.add("is-placed");
  };

  const activeLink = () => links.find((link) => link.classList.contains("is-active"));

  nav.classList.add("has-indicator");
  const onEnter = (event) => moveTo(event.currentTarget);
  const onNavLeave = () => moveTo(activeLink());
  const onSection = () => window.requestAnimationFrame(() => moveTo(activeLink()));

  links.forEach((link) => link.addEventListener("pointerenter", onEnter));
  nav.addEventListener("pointerleave", onNavLeave);
  window.addEventListener("portfolio:sectionchange", onSection);
  window.addEventListener("resize", onSection, { passive: true });
  document.fonts?.ready.then(onSection);
  onSection();

  return () => {
    links.forEach((link) => link.removeEventListener("pointerenter", onEnter));
    nav.removeEventListener("pointerleave", onNavLeave);
    window.removeEventListener("portfolio:sectionchange", onSection);
    window.removeEventListener("resize", onSection);
  };
}

/* Hero depth: the aurora follows the pointer and the content lifts away on scroll. */
function initHeroDepth() {
  const hero = document.querySelector("[data-hero-root]");
  if (!hero) return () => {};

  let frame = 0;
  let pointer = null;

  const update = () => {
    frame = 0;
    if (!motionAllowed()) {
      hero.style.setProperty("--hero-exit", "0");
      return;
    }
    const height = hero.offsetHeight || 1;
    hero.style.setProperty("--hero-exit", clamp(window.scrollY / height, 0, 1).toFixed(3));

    if (pointer) {
      const bounds = hero.getBoundingClientRect();
      hero.style.setProperty("--px", (((pointer.x - bounds.left) / bounds.width) * 2 - 1).toFixed(3));
      hero.style.setProperty("--py", (((pointer.y - bounds.top) / bounds.height) * 2 - 1).toFixed(3));
    }
  };

  const requestUpdate = () => {
    if (!frame) frame = window.requestAnimationFrame(update);
  };
  const onPointerMove = (event) => {
    if (event.pointerType === "touch") return;
    pointer = { x: event.clientX, y: event.clientY };
    requestUpdate();
  };

  window.addEventListener("scroll", requestUpdate, { passive: true });
  hero.addEventListener("pointermove", onPointerMove, { passive: true });
  const removeMotionListener = onMotionChange(requestUpdate);
  update();

  return () => {
    window.removeEventListener("scroll", requestUpdate);
    hero.removeEventListener("pointermove", onPointerMove);
    removeMotionListener();
    if (frame) window.cancelAnimationFrame(frame);
  };
}

export function initEffects() {
  root.classList.add("fx");

  const cleanups = [
    initKineticHeadline(),
    initDecodeLabels(),
    initScrollFill(),
    initSpotlight(),
    initMagnetic(),
    initMediaReveal(),
    initTilt(),
    initMarquee(),
    initWordmark(),
    initCursorRing(),
    initSmartHeader(),
    initNavIndicator(),
    initHeroDepth(),
  ];

  return () => cleanups.forEach((cleanup) => cleanup());
}
