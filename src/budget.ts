export type SpendKind = "data" | "model";

export interface SpendOptions {
  /** A closing call (the verifier, the contact scan): it may use the money held back for closing. */
  closing?: boolean;
}

/** What a call needs from the money: reserve before it runs, settle at what it billed. */
export interface Spender {
  reserve(priceUsd: number, kind?: SpendKind, options?: SpendOptions): boolean;
  settle(reservedUsd: number, billedUsd: number, kind?: SpendKind): void;
}

/**
 * The part of a settlement the question pays: a model call billed above its hold, for any model,
 * pays the hold, and the rest is house cost (round 4, F6). Data calls are settled at a cost already
 * checked against their reserved price (`trustedCost`).
 */
function questionShare(reservedUsd: number, billedUsd: number, kind: SpendKind): number {
  return kind === "model" && billedUsd > reservedUsd ? reservedUsd : billedUsd;
}

/**
 * The spending limit for one question. Data calls are reserved at their published price before they
 * run and settled at the billed cost; model calls are billed after the fact, so the most the next
 * model call can cost is held back from data spending. The closing calls' hold is kept from the start
 * until they run: no data or agent call may use it (round 4, B5).
 */
export class Budget implements Spender {
  readonly limitUsd: number;
  #dataUsd = 0;
  #modelUsd = 0;
  #houseUsd = 0;
  #modelReserveUsd = 0;
  #closingHoldUsd = 0;
  #refused = 0;
  #unsettled: Record<SpendKind, number> = { data: 0, model: 0 };

  constructor(limitUsd: number) {
    this.limitUsd = limitUsd;
  }

  get dataUsd(): number {
    return this.#dataUsd;
  }

  get modelUsd(): number {
    return this.#modelUsd;
  }

  /** Billed above a hold and kept off the question's money; logged in the run's costs. */
  get houseUsd(): number {
    return this.#houseUsd;
  }

  get spentUsd(): number {
    return this.#dataUsd + this.#modelUsd;
  }

  get leftUsd(): number {
    return this.limitUsd - this.spentUsd;
  }

  get refusedCalls(): number {
    return this.#refused;
  }

  /**
   * What `dataUsd` or `modelUsd` holds for calls reserved and not yet settled: the part of it that is not a bill.
   * A model call that failed without proof it never ran is never settled and stays here, kept as spent.
   */
  unsettledUsd(kind: SpendKind): number {
    return this.#unsettled[kind];
  }

  /** What data and agent calls may still spend once the next call's hold and the closing hold are kept back. */
  get spendableUsd(): number {
    return this.leftUsd - this.#modelReserveUsd - this.#closingHoldUsd;
  }

  /** Holds back money for the next model call, which is billed only after it runs. */
  setModelReserve(usd: number): void {
    this.#modelReserveUsd = Math.max(0, usd);
  }

  /** Adds to the hold as the next model call's request grows. */
  addModelReserve(usd: number): void {
    this.#modelReserveUsd += Math.max(0, usd);
  }

  /** Holds back the closing calls' most possible cost until they run. */
  holdForClosing(usd: number): void {
    this.#closingHoldUsd = Math.max(0, usd);
  }

  /** Reserves a call at its price, or refuses it when it would pass the limit. */
  reserve(priceUsd: number, kind: SpendKind = "data", options: SpendOptions = {}): boolean {
    const room = options.closing ? this.leftUsd : this.spendableUsd;
    if (priceUsd > room + 1e-12) {
      this.#refused += 1;
      return false;
    }
    this.#add(kind, priceUsd);
    this.#unsettled[kind] += priceUsd;
    return true;
  }

  /** Replaces a reservation with what the call actually cost. */
  settle(reservedUsd: number, billedUsd: number, kind: SpendKind = "data"): void {
    const paid = questionShare(reservedUsd, billedUsd, kind);
    this.#houseUsd += billedUsd - paid;
    this.#add(kind, paid - reservedUsd);
    this.#unsettled[kind] -= reservedUsd;
  }

  #add(kind: SpendKind, usd: number): void {
    if (kind === "data") this.#dataUsd += usd;
    else this.#modelUsd += usd;
  }
}

/** A spender that passes every call to `base` and reports what each costs the question, for one step's cost. */
export function meteredSpender(base: Spender, onSpend: (usd: number) => void): Spender {
  return {
    reserve(priceUsd, kind, options) {
      const ok = base.reserve(priceUsd, kind, options);
      if (ok) onSpend(priceUsd);
      return ok;
    },
    settle(reservedUsd, billedUsd, kind) {
      base.settle(reservedUsd, billedUsd, kind);
      onSpend(questionShare(reservedUsd, billedUsd, kind ?? "data") - reservedUsd);
    },
  };
}
