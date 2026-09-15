export class Serial {
  private pending = Promise.resolve();
  run<T>(work: () => Promise<T>): Promise<T> {
    const next = this.pending.then(work);
    this.pending = next.then(
      () => {},
      () => {},
    );
    return next;
  }
}
