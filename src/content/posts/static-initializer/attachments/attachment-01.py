#!/usr/bin/env python3
import sys
import re

def find_static_initializers(linkmap_path):
    # 用于存储 object file 的映射字典: { "85211": "[85211] example/build/..." }
    obj_files = {}
    
    # 匹配 Object file 行的正则，提取括号内的数字索引
    # 例如: [85211] example/build/libExample.a(source.o)
    obj_pattern = re.compile(r'^\[\s*(\d+)\]\s+.*')
    
    # 状态标记
    in_obj_section = False
    in_sym_section = False

    try:
        with open(linkmap_path, 'r', encoding='utf-8', errors='ignore') as f:
            for line in f:
                line = line.strip()
                
                # 状态机切换
                if line.startswith('# Object files:'):
                    in_obj_section = True
                    in_sym_section = False
                    continue
                elif line.startswith('# Sections:'):
                    in_obj_section = False
                    continue
                elif line.startswith('# Symbols:'):
                    in_obj_section = False
                    in_sym_section = True
                    continue
                
                # 1. 解析 Object files 部分，建立索引映射
                if in_obj_section:
                    match = obj_pattern.match(line)
                    if match:
                        idx = match.group(1)
                        obj_files[idx] = line
                
                # 2. 解析 Symbols 部分，查找 static initializer
                if in_sym_section:
                    # 匹配包含 __GLOBAL__sub_I_ 的行
                    if '__GLOBAL__sub_I_' in line:
                        # 提取当前符号所属的 object file 索引
                        match = re.search(r'\[\s*(\d+)\]', line)
                        if match:
                            idx = match.group(1)
                            # 输出符号行
                            print(line)
                            # 输出对应的 object file 行
                            if idx in obj_files:
                                print(obj_files[idx])
                            else:
                                print(f"[{idx}] Object file not found!")
                            print("-" * 60) # 打印分隔线，方便阅读

    except FileNotFoundError:
        print(f"Error: File '{linkmap_path}' not found.")
        sys.exit(1)

if __name__ == '__main__':
    if len(sys.argv) != 2:
        print("Usage: python3 find_initializers.py <path_to_linkmap_file>")
        sys.exit(1)
        
    linkmap_file = sys.argv[1]
    find_static_initializers(linkmap_file)
