import { isReducedMotion } from "./theme.js";

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function parseColor(value, fallback) {
  const color = value.trim();
  return color || fallback;
}

function setupField(root, canvas, cards) {
  const context = canvas.getContext("2d", { alpha: true });
  if (!context) return () => {};

  const particles = [];
  const pulses = [];
  const pointer = { x: 0, y: 0, active: false };
  const focus = { x: 0, y: 0, active: false };
  const cleanups = [];
  let frame = 0;
  let width = 0;
  let height = 0;
  let dpr = 1;
  let visible = true;
  let colors = {};
  let lastDrawAt = 0;
  const lowPower =
    (navigator.hardwareConcurrency || 8) <= 4 ||
    navigator.connection?.saveData === true;
  const frameInterval = 1000 / (lowPower ? 24 : 40);

  const readColors = () => {
    const styles = getComputedStyle(document.documentElement);
    colors = {
      line: parseColor(styles.getPropertyValue("--muted"), "#96999c"),
      point: parseColor(styles.getPropertyValue("--muted-strong"), "#c2c5c5"),
      accent: parseColor(styles.getPropertyValue("--accent"), "#c7ff3d"),
    };
  };

  const seedParticles = () => {
    const targetCount = lowPower
      ? clamp(Math.round((width * height) / 24000), 32, 58)
      : clamp(Math.round((width * height) / 17000), 42, 86);
    while (particles.length < targetCount) {
      const index = particles.length;
      const angle = index * 2.3999632297;
      const radius = Math.sqrt((index + 0.5) / targetCount) * 0.68;
      particles.push({
        x: width * (0.58 + Math.cos(angle) * radius * 0.52),
        y: height * (0.5 + Math.sin(angle) * radius * 0.5),
        vx: Math.cos(angle * 1.7) * 0.12,
        vy: Math.sin(angle * 1.3) * 0.12,
        radius: index % 9 === 0 ? 1.7 : index % 4 === 0 ? 1.2 : 0.8,
      });
    }
    particles.length = targetCount;
  };

  const resize = () => {
    const bounds = root.getBoundingClientRect();
    width = Math.max(1, bounds.width);
    height = Math.max(1, bounds.height);
    dpr = Math.min(window.devicePixelRatio || 1, 1.75);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    seedParticles();
    readColors();
    draw(true);
  };

  const draw = (still = false) => {
    context.clearRect(0, 0, width, height);
    const attractor = focus.active ? focus : pointer;
    const hasAttractor = attractor.active && !isReducedMotion();
    const maxDistance = width < 700 ? 92 : 132;

    if (!still && !isReducedMotion()) {
      particles.forEach((particle) => {
        if (hasAttractor) {
          const dx = attractor.x - particle.x;
          const dy = attractor.y - particle.y;
          const distance = Math.hypot(dx, dy) || 1;
          if (distance < 240) {
            const pull = (1 - distance / 240) * 0.018;
            particle.vx += (dx / distance) * pull;
            particle.vy += (dy / distance) * pull;
          }
        }

        pulses.forEach((pulse) => {
          const dx = particle.x - pulse.x;
          const dy = particle.y - pulse.y;
          const distance = Math.hypot(dx, dy) || 1;
          const delta = Math.abs(distance - pulse.radius);
          if (delta < 42) {
            const force = (1 - delta / 42) * 0.075;
            particle.vx += (dx / distance) * force;
            particle.vy += (dy / distance) * force;
          }
        });

        particle.vx *= 0.985;
        particle.vy *= 0.985;
        particle.x += particle.vx;
        particle.y += particle.vy;

        if (particle.x < -30) particle.x = width + 30;
        if (particle.x > width + 30) particle.x = -30;
        if (particle.y < -30) particle.y = height + 30;
        if (particle.y > height + 30) particle.y = -30;
      });

      pulses.forEach((pulse) => {
        pulse.radius += 5.2;
        pulse.alpha *= 0.965;
      });
      while (pulses.length && pulses[0].alpha < 0.025) pulses.shift();
    }

    context.lineWidth = 0.65;
    for (let i = 0; i < particles.length; i += 1) {
      const a = particles[i];
      for (let j = i + 1; j < particles.length; j += 1) {
        const b = particles[j];
        const distance = Math.hypot(a.x - b.x, a.y - b.y);
        if (distance > maxDistance) continue;
        const alpha = (1 - distance / maxDistance) * 0.44;
        context.globalAlpha = alpha;
        context.strokeStyle = colors.line;
        context.beginPath();
        context.moveTo(a.x, a.y);
        context.lineTo(b.x, b.y);
        context.stroke();
      }
    }

    particles.forEach((particle) => {
      const distance = hasAttractor
        ? Math.hypot(particle.x - attractor.x, particle.y - attractor.y)
        : Infinity;
      const highlighted = distance < 150;
      context.globalAlpha = highlighted ? 0.98 : 0.76;
      context.fillStyle = highlighted ? colors.accent : colors.point;
      context.beginPath();
      context.arc(particle.x, particle.y, highlighted ? particle.radius * 1.35 : particle.radius, 0, Math.PI * 2);
      context.fill();
    });

    pulses.forEach((pulse) => {
      context.globalAlpha = pulse.alpha;
      context.lineWidth = 1;
      context.strokeStyle = colors.accent;
      context.beginPath();
      context.arc(pulse.x, pulse.y, pulse.radius, 0, Math.PI * 2);
      context.stroke();
    });
    context.globalAlpha = 1;
  };

  const animate = (timestamp) => {
    if (
      visible &&
      document.visibilityState === "visible" &&
      !isReducedMotion() &&
      timestamp - lastDrawAt >= frameInterval
    ) {
      draw();
      lastDrawAt = timestamp;
    }
    frame = requestAnimationFrame(animate);
  };

  const pointFromEvent = (event) => {
    const bounds = root.getBoundingClientRect();
    return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
  };

  const onPointerMove = (event) => {
    if (event.pointerType === "touch") return;
    const point = pointFromEvent(event);
    pointer.x = point.x;
    pointer.y = point.y;
    pointer.active = true;
  };
  const onPointerLeave = () => { pointer.active = false; };
  const onClick = (event) => {
    if (isReducedMotion() || event.target.closest("a, button")) return;
    const point = pointFromEvent(event);
    pulses.push({ ...point, radius: 8, alpha: 0.72 });
  };

  root.addEventListener("pointermove", onPointerMove, { passive: true });
  root.addEventListener("pointerleave", onPointerLeave);
  root.addEventListener("click", onClick);
  cleanups.push(() => root.removeEventListener("pointermove", onPointerMove));
  cleanups.push(() => root.removeEventListener("pointerleave", onPointerLeave));
  cleanups.push(() => root.removeEventListener("click", onClick));

  cards.forEach((card) => {
    const activate = () => {
      focus.x = Number(card.dataset.fieldX || 0.78) * width;
      focus.y = Number(card.dataset.fieldY || 0.5) * height;
      focus.active = true;
      card.closest("li")?.classList.add("is-active");
    };
    const deactivate = (event) => {
      if (event?.relatedTarget && card.contains(event.relatedTarget)) return;
      focus.active = false;
      card.closest("li")?.classList.remove("is-active");
    };
    card.addEventListener("pointerenter", activate);
    card.addEventListener("pointerleave", deactivate);
    card.addEventListener("focus", activate);
    card.addEventListener("blur", deactivate);
    cleanups.push(() => card.removeEventListener("pointerenter", activate));
    cleanups.push(() => card.removeEventListener("pointerleave", deactivate));
    cleanups.push(() => card.removeEventListener("focus", activate));
    cleanups.push(() => card.removeEventListener("blur", deactivate));
  });

  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(root);
  const visibilityObserver = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
  }, { threshold: 0.01 });
  visibilityObserver.observe(root);

  const refresh = () => { readColors(); draw(true); };
  window.addEventListener("portfolio:themechange", refresh);
  window.addEventListener("portfolio:motionchange", refresh);
  document.addEventListener("visibilitychange", refresh);
  cleanups.push(() => window.removeEventListener("portfolio:themechange", refresh));
  cleanups.push(() => window.removeEventListener("portfolio:motionchange", refresh));
  cleanups.push(() => document.removeEventListener("visibilitychange", refresh));

  resize();
  animate();

  return () => {
    cancelAnimationFrame(frame);
    resizeObserver.disconnect();
    visibilityObserver.disconnect();
    cleanups.forEach((cleanup) => cleanup());
  };
}

export function initHero() {
  const root = document.querySelector("[data-hero-root]");
  const canvas = root?.querySelector("[data-hero-field]");
  const cards = Array.from(root?.querySelectorAll("[data-hero-project]") || []);
  if (!root || !canvas) return () => {};
  return setupField(root, canvas, cards);
}
