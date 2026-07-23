import { isReducedMotion } from "./theme.js";

function findEvidenceReels() {
  return Array.from(document.querySelectorAll("[data-evidence-reel]"));
}

function setupEvidenceReel(root) {
  const tabsRoot = root.querySelector("[data-evidence-tabs]");
  const tabs = Array.from(root.querySelectorAll("[data-evidence-index]"));
  const panels = Array.from(root.querySelectorAll("[data-evidence-panel]"));
  const count = root.querySelector("[data-evidence-count]");
  const title = root.querySelector("[data-evidence-title]:not([data-evidence-index])");
  const copy = root.querySelector("[data-evidence-copy]:not([data-evidence-index])");
  const progress = root.querySelector("[data-evidence-progress]");
  const progressBar = progress?.querySelector("span");
  const video = root.querySelector("[data-evidence-video]");

  if (!tabsRoot || !tabs.length || tabs.length !== panels.length) {
    return () => {};
  }

  const cleanups = [];
  let committedIndex = Math.max(
    0,
    tabs.findIndex((tab) => tab.getAttribute("aria-selected") === "true"),
  );
  let activeIndex = committedIndex;
  let inView = !("IntersectionObserver" in window);
  let programmaticPause = false;
  let userPausedVideo = false;
  let observer;

  const videoPanelIndex = panels.findIndex((panel) => panel.contains(video));

  const pauseVideo = () => {
    if (!video || video.paused) {
      return;
    }

    programmaticPause = true;
    video.pause();
    queueMicrotask(() => {
      programmaticPause = false;
    });
  };

  const syncVideo = () => {
    if (!video) {
      return;
    }

    const shouldPlay =
      activeIndex === videoPanelIndex &&
      inView &&
      document.visibilityState === "visible" &&
      !isReducedMotion() &&
      !userPausedVideo;

    if (!shouldPlay) {
      pauseVideo();
      return;
    }

    const playRequest = video.play();
    if (playRequest && typeof playRequest.catch === "function") {
      playRequest.catch(() => {
        // Native controls remain available if autoplay is blocked.
      });
    }
  };

  const select = (index, { commit = false, focus = false } = {}) => {
    if (!tabs[index] || !panels[index]) {
      return;
    }

    activeIndex = index;
    if (commit) {
      committedIndex = index;
    }

    panels.forEach((panel, panelIndex) => {
      const selected = panelIndex === activeIndex;
      panel.classList.toggle("evidence-reel__panel--active", selected);
      panel.setAttribute("aria-hidden", String(!selected));
      panel.hidden = !selected;
    });

    tabs.forEach((tab, tabIndex) => {
      const selected = tabIndex === activeIndex;
      const pinned = tabIndex === committedIndex;
      tab.classList.toggle("is-active", selected);
      tab.classList.toggle("is-pinned", pinned);
      tab.setAttribute("aria-selected", String(selected));
      tab.tabIndex = selected ? 0 : -1;
    });

    const selectedTab = tabs[activeIndex];
    if (count) {
      count.textContent = `${String(activeIndex + 1).padStart(2, "0")} / ${String(tabs.length).padStart(2, "0")}`;
    }
    if (title) {
      title.textContent = selectedTab.dataset.evidenceTitle || "";
    }
    if (copy) {
      copy.textContent = selectedTab.dataset.evidenceCopy || "";
    }
    if (progress) {
      progress.setAttribute("aria-valuenow", String(activeIndex + 1));
      progress.setAttribute(
        "aria-valuetext",
        `${activeIndex + 1} of ${tabs.length}: ${selectedTab.dataset.evidenceTitle || ""}`,
      );
    }
    if (progressBar) {
      progressBar.style.transform = `scaleX(${(activeIndex + 1) / tabs.length})`;
    }

    root.dataset.evidenceIndex = String(activeIndex);
    root.dataset.evidencePinned = String(committedIndex);

    if (focus) {
      selectedTab.focus();
    }

    syncVideo();
    root.dispatchEvent(
      new CustomEvent("portfolio:evidencechange", {
        bubbles: true,
        detail: { index: activeIndex, committedIndex },
      }),
    );
  };

  tabs.forEach((tab, index) => {
    const onPointerEnter = (event) => {
      if (event.pointerType !== "touch") {
        select(index);
      }
    };
    const onFocus = () => select(index);
    const onClick = () => {
      if (index === videoPanelIndex) {
        userPausedVideo = false;
      }
      select(index, { commit: true });
    };
    const onKeyDown = (event) => {
      const previousKeys = ["ArrowLeft", "ArrowUp"];
      const nextKeys = ["ArrowRight", "ArrowDown"];
      let nextIndex = index;

      if (previousKeys.includes(event.key)) {
        nextIndex = (index - 1 + tabs.length) % tabs.length;
      } else if (nextKeys.includes(event.key)) {
        nextIndex = (index + 1) % tabs.length;
      } else if (event.key === "Home") {
        nextIndex = 0;
      } else if (event.key === "End") {
        nextIndex = tabs.length - 1;
      } else if (event.key === "Escape") {
        event.preventDefault();
        select(committedIndex, { focus: true });
        return;
      } else {
        return;
      }

      event.preventDefault();
      select(nextIndex, { focus: true });
    };

    tab.addEventListener("pointerenter", onPointerEnter);
    tab.addEventListener("focus", onFocus);
    tab.addEventListener("click", onClick);
    tab.addEventListener("keydown", onKeyDown);
    cleanups.push(() => tab.removeEventListener("pointerenter", onPointerEnter));
    cleanups.push(() => tab.removeEventListener("focus", onFocus));
    cleanups.push(() => tab.removeEventListener("click", onClick));
    cleanups.push(() => tab.removeEventListener("keydown", onKeyDown));
  });

  const restoreCommitted = () => {
    if (!tabsRoot.contains(document.activeElement)) {
      select(committedIndex);
    }
  };
  const onFocusOut = (event) => {
    if (!tabsRoot.contains(event.relatedTarget)) {
      select(committedIndex);
    }
  };
  // Keep hover previews stable when a taller panel moves the tab strip.
  // Restoring only after the pointer leaves the full reel prevents a
  // layout-driven enter/leave loop between Setup and Architecture.
  root.addEventListener("pointerleave", restoreCommitted);
  tabsRoot.addEventListener("focusout", onFocusOut);
  cleanups.push(() => root.removeEventListener("pointerleave", restoreCommitted));
  cleanups.push(() => tabsRoot.removeEventListener("focusout", onFocusOut));

  const onVideoPause = () => {
    if (!programmaticPause && activeIndex === videoPanelIndex && inView) {
      userPausedVideo = true;
    }
  };
  const onVideoPlay = () => {
    if (!programmaticPause) {
      userPausedVideo = false;
    }
  };
  video?.addEventListener("pause", onVideoPause);
  video?.addEventListener("play", onVideoPlay);
  cleanups.push(() => video?.removeEventListener("pause", onVideoPause));
  cleanups.push(() => video?.removeEventListener("play", onVideoPlay));

  if ("IntersectionObserver" in window) {
    observer = new IntersectionObserver(
      ([entry]) => {
        inView = entry.isIntersecting && entry.intersectionRatio >= 0.2;
        syncVideo();
      },
      { threshold: [0, 0.2, 0.55] },
    );
    observer.observe(root);
  }

  const onVisibilityChange = () => syncVideo();
  const onMotionChange = () => syncVideo();
  document.addEventListener("visibilitychange", onVisibilityChange);
  window.addEventListener("portfolio:motionchange", onMotionChange);
  cleanups.push(() => document.removeEventListener("visibilitychange", onVisibilityChange));
  cleanups.push(() => window.removeEventListener("portfolio:motionchange", onMotionChange));

  select(committedIndex, { commit: true });

  return () => {
    observer?.disconnect();
    pauseVideo();
    cleanups.forEach((cleanup) => cleanup());
  };
}

export function initVehicle() {
  const cleanups = findEvidenceReels().map(setupEvidenceReel);
  return () => cleanups.forEach((cleanup) => cleanup());
}
