export type GrowthObservation = { date: string; capital: string; value: string | null };

export function combineAssetGrowth(histories: ReadonlyArray<ReadonlyArray<GrowthObservation>>) {
  if (!histories.length) return [];
  const start = histories.reduce((latest, rows) => {
    const first = rows.at(0)?.date;
    return first && first > latest ? first : latest;
  }, '');
  const dates = [...new Set(histories.flatMap((rows) => rows.map((row) => row.date)))].sort();
  const cursors = histories.map(() => 0);
  return dates
    .filter((date) => date >= start)
    .map((date) => {
      let capital = 0;
      let value: number | null = 0;
      for (const [index, rows] of histories.entries()) {
        let cursor = cursors[index] ?? 0;
        while (rows[cursor + 1] && rows[cursor + 1].date <= date) cursor += 1;
        cursors[index] = cursor;
        const row = rows.at(cursor);
        if (!row) {
          value = null;
          continue;
        }
        capital += Number(row.capital);
        if (row.value === null) value = null;
        else if (value !== null) value += Number(row.value);
      }
      return { date, capital, value };
    });
}
