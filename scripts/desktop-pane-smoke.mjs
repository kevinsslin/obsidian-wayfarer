// Real Obsidian regression: a narrow desktop pane retains desktop interaction.
// Usage: node scripts/desktop-pane-smoke.mjs [vault-name], Obsidian CDP on port 9222.
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
  await rpc("Emulation.setDeviceMetricsOverride", {width:390,height:844,deviceScaleFactor:1,mobile:false});
  console.log(await evaluate(`(async () => {
    const v=app.workspace.getLeavesOfType("wayfarer")[0]?.view;
    if(!v?.itinerary?.stops.length) throw new Error("Open a populated itinerary");
    const md=app.workspace.getLeavesOfType("markdown").map(l=>l.view).find(vw=>vw.file?.path===v.file.path);
    const css=v.contentEl.style.cssText;
    const original=v.selectedStop(), cursor=md.editor.getCursor(), follow=v.plugin.settings.followCursor;
    const check=(ok,msg)=>{if(!ok)throw new Error(msg);};
    try {
      v.contentEl.style.width="390px";v.contentEl.style.maxWidth="390px";
      await new Promise(r=>setTimeout(r,300));
      check(v.isNarrow(),"Expected narrow desktop pane");
      v.plugin.settings.followCursor=true;
      const target=v.itinerary.stops.find(s=>s.line!==cursor.line);
      md.editor.setCursor({line:target.line,ch:target.from});
      v.onCursor(target.line,target.dayIndex);
      check(v.selectedStop()===target,"Narrow desktop follows editor");
      const other=v.itinerary.stops.find(s=>s.line!==target.line);
      await v.jumpTo(other,false);
      check(md.editor.getCursor().line===other.line,"Narrow desktop updates note cursor");
      await new Promise(r=>setTimeout(r,900));
      check(window.matchMedia("(any-hover: hover)").matches,"Desktop hover capability required");
      v.map.closePopup();
      v.markers.get(other).fire("mouseover");
      await new Promise(r=>setTimeout(r,150));
      check(v.markers.get(other).isPopupOpen(),"Narrow desktop hover opens details");
      return {narrowDesktop:true,cursorFollow:true,noteLink:true,hover:true};
    } finally {
      v.contentEl.style.cssText=css;
      md.editor.setCursor(cursor);v.lastCursorLine=cursor.line;
      v.plugin.settings.followCursor=follow;v.map.closePopup();
      if(original)v.browseStop(original);
    }
  })()`));
} finally { await rpc("Emulation.clearDeviceMetricsOverride"); ws.close(); }
