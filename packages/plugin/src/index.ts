import { stableJson } from "@publisher/contracts";
import { parseArticle } from "@publisher/core";

const articleInput = document.querySelector<HTMLTextAreaElement>("#article");
const validateButton = document.querySelector<HTMLButtonElement>("#validate");
const result = document.querySelector<HTMLElement>("#result");

validateButton?.addEventListener("click", () => {
  if (!articleInput || !result) return;
  const parsed = parseArticle(articleInput.value);
  result.textContent = stableJson(parsed);
});
