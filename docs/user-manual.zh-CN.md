# Folio 中文使用手册

Folio 是一个 macOS 桌面排版工具。你在 Folio 中编写 Markdown、选择 InDesign 模板并发布；Adobe InDesign 负责实际排版。发布后会得到可继续编辑的 INDD、PDF 和逐页 PNG 预览图。

在 Folio 菜单栏选择 **Help > 使用手册 / User Manual**，可以打开本手册的 GitHub 页面。

## 使用前准备

- macOS。
- 已安装并能正常启动 Adobe InDesign 2026。
- 一个已按本手册添加角色标签的 `.indd` 模板。
- 若文章含图片，图片文件应保存在本机，并能从 Markdown 文件所在目录通过相对路径找到。

首次让 Folio 控制 InDesign 时，macOS 可能询问是否允许自动化控制。选择允许；如果之前拒绝了，可在 **系统设置 > 隐私与安全性 > 自动化** 中允许 Folio 控制 InDesign。

## 发布一篇文章

1. 在 Folio 编辑区编写文章，或选择 **打开 Markdown** 载入已有 `.md` 文件。
2. 选择 **InDesign 模板 > 选择模板**，打开一个带角色标签的 `.indd` 文件。Folio 会调用 InDesign 扫描页面、框架、样式、字体和链接资源，并显示检查结果。
3. 修复预检中的错误。图片缺失、必需角色缺失或 Markdown 不支持的语法都会阻止发布；字体问题通常以警告显示。
4. 在 **输出位置** 选择一个新的 `.indd` 文件名。该路径及同名 PDF、预览目录都必须尚不存在。
5. 选择 **发布文章**。Folio 保存 Markdown、检查本地图片，再让 InDesign 创建可编辑文档、排版、导出 PDF 并生成每页预览。
6. 在 **页面预览** 中逐页检查结果，使用 **打开 INDD** 或 **打开 PDF** 在相应应用中查看成品。

例如输出文件 `稿件.indd` 会同时生成：

- `稿件.indd`：可在 InDesign 中继续编辑的文档。
- `稿件.pdf`：导出的 PDF。
- `稿件-preview/page-001.png` 等：每页一张 PNG 预览图。

Folio 不会用输出覆盖所选模板或已有成品。如果目标 INDD、PDF 或预览目录已存在，请另选一个新文件名。

## Markdown 格式

支持 frontmatter 中的 `title` 和 `subtitle`，以及标题、段落、引用、分隔线、粗体、斜体、链接、行内代码和独立成段的图片。

```markdown
---
title: "海边的灯塔"
subtitle: "一段关于归航的短记"
---

## 黄昏时分

海风从堤岸吹来。远处的灯塔亮起，像一个**安静而坚定**的信号。

灯塔管理员说：*每一艘船都有自己的归途。*

> 夜色落下以前，我们总能看见方向。

![海边灯塔](images/lighthouse.jpg "风暴过后的灯塔")

更多背景请看[港口档案](https://example.org/archive)，文件编号是 `LH-042`。

---

## 第二天清晨

清晨，第一艘船平安进港。
```

### 当前支持范围

- `title` 用于封面主标题。也可以不写 frontmatter 标题，改用文章正文第一个一级标题 `# 标题`；如果两者同时出现，第一个一级标题必须和 `title` 完全一致。推荐只选一种方式。
- 有 `subtitle` 时，模板必须同时有封面 `hero-subtitle` 文本框和 `Subtitle` 段落样式。
- 二级标题映射到 `SectionHeading`，三级及更深标题映射到 `Subheading`。文章第一个一级标题作为标题处理，不会重复放进正文。
- 普通段落需要 `Body`；引用需要 `Quote`；图片说明需要 `Caption`。
- 粗体或斜体文字需要 `Emphasis` 字符样式；链接需要 `Link` 字符样式；行内代码需要 `Code` 字符样式。
- 图片必须单独占一个段落。图片的替代文字写在 `![替代文字](路径)` 中，说明文字写在可选的 Markdown 图片标题中，例如 `![灯塔](images/lighthouse.jpg "灯塔说明")`。
- 图片路径按已保存的 Markdown 文件所在目录解析。例子中的 `images/lighthouse.jpg` 对应 `.md` 文件旁的 `images` 文件夹。
- 表格、列表、代码块、内嵌在文字中的图片、多段落引用目前不支持，会在预检中报错。引用块目前只支持一段文字。
- `author` 和 `language` 可以被解析，但当前版本不会将它们排进页面。

## 制作 InDesign 模板

### 角色标签如何工作

Folio 读取 InDesign 文档内的脚本标签键 `com.publisher.role`。标签值用于告诉 Folio 某个页面、文本框或样式承担什么作用，例如 `Cover` 或 `article-flow`。角色名称和大小写必须完全一致。

InDesign 的 **Window > Utilities > Script Label** 面板写入的是页面对象的普通 `label` 字段，并不能代替本手册使用的带命名空间标签。请用下面的 UXP `.idjs` 脚本写入角色标签。脚本标签保存在 `.indd` 内，保存并关闭文档后仍会保留。

### 示例模板的组成

以下示例按 A4 竖版、两页文档制作：

| 页面或对象 | 设计内容 | 角色标签 | 必需程度 |
| --- | --- | --- | --- |
| 第 1 页 | 封面排版 | `Cover` | 必需 |
| 封面标题文本框 | 放置文章标题，预留足够高度 | `hero-title` | 必需 |
| 封面副标题文本框 | 放置文章副标题 | `hero-subtitle` | 使用副标题时必需 |
| 封面图片框 | 封面主图；若提供角色，文章第一张图片会放入此处 | `hero-image` | 可选 |
| 第 2 页 | 正文版式，并应用正文母版页 | `Article` | 必需 |
| 正文母版页上的主文本框 | 正文排版区域，宽高应适合连续排文 | `article-flow` | 必需 |
| 段落、字符和对象样式 | 控制文章中的各种内容块 | 见下表 | 按文章内容需要 |

Folio 会在输出副本中保留封面、正文页以及可选的 `Ending` 页面；其他未标记页面不会作为模板页面保留。超出正文框的文字会由 InDesign 报告，Folio 再按正文页版式追加页面。

### 在 InDesign 中建立页面和版式

1. 选择 **File > New > Document**，创建一个适合项目的文档。此处以 A4 竖版为例。页边距、栏数、网格、出血和颜色都可按设计需要调整。
2. 保留两页：第一页作为封面，第二页作为正文起始页。需要页码、页眉或通栏装饰时，可将其放在正文母版页上。
3. 打开 **Window > Pages**。新建或使用一个正文母版页（InDesign 新版本中称为 Parent Page，旧版可能显示 Master Page）。在该母版页上创建一个主文本框，放在正文区域内；把此框设置为自动布局时容易延续的尺寸。你可以在框中加入少量占位文字进行视觉调试，正式使用前建议清空。
4. 将第 2 页应用到这个正文母版页。Folio 需要从母版上的 `article-flow` 框复制正文排版区域到输出文档中的正文页。
5. 回到第 1 页作为封面。建立标题文本框；如果文章会使用副标题，再建立副标题文本框。可按设计添加图片框、底色、装饰图形和其他静态元素。
6. 在 **Window > Layers** 展开图层，为需要由脚本识别的框设置易辨认且唯一的对象名称：`Hero Title`、`Hero Subtitle`、`Hero Image` 和 `Article Flow`。在图层面板中单击对象名称并修改。下面脚本会按这些名称查找框。
7. 在 **Window > Styles > Paragraph Styles** 创建段落样式；在 **Window > Styles > Character Styles** 创建字符样式；在 **Window > Styles > Object Styles** 创建对象样式。建议统一使用下表中的英文样式名，样式名区分大小写。
8. 保存 `.indd` 文件，然后执行下面的角色标记脚本。脚本按文档页序把第 1 页标记为封面，第 2 页标记为正文；如果页序不同，请先调整页序或修改脚本页索引。
9. 保存文档，再回 Folio 选择该模板。查看模板扫描结果，确保没有缺少角色或重复角色的错误。

### 样式角色

推荐将样式直接创建在对应样式面板的根层级，并使用下列简单名称，方便脚本按名称找到它们。

| InDesign 样式类型 | 建议的样式名 | 角色值 | 用途 |
| --- | --- | --- | --- |
| 段落 | `ArticleTitle` | `ArticleTitle` | 封面标题；必需 |
| 段落 | `Subtitle` | `Subtitle` | 封面副标题；有副标题内容时需要 |
| 段落 | `SectionHeading` | `SectionHeading` | 正文二级标题 |
| 段落 | `Subheading` | `Subheading` | 正文三级及更深标题 |
| 段落 | `Body` | `Body` | 正文段落；必需 |
| 段落 | `Quote` | `Quote` | Markdown 引用 |
| 段落 | `Caption` | `Caption` | 图片说明 |
| 字符 | `Emphasis` | `Emphasis` | 粗体和斜体文字 |
| 字符 | `Link` | `Link` | 链接文字 |
| 字符 | `Code` | `Code` | 行内代码 |
| 对象 | `InlineImage` | `InlineImage` | 正文内图片对象样式；文章使用图片时需要 |
| 对象 | `HeroImage` | `HeroImage` | 封面图片对象样式；可选 |

### 角色标记脚本

保存并运行下面的脚本。它会在当前活动文档中按页序标记页面，并按名称查找文本框及样式。如果你的对象或样式改了名称，请同步修改脚本中的名称。

```javascript
const { app } = require("indesign");

const ROLE_KEY = "com.publisher.role";
const document = app.activeDocument;

function labelByName(collection, name, role) {
  const target = collection.itemByName(name);
  if (!target || target.isValid === false) {
    throw new Error("Could not find InDesign object named: " + name);
  }
  target.insertLabel(ROLE_KEY, role);
}

function labelStyles(collection, definitions) {
  for (const definition of definitions) {
    labelByName(collection, definition.name, definition.role);
  }
}

if (!document || document.pages.length < 2) {
  throw new Error("Open a template document with a Cover page and an Article page first.");
}

document.pages.item(0).insertLabel(ROLE_KEY, "Cover");
document.pages.item(1).insertLabel(ROLE_KEY, "Article");

labelByName(document.allPageItems, "Hero Title", "hero-title");
labelByName(document.allPageItems, "Hero Subtitle", "hero-subtitle");
labelByName(document.allPageItems, "Article Flow", "article-flow");

const heroImage = document.allPageItems.itemByName("Hero Image");
if (heroImage && heroImage.isValid !== false) {
  heroImage.insertLabel(ROLE_KEY, "hero-image");
}

labelStyles(document.paragraphStyles, [
  { name: "ArticleTitle", role: "ArticleTitle" },
  { name: "Subtitle", role: "Subtitle" },
  { name: "SectionHeading", role: "SectionHeading" },
  { name: "Subheading", role: "Subheading" },
  { name: "Body", role: "Body" },
  { name: "Quote", role: "Quote" },
  { name: "Caption", role: "Caption" }
]);

labelStyles(document.characterStyles, [
  { name: "Emphasis", role: "Emphasis" },
  { name: "Link", role: "Link" },
  { name: "Code", role: "Code" }
]);

labelStyles(document.objectStyles, [
  { name: "InlineImage", role: "InlineImage" },
  { name: "HeroImage", role: "HeroImage" }
]);

console.log("Folio roles were added to: " + document.name);
```

在 InDesign 中，打开 **Window > Utilities > Scripts**。将 `.idjs` 文件放进该面板的用户脚本目录；可以从 Scripts 面板的用户脚本项目菜单中打开脚本所在文件夹。先激活准备好的模板文档，再在 Scripts 面板中双击该脚本。运行完成后保存模板。

这是一个面向上表名称的示例脚本。若 InDesign 报“找不到对象或样式”，请检查对象是否确实位于当前文档/母版页、名称是否完全一致，以及段落/字符/对象样式类型是否正确。不要把角色值写到普通的 **Script Label** 面板中。

## 常见问题

### 模板扫描失败

确认模板至少有唯一的 `Cover` 和 `Article` 页面角色；封面必须有 `hero-title` 文本框；正文页或其母版页必须有且仅有一个 `article-flow` 文本框。标题、二级标题和正文的 `ArticleTitle`、`SectionHeading`、`Body` 样式是必需的。角色名大小写必须一致。

### 副标题无法发布

若 Markdown 中含 `subtitle`，封面需要 `hero-subtitle` 文本框和 `Subtitle` 段落样式。若不打算排副标题，可从 frontmatter 中移除该字段。

### 图片未找到

先保存 Markdown 文件，再确认图片文件在本机存在。路径相对于 Markdown 文件所在目录，例如 `images/photo.jpg`。网络 URL 和 `data:` URL 不受支持。

### 字体警告或排版和预期不同

检查 InDesign 是否能找到模板使用的字体。Folio 会把文章内容放入模板角色样式，并让 InDesign 决定换行和页面构成；缺失字体可能被替换。发布后可用 **打开 INDD** 在 InDesign 中微调字距、断行、图文关系和装饰细节。

### InDesign 无法连接

确认 InDesign 2026 已安装并至少成功启动一次。首次运行时在 macOS 自动化授权提示中允许 Folio 控制 InDesign；若之前拒绝，前往 **系统设置 > 隐私与安全性 > 自动化** 修改授权后重启应用。

### 文章太长

Folio 会读取 InDesign 的溢出状态，并追加正文页后重新排版。若文章结构或模板流框有问题，预检会列出错误；应用也有页面数量上限。

## 当前版本限制

- 仅支持本机 macOS 和 InDesign 2026。
- 模板角色必须在 InDesign 中预先标记；Folio 目前没有模板角色编辑器。
- 模板应只依赖 Cover、Article 和可选 Ending 页面角色。输出会从模板另存为新文档。
- Markdown 表格、列表、代码块、内嵌图片和复杂多段落引用暂不支持。
- Folio 提供的页面 PNG 用于检查结果，不替代 InDesign 中的印前校对。

## 参考

- [Adobe InDesign：使用脚本自动化工作流](https://helpx.adobe.com/indesign/desktop/automation-and-scripting/document-automation/automate-workflows-with-scripts.html)
- [Adobe InDesign UXP：创建并运行第一个脚本](https://developer.adobe.com/indesign/uxp/scripts/getting-started/)
- [Adobe InDesign UXP DOM：PageItems](https://developer.adobe.com/indesign/uxp/dom/api/p/page-items/)
