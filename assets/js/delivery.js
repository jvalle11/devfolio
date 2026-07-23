export function initDelivery() {
  const roots = Array.from(document.querySelectorAll("[data-delivery]"));
  const cleanups = [];

  roots.forEach((root) => {
    const tabs = Array.from(root.querySelectorAll("[data-delivery-tab]"));
    const panels = Array.from(root.querySelectorAll("[data-delivery-panel]"));
    const chapter = root.closest("[data-project]") || root;
    const proofPanels = Array.from(
      chapter.querySelectorAll("[data-delivery-proof-panel]"),
    );
    const proofTitle = chapter.querySelector("[data-delivery-proof-title]");

    const select = (id, { focus = false } = {}) => {
      const activeIndex = Math.max(
        0,
        tabs.findIndex((tab) => tab.dataset.deliveryTab === id),
      );
      root.dataset.deliveryIndex = String(activeIndex);
      root.style.setProperty("--delivery-active-index", String(activeIndex));
      root.style.setProperty(
        "--delivery-progress",
        String((activeIndex + 1) / Math.max(1, tabs.length)),
      );

      tabs.forEach((tab) => {
        const active = tab.dataset.deliveryTab === id;
        tab.classList.toggle("is-active", active);
        tab.setAttribute("aria-selected", String(active));
        tab.tabIndex = active ? 0 : -1;
        if (active && focus) tab.focus();
      });
      panels.forEach((panel) => {
        const active = panel.dataset.deliveryPanel === id;
        panel.hidden = !active;
        panel.classList.toggle("is-active", active);
      });
      proofPanels.forEach((panel) => {
        const active = panel.dataset.deliveryProofPanel === id;
        panel.hidden = !active;
        panel.classList.toggle("is-active", active);
      });
      if (proofTitle) {
        proofTitle.textContent =
          tabs[activeIndex]?.querySelector("strong")?.textContent?.trim() || id;
      }
    };

    tabs.forEach((tab, index) => {
      const onClick = () => select(tab.dataset.deliveryTab);
      const onKeyDown = (event) => {
        if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
        event.preventDefault();
        let next = index;
        if (["ArrowUp", "ArrowLeft"].includes(event.key)) next = (index - 1 + tabs.length) % tabs.length;
        if (["ArrowDown", "ArrowRight"].includes(event.key)) next = (index + 1) % tabs.length;
        if (event.key === "Home") next = 0;
        if (event.key === "End") next = tabs.length - 1;
        select(tabs[next].dataset.deliveryTab, { focus: true });
      };
      tab.addEventListener("click", onClick);
      tab.addEventListener("keydown", onKeyDown);
      cleanups.push(() => tab.removeEventListener("click", onClick));
      cleanups.push(() => tab.removeEventListener("keydown", onKeyDown));
    });

    if (tabs[0]) select(tabs.find((tab) => tab.getAttribute("aria-selected") === "true")?.dataset.deliveryTab || tabs[0].dataset.deliveryTab);
  });

  return () => cleanups.forEach((cleanup) => cleanup());
}
