import { chromium } from "@playwright/test";
const b = await chromium.launch();
const ctx = await b.newContext({ viewport:{width:390,height:844}, isMobile:true, hasTouch:true });
const p = await ctx.newPage();
const cdp = await ctx.newCDPSession(p);
await cdp.send("DOM.enable"); await cdp.send("CSS.enable");
await p.goto("https://artwall-production.vercel.app/", { waitUntil:"networkidle", timeout:60000 });
await p.getByRole("button", { name: /menu/i }).first().click();
await p.waitForTimeout(900);
const { root } = await cdp.send("DOM.getDocument", { depth: -1 });
const { nodeId } = await cdp.send("DOM.querySelector", { nodeId: root.nodeId, selector: "#mobile-menu nav button" });
const m = await cdp.send("CSS.getMatchedStylesForNode", { nodeId });
for (const r of (m.matchedCSSRules||[])) {
  const props = (r.rule.style?.cssProperties||[]).filter(x=>x.name==="color"||x.name==="font-family");
  if (props.length) console.log(r.rule.selectorList.text, "=>", JSON.stringify(props.map(x=>x.name+":"+x.value)), "origin:", r.rule.origin);
}
console.log("--- inherited ---");
for (const inh of (m.inherited||[])) {
  for (const r of (inh.matchedCSSRules||[])) {
    const props = (r.rule.style?.cssProperties||[]).filter(x=>x.name==="color");
    if (props.length) console.log(r.rule.selectorList.text, "=>", JSON.stringify(props.map(x=>x.name+":"+x.value)));
  }
}
await b.close();
