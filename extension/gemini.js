// Runs on gemini.google.com. Only acts on the tab the extension opened for a job.
(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  let job = null;
  for (let i = 0; i < 8 && !job; i++) { job = await chrome.runtime.sendMessage({ t: "job?" }); if (!job) await sleep(400); }
  if (!job) return;

  const send = (t, extra) => chrome.runtime.sendMessage({ t, ...extra });
  const say = text => send("progress", { text });
  const fail = text => send("error", { text });
  const waitFor = async (fn, ms, step = 300) => { const end = Date.now() + ms; while (Date.now() < end) { const v = fn(); if (v) return v; await sleep(step); } return null; };
  const label = b => (b.getAttribute("aria-label") || "") + " " + (b.className || "");

  try {
    say("Đang mở Gemini…");
    const ed = await waitFor(() => document.querySelector("rich-textarea .ql-editor, rich-textarea [contenteditable=true]"), 30000);
    if (!ed) return fail("Không thấy ô chat Gemini. Kiểm tra Chrome đã đăng nhập tài khoản Google chưa, rồi bấm lại.");
    await sleep(1000);

    // clear any draft left in the chat box
    ed.focus(); document.execCommand("selectAll"); document.execCommand("delete");
    await sleep(300);

    // 1. attach the reference image
    const [head, b64] = job.image.split(",");
    const bin = atob(b64), bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const blob = new Blob([bytes], { type: (head.match(/data:([^;]+)/) || [])[1] || "image/png" });
    const file = new File([blob], "fitting-tham-chieu.png", { type: blob.type || "image/png" });
    const attached = () => { const i = document.querySelector("input-area-v2 gem-media-attachment img, input-area-v2 .file-preview-container img, gem-media-attachment img"); return i && i.complete && i.naturalWidth ? i : null; };
    say("Đang tải ảnh ghép lên Gemini…");
    ed.focus();
    let dt = new DataTransfer(); dt.items.add(file);
    ed.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
    if (!await waitFor(attached, 8000)) {
      dt = new DataTransfer(); dt.items.add(file);
      for (const type of ["dragenter", "dragover", "drop"]) ed.dispatchEvent(new DragEvent(type, { dataTransfer: dt, bubbles: true, cancelable: true }));
      if (!await waitFor(attached, 15000)) return fail("Gemini không nhận ảnh ghép. Thử bấm lại, hoặc dùng cách thủ công.");
    }

    // 2. type the prompt
    ed.focus();
    document.execCommand("insertText", false, job.prompt);
    await sleep(600);
    if (!ed.innerText.trim()) return fail("Không gõ được câu lệnh vào Gemini.");

    // 3. wait for the upload to settle, then send
    const area = document.querySelector("input-area-v2") || document;
    const busy = () => area.querySelector("mat-progress-spinner, mat-progress-bar, [role=progressbar]");
    await waitFor(() => !busy(), 30000);
    await sleep(1200);
    const sendBtn = await waitFor(() => [...area.querySelectorAll("button")].find(b => /gửi tin nhắn|send message|send-button/i.test(label(b)) && !b.disabled && b.getAttribute("aria-disabled") !== "true"), 20000);
    if (!sendBtn) return fail("Không thấy nút gửi trên Gemini.");
    const before = document.querySelectorAll("model-response").length;
    sendBtn.click();

    // 4. wait for the generated image
    const t0 = Date.now();
    let quietSince = 0; // time the answer finished without an image
    while (Date.now() - t0 < 240000) {
      await sleep(1000);
      const resps = document.querySelectorAll("model-response");
      const last = resps.length > before ? resps[resps.length - 1] : null;
      if (last) {
        const img = [...last.querySelectorAll("single-image img, generated-image img, img.image")].find(i => i.complete && i.naturalWidth >= 256);
        if (img) {
          await sleep(1500);
          say("Đang lấy ảnh về…");
          let out = null;
          try {
            const c = document.createElement("canvas"); c.width = img.naturalWidth; c.height = img.naturalHeight;
            c.getContext("2d").drawImage(img, 0, 0);
            out = await new Promise(r => c.toBlob(r, "image/png"));
          } catch (e) {}
          if (!out) out = await (await fetch(img.src)).blob();
          const dataUrl = await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(out); });
          return send("done", { image: dataUrl });
        }
        // the thumbs up/down bar shows once Gemini has finished answering
        const finished = last.querySelector("message-actions, thumb-up-button");
        if (!finished) quietSince = 0;
        else if (!quietSince) quietSince = Date.now();
        else if (Date.now() - quietSince > 15000) {
          const txt = (last.innerText || "").trim().replace(/\s+/g, " ").slice(0, 300);
          return fail("Gemini trả lời bằng chữ, không có ảnh" + (txt ? ": \"" + txt + "\"" : "") + ". Xem tab Gemini để gõ tiếp.");
        }
      }
      say("Gemini đang tạo ảnh… " + Math.round((Date.now() - t0) / 1000) + " giây");
    }
    fail("Quá 4 phút chưa có ảnh. Xem tab Gemini.");
  } catch (e) {
    fail("Lỗi tiện ích: " + (e && e.message || e));
  }
})();
