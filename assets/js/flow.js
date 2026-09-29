import { isReducedMotion } from "./theme.js";

// Scroll choreography: inertial wheel scrolling, eased in-page navigation,
// sections that rise into place, and staggered entrances for lists and copy.
// Like effects.js, all of it is presentational and stands down for reduced
// motion.

const systemReducedQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
const EASE = "cubic-bezier(0.22, 1, 0.36, 1)";

const clamp = (value, minimum, maximum) =>
  Math.min(maximum, Math.max(minimum, value));

function motionAllowed() {
  return !isReducedMotion() && !systemReducedQuery.matches;
}

function onMotionChange(callback) {
  window.addEventListener("portfolio:motionchange", callback);
  return () => window.removeEventListener("portfolio:motionchange", callback);
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.onload = resolve;
    script.onerror = reject;
    document.head.append(script);
  });
}

/* Inertial wheel scrolling (Lenis). Touch scrolling stays native. */
function initSmoothScroll() {
  let lenis = null;
  let disposed = false;
  let bodyObserver = null;
  const lenisUrl = new URL("./lib/lenis.min.js", import.meta.url).href;

  const start = async () => {
    if (lenis || !motionAllowed()) return;
    try {
      if (!window.Lenis) await loadScript(lenisUrl);
    } catch {
      return;
    }
    if (disposed || lenis || !motionAllowed() || !window.Lenis) return;

    lenis = new window.Lenis({
      autoRaf: true,
      lerp: 0.1,
      wheelMultiplier: 1,
      // Shift+wheel pans the experience timeline sideways, so leave it native.
      virtualScroll: ({ event }) => !event.shiftKey,
    });
    window.portfolioScroll = lenis;

    // The mobile menu locks the page; pause inertia while it is open.
    bodyObserver = new MutationObserver(() => {
      if (document.body.classList.contains("nav-open")) lenis?.stop();
      else lenis?.start();
    });
    bodyObserver.observe(document.body, { attributes: true, attributeFilter: ["class"] });
  };

  const stop = () => {
    bodyObserver?.disconnect();
    bodyObserver = null;
    lenis?.destroy();
    lenis = null;
    window.portfolioScroll = undefined;
  };

  const sync = () => (motionAllowed() ? start() : stop());
  const removeMotionListener = onMotionChange(sync);
  start();

  return () => {
    disposed = true;
    removeMotionListener();
    stop();
  };
}

/* Same-page links glide to their target while keeping the hash behavior. */
function initAnchorGlide() {
  const onClick = (event) => {
    if (event.defaultPrevented || event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

    const link = event.target instanceof Element ? event.target.closest("a[href*='#']") : null;
    if (!link || link.target === "_blank") return;

    const url = new URL(link.href, window.location.href);
    if (url.origin !== window.location.origin || url.pathname !== window.location.pathname) return;

    const id = decodeURIComponent(url.hash.slice(1));
    const target = id && document.getElementById(id);
    const lenis = window.portfolioScroll;
    if (!target || !lenis || !motionAllowed()) return;

    event.preventDefault();
    const keyboard = event.detail === 0;
    lenis.scrollTo(target, {
      duration: 1.3,
      easing: (t) => 1 - Math.pow(1 - t, 4),
      onComplete: () => {
        if (!keyboard) return;
        if (!target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
        target.focus({ preventScroll: true });
      },
    });

    if (window.location.hash !== url.hash) {
      history.pushState(null, "", url.hash);
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    }
  };

  document.addEventListener("click", onClick);
  return () => document.removeEventListener("click", onClick);
}

/* Each section rises in as a rounded panel that widens to full bleed. */
function initSectionRise() {
  const sections = Array.from(document.querySelectorAll(".section-band"));
  if (!sections.length) return () => {};

  const active = new Set();
  let frame = 0;

  const update = () => {
    frame = 0;
    const viewport = window.innerHeight || 1;
    const allowed = motionAllowed();
    active.forEach((section) => {
      const { top } = section.getBoundingClientRect();
      const rise = allowed ? clamp((viewport - top) / (viewport * 0.6), 0, 1) : 1;
      section.style.setProperty("--rise", rise.toFixed(3));
      section.classList.toggle("is-rising", rise < 0.999);
    });
  };

  const requestUpdate = () => {
    if (!frame) frame = window.requestAnimationFrame(update);
  };

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        active.add(entry.target);
      } else {
        active.delete(entry.target);
        const below = entry.boundingClientRect.top > 0;
        entry.target.style.setProperty("--rise", below && motionAllowed() ? "0" : "1");
        entry.target.classList.toggle("is-rising", below && motionAllowed());
      }
    });
    requestUpdate();
  });

  sections.forEach((section) => {
    section.classList.add("fx-rise");
    observer.observe(section);
  });
  window.addEventListener("scroll", requestUpdate, { passive: true });
  window.addEventListener("resize", requestUpdate, { passive: true });
  const removeMotionListener = onMotionChange(requestUpdate);

  return () => {
    observer.disconnect();
    window.removeEventListener("scroll", requestUpdate);
    window.removeEventListener("resize", requestUpdate);
    removeMotionListener();
    if (frame) window.cancelAnimationFrame(frame);
  };
}

// Plays one entrance per group the first time it scrolls into view. The Web
// Animations API is used so existing CSS transitions on these elements stay
// untouched.
function revealOnce(groups, { rootMargin = "0px 0px -8% 0px", threshold = 0.12 } = {}) {
  if (!groups.length || !("IntersectionObserver" in window)) return () => {};

  const pending = new Map(groups.map((group) => [group.root, group]));
  pending.forEach(({ items }) => items.forEach((item) => item.classList.add("fx-pending")));

  const release = ({ items }) => items.forEach((item) => item.classList.remove("fx-pending"));

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const group = pending.get(entry.target);
        if (!group) return;
        pending.delete(entry.target);
        observer.unobserve(entry.target);
        group.items.forEach((item, index) => {
          item.animate(group.keyframes, {
            duration: group.duration,
            delay: (group.delay || 0) + index * group.step,
            easing: EASE,
            fill: "backwards",
          });
        });
        release(group);
      });
    },
    { rootMargin, threshold },
  );

  pending.forEach((group, root) => observer.observe(root));

  const revealAll = (event) => {
    if (!event.detail?.reduced) return;
    pending.forEach(release);
    pending.clear();
    observer.disconnect();
  };
  const removeMotionListener = onMotionChange(revealAll);

  return () => {
    observer.disconnect();
    removeMotionListener();
    pending.forEach(release);
  };
}

/* Rows, steps, and chips arrive one after another. */
function initStaggers() {
  if (!motionAllowed()) return () => {};

  const recipes = [
    [".hero-projects", ":scope > li > .hero-project", 90, 1150],
    [".experience-directory__list", ":scope > li", 60],
    [".workflow-map", ":scope > li", 90],
    [".vision-pipeline", ":scope > li", 70],
    [".capability-toolbelt", ":scope > li", 80],
    [".credential-column", ":scope > .credential", 80],
    [".contact-links", ":scope > a", 70],
    [".technology-list", ":scope > li", 45],
  ];

  const groups = [];
  recipes.forEach(([rootSelector, itemSelector, step, delay = 0]) => {
    document.querySelectorAll(rootSelector).forEach((root) => {
      // Content inside a collapsed <details> never intersects; it has its own
      // open animation instead.
      if (root.closest("details")) return;
      const items = Array.from(root.querySelectorAll(itemSelector));
      if (!items.length) return;
      groups.push({
        root,
        items,
        step,
        delay,
        duration: 900,
        keyframes: [
          { opacity: 0, transform: "translate3d(0, 22px, 0)" },
          { opacity: 1, transform: "translate3d(0, 0, 0)" },
        ],
      });
    });
  });

  return revealOnce(groups);
}

/* Intro paragraphs surface word by word, like a line of type settling. */
function initWordRise() {
  if (!motionAllowed()) return () => {};

  const paragraphs = Array.from(
    document.querySelectorAll(
      ".hero__subhead, .section-heading > div > p, .project-chapter__summary, .contact__grid > div > p:not(.section-index)",
    ),
  ).filter(
    (paragraph) =>
      paragraph.children.length === 0 &&
      paragraph.textContent.trim() &&
      !paragraph.closest("details"),
  );

  const groups = paragraphs.map((paragraph) => {
    const words = [];
    const fragment = document.createDocumentFragment();
    paragraph.textContent.split(/(\s+)/).forEach((part) => {
      if (!part) return;
      if (/^\s+$/.test(part)) {
        fragment.append(document.createTextNode(part));
        return;
      }
      const word = document.createElement("span");
      word.className = "rise-word";
      word.textContent = part;
      fragment.append(word);
      words.push(word);
    });
    paragraph.replaceChildren(fragment);

    const inHero = Boolean(paragraph.closest(".hero"));
    return {
      root: paragraph,
      items: words,
      // Longer paragraphs settle at the same overall pace as short ones.
      step: clamp(520 / words.length, 6, 22),
      delay: inHero ? (document.documentElement.classList.contains("has-intro") ? 1700 : 650) : 60,
      duration: 800,
      keyframes: [
        { opacity: 0, transform: "translate3d(0, 0.5em, 0)", filter: "blur(4px)" },
        { opacity: 1, transform: "translate3d(0, 0, 0)", filter: "blur(0px)" },
      ],
    };
  });

  return revealOnce(groups, { threshold: 0.3 });
}

export function initFlow() {
  const cleanups = [
    initSmoothScroll(),
    initAnchorGlide(),
    initSectionRise(),
    initStaggers(),
    initWordRise(),
  ];

  return () => cleanups.forEach((cleanup) => cleanup());
}
