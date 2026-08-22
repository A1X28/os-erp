import { COMPANY_PRINT, PRINT_TITLE, BUYER_DOC, SUPPLIER_DOC } from "@/lib/erp/labels";
import { amountInWords, formatDate, money, qtyFmt, vatIncluded } from "@/lib/erp/format";
import type { DocType, DocumentDetail } from "@/lib/erp/types";

function partyLine(p: {
  name: string;
  inn?: string | null;
  city?: string | null;
  phone?: string | null;
  extra?: string[];
}) {
  const bits = [p.name];
  if (p.inn) bits.push(`БИН/ИИН ${p.inn}`);
  if (p.city) bits.push(p.city);
  if (p.phone) bits.push(p.phone);
  for (const x of p.extra ?? []) if (x) bits.push(x);
  return bits.join(" · ");
}

function oursLine() {
  const ours = COMPANY_PRINT;
  return partyLine({
    name: ours.name,
    inn: ours.bin,
    city: ours.address,
    phone: ours.phone,
  });
}

const WAYBILL: DocType[] = ["sale", "purchase", "transfer", "writeoff"];
const BILL: DocType[] = ["invoice", "bill"];

export function DocumentPrint({ doc }: { doc: DocumentDetail }) {
  const title = PRINT_TITLE[doc.type];
  const vat = vatIncluded(doc.amount);
  const ours = COMPANY_PRINT;
  const toBuyer = BUYER_DOC.includes(doc.type);
  const fromSupplier = SUPPLIER_DOC.includes(doc.type);
  const seller = toBuyer
    ? oursLine()
    : partyLine({
        name: doc.partnerName ?? "—",
        inn: doc.partnerInn,
        city: doc.partnerCity,
        phone: doc.partnerPhone,
      });
  const buyer = fromSupplier
    ? oursLine()
    : partyLine({
        name: doc.partnerName ?? "—",
        inn: doc.partnerInn,
        city: doc.partnerCity,
        phone: doc.partnerPhone,
      });
  const bankBits = [ours.bank, ours.iik, ours.bik].filter(Boolean);

  return (
    <article className="mx-auto max-w-[190mm] bg-white px-1 py-2 text-black">
      {doc.status !== "posted" ? (
        <p className="mb-3 text-xs font-medium uppercase tracking-wider text-neutral-500">
          Черновик — не проведён
        </p>
      ) : null}

      <header className="border-b border-neutral-300 pb-3">
        <p className="text-sm font-medium">{ours.name}</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          {title} № {doc.number}
        </h1>
        <p className="mt-1 text-sm">от {formatDate(doc.docDate)}</p>
      </header>

      <dl className="mt-4 grid gap-2 text-sm">
        {doc.type !== "transfer" && doc.type !== "writeoff" ? (
          <>
            <div>
              <dt className="text-xs text-neutral-500">Поставщик</dt>
              <dd>{seller}</dd>
            </div>
            <div>
              <dt className="text-xs text-neutral-500">Покупатель</dt>
              <dd>{buyer}</dd>
            </div>
          </>
        ) : null}
        {doc.type === "transfer" ? (
          <div>
            <dt className="text-xs text-neutral-500">Склады</dt>
            <dd>
              {doc.fromWarehouseName} → {doc.toWarehouseName}
            </dd>
          </div>
        ) : doc.warehouseName ? (
          <div>
            <dt className="text-xs text-neutral-500">Склад</dt>
            <dd>{doc.warehouseName}</dd>
          </div>
        ) : null}
        {doc.sourceNumber ? (
          <div>
            <dt className="text-xs text-neutral-500">Основание</dt>
            <dd>{doc.sourceNumber}</dd>
          </div>
        ) : null}
        {BILL.includes(doc.type) && bankBits.length > 0 ? (
          <div>
            <dt className="text-xs text-neutral-500">Реквизиты для оплаты</dt>
            <dd>{bankBits.join(" · ")}</dd>
          </div>
        ) : null}
      </dl>

      <table className="mt-5 w-full border-collapse text-sm">
        <thead>
          <tr className="border-y border-neutral-300 text-left text-xs text-neutral-500">
            <th className="w-8 py-2 font-medium">№</th>
            <th className="py-2 font-medium">Товар</th>
            <th className="w-16 py-2 font-medium">Ед.</th>
            <th className="w-20 py-2 text-right font-medium">Кол-во</th>
            <th className="w-24 py-2 text-right font-medium">Цена</th>
            <th className="w-28 py-2 text-right font-medium">Сумма</th>
          </tr>
        </thead>
        <tbody>
          {doc.lines.map((line, i) => (
            <tr key={line.id} className="border-b border-neutral-200">
              <td className="py-1.5 tabular-nums text-neutral-500">{i + 1}</td>
              <td className="py-1.5">
                <span className="font-medium">{line.name}</span>
                <span className="ml-2 text-xs text-neutral-500">{line.sku}</span>
              </td>
              <td className="py-1.5">{line.unit}</td>
              <td className="py-1.5 text-right tabular-nums">{qtyFmt(line.qty)}</td>
              <td className="py-1.5 text-right tabular-nums">{money(line.price)}</td>
              <td className="py-1.5 text-right tabular-nums">{money(line.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-4 flex justify-end">
        <table className="text-sm">
          <tbody>
            <tr>
              <td className="pr-6 text-neutral-500">В т.ч. НДС 12%</td>
              <td className="text-right tabular-nums">{money(vat)}</td>
            </tr>
            <tr>
              <td className="pr-6 pt-1 font-medium">Итого</td>
              <td className="pt-1 text-right text-base font-semibold tabular-nums">
                {money(doc.amount)}
              </td>
            </tr>
            {BILL.includes(doc.type) && doc.dueAmount > 0 ? (
              <tr>
                <td className="pr-6 pt-1 text-neutral-500">К оплате</td>
                <td className="pt-1 text-right tabular-nums">{money(doc.dueAmount)}</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-sm">
        <span className="text-neutral-500">Сумма прописью: </span>
        {amountInWords(doc.amount)}
      </p>

      {doc.comment ? (
        <p className="mt-3 text-sm">
          <span className="text-neutral-500">Комментарий: </span>
          {doc.comment}
        </p>
      ) : null}

      {WAYBILL.includes(doc.type) ? (
        <div className="mt-10 grid grid-cols-2 gap-10 text-sm">
          <div>
            <p className="text-xs text-neutral-500">Отпустил</p>
            <p className="mt-8 border-b border-neutral-400">&nbsp;</p>
          </div>
          <div>
            <p className="text-xs text-neutral-500">Получил</p>
            <p className="mt-8 border-b border-neutral-400">&nbsp;</p>
          </div>
        </div>
      ) : null}
    </article>
  );
}
