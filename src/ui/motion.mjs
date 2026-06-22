import { animate } from "motion";

const shouldReduceMotion = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
const sidebarTemplateColumns = {
  expanded: "236px minmax(0, 1fr)",
  collapsed: "68px minmax(0, 1fr)",
};
const tabMotionQueue = {
  activeView: null,
  stockView: null,
};

let sidebarMotion = null;

function getSidebarTemplateColumns(collapsed) {
  return collapsed ? sidebarTemplateColumns.collapsed : sidebarTemplateColumns.expanded;
}

export function queueActiveViewMotion(view) {
  tabMotionQueue.activeView = view;
}

export function queueStockViewMotion(view) {
  tabMotionQueue.stockView = view;
}

export function animateSidebarTransition(targetCollapsed) {
  return new Promise((resolve) => {
    if (shouldReduceMotion) {
      resolve();
      return;
    }

    const shell = document.querySelector(".app-shell");
    if (!shell) {
      resolve();
      return;
    }

    const from = window.getComputedStyle(shell).gridTemplateColumns;
    const to = getSidebarTemplateColumns(targetCollapsed);

    if (from === to) {
      resolve();
      return;
    }

    if (sidebarMotion?.stop) {
      sidebarMotion.stop();
    }

    sidebarMotion = animate(
      shell,
      {
        gridTemplateColumns: [from, to],
      },
      {
        duration: 0.24,
        ease: "easeOut",
      },
    );

    sidebarMotion.finished
      .then(() => {
        shell.style.removeProperty("grid-template-columns");
        sidebarMotion = null;
        resolve();
      })
      .catch(() => {
        shell.style.removeProperty("grid-template-columns");
        sidebarMotion = null;
        resolve();
      });
  });
}

function animateTabPress(button) {
  if (shouldReduceMotion || !button) return;
  animate(
    button,
    {
      scale: [1, 0.98, 1],
      y: [0, 1, 0],
    },
    {
      duration: 0.16,
      ease: "easeOut",
    },
  );
}

function animateTabActivate(button) {
  if (shouldReduceMotion || !button) return;
  animate(
    button,
    {
      scale: [0.99, 1.01, 1],
      y: [2, 0],
    },
    {
      duration: 0.24,
      ease: "easeOut",
    },
  );
}

function animateTabHover(button, hovered) {
  if (shouldReduceMotion || !button) return;
  animate(
    button,
    {
      y: hovered ? -1 : 0,
      scale: hovered ? 1.01 : 1,
    },
    {
      duration: 0.16,
      ease: "easeOut",
    },
  );
}

export function flushQueuedTabMotion(state) {
  if (shouldReduceMotion) {
    tabMotionQueue.activeView = null;
    tabMotionQueue.stockView = null;
    return;
  }

  if (tabMotionQueue.activeView === state.activeView) {
    const nextTab = document.querySelector(`.nav-item[data-view="${CSS.escape(tabMotionQueue.activeView)}"]`);
    if (nextTab) animateTabActivate(nextTab);
  }
  tabMotionQueue.activeView = null;

  if (tabMotionQueue.stockView === state.stockView) {
    const nextStockTab = document.querySelector(`.stock-overview-view-tab[data-stock-view="${CSS.escape(tabMotionQueue.stockView)}"]`);
    if (nextStockTab) animateTabActivate(nextStockTab);
  }
  tabMotionQueue.stockView = null;
}

export function bindTabMotion() {
  if (shouldReduceMotion) return;

  const bindSimplePressMotion = (button) => {
    button.addEventListener("pointerdown", () => animateTabPress(button), { passive: true });
    button.addEventListener("click", (event) => {
      if (event.detail === 0) {
        animateTabPress(button);
      }
    });
  };

  document.querySelectorAll(".nav-item").forEach((button) => {
    bindSimplePressMotion(button);
    button.addEventListener("pointerenter", () => animateTabHover(button, true), { passive: true });
    button.addEventListener("pointerleave", () => animateTabHover(button, false), { passive: true });
  });

  document.querySelectorAll(".stock-overview-view-tab").forEach((button) => {
    bindSimplePressMotion(button);
    button.addEventListener("pointerenter", () => animateTabHover(button, true), { passive: true });
    button.addEventListener("pointerleave", () => animateTabHover(button, false), { passive: true });
  });

  document.querySelectorAll("[data-view]:not(.nav-item):not(.stock-overview-view-tab)").forEach((button) => {
    bindSimplePressMotion(button);
  });
}
