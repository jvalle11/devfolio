let generatedPanelId = 0;

function isNativeButton(element) {
  return element.matches('button, input[type="button"], input[type="submit"]');
}

function findPanel(toggle) {
  const controlledId = toggle.getAttribute("aria-controls");
  const targetSelector = toggle.dataset.experienceTarget;

  if (controlledId) {
    return document.getElementById(controlledId);
  }

  if (targetSelector) {
    try {
      return document.querySelector(targetSelector);
    } catch {
      return null;
    }
  }

  return toggle
    .closest("[data-experience-item]")
    ?.querySelector("[data-experience-details]");
}

function setExpanded(toggle, panel, expanded, { focus = false } = {}) {
  const item = toggle.closest("[data-experience-item]");
  const focusedInside = panel.contains(document.activeElement);
  const label = toggle.querySelector("[data-experience-toggle-label]");

  toggle.setAttribute("aria-expanded", String(expanded));
  toggle.dataset.state = expanded ? "expanded" : "collapsed";
  panel.hidden = !expanded;
  panel.dataset.state = expanded ? "expanded" : "collapsed";
  item?.classList.toggle("is-expanded", expanded);

  if (label) {
    label.textContent = expanded ? "Hide earlier roles" : "Show earlier roles";
  }

  if (!expanded && focusedInside) {
    toggle.focus();
  } else if (expanded && focus && panel.hasAttribute("data-focus-on-expand")) {
    const focusTarget = panel.querySelector(
      'a, button, input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    focusTarget?.focus();
  }

  window.dispatchEvent(
    new CustomEvent("portfolio:experiencechange", {
      detail: { expanded, panelId: panel.id },
    }),
  );
}

function setupToggle(toggle) {
  const panel = findPanel(toggle);

  if (!panel) {
    return () => {};
  }

  if (!panel.id) {
    generatedPanelId += 1;
    panel.id = `experience-details-${generatedPanelId}`;
  }

  toggle.setAttribute("aria-controls", panel.id);

  if (!isNativeButton(toggle)) {
    toggle.setAttribute("role", "button");
    toggle.tabIndex = toggle.tabIndex >= 0 ? toggle.tabIndex : 0;
  }

  const hasAuthoredState = toggle.hasAttribute("aria-expanded");
  const initiallyExpanded = hasAuthoredState
    ? toggle.getAttribute("aria-expanded") === "true"
    : !panel.hidden;
  setExpanded(toggle, panel, initiallyExpanded);

  const activate = () => {
    const expanded = toggle.getAttribute("aria-expanded") === "true";
    setExpanded(toggle, panel, !expanded, { focus: true });
  };

  const onClick = () => activate();
  const onKeyDown = (event) => {
    if (isNativeButton(toggle) || (event.key !== "Enter" && event.key !== " ")) {
      return;
    }

    event.preventDefault();
    activate();
  };

  toggle.addEventListener("click", onClick);
  toggle.addEventListener("keydown", onKeyDown);

  return () => {
    toggle.removeEventListener("click", onClick);
    toggle.removeEventListener("keydown", onKeyDown);
  };
}

function expandHashTarget(entries) {
  const id = decodeURIComponent(window.location.hash.slice(1));
  const target = id ? document.getElementById(id) : null;

  if (!target) {
    return;
  }

  const entry = entries.find(({ panel }) => panel.contains(target));
  if (entry) {
    setExpanded(entry.toggle, entry.panel, true);
  }
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function parseTimelineDate(value, { endOfMonth = false } = {}) {
  const match = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(value || "");

  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = match[3]
    ? Number(match[3])
    : endOfMonth
      ? new Date(Date.UTC(year, month, 0)).getUTCDate()
      : 1;
  const date = new Date(Date.UTC(year, month - 1, day));

  return Number.isNaN(date.getTime()) ? null : date;
}

function isReducedMotion() {
  return (
    document.documentElement.dataset.motion === "reduced" ||
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

function setupExperienceRail(root) {
  const axis = root.querySelector("[data-experience-axis]");
  const track = root.querySelector("[data-experience-track]");
  const scrubber = root.querySelector("[data-experience-scrubber]");
  const scrubberLabel = root.querySelector("[data-experience-scrubber-label]");
  const zoomOut = root.querySelector("[data-experience-zoom-out]");
  const zoomReset = root.querySelector("[data-experience-zoom-reset]");
  const zoomIn = root.querySelector("[data-experience-zoom-in]");
  const zoomLabel = root.querySelector("[data-experience-zoom-label]");
  const zoomStatus = root.querySelector("[data-experience-zoom-status]");
  const rangeStart = parseTimelineDate(root.dataset.rangeStart);
  const declaredRangeEnd = parseTimelineDate(root.dataset.rangeEnd, { endOfMonth: true });
  const panels = Array.from(root.querySelectorAll("[data-experience-panel]"));
  const directoryControls = Array.from(
    root.querySelectorAll("[data-experience-directory-control]"),
  );
  const entries = Array.from(root.querySelectorAll("[data-experience-item]"))
    .map((item) => {
      const id = item.dataset.experienceRole;
      const control = item.querySelector("[data-experience-role-control]");
      const panel = panels.find(
        (candidate) => candidate.dataset.experiencePanel === id,
      );
      const label = item.querySelector(".experience-marker__label");
      const directoryControl = directoryControls.find(
        (candidate) => candidate.dataset.experienceRole === id,
      );
      const start = parseTimelineDate(item.dataset.start);
      const declaredEnd = parseTimelineDate(item.dataset.end, { endOfMonth: true });
      const today = new Date();
      const currentEnd = new Date(
        Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()),
      );
      const end = declaredEnd ||
        (item.dataset.current === "true" ? currentEnd : null);

      return {
        id,
        item,
        control,
        label,
        panel,
        directoryControl,
        directoryItem: directoryControl?.closest(
          "[data-experience-directory-item]",
        ),
        close: panel?.querySelector("[data-experience-close]"),
        start,
        end,
      };
    })
    .filter(({ id, control, label, panel, start, end }) =>
      Boolean(id && control && label && panel && start && end),
    )
    .sort((a, b) => a.start - b.start);

  const latestEntryEndTime = entries.reduce(
    (latest, entry) => Math.max(latest, entry.end.getTime()),
    0,
  );
  const rangeEnd = declaredRangeEnd
    ? new Date(Math.max(declaredRangeEnd.getTime(), latestEntryEndTime))
    : new Date(latestEntryEndTime);

  if (
    !axis ||
    !track ||
    !scrubber ||
    !scrubberLabel ||
    !zoomOut ||
    !zoomReset ||
    !zoomIn ||
    !zoomLabel ||
    !zoomStatus ||
    !rangeStart ||
    !rangeEnd ||
    !entries.length
  ) {
    return () => {};
  }

  const rangeStartTime = rangeStart.getTime();
  const rangeEndTime = rangeEnd.getTime();
  const rangeDuration = Math.max(1, rangeEndTime - rangeStartTime);
  const monthFormatter = new Intl.DateTimeFormat("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
  const defaultIndex = Math.max(
    0,
    entries.findIndex(({ id }) => id === root.dataset.defaultRole),
  );
  const cleanups = [];
  const zoomLevels = [1, 1.25, 1.5, 2];
  const laneEnds = [];
  let zoomIndex = 0;
  let activeIndex = defaultIndex;
  let pinnedIndex = defaultIndex;
  let pointerFrame = 0;
  let pointerState = null;
  let lastPointerX = 0;
  let lastPointerTime = 0;
  let roleLeaveTimer = 0;
  let dragState = null;

  entries.forEach((entry) => {
    let lane = laneEnds.findIndex((laneEnd) => laneEnd < entry.start);

    if (lane < 0) {
      lane = laneEnds.length;
    }

    laneEnds[lane] = entry.end;
    entry.lane = lane;
  });

  root.style.setProperty("--timeline-lane-count", String(laneEnds.length));

  const listen = (target, name, handler, options) => {
    target.addEventListener(name, handler, options);
    cleanups.push(() => target.removeEventListener(name, handler, options));
  };

  const dateRatio = (date) =>
    clamp((date.getTime() - rangeStartTime) / rangeDuration, 0, 1);

  const trackInnerWidth = () => {
    const styles = window.getComputedStyle(track);
    const horizontalPadding =
      Number.parseFloat(styles.paddingLeft) +
      Number.parseFloat(styles.paddingRight);

    return Math.max(1, track.clientWidth - horizontalPadding);
  };

  const syncZoomControls = () => {
    const zoom = zoomLevels[zoomIndex];
    const percentage = Math.round(zoom * 100);

    zoomLabel.textContent = `${percentage}%`;
    zoomStatus.textContent = `Timeline zoom ${percentage}%`;
    zoomOut.disabled = zoomIndex === 0;
    zoomIn.disabled = zoomIndex === zoomLevels.length - 1;
    root.style.setProperty("--timeline-zoom", String(zoom));
  };

  const updateAxisWidth = ({ preserveRatio = null } = {}) => {
    const mobileBase = window.matchMedia("(max-width: 48rem)").matches
      ? 760
      : 0;
    const baseWidth = Math.max(trackInnerWidth(), mobileBase);
    const zoom = zoomLevels[zoomIndex];
    const ratio = preserveRatio ??
      (track.scrollLeft + track.clientWidth / 2) /
        Math.max(track.scrollWidth, 1);

    axis.style.width = `${Math.round(baseWidth * zoom)}px`;

    if (preserveRatio !== false) {
      const maximum = Math.max(0, track.scrollWidth - track.clientWidth);
      track.scrollLeft = clamp(
        ratio * track.scrollWidth - track.clientWidth / 2,
        0,
        maximum,
      );
    }
  };

  const setZoomIndex = (nextIndex, { anchor = 0.5 } = {}) => {
    const clampedIndex = clamp(nextIndex, 0, zoomLevels.length - 1);

    if (clampedIndex === zoomIndex) {
      return;
    }

    const contentRatio =
      (track.scrollLeft + track.clientWidth * anchor) /
      Math.max(track.scrollWidth, 1);
    zoomIndex = clampedIndex;
    updateAxisWidth({ preserveRatio: false });
    syncZoomControls();

    const maximum = Math.max(0, track.scrollWidth - track.clientWidth);
    track.scrollLeft = clamp(
      contentRatio * track.scrollWidth - track.clientWidth * anchor,
      0,
      maximum,
    );
  };

  const syncEntryStates = () => {
    entries.forEach((entry, index) => {
      const active = index === activeIndex;
      const pinned = index === pinnedIndex;

      entry.control.setAttribute("aria-selected", String(active));
      entry.control.tabIndex = active ? 0 : -1;
      entry.control.dataset.state = active ? "active" : "idle";
      entry.item.classList.toggle("is-active", active);
      entry.item.classList.toggle("is-pinned", pinned);
      entry.panel.hidden = !active;
      entry.panel.dataset.state = active ? "active" : "idle";

      if (entry.directoryControl) {
        entry.directoryControl.setAttribute("aria-pressed", String(active));
      }
      entry.directoryItem?.classList.toggle("is-active", active);
    });

    root.dataset.activeRole = entries[activeIndex]?.id || "";
    root.classList.add("has-active-role");

    window.dispatchEvent(
      new CustomEvent("portfolio:experiencechange", {
        detail: {
          expanded: true,
          panelId: entries[activeIndex]?.panel.id || "",
          pinned: pinnedIndex === activeIndex,
        },
      }),
    );
  };

  const revealEntry = (index, behavior = "auto") => {
    if (!entries[index] || track.scrollWidth <= track.clientWidth) {
      return;
    }

    const entry = entries[index];
    const markerStart = dateRatio(entry.start) * axis.clientWidth;
    const markerEnd = dateRatio(entry.end) * axis.clientWidth;
    const visibleRoleEnd = Math.min(
      markerEnd,
      markerStart + track.clientWidth * 0.6,
    );
    const markerX = (markerStart + visibleRoleEnd) / 2;
    const maximum = Math.max(0, track.scrollWidth - track.clientWidth);
    const left = clamp(markerX - track.clientWidth / 2, 0, maximum);
    if (behavior === "smooth") {
      track.scrollTo({ left, behavior });
    } else {
      track.scrollLeft = left;
    }
  };

  const setActive = (index, { revealMarker = false } = {}) => {
    if (!Number.isInteger(index) || !entries[index]) {
      return;
    }

    activeIndex = index;
    syncEntryStates();
    if (revealMarker) {
      revealEntry(index, isReducedMotion() ? "auto" : "smooth");
    }
  };

  const restorePinned = () => setActive(pinnedIndex);

  const schedulePinnedRestore = () => {
    clearTimeout(roleLeaveTimer);
    roleLeaveTimer = window.setTimeout(() => {
      const hoveringMarker = root.querySelector(
        "[data-experience-role-control]:hover",
      );
      const hoveringPanel = root.querySelector(
        "[data-experience-details]:not([hidden]):hover",
      );

      if (!hoveringMarker && !hoveringPanel) {
        restorePinned();
      }
    }, 260);
  };

  const syncEntryLabelEdge = (entry) => {
    const trackRect = track.getBoundingClientRect();
    const controlRect = entry.control.getBoundingClientRect();
    const labelRect = entry.label.getBoundingClientRect();
    const markerX = controlRect.left;
    const safeInset = 12;
    const wouldClipStart = markerX - 10 < trackRect.left + safeInset;
    const wouldClipEnd =
      markerX + labelRect.width - 10 > trackRect.right - safeInset;
    const preferEnd = wouldClipEnd && !wouldClipStart;

    entry.item.classList.toggle("is-start-edge", wouldClipStart && !preferEnd);
    entry.item.classList.toggle("is-end-edge", preferEnd);
  };

  const syncLabelEdges = () => {
    entries.forEach(syncEntryLabelEdge);
  };

  const layoutTimeline = () => {
    entries.forEach((entry) => {
      const start = dateRatio(entry.start);
      const end = Math.max(start, dateRatio(entry.end));

      entry.item.style.setProperty("--marker-x", `${start * 100}%`);
      entry.item.style.setProperty(
        "--marker-width",
        `${Math.max(0, end - start) * 100}%`,
      );
      entry.item.style.setProperty("--marker-y", `${entry.lane * 44}px`);
    });

    root.querySelectorAll("[data-experience-year]").forEach((tick) => {
      const year = Number(tick.dataset.experienceYear);
      const date = new Date(Date.UTC(year, 0, 1));
      tick.style.setProperty("--year-x", `${dateRatio(date) * 100}%`);
    });

    root.classList.add("is-enhanced");
    syncLabelEdges();
    requestAnimationFrame(syncLabelEdges);
  };

  const hideScrubber = () => {
    root.classList.remove(
      "is-scrubbing",
      "is-scrubber-start",
      "is-scrubber-end",
    );
    lastPointerTime = 0;
  };

  const renderPointer = () => {
    pointerFrame = 0;

    if (!pointerState) {
      return;
    }

    const { clientX, timeStamp } = pointerState;
    const rect = axis.getBoundingClientRect();
    const ratio = clamp((clientX - rect.left) / Math.max(rect.width, 1), 0, 1);
    const elapsed = lastPointerTime
      ? Math.max(8, timeStamp - lastPointerTime)
      : 16;
    const velocity = lastPointerTime
      ? Math.abs(clientX - lastPointerX) / elapsed
      : 0;
    const date = new Date(rangeStartTime + rangeDuration * ratio);
    const reduced = isReducedMotion();
    const duration = reduced
      ? 0
      : Math.round(clamp(250 - velocity * 110, 48, 250));
    const blur = reduced ? 0 : clamp((velocity - 0.75) * 0.55, 0, 1.1);

    root.style.setProperty("--scrubber-x", `${ratio * 100}%`);
    root.style.setProperty("--scrubber-duration", `${duration}ms`);
    root.style.setProperty("--scrubber-blur", `${blur.toFixed(2)}px`);
    scrubberLabel.textContent =
      velocity > 1.4 ? String(date.getUTCFullYear()) : monthFormatter.format(date);
    root.classList.toggle("is-scrubber-start", ratio < 0.08);
    root.classList.toggle("is-scrubber-end", ratio > 0.92);
    root.classList.add("is-scrubbing");

    lastPointerX = clientX;
    lastPointerTime = timeStamp;
  };

  const queuePointer = (event) => {
    if (event.pointerType === "touch" || dragState) {
      hideScrubber();
      return;
    }

    pointerState = { clientX: event.clientX, timeStamp: event.timeStamp };
    if (!pointerFrame) {
      pointerFrame = requestAnimationFrame(renderPointer);
    }
  };

  entries.forEach((entry, index) => {
    const onPointerEnter = (event) => {
      if (event.pointerType !== "touch") {
        clearTimeout(roleLeaveTimer);
        syncEntryLabelEdge(entry);
        setActive(index);
      }
    };
    const onPointerLeave = (event) => {
      if (event.pointerType !== "touch") {
        schedulePinnedRestore();
      }
    };
    const onClick = () => {
      syncEntryLabelEdge(entry);
      pinnedIndex = index;
      setActive(index);
    };
    const onFocus = () => {
      syncEntryLabelEdge(entry);
      setActive(index);
    };
    const onKeyDown = (event) => {
      const movement = {
        ArrowLeft: -1,
        ArrowUp: -1,
        ArrowRight: 1,
        ArrowDown: 1,
      };

      if (movement[event.key]) {
        event.preventDefault();
        const next = clamp(index + movement[event.key], 0, entries.length - 1);
        setActive(next, { revealMarker: true });
        entries[next].control.focus();
      } else if (event.key === "Home") {
        event.preventDefault();
        setActive(0, { revealMarker: true });
        entries[0].control.focus();
      } else if (event.key === "End") {
        event.preventDefault();
        const lastIndex = entries.length - 1;
        setActive(lastIndex, { revealMarker: true });
        entries[lastIndex].control.focus();
      } else if (event.key === "Escape") {
        event.preventDefault();
        restorePinned();
        entries[pinnedIndex].control.focus();
      }
    };
    const onPanelPointerEnter = () => clearTimeout(roleLeaveTimer);
    const onPanelPointerLeave = () => schedulePinnedRestore();
    const onClose = () => {
      pinnedIndex = index;
      setActive(index);
      entry.control.focus({ preventScroll: true });
      axis.scrollIntoView({
        behavior: isReducedMotion() ? "auto" : "smooth",
        block: "center",
      });
    };
    const onDirectoryClick = () => {
      pinnedIndex = index;
      setActive(index);
      entry.panel.scrollIntoView({
        behavior: isReducedMotion() ? "auto" : "smooth",
        block: "nearest",
      });
    };

    listen(entry.control, "pointerenter", onPointerEnter);
    listen(entry.control, "pointerleave", onPointerLeave);
    listen(entry.control, "click", onClick);
    listen(entry.control, "focus", onFocus);
    listen(entry.control, "keydown", onKeyDown);
    listen(entry.panel, "pointerenter", onPanelPointerEnter);
    listen(entry.panel, "pointerleave", onPanelPointerLeave);

    if (entry.close) {
      listen(entry.close, "click", onClose);
    }
    if (entry.directoryControl) {
      listen(entry.directoryControl, "click", onDirectoryClick);
    }
  });

  const onZoomOut = () => setZoomIndex(zoomIndex - 1);
  const onZoomReset = () => setZoomIndex(0);
  const onZoomIn = () => setZoomIndex(zoomIndex + 1);
  const onTrackWheel = (event) => {
    if (event.ctrlKey || event.metaKey) {
      event.preventDefault();
      const rect = track.getBoundingClientRect();
      const anchor = clamp(
        (event.clientX - rect.left) / Math.max(rect.width, 1),
        0,
        1,
      );
      setZoomIndex(zoomIndex + (event.deltaY < 0 ? 1 : -1), { anchor });
      return;
    }

    if (event.shiftKey && Math.abs(event.deltaY) > Math.abs(event.deltaX)) {
      event.preventDefault();
      track.scrollLeft += event.deltaY;
    }
  };
  const onTrackPointerDown = (event) => {
    if (
      event.pointerType === "touch" ||
      event.button !== 0 ||
      event.target.closest("button, a, input, select, textarea") ||
      track.scrollWidth <= track.clientWidth
    ) {
      return;
    }

    dragState = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startScrollLeft: track.scrollLeft,
    };
    track.setPointerCapture(event.pointerId);
    track.classList.add("is-dragging");
    hideScrubber();
  };
  const onTrackPointerMove = (event) => {
    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    track.scrollLeft =
      dragState.startScrollLeft - (event.clientX - dragState.startX);
    if (event.cancelable) {
      event.preventDefault();
    }
  };
  const finishTrackDrag = (event) => {
    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    if (track.hasPointerCapture(event.pointerId)) {
      track.releasePointerCapture(event.pointerId);
    }
    dragState = null;
    track.classList.remove("is-dragging");
  };
  const onTrackKeyDown = (event) => {
    if (event.target !== track) {
      return;
    }

    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      track.scrollBy({
        left: event.key === "ArrowLeft" ? -120 : 120,
        behavior: isReducedMotion() ? "auto" : "smooth",
      });
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      track.scrollTo({
        left: event.key === "Home" ? 0 : track.scrollWidth,
        behavior: isReducedMotion() ? "auto" : "smooth",
      });
    } else if (event.key === "+" || event.key === "=") {
      event.preventDefault();
      setZoomIndex(zoomIndex + 1);
    } else if (event.key === "-" || event.key === "_") {
      event.preventDefault();
      setZoomIndex(zoomIndex - 1);
    } else if (event.key === "0") {
      event.preventDefault();
      setZoomIndex(0);
    }
  };
  const onResize = () => updateAxisWidth();
  const onTrackScroll = () => syncLabelEdges();

  const onAxisPointerMove = (event) => queuePointer(event);
  const onAxisPointerEnter = (event) => queuePointer(event);
  const onAxisPointerLeave = () => hideScrubber();
  const onRootFocusOut = () => {
    queueMicrotask(() => {
      if (!root.contains(document.activeElement)) {
        restorePinned();
      }
    });
  };
  const onHashChange = () => {
    const id = decodeURIComponent(window.location.hash.slice(1));
    const index = entries.findIndex(
      ({ item, control, panel }) =>
        id && (item.id === id || control.id === id || panel.id === id),
    );

    if (index >= 0) {
      pinnedIndex = index;
      setActive(index);
    }
  };
  const onMotionChange = () => {
    if (isReducedMotion()) {
      root.style.setProperty("--scrubber-duration", "0ms");
      root.style.setProperty("--scrubber-blur", "0px");
    }
  };

  listen(axis, "pointermove", onAxisPointerMove, { passive: true });
  listen(axis, "pointerenter", onAxisPointerEnter, { passive: true });
  listen(axis, "pointerleave", onAxisPointerLeave, { passive: true });
  listen(zoomOut, "click", onZoomOut);
  listen(zoomReset, "click", onZoomReset);
  listen(zoomIn, "click", onZoomIn);
  listen(track, "wheel", onTrackWheel, { passive: false });
  listen(track, "pointerdown", onTrackPointerDown);
  listen(track, "pointermove", onTrackPointerMove, { passive: false });
  listen(track, "pointerup", finishTrackDrag);
  listen(track, "pointercancel", finishTrackDrag);
  listen(track, "keydown", onTrackKeyDown);
  listen(track, "scroll", onTrackScroll, { passive: true });
  listen(root, "focusout", onRootFocusOut);
  listen(window, "hashchange", onHashChange);
  listen(window, "portfolio:motionchange", onMotionChange);

  if ("ResizeObserver" in window) {
    const resizeObserver = new ResizeObserver(onResize);
    resizeObserver.observe(track);
    cleanups.push(() => resizeObserver.disconnect());
  } else {
    listen(window, "resize", onResize, { passive: true });
  }

  updateAxisWidth({ preserveRatio: false });
  syncZoomControls();
  layoutTimeline();
  syncEntryStates();
  onHashChange();
  requestAnimationFrame(() => {
    updateAxisWidth({ preserveRatio: false });
    revealEntry(activeIndex);
    requestAnimationFrame(() => {
      revealEntry(activeIndex);
      syncLabelEdges();
    });
  });
  const initialRevealTimer = window.setTimeout(() => {
    updateAxisWidth({ preserveRatio: false });
    revealEntry(activeIndex);
    syncLabelEdges();
  }, 120);
  cleanups.push(() => window.clearTimeout(initialRevealTimer));

  return () => {
    cleanups.forEach((cleanup) => cleanup());
    clearTimeout(roleLeaveTimer);
    if (pointerFrame) {
      cancelAnimationFrame(pointerFrame);
    }
  };
}

function updateTimeBoundPeriods() {
  const today = new Date();
  const localDate = [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, "0"),
    String(today.getDate()).padStart(2, "0"),
  ].join("-");

  document.querySelectorAll("[data-current-through]").forEach((period) => {
    const currentThrough = period.dataset.currentThrough;
    const periodAfter = period.dataset.periodAfter;

    if (currentThrough && periodAfter && localDate > currentThrough) {
      const previousPeriod = period.textContent.trim();
      period.textContent = periodAfter;
      const context = period.closest(
        "[data-experience-item], [data-experience-directory-item], [data-experience-details], .timeline__item",
      );
      const roleControl = context?.querySelector(
        "[data-experience-role-control]",
      );
      const roleLabel = roleControl?.getAttribute("aria-label");

      context?.classList.add("is-completed");
      if (roleControl && roleLabel?.includes(previousPeriod)) {
        roleControl.setAttribute(
          "aria-label",
          roleLabel.replace(previousPeriod, periodAfter),
        );
      }
    }
  });

}

export function initExperience() {
  const toggles = Array.from(
    document.querySelectorAll("[data-experience-toggle]"),
  );
  const entries = toggles
    .map((toggle) => ({ toggle, panel: findPanel(toggle) }))
    .filter(({ panel }) => panel);
  const cleanups = toggles.map(setupToggle);
  const railCleanups = Array.from(
    document.querySelectorAll("[data-experience-rail]"),
  ).map(setupExperienceRail);
  const onHashChange = () => expandHashTarget(entries);

  window.addEventListener("hashchange", onHashChange);
  updateTimeBoundPeriods();
  expandHashTarget(entries);

  return () => {
    cleanups.forEach((cleanup) => cleanup());
    railCleanups.forEach((cleanup) => cleanup());
    window.removeEventListener("hashchange", onHashChange);
  };
}
