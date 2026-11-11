#!/usr/bin/env python3
# 生成「纯数据、无代码」的汇编(.s), 用于把 dyld 闭包的 selector 数 n 顶过 2^k。
# 自动【分片】输出多个 .s, 每个文件小于指定上限(默认 1.8MB), 避免 git 大文件阻塞。
#
# 相比 .m 方案: 不走 clang codegen, 汇编极快, 且二进制里没有死代码。
#
# 原理: 直接铺 __objc_methname(选择子字符串) + __objc_selrefs(指向字符串的指针),
#       selrefs 段带 no_dead_strip, 保证链接进主二进制时被保留、并被 dyld
#       PrebuiltObjC::forEachSelectorReferenceToUnique 计数、喂给 make_perfect。
#       所有分片共享一个【全局递增下标】, 保证 selector 名跨文件唯一。
#
# 用法:
#   python3 gen_fake_sel_asm.py <数量> [输出目录] [每文件上限MB] [前缀]
#   例:  python3 gen_fake_sel_asm.py 10000
#        python3 gen_fake_sel_asm.py 10000 FakeSelAsm 1.8 examplepad_
#
# 接入: 把输出目录下所有 .s 作为 srcs 加入【启动就加载的主框架】
#       (如 AppCore) 的编译目标; 不要放到 extension 或懒加载 dylib。
#
#   *** 关键 ***: 这些 .s 没有被任何代码引用。若它们被编进【静态库(.a)】(bazel 的
#   objc_library/cc_library 默认就是), 链接器会因为"没有被引用的全局符号"而
#   【不把该 .o 拉进最终二进制】, 于是 selref 全部丢失(这就是之前没生效的原因)。
#   Mach-O 归档语义: 只有当【已在链接的活代码】引用了某成员导出的全局符号时,
#   该成员才会被抽取; no_dead_strip/used 只在成员"已被纳入"之后才阻止裁剪, 无法
#   触发纳入。所以要保住这些符号, 二选一:
#
#   [A] 不改任何 link 参数 / 不用 -force_load / 不用 alwayslink (本次诉求, 推荐):
#       用一处【链接期引用】把成员钩进来, 【运行时不执行任何代码, 零启动开销】。
#       本脚本会一并生成 ExampleFakeSelKeep.c, 它引用了全部分片锚点。二选一:
#
#       A-1) 把 ExampleFakeSelKeep.c 作为【最终二进制的直接源】(不经懒加载 .a):
#            它已标 __attribute__((used)), 无需任何引用/调用即可保留, 其函数体对锚点的
#            引用会把所有分片拉进来。最省事。(已实测)
#
#       A-2) 若 ExampleFakeSelKeep.c 只能进【静态库(.a)】: 在某个确定进包的既有源文件里加一处
#            【取地址】引用(注意是取地址, 不是调用 -> 运行时永不执行):
#                extern void ExampleFakeSelPaddingKeep(void);
#                __attribute__((used)) static void *const _examplepad_keep_ref =
#                    (void *)&ExampleFakeSelPaddingKeep;
#            取地址(活代码)-> 拉入 ExampleFakeSelKeep.o -> 它引用各锚点 -> 拉入每个分片 .o
#            -> selrefs 的 no_dead_strip 保住不被裁剪。普通 -dead_strip 链接即可。(已实测)
#
#       切记: 只在 .a 里给 ExampleFakeSelPaddingKeep 标 used 而【没有任何根引用】是无效的,
#       归档成员根本不会被抽取(已实测反例 = 0 个 selector)。
#
#   [B] 允许动 link 配置时更省事:
#     1) 在该 bazel 目标上设置  alwayslink = True   (等价于 -force_load)
#     2) 或链接时加  -Wl,-u,_ExampleFakeSelPadAnchor_0 -Wl,-u,_ExampleFakeSelPadAnchor_1 ...
#     3) 或把 .s 直接作为主框架二进制(最终 link)的直接源, 而非经由 .a
#
# 校验(真包 linkmap): rg -c "<前缀>" LinkMap/<主框架>_arm64.linkmap  # 应等于 <数量>
#   或看二进制:        strings -a <主框架二进制> | rg -c "<前缀>"

import os
import sys

METH_SECT = "\t.section\t__TEXT,__objc_methname,cstring_literals"
SEL_SECT  = "\t.section\t__DATA,__objc_selrefs,literal_pointers,no_dead_strip"


def bytes_per_sel(prefix, width):
    # 估算每个 selector 在 .s 中的字节数(label + .asciz + .quad 三行)
    idx = width  # 下标位数(l_ttm_<i> 里的 i, 用 width 近似上界)
    label  = len("l_ttm_") + idx + len(":\n")
    asciz  = len("\t.asciz\t\"") + len(prefix) + width + len("\"\n")
    quad   = len("\t.quad\tl_ttm_") + idx + len("\n")
    return label + asciz + quad


def write_shard(path, shard_id, lo, hi, prefix, width):
    lines = ["// AUTO-GENERATED shard %d: selectors [%d, %d) prefix=%s" % (shard_id, lo, hi, prefix)]
    # 全局锚点符号: 让静态库(.a)的符号表非空, 从而可以被 -Wl,-u,<sym> 强制拉入;
    # 若构建用 alwayslink/-force_load 则无需引用它。没有全局符号会导致整个 .o
    # 被链接器当成"未引用的库成员"而丢弃(selref 就进不了最终二进制)。
    lines.append("\t.section\t__DATA,__data")
    lines.append("\t.globl\t_ExampleFakeSelPadAnchor_%d" % shard_id)
    lines.append("_ExampleFakeSelPadAnchor_%d:" % shard_id)
    lines.append("\t.byte\t0")
    # 选择子字符串
    lines.append(METH_SECT)
    for i in range(lo, hi):
        lines.append("l_ttm_%d:" % i)
        lines.append('\t.asciz\t"%s%0*d"' % (prefix, width, i))
    # selrefs 指针(no_dead_strip 保证成员被拉入后不会被 dead-strip)
    lines.append(SEL_SECT)
    lines.append("\t.p2align\t3")
    for i in range(lo, hi):
        lines.append("\t.quad\tl_ttm_%d" % i)
    with open(path, "w") as f:
        f.write("\n".join(lines) + "\n")


def write_keep(path, n_shards):
    # 活代码引用文件: 引用全部分片锚点, 使静态库成员在普通链接下被拉入,
    # 无需 -force_load / alwayslink / -u。C 会自动加前导下划线, 故这里写不带下划线的名字。
    lines = [
        "// AUTO-GENERATED: 让 FakeSelAsm 的分片在普通链接(无 -force_load/alwayslink)下被保留。",
        "// 本函数【运行时永不执行】, 无需调用 -> 零启动开销。两种接法二选一:",
        "//   A-1) 把本文件作为最终二进制的直接源: 已标 used, 无需任何引用即可保留。",
        "//   A-2) 若本文件进静态库: 在某个确定进包的既有源里加一处【取地址】引用(非调用):",
        "//          extern void ExampleFakeSelPaddingKeep(void);",
        "//          __attribute__((used)) static void *const _r = (void*)&ExampleFakeSelPaddingKeep;",
        "",
    ]
    for s in range(n_shards):
        lines.append("extern char ExampleFakeSelPadAnchor_%d;" % s)
    lines.append("")
    lines.append("__attribute__((used))")
    lines.append("void ExampleFakeSelPaddingKeep(void) {")
    lines.append("    static const void * volatile sink;")
    for s in range(n_shards):
        lines.append("    sink = &ExampleFakeSelPadAnchor_%d;" % s)
    lines.append("    (void)sink;")
    lines.append("}")
    with open(path, "w") as f:
        f.write("\n".join(lines) + "\n")


def main():
    n       = int(sys.argv[1]) if len(sys.argv) > 1 else 10000
    outdir  = sys.argv[2] if len(sys.argv) > 2 else "FakeSelAsm"
    maxmb   = float(sys.argv[3]) if len(sys.argv) > 3 else 1.8
    prefix  = sys.argv[4] if len(sys.argv) > 4 else "examplepad_"

    width = max(6, len(str(n - 1)))
    max_bytes = int(maxmb * 1024 * 1024)
    per_file = max(1, max_bytes // bytes_per_sel(prefix, width))

    os.makedirs(outdir, exist_ok=True)

    shard = 0
    lo = 0
    files = []
    while lo < n:
        hi = min(lo + per_file, n)
        path = os.path.join(outdir, "ExampleFakeSelPadding_%03d.s" % shard)
        write_shard(path, shard, lo, hi, prefix, width)
        files.append((path, hi - lo, os.path.getsize(path)))
        lo = hi
        shard += 1

    keep_path = os.path.join(outdir, "ExampleFakeSelKeep.c")
    write_keep(keep_path, shard)

    total = sum(c for _, c, _ in files)
    biggest = max(sz for _, _, sz in files)
    print("wrote %d shards into %s/  (total %d selectors, prefix=%s, width=%d)"
          % (len(files), outdir, total, prefix, width))
    print("wrote keep file %s  (调用一次 ExampleFakeSelPaddingKeep() 即可, 无需 -force_load/alwayslink)"
          % keep_path)
    print("per_file=%d selectors, largest shard=%.2f MB (<= %.2f MB)"
          % (per_file, biggest / 1024 / 1024, maxmb))
    print("selref bytes total = %d (0x%x)" % (n * 8, n * 8))

if __name__ == "__main__":
    main()
