# 外部验证清单（External Validation Checklist）

本项目的发布标签是 `SOFTWARE RC / PHYSICAL VALIDATION PENDING`。软件侧的几何、Gerber 语法、解析回读、层语义契约已由自动化测试覆盖；剩下两道门**必须由真实外部证据**打开。本清单是执行手册：做完一节，就把结果记回 `.scratch/external-validation/current-release-validation.json` 并更新 `docs/specs/image2pcb-art-v1.md` 的发布标签。

## 第 1 节：Gerber Viewer 复核（约 10 分钟，零成本）

**目标**：确认 material→阻焊映射、极性、原点、镜像与预览一致。这会把 ADR 0001 中 `EXTERNAL_UNVERIFIED` 的映射状态升级为 viewer-verified。

**步骤**：

1. 在应用里加载一张测试图（建议含大面积蓝色背景 + 白色丝印笔画 + 一块 HASL 银色区域 + 一处裸 FR4 区域），配置一块圆角板，等到 READY。
2. 下载 manufacturing ZIP 并解压，应恰好 6 个文件：`board.GTL / GBL / GTS / GBS / GTO / GKO`。
3. 上传到任一查看器：
   - 嘉立创下单助手的 Gerber 预览（最贴近真实下单体验），或
   - Ucamco 参考查看器（Reference Gerber Viewer，规范制定方），或
   - 本地 `npx @gerber-tools/...` 类 PyGerber 渲染（已有 fixture 证据）。

**逐层检查点**（对照应用预览）：

| 层 | 看什么 | 预期 |
|---|---|---|
| `board.GKO` | 轮廓闭合、圆角、尺寸标注 | 与配置的板宽高/圆角一致；无艺术图形混入 |
| `board.GTL` | 顶层铜图案 | 与预览"顶层铜"开关打开时的图案一致；边缘留白 ≥0.30mm |
| `board.GBL` | 底层铜图案 | 与预览"底层铜"一致；**注意镜像方向**（从背面看） |
| `board.GTS` | 顶层阻焊开窗（负极性文件，看"露铜/露底"的位置） | HASL 银色与裸 FR4 单元处开窗；蓝色覆盖处无开窗 |
| `board.GBS` | 底层阻焊开窗 | 与底层 `maskIntent: OPEN` 的单元一致；`DEFAULT→COVER` 处无开窗 |
| `board.GTO` | 顶层丝印 | 白丝印单元的图案；底层无丝印文件（V1 只有顶层丝印） |
| 全局 | 原点 | 板左下角为原点（board-lower-left），mm 单位 |

**记录**：在 `current-release-validation.json` 中把 viewer 复核结果（查看器名称、日期、逐层结论）追加到 `source`/`artifacts` 旁的验证记录，并把 ADR 0001 的映射状态从 `EXTERNAL_UNVERIFIED` 改为 `VIEWER_VERIFIED`（仍不是 fab-verified）。

## 第 2 节：实物打样比对（几十元，1–2 周）

**目标**：把 Blue Classic 从 Experimental 升 Validated（spec 验证第 5 条的唯一钥匙）。

**步骤**：

1. 用第 1 节同一张图，在嘉立创按默认参数下单：2 层、板厚 1.6、阻焊蓝色（哑光可选）、HASL 有铅/无铅均可、丝印白色。
2. DFM 报告若有警告/修改建议，逐条记录——它们是 profile 校准数据。
3. 收到实物后，与浏览器预览并排比对（同一角度、同一光照）：

| 检查点 | 预期 |
|---|---|
| 阻焊蓝 vs 预览 `#28647b` | 记录色差方向（实物通常更暗/更饱和） |
| HASL 银 vs 预览 `#b7c2c5` | 记录反光差异 |
| 丝印白 vs 预览 `#eeeadd` | 记录色差 |
| 裸 FR4 vs 预览 `#b79a6b` | 记录色差 |
| 圆角半径、板尺寸 | 与配置一致 |
| 开窗位置 | 与预览"露铜/露底"一致 |

4. 把每个色差结论写进 profile 的校准注释，必要时微调 palette RGB（**必须**同步 `RENDER_COLORS` 与 palette，保持单一来源），重跑全部测试。
5. 全部通过后：`validationStatus: experimental → validated`，发布标签改为 `PHYSICAL VALIDATED`。

## 红线

- 任何一步失败都**不**发布"已验证"声明；如实记录失败现象并回修。
- 预览 RGB 的任何调整都要有实物照片依据，不允许凭感觉改色（CONTEXT.md：RGB 不是制造真值）。
