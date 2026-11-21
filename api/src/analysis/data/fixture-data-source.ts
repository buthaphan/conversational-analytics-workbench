import { Injectable } from "@nestjs/common";
import type { EntityCapabilityId, Scope } from "../capabilities/registry";
import { DataSource, type ResultRowData, UNKNOWN_BRAND } from "./data-source";
import { fromCents, toCents } from "./money";
import type { DailySalesRequest, DailySalesRow } from "./time-series";

/**
 * Deterministic stand-in for TheLook (TASK-003 TD-12). Its aggregation is the reference semantics
 * TASK-004's BigQuery queries must match: only items with status "Complete" whose date is in
 * [start_date, end_date) count; money is summed in cents and rounded half up to 2 decimals.
 */

export type ItemStatus = "Complete" | "Returned" | "Cancelled" | "Processing";

export interface Fixture {
  customers: { id: string; name: string }[];
  /** `brand` is null for a product without one, as in TheLook (TASK-005 AC-2). */
  products: {
    id: string;
    name: string;
    category: string;
    department: string;
    brand: string | null;
  }[];
  items: {
    orderId: string;
    customerId: string;
    productId: string;
    /** YYYY-MM-DD */
    date: string;
    status: ItemStatus;
    salePrice: number;
  }[];
}

const CATEGORIES = [
  "Jeans",
  "Tops & Tees",
  "Outerwear & Coats",
  "Sweaters",
  "Shorts",
  "Accessories",
  "Active",
  "Sleep & Lounge",
];
const FIRST = [
  "Ava",
  "Ben",
  "Chloe",
  "Dan",
  "Ella",
  "Finn",
  "Grace",
  "Hugo",
  "Isla",
  "Jack",
  "Kai",
  "Lena",
  "Max",
  "Nina",
  "Owen",
  "Pia",
  "Quinn",
  "Rosa",
  "Sam",
  "Tara",
];
const LAST = [
  "Adams",
  "Brown",
  "Chen",
  "Diaz",
  "Evans",
  "Fox",
  "Garcia",
  "Hill",
  "Ito",
  "Jones",
  "Khan",
  "Lopez",
  "Moore",
  "Ng",
  "Ortiz",
  "Patel",
  "Reed",
  "Silva",
  "Tan",
  "Wong",
];
const STYLES = [
  "Classic",
  "Slim",
  "Relaxed",
  "Vintage",
  "Cozy",
  "Everyday",
  "Premium",
  "Light",
  "Urban",
  "Soft",
  "Bold",
  "Essential",
  "Tailored",
  "Easy",
  "Field",
];

/** Small seeded PRNG (mulberry32), so the fixture is identical on every run and machine. */
function random(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Invented brand names; more than the brand cap (20), so grouping shows an "Other" row. */
const BRANDS = [
  "Alder Row",
  "Bramblecrest",
  "Cobalt Lane",
  "Dunmore Knit",
  "Emberfield",
  "Fernhollow",
  "Glenbrae",
  "Harrowgate Supply",
  "Inkstone",
  "Juniper Moss",
  "Kestrel Point",
  "Larkspur Lane",
  "Meridian Loom",
  "Northline",
  "Oakhurst Mill",
  "Pinecrest Goods",
  "Quarrystone",
  "Riverbend Co",
  "Saltmarsh",
  "Thistlewood",
  "Umberline",
  "Valewind",
  "Westbrook Field",
  "Yarrowdale",
  "Zephyr Loom",
  "Ashgrove Studio",
  "Birchway",
  "Copperhollow",
  "Driftmoor",
  "Elmstead Works",
];

const START = Date.UTC(2024, 0, 1);
const END = Date.UTC(2026, 10, 8); // exclusive: 2026-11-08
const DAY = 24 * 60 * 60 * 1000;

export function generateFixture(seed = 20261108): Fixture {
  const rand = random(seed);
  const pick = <T>(list: T[]): T => list[Math.floor(rand() * list.length)] as T;
  const pad = (n: number, width: number) => String(n).padStart(width, "0");

  const customers = Array.from({ length: 400 }, (_, i) => ({
    id: `C${pad(i + 1, 4)}`,
    name: `${pick(FIRST)} ${pick(LAST)}`,
  }));
  const products = Array.from({ length: 120 }, (_, i) => {
    const category = CATEGORIES[i % CATEGORIES.length] as string;
    return {
      id: `P${pad(i + 1, 4)}`,
      name: `${pick(STYLES)} ${category.split(" ")[0]} ${pad(i + 1, 3)}`,
      category,
      // Department and brand don't draw from the random sequence, so the TASK-003 and TASK-004
      // fixture data (names, prices, orders) stays exactly as it was.
      department: Math.floor(i / CATEGORIES.length) % 2 === 0 ? "Men" : "Women",
      brand: i % 40 === 7 ? null : (BRANDS[(i * 7) % BRANDS.length] as string),
    };
  });
  const prices = new Map(products.map((p) => [p.id, Math.round((8 + rand() * 140) * 100) / 100]));

  const items: Fixture["items"] = [];
  let order = 0;
  for (const customer of customers) {
    const orders = Math.floor(rand() * 9);
    for (let o = 0; o < orders; o++) {
      order += 1;
      const date = new Date(START + Math.floor(rand() * ((END - START) / DAY)) * DAY)
        .toISOString()
        .slice(0, 10);
      const lines = 1 + Math.floor(rand() * 3);
      for (let l = 0; l < lines; l++) {
        const product = pick(products);
        const roll = rand();
        const status: ItemStatus =
          roll < 0.8
            ? "Complete"
            : roll < 0.88
              ? "Returned"
              : roll < 0.95
                ? "Cancelled"
                : "Processing";
        items.push({
          orderId: `O${pad(order, 6)}`,
          customerId: customer.id,
          productId: product.id,
          date,
          status,
          salePrice: prices.get(product.id) as number,
        });
      }
    }
  }
  return { customers, products, items };
}

@Injectable()
export class FixtureDataSource extends DataSource {
  constructor(private readonly fixture: Fixture = generateFixture()) {
    super();
  }

  async fetch(capability: EntityCapabilityId, scope: Scope): Promise<ResultRowData[]> {
    const items = this.fixture.items.filter(
      (i) => i.status === "Complete" && i.date >= scope.start_date && i.date < scope.end_date,
    );
    return capability === "customer_spending"
      ? this.customerSpending(items)
      : this.productSales(items);
  }

  /** Per period and day: revenue summed in cents, distinct orders, items (TASK-005 AC-4). */
  async fetchDailySales(request: DailySalesRequest): Promise<DailySalesRow[]> {
    const filter = request.productFilter;
    const productOk = new Map(
      this.fixture.products.map((p) => [p.id, !filter || filter.values.includes(p[filter.field])]),
    );
    const rows: DailySalesRow[] = [];
    for (const { period, scope } of request.periods) {
      const byDay = new Map<string, { cents: number; orders: Set<string>; count: number }>();
      for (const item of this.fixture.items) {
        if (item.status !== "Complete" || item.date < scope.start_date) continue;
        if (item.date >= scope.end_date || !productOk.get(item.productId)) continue;
        const entry = byDay.get(item.date) ?? { cents: 0, orders: new Set<string>(), count: 0 };
        entry.cents += toCents(item.salePrice);
        entry.orders.add(item.orderId);
        entry.count += 1;
        byDay.set(item.date, entry);
      }
      for (const [date, { cents, orders, count }] of byDay)
        rows.push({
          period,
          date,
          revenue: fromCents(cents),
          order_count: orders.size,
          item_count: count,
        });
    }
    return rows;
  }

  private customerSpending(items: Fixture["items"]): ResultRowData[] {
    const byCustomer = new Map<string, { cents: number; orders: Set<string> }>();
    for (const item of items) {
      const entry = byCustomer.get(item.customerId) ?? { cents: 0, orders: new Set<string>() };
      entry.cents += toCents(item.salePrice);
      entry.orders.add(item.orderId);
      byCustomer.set(item.customerId, entry);
    }
    return this.fixture.customers
      .filter((c) => byCustomer.has(c.id))
      .map((c) => {
        const { cents, orders } = byCustomer.get(c.id) as { cents: number; orders: Set<string> };
        return {
          customer_id: c.id,
          customer_name: c.name,
          total_spend: fromCents(cents),
          order_count: orders.size,
          avg_order_value: fromCents(cents / orders.size),
        };
      });
  }

  private productSales(items: Fixture["items"]): ResultRowData[] {
    const byProduct = new Map<string, { cents: number; count: number }>();
    for (const item of items) {
      const entry = byProduct.get(item.productId) ?? { cents: 0, count: 0 };
      entry.cents += toCents(item.salePrice);
      entry.count += 1;
      byProduct.set(item.productId, entry);
    }
    return this.fixture.products
      .filter((p) => byProduct.has(p.id))
      .map((p) => {
        const { cents, count } = byProduct.get(p.id) as { cents: number; count: number };
        return {
          product_id: p.id,
          product_name: p.name,
          category: p.category,
          department: p.department,
          brand: p.brand ?? UNKNOWN_BRAND,
          revenue: fromCents(cents),
          item_count: count,
        };
      });
  }
}
