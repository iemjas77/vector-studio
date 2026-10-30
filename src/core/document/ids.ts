let counter = 0;

/** Short unique id. Deterministic generator can be installed for tests. */
let generator: () => string = () => {
  counter++;
  return Math.random().toString(36).slice(2, 8) + counter.toString(36);
};

export const newId = (): string => generator();

export function setIdGenerator(g: (() => string) | null): void {
  if (g) generator = g;
  else {
    counter = 0;
    generator = () => {
      counter++;
      return Math.random().toString(36).slice(2, 8) + counter.toString(36);
    };
  }
}
