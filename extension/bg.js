// Holds one job per Gemini tab and relays progress back to the Viewfinder tab.
const key = id => "job_" + id;
chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  (async () => {
    const tabId = sender.tab && sender.tab.id;
    if (msg.t === "run") {
      const tab = await chrome.tabs.create({ url: "https://gemini.google.com/app", active: true, index: sender.tab.index + 1, windowId: sender.tab.windowId });
      await chrome.storage.session.set({ [key(tab.id)]: { id: msg.id, image: msg.image, prompt: msg.prompt, webTab: tabId, taken: false } });
      reply(true);
      return;
    }
    const k = key(tabId);
    const job = (await chrome.storage.session.get(k))[k];
    if (msg.t === "job?") {
      if (job && !job.taken) { job.taken = true; await chrome.storage.session.set({ [k]: job }); reply(job); }
      else reply(null);
      return;
    }
    if (!job) { reply(false); return; }
    try { await chrome.tabs.sendMessage(job.webTab, { t: msg.t, id: job.id, text: msg.text, image: msg.image }); } catch (e) {}
    if (msg.t === "done" || msg.t === "error") {
      await chrome.storage.session.remove(k);
      if (msg.t === "done") {
        try { const w = await chrome.tabs.get(job.webTab); await chrome.windows.update(w.windowId, { focused: true }); await chrome.tabs.update(job.webTab, { active: true }); } catch (e) {}
      }
    }
    reply(true);
  })();
  return true;
});
