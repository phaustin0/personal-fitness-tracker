import { useEffect, useState } from 'preact/hooks';

let active = false;
const listeners = new Set<(v: boolean) => void>();

export function setWorkoutActive(v: boolean) {
  active = v;
  listeners.forEach((l) => l(v));
}

export function useWorkoutActive(): boolean {
  const [v, setV] = useState(active);
  useEffect(() => {
    listeners.add(setV);
    setV(active);
    return () => void listeners.delete(setV);
  }, []);
  return v;
}
