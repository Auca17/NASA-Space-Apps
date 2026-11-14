/// <reference lib="webworker" />
/** Web Worker wrapper: keeps the 30-day rolling math off the main thread. */
import {
  semaphoreFromDaily,
  type DailyShard,
  type SemaphoreConfig,
} from "./semaphore";

interface Msg {
  shards: DailyShard[];
  cells: string[];
  endDate: string;
  cfg: SemaphoreConfig;
}

self.onmessage = (e: MessageEvent<Msg>) => {
  const { shards, cells, endDate, cfg } = e.data;
  const res = semaphoreFromDaily(shards, new Set(cells), endDate, cfg);
  (self as unknown as Worker).postMessage(res);
};
