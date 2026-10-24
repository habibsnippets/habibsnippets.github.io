/* ============================================================
   Deerblog dashboard behaviours.
   Deliberately small: confirmations, copy buttons, media uploads,
   and a few editor conveniences. Public pages load no JavaScript.
   ============================================================ */

(() => {
  "use strict";

  const csrfMeta = document.querySelector('meta[name="csrf-token"]');
  const csrfToken = csrfMeta ? csrfMeta.getAttribute("content") || "" : "";

  const setStatus = (element, text, isError = false) => {
    if (!element) return;
    element.textContent = text;
    element.classList.toggle("is-error", isError);
  };

  /* --- destructive actions ---------------------------------- */

  const submitting = new WeakSet();

  for (const form of document.querySelectorAll("form[data-confirm]")) {
    form.addEventListener("submit", (event) => {
      if (submitting.has(form)) {
        event.preventDefault();
        return;
      }
      if (!window.confirm(form.getAttribute("data-confirm") || "Are you sure?")) {
        event.preventDefault();
        return;
      }
      submitting.add(form);
      /* A submit that opens a preview in another tab should not mark the
         editor clean; it has not saved anything. */
      const target = event.submitter && event.submitter.getAttribute("formtarget");
      if (form.classList.contains("editor-form") && target === "_blank") {
        submitting.delete(form);
        const editor = form.querySelector(".editor-area");
        if (editor) editor.dataset.previewing = "1";
      }
    });
  }

  /* Consecutive clicks should not double-post. Forms without a confirm
     dialog get the guard lazily on their first submission. */
  for (const form of document.querySelectorAll("form[method='post'], form[method='POST']")) {
    if (form.hasAttribute("data-confirm") || form.hasAttribute("data-upload-endpoint")) continue;
    form.addEventListener("submit", (event) => {
      if (submitting.has(form)) {
        event.preventDefault();
        return;
      }
      submitting.add(form);
      window.setTimeout(() => submitting.delete(form), 2500);
    });
  }

  /* --- copy buttons ----------------------------------------- */

  const copyText = async (text) => {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    let ok = false;
    try {
      ok = document.execCommand("copy");
    } catch {
      ok = false;
    }
    area.remove();
    return ok;
  };

  for (const button of document.querySelectorAll("[data-copy]")) {
    button.addEventListener("click", async () => {
      const original = button.textContent;
      const value = button.getAttribute("data-copy") || "";
      const ok = await copyText(value).catch(() => false);
      button.textContent = ok ? "Copied" : "Copy failed";
      window.setTimeout(() => {
        button.textContent = original;
      }, 1600);
    });
  }

  /* --- uploads ---------------------------------------------- */

  const uploadImage = async (file, endpoint) => {
    const body = new FormData();
    body.append("file", file, file.name);
    if (csrfToken) body.append("_csrf", csrfToken);
    const response = await fetch(endpoint, {
      method: "POST",
      body,
      headers: { Accept: "application/json" },
      credentials: "same-origin",
    });
    let data = {};
    try {
      data = await response.json();
    } catch {
      data = {};
    }
    if (!response.ok || !data.ok) {
      throw new Error(data.error || `Upload failed (${response.status}).`);
    }
    return data;
  };

  for (const form of document.querySelectorAll("form[data-upload-endpoint]")) {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const input = form.querySelector('input[type="file"]');
      const status = form.querySelector(".upload-status");
      const file = input && input.files && input.files[0];
      if (!file) {
        setStatus(status, "Choose an image first.", true);
        return;
      }
      const buttons = form.querySelectorAll("button");
      for (const button of buttons) button.disabled = true;
      setStatus(status, "Uploading…");
      try {
        await uploadImage(file, form.getAttribute("data-upload-endpoint"));
        setStatus(status, "Uploaded. Reloading the media library…");
        window.setTimeout(() => {
          const url = new URL(window.location.href);
          url.searchParams.set("notice", "media-uploaded");
          window.location.assign(url.href);
        }, 500);
      } catch (error) {
        setStatus(status, error.message, true);
        for (const button of buttons) button.disabled = false;
      }
    });
  }

  /* Inline insertion from the post editor. This input is not inside a
     form, so it posts to the same endpoint with the page's CSRF token. */
  for (const input of document.querySelectorAll(".upload-input[data-upload-endpoint]")) {
    input.addEventListener("change", async () => {
      const file = input.files && input.files[0];
      if (!file) return;
      const panel = input.closest(".editor-tools");
      const note = panel && panel.querySelector(".toolbar-note");
      const original = note ? note.textContent : "";
      let status = panel && panel.querySelector(".editor-tools-status");
      if (!status && panel) {
        status = document.createElement("span");
        status.className = "toolbar-note editor-tools-status";
        status.setAttribute("role", "status");
        panel.appendChild(status);
      }
      if (note && status !== note) note.hidden = true;
      setStatus(status, "Uploading image…");
      try {
        const data = await uploadImage(file, input.getAttribute("data-upload-endpoint"));
        const editor = document.querySelector("#post-editor");
        const alt = (file.name || "image").replace(/\.[^.]+$/, "").replace(/[[\]]/g, "");
        const markdown = `![${alt}](${data.url})`;
        if (editor) {
          const start = editor.selectionStart ?? editor.value.length;
          const end = editor.selectionEnd ?? editor.value.length;
          const before = editor.value.slice(0, start);
          const after = editor.value.slice(end);
          const prefix = before && !before.endsWith("\n") ? "\n\n" : "";
          const suffix = after && !after.startsWith("\n") ? "\n\n" : "";
          editor.value = `${before}${prefix}${markdown}${suffix}${after}`;
          const cursor = before.length + prefix.length + markdown.length;
          editor.focus();
          editor.setSelectionRange(cursor, cursor);
          editor.dispatchEvent(new Event("input", { bubbles: true }));
        }
        setStatus(status, "Image inserted.");
        window.setTimeout(() => {
          setStatus(status, original);
          if (note) note.hidden = false;
          if (status) status.remove();
        }, 2500);
      } catch (error) {
        setStatus(status, error.message, true);
        if (note) note.hidden = false;
        input.value = "";
      }
    });
  }

  /* --- editor conveniences ---------------------------------- */

  const editor = document.querySelector("#post-editor");
  if (editor) {
    const form = editor.closest("form");
    const initial = editor.value;
    let dirty = false;

    const updateDirty = () => {
      dirty = editor.value !== initial;
    };

    editor.addEventListener("input", updateDirty);

    editor.addEventListener("keydown", (event) => {
      if (event.key === "Tab" && !event.altKey && !event.ctrlKey && !event.metaKey) {
        event.preventDefault();
        const start = editor.selectionStart;
        const end = editor.selectionEnd;
        if (start !== end && editor.value.slice(start, end).includes("\n")) {
          const block = editor.value.slice(start, end);
          const indented = block
            .split("\n")
            .map((line) => `  ${line}`)
            .join("\n");
          editor.setRangeText(indented, start, end, "select");
        } else {
          editor.setRangeText("  ", start, end, "end");
        }
        editor.dispatchEvent(new Event("input", { bubbles: true }));
        return;
      }

      const mod = event.metaKey || event.ctrlKey;
      if (!mod) return;

      if (event.key.toLowerCase() === "s" && !event.shiftKey) {
        event.preventDefault();
        const saveDraft = form && form.querySelector('button[name="publish"][value="false"]');
        if (saveDraft) saveDraft.click();
      }
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        const publish = form && form.querySelector('button[name="publish"][value="true"]');
        if (publish) publish.click();
      }
    });

    if (form) {
      form.addEventListener("submit", (event) => {
        const target = event.submitter && event.submitter.getAttribute("formtarget");
        if (target === "_blank") return;
        dirty = false;
      });
    }

    window.addEventListener("beforeunload", (event) => {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = "";
    });
  }

})();
