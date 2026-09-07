for (const block of document.querySelectorAll(".guide pre")) {
  const panel = document.createElement("div");
  panel.className = "code-panel";

  const toolbar = document.createElement("div");
  toolbar.className = "code-toolbar";

  const label = document.createElement("span");
  label.textContent = codeLabel(block.textContent || "");

  const button = document.createElement("button");
  button.className = "copy-code";
  button.type = "button";
  button.textContent = "Copy";
  button.setAttribute("aria-label", `Copy ${label.textContent} code`);

  toolbar.append(label, button);
  block.before(panel);
  panel.append(toolbar, block);

  button.addEventListener("click", async () => {
    try {
      await copyText(block.textContent || "");
      button.textContent = "Copied";
      button.classList.add("copy-success");
      window.setTimeout(() => {
        button.textContent = "Copy";
        button.classList.remove("copy-success");
      }, 2_000);
    } catch {
      button.textContent = "Select code";
      window.getSelection()?.selectAllChildren(block);
    }
  });
}

async function copyText(value) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const field = document.createElement("textarea");
  field.value = value;
  field.setAttribute("readonly", "");
  field.style.position = "fixed";
  field.style.opacity = "0";
  document.body.append(field);
  field.select();
  const copied = document.execCommand("copy");
  field.remove();
  if (!copied) throw new Error("Clipboard copy is unavailable.");
}

function codeLabel(value) {
  if (value.includes("Invoke-RestMethod")) return "PowerShell";
  if (value.includes("from openai import")) return "Python";
  if (value.includes("model_provider")) return "Codex TOML";
  if (value.includes("import OpenAI")) return "TypeScript";
  if (value.includes("ANTHROPIC_BASE_URL")) return "Shell";
  return "Terminal";
}
