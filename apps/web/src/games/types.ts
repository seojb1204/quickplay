import type { ComponentType } from "react";

export interface VersusProps {
  seat: 0 | 1;
  seed: number;
  startAt: number;
  opponent: string;
  me: string;
  /** 서버 기준 현재 시각 */
  serverNow(): number;
}

export interface GameUi {
  Solo: ComponentType;
  Versus: ComponentType<VersusProps>;
  controls: string;
}
