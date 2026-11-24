/** 모바일 에뮬레이션(Pixel 7, 터치) — 실제 기기 테스트가 아님에 유의 */
import { expect, test } from "@playwright/test";

for (const width of [360, 390, 412]) {
  test(`모바일 ${width}px: 홈 요소가 화면 밖으로 넘치지 않음`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto("/");
    await expect(page.locator(".card")).toHaveCount(20);
    const overflow = await page.evaluate(() => {
      const els = [...document.querySelectorAll(".hero *, .card")];
      return Math.max(0, ...els.map((e) => e.getBoundingClientRect().right - window.innerWidth));
    });
    expect(overflow).toBeLessThanOrEqual(1);
  });
}

test("모바일: 게임 시작 시 판 전체가 한 화면에 보임", async ({ page }) => {
  await page.goto("/g/snake");
  await page.getByTestId("mode-solo").tap();
  await page.getByRole("button", { name: "시작" }).tap();
  const canvas = page.getByTestId("snake-canvas");
  await expect(canvas).toBeVisible();
  await page.waitForTimeout(800); // 부드러운 스크롤 대기
  const box = (await canvas.boundingBox())!;
  const vh = page.viewportSize()!.height;
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThanOrEqual(vh);
});

test("모바일: 오목 솔로 터치 착수", async ({ page }) => {
  await page.goto("/g/gomoku");
  await page.getByTestId("mode-solo").tap();
  await page.getByRole("button", { name: "시작" }).tap();
  const c = page.locator('[data-index="112"]');
  const box = (await c.boundingBox())!;
  expect(box.width).toBeGreaterThanOrEqual(18); // 15칸 판에서 칸 크기 확인
  await c.tap();
  await expect(page.locator(".stone")).toHaveCount(2, { timeout: 5_000 });
});

test("모바일: 뱀 방향 버튼 표시(터치 기기)", async ({ page }) => {
  await page.goto("/g/snake");
  await page.getByTestId("mode-solo").tap();
  await page.getByRole("button", { name: "시작" }).tap();
  await expect(page.getByRole("button", { name: "위" })).toBeVisible();
  const btn = (await page.getByRole("button", { name: "위" }).boundingBox())!;
  expect(btn.height).toBeGreaterThanOrEqual(44);
});
