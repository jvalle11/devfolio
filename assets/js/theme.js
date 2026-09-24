// These keys intentionally match the tiny, pre-render preference script in
// the page head so the first paint and the interactive controls stay aligned.
const THEME_STORAGE_KEY = "jv-theme";
const MOTION_STORAGE_KEY = "jv-motion";

const root = document.documentElement;
const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

function readStorage(key) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key, value) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // The preference still applies for this page when storage is unavailable.
  }
}

function normalizeTheme(value) {
  return value === "light" ? "light" : "dark";
}

function normalizeMotion(value) {
  return value === "reduced" || value === "full" ? value : "system";
}

function announce(name, detail) {
  window.dispatchEvent(new CustomEvent(name, { detail }));
}

function applyTheme(value, { persist = false, notify = true } = {}) {
  const theme = normalizeTheme(value);

  root.dataset.theme = theme;
  root.style.colorScheme = theme;

  if (persist) {
    writeStorage(THEME_STORAGE_KEY, theme);
  }

  if (notify) {
    announce("portfolio:themechange", { theme });
  }

  return theme;
}

function effectiveMotion(preference) {
  if (preference === "system") {
    return motionQuery.matches ? "reduced" : "full";
  }

  return preference;
}

function applyMotion(value, { persist = false, notify = true } = {}) {
  const preference = normalizeMotion(value);
  const motion = effectiveMotion(preference);

  root.dataset.motion = motion;
  root.dataset.motionPreference = preference;
  root.classList.toggle("motion-reduced", motion === "reduced");

  if (persist) {
    writeStorage(MOTION_STORAGE_KEY, preference);
  }

  if (notify) {
    announce("portfolio:motionchange", {
      motion,
      preference,
      reduced: motion === "reduced",
    });
  }

  return { motion, preference };
}

function setThemeControlState(control, theme) {
  const nextTheme = theme === "dark" ? "light" : "dark";
  const label = control.querySelector("[data-theme-label]");

  control.dataset.state = theme;
  control.setAttribute("aria-pressed", String(theme === "light"));
  control.title = `Switch to ${nextTheme} theme`;

  if (label) {
    label.textContent = nextTheme === "light" ? "Light mode" : "Dark mode";
  }
}

function setMotionControlState(control, motion, preference) {
  const reduced = motion === "reduced";
  const label =
    control.querySelector("[data-motion-label]") ||
    control.querySelector(".utility-button__label");

  control.dataset.state = motion;
  control.dataset.preference = preference;
  control.setAttribute("aria-pressed", String(reduced));
  control.setAttribute(
    "aria-label",
    reduced
      ? "Motion is reduced. Switch to full motion."
      : "Motion is full. Reduce motion.",
  );
  control.title = reduced ? "Switch to full motion" : "Reduce motion";

  if (label) {
    label.textContent = reduced ? "Motion: reduced" : "Motion: full";
  }
}

export function isReducedMotion() {
  if (root.dataset.motion) {
    return root.dataset.motion === "reduced";
  }

  return motionQuery.matches;
}

export function initTheme() {
  const themeControls = Array.from(
    document.querySelectorAll("[data-theme-toggle]"),
  );
  const motionControls = Array.from(
    document.querySelectorAll("[data-motion-toggle]"),
  );
  const cleanups = [];

  let theme = applyTheme(readStorage(THEME_STORAGE_KEY) || "dark", {
    notify: false,
  });
  let motionState = applyMotion(readStorage(MOTION_STORAGE_KEY) || "full", {
    notify: false,
  });

  const syncControls = () => {
    themeControls.forEach((control) => setThemeControlState(control, theme));
    motionControls.forEach((control) =>
      setMotionControlState(
        control,
        motionState.motion,
        motionState.preference,
      ),
    );
  };

  syncControls();

  themeControls.forEach((control) => {
    const onClick = (event) => {
      const commit = () => {
        theme = applyTheme(theme === "dark" ? "light" : "dark", {
          persist: true,
        });
        syncControls();
      };

      if (
        typeof document.startViewTransition !== "function" ||
        isReducedMotion() ||
        motionQuery.matches
      ) {
        commit();
        return;
      }

      // The new theme spreads out as a circle from wherever it was toggled.
      const bounds = control.getBoundingClientRect();
      const x = event.clientX || bounds.left + bounds.width / 2;
      const y = event.clientY || bounds.top + bounds.height / 2;
      const radius = Math.hypot(
        Math.max(x, window.innerWidth - x),
        Math.max(y, window.innerHeight - y),
      );
      // Backdrop blur has nothing to sample inside the transition snapshots,
      // so the header is made opaque for the length of the switch.
      root.classList.add("is-theme-switching");
      const transition = document.startViewTransition(commit);
      transition.finished
        .catch(() => {})
        .finally(() => root.classList.remove("is-theme-switching"));

      transition.ready
        .then(() => {
          root.animate(
            {
              clipPath: [
                `circle(0px at ${x}px ${y}px)`,
                `circle(${radius}px at ${x}px ${y}px)`,
              ],
            },
            {
              duration: 680,
              easing: "cubic-bezier(0.22, 1, 0.36, 1)",
              pseudoElement: "::view-transition-new(root)",
            },
          );
        })
        .catch(() => {});
    };

    control.addEventListener("click", onClick);
    cleanups.push(() => control.removeEventListener("click", onClick));
  });

  motionControls.forEach((control) => {
    const onClick = () => {
      const next = motionState.motion === "reduced" ? "full" : "reduced";
      motionState = applyMotion(next, { persist: true });
      syncControls();
    };

    control.addEventListener("click", onClick);
    cleanups.push(() => control.removeEventListener("click", onClick));
  });

  const onSystemMotionChange = () => {
    if (motionState.preference !== "system") {
      return;
    }

    motionState = applyMotion("system");
    syncControls();
  };

  if (typeof motionQuery.addEventListener === "function") {
    motionQuery.addEventListener("change", onSystemMotionChange);
    cleanups.push(() =>
      motionQuery.removeEventListener("change", onSystemMotionChange),
    );
  } else {
    motionQuery.addListener(onSystemMotionChange);
    cleanups.push(() => motionQuery.removeListener(onSystemMotionChange));
  }

  const onStorage = (event) => {
    if (event.key === THEME_STORAGE_KEY) {
      theme = applyTheme(event.newValue || "dark");
      syncControls();
    }

    if (event.key === MOTION_STORAGE_KEY) {
      motionState = applyMotion(event.newValue || "full");
      syncControls();
    }
  };

  window.addEventListener("storage", onStorage);
  cleanups.push(() => window.removeEventListener("storage", onStorage));

  return () => cleanups.forEach((cleanup) => cleanup());
}
