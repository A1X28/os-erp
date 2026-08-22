import { amountInWords, formatDate, money } from "@/lib/erp/format";
import { netBalance, type SettlePeriod } from "@/lib/erp/settle";
import type { CompanyProfile, Partner } from "@/lib/erp/types";

function party(name: string, inn?: string, extra?: string) {
  const bits = [name];
  if (inn) bits.push(`БИН/ИИН ${inn}`);
  if (extra) bits.push(extra);
  return bits.join(" · ");
}

function saldoPhrase(debit: number, credit: number, currency: SettlePeriod["currency"]) {
  const net = netBalance(debit, credit);
  if (Math.abs(net) < 0.01) return "взаимных долгов нет";
  if (net > 0) return `задолженность контрагента составляет ${money(net, { currency })}`;
  return `задолженность перед контрагентом составляет ${money(-net, { currency })}`;
}

export function SettlePrint({
  partner,
  company,
  from,
  to,
  periods,
}: {
  partner: Partner;
  company: CompanyProfile;
  from: string;
  to: string;
  periods: SettlePeriod[];
}) {
  const ours = party(company.name, company.bin, company.address);
  const theirs = party(partner.name, partner.inn || undefined, [partner.city, partner.phone].filter(Boolean).join(", "));

  return (
    <article className="mx-auto max-w-[190mm] bg-white px-1 py-2 text-black">
      <header className="border-b border-neutral-300 pb-3">
        <p className="text-sm font-medium">{company.name}</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          Акт сверки взаимных расчётов
        </h1>
        <p className="mt-1 text-sm">
          за период с {formatDate(from)} по {formatDate(to)}
        </p>
      </header>

      <p className="mt-4 text-sm leading-relaxed">
        Мы, нижеподписавшиеся, {ours} с одной стороны и {theirs} с другой стороны
        составили настоящий акт сверки в том, что состояние взаимных расчётов
        следующее.
      </p>

      {periods.length === 0 ? (
        <p className="mt-6 text-sm text-neutral-500">За период движений нет.</p>
      ) : (
        periods.map((p) => {
          const close = netBalance(p.closingDebit, p.closingCredit);
          return (
            <section key={p.currency} className="mt-6">
              <h2 className="text-base font-semibold">Валюта {p.currency}</h2>
              <table className="mt-2 w-full border-collapse text-sm">
                <thead>
                  <tr className="border-y border-neutral-300 text-left text-xs text-neutral-500">
                    <th className="py-2 font-medium">Дата</th>
                    <th className="py-2 font-medium">Документ</th>
                    <th className="w-28 py-2 text-right font-medium">Дебет</th>
                    <th className="w-28 py-2 text-right font-medium">Кредит</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-neutral-200">
                    <td className="py-1.5 text-neutral-500" colSpan={2}>
                      Сальдо на {formatDate(from)}
                    </td>
                    <td className="py-1.5 text-right tabular-nums">
                      {p.openingDebit > 0.009 ? money(p.openingDebit, { currency: p.currency }) : "—"}
                    </td>
                    <td className="py-1.5 text-right tabular-nums">
                      {p.openingCredit > 0.009 ? money(p.openingCredit, { currency: p.currency }) : "—"}
                    </td>
                  </tr>
                  {p.rows.map((r) => (
                    <tr key={`${r.docId ?? "p"}-${r.payId ?? r.number}-${r.date}`} className="border-b border-neutral-200">
                      <td className="py-1.5 text-neutral-500">{formatDate(r.date)}</td>
                      <td className="py-1.5">
                        {r.number}
                        <span className="ml-2 text-xs text-neutral-500">{r.title}</span>
                      </td>
                      <td className="py-1.5 text-right tabular-nums">
                        {r.debit > 0.009 ? money(r.debit, { currency: p.currency }) : "—"}
                      </td>
                      <td className="py-1.5 text-right tabular-nums">
                        {r.credit > 0.009 ? money(r.credit, { currency: p.currency }) : "—"}
                      </td>
                    </tr>
                  ))}
                  <tr className="border-b border-neutral-300 font-medium">
                    <td className="py-1.5" colSpan={2}>Обороты за период</td>
                    <td className="py-1.5 text-right tabular-nums">{money(p.turnoverDebit, { currency: p.currency })}</td>
                    <td className="py-1.5 text-right tabular-nums">{money(p.turnoverCredit, { currency: p.currency })}</td>
                  </tr>
                  <tr className="font-medium">
                    <td className="py-1.5" colSpan={2}>Сальдо на {formatDate(to)}</td>
                    <td className="py-1.5 text-right tabular-nums">
                      {p.closingDebit > 0.009 ? money(p.closingDebit, { currency: p.currency }) : "—"}
                    </td>
                    <td className="py-1.5 text-right tabular-nums">
                      {p.closingCredit > 0.009 ? money(p.closingCredit, { currency: p.currency }) : "—"}
                    </td>
                  </tr>
                </tbody>
              </table>
              <p className="mt-3 text-sm">
                По данным {company.name}: {saldoPhrase(p.closingDebit, p.closingCredit, p.currency)}
                {Math.abs(close) >= 0.01 ? (
                  <>
                    {" "}
                    ({amountInWords(Math.abs(close), p.currency)}).
                  </>
                ) : (
                  "."
                )}
              </p>
            </section>
          );
        })
      )}

      <div className="mt-10 grid grid-cols-2 gap-8 text-sm">
        <div>
          <p className="font-medium">Мы</p>
          <p className="mt-1 text-neutral-600">{company.name}</p>
          <p className="mt-8 border-t border-neutral-400 pt-1 text-xs text-neutral-500">
            подпись
          </p>
        </div>
        <div>
          <p className="font-medium">Контрагент</p>
          <p className="mt-1 text-neutral-600">{partner.name}</p>
          <p className="mt-8 border-t border-neutral-400 pt-1 text-xs text-neutral-500">
            подпись
          </p>
        </div>
      </div>
    </article>
  );
}
