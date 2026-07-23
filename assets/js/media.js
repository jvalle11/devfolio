import { isReducedMotion } from "./theme.js";

function unique(elements) {
  return Array.from(new Set(elements));
}

function mediaName(media) {
  return (
    media.dataset.mediaLabel ||
    media.getAttribute("aria-label") ||
    (media.tagName === "AUDIO" ? "audio" : "video")
  );
}

function controlsFor(media, wrapper) {
  const localControls = wrapper
    ? Array.from(wrapper.querySelectorAll("[data-media-toggle]"))
    : [];
  const globalControls = media.id
    ? Array.from(
        document.querySelectorAll("[data-media-toggle][data-media-target]"),
      ).filter((control) => control.dataset.mediaTarget === media.id)
    : [];

  return unique([...localControls, ...globalControls]).filter((control) => {
    const target = control.dataset.mediaTarget;
    return !target || target === media.id;
  });
}

function updateControls(media, controls) {
  const playing = !media.paused && !media.ended;
  const name = mediaName(media);

  controls.forEach((control) => {
    const label = control.querySelector("[data-media-label]");
    const playLabel = control.dataset.playLabel || `Play ${name}`;
    const pauseLabel = control.dataset.pauseLabel || `Pause ${name}`;

    control.dataset.state = playing ? "playing" : "paused";
    control.setAttribute("aria-pressed", String(playing));
    control.setAttribute("aria-label", playing ? pauseLabel : playLabel);
    control.title = playing ? pauseLabel : playLabel;

    if (label) {
      label.textContent = playing ? pauseLabel : playLabel;
    } else if (control.childElementCount === 0) {
      control.textContent = playing ? "Pause" : "Play";
    }
  });
}

async function safelyPlay(media) {
  try {
    const result = media.play();
    if (result && typeof result.then === "function") {
      await result;
    }
    return true;
  } catch {
    return false;
  }
}

function setupMedia(media) {
  const wrapper = media.closest("[data-media]") || media.parentElement;
  const controls = controlsFor(media, wrapper);
  const status = wrapper?.querySelector("[data-media-status]");
  const autoplayVisible =
    media.hasAttribute("data-autoplay-visible") ||
    wrapper?.hasAttribute("data-autoplay-visible") ||
    media.autoplay;
  const state = {
    inView: false,
    manuallyPaused: false,
    autoplayVisible,
  };
  const cleanups = [];

  const announce = (message = "") => {
    if (status) status.textContent = message;
  };

  media.autoplay = false;
  media.setAttribute("playsinline", "");

  const pause = ({ manual = false } = {}) => {
    if (manual) {
      state.manuallyPaused = true;
    }
    media.pause();
    updateControls(media, controls);
    if (manual) announce("Playback paused.");
  };

  const play = async ({ manual = false } = {}) => {
    if (manual) {
      state.manuallyPaused = false;
    } else if (isReducedMotion() || state.manuallyPaused || !state.inView) {
      return false;
    }

    const started = await safelyPlay(media);
    updateControls(media, controls);
    if (manual) {
      announce(
        started
          ? "Playback started."
          : "Playback could not start in this browser. The poster remains available.",
      );
    }
    return started;
  };

  controls.forEach((control) => {
    const onClick = async () => {
      if (media.paused || media.ended) {
        await play({ manual: true });
      } else {
        pause({ manual: true });
      }
    };

    control.addEventListener("click", onClick);
    cleanups.push(() => control.removeEventListener("click", onClick));
  });

  const clearRecoveredError = () => {
    if (media.readyState >= 2) announce("");
  };
  const onPlay = () => updateControls(media, controls);
  const onPlaying = () => {
    clearRecoveredError();
    updateControls(media, controls);
  };
  const onPause = () => updateControls(media, controls);
  const onError = () => {
    updateControls(media, controls);
    if (media.error) {
      announce("The video could not be loaded. The poster remains available.");
    }
  };
  const onEnded = () => {
    if (!media.loop) {
      state.manuallyPaused = true;
    }
    updateControls(media, controls);
  };

  media.addEventListener("play", onPlay);
  media.addEventListener("playing", onPlaying);
  media.addEventListener("pause", onPause);
  media.addEventListener("loadeddata", clearRecoveredError);
  media.addEventListener("canplay", clearRecoveredError);
  media.addEventListener("error", onError);
  media.addEventListener("ended", onEnded);
  cleanups.push(() => media.removeEventListener("play", onPlay));
  cleanups.push(() => media.removeEventListener("playing", onPlaying));
  cleanups.push(() => media.removeEventListener("pause", onPause));
  cleanups.push(() => media.removeEventListener("loadeddata", clearRecoveredError));
  cleanups.push(() => media.removeEventListener("canplay", clearRecoveredError));
  cleanups.push(() => media.removeEventListener("error", onError));
  cleanups.push(() => media.removeEventListener("ended", onEnded));

  let observer = null;
  if ("IntersectionObserver" in window) {
    observer = new IntersectionObserver(
      ([entry]) => {
        state.inView = Boolean(entry?.isIntersecting);

        if (!state.inView) {
          pause();
        } else if (state.autoplayVisible) {
          void play();
        }
      },
      { threshold: 0.18 },
    );
    observer.observe(wrapper || media);
  } else {
    state.inView = true;
    if (state.autoplayVisible) {
      void play();
    }
  }

  const onVisibilityChange = () => {
    if (document.hidden) {
      pause();
    } else if (state.autoplayVisible && state.inView) {
      void play();
    }
  };

  const onMotionChange = (event) => {
    if (event.detail?.reduced) {
      pause();
    } else if (state.autoplayVisible && state.inView) {
      void play();
    }
  };

  document.addEventListener("visibilitychange", onVisibilityChange);
  window.addEventListener("portfolio:motionchange", onMotionChange);
  cleanups.push(() =>
    document.removeEventListener("visibilitychange", onVisibilityChange),
  );
  cleanups.push(() =>
    window.removeEventListener("portfolio:motionchange", onMotionChange),
  );

  pause();
  updateControls(media, controls);

  return () => {
    observer?.disconnect();
    pause();
    cleanups.forEach((cleanup) => cleanup());
  };
}

export function initMedia() {
  const media = unique([
    ...document.querySelectorAll("[data-media] video, [data-media] audio"),
    ...document.querySelectorAll("video[data-managed-media]"),
    ...document.querySelectorAll("audio[data-managed-media]"),
  ]);
  const cleanups = media.map(setupMedia);

  return () => cleanups.forEach((cleanup) => cleanup());
}
