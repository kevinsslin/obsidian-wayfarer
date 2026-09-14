// Developer QA against the running test-vault (Obsidian --remote-debugging-port=9222).
// Uses the real plugin renderer; phone captures emulate pane dimensions, not iOS/Android.
// Restores viewport, theme, plugin preferences and manual progress even on assertion failure.
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const output = resolve(process.argv[2] ?? "/tmp/wayfarer-journey-qa");
const locale = process.argv[3] ?? "zh-TW";
if (!["en", "zh-TW"].includes(locale)) throw new Error("Locale must be en or zh-TW");
mkdirSync(output, { recursive: true });
const targets = await (await fetch("http://localhost:9222/json")).json();
let ws, rpc;
for (const target of targets.filter((t) => t.type === "page")) {
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r, j) => { socket.onopen = r; socket.onerror = j; });
  let id = 0;
  const pending = new Map();
  socket.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  };
  const send = (method, params = {}) => new Promise((r, j) => {
    const i = ++id;
    const timeout = setTimeout(() => { pending.delete(i); j(new Error(`CDP timeout: ${method}`)); }, 15000);
    pending.set(i, (m) => { clearTimeout(timeout); m.error ? j(new Error(JSON.stringify(m.error))) : r(m.result); });
    socket.send(JSON.stringify({ id: i, method, params }));
  });
  const result = await send("Runtime.evaluate", { expression: 'typeof app !== "undefined" && app.vault?.getName()', returnByValue: true });
  if (result.result?.value === "test-vault") { ws = socket; rpc = send; break; }
  socket.close();
}
if (!rpc) throw new Error("Open test-vault in Obsidian with CDP enabled first");
const evaluate = async (expression) => {
  const r = await rpc("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? "Renderer exception");
  return r.result?.value;
};
const pause = () => new Promise((r) => setTimeout(r, 900));
const screenshot = async (name) => {
  await pause();
  const r = await rpc("Page.captureScreenshot", { format: "png" });
  writeFileSync(resolve(output, name), Buffer.from(r.data, "base64"));
};
const assert = (value, label) => { if (!value) throw new Error(label); };
const receipts = [{ locale, capture: "Real plugin renderer with emulated phone panes and reconstructed Obsidian host chrome; not device screenshots" }];
try {
  await rpc("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  await evaluate(`(async () => {
    await app.plugins.disablePlugin("wayfarer");
    await app.plugins.enablePlugin("wayfarer");
    await app.plugins.plugins.wayfarer.openMap();
    const p = app.plugins.plugins.wayfarer;
    const v = app.workspace.getLeavesOfType("wayfarer")[0].view;
    if (!v.itinerary?.stops.length) throw new Error("Open a populated test itinerary first");
    window.wfQA = { v, language: p.settings.uiLanguage, theme: document.body.className,
      storage: app.loadLocalStorage("wayfarer:progress:" + v.file.path), key: "wayfarer:progress:" + v.file.path,
      open: window.open, current: v.progress, listOpen: p.settings.listOpen };
    p.settings.uiLanguage = ${JSON.stringify(locale)}; p.applyLocale();
    p.settings.listOpen = true;
    v.progress = {current:null, finished:false};
    v.chooseDay(v.itinerary.days[0]);
    v.journeyOpen = true; v.drawJourney();
  })()`);
  await pause();
  const progress = await evaluate(`(() => {
    const {v} = window.wfQA;
    const click = s => { const el = v.contentEl.querySelector(s); if (!el) throw new Error("Missing " + s); el.click(); };
    click(".wf-journey-advance");
    const first = JSON.stringify(v.progress);
    const firstDisabled = v.contentEl.querySelector(".wf-journey-previous").disabled;
    const next = v.itinerary.stops[1];
    let opened = null;
    window.open = url => {opened = url; return null;};
    try { click(".wf-journey-nav"); } finally { window.open = window.wfQA.open; }
    const nav = new URL(opened);
    const unchanged = first === JSON.stringify(v.progress);
    v.chooseDay(v.itinerary.days[v.itinerary.days.length-1]);
    const browsed = first === JSON.stringify(v.progress);
    click(".wf-inline-action");
    const returned = v.activeDay === v.currentStop().dayIndex;
    click(".wf-journey-advance");
    const advanced = v.currentStop() === next;
    click(".wf-journey-previous");
    const previous = first === JSON.stringify(v.progress);
    click(".wf-journey-advance");
    const stored = app.loadLocalStorage(window.wfQA.key);
    return { firstDisabled, previous, unchanged, browsed, returned, advanced, persisted: JSON.stringify(stored) === JSON.stringify(v.progress), destination: nav.searchParams.get("destination") === next.lat + "," + next.lng, noOrigin: !nav.searchParams.has("origin") };
  })()`);
  assert(Object.values(progress).every(Boolean), "Progress/nav/browse isolation: " + JSON.stringify(progress));
  receipts.push({ progress });
  const restored = await evaluate(`(async () => {
    const q=window.wfQA, saved=JSON.stringify(q.v.progress);
    await app.plugins.disablePlugin("wayfarer");
    await app.plugins.enablePlugin("wayfarer");
    await app.plugins.plugins.wayfarer.openMap();
    q.v=app.workspace.getLeavesOfType("wayfarer")[0].view;
    const p=app.plugins.plugins.wayfarer;
    p.settings.uiLanguage=${JSON.stringify(locale)};p.settings.listOpen=true;p.applyLocale();
    const same=saved===JSON.stringify(q.v.progress);
    q.v.journeyOpen=true;q.v.returnToCurrent();
    return same;
  })()`);
  assert(restored,"Manual progress survives plugin reload");
  receipts.push({restored});
  await pause();
  const desktopCamera = await evaluate('(() => {const v=window.wfQA.v;v.returnToCurrent();return {zoom:v.map.getZoom(),stop:v.currentStop().name};})()');
  assert(desktopCamera.zoom >= 14, "Current stop camera: " + JSON.stringify(desktopCamera));
  receipts.push({desktopCamera});
  await screenshot("desktop.png");
  // Isolate the existing real ItemView without mutating the workspace layout file.
  await evaluate(`(() => {
    const v = window.wfQA.v;
    window.wfQA.parent = v.contentEl.parentElement;
    window.wfQA.sibling = v.contentEl.nextSibling;
    document.body.appendChild(v.contentEl);
    v.contentEl.addClass("wf-qa-pane");
    const style = document.createElement("style"); style.id = "wf-qa-viewport";
    style.textContent = ".wf-qa-pane { position:fixed !important; inset:0 !important; width:100vw !important; height:100vh !important; z-index:9999 !important; padding:0 !important; overflow:hidden !important; }";
    document.head.appendChild(style);
  })()`);
  for (const [width, height] of [[390, 844], [320, 640]]) {
    await rpc("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 2, mobile: false });
    await pause();
    await evaluate(`(() => { const v=window.wfQA.v; v.narrowOpen=false; v.applySplit(); v.returnToCurrent(); })()`);
    await pause();
    const layout = await evaluate(`(() => {
      const v=window.wfQA.v, root=v.contentEl.getBoundingClientRect();
      const rect = el => {const r=el.getBoundingClientRect();return {x:r.x-root.x,y:r.y-root.y,w:r.width,h:r.height};};
      const controls = [...v.legendEl.querySelectorAll("select,button"), ...v.journeyEl.querySelectorAll("button")].filter(e=>e.getBoundingClientRect().width>0).map(rect);
      const card=rect(v.journeyEl), legend=rect(v.legendEl), map=rect(v.mapEl);
      const stop=v.currentStop(), point=v.map.latLngToContainerPoint([stop.lat,stop.lng]);
      return {width:root.width,height:root.height,map,card,legend,controls,
        overflow:controls.some(r=>r.x < -1 || r.x+r.w > root.width+1),
        small:controls.some(r=>r.h<43 || r.w<43),
        pinVisible: point.x>0 && point.x<root.width && point.y>legend.y+legend.h && point.y<card.y};
    })()`);
    assert(!layout.overflow && !layout.small && layout.pinVisible && layout.map.h === height, "Phone map layout: " + JSON.stringify(layout));
    receipts.push(layout);
    await screenshot(`mobile-${width}.png`);
    if (width === 390) {
      await evaluate('window.wfQA.v.contentEl.querySelector(".wf-journey-toggle").click()');
      await screenshot("mobile-390-collapsed.png");
      await evaluate('window.wfQA.v.contentEl.querySelector(".wf-journey-toggle").click()');
    }
    await evaluate('window.wfQA.v.contentEl.querySelector(".wf-list-toggle").click()');
    await pause();
    const list = await evaluate(`(() => {const v=window.wfQA.v, a=v.stripEl.getBoundingClientRect(), b=v.journeyEl.getBoundingClientRect();return {open:v.listOpen(),stops:v.stripEl.querySelectorAll(".wf-stop").length,clear:a.bottom<=b.top};})()`);
    assert(list.open && list.stops > 0 && list.clear, "Phone list: " + JSON.stringify(list));
    receipts.push({ width, list });
    await screenshot(`mobile-${width}-list.png`);
    // Selecting a stop returns to the map without replacing it with the note.
    const select = await evaluate(`(() => {
      const v=window.wfQA.v, before=JSON.stringify(v.progress), source=v.file.path;
      v.stripEl.querySelector(".wf-stop").click();
      return {map:!v.listOpen(),sameProgress:before===JSON.stringify(v.progress),sameSource:v.file.path===source};
    })()`);
    assert(Object.values(select).every(Boolean), "List selection: " + JSON.stringify(select));
    await pause();
    const popup = await evaluate(`(() => {const v=window.wfQA.v;const p=v.mapEl.querySelector(".leaflet-popup");if(!p)return null;const r=p.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom};})()`);
    assert(popup && popup.x >= 0 && popup.right <= width + 1, "Popup fits phone width: " + JSON.stringify(popup));
    await screenshot(`mobile-${width}-detail.png`);
  }
  // Reconstruct the host chrome seen in the user's iPhone screenshots. The real
  // Obsidian mobile CSS supplies navbar dimensions; our fixture supplies markup.
  await rpc("Emulation.setDeviceMetricsOverride", { width:402,height:874,deviceScaleFactor:2,mobile:false });
  await evaluate(`(() => {
    const q=window.wfQA;
    const host=document.createElement("div");host.id="wf-qa-host";
    const header=host.createDiv({cls:"view-header"});header.createSpan({text:"▣"});header.createSpan({text:"•••"});
    host.appendChild(q.v.contentEl);document.body.appendChild(host);
    const status=document.body.createDiv({attr:{id:"wf-qa-status"},text:"10:16                          ▰ 91%"});
    const nav=document.body.createDiv({cls:"mobile-navbar",attr:{id:"wf-qa-navbar"}});
    const actions=nav.createDiv({cls:"mobile-navbar-actions"});
    for (const text of ["‹","›","⌕","+","▣","☰"]) actions.createDiv({cls:"mobile-navbar-action",text});
    document.body.addClass("is-mobile","is-phone","is-ios","emulate-mobile");
    const style=document.body.createEl("style",{attr:{id:"wf-qa-host-style"}});
    style.textContent = '#wf-qa-status {position:fixed;top:0;left:0;right:0;height:114px;padding:20px 28px;background:var(--background-primary);z-index:10000;font-size:16px;} #wf-qa-host > .view-header {position:fixed;top:59px;left:12px;right:12px;width:auto;height:46px;margin:0;padding:0;display:flex;justify-content:space-between;z-index:10001;} #wf-qa-host > .view-header span {border-radius:50%;padding:12px;background:var(--background-secondary);} #wf-qa-host > .wf-qa-pane {top:var(--wf-qa-top,114px) !important;height:calc(100vh - var(--wf-qa-top,114px)) !important;} #wf-qa-navbar {z-index:10002;display:flex;position:fixed;box-shadow:0 0 1px var(--text-muted);} #wf-qa-navbar .mobile-navbar-action {display:flex;align-items:center;justify-content:center;font-size:28px;}';
    q.v.journeyOpen=false;q.v.narrowOpen=false;q.v.returnToCurrent();
  })()`);
  for (const [name,width,height,floating,hidden,fontSize,paneTop=114] of [
    ["iphone-floating",402,874,true,false,16],
    ["iphone-hidden-nav",402,874,true,true,16],
    ["iphone-overlay-header",402,874,true,false,16,59],
    ["phone-large-text",320,740,true,false,20],
    ["phone-docked",390,844,false,false,16],
  ]) {
    await rpc("Emulation.setDeviceMetricsOverride", {width,height,deviceScaleFactor:2,mobile:false});
    await evaluate(`(() => {
      document.body.toggleClass("is-floating-nav",${floating});document.body.toggleClass("is-hidden-nav",${hidden});
      document.getElementById("wf-qa-host").style.setProperty("--font-text-size","${fontSize}px");
      document.getElementById("wf-qa-host").style.setProperty("--font-ui-small","${fontSize * .937}px");
      document.getElementById("wf-qa-host").style.setProperty("--font-ui-smaller","${fontSize * .8}px");
      document.getElementById("wf-qa-host").style.setProperty("--wf-qa-top","${paneTop}px");
      const v=window.wfQA.v;v.map.closePopup();v.journeyOpen=false;v.narrowOpen=false;v.applySplit();
    })()`);
    await pause();
    const layout=await evaluate(`(() => {
      const v=window.wfQA.v, root=v.contentEl.getBoundingClientRect(), legend=v.legendEl.getBoundingClientRect(), card=v.journeyEl.getBoundingClientRect();
      const zoom=v.mapEl.querySelector(".leaflet-control-zoom").getBoundingClientRect();
      const nav=document.getElementById("wf-qa-navbar").getBoundingClientRect();
      return {fontSize:getComputedStyle(v.contentEl.querySelector(".wf-day-select")).fontSize,topGap:legend.top-root.top,zoomGap:zoom.top-legend.bottom,footerGap:nav.top-card.bottom,
        root:root.toJSON(),legend:legend.toJSON(),card:card.toJSON(),nav:nav.toJSON()};
    })()`);
    assert(layout.topGap>=Math.max(0,105-paneTop)+7 && layout.topGap<=Math.max(0,105-paneTop)+9 && layout.zoomGap>=8 && (hidden || layout.footerGap>=8), name+": chrome collision "+JSON.stringify(layout));
    await screenshot(name+"-map.png");
    await evaluate('window.wfQA.v.contentEl.querySelector(".wf-journey-toggle").click()');
    await pause();
    const expanded=await evaluate(`(() => {
      const v=window.wfQA.v,card=v.journeyEl.getBoundingClientRect(),nav=document.getElementById("wf-qa-navbar").getBoundingClientRect();
      const actions=[...v.journeyEl.querySelectorAll("button")].map(el=>el.getBoundingClientRect());
      return {clear:card.bottom<=nav.top-8,overflow:actions.some(r=>r.left<card.left || r.right>card.right+1)};
    })()`);
    assert((hidden || expanded.clear) && !expanded.overflow,name+": expanded card collision "+JSON.stringify(expanded));
    await screenshot(name+"-progress.png");
    await evaluate(`(() => {const v=window.wfQA.v;v.chooseDay(v.itinerary.days[1]);v.contentEl.querySelector(".wf-list-toggle").click();})()`);
    await pause();
    const list=await evaluate(`(() => {
      const v=window.wfQA.v, list=v.stripEl.getBoundingClientRect(),legend=v.legendEl.getBoundingClientRect(),card=v.journeyEl.getBoundingClientRect();
      return {clear:list.top>=legend.bottom+8 && list.bottom<=card.top-8,collapsed:!v.journeyOpen,mapHidden:getComputedStyle(v.mapEl).visibility==="hidden",transportButtons:v.stripEl.querySelectorAll(".wf-leg-mode").length,scrollHeight:v.stripEl.scrollHeight,height:v.stripEl.clientHeight};
    })()`);
    assert(list.clear && list.collapsed && list.mapHidden && list.transportButtons===0,name+": list reading surface "+JSON.stringify(list));
    await screenshot(name+"-list.png");
    await evaluate('window.wfQA.v.stripEl.scrollTop=window.wfQA.v.stripEl.scrollHeight');
    const last=await evaluate(`(() => {const v=window.wfQA.v;const r=v.stripEl.lastElementChild.getBoundingClientRect();return r.bottom<=v.stripEl.getBoundingClientRect().bottom+1;})()`);
    assert(last,name+": last stop can be scrolled into view");
    await evaluate('window.wfQA.v.stripEl.querySelector(".wf-stop").click()');
    await pause();
    const detail=await evaluate(`(() => {
      const v=window.wfQA.v,popup=v.mapEl.querySelector(".leaflet-popup");if(!popup)return null;
      const r=popup.getBoundingClientRect(),legend=v.legendEl.getBoundingClientRect(),card=v.journeyEl.getBoundingClientRect();
      return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,aboveFooter:r.bottom<=card.top,belowLegend:r.top>=legend.bottom};
    })()`);
    assert(detail && detail.left>=0 && detail.right<=width+1 && detail.aboveFooter && detail.belowLegend,name+": place details avoid host chrome "+JSON.stringify(detail));
    receipts.push({hostScenario:name,layout,expanded,list,lastStopVisible:last,detail});
  }
  await evaluate(`(() => {
    const q=window.wfQA;document.body.appendChild(q.v.contentEl);
    for(const id of ["wf-qa-host","wf-qa-status","wf-qa-navbar","wf-qa-host-style"])document.getElementById(id)?.remove();
    document.body.className=q.theme;
  })()`);
  await evaluate(`(() => {const v=window.wfQA.v;v.map.closePopup();v.journeyOpen=true;v.returnToCurrent();document.body.removeClass("theme-dark");document.body.addClass("theme-light");})()`);
  await screenshot("mobile-320-light.png");
  const finish = await evaluate(`(() => {
    const v=window.wfQA.v;
    const boundary = v.itinerary.days.find(d=>d.stops.length && v.itinerary.stops.indexOf(d.stops[d.stops.length-1])<v.itinerary.stops.length-1);
    v.setCurrent(boundary.stops[boundary.stops.length-1]);
    v.contentEl.querySelector(".wf-journey-advance").click();
    const crossed = v.currentStop().dayIndex !== boundary.index;
    v.contentEl.querySelector(".wf-journey-previous").click();
    const crossedBack = v.currentStop() === boundary.stops[boundary.stops.length-1];
    v.setCurrent(v.itinerary.stops[v.itinerary.stops.length-1]);
    v.contentEl.querySelector(".wf-journey-advance").click();
    return {crossed,crossedBack,finished:v.progress.finished,navHidden:!v.contentEl.querySelector(".wf-journey-nav")};
  })()`);
  assert(Object.values(finish).every(Boolean), "Day boundary and completion: " + JSON.stringify(finish));
  receipts.push({finish});
  writeFileSync(resolve(output, "receipts.json"), JSON.stringify(receipts, null, 2));
  console.log("journey smoke: PASS; real Obsidian renderer, desktop + 390/320 px phone panes", output);
} finally {
  await rpc("Emulation.clearDeviceMetricsOverride");
  await rpc("Emulation.setEmulatedMedia", { features: [] });
  await evaluate(`(() => {
    const q=window.wfQA;if(!q)return;
    window.open=q.open;
    document.getElementById("wf-qa-viewport")?.remove();
    document.body.className=q.theme;
    q.v.contentEl.removeClass("wf-qa-pane");
    if(q.parent) q.parent.insertBefore(q.v.contentEl,q.sibling);
    for(const id of ["wf-qa-host","wf-qa-status","wf-qa-navbar","wf-qa-host-style"])document.getElementById(id)?.remove();
    app.saveLocalStorage(q.key,q.storage ?? null);
    q.v.progress=q.current;
    const p=app.plugins.plugins.wayfarer;
    p.settings.uiLanguage=q.language;p.settings.listOpen=q.listOpen;p.applyLocale();
    q.v.journeyOpen=false;q.v.narrowOpen=false;q.v.chooseDay(q.v.itinerary.days[0]);
    delete window.wfQA;
  })()`);
  ws.close();
}
