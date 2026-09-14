// Regression against real Obsidian: mouseup must not replace the button before click.
// Usage: node scripts/navigation-smoke.mjs [vault-name] [phone], Obsidian CDP on port 9222.
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
  if (result.result?.value === (process.argv[2] ?? "test-vault")) { ws = socket; rpc = send; break; }
  socket.close();
}
if (!rpc) throw new Error("Open test-vault in Obsidian with CDP enabled first");
const evaluate = async (expression) => {
  const r = await rpc("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? "Renderer exception");
  return r.result?.value;
};
try {
  if (process.argv[3] === "phone") await rpc("Emulation.setDeviceMetricsOverride", {width:390,height:844,deviceScaleFactor:1,mobile:false});
  console.log(await evaluate(`(async () => {
    const plugin = app.plugins.plugins.wayfarer;
    let v = app.workspace.getLeavesOfType("wayfarer")[0]?.view;
    if (!v?.itinerary || v.itinerary.stops.length < 5) throw new Error("Open an itinerary with at least five stops");
    const file = v.file, original = v.selectedStop();
    const key = "wayfarer:selection:" + file.path, saved = app.loadLocalStorage(key);
    const check = (ok, msg) => { if (!ok) throw new Error(msg); };
    const click = (selector) => {
      const button = v.contentEl.querySelector(selector);
      check(button && !button.disabled, "Missing or disabled: " + selector);
      button.dispatchEvent(new MouseEvent("mousedown", {bubbles:true}));
      button.dispatchEvent(new MouseEvent("mouseup", {bubbles:true}));
      document.dispatchEvent(new Event("selectionchange"));
      check(button.isConnected, "Cursor tracking replaced button before click");
      button.click();
    };
    try {
      plugin.trackCursor();
      v.browseStop(v.itinerary.stops[0]);
      for (let i=1;i<=3;i++) {
        click(".wf-journey-advance");
        check(v.selectedStop()===v.itinerary.stops[i], "Next " + i);
        await new Promise(r=>setTimeout(r,100));
      }
      for (let i=2;i>=0;i--) {
        click(".wf-journey-previous");
        check(v.selectedStop()===v.itinerary.stops[i], "Previous " + i);
      }
      check(v.contentEl.querySelector(".wf-journey-previous").disabled,"First boundary");
      const boundary=v.itinerary.days.find(d=>d.stops.length && v.itinerary.stops.indexOf(d.stops.at(-1))<v.itinerary.stops.length-1);
      if(boundary){
        const i=v.itinerary.stops.indexOf(boundary.stops.at(-1));
        v.browseStop(v.itinerary.stops[i]);
        click(".wf-journey-advance");check(v.selectedStop()===v.itinerary.stops[i+1],"Across day");
        click(".wf-journey-previous");check(v.selectedStop()===v.itinerary.stops[i],"Back across day");
      }
      v.browseStop(v.itinerary.stops.at(-1));
      check(v.contentEl.querySelector(".wf-journey-advance").disabled,"Last boundary");
      v.browseStop(v.itinerary.stops[2]);
      const it=v.itinerary;
      v.render(null,null,-1);
      v.render(file,it,-1);
      check(v.selectedStop()===v.itinerary.stops[2],"Return to note restores selection");
      await app.plugins.disablePlugin("wayfarer");
      await app.plugins.enablePlugin("wayfarer");
      await app.plugins.plugins.wayfarer.openMap();
      v=app.workspace.getLeavesOfType("wayfarer")[0].view;
      check(v.selectedStop()===v.itinerary.stops[2],"Reload restores selection");
      click(".wf-journey-advance");click(".wf-journey-advance");
      check(v.selectedStop()===v.itinerary.stops[4],"Repeated next after reload");
      return {repeatedNext:true,repeatedPrevious:true,dayBoundaries:true,noteReturn:true,reload:true};
    } finally {
      if(original) {const stop=v.itinerary?.stops.find(s=>s.line===original.line);if(stop)v.browseStop(stop);}
      app.saveLocalStorage(key,saved ?? null);
    }
  })()`));
} finally {
  if (process.argv[3] === "phone") await rpc("Emulation.clearDeviceMetricsOverride");
  ws.close();
}
