export interface UsageRecord {
  stage: string;
  promptTokens: number;
  completionTokens: number;
}

/** Collects token usage per stage for the Scan Report. */
export class UsageMeter {
  readonly records: UsageRecord[] = [];

  add(record: UsageRecord): void {
    this.records.push(record);
  }

  byStage(): Record<string, { promptTokens: number; completionTokens: number }> {
    const out: Record<string, { promptTokens: number; completionTokens: number }> = {};
    for (const r of this.records) {
      const s = (out[r.stage] ??= { promptTokens: 0, completionTokens: 0 });
      s.promptTokens += r.promptTokens;
      s.completionTokens += r.completionTokens;
    }
    return out;
  }
}
