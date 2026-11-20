import { chromium } from "@playwright/test";
const b = await chromium.launch();
const ctx = await b.newContext({ viewport:{width:390,height:844}, isMobile:true, hasTouch:true });
const p = await ctx.newPage();
await p.goto("https://artwall-production.vercel.app/", { waitUntil:"networkidle", timeout:60000 });
await p.getByRole("button", { name: /menu/i }).first().click();
await p.waitForTimeout(900);
const info = await p.evaluate(() => {
  const dlg = document.querySelector('#mobile-menu');
  if (!dlg) return { error: "no panel" };
  const bg = getComputedStyle(dlg).backgroundColor;
  const btns = [...dlg.querySelectorAll('nav button, nav a')].slice(0,8).map(el => {
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return { text: el.textContent.trim().slice(0,20), color: cs.color, fontFamily: cs.fontFamily.slice(0,40), fontSize: cs.fontSize, visible: r.width>0&&r.height>0, w: Math.round(r.width), h: Math.round(r.height) };
  });
  return { panelBg: bg, items: btns };
});
console.log(JSON.stringify(info, null, 2));
await p.screenshot({ path: "menu-390.png" });
await b.close();
