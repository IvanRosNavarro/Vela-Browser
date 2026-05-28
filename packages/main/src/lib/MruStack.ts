// MRU stack with no duplicates: pushing an existing value re-promotes it
// to the top. peek() returns the top, pop() removes and returns it,
// remove() removes a specific value from anywhere in the stack.
//
// Top of the stack = "most recently used" = items[items.length - 1].
// toArray() devuelve top-to-bottom (más reciente primero).
// Used by TabManager for Ctrl+Tab cycling and "next active tab on close".
export class MruStack<T> {
  private items: T[] = [];

  push(value: T): void {
    const idx = this.items.indexOf(value);
    if (idx !== -1) this.items.splice(idx, 1);
    this.items.push(value);
  }

  pop(): T | undefined {
    return this.items.pop();
  }

  peek(): T | undefined {
    return this.items.length > 0 ? this.items[this.items.length - 1] : undefined;
  }

  remove(value: T): boolean {
    const idx = this.items.indexOf(value);
    if (idx === -1) return false;
    this.items.splice(idx, 1);
    return true;
  }

  clear(): void {
    this.items = [];
  }

  size(): number {
    return this.items.length;
  }

  // Drops the oldest entries (bottom of stack) so size <= maxSize. No-op if
  // already within the limit. Used to bound the persisted global MRU.
  truncate(maxSize: number): void {
    if (maxSize < 0) maxSize = 0;
    if (this.items.length > maxSize) {
      this.items = this.items.slice(this.items.length - maxSize);
    }
  }

  /**
   * Devuelve el elemento en posición `index` desde el tope (0 = más reciente).
   * Útil como base de navegación con cursor temporal sobre la pila.
   */
  at(index: number): T | undefined {
    if (index < 0 || index >= this.items.length) return undefined;
    return this.items[this.items.length - 1 - index];
  }

  /**
   * Navegación hacia atrás en el tiempo. `prev(0)` = segundo del tope (el
   * "anterior" al activo). `prev(n)` = (n+2)º del tope, útil cuando se
   * mantiene Ctrl y se va pulsando Tab.
   */
  prev(currentIndex: number = 0): T | undefined {
    return this.at(currentIndex + 1);
  }

  /**
   * Navegación hacia adelante en el tiempo. Inverso de `prev`. Si ya
   * estamos en el tope (currentIndex = 0) devuelve undefined.
   */
  next(currentIndex: number = 0): T | undefined {
    if (currentIndex <= 0) return undefined;
    return this.at(currentIndex - 1);
  }

  toArray(): readonly T[] {
    return [...this.items].reverse();
  }
}
