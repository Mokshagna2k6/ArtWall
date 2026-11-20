import { chromium } from "@playwright/test";
const b = await chromium.launch();
const ctx = await b.newContext({ viewport:{width:390,height:844}, isMobile:true, hasTouch:true });
const p = await ctx.newPage();
await p.goto("https://artwall-production.vercel.app/", { waitUntil:"networkidle", timeout:60000 });
await p.getByRole("button", { name: /menu/i }).first().click();
await p.waitForTimeout(900);
const out = await p.evaluate(() => {
  const el = [...document.querySelectorAll('#mobile-menu nav button')][0];
  const chain = [];
  let n = el;
  while (n && n !== document.documentElement) {
    chain.push({
      tag: n.tagName,
      cls: (n.className||"").toString().slice(0,90),
      color: getComputedStyle(n).color,
      bg: getComputedStyle(n).backgroundColor,
    });
    n = n.parentElement;
  }
  chain.push({ tag:"HTML", cls:"", color:getComputedStyle(document.documentElement).color, bg:getComputedStyle(document.documentElement).backgroundColor });
  const rootVars = ["--foreground","--color-ink","--background"].map(v=>v+"="+getComputedStyle(document.documentElement).getPropertyValue(v).trim());
  return { chain, rootVars, scheme: matchMedia('(prefers-color-scheme: dark)').matches };
});
console.log(JSON.stringify(out, null, 2));
await b.close();
