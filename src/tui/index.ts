import { type NormalizedStatus } from "../domain";

export interface ServiceRow {
  /** Human readable unique name of the service. */
  name: string;
  /** Latest normalized status reported by the service. */
  status?: NormalizedStatus;
  /** Latest measured latency in milliseconds. */
  latencyMs?: number;
  /** Optional semantic version string. */
  version?: string;
  /** Optional region identifier. */
  region?: string;
  /** Age of the latest observation in milliseconds. */
  ageMs?: number;
  /** Tags associated with the service. */
  tags?: readonly string[];
  /** Optional URL of the service health endpoint. */
  url?: string;
}

export type SortBy = "latency" | "status" | "name";

export type SortDirection = "asc" | "desc";

export interface SortConfig {
  by: SortBy;
  direction?: SortDirection;
}

export type ColorMode = "color" | "no-color";

export interface ColorPalette {
  ok: string;
  degraded: string;
  down: string;
  header: string;
  accent: string;
  neutral: string;
  reset: string;
}

export interface ServiceDetailPane {
  service: ServiceRow;
  /** Last observed health endpoint URL. */
  url?: string;
  /** Latest latency history in milliseconds for sparkline rendering. */
  latencyHistoryMs?: readonly number[];
  /** Raw JSON payload captured from the service. */
  responseJson?: unknown;
  /** Response headers captured from the service. */
  responseHeaders?: Record<string, string | readonly string[]>;
  /** Optional window size used when sampling history. */
  historyWindow?: number;
  /** Timestamp when the detail pane data was captured. */
  capturedAt?: Date;
}

export interface DashboardState {
  /** Aggregate status derived from the latest probe run. */
  aggregateStatus: NormalizedStatus;
  /** Total number of configured services. */
  serviceCount: number;
  /** Timestamp when the last probe run completed. */
  lastCompletedAt?: Date;
  /** Raw filter string, composed of tokens like tag:, status:, region:. */
  filters?: string;
  /** Search query matching service name or URL. */
  searchQuery?: string;
  /** Sorting configuration applied to the table. */
  sort?: SortConfig;
  /** Rendering mode for ANSI colors. */
  colorMode?: ColorMode;
  /** Custom color palette overriding the defaults. */
  colorPalette?: Partial<ColorPalette>;
  /** Detail pane describing the currently focused service. */
  detailPane?: ServiceDetailPane;
  /** Rows displayed in the service table. */
  services: readonly ServiceRow[];
}

interface ColumnDefinition {
  key: keyof ServiceRow | "status" | "latency" | "age";
  label: string;
  minWidth: number;
  align: "left" | "right";
  flex?: boolean;
}

const columns: ColumnDefinition[] = [
  { key: "name", label: "Name", minWidth: 8, align: "left", flex: true },
  { key: "status", label: "Status", minWidth: 8, align: "left" },
  { key: "latency", label: "Latency", minWidth: 8, align: "right" },
  { key: "version", label: "Version", minWidth: 8, align: "left" },
  { key: "region", label: "Region", minWidth: 8, align: "left" },
  { key: "age", label: "Age", minWidth: 6, align: "right" },
  { key: "tags", label: "Tags", minWidth: 8, align: "left", flex: true },
];

const MIN_COLUMN_WIDTH = 3;
const COLUMN_SEPARATOR = " │ ";

const DEFAULT_SORT: SortConfig = { by: "name", direction: "asc" };

const STATUS_ORDER: Record<NormalizedStatus, number> = { ok: 0, degraded: 1, down: 2 };

const DEFAULT_COLOR_PALETTE: ColorPalette = {
  ok: "\u001B[32m",
  degraded: "\u001B[33m",
  down: "\u001B[31m",
  header: "\u001B[36m",
  accent: "\u001B[35m",
  neutral: "\u001B[37m",
  reset: "\u001B[0m",
};

const ANSI_ESCAPE_REGEX = new RegExp(String.raw`\u001B\[[0-9;]*m`, "gu");

/**
 * Renders the base dashboard layout for the terminal user interface.
 */
export function renderDashboard(state: DashboardState, terminalWidth: number): string {
  const width = Number.isFinite(terminalWidth) && terminalWidth > 0 ? terminalWidth : 80;
  const colorMode = state.colorMode ?? "color";
  const palette = createPalette(state.colorPalette);

  const filteredServices = applyFilters(state.services, state.filters, state.searchQuery);
  const sortedServices = sortServices(filteredServices, state.sort ?? DEFAULT_SORT);

  const columnWidths = computeColumnWidths(width);
  const header = renderHeader(state, colorMode, palette);
  const context = renderContext(state, filteredServices.length);
  const hints = renderHints();
  const table = renderTable(sortedServices, columnWidths, colorMode, palette);
  const detailPane = state.detailPane
    ? ["", renderDetailPane(state.detailPane, width, colorMode, palette)]
    : [];

  return [header, context, hints, table, ...detailPane].filter(Boolean).join("\n");
}

function renderHeader(state: DashboardState, colorMode: ColorMode, palette: ColorPalette): string {
  const rawStatus = state.aggregateStatus.toUpperCase();
  const status = colorizeStatus(rawStatus, state.aggregateStatus, colorMode, palette);
  const services = state.serviceCount;
  const lastTick = state.lastCompletedAt ? formatTime(state.lastCompletedAt) : "—";

  return `Aggregate: ${status} | Services: ${services} | Last tick: ${lastTick}`;
}

function renderContext(state: DashboardState, matches: number): string {
  const filterText = state.filters?.trim() ? state.filters.trim() : "none";
  const searchText = state.searchQuery?.trim() ? `"${state.searchQuery.trim()}"` : "—";
  const sort = state.sort ?? DEFAULT_SORT;
  const direction = sort.direction === "desc" ? "↓" : "↑";
  const matchRatio = `${matches}/${state.serviceCount}`;

  return `Filters: ${filterText} | Search: ${searchText} | Sort: ${sort.by} ${direction} | Matches: ${matchRatio}`;
}

function renderHints(): string {
  return "Keys: [f]ilter  [/] search  [s] sort  [q] quit";
}

function renderTable(
  services: readonly ServiceRow[],
  columnWidths: number[],
  colorMode: ColorMode,
  palette: ColorPalette,
): string {
  const alignments = columns.map((column) => column.align);
  const headerRow = formatRow(
    columns.map((column) => column.label),
    columnWidths,
    alignments,
    (value) => colorizeHeader(value, colorMode, palette),
  );

  const divider = columns.map((_, index) => "─".repeat(columnWidths[index])).join("─┼─");

  if (services.length === 0) {
    const emptyRow = formatRow(
      columns.map((column, index) => (index === 0 ? "No services match current filters" : "")),
      columnWidths,
      alignments,
    );

    return [headerRow, divider, emptyRow].join("\n");
  }

  const rows = services.map((service) =>
    formatRow(
      columns.map((column) => formatCellValue(column, service)),
      columnWidths,
      alignments,
      (value, index) => {
        const column = columns[index];
        if (column.key === "status") {
          return colorizeStatus(value, service.status, colorMode, palette);
        }

        if (column.key === "latency" && typeof service.latencyMs === "number") {
          return colorMode === "color" ? applyColor(value, palette.accent, palette.reset) : value;
        }

        return value;
      },
    ),
  );

  return [headerRow, divider, ...rows].join("\n");
}

function formatRow(
  values: string[],
  widths: number[],
  alignments: ("left" | "right")[],
  transform?: (value: string, index: number) => string,
): string {
  return values
    .map((value, index) => {
      const padded = pad(value, widths[index], alignments[index]);
      return transform ? transform(padded, index) : padded;
    })
    .join(COLUMN_SEPARATOR);
}

function formatCellValue(column: ColumnDefinition, service: ServiceRow): string {
  switch (column.key) {
    case "name":
      return service.name;
    case "status":
      return service.status ? service.status.toUpperCase() : "—";
    case "latency":
      return formatLatency(service.latencyMs);
    case "version":
      return service.version ?? "—";
    case "region":
      return service.region ?? "—";
    case "age":
      return formatAge(service.ageMs);
    case "tags":
      return service.tags && service.tags.length > 0 ? service.tags.join(", ") : "—";
    default:
      return "";
  }
}

function formatLatency(value: number | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "—";
  }

  const rounded = Math.round(value);
  return `${rounded} ms`;
}

function formatAge(value: number | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return "—";
  }

  if (value < 1000) {
    return "0s";
  }

  const seconds = Math.floor(value / 1000);

  if (seconds < 60) {
    return `${seconds}s`;
  }

  const minutes = Math.floor(seconds / 60);

  if (minutes < 60) {
    return `${minutes}m`;
  }

  const hours = Math.floor(minutes / 60);

  if (hours < 24) {
    return `${hours}h`;
  }

  const days = Math.floor(hours / 24);
  return `${days}d`;
}

function formatTime(value: Date): string {
  return value.toISOString();
}

function pad(value: string, width: number, alignment: "left" | "right"): string {
  const truncated = truncate(value, width);
  const padding = width - visibleLength(truncated);

  if (alignment === "right") {
    return " ".repeat(padding) + truncated;
  }

  return truncated + " ".repeat(padding);
}

function truncate(value: string, width: number): string {
  if (visibleLength(value) <= width) {
    return value;
  }

  if (width <= 1) {
    return value.slice(0, width);
  }

  const ellipsis = "…";
  const available = width - [...ellipsis].length;
  return `${[...stripAnsi(value)].slice(0, available).join("")}${ellipsis}`;
}

function computeColumnWidths(totalWidth: number): number[] {
  const separatorWidth = COLUMN_SEPARATOR.length * (columns.length - 1);
  const availableWidth = totalWidth - separatorWidth;

  const widths = columns.map((column) => column.minWidth);
  const minimumWidth = columns.length * MIN_COLUMN_WIDTH;

  if (availableWidth <= 0) {
    return widths;
  }

  const currentTotal = widths.reduce((sum, width) => sum + width, 0);

  if (availableWidth < minimumWidth) {
    return widths;
  }

  if (availableWidth < currentTotal) {
    let deficit = currentTotal - availableWidth;
    const shrinkOrder = ["tags", "name", "region", "version", "latency", "status", "age"] as const;

    for (const key of shrinkOrder) {
      if (deficit <= 0) {
        break;
      }

      const index = columns.findIndex((column) => column.key === key);
      if (index === -1) {
        continue;
      }

      const min = Math.min(columns[index].minWidth, MIN_COLUMN_WIDTH);
      const spare = widths[index] - min;
      if (spare <= 0) {
        continue;
      }

      const reduction = Math.min(spare, deficit);
      widths[index] -= reduction;
      deficit -= reduction;
    }

    return widths;
  }

  let surplus = availableWidth - currentTotal;
  const flexIndices = columns
    .map((column, index) => (column.flex ? index : -1))
    .filter((index) => index !== -1);

  if (flexIndices.length === 0) {
    return widths;
  }

  let flexPointer = 0;
  while (surplus > 0) {
    const index = flexIndices[flexPointer % flexIndices.length];
    widths[index] += 1;
    surplus -= 1;
    flexPointer += 1;
  }

  return widths;
}

function applyFilters(
  services: readonly ServiceRow[],
  filters: string | undefined,
  searchQuery: string | undefined,
): ServiceRow[] {
  const parsed = parseFilters(filters);
  const normalizedSearch = searchQuery?.trim().toLowerCase();

  return services.filter(
    (service) => matchesFilters(service, parsed) && matchesSearch(service, normalizedSearch),
  );
}

interface ParsedFilters {
  readonly tags: readonly string[];
  readonly statuses: readonly NormalizedStatus[];
  readonly regions: readonly string[];
}

function parseFilters(filters: string | undefined): ParsedFilters {
  if (!filters) {
    return { tags: [], statuses: [], regions: [] };
  }

  const tags: string[] = [];
  const statuses: NormalizedStatus[] = [];
  const regions: string[] = [];

  const tokens = filters
    .split(/\s+/u)
    .map((token) => token.trim())
    .filter(Boolean);

  for (const token of tokens) {
    const [prefix, rawValue] = token.split(":", 2);
    if (!rawValue) {
      continue;
    }

    const value = rawValue.toLowerCase();
    switch (prefix.toLowerCase()) {
      case "tag":
        tags.push(value);
        break;
      case "status":
        if (isNormalizedStatus(value)) {
          statuses.push(value);
        }
        break;
      case "region":
        regions.push(value);
        break;
      default:
        break;
    }
  }

  return { tags, statuses, regions };
}

function matchesFilters(service: ServiceRow, filters: ParsedFilters): boolean {
  if (filters.tags.length > 0) {
    const serviceTags = service.tags?.map((tag) => tag.toLowerCase()) ?? [];
    if (!filters.tags.every((tag) => serviceTags.includes(tag))) {
      return false;
    }
  }

  if (filters.statuses.length > 0) {
    const status = service.status?.toLowerCase() as NormalizedStatus | undefined;
    if (!status || !filters.statuses.includes(status)) {
      return false;
    }
  }

  if (filters.regions.length > 0) {
    const region = service.region?.toLowerCase();
    if (!region || !filters.regions.includes(region)) {
      return false;
    }
  }

  return true;
}

function matchesSearch(service: ServiceRow, searchQuery: string | undefined): boolean {
  if (!searchQuery) {
    return true;
  }

  const name = service.name.toLowerCase();
  if (name.includes(searchQuery)) {
    return true;
  }

  const url = service.url?.toLowerCase();
  if (url && url.includes(searchQuery)) {
    return true;
  }

  return false;
}

function sortServices(services: readonly ServiceRow[], sort: SortConfig): ServiceRow[] {
  const direction: SortDirection = sort.direction === "desc" ? "desc" : "asc";

  return [...services].sort((a, b) => {
    switch (sort.by) {
      case "latency":
        return direction === "desc"
          ? compareLatencyDesc(a.latencyMs, b.latencyMs)
          : compareLatencyAsc(a.latencyMs, b.latencyMs);
      case "status":
        return direction === "desc"
          ? compareStatusDesc(a.status, b.status)
          : compareStatusAsc(a.status, b.status);
      case "name":
      default:
        return direction === "desc" ? compareName(b.name, a.name) : compareName(a.name, b.name);
    }
  });
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function compareLatencyAsc(a: number | undefined, b: number | undefined): number {
  const aMissing = !isFiniteNumber(a);
  const bMissing = !isFiniteNumber(b);
  if (aMissing && bMissing) return 0;
  if (aMissing) return 1;
  if (bMissing) return -1;
  return a - b;
}

function compareLatencyDesc(a: number | undefined, b: number | undefined): number {
  const aMissing = !isFiniteNumber(a);
  const bMissing = !isFiniteNumber(b);
  if (aMissing && bMissing) return 0;
  if (aMissing) return 1; // a после b
  if (bMissing) return -1; // b после a
  return b - a;
}

function compareStatusAsc(
  a: NormalizedStatus | undefined,
  b: NormalizedStatus | undefined,
): number {
  const aMissing = !a;
  const bMissing = !b;
  if (aMissing && bMissing) return 0;
  if (aMissing) return 1;
  if (bMissing) return -1;
  return STATUS_ORDER[a] - STATUS_ORDER[b];
}

function compareStatusDesc(
  a: NormalizedStatus | undefined,
  b: NormalizedStatus | undefined,
): number {
  const aMissing = !a;
  const bMissing = !b;
  if (aMissing && bMissing) return 0;
  if (aMissing) return 1;
  if (bMissing) return -1;
  return STATUS_ORDER[b] - STATUS_ORDER[a];
}

function compareName(a: string, b: string): number {
  return a.localeCompare(b, undefined, { sensitivity: "base" });
}

function renderDetailPane(
  pane: ServiceDetailPane,
  width: number,
  colorMode: ColorMode,
  palette: ColorPalette,
): string {
  const lines: string[] = [];
  const service = pane.service;
  const title = `Detail: ${service.name}`;
  lines.push(colorMode === "color" ? applyColor(title, palette.header, palette.reset) : title);

  const statusText = service.status ? service.status.toUpperCase() : "—";
  const statusLine = `Status: ${statusText}`;
  lines.push(colorizeStatus(statusLine, service.status, colorMode, palette));

  if (typeof service.latencyMs === "number" && Number.isFinite(service.latencyMs)) {
    lines.push(`Latency: ${formatLatency(service.latencyMs)}`);
  }

  if (pane.url ?? service.url) {
    lines.push(`URL: ${pane.url ?? service.url}`);
  }

  if (service.region) {
    lines.push(`Region: ${service.region}`);
  }

  if (service.tags && service.tags.length > 0) {
    lines.push(`Tags: ${service.tags.join(", ")}`);
  }

  const sparkline = renderSparkline(pane.latencyHistoryMs);
  if (sparkline) {
    lines.push(
      `Latency sparkline${pane.historyWindow ? ` (last ${pane.historyWindow})` : ""}: ${sparkline}`,
    );
  }

  if (pane.capturedAt) {
    lines.push(`Captured at: ${formatTime(pane.capturedAt)}`);
  }

  if (pane.responseJson !== undefined) {
    lines.push("Last response JSON:");
    lines.push(indentBlock(formatJson(pane.responseJson), 2));
  }

  if (pane.responseHeaders && Object.keys(pane.responseHeaders).length > 0) {
    lines.push("Headers:");
    lines.push(indentBlock(formatHeaders(pane.responseHeaders), 2));
  }

  const maxWidth = Math.max(40, Math.min(width, 120));
  const separator = "─".repeat(Math.min(maxWidth, width));
  return [separator, ...lines].join("\n");
}

function renderSparkline(values: readonly number[] | undefined): string | undefined {
  if (!values || values.length === 0) {
    return undefined;
  }

  const finiteValues = values.filter(
    (value) => typeof value === "number" && Number.isFinite(value),
  );
  if (finiteValues.length === 0) {
    return undefined;
  }

  const sparkChars = ["▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"];
  const min = Math.min(...finiteValues);
  const max = Math.max(...finiteValues);

  if (min === max) {
    const index = Math.floor(sparkChars.length / 2);
    return sparkChars[index].repeat(finiteValues.length);
  }

  return finiteValues
    .map((value) => {
      const ratio = (value - min) / (max - min);
      const index = Math.min(
        sparkChars.length - 1,
        Math.max(0, Math.round(ratio * (sparkChars.length - 1))),
      );
      return sparkChars[index];
    })
    .join("");
}

function formatJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2) ?? "—";
  } catch {
    return "[unserializable JSON]";
  }
}

function formatHeaders(headers: Record<string, string | readonly string[]>): string {
  const entries = Object.entries(headers).sort(([a], [b]) => a.localeCompare(b));
  return entries
    .map(([key, value]) => {
      if (typeof value === "string") {
        return `${key}: ${value}`;
      }

      if (Array.isArray(value)) {
        return `${key}: ${value.join(", ")}`;
      }

      return `${key}: ${String(value)}`;
    })
    .join("\n");
}

function indentBlock(value: string, spaces: number): string {
  const prefix = " ".repeat(spaces);
  return value
    .split("\n")
    .map((line) => `${prefix}${line}`)
    .join("\n");
}

function createPalette(overrides: Partial<ColorPalette> | undefined): ColorPalette {
  return { ...DEFAULT_COLOR_PALETTE, ...(overrides ?? {}) };
}

function colorizeStatus(
  value: string,
  status: NormalizedStatus | undefined,
  colorMode: ColorMode,
  palette: ColorPalette,
): string {
  if (colorMode === "no-color") {
    return value;
  }

  if (status === "ok") {
    return applyColor(value, palette.ok, palette.reset);
  }

  if (status === "degraded") {
    return applyColor(value, palette.degraded, palette.reset);
  }

  if (status === "down") {
    return applyColor(value, palette.down, palette.reset);
  }

  return value;
}

function colorizeHeader(value: string, colorMode: ColorMode, palette: ColorPalette): string {
  if (colorMode === "no-color") {
    return value;
  }

  return applyColor(value, palette.header, palette.reset);
}

function applyColor(value: string, color: string, reset: string): string {
  return `${color}${value}${reset}`;
}

function visibleLength(value: string): number {
  return [...stripAnsi(value)].length;
}

function stripAnsi(value: string): string {
  return value.replace(ANSI_ESCAPE_REGEX, "");
}

function isNormalizedStatus(value: string): value is NormalizedStatus {
  return value === "ok" || value === "degraded" || value === "down";
}

export type { DashboardRuntimeOptions, ShutdownReason, ShutdownResult } from "./runtime";
export { DashboardRuntime } from "./runtime";
