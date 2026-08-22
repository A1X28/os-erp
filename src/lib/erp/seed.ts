import type { Sql } from "@/lib/db";
import { todayIso } from "./format";

function shiftDate(daysAgo: number): string {
  const [y, m, d] = todayIso().split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() - daysAgo);
  return dt.toISOString().slice(0, 10);
}

type LineIn = { sku: string; qty: number; price: number };

export async function seedIfEmpty(sql: Sql): Promise<void> {
  const warehouses = [
    {
      code: "MAIN",
      name: "Основной склад",
      city: "Алматы",
      address: "пр. Суюнбая, 142",
      isDefault: true,
    },
    {
      code: "RETAIL",
      name: "Розничный зал",
      city: "Караганда",
      address: "ул. Бухар-жырау, 51",
      isDefault: false,
    },
    {
      code: "TRANS",
      name: "Склад Астана",
      city: "Астана",
      address: "ул. Кабанбай батыра, 8",
      isDefault: false,
    },
  ];

  const whIds: Record<string, number> = {};
  for (const w of warehouses) {
    const [row] = await sql<{ id: number }>`
      insert into warehouses (code, name, city, address, is_default)
      values (${w.code}, ${w.name}, ${w.city}, ${w.address}, ${w.isDefault})
      returning id
    `;
    whIds[w.code] = row.id;
  }

  const products = [
    ["CEM-50", "Цемент М400, 50 кг", "меш", "Стройматериалы", 2450, 3290, 40, "2000000000011"],
    ["PB-300", "Пескобетон М300, 40 кг", "меш", "Стройматериалы", 1850, 2490, 30, "2000000000028"],
    ["GK-125", "Гипсокартон 12.5 мм 1200×2500", "шт", "Стройматериалы", 1890, 2650, 40, "2000000000035"],
    ["PR-6027", "Профиль ПП 60×27, 3 м", "шт", "Стройматериалы", 420, 690, 80, "2000000000042"],
    ["INS-50", "Утеплитель минвата 50 мм", "уп", "Стройматериалы", 3400, 4890, 20, "2000000000059"],
    ["PT-10", "Краска интерьерная белая, 10 л", "шт", "Отделка", 6200, 8900, 12, "2000000000066"],
    ["GR-10", "Грунтовка акриловая, 10 л", "шт", "Отделка", 2800, 4100, 12, "2000000000073"],
    ["TIL-6060", "Керамогранит 60×60", "м²", "Отделка", 4100, 6200, 40, "2000000000080"],
    ["ADH-C2", "Клей плиточный C2, 25 кг", "меш", "Отделка", 2100, 3050, 24, "2000000000097"],
    ["LAM-33", "Ламинат 33 класс, 2.13 м²", "уп", "Отделка", 5200, 7800, 16, "2000000000103"],
    ["UND-3", "Подложка 3 мм, 10 м²", "рул", "Отделка", 890, 1390, 16, "2000000000110"],
    ["DR-80", "Дверь межкомнатная 800 мм", "шт", "Отделка", 18500, 27900, 4, "2000000000127"],
    ["SCR-3525", "Саморезы 3.5×25, 1000 шт", "уп", "Крепёж", 980, 1450, 20, "2000000000134"],
    ["MIX-CH", "Смеситель для раковины", "шт", "Инженерка", 9200, 14500, 6, "2000000000141"],
    ["PPR-20", "Труба ППР 20 мм, 4 м", "шт", "Инженерка", 640, 990, 40, "2000000000158"],
    ["FIT-20", "Уголок ППР 20 мм", "шт", "Инженерка", 85, 160, 80, "2000000000165"],
    ["CBL-325", "Кабель ВВГнг 3×2.5, 100 м", "бух", "Инженерка", 18600, 24900, 18, "2000000000172"],
    ["BRK-16", "Автомат 16А, 1P", "шт", "Инженерка", 720, 1190, 20, "2000000000189"],
    ["DRL-800", "Перфоратор 800 Вт", "шт", "Инструмент", 28400, 39900, 8, "2000000000196"],
    ["SCRD-18", "Шуруповёрт 18 В", "шт", "Инструмент", 22100, 32900, 6, "2000000000202"],
  ] as const;

  const skuIds: Record<string, number> = {};
  for (const p of products) {
    const [row] = await sql<{ id: number }>`
      insert into products (
        sku, name, unit, category, purchase_price, sale_price, vat_rate, min_stock, barcode
      ) values (
        ${p[0]}, ${p[1]}, ${p[2]}, ${p[3]}, ${p[4]}, ${p[5]}, 12, ${p[6]}, ${p[7]}
      )
      returning id
    `;
    skuIds[p[0]] = row.id;
  }

  const partners = [
    ["ТОО «КазЦемент»", "050140012345", "supplier", "Алматы", "+7 727 356 01 10"],
    ["ТОО «ГипсВосток»", "511840067890", "supplier", "Шымкент", "+7 7252 45 12 00"],
    ["ТОО «ПолимерПайп»", "091040055123", "supplier", "Караганда", "+7 7212 41 08 40"],
    ["ТОО «ЭлектроКом»", "010140098321", "supplier", "Астана", "+7 7172 28 44 10"],
    ["ТОО «СтройДом Астана»", "010140011908", "buyer", "Астана", "+7 7172 55 19 40"],
    ["ТОО «ДомМастер»", "050140077221", "buyer", "Алматы", "+7 727 250 33 18"],
    ["ТОО «Караганда Жилстрой»", "091040033210", "buyer", "Караганда", "+7 7212 30 15 77"],
    ["ТОО «Асар Строй»", "141040044118", "buyer", "Павлодар", "+7 7182 32 09 41"],
  ] as const;

  const partnerIds: Record<string, number> = {};
  for (const c of partners) {
    const [row] = await sql<{ id: number }>`
      insert into counterparties (name, inn, kind, city, phone)
      values (${c[0]}, ${c[1]}, ${c[2]}, ${c[3]}, ${c[4]})
      returning id
    `;
    partnerIds[c[0]] = row.id;
  }

  async function addDoc(input: {
    type: string;
    number: string;
    daysAgo: number;
    status: "draft" | "posted";
    warehouse?: string;
    from?: string;
    to?: string;
    partner?: string;
    comment?: string;
    lines: LineIn[];
  }) {
    const date = shiftDate(input.daysAgo);
    const warehouseId = input.warehouse ? whIds[input.warehouse] : null;
    const fromId = input.from ? whIds[input.from] : null;
    const toId = input.to ? whIds[input.to] : null;
    const partnerId = input.partner ? partnerIds[input.partner] : null;
    const postedAt = input.status === "posted" ? `${date}T10:00:00Z` : null;

    const [doc] = await sql<{ id: number }>`
      insert into documents (
        type, number, doc_date, status,
        warehouse_id, from_warehouse_id, to_warehouse_id,
        counterparty_id, comment, posted_at
      ) values (
        ${input.type}, ${input.number}, ${date}, ${input.status},
        ${warehouseId}, ${fromId}, ${toId},
        ${partnerId}, ${input.comment ?? ""}, ${postedAt}
      )
      returning id
    `;

    for (const line of input.lines) {
      const productId = skuIds[line.sku];
      const amount = Math.round(line.qty * line.price * 100) / 100;
      await sql`
        insert into document_lines (document_id, product_id, qty, price, amount)
        values (${doc.id}, ${productId}, ${line.qty}, ${line.price}, ${amount})
      `;
    }

    if (input.status !== "posted" || input.type === "order") return;

    for (const line of input.lines) {
      const productId = skuIds[line.sku];
      if (input.type === "purchase") {
        await sql`
          insert into stock_moves (document_id, product_id, warehouse_id, qty)
          values (${doc.id}, ${productId}, ${warehouseId}, ${line.qty})
        `;
      } else if (input.type === "sale" || input.type === "writeoff") {
        await sql`
          insert into stock_moves (document_id, product_id, warehouse_id, qty)
          values (${doc.id}, ${productId}, ${warehouseId}, ${-line.qty})
        `;
      } else if (input.type === "transfer") {
        await sql`
          insert into stock_moves (document_id, product_id, warehouse_id, qty)
          values (${doc.id}, ${productId}, ${fromId}, ${-line.qty})
        `;
        await sql`
          insert into stock_moves (document_id, product_id, warehouse_id, qty)
          values (${doc.id}, ${productId}, ${toId}, ${line.qty})
        `;
      }
    }
  }

  await addDoc({
    type: "purchase",
    number: "ПРМ-0001",
    daysAgo: 42,
    status: "posted",
    warehouse: "MAIN",
    partner: "ТОО «КазЦемент»",
    comment: "Поставка под сезон",
    lines: [
      { sku: "CEM-50", qty: 500, price: 2450 },
      { sku: "PB-300", qty: 300, price: 1850 },
    ],
  });

  await addDoc({
    type: "purchase",
    number: "ПРМ-0002",
    daysAgo: 36,
    status: "posted",
    warehouse: "MAIN",
    partner: "ТОО «ГипсВосток»",
    lines: [
      { sku: "GK-125", qty: 220, price: 1890 },
      { sku: "PR-6027", qty: 400, price: 420 },
      { sku: "INS-50", qty: 90, price: 3400 },
    ],
  });

  await addDoc({
    type: "purchase",
    number: "ПРМ-0003",
    daysAgo: 30,
    status: "posted",
    warehouse: "MAIN",
    partner: "ТОО «ПолимерПайп»",
    lines: [
      { sku: "PPR-20", qty: 250, price: 640 },
      { sku: "FIT-20", qty: 500, price: 85 },
      { sku: "MIX-CH", qty: 24, price: 9200 },
    ],
  });

  await addDoc({
    type: "purchase",
    number: "ПРМ-0004",
    daysAgo: 27,
    status: "posted",
    warehouse: "MAIN",
    partner: "ТОО «ЭлектроКом»",
    lines: [
      { sku: "CBL-325", qty: 20, price: 18600 },
      { sku: "BRK-16", qty: 80, price: 720 },
      { sku: "DRL-800", qty: 6, price: 28400 },
      { sku: "SCRD-18", qty: 8, price: 22100 },
    ],
  });

  await addDoc({
    type: "purchase",
    number: "ПРМ-0005",
    daysAgo: 25,
    status: "posted",
    warehouse: "MAIN",
    partner: "ТОО «ГипсВосток»",
    comment: "Отделка, партия августа",
    lines: [
      { sku: "PT-10", qty: 40, price: 6200 },
      { sku: "GR-10", qty: 40, price: 2800 },
      { sku: "TIL-6060", qty: 140, price: 4100 },
      { sku: "ADH-C2", qty: 80, price: 2100 },
      { sku: "LAM-33", qty: 70, price: 5200 },
      { sku: "UND-3", qty: 40, price: 890 },
      { sku: "DR-80", qty: 14, price: 18500 },
      { sku: "SCR-3525", qty: 100, price: 980 },
    ],
  });

  await addDoc({
    type: "purchase",
    number: "ПРМ-0006",
    daysAgo: 18,
    status: "posted",
    warehouse: "RETAIL",
    partner: "ТОО «КазЦемент»",
    comment: "Пополнение розницы",
    lines: [
      { sku: "CEM-50", qty: 80, price: 2450 },
      { sku: "GK-125", qty: 40, price: 1890 },
      { sku: "PT-10", qty: 12, price: 6200 },
      { sku: "SCR-3525", qty: 30, price: 980 },
      { sku: "DRL-800", qty: 2, price: 28400 },
      { sku: "MIX-CH", qty: 6, price: 9200 },
    ],
  });

  await addDoc({
    type: "transfer",
    number: "ПРМЩ-0001",
    daysAgo: 14,
    status: "posted",
    from: "MAIN",
    to: "RETAIL",
    comment: "На розничный зал",
    lines: [
      { sku: "LAM-33", qty: 10, price: 5200 },
      { sku: "TIL-6060", qty: 20, price: 4100 },
      { sku: "DR-80", qty: 3, price: 18500 },
    ],
  });

  const sales: Array<{
    number: string;
    daysAgo: number;
    partner: string;
    warehouse: string;
    lines: LineIn[];
    comment?: string;
  }> = [
    {
      number: "ОТГ-0001",
      daysAgo: 26,
      partner: "ТОО «СтройДом Астана»",
      warehouse: "MAIN",
      lines: [
        { sku: "CEM-50", qty: 80, price: 3290 },
        { sku: "PB-300", qty: 40, price: 2490 },
        { sku: "GK-125", qty: 30, price: 2650 },
      ],
    },
    {
      number: "ОТГ-0002",
      daysAgo: 24,
      partner: "ТОО «ДомМастер»",
      warehouse: "MAIN",
      lines: [
        { sku: "LAM-33", qty: 18, price: 7800 },
        { sku: "UND-3", qty: 12, price: 1390 },
        { sku: "PT-10", qty: 6, price: 8900 },
      ],
    },
    {
      number: "ОТГ-0003",
      daysAgo: 21,
      partner: "ТОО «Караганда Жилстрой»",
      warehouse: "MAIN",
      lines: [
        { sku: "TIL-6060", qty: 40, price: 6200 },
        { sku: "ADH-C2", qty: 16, price: 3050 },
        { sku: "GR-10", qty: 8, price: 4100 },
      ],
    },
    {
      number: "ОТГ-0004",
      daysAgo: 19,
      partner: "ТОО «Асар Строй»",
      warehouse: "MAIN",
      lines: [
        { sku: "PPR-20", qty: 40, price: 990 },
        { sku: "FIT-20", qty: 80, price: 160 },
        { sku: "MIX-CH", qty: 4, price: 14500 },
      ],
    },
    {
      number: "ОТГ-0005",
      daysAgo: 16,
      partner: "ТОО «ДомМастер»",
      warehouse: "MAIN",
      lines: [
        { sku: "DRL-800", qty: 2, price: 39900 },
        { sku: "SCRD-18", qty: 3, price: 32900 },
        { sku: "SCR-3525", qty: 10, price: 1450 },
      ],
    },
    {
      number: "ОТГ-0006",
      daysAgo: 13,
      partner: "ТОО «СтройДом Астана»",
      warehouse: "MAIN",
      comment: "Объект «Жетісу»",
      lines: [
        { sku: "CEM-50", qty: 120, price: 3290 },
        { sku: "INS-50", qty: 24, price: 4890 },
        { sku: "GK-125", qty: 50, price: 2650 },
        { sku: "PR-6027", qty: 80, price: 690 },
      ],
    },
    {
      number: "ОТГ-0007",
      daysAgo: 11,
      partner: "ТОО «Караганда Жилстрой»",
      warehouse: "RETAIL",
      lines: [
        { sku: "CEM-50", qty: 20, price: 3390 },
        { sku: "PT-10", qty: 4, price: 9100 },
        { sku: "MIX-CH", qty: 2, price: 14900 },
      ],
    },
    {
      number: "ОТГ-0008",
      daysAgo: 9,
      partner: "ТОО «ДомМастер»",
      warehouse: "MAIN",
      lines: [
        { sku: "CBL-325", qty: 4, price: 24900 },
        { sku: "BRK-16", qty: 16, price: 1190 },
        { sku: "DR-80", qty: 4, price: 27900 },
      ],
    },
    {
      number: "ОТГ-0009",
      daysAgo: 7,
      partner: "ТОО «Асар Строй»",
      warehouse: "MAIN",
      lines: [
        { sku: "LAM-33", qty: 12, price: 7800 },
        { sku: "TIL-6060", qty: 18, price: 6200 },
        { sku: "ADH-C2", qty: 8, price: 3050 },
      ],
    },
    {
      number: "ОТГ-0010",
      daysAgo: 5,
      partner: "ТОО «СтройДом Астана»",
      warehouse: "MAIN",
      lines: [
        { sku: "PB-300", qty: 60, price: 2490 },
        { sku: "CEM-50", qty: 50, price: 3290 },
        { sku: "SCR-3525", qty: 12, price: 1450 },
      ],
    },
    {
      number: "ОТГ-0011",
      daysAgo: 3,
      partner: "ТОО «Караганда Жилстрой»",
      warehouse: "RETAIL",
      lines: [
        { sku: "LAM-33", qty: 4, price: 7990 },
        { sku: "DR-80", qty: 1, price: 28900 },
        { sku: "GK-125", qty: 8, price: 2750 },
      ],
    },
    {
      number: "ОТГ-0012",
      daysAgo: 1,
      partner: "ТОО «ДомМастер»",
      warehouse: "MAIN",
      comment: "Срочная отгрузка",
      lines: [
        { sku: "PT-10", qty: 8, price: 8900 },
        { sku: "GR-10", qty: 8, price: 4100 },
        { sku: "UND-3", qty: 10, price: 1390 },
      ],
    },
  ];

  for (const s of sales) {
    await addDoc({
      type: "sale",
      status: "posted",
      ...s,
    });
  }

  await addDoc({
    type: "writeoff",
    number: "СПС-0001",
    daysAgo: 6,
    status: "posted",
    warehouse: "MAIN",
    comment: "Бой мешков при разгрузке",
    lines: [{ sku: "CEM-50", qty: 4, price: 2450 }],
  });

  await addDoc({
    type: "order",
    number: "ЗАК-0001",
    daysAgo: 2,
    status: "draft",
    warehouse: "MAIN",
    partner: "ТОО «СтройДом Астана»",
    comment: "Под объект «Сарыарка», ждём подтверждение",
    lines: [
      { sku: "CEM-50", qty: 200, price: 3290 },
      { sku: "GK-125", qty: 80, price: 2650 },
      { sku: "INS-50", qty: 30, price: 4890 },
    ],
  });

  await addDoc({
    type: "order",
    number: "ЗАК-0002",
    daysAgo: 0,
    status: "draft",
    warehouse: "RETAIL",
    partner: "ТОО «Караганда Жилстрой»",
    lines: [
      { sku: "DR-80", qty: 6, price: 27900 },
      { sku: "MIX-CH", qty: 6, price: 14500 },
    ],
  });

  await addDoc({
    type: "sale",
    number: "ОТГ-0013",
    daysAgo: 0,
    status: "draft",
    warehouse: "MAIN",
    partner: "ТОО «Асар Строй»",
    comment: "Собрать к вечеру",
    lines: [
      { sku: "PPR-20", qty: 20, price: 990 },
      { sku: "FIT-20", qty: 40, price: 160 },
      { sku: "BRK-16", qty: 10, price: 1190 },
    ],
  });

  await addDoc({
    type: "purchase",
    number: "ПРМ-0007",
    daysAgo: 0,
    status: "draft",
    warehouse: "MAIN",
    partner: "ТОО «КазЦемент»",
    comment: "Ждём машину",
    lines: [
      { sku: "CEM-50", qty: 200, price: 2450 },
      { sku: "PB-300", qty: 120, price: 1850 },
    ],
  });
}
