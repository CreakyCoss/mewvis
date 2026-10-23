import assert from "node:assert/strict";
import { createServer } from "vite";

const playwright = await import(process.env.MEWVIS_PLAYWRIGHT_MODULE ?? "playwright");
const server = await createServer({
  configFile: new URL("../../../vite.config.ts", import.meta.url).pathname,
  server: { host: "127.0.0.1", port: 0, strictPort: false },
});

const visible = (locator) => locator.waitFor({ state: "visible" });
const hidden = (locator) => locator.waitFor({ state: "hidden" });
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1, `${actual} ≈ ${expected}`);
try {
  await server.listen();
  const origin = server.resolvedUrls.local[0];
  for (const engine of (process.env.MEWVIS_VIEW_TEST_BROWSERS ?? "chromium").split(",")) {
    const executablePath = process.env[`MEWVIS_VIEW_TEST_${engine.toUpperCase()}_EXECUTABLE`];
    const browser = await playwright[engine].launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
    try {
      for (const titleBar of ["web", "native", "overlay"]) {
        const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
        const errors = [];
        page.on("pageerror", (error) => errors.push(error.message));
        await page.goto(`${origin}scripts/docs/application-layout.html?titleBar=${titleBar}`);
        const sidebar = page.getByRole("navigation", { name: "应用侧栏" });
        const controls = page.getByRole("group", { name: "应用窗口操作" });
        const applicationHeader = page.locator('header[aria-label="应用导航"]');
        const frameLocator = () => page.locator("iframe[title$='应用界面']");
        await visible(sidebar);
        await visible(frameLocator());
        assert.equal(await controls.count(), 0, "默认应用不声明全屏");
        near((await frameLocator().boundingBox()).x, 224);

        for (const source of ["bundled", "installed"]) {
          await sidebar.getByRole("link", { name: `文档中心 ${source} fullscreen`, exact: true }).click();
          await hidden(sidebar);
          await visible(controls);
          await visible(frameLocator());
          const frame = await (await frameLocator().elementHandle()).contentFrame();
          await frame.waitForFunction(() => window.mewvisApplication?.getHost());
          const marker = await frame.evaluate(() => (window.fullscreenTestMarker = Math.random()));
          const bounds = await frameLocator().boundingBox();
          near(bounds.x, 0);
          near(bounds.y, 40);
          near(bounds.width, 1280);
          near(bounds.height, 760);

          await page.getByRole("button", { name: "退出应用全屏", exact: true }).click();
          await visible(sidebar);
          near((await frameLocator().boundingBox()).x, 224);
          assert.equal(await frame.evaluate(() => window.fullscreenTestMarker), marker, "退出全屏不重载沙箱");
          await page.getByRole("button", { name: "进入应用全屏", exact: true }).click();
          await hidden(sidebar);
          assert.equal(await frame.evaluate(() => window.fullscreenTestMarker), marker, "重新全屏不重载沙箱");

          assert.deepEqual(
            await frame.evaluate(() =>
              window.mewvisApplication.header.set({
                title: "应用自己的标题与风格",
                backLabel: "项目列表",
              }),
            ),
            { supported: true },
          );
          await visible(applicationHeader);
          await visible(page.getByRole("button", { name: "返回项目列表", exact: true }));
          near((await frameLocator().boundingBox()).y, 40);
          await page.setViewportSize({ width: 520, height: 760 });
          const headerBounds = await applicationHeader.boundingBox();
          const controlBounds = await controls.boundingBox();
          assert.ok(headerBounds.x + headerBounds.width <= controlBounds.x + 1, "应用顶栏与宿主按钮不重叠");
          if (titleBar === "overlay") assert.ok(headerBounds.x >= 80, "为 macOS 窗口按钮保留空间");
          if (process.env.MEWVIS_LAYOUT_SCREENSHOT && titleBar === "overlay" && source === "installed") {
            await page.screenshot({ path: `${process.env.MEWVIS_LAYOUT_SCREENSHOT}-${engine}.png` });
          }
          await page.getByRole("button", { name: "退出应用全屏", exact: true }).click();
          await page.getByRole("button", { name: "进入应用全屏", exact: true }).click();
          assert.equal(await frame.evaluate(() => window.fullscreenTestMarker), marker);
          await page.setViewportSize({ width: 1280, height: 800 });

          await page.getByRole("link", { name: "退出应用，返回应用列表", exact: true }).click();
          await visible(sidebar);
          await hidden(controls);
          assert.equal(await frameLocator().count(), 0);
          assert.equal(await applicationHeader.count(), 0, "离开应用清理顶栏");
        }

        // Changing routes from an exited fullscreen app must also release the registration.
        await sidebar.getByRole("link", { name: "文档中心 bundled fullscreen", exact: true }).click();
        await page.getByRole("button", { name: "退出应用全屏", exact: true }).click();
        await sidebar.getByRole("link", { name: "其他页面", exact: true }).click();
        await visible(sidebar);
        await hidden(controls);
        await visible(page.getByText("其他应用页面", { exact: true }));

        // A declaration invalidated while fullscreen must restore navigation without a user toggle.
        await sidebar.getByRole("link", { name: "文档中心 bundled fullscreen", exact: true }).click();
        await hidden(sidebar);
        await page.locator('nav[aria-label="应用侧栏"] button').evaluate((button) => button.click());
        await visible(sidebar);
        await hidden(controls);
        await visible(page.getByText("应用 UI 声明无效，已回退到通用页面", { exact: true }));
        assert.deepEqual(errors, []);
        await page.close();
        console.log(
          `${engine} ${titleBar}: fullscreen declaration, state retention, header and navigation cleanup passed.`,
        );
      }
    } finally {
      await browser.close();
    }
  }
} finally {
  await server.close();
}
