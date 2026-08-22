# Image2PCB Art

把一张图片变成一块**真的可以去嘉立创打样的 PCB 艺术画**。全部处理在浏览器本地完成，图片不会上传到任何服务器。

灵感与工艺参考 [oshwhub「梵高星空PCB」](https://oshwhub.com/sytnocui/star-pcb-drawing)：不是彩色丝印，而是把图片颜色量化成**丝印 / 阻焊 / 铜皮**几种真实 PCB 材料的组合——蓝漆、白字、露铜、裸基材，每种颜色都是工厂真的做得出来的。

## 3 分钟上手

1. **打开应用**：直接用在线版 **<https://xiaohai-uid.github.io/image2pcb-art/>**，或本地起个静态服务（见下文 Run locally）。
2. **上传一张图**：JPG / PNG / WebP 都行。大色块的图效果最好（logo、像素画、星空）。
3. **检查全绿**：右栏「制造检查」全部打勾、状态变为 READY。红色项旁边有一句「怎么修」。
4. **下载 ZIP 去下单**：点「Download manufacturing ZIP」，把 ZIP 直接拖进 [jlc.com](https://www.jlc.com) 的 PCB 下单页，参数选：

| 参数 | 选择 |
|---|---|
| 板层 | 2 层 |
| 板厚 | 1.6 mm（默认） |
| 阻焊颜色 | **蓝色** |
| 丝印颜色 | **白色** |
| 表面处理 | 有铅 / 无铅 HASL 均可 |

## 常见问题

- **深色细节去哪了？** 深色区域会映射到**底层铜**：正面看是普通蓝漆，把板子翻到背面才是深蓝图案。预览里点「背面」按钮可以提前看到（已按实物翻面镜像）。
- **红色 BLOCKED 怎么办？** 每个失败项旁边都写了怎么修。常见原因是格子小于 0.25 mm 制造极限（降低「细节」滑块）或图案贴到了板边（工具会自动加安全边框）。
- **颜色和实物一致吗？** 预览是近似。Blue Classic 档案仍是 Experimental：正式量产前请先用 Gerber Viewer 复核，并接受首板与预览存在色差。
- **能做彩色照片吗？** 不能。PCB 天然只有这几种材料色，工具会把照片颜色"折算"到这 6 种状态上，色彩丰富的照片会丢失细节。

## 当前能力

- JPG、PNG、WebP 本地读取，不上传原图
- Blue Classic candidate palette 的 6 种材料状态预览，支持正面 / 背面（镜像）物理真实渲染
- 原图与 PCB 模拟并排查看
- 板宽、板高、方角/圆角与圆角半径
- 亮度、对比度、细节、边缘平滑和裁剪焦点
- Top Copper、Top Solder Mask、Bottom Copper、Bottom Solder Mask、Top Silkscreen 可见性切换
- 尺寸、图层对齐、圆角几何、最小特征、复杂度硬检查
- 铜到板框的实际最小间距检查（Blue Classic 目标 ≥ 0.30 mm），圆角板按到角弧的真实距离计量，圆角板内铜单元包含性检查
- 阻焊开窗/丝印板框 containment 与 Material State 到六层 Gerber 的交叉语义硬检查
- BLOCKED 时禁用正式导出，每个失败项附修正建议；READY 时一次性下载确定性 Gerber Manufacturing Package ZIP
- Manufacturing ZIP 根目录只含 `board.GTL`、`board.GBL`、`board.GTS`、`board.GBS`、`board.GTO`、`board.GKO`；Review ZIP 单独包含 `project.json`、`manifest.json`、制造报告、指南、SVG 审阅文件和浏览器预览
- Gerber 层写入标准 X2 `FileFunction`、`FilePolarity`、`Part=Single` 属性；GTS/GBS 声明为 `Soldermask,Top/Bot` 和 `Negative`
- 每个 material 按 top/bottom 显式声明 `maskIntent`：`COVER`、`OPEN` 或 `DEFAULT`；`DEFAULT` 在 exporter 中按 profile 的 `maskDefault.top/bottom` 解析为 `COVER` 或 `OPEN` 后生成 GTS/GBS
- 图像量化会把到板边（含圆角弧边）间距不足或越出板框的铜/图层单元自动替换为安全材料，并在报告中记录数量

## Run locally

这是无运行时依赖的静态应用；开发测试额外使用 Playwright 进行真实浏览器冒烟验证。可以从该目录启动任意静态服务器，例如：

```powershell
python -m http.server 4173
```

然后打开 `http://localhost:4173`。

## Product boundary

`READY` 只代表 Image2PCB Art 内部的当前几何、Gerber round-trip、板框绑定、层语义和输入检查通过，不代表 Gerber Viewer、工厂 DFM 或实板确认。当前 Blue Classic 是 Experimental profile，真实颜色仍需通过校准卡、Gerber Viewer、JLCPCB DFM 和实板进行验证。

导出的 Gerber ZIP 是 V1 主制造交付；SVG 位于 `review/`，只用于审阅/调试，也不是原生 EasyEDA `.epro` 工程。标准 Gerber file polarity 已按规范写入（`SPEC_VERIFIED`），但 material 到阻焊开窗的映射仍是 `EXTERNAL_UNVERIFIED`；正式送厂前仍需用独立 Gerber Viewer 检查阻焊语义、板框和镜像，再提交 JLCPCB DFM。当前软件尚未声称已通过真实工厂或实板验证。

**想帮忙完成最后一步验证？** 按 [`docs/external-validation-checklist.md`](docs/external-validation-checklist.md) 操作：10 分钟的 Gerber Viewer 逐层复核 + 一单几十元的实物打样比对。通过后 Blue Classic 即可从 Experimental 升级为 Validated。审阅 ZIP 内的制板指南也附带了这份清单的摘要。

## Deployment

推送到 `main` 后，GitHub Actions 先跑完整验证（核心单测 + 语法检查 + Chromium 浏览器冒烟），全部通过才把站点文件部署到 GitHub Pages——线上永远是测试过的那个 commit（workflow 见 `.github/workflows/ci.yml` 的 `verify` → `deploy-pages` 两个任务）。发布以 Git 标签为准（当前 `v1.0.0-rc.1`，发布标签 `SOFTWARE RC / PHYSICAL VALIDATION PENDING`）。

## Development

```powershell
npm install
npm test
npm run check:syntax
npx playwright install chromium
npm run test:browser
python -m http.server 4173
```

GitHub Actions 会在 push 和 pull request 上运行核心单测、语法检查和 Chromium 浏览器冒烟测试。

MaTt 的规格、ADR 和工程约束位于 `CONTEXT.md` 与 `docs/`。`.scratch/` 只保留本地验证缓存和临时证据，已加入 `.gitignore`，不会随公开仓库发布。

## Open-source project boundary

这是一个可运行的 V1 几何切片和制造文件实验项目，不是工厂下单服务，也不生成原生 EasyEDA `.epro` 工程。欢迎围绕几何、层语义、Gerber 合同和本地测试提交改进；请先阅读 `CONTRIBUTING.md`。
