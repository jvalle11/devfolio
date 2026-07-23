export function initCapabilities() {
  const roots = Array.from(document.querySelectorAll("[data-capabilities]"));
  const cleanups = [];

  roots.forEach((root) => {
    const tabs = Array.from(root.querySelectorAll("[data-capability-tab]"));
    const panels = Array.from(root.querySelectorAll("[data-capability-panel]"));

    const select = (id, { focus = false } = {}) => {
      tabs.forEach((tab) => {
        const selected = tab.dataset.capabilityTab === id;
        tab.setAttribute("aria-selected", String(selected));
        tab.tabIndex = selected ? 0 : -1;
        tab.classList.toggle("is-active", selected);
        if (selected && focus) {
          tab.focus();
        }
      });

      panels.forEach((panel) => {
        const selected = panel.dataset.capabilityPanel === id;
        panel.hidden = !selected;
        panel.classList.toggle("is-active", selected);
      });

      root.dataset.activeCapability = id;
    };

    tabs.forEach((tab, index) => {
      const onClick = () => select(tab.dataset.capabilityTab);
      const onKeyDown = (event) => {
        const keys = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Home", "End"];
        if (!keys.includes(event.key)) {
          return;
        }

        event.preventDefault();
        let nextIndex = index;
        if (["ArrowUp", "ArrowLeft"].includes(event.key)) {
          nextIndex = (index - 1 + tabs.length) % tabs.length;
        } else if (["ArrowDown", "ArrowRight"].includes(event.key)) {
          nextIndex = (index + 1) % tabs.length;
        } else if (event.key === "Home") {
          nextIndex = 0;
        } else if (event.key === "End") {
          nextIndex = tabs.length - 1;
        }

        select(tabs[nextIndex].dataset.capabilityTab, { focus: true });
      };

      tab.addEventListener("click", onClick);
      tab.addEventListener("keydown", onKeyDown);
      cleanups.push(() => tab.removeEventListener("click", onClick));
      cleanups.push(() => tab.removeEventListener("keydown", onKeyDown));
    });

    const initial =
      tabs.find((tab) => tab.getAttribute("aria-selected") === "true") || tabs[0];
    if (initial) {
      select(initial.dataset.capabilityTab);
    }
  });

  return () => cleanups.forEach((cleanup) => cleanup());
}
