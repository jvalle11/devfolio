import { initTheme } from "./theme.js";
import { initMotion } from "./motion.js";
import { initMedia } from "./media.js?v=20260715-9";
import { initExperience } from "./experience.js?v=20260715-7";
import { initVehicle } from "./vehicle.js";
import { initHero } from "./hero.js";
import { initCapabilities } from "./capabilities.js";
import { initDelivery } from "./delivery.js?v=20260715-8";

document.documentElement.classList.add("js");

function initMobileNavigation() {
  const toggles = Array.from(
    document.querySelectorAll("[data-nav-toggle], .site-nav__toggle"),
  );
  const cleanups = [];

  toggles.forEach((toggle, index) => {
    const navRoot =
      toggle.closest("[data-site-header], [data-nav-root], header") ||
      toggle.parentElement;
    const controlledId = toggle.getAttribute("aria-controls");
    const menu =
      (controlledId && document.getElementById(controlledId)) ||
      navRoot?.querySelector("[data-nav-menu], .site-nav__links, .nav-links");

    if (!navRoot || !menu) {
      return;
    }

    menu.id ||= `site-nav-menu-${index + 1}`;
    toggle.setAttribute("aria-controls", menu.id);

    let open = toggle.getAttribute("aria-expanded") === "true";

    const setOpen = (nextOpen, { returnFocus = false } = {}) => {
      open = Boolean(nextOpen);
      toggle.setAttribute("aria-expanded", String(open));
      toggle.setAttribute(
        "aria-label",
        open ? "Close navigation" : "Open navigation",
      );
      toggle.dataset.state = open ? "open" : "closed";
      menu.dataset.state = open ? "open" : "closed";
      menu.classList.toggle("is-open", open);
      navRoot.classList.toggle("is-open", open);
      document.body.classList.toggle("nav-open", open);

      if (!open && returnFocus) {
        toggle.focus();
      }
    };

    const onToggle = () => setOpen(!open);
    const onMenuClick = (event) => {
      if (event.target.closest('a[href*="#"]')) {
        setOpen(false);
      }
    };
    const onDocumentClick = (event) => {
      if (open && !navRoot.contains(event.target)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event) => {
      if (open && event.key === "Escape") {
        event.preventDefault();
        setOpen(false, { returnFocus: true });
      }
    };

    const desktopQuery = window.matchMedia("(min-width: 64rem)");
    const onBreakpointChange = (event) => {
      if (event.matches) {
        setOpen(false);
      }
    };

    toggle.addEventListener("click", onToggle);
    menu.addEventListener("click", onMenuClick);
    document.addEventListener("click", onDocumentClick);
    document.addEventListener("keydown", onKeyDown);

    if (typeof desktopQuery.addEventListener === "function") {
      desktopQuery.addEventListener("change", onBreakpointChange);
      cleanups.push(() =>
        desktopQuery.removeEventListener("change", onBreakpointChange),
      );
    } else {
      desktopQuery.addListener(onBreakpointChange);
      cleanups.push(() => desktopQuery.removeListener(onBreakpointChange));
    }

    cleanups.push(() => toggle.removeEventListener("click", onToggle));
    cleanups.push(() => menu.removeEventListener("click", onMenuClick));
    cleanups.push(() => document.removeEventListener("click", onDocumentClick));
    cleanups.push(() => document.removeEventListener("keydown", onKeyDown));
    setOpen(open);
  });

  return () => cleanups.forEach((cleanup) => cleanup());
}

function initPreviewForms() {
  const forms = Array.from(document.querySelectorAll("[data-preview-form]"));
  const cleanups = [];

  forms.forEach((form) => {
    const status = form.querySelector("[data-form-status]");
    const onSubmit = (event) => {
      event.preventDefault();

      if (status) {
        status.textContent =
          "Preview only — validation passed and no message was sent.";
      }
    };

    form.addEventListener("submit", onSubmit);
    cleanups.push(() => form.removeEventListener("submit", onSubmit));
  });

  return () => cleanups.forEach((cleanup) => cleanup());
}

function boot() {
  if (document.documentElement.dataset.appReady === "true") {
    return;
  }

  document.documentElement.dataset.appReady = "true";

  const cleanups = [
    initTheme(),
    initMobileNavigation(),
    initHero(),
    initMotion(),
    initMedia(),
    initExperience(),
    initVehicle(),
    initCapabilities(),
    initDelivery(),
    initPreviewForms(),
  ];

  window.addEventListener(
    "pagehide",
    (event) => {
      if (!event.persisted) {
        cleanups.forEach((cleanup) => cleanup());
      }
    },
    { once: true },
  );
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot, { once: true });
} else {
  boot();
}
