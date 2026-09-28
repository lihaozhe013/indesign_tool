import type { Diagnostic } from "@folio/contracts";
import type { RoleResolution } from "@folio/template";
import type { Translate } from "./diagnostics.js";
import { translateDiagnostic } from "./diagnostics.js";

export function buildChineseReport(
  t: Translate,
  articleTitle: string,
  resolutions: RoleResolution[],
  diagnostics: Diagnostic[],
  exports: { pdfCreated: boolean; previewPages: number[] }
): string {
  const lines = [
    "Folio 发布检查报告",
    `文章：${articleTitle}`,
    `生成时间：${new Date().toLocaleString("zh-CN")}`,
    "",
    "模板角色自动识别："
  ];
  for (const resolution of resolutions) {
    const selected = resolution.selected;
    if (!selected) {
      lines.push(`- ${resolution.role}：没有找到候选对象，将按默认布局继续。`);
      continue;
    }
    lines.push(`- ${resolution.role}：${selected.name}；匹配分数 ${selected.score}；${t(`app.template.confidence.${resolution.confidence}`)}（${selected.matchedBy}）。`);
    if (resolution.candidates.length > 1) {
      lines.push(`  其他候选：${resolution.candidates.slice(0, 3).map((candidate) => `${candidate.name}（${candidate.score}）`).join("、")}`);
    }
  }
  lines.push("", "检查项目：");
  if (!diagnostics.length) lines.push("- 未发现需要检查的问题。");
  for (const item of diagnostics) {
    const detail = translateDiagnostic(t, item);
    const path = item.path ? `；位置：${item.path}` : "";
    lines.push(`- [${item.severity}] ${detail === item.message ? `需要检查：${item.code}${path}；详细信息：${item.message}` : detail + path}`);
  }
  lines.push(
    "",
    "导出尝试：",
    `- PDF：${exports.pdfCreated ? "已完成导出请求" : "未生成或导出失败"}`,
    `- 页面预览：${exports.previewPages.length ? `已完成第 ${exports.previewPages.join("、")} 页的导出请求` : "未生成"}`,
    "- INDD 与实际成果文件以报告末尾的最终文件清单为准。",
    "",
    "请在 InDesign 中打开 INDD，按以上提示检查排版、字体和图片。模板原文件未被修改。"
  );
  return lines.join("\n");
}
