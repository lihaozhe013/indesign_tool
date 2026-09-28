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

## 给设计师的 InDesign 模板制作与交付说明

本节可以直接发给设计师。按下面的做法交付一个 `.indd` 模板文件，Folio 才能把不同文章自动排进同一套版式。设计师只需使用 InDesign，不需要了解程序；文中提供的脚本只需原样复制、保存并运行。

### 先理解：哪些内容会被替换

把模板想成一份已经设计好、但尚未填入正式文章的 InDesign 文档：

- **固定内容**是底色、线条、页眉、页码、品牌标识等。它们会随版式保留，不由 Folio 改写。
- **可变内容**是每篇文章的标题、副标题、正文和图片。设计师给这些内容留出框，Folio 发布时会把实际内容放进去。
- **占位框**就是预留位置的 InDesign 文本框或图片框。它不是要在页面上印出“标题占位符”这几个字。例如封面留一个空文本框，Folio 会把文章标题填进这个框。可以暂时输入样稿查看效果，但交付前要清空。
- **样式**是 InDesign 中保存的一套文字或图片外观设置。Folio 负责选择合适的样式，字号、字体、颜色、段前段后距离等由设计师设定。

Folio 需要识别这些框和样式，因此每个关键对象有两种名称：一是在 InDesign 图层面板中看到的**对象名称**，供下面的脚本定位；二是保存在 `.indd` 内、平时看不到的**角色标签**，供 Folio 识别。例如对象名称 `Hero Title` 对应角色 `hero-title`。大小写、空格和连字符都要照表填写。

### 开工前与委托方确认

确认成品尺寸、横竖版、是否需要出血、品牌颜色、封面是否用图、正文是否需要页码，以及预期的最长标题和副标题。请拿一篇真实文章和至少一张真实尺寸的图片试排。下面以 **A4 竖版、两页起稿、无对页** 为操作示例；尺寸和视觉风格可以改，角色结构不要改。

本指南的交付目标涵盖标题、副标题、正文层级、引用、强调、链接、行内代码和带说明的图片。即使某篇文章暂时不用其中一种内容，也把相应样式建好，后续文章才能直接套用。Folio 当前只处理这里说明的文章结构；不要把列表、表格、复杂多栏流程或其他自动填充区域作为交付前提。

### 模板中必须准备的页面和框

请从一份新的或确认没有旧 Folio 标签的文档开始。文档只有两个**普通文档页**：第 1 页是封面，第 2 页是正文起始页。InDesign 的 Parent Page（旧称 Master Page，以下称“父版”）不算这两页。

| 放在何处 | 在 InDesign 中做什么 | 图层面板中的对象名称 | Folio 角色 |
| --- | --- | --- | --- |
| 第 1 页 | 封面页 | 无需命名页面 | `Cover` |
| 第 1 页 | 一个空的主标题**文本框** | `Hero Title` | `hero-title` |
| 第 1 页 | 一个空的副标题**文本框** | `Hero Subtitle` | `hero-subtitle` |
| 第 1 页 | 一个空的矩形**图片框** | `Hero Image` | `hero-image` |
| 第 2 页 | 正文第一页 | 无需命名页面 | `Article` |
| 第 2 页 | 一个空的正文主**文本框** | `Article Flow` | `article-flow` |

这份完整交付示例和下方脚本要求保留副标题框与封面图片框。Folio 的最低要求是封面、正文页、主标题框、正文主框以及必需样式；但文章一旦有副标题，就必须有副标题框和 `Subtitle` 样式。产品本身允许不设置封面图片框，但本指南的现成脚本按有封面图片框的版本检查，不要只删掉图片框后照用脚本。若保留封面图片框，Folio 会把文章的**第一张图片**同时放在封面和正文中，并不会从正文移走该图。

正文主框只做**一个**，放在第 2 个普通文档页上。不要同时在正文父版和第 2 页各放一个同名主框，也不要预先把它连到其他文本框。文章超出一页时，Folio 会自动添加正文页，并在新页上建立同位置的新正文框。固定的页眉、页码、色块和装饰应放在应用于第 2 页的正文父版上，这样新增正文页才会重复这些元素。只画在第 2 页上的装饰不会自动复制到后续正文页。

### 在 InDesign 中逐步制作

1. 选择 **File > New > Document**。把页数设为 **2**、关闭 **Facing Pages**（对页），示例尺寸选 A4 竖版。按实际需求设置边距、出血和颜色模式。先保存为一个新 `.indd` 文件，例如 `Folio-Article-Template.indd`。
2. 打开 **Window > Pages**。第 1 页保留作封面。在第 2 页使用的父版上绘制需要在每一页正文重复出现的固定设计，例如页码和页眉；把这个父版应用到第 2 页。不要在父版上再建立 `Article Flow` 主框。
3. 回到第 1 页，建立主标题文本框、副标题文本框和矩形图片框。标题框要留出长标题换行后的空间，副标题框也要容纳实际样稿；不要只按“标题”两个示例字决定高度。图片框可以设置裁切和贴合方式，检查横图、竖图放入时的效果。
4. 在第 2 页的正文安全区域建立一个主文本框。给正文留够页边距，并考虑页眉页脚、图片和说明文字会占用的空间。正文从这个框开始向后续页面流动。不要把整篇样稿留在框内，也不要把框放到页面外的工作区。
5. 打开 **Window > Layers**，展开对象，分别把四个框重命名为上表中的 `Hero Title`、`Hero Subtitle`、`Hero Image`、`Article Flow`。每个名称只能出现一次。其他装饰对象不要使用这些名称。
6. 按下一节建立样式，实际设置字体、字号、行距、颜色、段落间距和图片外观。样式需要存在于这份文档中；仅把文字手动改成某种外观、却没有建立对应样式，不符合要求。
7. 清空四个可变内容框中的样稿文字和样稿图片，检查封面与正文的固定元素仍完整。再保存一次。
8. 按“写入角色标签”运行一次脚本，保存、关闭并重新打开 `.indd`。最后按“验收与交付”检查。

### 需要建立的 12 个样式

打开 **Window > Styles > Paragraph Styles**、**Character Styles** 和 **Object Styles**。按表建立样式，放在各面板的顶层，不要放进同名样式组。左栏是样式类型，名称要逐字相同；右栏说明何时会用到。下面的脚本会把同名角色写入这些样式。

| 样式类型 | 样式名称与角色 | 设计用途 |
| --- | --- | --- |
| 段落 | `ArticleTitle` | 封面主标题；必需，检查长标题是否溢出。 |
| 段落 | `Subtitle` | 封面副标题；文章有副标题时必需。 |
| 段落 | `SectionHeading` | 正文一级小节标题，即文章中的 `##` 标题；必需。 |
| 段落 | `Subheading` | 更深一级的小标题，即 `###` 及更深标题。 |
| 段落 | `Body` | 普通正文；必需。 |
| 段落 | `Quote` | 单段引文。 |
| 段落 | `Caption` | 图片下方的说明文字。 |
| 字符 | `Emphasis` | 粗体与斜体共用一种强调样式，请设计一个两者都适用的外观。 |
| 字符 | `Link` | 链接文字的外观；不要假设 PDF 一定会生成可点击链接。 |
| 字符 | `Code` | 正文中少量代码或编号的外观。 |
| 对象 | `InlineImage` | 插入正文的图片框外观。 |
| 对象 | `HeroImage` | 封面图片框外观。 |

设置 `Body`、标题和说明样式时，选用本机可用、能显示所需中英文字符的字体，并确认最终使用电脑也有这些字体。尽量在样式中保存设计参数，不要依赖手动覆盖。图片对象样式应适合真实图片的比例；太大的正文图片会挤占正文空间。链接、字体和样式名称都应在最终文件里保持有效。

### 写入角色标签：复制一次即可运行的脚本

“角色标签”是文档内部的识别信息，类似给每个框贴一张看不见的用途卡片。Folio 读取的标签键固定为 `com.publisher.role`。InDesign 的 **Window > Utilities > Script Label** 面板只填写普通可见标签，**不能代替**这里的角色标签。下面的脚本会把角色写入当前打开的模板。它会先检查两页、四个框和 12 个样式是否都能唯一找到；有缺项时会报错，不会写入部分标签。

1. 在 macOS 的“文本编辑”中新建文档，选择 **Format > Make Plain Text**（纯文本），把下方代码框内的内容**原样**复制进去。不要复制代码框外的文字，也不要改英文大小写。
2. 保存为 `Folio-Label-Template.idjs`，确认扩展名是 `.idjs`，不是 `.idjs.txt`。如果“文本编辑”询问是否保留 `.idjs` 扩展名，选择保留。
3. 在 InDesign 中打开 **Window > Utilities > Scripts**。在 **User**（用户）脚本文件夹上右键，选择 **Reveal in Finder**（在 Finder 中显示）。把刚保存的 `.idjs` 文件放进该文件夹；不要猜测系统里的脚本目录名称。
4. 打开并激活要交付的模板 `.indd`，确认前两页和对象名称正确。在 Scripts 面板双击 `Folio-Label-Template.idjs`。如果出现英文错误，按错误中提示的名称检查页面、框或样式，再运行一次。
5. 运行后**保存模板**。关闭 InDesign 文档，再重新打开这份 `.indd`，检查标签已随文件保留。

```javascript
const { app } = require("indesign");

const ROLE_KEY = "com.publisher.role";
const document = app.activeDocument;

function items(collection) {
  const result = [];
  for (let index = 0; index < collection.length; index += 1) {
    result.push(typeof collection.item === "function" ? collection.item(index) : collection[index]);
  }
  return result;
}

function named(collection, name) {
  const matches = items(collection).filter((item) => String(item.name) === name);
  if (matches.length !== 1) {
    throw new Error("Expected exactly one object named " + name + "; found " + matches.length);
  }
  return matches[0];
}

if (!document || document.pages.length !== 2) {
  throw new Error("Open a two-page template document before running this script.");
}

const cover = document.pages.item(0);
const article = document.pages.item(1);
const frames = [
  { object: named(document.textFrames, "Hero Title"), role: "hero-title", page: cover },
  { object: named(document.textFrames, "Hero Subtitle"), role: "hero-subtitle", page: cover },
  { object: named(document.allPageItems, "Hero Image"), role: "hero-image", page: cover },
  { object: named(document.textFrames, "Article Flow"), role: "article-flow", page: article }
];

for (const frame of frames) {
  if (!frame.object.parentPage || frame.object.parentPage.id !== frame.page.id) {
    throw new Error("Frame " + frame.object.name + " is not on the expected document page.");
  }
}
if (String(frames[2].object.constructor.name) !== "Rectangle") {
  throw new Error("Hero Image must be a rectangle image frame.");
}

const styles = [
  { object: named(document.allParagraphStyles, "ArticleTitle"), role: "ArticleTitle" },
  { object: named(document.allParagraphStyles, "Subtitle"), role: "Subtitle" },
  { object: named(document.allParagraphStyles, "SectionHeading"), role: "SectionHeading" },
  { object: named(document.allParagraphStyles, "Subheading"), role: "Subheading" },
  { object: named(document.allParagraphStyles, "Body"), role: "Body" },
  { object: named(document.allParagraphStyles, "Quote"), role: "Quote" },
  { object: named(document.allParagraphStyles, "Caption"), role: "Caption" },
  { object: named(document.allCharacterStyles, "Emphasis"), role: "Emphasis" },
  { object: named(document.allCharacterStyles, "Link"), role: "Link" },
  { object: named(document.allCharacterStyles, "Code"), role: "Code" },
  { object: named(document.allObjectStyles, "InlineImage"), role: "InlineImage" },
  { object: named(document.allObjectStyles, "HeroImage"), role: "HeroImage" }
];

cover.insertLabel(ROLE_KEY, "Cover");
article.insertLabel(ROLE_KEY, "Article");
for (const frame of frames) frame.object.insertLabel(ROLE_KEY, frame.role);
for (const style of styles) style.object.insertLabel(ROLE_KEY, style.role);

console.log("Folio template roles added to " + document.name);
```

### 验收与交付

**先做结构检查。** 在 Folio 中选择 **InDesign 模板 > 选择模板**，打开刚保存的 `.indd`。模板应显示“已就绪”，预检中没有模板错误。如果文档能被扫描，并不代表长文字、图片或导出效果已经验收；还必须做一次实际发布。当前项目的真实设计模板仍需通过这项主机验收。

**再做内容检查。** 可以请委托方在 Folio 中完成。先用一篇短文章，确认封面标题、副标题和正文小节都进入正确位置；再用一篇比一页长的文章，确认后续正文页的页眉页码、边距和正文框保持一致，文字没有丢失或压到装饰上。最后加入一张本机图片和图片说明，检查封面、正文、PDF 和逐页 PNG 预览。下面这份样稿可以直接复制到 Folio 的文章编辑区；`##` 等符号是 Folio 的文章格式标记，设计师不必修改它们。把文章保存为 `template-check.md`，在同一文件夹建立 `images` 文件夹，并在其中放一张名为 `sample.jpg` 的真实照片。

```markdown
---
title: "一份用于检查长标题换行效果的封面标题"
subtitle: "用于检查副标题、中文与英文混排的示例文字"
---

## 第一节：正文排版

这是一段正文。请检查**强调文字**、*斜体文字*、[链接文字](https://example.org)和行内代码 `A-102` 的外观。

### 更深一级的小标题

这里继续写正文，确认不同层级的标题和段落之间有清楚的间距。

> 这是一段用于检查引文样式的文字。

![图片说明](images/sample.jpg "这是一条用于检查图片说明样式的图注")

## 第二节：续页检查

将这一段正文复制多次，直到排版超过一页，再检查新增正文页。
```

逐页核对：长标题与副标题无溢出；中文、英文和数字均能显示；引文和说明文字可读；图片不变形、重要部分未被裁掉；正文续页的固定设计一致；没有缺字、缺图、字体替换或意外空白页。Folio 的“已就绪”只说明角色检查通过，最终视觉效果以实际发布的 INDD、PDF 和 PNG 为准。

交付时请提供：

- 最终 `.indd` 模板，而不是只给 PDF 或截图；模板内的可变内容框已清空。
- 模板用到的外部图片、标识等原始文件，以及可正常打开的链接路径；说明所用字体名称和字体交付或授权方式。
- 一份简短说明，写明页面尺寸、出血、是否有封面图片框、建议的标题长度，以及已用哪篇样稿测试。
- 测试发布得到的 PDF 或逐页预览图，供委托方确认版式。

### 遇到问题时怎么查

| 现象 | 先检查什么 |
| --- | --- |
| 脚本提示 `Expected exactly one object named ...; found 0` | 图层面板或样式面板中是否真的有该英文名称；框类型是否正确；对象是否在当前文档。 |
| 脚本提示 `found 2` 或更多 | 是否有两个同名框或样式。每个名称只保留一个。 |
| 脚本提示框不在指定页面 | 标题、副标题和封面图片应在普通第 1 页；正文主框应在普通第 2 页，不能在父版或页面外。 |
| Folio 提示缺少或重复角色 | 确认脚本运行后已保存；关闭重开文档再扫描。若从旧模板复制，检查是否留下旧的 Folio 角色标签。 |
| 短文能发布，长文不正常 | 检查第 2 页的 `Article Flow` 框和正文父版，尤其是父版装饰是否覆盖新建的正文框。 |
| 有副标题或图片时失败 | 检查对应框、`Subtitle`、`InlineImage`、`Caption` 等样式，以及本地图片文件是否存在。 |
| 页面字体或图片变了 | 在 InDesign 检查字体状态、Links（链接）面板、图片裁切和对象样式，再重新发布。 |

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
