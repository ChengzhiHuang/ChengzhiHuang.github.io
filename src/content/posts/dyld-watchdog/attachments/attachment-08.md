# 版本 0.x vs 版本 0.x+1 Core Mach-O 差异分析（disk size + vmsize + LinkMap 归因）

> 本附件是排查过程中的阶段性对比记录，包含当时的假设；最终定位与解决方式以正文后续 Trace 和验证为准。版本、产品、内部模块和具体大小已经局部脱敏，保留原有章节顺序。

> 对比对象：`版本 0.x 包`（启动正常）与 `版本 0.x+1 包`（新装冷启动卡死）的 Core 动态库
> 采集工具：`file` / `size -m -x` / `otool -l` / LinkMap 流式解析

---

## 0. 结论先行

1. **框架被重命名**：版本 0.x 是 `Frameworks/LegacyCore.framework/LegacyCore`，版本 0.x+1 是 `Frameworks/AppCore.framework/AppCore`。二者是同一个「Core」动态库的两次构建。
2. **Core 二进制整体增大（disk / vm）**，且**几乎全是单向增长、没有明显缩小**——是一次常规版本迭代累加代码/元数据，而非结构性重排。
3. **主力增量在真实代码段 `__BD_TEXT.__text`**（占总增量的大部分）。标准 `__TEXT`（只读元数据）与 `__DATA`（vm）也有增长。
4. **LinkMap 归因**：代码增长绝大部分来自 **`libSwiftAggregate.a`（Swift 代码聚合库，pre-dead-strip 口径）**，其次 `跨平台 Host`、`libObjCAggregate.a`；另有新链接进来的 `libDiagnosticCapture`（崩溃/CoreDump 采集）等小模块。
5. **与崩溃的关系**：版本 0.x+1 相对 版本 0.x 只是 **小幅体量增量**，但它落在启动必经的 ObjC 元数据热页 + 代码页上，把本就贴着 20s 启动看门狗边界的 iPhone 6s（2GB）**顶过了阈值**。这不是「新引入的 bug」，而是「压垮骆驼的最后一根稻草」。

---

## 1. 二进制与框架基本信息

| 项 | 版本 0.x（正常） | 版本 0.x+1（异常） |
| --- | --- | --- |
| Framework | `LegacyCore.framework` | `AppCore.framework` |
| 可执行文件 | `LegacyCore` | `AppCore` |
| 架构 | Mach-O 64-bit arm64（单 arch） | 同 |

---

## 2. disk size vs vmsize —— 为什么要分开看

- **`filesize`（disk）**：落盘、需从 NAND 读入并解压的字节数 → 决定**冷启动首次映射时硬缺页的 IO / 解压成本**。
- **`vmsize`（vm）**：映射进进程地址空间、可被驻留的字节数，**额外包含 `__bss / __common / __thread_bss` 等 zerofill**（不占包体、但运行时要占物理页）→ 决定**运行时物理页压力**。
- 本二进制真实机器码在自定义段 **`__BD_TEXT`**（标准 `__TEXT.__text` size = 0）；标准 `__TEXT` 只放只读元数据。因此「TEXT 段」要拆成 `__BD_TEXT`（代码）与 `__TEXT`（元数据）两段分别看。这也与 ips 里 `vmSummary` 把 `__BD_TEXT` 与 `__TEXT` 分列一致。

### 2.1 段级双视图差异（`otool -l`，省略具体大小）

| 段 | vmsize 变化 | filesize 变化 |
| --- | --- | --- |
| `__TEXT` | 增长 | 增长 |
| `__DATA_CONST` | 增长 | 增长 |
| `__DATA` | 增长 | 增长 |
| `__BD_TEXT` | 增长 | 增长 |
| `__LINKEDIT` | 增长 | 增长 |
| 其余小段¹ | 不变 | 不变 |
| **合计** | 增长 | 增长 |

¹ `__LYNX__DATA / __FEATURE_DATA_A / __FEATURE_DATA_B / __MKSD_DATA / Data`，无变化。
补充：file 合计用二进制实际大小（含头部/对齐），与逐段 filesize 求和略有差异属正常。

**关键观察（vm 独有）**：
- `__DATA` 段 **vm Δ 比 file Δ 更大**，差额来自 **zerofill 增长**（`__bss`/`__thread_bss`）。这部分**只吃 RAM、不进包体**——只看 disk size 会漏掉它。
- `__DATA` zerofill = `vm − file`，版本 0.x+1 相比版本 0.x 有所增长。
- 整体 **vm 总增量略大于 disk 总增量**，多出的部分即新增 zerofill，是运行期物理页压力里「磁盘上看不见」的一块。

---

## 3. section 级增减（`size -m -x`，省略具体大小）

按增量绝对值排序（Top）。标 `(zerofill)` 者只占 vm、不占 disk：

| 段 | Section | 变化 | 备注 |
| --- | --- | --- | --- |
| `__BD_TEXT` | `__text` | 增长 | 真实代码，**主力** |
| `__TEXT` | `__cstring` | 增长 | C 字符串 |
| `__DATA` | `__objc_const` | 增长 | ObjC 只读类结构 |
| `__DATA_CONST` | `__const` | 增长 |  |
| `__DATA` | `__data` | 增长 |  |
| `__TEXT` | `__const` | 增长 |  |
| `__DATA` | `__bss` | 增长 | **(zerofill)** 仅 vm |
| `__TEXT` | `__objc_methname` | 增长 | **ObjC 方法名，map_images 热页** |
| `__TEXT` | `__unwind_info` | 增长 |  |
| `__DATA` | `__objc_data` | 增长 | **ObjC 类对象** |
| `__DATA` | `__objc_clsrefs` | 增长 |  |
| `__TEXT` | `__objc_methlist` | 增长 | **ObjC 方法列表** |
| `__TEXT` | `__constg_swiftt` | 增长 | Swift |
| `__TEXT` | `__gcc_except_tab` | 增长 | 异常表 |
| `__TEXT` | `__swift5_fieldmd` | 增长 | **Swift 元数据** |
| `__TEXT` | `__swift5_reflstr` | 增长 | **Swift 元数据** |
| `__TEXT` | `__swift5_typeref` | 增长 | **Swift 元数据** |
| `__TEXT` | `__eh_frame` | 增长 |  |
| `__DATA_CONST` | `__cfstring` | 增长 |  |
| `__TEXT` | `__swift5_capture` | 增长 | Swift |
| `__DATA` | `__objc_selrefs` | 增长 |  |
| `__TEXT` | `__objc_methtype` | 增长 |  |
| `__TEXT` | `__objc_classname` | 增长 | ObjC 类名 |
| `__DATA_CONST` | `__objc_classlist` | 增长 | **类列表** |
| `__TEXT` | `__swift5_proto` | 增长 | Swift |

**明显变小的 section：几乎没有**，仅两个极小自定义 section 微降：`componentRegistration` 、`mockConfiguration` 。

**解读**：
- 一堆 `__swift5_*`（fieldmd/reflstr/typeref/capture/proto）+ `__constg_swiftt` 同步增长，指向**新增代码以 Swift 为主**——与第 4 节 LinkMap 归因（`libSwiftAggregate.a` 主导）互相印证。
- 启动期 `map_images / _read_images` 必然触达的 **ObjC 元数据热页**同步增大：`__objc_methname`、`__objc_methlist`、`__objc_const`、`__objc_data`、`__objc_classlist`、`__objc_selrefs/clsrefs`。这些正是崩溃栈里 `readClass / realizeClassWithoutSwift / prepareMethodLists` 要读的页。

---

## 4. LinkMap 模块级归因

### 4.1 LinkMap 配对与一处误拷贝（重要）

| 构建 | 使用的 LinkMap | `# Path:` 头 |
| --- | --- | --- |
| 版本 0.x | `版本 0.x 包/LinkMap (1)/LegacyCore_arm64.linkmap` | `.../ComparisonApp/LegacyCore` |
| 版本 0.x+1 | 顶层 `LinkMap/AppCore_arm64.linkmap` | `.../ComparisonApp/AppCore` |

> ⚠️ `版本 0.x+1 包/LinkMap/` 目录里放的其实是 `LegacyCore_arm64.linkmap`，与 版本 0.x 那份**字节完全相同**（同名同大小），是**误拷贝**，并非 版本 0.x+1 的 LinkMap。真正对应 版本 0.x+1 的是顶层 `LinkMap/AppCore_arm64.linkmap`。本节按上表正确配对。

方法：流式解析两份 LinkMap，用 `# Sections:` 建立地址→段/节映射，`# Symbols:` 里每个符号按 `[obj 索引]` 归到其静态库（`.a/.lo`），并把 `LegacyCore`/`AppCore` 词元归一化为 `<CORE>` 以对齐两个构建。对象文件数也有所增加。

> 口径说明：LinkMap 的符号尺寸是**链接期、dead-strip 之前**的视图，绝对值高于最终二进制（LinkMap 口径的符号尺寸增量与最终二进制增量不同）。因此下表**用于相对排序/归因，不代表最终落盘增量**。

### 4.2 代码段 `__BD_TEXT.__text` 增量 Top（谁让代码变大）

| 变化 | 库（中性名称） | 说明 |
| --- | --- | --- |
| 增长 | `libSwiftAggregate.a` | **Swift 业务代码聚合库，绝对主力** |
| 增长 | `CrossPlatformHost`（CrossPlatformHostA/CrossPlatformHostB） | 跨平台 host |
| 增长 | `libObjCAggregate.a` | 业务根库（ObjC/混编） |
| 增长 | `[linker synthesized]` | 链接器生成（stubs/桩等） |
| 增长 | `libMediaPlayer.a` | 播放器 |
| 增长 | `libRenderer.a` | 渲染 |
| 增长 | `AudioModule` | 音频 |
| 增长 | `RealtimeModule` | RTC |
| 增长 | `libExceptionGuard.a` | 异常防护（总量明显增长，见 4.3） |
| 增长 | `libExperimentExport.a` | ABTest |
| 增长 | `libDiagnosticCapture.a` | **版本 0.x+1 新增链接**（崩溃/CoreDump 采集） |

### 4.3 全段合计增量 Top / 新增·移除模块

- **全段合计 Top**：`libSwiftAggregate.a`、`CrossPlatformHost` 、`libObjCAggregate.a` 、`libExceptionGuard` **（明显增长）**、`[linker synthesized]` 。
- **版本 0.x+1 新增链接的库**：`libDiagnosticCapture.a`、`PencilKit.tbd`、`CoreNFC.tbd`（后两者为系统框架引用，极小）。
- **被移除的库**：无。

**一句话**：版本 0.x+1 的代码膨胀 ≈ **Swift 业务代码（libSwiftAggregate.a）自然增长 + KMP host + 少量新模块（DiagnosticCapture 等）**，没有单个「异常巨物」，是典型的迭代累加。

---

## 5. 与启动崩溃的关联（vm 侧 / disk 侧两条线）

结合 正文中的排查记录：崩溃是 iPhone 6s(2GB) 新装冷启动时，主线程在 `_objc_init → map_images → _read_images` 同步处理全部已加载镜像的 ObjC 元数据，海量缺页在小内存机上反复 `vm_page_wait` 阻塞，启动墙钟超过 20s，被 FrontBoard `0x8BADF00D` `SIGKILL`。版本 0.x→版本 0.x+1 的段增量从两个维度加剧了它：

- **disk 侧（硬缺页 IO 成本）**：`__BD_TEXT`、`__TEXT` 落盘变大 → 冷启动首次映射时需从 NAND 读入并解压的页更多、更久（老设备 NAND/CPU 慢，逐页放大）。
- **vm 侧（驻留物理页压力）**：启动必触达的 ObjC 元数据热页同步增大（`__objc_methlist/__objc_methname/__objc_const/__objc_data/__objc_classlist` 同步增长），再叠加 `__DATA` 多出的  zerofill → 启动期需驻留的唯一页更多 → 在空闲页本就紧张的 2GB 机上更频繁真阻塞（对应 `ktriageinfo: VM - Fault hit memory shortage`）。

> 注意量级：版本 0.x+1 相对 版本 0.x 只是**小幅增长**。这说明 **版本 0.x 本身就已经贴着 20s 看门狗边界**，版本 0.x+1 的常规增量把它推过了临界点。因此优化方向不是「仅回退这次增量」，而是整体降低**启动期需要触达的物理页数与缺页次数**（精简 `+load`/constructor、懒加载非首屏类与分类、启动局部性/order file、低内存机启动降级）。

---

## 6. 复现命令（备查）

```bash
# 架构 / 大小
file "版本 0.x 包/示例AppA.app/Frameworks/LegacyCore.framework/LegacyCore"
file "版本 0.x+1 包/示例AppA.app/Frameworks/AppCore.framework/AppCore"

# 段级 vmsize + filesize
otool -l <MachO> | awk '/^  segname/{s=$2}/^   vmsize/{v=$2}/^ filesize/{print s" vm="v" file="$2}'

# 段/节尺寸（vm 视图，含 zerofill 标注）
size -m -x <MachO>

# LinkMap 模块归因（使用自备的 LinkMap 解析脚本）
python3 linkmap_diff.py \
  "版本 0.x 包/LinkMap (1)/LegacyCore_arm64.linkmap" \
  "LinkMap/AppCore_arm64.linkmap"
```

---

## 7. 横向对比：示例AppB 版本 0.y（更大却启动正常）vs 示例AppA 版本 0.x+1

> 目的：示例AppB包体理论上更大，但在同档设备上首启正常。对比二者 Core 的主要区别，反推「首启是否被看门狗杀死」到底由什么决定。
> 对比对象：示例AppB `ComparisonApp.app/Frameworks/ComparisonAppCore.framework/ComparisonAppCore`（版本 0.y）vs 示例AppA `AppCore`（版本 0.x+1）。二者都是「瘦启动壳 + 巨型单体 Core」结构（业务主要在 Core）。

### 7.1 结论先行（重要且反直觉）

**示例AppB Core 在几乎所有维度都比 示例AppA 更大、更重，却启动正常** —— 这直接证明：**首启看门狗崩溃与「二进制总体量 / ObjC 元数据总量」无关**，决定因素是**启动窗口内同步完成的工作量 + 首次安装冷缺页的 CPU/IO**，而不是包多大。

| 指标 | 示例AppB 相对示例AppA |
| --- | --- |
| 文件大小 | 较大 |
| 代码 `__text` | 较大 |
| `__objc_const`（类结构） | 较大 |
| `__objc_methname`（selector） | 较大 |
| `__objc_data`（类对象） | 较大 |
| ObjC 类数量（classlist/8） | 较大 |
| 启动 initializer 数量 | 较大 |
| `__gcc_except_tab` | 较大 |
| Swift 元数据（4 段合计） | 较小 |

示例AppB的 `map_images/_read_images` 要读的 ObjC 元数据（`__objc_const/methname/data/classlist`）、要跑的 initializer 数量都**多于** 示例AppA，冷启动要换入的页只会更多。既然它没被 20s 看门狗杀死，说明「元数据体量」不是 示例AppA 崩溃的充分条件。

### 7.2 二进制结构主要区别（measured）

| 维度 | 示例AppB ComparisonAppCore | 示例AppA AppCore(版本 0.x+1) | 说明 |
| --- | --- | --- | --- |
| 代码所在段 | **标准 `__TEXT,__text`** | **自定义 `__BD_TEXT,__text`**（标准 `__text`=0） | 示例AppA 用自定义段布局工具 |
| 段数量 | 5（`__TEXT/__DATA/Data/__LYNX__DATA/__LINKEDIT`） | 10（多出 `__DATA_CONST` 及 `__FEATURE_DATA_*/__MKSD_DATA` 等） |  |
| `__DATA_CONST` | **无**（const/objc 列表都在 `__DATA`） | **有**（含 objc_classlist/catlist/protolist、cfstring） | 影响可否保持只读/共享 |
| Fixup 方案 | **classic `LC_DYLD_INFO_ONLY`**（rebase/bind opcodes，需前置全量重定位） | **`LC_DYLD_CHAINED_FIXUPS`**（iOS 15 支持 page-in linking，页可懒重定位、保持 clean） | **示例AppA 反而是更省内存的现代方案** |
| Initializer 段 | `__mod_init_func`（绝对指针，需 rebase） | `__init_offsets`（相对偏移，随 chained-fixups） | 示例AppA 更少更轻 |
| 最低系统 | **minos 13.0** | minos 14.0 | 两者都能装 iPhone 6s / iOS 15，非机型截断 |
| 重框架加载 | EffectModule / Search 等运行时 `dlopen` 延迟加载，另有 `StartupModule`（启动优化）、`LoadManager`（控制加载顺序） | Core 单体，随主程序 eager 加载 | 示例AppB把非首屏模块挪出启动窗口 |

**关键反推**：如果崩溃是「二进制格式/重定位/初始化更重」导致，那示例AppB（classic fixups + 更多 initializer + 无 __DATA_CONST）应该更糟——但它正常。说明 **示例AppA 的二进制格式反而更现代省内存**，崩溃不在这里。

### 7.3 那到底差在哪（分析）

结合 §5 的看门狗机制，示例AppB 更大却不崩，只能落到「**启动窗口内实际做了多少同步工作**」：

1. **体量 ≠ 启动成本**：`map_images` 的 `readClass` 会遍历全部类名入表，但**类的 realize 是懒的**——只有非懒类（`__objc_nlclslist`）、带 `+load`、以及启动路径真正引用到的类才会在启动窗口被实现。真正拖时间的是**首屏路径上被 realize 的类 + 跑的 `+load`/initializer + Swift 运行时 bring-up**，而不是磁盘上类的总数。示例AppB靠 `dlopen` 延迟 + 启动 SDK/加载管理器把这部分压在 20s 预算内。
2. **唯一 示例AppA 更重的轴是 Swift**：示例AppA 的 `__swift5_*` 元数据比示例AppB更大。Swift 启动期要做类型元数据实例化、协议一致性表构建等额外 bring-up，且与 ObjC 互操作时会触发更多元数据换页。**这是当前数据里唯一「示例AppA 比示例AppB更吃启动」的维度**，值得作为首要排查方向。
3. **首次安装冷启动是最坏工况**：dyld 闭包首建、页缓存全冷、无 swap 只有压缩器。示例AppA 版本 0.x+1 在 §1-§6 已证明相对 版本 0.x 只是常规增量，却把一个**本就贴着 20s 边界**的启动路径顶过临界；示例AppB则始终把首启工作量留有余量。

### 7.4 一句话

**「示例AppB更大却启动正常」恰恰说明包体大小不是病根。** 示例AppA 首启崩溃是**启动窗口同步工作量 + 2GB 首装冷缺页**在固定 20s 看门狗下的超时；二进制格式上 示例AppA 甚至比示例AppB更省内存，唯一更重的是 Swift 元数据。优化应聚焦**削减启动窗口内被 realize 的类 / `+load` / initializer / Swift bring-up 与首屏依赖**（见 §5），而非追求把 Core 改小。

> 口径与局限：以上为静态二进制对比 + 崩溃机制推断。要坐实「哪些类/initializer 在启动窗口被同步执行」，需在 iPhone 6s(iOS 15) 上用 Instruments（App Launch / os_signpost / 静态初始化器计时）对两者做首启剖析；本报告用二进制证据排除了「体量/格式」这一类原因。
