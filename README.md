# Image2PCB Art

Image2PCB Art 是一个 browser-local PCB 材料艺术转换器，来自 `I2P-ART-WEB-V1` 的第一条 Gerber 制造几何纵向切片。

本项目以 MIT License 开源。应用在浏览器本地处理图片，不上传原图；制造输出仍需使用者自行完成独立 Viewer、工厂 DFM 和实板验证。

当前切片包含：

- JPG、PNG、WebP 本地读取，不上传原图
- Blue Classic candidate palette 的 6 种材料状态预览
- 原图与 PCB 模拟并排查看
- 板宽、板高、方角/圆角与圆角半径
- 亮度、对比度、细节、边缘平滑和裁剪焦点
- Top Copper、Top Solder Mask、Bottom Copper、Bottom Solder Mask、Top Silkscreen 可见性切换
- 尺寸、图层对齐、圆角几何、最小特征、铜边缘和复杂度硬检查
- 铜到板框的实际最小间距检查（Blue Classic 目标 ≥ 0.30 mm），以及圆角板内铜单元包含性检查
- 阻焊开窗/丝印板框 containment 与 Material State 到六层 Gerber 的交叉语义硬检查
- BLOCKED 时禁用正式导出；READY 时一次性下载确定性 Gerber Manufacturing Package ZIP
- Manufacturing ZIP 根目录只含 `board.GTL`、`board.GBL`、`board.GTS`、`board.GBS`、`board.GTO`、`board.GKO`；Review ZIP 单独包含 `project.json`、`manifest.json`、制造报告、指南、SVG 审阅文件和浏览器预览
- Gerber 层写入标准 X2 `FileFunction`、`FilePolarity`、`Part=Single` 属性；GTS/GBS 声明为 `Soldermask,Top/Bot` 和 `Negative`
- 每个 material 按 top/bottom 显式声明 `maskIntent`：`COVER`、`OPEN` 或 `DEFAULT`；`DEFAULT` 在 exporter 中按 profile 的 `maskDefault.top/bottom` 解析为 `COVER` 或 `OPEN` 后生成 GTS/GBS
- 图像量化会把最外圈铜单元自动替换为 FR4 安全边框，并在报告中记录数量

## Run locally

这是无依赖静态原型，可以从该目录启动任意静态服务器。例如：

```powershell
python -m http.server 4173
```

然后打开 `http://localhost:4173`。

## Product boundary

`READY` 只代表 Image2PCB Art 内部的当前几何、Gerber round-trip、板框绑定、层语义和输入检查通过，不代表 Gerber Viewer、工厂 DFM 或实板确认。当前 Blue Classic 是 Experimental profile，真实颜色仍需通过校准卡、Gerber Viewer、JLCPCB DFM 和实板进行验证。

导出的 Gerber ZIP 是 V1 主制造交付；SVG 位于 `review/`，只用于审阅/调试，也不是原生 EasyEDA `.epro` 工程。标准 Gerber file polarity 已按规范写入（`SPEC_VERIFIED`），但 material 到阻焊开窗的映射仍是 `EXTERNAL_UNVERIFIED`；正式送厂前仍需用独立 Gerber Viewer 检查阻焊语义、板框和镜像，再提交 JLCPCB DFM。当前软件尚未声称已通过真实工厂或实板验证。

## Development

```powershell
npm test
python -m http.server 4173
```

MaTt 的规格、ADR 和工程约束位于 `CONTEXT.md` 与 `docs/`。`.scratch/` 只保留本地验证缓存和临时证据，已加入 `.gitignore`，不会随公开仓库发布。

## Open-source project boundary

这是一个可运行的 V1 几何切片和制造文件实验项目，不是工厂下单服务，也不生成原生 EasyEDA `.epro` 工程。欢迎围绕几何、层语义、Gerber 合同和本地测试提交改进；请先阅读 `CONTRIBUTING.md`。
