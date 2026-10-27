"use client";

import { useEffect, useState } from "react";
import { animate, motion, useReducedMotion } from "motion/react";

const revealSelector = ".dg-page-heading,.dg-hero,.dg-stat,.dg-section-heading,.dg-library-toolbar,.dg-project-card,.dg-bottom-banner,.dg-template-card,.dg-guide-hero,.dg-guide-grid article,.dg-settings-card,.dg-flow-card,.dg-tip";
const reactiveSelector = ".dg-stat,.dg-project-card,.dg-template-card,.dg-settings-card,.dg-flow-card,.dg-hero";

export function GlassMotion({ view }: { view: string }) {
  const reduced = useReducedMotion();
  useEffect(() => {
    const root = document.querySelector<HTMLElement>(".dg-studio");
    if (!root) return;
    const observer = !reduced && "IntersectionObserver" in window ? new IntersectionObserver((entries) => {
      for (const entry of entries) if (entry.isIntersecting) {
        entry.target.classList.add("dg-in-view");
        observer?.unobserve(entry.target);
      }
    }, { threshold: 0.08, rootMargin: "0px 0px -20px 0px" }) : null;
    let index = 0;
    const prepare = (element: HTMLElement) => {
      if (element.matches(reactiveSelector)) element.classList.add("dg-reactive");
      if (element.classList.contains("dg-reveal")) return;
      element.style.setProperty("--reveal-delay", `${Math.min(index++ % 4, 3) * 95}ms`);
      element.classList.add("dg-reveal");
      if (observer) observer.observe(element); else element.classList.add("dg-in-view");
    };
    root.querySelectorAll<HTMLElement>(revealSelector).forEach(prepare);
    const mutations = new MutationObserver((records) => {
      for (const record of records) for (const node of record.addedNodes) if (node instanceof HTMLElement) {
        if (node.matches(revealSelector)) prepare(node);
        node.querySelectorAll<HTMLElement>(revealSelector).forEach(prepare);
      }
    });
    mutations.observe(root, { childList: true, subtree: true });
    let frame = 0;
    const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    const move = (event: PointerEvent) => {
      if (reduced || !finePointer) return;
      const card = (event.target as Element)?.closest<HTMLElement>(reactiveSelector);
      if (!card) return;
      const rect = card.getBoundingClientRect();
      const x = (event.clientX - rect.left) / rect.width;
      const y = (event.clientY - rect.top) / rect.height;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        card.style.setProperty("--glass-x", `${x * 100}%`);
        card.style.setProperty("--glass-y", `${y * 100}%`);
        card.style.setProperty("--glass-rx", `${(0.5 - y) * 4}deg`);
        card.style.setProperty("--glass-ry", `${(x - 0.5) * 4}deg`);
      });
    };
    const leave = (event: PointerEvent) => {
      const card = (event.target as Element)?.closest<HTMLElement>(reactiveSelector);
      if (!card || (event.relatedTarget instanceof Node && card.contains(event.relatedTarget))) return;
      cancelAnimationFrame(frame);
      card.style.setProperty("--glass-rx", "0deg");
      card.style.setProperty("--glass-ry", "0deg");
    };
    root.addEventListener("pointermove", move, { passive: true });
    root.addEventListener("pointerout", leave, { passive: true });
    return () => {
      observer?.disconnect(); mutations.disconnect(); cancelAnimationFrame(frame);
      root.removeEventListener("pointermove", move); root.removeEventListener("pointerout", leave);
      root.querySelectorAll<HTMLElement>(".dg-reveal").forEach((element) => element.classList.remove("dg-reveal", "dg-in-view"));
    };
  }, [view, reduced]);

  return <div className="dg-atmosphere" aria-hidden="true">
    <motion.div className="dg-light dg-light-blue" animate={reduced ? undefined : { x: [0, 70, -40, 0], y: [0, 70, -25, 0], scale: [1, 1.17, 0.95, 1] }} transition={{ duration: 25, repeat: Infinity, ease: "easeInOut" }} />
    <motion.div className="dg-light dg-light-violet" animate={reduced ? undefined : { x: [0, -70, 30, 0], y: [0, -60, 40, 0] }} transition={{ duration: 28, repeat: Infinity, ease: "easeInOut" }} />
    <motion.div className="dg-light dg-light-amber" animate={reduced ? undefined : { x: [0, -55, 20, 0], scale: [1, 1.2, 1] }} transition={{ duration: 20, repeat: Infinity, ease: "easeInOut" }} />
    <div className="dg-stardust" />
  </div>;
}

export function NumberTicker({ value }: { value: number }) {
  const reduced = useReducedMotion();
  const [display, setDisplay] = useState(value);
  useEffect(() => {
    if (reduced) { setDisplay(value); return; }
    const animation = animate(0, value, { duration: 1.4, ease: [0.16, 1, 0.3, 1], onUpdate: (current) => setDisplay(Math.round(current)) });
    return () => animation.stop();
  }, [value, reduced]);
  return <span className="dg-count" aria-label={String(value)}>{display.toString().padStart(2, "0")}</span>;
}
