// Command menu (⌘K / Ctrl+K, or "/"): jump to any section or run a quick
// action, all from the keyboard. Also owns the small toast used for
// "copied" confirmations.

let toastTimer = 0;

export function showToast(message) {
  let toast = document.querySelector(".toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.className = "toast";
    toast.setAttribute("role", "status");
    toast.setAttribute("aria-live", "polite");
    document.body.append(toast);
  }
  toast.textContent = message;
  toast.classList.add("is-visible");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove("is-visible"), 2200);
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const field = document.createElement("textarea");
    field.value = text;
    field.setAttribute("readonly", "");
    field.style.position = "fixed";
    field.style.opacity = "0";
    document.body.append(field);
    field.select();
    const copied = document.execCommand?.("copy");
    field.remove();
    return Boolean(copied);
  }
}

function emailAddress() {
  const link = document.querySelector('a[href^="mailto:"]');
  return link ? decodeURIComponent(link.getAttribute("href").slice(7).split("?")[0]) : "";
}

export async function copyEmail() {
  const email = emailAddress();
  if (!email) return;
  const copied = await copyText(email);
  showToast(copied ? `Copied ${email}` : email);
}

// Travels through the page's own anchor handling, so smooth scrolling, the
// URL hash, and focus all behave exactly like clicking a link.
function goTo(id) {
  const link = document.createElement("a");
  link.href = `#${id}`;
  link.hidden = true;
  document.body.append(link);
  link.click();
  link.remove();
}

function collectCommands() {
  const commands = [];
  const seen = new Set();
  const addSection = (id, label, hint) => {
    if (!id || seen.has(id) || !document.getElementById(id)) return;
    seen.add(id);
    commands.push({ group: "Go to", label, hint, run: () => goTo(id) });
  };

  document.querySelectorAll("[data-site-nav] > a[href^='#']").forEach((link) => {
    // Nav labels may be doubled for the hover roll; read the first copy.
    const label = (link.querySelector(".nav-roll__face") || link).textContent.trim();
    addSection(link.getAttribute("href").slice(1), label, "Section");
  });
  document.querySelectorAll(".project-chapter[id]").forEach((chapter) => {
    const title = chapter.querySelector(".project-chapter__header h3, h3")?.textContent.trim();
    if (title) addSection(chapter.id, title, "Project");
  });
  document.querySelectorAll(".section-band[id]").forEach((section) => {
    const title = section.querySelector("h2")?.textContent.trim();
    if (title) addSection(section.id, title, "Section");
  });

  const themeButton = document.querySelector(".header-controls [data-theme-toggle]");
  const motionButton = document.querySelector(".header-controls [data-motion-toggle], [data-motion-toggle]");
  const isLight = () => document.documentElement.dataset.theme === "light";
  const isReduced = () => document.documentElement.dataset.motion === "reduced";

  if (themeButton) {
    commands.push({
      group: "Actions",
      label: () => (isLight() ? "Switch to dark theme" : "Switch to light theme"),
      hint: "Theme",
      run: () => themeButton.click(),
    });
  }
  if (motionButton) {
    commands.push({
      group: "Actions",
      label: () => (isReduced() ? "Turn full motion on" : "Reduce motion"),
      hint: "Motion",
      run: () => motionButton.click(),
    });
  }

  const email = emailAddress();
  if (email) {
    commands.push({ group: "Contact", label: "Copy email address", hint: email, run: copyEmail });
    commands.push({ group: "Contact", label: "Write an email", hint: "Opens your mail app", run: () => { window.location.href = `mailto:${email}`; } });
  }
  document.querySelectorAll(".contact-links a[href^='http']").forEach((link) => {
    const name = link.querySelector("span")?.textContent.trim() || link.hostname;
    commands.push({
      group: "Contact",
      label: `Open ${name}`,
      hint: link.hostname.replace(/^www\./, ""),
      run: () => window.open(link.href, "_blank", "noopener"),
    });
  });

  return commands;
}

function matches(text, query) {
  if (!query) return true;
  const haystack = text.toLowerCase();
  if (haystack.includes(query)) return true;
  let position = 0;
  for (const character of query) {
    position = haystack.indexOf(character, position);
    if (position < 0) return false;
    position += 1;
  }
  return true;
}

export function initPalette() {
  const commands = collectCommands();
  if (!commands.length || typeof HTMLDialogElement === "undefined") return () => {};

  const isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
  const dialog = document.createElement("dialog");
  dialog.className = "palette";
  dialog.setAttribute("aria-label", "Command menu");
  dialog.innerHTML = `
    <div class="palette__panel">
      <div class="palette__search">
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/></svg>
        <input class="palette__input" type="text" placeholder="Jump to a section or run a command" autocomplete="off" spellcheck="false"
          role="combobox" aria-expanded="true" aria-controls="palette-list" aria-autocomplete="list" aria-label="Search commands">
        <kbd>Esc</kbd>
      </div>
      <ul class="palette__list" id="palette-list" role="listbox" aria-label="Commands"></ul>
      <p class="palette__foot" aria-hidden="true"><span><kbd>↑</kbd><kbd>↓</kbd> move</span><span><kbd>↵</kbd> select</span><span><kbd>${isMac ? "⌘" : "Ctrl"}</kbd><kbd>K</kbd> toggle</span></p>
    </div>`;
  document.body.append(dialog);

  const input = dialog.querySelector(".palette__input");
  const list = dialog.querySelector(".palette__list");
  let visible = [];
  let active = 0;
  let returnFocus = null;

  const labelOf = (command) => (typeof command.label === "function" ? command.label() : command.label);

  const setActive = (index) => {
    if (!visible.length) {
      input.removeAttribute("aria-activedescendant");
      return;
    }
    active = (index + visible.length) % visible.length;
    list.querySelectorAll(".palette__item").forEach((item, itemIndex) => {
      const selected = itemIndex === active;
      item.setAttribute("aria-selected", String(selected));
      if (selected) {
        input.setAttribute("aria-activedescendant", item.id);
        item.scrollIntoView({ block: "nearest" });
      }
    });
  };

  const render = () => {
    const query = input.value.trim().toLowerCase();
    const textOf = (command) => `${labelOf(command)} ${command.hint || ""} ${command.group}`.toLowerCase();
    // Plain substring hits win; loose in-order matching is only a fallback,
    // so "light" finds the theme switch rather than "Learning that…".
    const direct = commands.filter((command) => !query || textOf(command).includes(query));
    visible = direct.length ? direct : commands.filter((command) => matches(textOf(command), query));
    list.replaceChildren();
    let group = "";
    visible.forEach((command, index) => {
      if (command.group !== group) {
        group = command.group;
        const heading = document.createElement("li");
        heading.className = "palette__group";
        heading.setAttribute("role", "presentation");
        heading.textContent = group;
        list.append(heading);
      }
      const item = document.createElement("li");
      item.className = "palette__item";
      item.id = `palette-option-${index}`;
      item.setAttribute("role", "option");
      const label = document.createElement("span");
      label.textContent = labelOf(command);
      const hint = document.createElement("small");
      hint.textContent = command.hint || "";
      item.append(label, hint);
      item.addEventListener("pointermove", () => { if (active !== index) setActive(index); });
      item.addEventListener("click", () => run(index));
      list.append(item);
    });
    if (!visible.length) {
      const empty = document.createElement("li");
      empty.className = "palette__empty";
      empty.setAttribute("role", "presentation");
      empty.textContent = "Nothing matches that yet.";
      list.append(empty);
    }
    setActive(0);
  };

  const open = () => {
    if (dialog.open) return;
    returnFocus = document.activeElement;
    input.value = "";
    render();
    window.portfolioScroll?.stop();
    dialog.showModal();
    input.focus();
  };

  const close = () => {
    if (dialog.open) dialog.close();
  };

  const run = (index) => {
    const command = visible[index];
    if (!command) return;
    returnFocus = null;
    close();
    window.requestAnimationFrame(() => command.run());
  };

  dialog.addEventListener("close", () => {
    window.portfolioScroll?.start();
    if (returnFocus && typeof returnFocus.focus === "function") returnFocus.focus({ preventScroll: true });
  });
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) close();
  });
  input.addEventListener("input", render);
  input.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown") { event.preventDefault(); setActive(active + 1); }
    if (event.key === "ArrowUp") { event.preventDefault(); setActive(active - 1); }
    if (event.key === "Home") { event.preventDefault(); setActive(0); }
    if (event.key === "End") { event.preventDefault(); setActive(visible.length - 1); }
    if (event.key === "Enter") { event.preventDefault(); run(active); }
  });

  const onKeyDown = (event) => {
    const typing = event.target instanceof Element && event.target.closest("input, textarea, select, [contenteditable='true']");
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      if (dialog.open) close();
      else open();
      return;
    }
    if (event.key === "/" && !typing && !dialog.open && !event.metaKey && !event.ctrlKey && !event.altKey) {
      event.preventDefault();
      open();
    }
  };
  document.addEventListener("keydown", onKeyDown);

  const triggers = Array.from(document.querySelectorAll("[data-palette-open]"));
  triggers.forEach((trigger) => {
    trigger.hidden = false;
    trigger.setAttribute("aria-keyshortcuts", isMac ? "Meta+K" : "Control+K");
    trigger.title = `Command menu (${isMac ? "⌘" : "Ctrl+"}K)`;
    trigger.addEventListener("click", open);
  });

  // "Copy" buttons beside the email address.
  const copyButtons = Array.from(document.querySelectorAll("[data-copy-email]"));
  copyButtons.forEach((button) => {
    button.hidden = false;
    button.addEventListener("click", copyEmail);
  });

  return () => {
    document.removeEventListener("keydown", onKeyDown);
    triggers.forEach((trigger) => trigger.removeEventListener("click", open));
    copyButtons.forEach((button) => button.removeEventListener("click", copyEmail));
    dialog.remove();
  };
}
