// Dumps the Fcode webview console + failed network requests over CDP.
// Requires the app launched with WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9222
const PORT = 9222;

async function main() {
  // Find the page target.
  let targets;
  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json`);
      targets = await res.json();
      if (targets.length) break;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  if (!targets?.length) {
    console.log("NO_CDP_TARGETS");
    return;
  }
  const page = targets.find((t) => t.type === "page") ?? targets[0];
  console.log("TARGET:", page.url, "|", page.title);

  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0;
  const pending = new Map();
  const send = (method, params = {}) =>
    new Promise((resolve) => {
      const msgId = ++id;
      pending.set(msgId, resolve);
      ws.send(JSON.stringify({ id: msgId, method, params }));
    });

  const logs = [];
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    } else if (msg.method === "Runtime.consoleAPICalled") {
      const text = msg.params.args.map((a) => a.value ?? a.description ?? a.type).join(" ");
      logs.push(`[console.${msg.params.type}] ${text}`);
    } else if (msg.method === "Runtime.exceptionThrown") {
      const d = msg.params.exceptionDetails;
      logs.push(`[exception] ${d.text} ${d.exception?.description ?? ""}`);
    } else if (msg.method === "Log.entryAdded") {
      logs.push(`[log.${msg.params.entry.level}] ${msg.params.entry.text} ${msg.params.entry.url ?? ""}`);
    } else if (msg.method === "Network.loadingFailed") {
      logs.push(`[net-failed] ${msg.params.errorText} ${msg.params.type} blocked=${msg.params.canceled}`);
    }
  };

  await new Promise((r) => (ws.onopen = r));
  await send("Runtime.enable");
  await send("Log.enable");
  await send("Network.enable");
  await send("Page.enable");

  // Reload and collect for a few seconds.
  await send("Page.reload", { ignoreCache: true });
  await new Promise((r) => setTimeout(r, 6000));

  const evalRes = await send("Runtime.evaluate", {
    expression: "JSON.stringify({title: document.title, href: location.href, rootChildren: document.getElementById('root')?.childElementCount, bodyStart: document.body.innerHTML.slice(0, 200)})",
    returnByValue: true,
  });
  console.log("STATE:", evalRes.result?.result?.value ?? JSON.stringify(evalRes));
  console.log("=== LOGS ===");
  for (const l of logs.slice(0, 60)) console.log(l);
  ws.close();
  process.exit(0);
}

main().catch((e) => {
  console.error("CDP_ERROR", e.message);
  process.exit(1);
});
