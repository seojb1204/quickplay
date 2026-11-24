/**
 * 시드 기반 난수 생성기 (mulberry32).
 * 서버와 브라우저가 같은 시드로 같은 결과를 만들어야 하므로 Math.random 을 쓰지 않는다.
 */
export interface Rng {
  /** [0, 1) 실수 */
  next(): number;
  /** [0, max) 정수 */
  int(max: number): number;
  /** 현재 내부 상태 (리플레이·직렬화용) */
  state(): number;
}

export function createRng(seed: number): Rng {
  let s = seed >>> 0;
  const next = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (max: number) => Math.floor(next() * max),
    state: () => s,
  };
}

export function randomSeed(): number {
  return Math.floor(Math.random() * 0xffffffff) >>> 0;
}
