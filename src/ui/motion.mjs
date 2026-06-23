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
const recordDetailMotionQueue = {
  view: null,
  mode: null,
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

export function queueRecordDetailMotion(view, mode = "open") {
  recordDetailMotionQueue.view = view;
  recordDetailMotionQueue.mode = mode;
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

export function flushQueuedRecordDetailMotion(state) {
  if (shouldReduceMotion) {
    recordDetailMotionQueue.view = null;
    recordDetailMotionQueue.mode = null;
    return;
  }

  if (recordDetailMotionQueue.view !== state.activeView) {
    recordDetailMotionQueue.view = null;
    recordDetailMotionQueue.mode = null;
    return;
  }

  const mode = recordDetailMotionQueue.mode;
  recordDetailMotionQueue.view = null;
  recordDetailMotionQueue.mode = null;

  const workspace = document.querySelector(`[data-record-workspace="${CSS.escape(state.activeView)}"]`);
  if (!workspace) return;

  const tablePanel = workspace.querySelector(".record-table-panel, .record-table-shell");
  const detailPanel = workspace.querySelector("[data-record-detail-panel]");

  if (mode === "open" && detailPanel) {
    animate(
      detailPanel,
      {
        opacity: [0, 1],
        x: [22, 0],
        scale: [0.985, 1],
      },
      {
        duration: 0.26,
        ease: "easeOut",
      },
    );

    if (tablePanel) {
      animate(
        tablePanel,
        {
          opacity: [0.92, 1],
          scale: [0.995, 1],
        },
        {
          duration: 0.2,
          ease: "easeOut",
        },
      );
    }
    return;
  }

  if (mode === "close" && tablePanel) {
    animate(
      tablePanel,
      {
        opacity: [0.92, 1],
        scale: [0.992, 1],
      },
      {
        duration: 0.22,
        ease: "easeOut",
      },
    );
  }
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
