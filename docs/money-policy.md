# Money policy

> Status: **Approved** (2026-11-03)
> Each rule here is tested exactly as written. Changing a rule means changing this file first.

This file is the contract between how studios think about money and what the code computes. Every
amount Coord shows, emails, prints, sends to Stripe or syncs to QuickBooks follows these rules, so
the screen, the PDF, the payment and the books always agree to the cent.

In this file, "proposal" means a **procurement proposal** (PLAN.md D10).

## 1. Units

| Kind                  | Stored as                       | Example                            |
| --------------------- | ------------------------------- | ---------------------------------- |
| Money                 | Whole **cents** (integer)       | $1,234.56 → `123456`               |
| Percentages and rates | **Parts per million** (integer) | 8.875% → `88750`; 50% → `500000`   |
| Quantities            | **Thousandths** (integer)       | 2.3 yd → `2300`; 4 chairs → `4000` |
| Time                  | Whole **seconds** (integer)     | 1 h 30 min → `5400`                |

No fractional number ever holds money. Calculations that multiply then divide (rates, quantities,
time) are done with exact integer math and rounded **once**, at the step this policy names.

Currency is USD only (PLAN.md D3). Every amount must stay within ±$1,000,000,000.00. Rates go up to
1,000%, quantities up to 1,000,000, and a single duration up to 1,000,000,000 seconds. Anything
larger is refused rather than silently changed.

## 2. The rounding rule

**Round half away from zero, to the cent.** $117.875 → $117.88. A credit of −$117.875 → −$117.88.

This is the rule US invoices and QuickBooks use. Credits round symmetrically, so a refund of a
charge always cancels it exactly.

## 3. Where rounding happens

| Step                                            | Rounded where                                                                                 | Example                                 |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------- | --------------------------------------- |
| Unit price from cost (markup, margin, discount) | Once, per unit                                                                                | $102.50 × 1.15 = $117.875 → **$117.88** |
| Line amount with a fractional quantity          | Once, per line                                                                                | $1.05 × 2.3 yd = $2.415 → **$2.42**     |
| Line amount with a whole quantity               | Exact, no rounding                                                                            | $117.88 × 4 = $471.52                   |
| Sales tax                                       | Once **per document per tax rate**, on the taxable subtotal; then split across lines (see §4) | ($10,000 + $800) × 8.25% = **$891.00**  |
| Deposit (contract)                              | Once, on the final amount (see §5)                                                            | $150 × 60 h × 50% = $4,500.00           |
| Time                                            | Once per invoice line (see §7)                                                                | 7.5 h × $150 = $1,125.00                |

Why tax is rounded per document and not per line: that is how QuickBooks and most state filings
compute it. Rounding each line separately can drift a few cents from what the books expect.

## 4. Splitting one amount across lines

When one amount is computed for the whole document (tax, a retainer applied, a discount) but must
also be shown per line, it is split **in proportion to each line's share, using the
largest-remainder method**. The pieces always add up to exactly the total, and the result is the
same every time (ties go to the earlier line).

Example: $10.00 of tax across three equal lines → $3.34, $3.33, $3.33.

## 5. Deposits

> **Decided, D-1 (changed 2026-11-03): Only the contract can have a deposit, and each studio
> chooses whether to charge one.** It covers design
> time. Procurement proposals have no deposit, and the client pays 100%. This replaces the earlier rule
> that set a deposit percentage on each product line.

### Procurement proposals

- The client pays **100% of the approved lines**, including their freight, other charges and tax.
  Sofa $10,000 + freight $800 + tax $891 = client pays **$11,691.00**.
- **Nothing is ordered until the client has paid.**
- Estimated charges can still change the amount afterward (§6).

### The deposit on the contract

A deposit, down payment and retainer are all treated as this one thing. A project can have this
deposit and never have a procurement proposal. These rules cover hourly contracts. Rules for flat-fee
contracts must be added here before they are built.

- **Amount:** hourly rate × projected total hours × deposit %, rounded **once**, on the final amount.
  $150.00 × 60 h × 50% = **$4,500.00**. $150.25 × 12.5 h × 50% = $939.0625 → **$939.06**.
- **Rate:** set on the contract, and the only rate charged for time on that project.
- **Optional:** a studio setting decides whether a deposit is charged, and a studio that charges
  deposits can skip one on a single contract. Without one, there is no
  payment at signing, and all billable time is billed by invoice from the first hour.
- **Deposit %:** a studio-wide setting that defaults to **50%** for studios that charge a deposit.
- **Draws down from:** billable time only. Non-billable time, products, freight and reimbursables
  never touch it.
- **Hours covered:** projected total hours × deposit %. 60 h × 50% = **30 h**. They count once the
  payment is confirmed (§8).
- **Past the deposit:** billable hours beyond the hours covered. 35 billable hours shows **5 h** past
  the deposit. This is shown in hours only, moves no money and creates no Stripe or QuickBooks
  record. Billable hours follow §7.
- **On an invoice:** the deposit is applied to billable time only, up to what remains of it. A product
  change such as a freight adjustment is billed on top, or credited if it came in lower. 35 h ×
  $150.00 = $5,250.00, − $4,500.00 deposit, + $45.00 freight adjustment = **$795.00**.
- **Unused balance:** when a project closes with deposit remaining, the client is refunded the
  remaining amount through Stripe. 20 billable hours on the $4,500.00 deposit above uses $3,000.00
  and refunds **$1,500.00**.
- **Recorded:** the deposit amount and whether it was paid are stored in Coord. Amounts always come
  from Coord's data and are written onto a document, never read from an uploaded file.

## 6. Estimated charges (freight, crating, receiving, install)

Each charge is marked **estimated** or **actual**. A signed proposal keeps the estimate it showed
the client; nothing changes it afterward.

> **Decided, D-2: When the actual charge differs from the estimate, the difference is billed by default.**
>
> - **Bill the difference (default).** The final invoice shows "Freight adjustment:
>   +$45.00" (or a credit if it came in lower), and the proposal terms say "Freight is estimated;
>   actual freight will be billed." The studio confirms each adjustment with one tap.
> - **Absorb it.** The studio's margin takes the difference; the client is never billed more.
>
> This is a studio setting. Adjustments are always shown to the studio before they reach an invoice.

## 7. Time

- Time is recorded in seconds from the timer or manual entry.
- **All time is billable by default**, and an entry can be marked non-billable. Non-billable time
  never reaches an invoice, never draws down the deposit and never counts as hours past it.
  It still counts toward a project's total hours and is shown as its own figure.
- **Billing increment** defaults to **0.25 hours (15 minutes)**, and the studio can change it in
  settings to any whole number of minutes from 1 to 60. Each entry's billable time is **rounded
  up** to the increment. Example: 52 min at 0.25 h increments → 60 min (1.0 h).
- A new increment applies only to time recorded after the change. Entries already recorded keep
  the increment they were saved with, so past billable hours never shift.
- On an invoice, entries are grouped by person and rate. Each group's amount is
  **billable hours × rate, rounded once**, so the line always matches what it displays:
  "7.5 h × $150.00 = $1,125.00".

## 8. Payments and balances

- **Stripe is the source of truth** for money that moved. Coord records what Stripe reports.
- Bank transfers (ACH) count as **processing**, not paid, until Stripe confirms they settled.
- **Overpayment is never hidden.** If more is paid than is due, the extra is shown as a credit
  balance and flagged for the studio to refund (through Stripe) or apply to the next invoice.
- Any mismatch between what Stripe reports and what Coord expected (amount or currency) is put on
  hold as **needs review**, never silently accepted or dropped.

## 9. Typing and showing amounts

One parser reads every amount anyone types, pastes or imports (web, phone, clipper, CSV).

| Input                                                                                                   | Read as                                             |
| ------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| `1234.56`, `$1,234.56`, `1,234.5`                                                                       | $1,234.56 / $1,234.56 / $1,234.50                   |
| `-12`, `(12.00)`                                                                                        | −$12.00                                             |
| `12.345`                                                                                                | Rejected: more than two decimals                    |
| `1e3`, `0x10`, `1.250,00`, `12abc`, empty                                                               | Rejected, with a message saying why                 |
| `8.875%` or `8.875` in a rate field; up to 4 decimals, since some local tax rates need them (`8.8125%`) | 88,750 parts per million                            |
| `2.3` in a quantity field                                                                               | 2,300 thousandths; more than 3 decimals is rejected |
| `1:30`, `1.5h`, `1.5`, `1h 30m`, `90m` in a time field                                                  | 5,400 seconds                                       |

Amounts are shown as `$1,234.56`, negatives as `−$1,234.56`, and rates with only the decimals they
need (`8.875%`, `8.8125%`, `50%`).

## 10. Invariants the tests check after every operation

1. The lines of a document add up to its subtotal; subtotal + tax = total.
2. Any amount split across lines (tax, retainer, discount) adds up exactly to the whole.
3. The deposit applied across invoices plus any refund never exceeds the deposit paid, and adds up
   to exactly the deposit once the project closes.
4. Paid + processing never silently exceeds what is due; any excess is a visible credit.
5. Every number Coord generates or fills in on a PDF or share page equals the number in the
   document's data. The text of a document a studio uploads is its own, and Coord can't check any
   numbers typed into it.
