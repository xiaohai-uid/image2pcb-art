import { test, expect } from "@playwright/test";

const smokePng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

test("keeps the local upload, readiness gate, exports, and responsive layout usable", async ({ page }) => {
  const consoleErrors = [];
  const pageErrors = [];
  const failedResponses = [];
  const externalRequests = [];

  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("response", (response) => {
    if (response.status() >= 400) failedResponses.push(`${response.status()} ${response.url()}`);
  });
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (!['http:', 'https:'].includes(url.protocol)) return;
    if (url.hostname !== "127.0.0.1" && url.hostname !== "localhost") externalRequests.push(request.url());
  });

  await page.goto("/");
  await expect(page).toHaveTitle("Image2PCB Art · Material Lab");
  await expect((await page.request.get("/favicon.svg")).ok()).toBe(true);
  await expect(page.locator("#readinessText")).toHaveText("BLOCKED");
  await expect(page.locator("#exportButton")).toBeDisabled();
  await expect(page.locator("#reviewExportButton")).toBeDisabled();

  await page.locator("#imageInput").setInputFiles({
    name: "browser-smoke.png",
    mimeType: "image/png",
    buffer: smokePng,
  });
  await expect(page.locator("#sourceLabel")).toHaveText("browser-smoke.png");
  await expect(page.locator("#readinessText")).toHaveText("READY", { timeout: 15_000 });
  await expect(page.locator("#exportButton")).toBeEnabled();
  await expect(page.locator("#reviewExportButton")).toBeEnabled();

  const sliderCases = [
    ["#brightnessInput", "#brightnessValue"],
    ["#contrastInput", "#contrastValue"],
    ["#detailInput", "#detailValue"],
    ["#smoothingInput", "#smoothingValue"],
    ["#cropInput", "#cropValue"],
    ["#radiusInput", "#radiusValue"],
  ];
  for (const [inputSelector, outputSelector] of sliderCases) {
    const output = page.locator(outputSelector);
    const before = await output.textContent();
    await page.locator(inputSelector).press("ArrowRight");
    await expect(output).not.toHaveText(before);
    await expect(page.locator("#adjustmentFeedback")).toContainText("预览已更新");
  }

  for (const layerId of ["topCopper", "topMask", "bottomCopper", "bottomMask", "silk"]) {
    const toggle = page.locator(`[data-layer="${layerId}"]`);
    await expect(toggle).toHaveAttribute("aria-pressed", "true");
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-pressed", "false");
    await expect(page.locator("#adjustmentFeedback")).toContainText("图层预览已更新");
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-pressed", "true");
  }

  await page.locator('[data-view="pcb"]').click();
  await expect(page.locator(".preview-stage")).toHaveAttribute("data-view-mode", "pcb");
  await expect(page.locator("#adjustmentFeedback")).toContainText("PCB only");
  await page.locator('[data-view="compare"]').click();
  await expect(page.locator(".preview-stage")).toHaveAttribute("data-view-mode", "compare");
  await expect(page.locator("#adjustmentFeedback")).toContainText("Compare");

  await page.locator('[data-corner="square"]').click();
  await expect(page.locator('[data-corner="square"]')).toHaveClass(/is-active/);
  await expect(page.locator("#radiusField")).toHaveCSS("opacity", "0.42");
  await expect(page.locator("#adjustmentFeedback")).toContainText("方角");
  await page.locator('[data-corner="rounded"]').click();
  await expect(page.locator('[data-corner="rounded"]')).toHaveClass(/is-active/);
  await expect(page.locator("#adjustmentFeedback")).toContainText("圆角");

  await page.locator("#widthInput").fill("20");
  await expect(page.locator("#readinessText")).toHaveText("BLOCKED");
  await expect(page.locator("#exportButton")).toBeDisabled();
  await page.locator("#widthInput").fill("85.6");
  await expect(page.locator("#readinessText")).toHaveText("READY");

  const manufacturingDownload = page.waitForEvent("download");
  await page.locator("#exportButton").click();
  const manufacturing = await manufacturingDownload;
  expect(await manufacturing.failure()).toBeNull();
  expect(manufacturing.suggestedFilename()).toContain("manufacturing");
  await expect(page.locator("#exportButton")).toHaveAttribute("data-package-files", "6");
  await expect(page.locator("#adjustmentFeedback")).toContainText("制造 ZIP 已生成");

  const reviewDownload = page.waitForEvent("download");
  await page.locator("#reviewExportButton").click();
  const review = await reviewDownload;
  expect(await review.failure()).toBeNull();
  expect(review.suggestedFilename()).toContain("review");
  await expect(page.locator("#reviewExportButton")).toHaveAttribute("data-package-files", "13");
  await expect(page.locator("#adjustmentFeedback")).toContainText("评审 ZIP 已生成");

  await page.locator("#resetButton").click();
  await expect(page.locator("#sourceLabel")).toHaveText("Calibration sample");
  await expect(page.locator("#readinessText")).toHaveText("BLOCKED");
  await expect(page.locator("#adjustmentFeedback")).toContainText("已恢复校准样本");

  await page.setViewportSize({ width: 390, height: 844 });
  const viewportMetrics = await page.evaluate(() => ({
    horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth,
    bodyHeight: document.body.scrollHeight,
  }));
  expect(viewportMetrics.horizontalOverflow).toBe(false);
  expect(viewportMetrics.bodyHeight).toBeGreaterThan(844);

  expect(consoleErrors).toEqual([]);
  expect(pageErrors).toEqual([]);
  expect(failedResponses).toEqual([]);
  expect(externalRequests).toEqual([]);
});
