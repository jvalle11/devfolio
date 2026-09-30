import { isReducedMotion } from "./theme.js";

// Scroll-driven delivery sequence: on wide screens the AI delivery studio pins
// in place and scrolling steps through Discovery → Rollout. Choosing a step
// directly glides the page to that step's stretch of the scroll, so the two
// never disagree. Narrow screens and reduced motion keep the plain tabs.

const systemReducedQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
const wideQuery = window.matchMedia("(min-width: 64.01rem)");
const clamp = (value, minimum, maximum) =>
  Math.min(maximum, Math.max(minimum, value));

function initDeliveryStory(root) {
  const tabs = Array.from(root.querySelectorAll("[data-delivery-tab]"));
  if (tabs.length < 2) return () => {};

  const track = document.createElement("div");
  track.className = "delivery-scrolly";
  root.before(track);
  track.append(root);

  const steps = tabs.length;
  let enabled = false;
  let frame = 0;
  let stickyTop = 0;
  let range = 1;
  let scrollIndex = -1;

  // The pinned position is set from the viewport only, so a taller panel
  // grows downward instead of nudging the whole studio up and down.
  let pinnedFor = 0;

  const measure = () => {
    const viewport = window.innerHeight;
    const height = root.offsetHeight;
    const headerRoom = 96;
    const fits = height < viewport - headerRoom - 24;
    const allowed = wideQuery.matches && !isReducedMotion() && !systemReducedQuery.matches;

    enabled = allowed && fits;
    track.classList.toggle("is-pinned", enabled);
    if (!enabled) {
      track.style.removeProperty("--scrolly-height");
      track.style.removeProperty("--scrolly-top");
      track.style.removeProperty("--scrolly-progress");
      return;
    }

    if (pinnedFor !== viewport || !stickyTop) {
      pinnedFor = viewport;
      stickyTop = Math.max(headerRoom, Math.round((viewport - height) / 2));
    }
    const stepLength = Math.round(viewport * 0.42);
    range = stepLength * (steps - 1) + stepLength * 0.6;
    track.style.setProperty("--scrolly-top", `${stickyTop}px`);
    track.style.setProperty("--scrolly-height", `${Math.round(height + range)}px`);
  };

  const trackStart = () => track.getBoundingClientRect().top + window.scrollY - stickyTop;

  const update = () => {
    frame = 0;
    if (!enabled) return;
    const progress = clamp((window.scrollY - trackStart()) / range, 0, 1);
    track.style.setProperty("--scrolly-progress", progress.toFixed(4));
    const index = Math.min(steps - 1, Math.floor(progress * steps * 0.9999 + 0.0001));
    if (index !== scrollIndex) {
      scrollIndex = index;
      if (Number(root.dataset.deliveryIndex) !== index) tabs[index].click();
    }
  };

  const requestUpdate = () => {
    if (!frame) frame = window.requestAnimationFrame(update);
  };

  // A step chosen by click or arrow keys moves the page to match it.
  const glideTo = (index) => {
    const top = trackStart() + ((index + 0.5) / steps) * range;
    const lenis = window.portfolioScroll;
    if (lenis) lenis.scrollTo(top, { duration: 0.9 });
    else window.scrollTo({ top, behavior: "smooth" });
  };

  const observer = new MutationObserver(() => {
    const index = Number(root.dataset.deliveryIndex);
    if (!enabled || !Number.isFinite(index) || index === scrollIndex) return;
    scrollIndex = index;
    glideTo(index);
  });
  observer.observe(root, { attributes: true, attributeFilter: ["data-delivery-index"] });

  const refresh = () => {
    measure();
    requestUpdate();
  };

  const resizeObserver = new ResizeObserver(refresh);
  resizeObserver.observe(root);
  window.addEventListener("scroll", requestUpdate, { passive: true });
  window.addEventListener("resize", refresh, { passive: true });
  window.addEventListener("portfolio:motionchange", refresh);
  wideQuery.addEventListener?.("change", refresh);
  refresh();

  return () => {
    observer.disconnect();
    resizeObserver.disconnect();
    window.removeEventListener("scroll", requestUpdate);
    window.removeEventListener("resize", refresh);
    window.removeEventListener("portfolio:motionchange", refresh);
    wideQuery.removeEventListener?.("change", refresh);
    if (frame) window.cancelAnimationFrame(frame);
    track.before(root);
    track.remove();
  };
}

export function initStory() {
  const cleanups = Array.from(document.querySelectorAll("[data-delivery]")).map(initDeliveryStory);
  return () => cleanups.forEach((cleanup) => cleanup());
}
