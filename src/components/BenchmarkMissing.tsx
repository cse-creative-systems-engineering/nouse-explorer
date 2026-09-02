import { Tooltip } from './Tooltip';

export function BenchmarkMissing() {
  return (
    <Tooltip label="Benchmarks require external scoring sources — not fetched in this MVP.">
      <span className="badge badge-missing">No benchmark data</span>
    </Tooltip>
  );
}