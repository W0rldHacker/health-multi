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
}

export interface DashboardState {
  /** Aggregate status derived from the latest probe run. */
  aggregateStatus: NormalizedStatus;
  /** Total number of configured services. */
  serviceCount: number;
  /** Timestamp when the last probe run completed. */
  lastCompletedAt?: Date;
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

/**
 * Renders the base dashboard layout for the terminal user interface.
 */
export function renderDashboard(state: DashboardState, terminalWidth: number): string {
  const width = Number.isFinite(terminalWidth) && terminalWidth > 0 ? terminalWidth : 80;

  const columnWidths = computeColumnWidths(width);
  const header = renderHeader(state);
  const hints = renderHints();
  const table = renderTable(state.services, columnWidths);

  return [header, hints, table].filter(Boolean).join("\n");
}

function renderHeader(state: DashboardState): string {
  const status = state.aggregateStatus.toUpperCase();
  const services = state.serviceCount;
  const lastTick = state.lastCompletedAt ? formatTime(state.lastCompletedAt) : "—";

  return `Aggregate: ${status} | Services: ${services} | Last tick: ${lastTick}`;
}

function renderHints(): string {
  return "Keys: [f]ilter  [/] search  [s] sort  [q] quit";
}

function renderTable(services: readonly ServiceRow[], columnWidths: number[]): string {
  const headerRow = formatRow(
    columns.map((column) => column.label),
    columnWidths,
    columns.map((column) => column.align),
  );

  const divider = columns.map((_, index) => "─".repeat(columnWidths[index])).join("─┼─");

  const rows = services.map((service) =>
    formatRow(
      columns.map((column) => formatCellValue(column, service)),
      columnWidths,
      columns.map((column) => column.align),
    ),
  );

  return [headerRow, divider, ...rows].join("\n");
}

function formatRow(values: string[], widths: number[], alignments: ("left" | "right")[]): string {
  return values
    .map((value, index) => pad(value, widths[index], alignments[index]))
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
  const padding = width - [...truncated].length;

  if (alignment === "right") {
    return " ".repeat(padding) + truncated;
  }

  return truncated + " ".repeat(padding);
}

function truncate(value: string, width: number): string {
  if ([...value].length <= width) {
    return value;
  }

  if (width <= 1) {
    return value.slice(0, width);
  }

  const ellipsis = "…";
  const available = width - [...ellipsis].length;
  return `${[...value].slice(0, available).join("")}${ellipsis}`;
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
