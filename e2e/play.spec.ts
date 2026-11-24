/**
 * 실제 브라우저 2개(독립 컨텍스트 = 서로 다른 사용자)로 대전 흐름을 검증한다.
 */
import { expect, test, type Browser, type Page } from "@playwright/test";

async function newPlayer(browser: Browser): Promise<Page> {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto("/");
  await expect(page.getByTestId("create-room")).toBeEnabled({ timeout: 15_000 });
  return page;
}

const SIZE = 15;
const cell = (page: Page, x: number, y: number) => page.locator(`[data-index="${y * SIZE + x}"]`);

test("홈: 게임 20종 표시, 플레이 가능 3종", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".card")).toHaveCount(20);
  await expect(page.locator("a.card")).toHaveCount(3);
});

test("잘못된 방 코드는 안내 화면", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("create-room")).toBeEnabled({ timeout: 15_000 });
  await page.getByTestId("join-code").fill("ZZZZZZ");
  await page.getByRole("button", { name: "입장" }).click();
  await expect(page.getByTestId("join-error")).toContainText("방을 찾을 수 없어요");
});

test("친구 오목(흐름 A: 게임 먼저): 초대 링크 입장 → 대국 → 양쪽 결과 일치 → 재대결", async ({ browser }) => {
  const a = await newPlayer(browser);
  const b = await newPlayer(browser);

  await a.getByTestId("game-gomoku").click();
  await a.getByTestId("mode-friend").click();
  await a.getByTestId("friend-create").click();
  const code = (await a.getByTestId("room-code").textContent())!.trim();
  expect(code).toMatch(/^[A-Z0-9]{6}$/);

  await b.goto(`/r/${code}`);
  await expect(b.getByTestId("ready")).toBeVisible();
  await a.getByTestId("ready").click();
  await b.getByTestId("ready").click();

  // 누가 흑인지 확인
  await expect(a.getByTestId("gomoku-turn")).toBeVisible({ timeout: 10_000 });
  await expect(a.locator(".countdown")).toHaveCount(0, { timeout: 5_000 });
  const aIsBlack = (await a.getByTestId("gomoku-turn").textContent())!.includes("나: 흑");
  const [black, white] = aIsBlack ? [a, b] : [b, a];

  for (let i = 0; i < 4; i++) {
    await expect(black.getByTestId("gomoku-turn")).toContainText("내 차례");
    await cell(black, i + 3, 7).click();
    await expect(white.getByTestId("gomoku-turn")).toContainText("내 차례");
    await cell(white, i + 3, 8).click();
  }
  await expect(black.getByTestId("gomoku-turn")).toContainText("내 차례");
  await cell(black, 7, 7).click();

  await expect(black.getByTestId("result-title")).toHaveText("🎉 승리!");
  await expect(white.getByTestId("result-title")).toHaveText("패배");
  const sa = await black.getByTestId("result").locator("p").first().textContent();
  const sb = await white.getByTestId("result").locator("p").first().textContent();
  expect(sa).toBe(sb);

  // 재대결 → 다시 경기 화면
  await a.getByTestId("ready").click();
  await b.getByTestId("ready").click();
  await expect(a.getByTestId("gomoku-turn")).toBeVisible({ timeout: 10_000 });
  // 자리 교대: 이번엔 반대
  await expect(a.locator(".countdown")).toHaveCount(0, { timeout: 5_000 });
  const aBlackNow = (await a.getByTestId("gomoku-turn").textContent())!.includes("나: 흑");
  expect(aBlackNow).toBe(!aIsBlack);
});

test("친구방(흐름 B: 방 먼저): 방 생성 → 친구 입장 → 게임 고르기 → 시작", async ({ browser }) => {
  const a = await newPlayer(browser);
  const b = await newPlayer(browser);
  await a.getByTestId("create-room").click();
  const code = (await a.getByTestId("room-code").textContent())!.trim();
  await b.goto("/");
  await b.getByTestId("join-code").fill(code.toLowerCase());
  await b.getByRole("button", { name: "입장" }).click();
  await b.getByTestId("pick-snake").click();
  await expect(a.getByTestId("pick-snake")).toHaveClass(/on/);
  await a.getByTestId("ready").click();
  await b.getByTestId("ready").click();
  await expect(a.getByTestId("snake-canvas")).toBeVisible({ timeout: 10_000 });
  await expect(b.getByTestId("snake-canvas")).toBeVisible();
  // 아무것도 안 하면 둘 다 약 1.25초 만에 벽에 부딪혀 종료 → 서버가 결과 확정
  await expect(a.getByTestId("result")).toBeVisible({ timeout: 15_000 });
  await expect(b.getByTestId("result")).toBeVisible();
});

test("랜덤 매칭 패들: 두 사람 자동 매칭 → 실시간 화면 → 기권 시 상대 승리", async ({ browser }) => {
  const a = await newPlayer(browser);
  const b = await newPlayer(browser);
  for (const p of [a, b]) {
    await p.goto("/g/paddle");
    await p.getByTestId("mode-random").click();
  }
  const t0 = Date.now();
  await a.getByTestId("random-join").click();
  await expect(a.getByTestId("queue-panel")).toBeVisible();
  await b.getByTestId("random-join").click();
  await expect(a.getByTestId("paddle-canvas")).toBeVisible({ timeout: 10_000 });
  await expect(b.getByTestId("paddle-canvas")).toBeVisible();
  const matchMs = Date.now() - t0;
  console.log(`랜덤 매칭 소요(브라우저 기준): ${matchMs}ms`);
  // 실시간 진행 중 키 입력
  await a.keyboard.down("ArrowUp");
  await a.waitForTimeout(1500);
  await a.keyboard.up("ArrowUp");
  // a 기권
  await a.getByTestId("forfeit").click();
  await a.getByTestId("confirm-forfeit").click();
  await expect(a.getByTestId("result-title")).toHaveText("패배");
  await expect(b.getByTestId("result-title")).toHaveText("🎉 승리!");
  await expect(b.getByTestId("result")).toContainText("기권");
});

test("솔로 뱀: 서버가 검증한 점수가 표시되고 내 기록에 남는다", async ({ page }) => {
  await page.goto("/g/snake");
  await page.getByTestId("mode-solo").click();
  await page.getByRole("button", { name: "시작" }).click();
  await expect(page.getByTestId("snake-solo-score")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/내 최고 기록/)).toBeVisible();
  await page.goto("/me");
  await expect(page.locator("table")).toContainText("꼬리잡기 뱀");
});

test("솔로 오목·패들은 컴퓨터 상대로 바로 시작", async ({ page }) => {
  await page.goto("/g/gomoku");
  await page.getByTestId("mode-solo").click();
  await page.getByRole("button", { name: "시작" }).click();
  await page.locator('[data-index="112"]').click();
  await expect(page.locator(".stone")).toHaveCount(2, { timeout: 5_000 }); // 내 돌 + AI 응수
  await page.goto("/g/paddle");
  await page.getByTestId("mode-solo").click();
  await page.getByRole("button", { name: "시작" }).click();
  await expect(page.locator("canvas")).toBeVisible();
});

test("뱀 대전 중 새로고침해도 경기로 복귀하고 결과가 양쪽에 나온다", async ({ browser }) => {
  const a = await newPlayer(browser);
  const b = await newPlayer(browser);
  await a.getByTestId("create-room").click();
  const code = (await a.getByTestId("room-code").textContent())!.trim();
  await b.goto(`/r/${code}`);
  await b.getByTestId("pick-snake").click();
  await a.getByTestId("ready").click();
  await b.getByTestId("ready").click();
  await expect(a.getByTestId("snake-canvas")).toBeVisible({ timeout: 10_000 });
  await expect(a.locator(".countdown")).toHaveCount(0, { timeout: 5_000 });
  await a.keyboard.press("ArrowDown"); // 아래로 꺾어 벽까지 시간을 번다(약 1.1초)
  await a.waitForTimeout(400);
  await a.reload();
  // 새로고침 후 같은 방·같은 경기로 복귀(복구 정보로 이어서 진행)
  await expect(a.getByTestId("snake-canvas").or(a.getByTestId("result"))).toBeVisible({ timeout: 10_000 });
  await expect(a.getByTestId("result")).toBeVisible({ timeout: 20_000 });
  await expect(b.getByTestId("result")).toBeVisible();
  const ta = await a.getByTestId("result").locator("p").first().textContent();
  const tb = await b.getByTestId("result").locator("p").first().textContent();
  expect(ta).toBe(tb);
});
