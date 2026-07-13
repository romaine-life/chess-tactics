class ByteWeightedAsyncCache {
  constructor({ maxBytes, sizeOf = (value) => value && value.byteLength } = {}) {
    this.maxBytes = Math.max(1, Math.floor(Number(maxBytes) || 1));
    this.sizeOf = sizeOf;
    this.bytes = 0;
    this.entries = new Map();
    this.inflight = new Map();
  }

  get(key) {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.value;
  }

  set(key, value) {
    const byteLength = Math.max(0, Math.floor(Number(this.sizeOf(value)) || 0));
    const prior = this.entries.get(key);
    if (prior) {
      this.entries.delete(key);
      this.bytes -= prior.byteLength;
    }
    if (!byteLength || byteLength > this.maxBytes) return false;
    while (this.entries.size && this.bytes + byteLength > this.maxBytes) {
      const oldestKey = this.entries.keys().next().value;
      const oldest = this.entries.get(oldestKey);
      this.entries.delete(oldestKey);
      this.bytes -= oldest.byteLength;
    }
    this.entries.set(key, { value, byteLength });
    this.bytes += byteLength;
    return true;
  }

  async getOrCreate(key, create) {
    const cached = this.get(key);
    if (cached !== undefined) return cached;
    const existing = this.inflight.get(key);
    if (existing) return existing;

    const pending = (async () => {
      const value = await create();
      this.set(key, value);
      return value;
    })();
    this.inflight.set(key, pending);
    pending.finally(() => {
      if (this.inflight.get(key) === pending) this.inflight.delete(key);
    }).catch(() => {});
    return pending;
  }

  stats() {
    return {
      size: this.entries.size,
      bytes: this.bytes,
      maxBytes: this.maxBytes,
      inflight: this.inflight.size,
    };
  }
}

module.exports = { ByteWeightedAsyncCache };
