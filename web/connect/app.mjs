import { buildPair, EXAMPLES } from "./pairing.mjs";

const copy = {
  en: {
    pageTitle: "Set up two Codex tasks · ThreadMesh", skip: "Skip to setup", language: "Language",
    title: "Let two tasks keep each other informed.",
    intro: "Prepare two setup prompts. Paste one into each existing Codex task, then continue your work.",
    scope: "This page only prepares text. It does not connect tasks, read chats or send messages.",
    tasksTitle: "Choose your two tasks", taskA: "Task A link", taskB: "Task B link",
    linkHelp: "Open each task in Codex and copy its chat deep link: ⌘⌥L on macOS, Ctrl+Alt+L on Windows.",
    official: "Official shortcuts", localOnly: "Use two different local Codex tasks. Copy the whole link, not a shared-chat snapshot. You do not need to find an ID.",
    topicTitle: "What may they share?", topicLabel: "Allowed shared topic", topicPlaceholder: "For example: approved product names and free-plan limits, not pricing changes.",
    topicHelp: "Keep this specific (up to 1,200 characters). Earlier decisions and each task's own permissions still apply.", examples: "Topic examples",
    modeTitle: "Choose how advice is handled", automatic: "Let the model send relevant advice",
    automaticHelp: "After both setups, it may contact the selected peer at a useful checkpoint. An idle check cannot eliminate races with new input.",
    review: "Keep suggestions here for my review", reviewHelp: "No automatic peer messages. Review advice before separately authorizing a send.",
    consent: "I chose these two tasks and this topic. I understand this is model-followed guidance, not enforced isolation, and the page does not enable collaboration.",
    generate: "Prepare setup prompts", clear: "Clear", formHint: "Add both links, a shared topic and your consent to continue.",
    ready: "Ready to prepare text. Nothing will be sent.",
    resultsTitle: "Prompts ready. Nothing has been sent.",
    resultsHelp: "Copy each prompt, open its task and paste it there. Wait for both tasks to confirm setup before continuing ordinary work.",
    inTaskA: "Paste into task A", inTaskB: "Paste into task B", promptA: "Setup prompt for task A", promptB: "Setup prompt for task B",
    copy: "Copy prompt", openA: "Open task A", openB: "Open task B", copying: "Copying…", copied: "Copied. Paste it into the matching task.",
    copyFailed: "Clipboard unavailable. The prompt is selected; use your device's Copy command, then paste it into the matching task.",
    copyPending: "A copy is in progress. Wait before preparing or copying another prompt.",
    staleClipboard: "Inputs changed during copying. Your system clipboard may still contain the old prompt. Prepare and copy the updated prompt before pasting; this page has not cleared your clipboard.",
    changed: "Inputs changed. Previous prompts were cleared; prepare them again.", cleared: "Inputs and prompts cleared.",
    notVerified: "A valid link format does not prove a task is reachable or has quota. Codex must confirm the selected task and available native tools. If it cannot, keep collaboration off.",
    openHelp: "Opening a link only navigates to Codex; it does not paste or send. If the browser cannot open Codex, switch to the selected task yourself. To stop both directions, say “Stop ThreadMesh collaboration” in both tasks.",
    privacy: "Your inputs stay in this page's memory. No account, tracking, backend or saved form data. Reloading clears the page.",
    guide: "Workflow & limits", source: "Source on GitHub", resources: "Resources",
    invalid: "Check that both links are different local Codex chat links, the topic is filled in and consent is selected.",
    invalid_link: "Paste two complete local chat links in the form codex://threads/<thread-id>. Shared snapshot links do not work here.",
    same_task: "These links identify the same task. Choose a different task for B.",
    invalid_topic: "Add a specific shared topic, up to 1,200 characters, without control characters.",
    consent_required: "Review the scope and select the confirmation checkbox before preparing prompts.",
  },
  zh: {
    pageTitle: "设置两个 Codex 任务 · ThreadMesh", skip: "跳到设置", language: "语言",
    title: "让两个任务主动交流，不再靠你转述。",
    intro: "生成两份设置提示，分别粘贴到已有的 Codex 任务中，然后正常工作。",
    scope: "这个页面只生成文字，不会连接任务、读取聊天或发送消息。",
    tasksTitle: "选择你的两个任务", taskA: "任务 A 的链接", taskB: "任务 B 的链接",
    linkHelp: "在 Codex 中分别打开任务，复制聊天深链：macOS 按 ⌘⌥L，Windows 按 Ctrl+Alt+L。",
    official: "官方快捷键说明", localOnly: "请选择两个不同的本地 Codex 任务。复制完整聊天深链，不是分享聊天快照，无需查找 ID。",
    topicTitle: "允许它们交流什么？", topicLabel: "允许交流的话题", topicPlaceholder: "例如：已批准的产品名称和免费方案限制，不包括付费价格变更。",
    topicHelp: "范围越具体越好，最多 1,200 个字符。双方仍须遵守此前的约定和各自的权限。", examples: "话题示例",
    modeTitle: "选择如何处理建议", automatic: "让模型自主发送相关建议",
    automaticHelp: "双方设置后，模型可在有用的工作节点联系选中的同伴。空闲检查不能完全避免与新输入竞争。",
    review: "先留在当前任务，等我审阅", reviewHelp: "不自动给同伴发消息。审阅建议后，再单独授权发送。",
    consent: "这两个任务和话题由我选择。我理解这是模型遵循的指导，不是强制隔离；本页面不会启用协作。",
    generate: "生成设置提示", clear: "清空", formHint: "填写两个链接、交流话题，并勾选确认后即可生成。", ready: "可以生成提示。不会发送任何消息。",
    resultsTitle: "提示已生成，尚未发送。", resultsHelp: "分别复制提示，打开对应任务并粘贴发送。等两个任务各自确认设置后，再正常工作。",
    inTaskA: "粘贴到任务 A", inTaskB: "粘贴到任务 B", promptA: "任务 A 的设置提示", promptB: "任务 B 的设置提示",
    copy: "复制提示", openA: "打开任务 A", openB: "打开任务 B", copying: "正在复制…", copied: "已复制，请粘贴到对应任务。",
    copyFailed: "无法使用剪贴板。已选中提示，请用设备的“复制”命令手动复制，再粘贴到对应任务。",
    copyPending: "正在复制，请等待这次复制结束后再生成或复制其他提示。",
    staleClipboard: "复制期间输入已修改。系统剪贴板可能仍有旧提示，请重新生成并复制最新提示后再粘贴；本页面没有清空你的剪贴板。",
    changed: "输入已修改，旧提示已清除，请重新生成。", cleared: "输入和提示已清空。",
    notVerified: "链接格式正确，不代表任务可访问或还有额度。Codex 必须核实选中的任务和原生工具；无法确认时，保持协作关闭。",
    openHelp: "打开链接只会跳转到 Codex，不会粘贴或发送。如果浏览器打不开 Codex，请自行切换到选中的任务。要停止双向协作，请分别对两个任务说“停止 ThreadMesh 协作”。",
    privacy: "输入只留在本页面内存中。不需要账号，没有追踪、后台或表单存储；刷新页面即清空。",
    guide: "使用说明与限制", source: "GitHub 源码", resources: "相关链接",
    invalid: "请确认是两个不同的本地 Codex 聊天深链，并填写话题、勾选确认。",
    invalid_link: "请粘贴两条完整的 codex://threads/<thread-id> 本地聊天深链，不能使用分享快照链接。",
    same_task: "这两个链接指向同一个任务，请为 B 选择另一个任务。",
    invalid_topic: "请填写具体的交流话题，最多 1,200 个字符，不能包含控制字符。",
    consent_required: "请审阅范围并勾选确认后，再生成提示。",
  },
};

const $ = (id) => document.getElementById(id);
const form = $("pair-form");
const results = $("results");
const languagePicker = $("language");
let language = navigator.language?.toLowerCase().startsWith("zh") ? "zh" : "en";
let generation = 0;
let currentPair = null;
let touched = false;
let pendingCopy = false;
let staleClipboard = false;

function values() {
  return { a: $("task-a").value, b: $("task-b").value, topic: $("topic").value,
    mode: form.querySelector('input[name="advice-mode"]:checked').value,
    consent: $("consent").checked, language };
}

function clearOutput() {
  generation += 1;
  currentPair = null;
  results.hidden = true;
  for (const side of ["a", "b"]) {
    $(`prompt-${side}`).value = "";
    $(`open-${side}`).removeAttribute("href");
    $(`copy-status-${side}`).textContent = "";
    $(`copy-status-${side}`).classList.remove("error");
    $(`copy-${side}`).disabled = true;
  }
}

function validate() {
  let valid = false;
  let errorCode = "";
  try { buildPair({ ...values(), consent: true }); valid = $("consent").checked; }
  catch (error) { errorCode = error.message; }
  $("generate").disabled = pendingCopy || !valid;
  for (const side of ["a", "b"]) $(`copy-${side}`).disabled = pendingCopy || currentPair === null;
  const errorText = touched && errorCode ? (copy[language][errorCode] || copy[language].invalid) : "";
  $("field-error").textContent = [errorText, staleClipboard ? copy[language].staleClipboard : ""].filter(Boolean).join(" ");
  $("form-hint").textContent = pendingCopy ? copy[language].copyPending : valid ? copy[language].ready : copy[language].formHint;
  return valid && !pendingCopy;
}

function invalidate() {
  const hadOutput = currentPair !== null;
  clearOutput();
  validate();
  if (hadOutput && !staleClipboard) $("field-error").textContent = copy[language].changed;
}

function renderLanguage() {
  document.documentElement.lang = language === "zh" ? "zh-CN" : "en";
  document.title = copy[language].pageTitle;
  languagePicker.value = language;
  document.querySelectorAll("[data-i18n]").forEach((node) => { node.textContent = copy[language][node.dataset.i18n]; });
  $("topic").placeholder = copy[language].topicPlaceholder;
  $("examples").setAttribute("aria-label", copy[language].examples);
  document.querySelector("footer nav").setAttribute("aria-label", copy[language].resources);
  $("guide-link").href = `https://github.com/fyaic/threadmesh/blob/main/docs/${language === "zh" ? "zh-CN" : "06-guides"}/codex-native-tasks.md`;
  $("examples").replaceChildren(...EXAMPLES[language].map((example) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = example.label;
    button.addEventListener("click", () => { $("topic").value = example.topic; invalidate(); $("topic").focus(); });
    return button;
  }));
  invalidate();
}

form.addEventListener("input", invalidate);
form.addEventListener("change", invalidate);
form.addEventListener("focusout", (event) => {
  if (["task-a", "task-b", "topic"].includes(event.target.id) && event.target.value.trim()) { touched = true; validate(); }
});
languagePicker.addEventListener("change", () => { language = languagePicker.value; renderLanguage(); });

form.addEventListener("submit", (event) => {
  event.preventDefault();
  touched = true;
  if (!validate()) return;
  try {
    currentPair = buildPair(values());
    generation += 1;
    for (const side of ["a", "b"]) {
      $(`prompt-${side}`).value = currentPair[side].prompt;
      $(`open-${side}`).href = currentPair[side].target;
      $(`copy-status-${side}`).textContent = "";
      $(`copy-status-${side}`).classList.remove("error");
    }
    results.hidden = false;
    validate();
    $("results-heading").focus({ preventScroll: true });
    results.scrollIntoView({ block: "start", behavior: "instant" });
  } catch {
    clearOutput();
    $("field-error").textContent = copy[language].invalid;
  }
});

for (const side of ["a", "b"]) {
  $(`copy-${side}`).addEventListener("click", async () => {
    if (!currentPair || pendingCopy) return;
    const attempt = generation;
    const prompt = currentPair[side].prompt;
    const status = $(`copy-status-${side}`);
    pendingCopy = true;
    validate();
    status.textContent = copy[language].copying;
    status.classList.remove("error");
    try {
      if (!navigator.clipboard?.writeText) throw new Error("clipboard_unavailable");
      await navigator.clipboard.writeText(prompt);
      if (generation === attempt) {
        staleClipboard = false;
        status.textContent = copy[language].copied;
      }
    } catch {
      if (generation === attempt) {
        status.classList.add("error");
        status.textContent = copy[language].copyFailed;
        $(`prompt-${side}`).focus();
        $(`prompt-${side}`).select();
      }
    } finally {
      if (generation !== attempt) staleClipboard = true;
      pendingCopy = false;
      validate();
    }
  });
}

$("clear").addEventListener("click", () => {
  form.reset();
  touched = false;
  clearOutput();
  validate();
  if (!staleClipboard) $("field-error").textContent = copy[language].cleared;
  $("task-a").focus();
});

// Do not retain restored form values or generated prompts after history navigation.
window.addEventListener("pageshow", () => {
  form.reset(); touched = false; clearOutput(); validate();
});
form.reset();
renderLanguage();
