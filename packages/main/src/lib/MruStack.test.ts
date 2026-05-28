import { describe, it, expect } from 'vitest';
import { MruStack } from './MruStack';

describe('MruStack', () => {
  it('push y peek devuelven el último valor', () => {
    const s = new MruStack<string>();
    s.push('a');
    s.push('b');
    s.push('c');
    expect(s.peek()).toBe('c');
    expect(s.size()).toBe(3);
  });

  it('push de un valor existente lo promociona al tope', () => {
    const s = new MruStack<string>();
    s.push('a');
    s.push('b');
    s.push('c');
    s.push('a');
    expect(s.peek()).toBe('a');
    expect(s.size()).toBe(3);
    expect(s.toArray()).toEqual(['a', 'c', 'b']);
  });

  it('pop devuelve el tope y reduce el tamaño', () => {
    const s = new MruStack<string>();
    s.push('a');
    s.push('b');
    expect(s.pop()).toBe('b');
    expect(s.peek()).toBe('a');
    expect(s.size()).toBe(1);
  });

  it('remove elimina un valor de cualquier posición', () => {
    const s = new MruStack<string>();
    s.push('a');
    s.push('b');
    s.push('c');
    expect(s.remove('b')).toBe(true);
    expect(s.toArray()).toEqual(['c', 'a']);
    expect(s.remove('zz')).toBe(false);
  });

  it('clear deja la pila vacía', () => {
    const s = new MruStack<number>();
    s.push(1);
    s.push(2);
    s.clear();
    expect(s.size()).toBe(0);
    expect(s.peek()).toBeUndefined();
    expect(s.pop()).toBeUndefined();
  });

  it('pila vacía: peek y pop devuelven undefined', () => {
    const s = new MruStack<string>();
    expect(s.peek()).toBeUndefined();
    expect(s.pop()).toBeUndefined();
  });

  it('at indexa desde el tope (0 = más reciente)', () => {
    const s = new MruStack<string>();
    s.push('a');
    s.push('b');
    s.push('c');
    expect(s.at(0)).toBe('c');
    expect(s.at(1)).toBe('b');
    expect(s.at(2)).toBe('a');
    expect(s.at(3)).toBeUndefined();
    expect(s.at(-1)).toBeUndefined();
  });

  it('prev navega hacia atrás (más antiguo) sin mutar la pila', () => {
    const s = new MruStack<string>();
    s.push('a');
    s.push('b');
    s.push('c');
    expect(s.prev()).toBe('b'); // segundo del tope
    expect(s.prev(0)).toBe('b');
    expect(s.prev(1)).toBe('a');
    expect(s.prev(2)).toBeUndefined();
    // la pila no cambia
    expect(s.toArray()).toEqual(['c', 'b', 'a']);
  });

  it('next navega hacia adelante (más reciente)', () => {
    const s = new MruStack<string>();
    s.push('a');
    s.push('b');
    s.push('c');
    expect(s.next(2)).toBe('b');
    expect(s.next(1)).toBe('c');
    expect(s.next(0)).toBeUndefined();
    expect(s.next()).toBeUndefined();
  });
});
