// Bridge between the Viewfinder page and the extension.
document.documentElement.dataset.vfFitExt = chrome.runtime.getManifest().version;
window.addEventListener("message", e => {
  if (e.source !== window || e.origin !== location.origin || !e.data || e.data.vf !== "run") return;
  chrome.runtime.sendMessage({ t: "run", id: e.data.id, image: e.data.image, prompt: e.data.prompt });
});
chrome.runtime.onMessage.addListener(m => { window.postMessage({ vf: "ext", ...m }, location.origin); });
