import React from "react";
import { createRoot } from "react-dom/client";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const chartRoots = new WeakMap();

function h(component, props, ...children) {
  return React.createElement(component, props, ...children);
}

function designTokens() {
  if (typeof window === "undefined") {
    return {
      primary: "#056053",
      primaryStrong: "#03483f",
      success: "#147d46",
      warning: "#b98512",
      error: "#9f1d1d",
      info: "#2c6f94",
      text: "#111827",
      muted: "#4b5a55",
      border: "#c7d8d3",
      card: "#ffffff",
    };
  }

  const styles = window.getComputedStyle(document.documentElement);
  const token = (name, fallback) => styles.getPropertyValue(name).trim() || fallback;
  return {
    primary: token("--color-primary", "#056053"),
    primaryStrong: token("--color-primary-strong", "#03483f"),
    success: token("--color-success", "#147d46"),
    warning: token("--color-warning", "#b98512"),
    error: token("--color-error", "#9f1d1d"),
    info: token("--color-info", "#2c6f94"),
    text: token("--color-text", "#111827"),
    muted: token("--color-text-muted", "#4b5a55"),
    border: token("--color-border", "#c7d8d3"),
    card: token("--color-card", "#ffffff"),
  };
}

function parseSeries(host) {
  try {
    const parsed = JSON.parse(host.dataset.rechartsSeries ?? "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function chartColor(item, tokens, index = 0) {
  if (item?.tone === "error") return tokens.error;
  if (item?.tone === "warning") return tokens.warning;
  if (item?.tone === "success") return tokens.success;
  return [tokens.primary, tokens.success, tokens.warning, tokens.info, tokens.error, tokens.primaryStrong][index % 6];
}

function compactTick(value) {
  const text = `${value ?? ""}`;
  return text.length > 18 ? `${text.slice(0, 16)}...` : text;
}

function tooltipContent({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const item = payload[0]?.payload ?? {};

  return h(
    "div",
    { className: "recharts-tooltip-panel" },
    h("strong", null, item.label ?? label),
    h("span", null, item.displayValue ?? payload[0]?.value),
    item.meta ? h("small", null, item.meta) : null,
  );
}

function BarAnalyticsChart({ series, title, tokens, width, height }) {
  return h(
    BarChart,
    { data: series, layout: "vertical", width, height, margin: { top: 8, right: 28, bottom: 8, left: 12 } },
    h(CartesianGrid, { stroke: tokens.border, strokeDasharray: "3 3", horizontal: false }),
    h(XAxis, { type: "number", tick: { fill: tokens.muted, fontSize: 12 }, axisLine: false, tickLine: false }),
    h(YAxis, {
      type: "category",
      dataKey: "label",
      width: 118,
      tickFormatter: compactTick,
      tick: { fill: tokens.text, fontSize: 12, fontWeight: 700 },
      axisLine: false,
      tickLine: false,
    }),
    h(Tooltip, { content: tooltipContent, cursor: { fill: "rgba(5, 96, 83, 0.07)" } }),
    h(Bar, {
      dataKey: "value",
      name: title,
      radius: [0, 7, 7, 0],
      children: series.map((item, index) => h(Cell, { key: `${item.label}-${index}`, fill: chartColor(item, tokens, index) })),
    }),
  );
}

function DonutAnalyticsChart({ series, title, tokens, width, height }) {
  return h(
    PieChart,
    { width, height, margin: { top: 8, right: 8, bottom: 8, left: 8 } },
    h(Tooltip, { content: tooltipContent }),
    h(Legend, { verticalAlign: "bottom", height: 44, iconType: "square", wrapperStyle: { color: tokens.muted, fontSize: 12 } }),
    h(Pie, {
      data: series,
      dataKey: "value",
      nameKey: "label",
      innerRadius: "54%",
      outerRadius: "78%",
      paddingAngle: 3,
      labelLine: false,
      label: ({ percent }) => `${Math.round((percent ?? 0) * 100)}%`,
      children: series.map((item, index) => h(Cell, { key: `${title}-${item.label}`, fill: chartColor(item, tokens, index) })),
    }),
  );
}

function LineAnalyticsChart({ series, title, tokens, width, height }) {
  return h(
    AreaChart,
    { data: series, width, height, margin: { top: 12, right: 22, bottom: 6, left: 0 } },
    h("defs", null, h("linearGradient", { id: "stockledger-activity-gradient", x1: "0", y1: "0", x2: "0", y2: "1" },
      h("stop", { offset: "5%", stopColor: tokens.primary, stopOpacity: 0.34 }),
      h("stop", { offset: "95%", stopColor: tokens.primary, stopOpacity: 0.03 }),
    )),
    h(CartesianGrid, { stroke: tokens.border, strokeDasharray: "3 3", vertical: false }),
    h(XAxis, { dataKey: "label", tick: { fill: tokens.muted, fontSize: 12 }, axisLine: false, tickLine: false }),
    h(YAxis, { tick: { fill: tokens.muted, fontSize: 12 }, axisLine: false, tickLine: false, allowDecimals: false, width: 32 }),
    h(Tooltip, { content: tooltipContent }),
    h(Area, {
      type: "monotone",
      dataKey: "value",
      name: title,
      stroke: tokens.primary,
      strokeWidth: 3,
      fill: "url(#stockledger-activity-gradient)",
      activeDot: { r: 6, fill: tokens.card, stroke: tokens.primaryStrong, strokeWidth: 3 },
    }),
  );
}

function ChartIsland({ kind, title, series, width, height }) {
  const tokens = designTokens();
  if (kind === "donut") return h(DonutAnalyticsChart, { series, title, tokens, width, height });
  if (kind === "line") return h(LineAnalyticsChart, { series, title, tokens, width, height });
  return h(BarAnalyticsChart, { series, title, tokens, width, height });
}

export function mountReportCharts(root = document) {
  root.querySelectorAll("[data-recharts-chart]").forEach((host) => {
    const series = parseSeries(host);
    const kind = host.dataset.rechartsKind ?? "bar";
    const title = host.dataset.rechartsTitle ?? "Report chart";
    const rect = host.getBoundingClientRect();
    const width = Math.max(320, Math.round(rect.width || host.clientWidth || 640));
    const height = Math.max(220, Math.round(rect.height || host.clientHeight || 300));
    let chartRoot = chartRoots.get(host);

    if (!chartRoot) {
      chartRoot = createRoot(host);
      chartRoots.set(host, chartRoot);
    }

    chartRoot.render(h(ChartIsland, { kind, title, series, width, height }));
  });
}
