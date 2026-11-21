import { type ReactNode, useId } from "react";
import { ChartWithTable } from "../charts/ChartWithTable";
import { Alert } from "../components/ui/Alert";
import { Button, type ButtonVariant } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { FormField } from "../components/ui/FormField";
import { Input } from "../components/ui/Input";
import { Spinner } from "../components/ui/Spinner";
import { Table, type TableColumn } from "../components/ui/Table";
import { REFERENCE_PAGE_MARKER } from "../design/buildChecks";
import { tokenRoles } from "../design/tokenRoles";
import { colors } from "../design/tokens";

/** Development-only page for reviewing and approving the design system (TASK-002 AC-10, AC-13). */
export function ReferencePage() {
  return (
    <div data-page={REFERENCE_PAGE_MARKER} className="flex flex-col gap-12">
      <div className="flex flex-col gap-2">
        <h2 className="text-h1 text-fg">Design reference</h2>
        <p className="max-w-prose text-body text-fg-secondary">
          Every token, component, and state in the design system. This page exists in development
          builds only.
        </p>
      </div>
      <ColorSection />
      <TypographySection />
      <LayoutSection />
      <ButtonSection />
      <FormSection />
      <FeedbackSection />
      <ChartSection />
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="flex flex-col gap-4">
      <h3 id={id} className="border-b border-border pb-2 text-h2 text-fg">
        {title}
      </h3>
      {children}
    </section>
  );
}

const COLOR_GROUPS: [string, (name: string) => boolean][] = [
  ["Brand", (n) => n.startsWith("brand-")],
  ["Surfaces", (n) => ["canvas", "surface", "surface-muted"].includes(n)],
  ["Text", (n) => n.startsWith("fg") || n === "accent" || n === "highlight"],
  ["Accent tints", (n) => ["accent-subtle", "highlight-subtle", "on-brand-accent"].includes(n)],
  ["Borders and focus", (n) => n.startsWith("border") || n === "focus"],
  ["Actions", (n) => /^(primary|on-primary|destructive|on-destructive)/.test(n)],
  ["Status", (n) => /^(success|warning|error|info)/.test(n)],
  ["Chart: categorical", (n) => n.startsWith("chart-")],
  ["Chart: sequential", (n) => n.startsWith("seq-")],
  ["Chart: diverging", (n) => n.startsWith("div-")],
];

function ColorSection() {
  const names = Object.keys(colors);
  return (
    <Section title="Color tokens">
      {COLOR_GROUPS.map(([group, matches]) => (
        <div key={group} className="flex flex-col gap-2">
          <h4 className="text-h3 text-fg">{group}</h4>
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {names.filter(matches).map((name) => (
              <li
                key={name}
                data-testid={`swatch-${name}`}
                className="flex items-center gap-3 rounded-md border border-border bg-surface p-2"
              >
                <span
                  aria-hidden="true"
                  className="size-10 shrink-0 rounded-sm border border-border"
                  style={{ background: `var(--color-${name})` }}
                />
                <span className="flex min-w-0 flex-col">
                  <code className="truncate text-caption text-fg">--color-{name}</code>
                  <span className="text-caption text-fg-secondary">{tokenRoles[name]}</span>
                  <span className="text-caption text-fg-muted">{colors[name]}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </Section>
  );
}

// Full class names so Tailwind can find them.
const TYPE_STEPS = [
  ["display", "text-display tabular-nums", "1,234,567"],
  ["h1", "text-h1", "Heading level 1"],
  ["h2", "text-h2", "Heading level 2"],
  ["h3", "text-h3", "Heading level 3"],
  ["body", "text-body", "Body text for paragraphs and answers."],
  ["body-sm", "text-body-sm", "Small body text for secondary content and tables."],
  ["label", "text-label", "Form label"],
  ["caption", "text-caption", "Caption and metadata"],
] as const;

function TypographySection() {
  return (
    <Section title="Typography">
      <p className="text-body-sm text-fg-secondary">
        Inter Variable, self-hosted. Numbers in tables use tabular figures.
      </p>
      <dl className="flex flex-col gap-3">
        {TYPE_STEPS.map(([step, className, sample]) => (
          <div key={step} className="grid grid-cols-1 items-baseline gap-1 sm:grid-cols-[8rem_1fr]">
            <dt>
              <code className="text-caption text-fg-muted">text-{step}</code>
            </dt>
            <dd className={`${className} text-fg`}>{sample}</dd>
          </div>
        ))}
      </dl>
    </Section>
  );
}

function LayoutSection() {
  const sample =
    "flex h-16 items-center justify-center border border-border bg-surface text-caption text-fg";
  return (
    <Section title="Spacing, radius, and elevation">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <div className={`${sample} rounded-sm`}>radius-sm</div>
        <div className={`${sample} rounded-md`}>radius-md</div>
        <div className={`${sample} rounded-lg`}>radius-lg</div>
        <div className={`${sample} rounded-md shadow-sm`}>shadow-sm</div>
        <div className={`${sample} rounded-md shadow-md`}>shadow-md</div>
        <div className="flex h-16 items-center gap-0 rounded-md border border-border bg-surface p-4">
          <span className="text-caption text-fg">spacing 4 (16px)</span>
        </div>
      </div>
      <p className="text-body-sm text-fg-secondary">
        Spacing uses a 4px unit. Breakpoints: 640, 768, 1024, 1280 px. Minimum supported width: 320
        px.
      </p>
    </Section>
  );
}

const VARIANTS: ButtonVariant[] = ["primary", "secondary", "ghost", "destructive"];

function ButtonSection() {
  return (
    <Section title="Buttons">
      <div className="flex flex-col gap-4">
        {VARIANTS.map((variant) => (
          <div key={variant} className="flex flex-wrap items-center gap-3">
            <code className="w-28 text-caption text-fg-muted">{variant}</code>
            <Button variant={variant}>Default</Button>
            <Button variant={variant} size="sm">
              Small
            </Button>
            <Button variant={variant} disabled>
              Disabled
            </Button>
            <Button variant={variant} loading>
              Loading
            </Button>
          </div>
        ))}
      </div>
    </Section>
  );
}

function FormSection() {
  return (
    <Section title="Form fields">
      <div className="grid max-w-3xl grid-cols-1 gap-6 md:grid-cols-2">
        <FormField label="Default">
          {(f) => <Input placeholder="Placeholder text" {...f} />}
        </FormField>
        <FormField label="With description" description="Helpful hint shown below the label.">
          {(f) => <Input {...f} />}
        </FormField>
        <FormField label="Required" required>
          {(f) => <Input {...f} />}
        </FormField>
        <FormField label="With error" error="Enter a valid email address.">
          {(f) => <Input defaultValue="not-an-email" {...f} />}
        </FormField>
        <FormField label="Disabled">
          {(f) => <Input disabled defaultValue="Unavailable" {...f} />}
        </FormField>
      </div>
    </Section>
  );
}

interface SampleRow {
  id: string;
  product: string;
  revenue: number;
  items: number;
}

const SAMPLE_ROWS: SampleRow[] = [
  { id: "a", product: "Sample product A", revenue: 12840.5, items: 312 },
  { id: "b", product: "Sample product B", revenue: 9310, items: 1045 },
  { id: "c", product: "Sample product C", revenue: 870.25, items: 18 },
];

const SAMPLE_COLUMNS: TableColumn<SampleRow>[] = [
  { key: "product", header: "Product", rowHeader: true },
  {
    key: "revenue",
    header: "Revenue",
    numeric: true,
    format: (v) => Number(v).toLocaleString("en-US", { style: "currency", currency: "USD" }),
  },
  {
    key: "items",
    header: "Items",
    numeric: true,
    format: (v) => Number(v).toLocaleString("en-US"),
  },
];

function FeedbackSection() {
  return (
    <Section title="Feedback and containers">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Alert variant="info" title="Information">
          The active result set covers 2025 orders.
        </Alert>
        <Alert variant="success" title="Success">
          Results loaded.
        </Alert>
        <Alert variant="warning" title="Warning">
          This question needs a different data scope.
        </Alert>
        <Alert variant="error" title="Error">
          The data could not be loaded. Try again.
        </Alert>
      </div>
      <div className="flex items-center gap-3 text-body-sm text-fg-secondary">
        <Spinner label="Loading example" /> Spinner (animation stops when reduced motion is
        requested)
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title="Example card" headingLevel={4} footer="Footer: source and scope metadata">
          <p className="text-body text-fg-secondary">
            Cards group related content on a raised surface.
          </p>
        </Card>
        <Table
          caption="Example table (sample values)"
          columns={SAMPLE_COLUMNS}
          rows={SAMPLE_ROWS}
          rowKey={(r) => r.id}
        />
      </div>
    </Section>
  );
}

function ChartSection() {
  return (
    <Section title="Charts">
      <p className="text-body-sm text-fg-secondary">
        Illustrative sample values, not TheLook data. Every chart is paired with a table of its
        exact values.
      </p>
      <ChartWithTable
        title="Monthly revenue by region (sample)"
        categoryLabel="Month"
        categories={["Jan", "Feb", "Mar", "Apr", "May", "Jun"]}
        series={[
          { name: "Region A", values: [42100, 39850, 45200, 47900, 51300, 49800] },
          { name: "Region B", values: [31800, 33400, 30900, 35600, 37200, 39900] },
          { name: "Region C", values: [18200, 19900, 21400, 20800, 23600, 25100] },
        ]}
        formatValue={(v) =>
          v.toLocaleString("en-US", {
            style: "currency",
            currency: "USD",
            maximumFractionDigits: 0,
          })
        }
      />
    </Section>
  );
}
