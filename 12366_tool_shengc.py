import pandas as pd
import json
import os
import traceback
from datetime import datetime, timedelta
from collections import defaultdict
import tkinter as tk
from tkinter import ttk, filedialog, messagebox
import threading
import sys

# ==========================================
# 1. 核心业务规则配置 & 工具函数
# ==========================================
SHANDONG_CITIES = [
    '济南', '淄博', '枣庄', '东营', '烟台', '潍坊',
    '济宁', '泰安', '威海', '日照', '临沂', '德州', '聊城', '滨州', '菏泽'
]
EXCLUDED_CITIES = {'青岛', '青岛市'}
SHANDONG_DISTRICT_MAP = {
    '济南市': ['历下区', '市中区', '槐荫区', '天桥区', '历城区', '长清区', '章丘区', '济阳区', '莱芜区', '钢城区', '平阴县', '商河县'],
    '青岛市': ['市南区', '市北区', '黄岛区', '崂山区', '李沧区', '城阳区', '即墨区', '胶州市', '平度市', '莱西市'],
    '淄博市': ['淄川区', '张店区', '博山区', '临淄区', '周村区', '桓台县', '高青县', '沂源县'],
    '枣庄市': ['市中区', '薛城区', '峄城区', '台儿庄区', '山亭区', '滕州市'],
    '东营市': ['东营区', '河口区', '垦利区', '利津县', '广饶县'],
    '烟台市': ['芝罘区', '福山区', '牟平区', '莱山区', '蓬莱区', '龙口市', '莱阳市', '莱州市', '招远市', '栖霞市', '海阳市'],
    '潍坊市': ['潍城区', '寒亭区', '坊子区', '奎文区', '临朐县', '昌乐县', '青州市', '诸城市', '寿光市', '安丘市', '高密市', '昌邑市'],
    '济宁市': ['任城区', '兖州区', '微山县', '鱼台县', '金乡县', '嘉祥县', '汶上县', '泗水县', '梁山县', '曲阜市', '邹城市'],
    '泰安市': ['泰山区', '岱岳区', '宁阳县', '东平县', '新泰市', '肥城市'],
    '威海市': ['环翠区', '文登区', '荣成市', '乳山市'],
    '日照市': ['东港区', '岚山区', '莒县', '五莲县', '日照经济技术开发区', '日照高新技术产业开发区', '山海天旅游度假区'],
    '临沂市': ['兰山区', '罗庄区', '河东区', '沂南县', '郯城县', '沂水县', '兰陵县', '费县', '平邑县', '莒南县', '蒙阴县', '临沭县'],
    '德州市': ['德城区', '陵城区', '宁津县', '庆云县', '临邑县', '齐河县', '平原县', '夏津县', '武城县', '乐陵市', '禹城市'],
    '聊城市': ['东昌府区', '茌平区', '阳谷县', '莘县', '东阿县', '冠县', '高唐县', '临清市'],
    '滨州市': ['滨城区', '沾化区', '惠民县', '阳信县', '无棣县', '博兴县', '邹平市'],
    '菏泽市': ['牡丹区', '定陶区', '曹县', '单县', '成武县', '巨野县', '郓城县', '鄄城县', '东明县'],
}
DISTRICT_EXTRA_ALIASES = {
    '青岛市': ['西海岸新区', '青岛西海岸新区'],
    '日照市': ['日照经开区', '经开区', '开发区', '日照高新区', '高新区', '山海天'],
}
SPECIAL_TOPICS  = ['数电票', '减税降费', '社保费']
COMMA_WHITELIST = ['【减税降费】', '享受"六税两费"', '器具、设备']
INVALID_TEXT_VALUES = {'', 'nan', 'none', 'null', 'na', 'n/a', '未知细分'}
NOISE_CATEGORIES = {'未分类', '其他', '未知', '其它', '未匹配', '噪音', '离散数据', '噪音/离散数据', '其他问题'}
TOOL_FIELD_ALIASES = {
    'L1_Category': ['L1_Category', 'L1Category', '一级分类', '一级类别', '一级诉求分类', '诉求一级分类', '大类', 'L1'],
    'L2_Keywords': ['L2_Keywords', 'L2Keywords', '二级关键词', '二级分类', '二级类别', '诉求二级分类', '中类', 'L2'],
    'L2_Cluster': ['L2_Cluster', 'L2Cluster', '二级聚类', '二级簇'],
    'L3_Keywords': ['L3_Keywords', 'L3Keywords', '三级关键词', '三级分类', '三级类别', '诉求三级分类', '小类', 'L3'],
    'L3_Cluster': ['L3_Cluster', 'L3Cluster', '三级聚类', '三级簇'],
    'LLM_Keywords': ['LLM_Keywords', 'LLMKeywords', '关键词', '诉求关键词', '问题关键词'],
}

def clean_text(value):
    if value is None or pd.isna(value):
        return ''
    text = str(value).strip()
    return '' if text.lower() in INVALID_TEXT_VALUES else text

def normalize_col_name(name):
    text = clean_text(name)
    for ch in ('\ufeff', '\u200b', '\u200c', '\u200d', '\xa0'):
        text = text.replace(ch, '')
    return ''.join(text.split())

def normalize_tool_columns(df):
    df = df.copy()
    df.columns = [normalize_col_name(col) for col in df.columns]
    existing = {normalize_col_name(col): col for col in df.columns}
    rename_map = {}
    for canonical, aliases in TOOL_FIELD_ALIASES.items():
        if canonical in df.columns:
            continue
        for alias in aliases:
            hit = existing.get(normalize_col_name(alias))
            if hit:
                rename_map[hit] = canonical
                break
    return df.rename(columns=rename_map) if rename_map else df

def promote_tool_header_if_needed(df):
    alias_names = {normalize_col_name(alias) for aliases in TOOL_FIELD_ALIASES.values() for alias in aliases}
    if any(normalize_col_name(col) in alias_names for col in df.columns):
        return df
    for idx in range(min(20, len(df))):
        values = [normalize_col_name(value) for value in df.iloc[idx].tolist()]
        if sum(value in alias_names for value in values) >= 2:
            promoted = df.iloc[idx + 1:].copy()
            promoted.columns = values
            return promoted
    return df

def first_existing_field(df, names):
    normalized = {normalize_col_name(col): col for col in df.columns}
    for name in names:
        hit = normalized.get(normalize_col_name(name))
        if hit:
            return hit
    return None

def usable_category(value):
    text = clean_text(value)
    return '' if text in NOISE_CATEGORIES else text

def normalize_tool_location(value):
    text = clean_text(value)
    if not text:
        return ''
    if any(city in text for city in SHANDONG_CITIES) or any(city in text for city in EXCLUDED_CITIES):
        return text
    matched_cities = set()
    for city, districts in SHANDONG_DISTRICT_MAP.items():
        if any(district in text for district in districts):
            matched_cities.add(city)
    for city, aliases in DISTRICT_EXTRA_ALIASES.items():
        if any(alias in text for alias in aliases):
            matched_cities.add(city)
    return next(iter(matched_cities)) if len(matched_cities) == 1 else text

def adapt_tool_analysis_table(df):
    """仅转换输入字段；后续统计完整沿用定版 shengc.py。"""
    df = normalize_tool_columns(promote_tool_header_if_needed(df)).fillna('')
    has_tool_categories = any(col in df.columns for col in ('L1_Category', 'L2_Keywords', 'L2_Cluster', 'L3_Keywords', 'L3_Cluster'))
    if not has_tool_categories:
        return df, False

    blank = pd.Series('', index=df.index)
    l1_series = df['L1_Category'] if 'L1_Category' in df.columns else blank
    l2_primary = df['L2_Keywords'] if 'L2_Keywords' in df.columns else blank
    l2_fallback = df['L2_Cluster'] if 'L2_Cluster' in df.columns else blank
    l3_primary = df['L3_Keywords'] if 'L3_Keywords' in df.columns else blank
    if 'LLM_Keywords' in df.columns:
        l3_primary = l3_primary.where(l3_primary.astype(str).str.strip() != '', df['LLM_Keywords'])
    l3_fallback = df['L3_Cluster'] if 'L3_Cluster' in df.columns else blank

    def build_path(idx):
        nodes = (
            usable_category(l1_series.at[idx]),
            usable_category(l2_primary.at[idx]) or usable_category(l2_fallback.at[idx]),
            usable_category(l3_primary.at[idx]) or usable_category(l3_fallback.at[idx]),
        )
        return '->'.join(node for node in nodes if node)

    df['业务类型'] = [build_path(idx) for idx in df.index]
    df['业务类别'] = [usable_category(value) for value in l1_series]
    df['举报小类'] = [usable_category(value) for value in l3_primary]
    date_field = first_existing_field(df, ['登记日期', '受理时间', '对话时间', '咨询时间', '会话时间', '创建时间', '日期', '工单时间', '登记时间'])
    location_field = first_existing_field(df, ['问题发生地', '来电人所在地', '所属地市', '地市', '税务机关', '主管税务机关', '关联_主管税务机关', '区县'])
    df['统一日期'] = df[date_field] if date_field else ''
    if '问题发生地' not in df.columns:
        df['问题发生地'] = df[location_field].map(normalize_tool_location) if location_field else ''
    else:
        df['问题发生地'] = df['问题发生地'].map(normalize_tool_location)
    print('✅ 已识别诉求分析工具输出表，分类路径按 L1 → L2 → L3 转换。')
    print(f"   日期字段: {date_field or '未匹配'}；地区字段: {location_field or '未匹配'}")
    print(f"   有效分类记录: {(df['业务类型'].astype(str).str.strip() != '').sum()} / {len(df)} 条")
    return df, True

def read_csv_safe(file_path, header=0):
    encodings = ['utf-8-sig', 'utf-8', 'gbk', 'gb18030']
    for enc in encodings:
        try:
            return pd.read_csv(file_path, encoding=enc, header=header, low_memory=False)
        except Exception:
            continue
    print(f"⚠️ 警告: 无法检测到 {os.path.basename(file_path)} 的标准编码，尝试容错模式...")
    return pd.read_csv(file_path, encoding='utf-8', errors='ignore', header=header, low_memory=False)

def parse_location(loc):
    loc = clean_text(loc)
    if not loc or loc == '未知': return '未知'
    if any(city in loc for city in EXCLUDED_CITIES): return '排除城市'
    for city in SHANDONG_CITIES:
        if city in loc: return f'{city}市'
    if '山东' in loc: return '山东省内(未指明市)'
    return '外省'

def get_month_start(d):
    return d.replace(day=1)

def get_next_month_start(d):
    return (d.replace(day=28) + timedelta(days=4)).replace(day=1)

def split_items(s):
    s = clean_text(s)
    if not s: return []
    if any(kw in s for kw in COMMA_WHITELIST): return [s.strip()]
    return [clean_text(x) for x in s.replace('，', ',').split(',') if clean_text(x)]

def extract_micro_cats(raw_type):
    results = []
    for part in split_items(raw_type):
        nodes = [clean_text(n) for n in part.split('->') if clean_text(n)]
        if nodes: results.append(nodes[-1])
    return results

def extract_second_nodes(raw_type):
    results = set()
    for part in split_items(raw_type):
        nodes = [clean_text(n) for n in part.split('->') if clean_text(n)]
        results.add(nodes[1] if len(nodes) >= 2 else (nodes[0] if nodes else ''))
    return list(results - {''})

def normalize_report_node(node, idx=0):
    node = clean_text(node)
    if idx > 0 and ('自然人税收管理系统' in node or 'ITS' in node.upper()):
        return '电子申报系统'
    return node

def normalize_type_path(raw_type, cat='', lv3=''):
    raw_type = clean_text(raw_type)
    cat = clean_text(cat)
    lv3 = clean_text(lv3).replace(',', '、').replace('，', '、')

    if raw_type in ('服务言行', '服务质效', '侵害权益', '表扬'):
        raw_type = f'服务投诉->{raw_type}{"->"+lv3 if lv3 else ""}'
    elif raw_type in ('轻微纳税人税收违法行为举报', '纳税人一般税收违法行为举报', '一般涉税违法举报', '税务机关和税务人员税收违法行政行为举报'):
        raw_type = f'涉税举报->{raw_type}{"->"+lv3 if lv3 else ""}'
    elif raw_type == '减免政策如何规定？【减税降费】':
        raw_type = '问题解答->减税降费->减免政策如何规定？【减税降费】'

    normalized_paths = []
    for part in split_items(raw_type):
        nodes = [clean_text(n) for n in part.split('->') if clean_text(n)]
        if not nodes:
            continue

        first = nodes[0]
        if first in ('服务', '服务投诉') or cat == '服务':
            nodes[0] = '服务投诉'
        elif first == '投诉、举报工单反馈' or '举报工单反馈' in first or first == '涉税举报':
            nodes[0] = '涉税举报'
        elif first == '问题咨询':
            nodes[0] = '问题解答'
        elif first != '问题解答':
            nodes = ['问题解答'] + nodes

        nodes = [normalize_report_node(n, idx) for idx, n in enumerate(nodes)]
        normalized_paths.append('->'.join(nodes))

    if not normalized_paths:
        return '', ''

    roots = []
    for path in normalized_paths:
        root = path.split('->', 1)[0]
        if root not in roots:
            roots.append(root)
    return ','.join(normalized_paths), ','.join(roots)

def is_complaint(cat, raw_type):
    return '服务投诉' in cat or '服务投诉' in raw_type

def read_excel_compat(file_path, **kwargs):
    ext = os.path.splitext(file_path)[-1].lower()
    engine = 'openpyxl' if ext in ('.xlsx', '.xlsm') else 'xlrd'
    return pd.read_excel(file_path, engine=engine, **kwargs)

# ==========================================
# 2. 数据加载模块
# ==========================================
def load_detail_file(file_path, channel_name):
    if not file_path or not os.path.exists(file_path):
        print(f"⚠️ 提示: 未找到 [{channel_name}] 的明细文件 ({file_path})，该渠道数据将为空。")
        return pd.DataFrame()
    try:
        ext = os.path.splitext(file_path)[-1].lower()
        df = read_csv_safe(file_path) if ext == '.csv' else read_excel_compat(file_path)

        if channel_name == '12366热线':
            df, adapted = adapt_tool_analysis_table(df)
            if adapted:
                df['数据来源渠道'] = channel_name
                print(f"✅ 成功加载 [{channel_name}] 工具分类数据: {len(df)} 条")
                return df

        common_headers = ['登记日期', '受理时间', '对话时间', '日期', '业务类型', '业务类别', 'L1_Category']
        if not any(header in df.columns for header in common_headers):
            df = read_csv_safe(file_path, header=1) if ext == '.csv' else read_excel_compat(file_path, header=1)

        df = df.fillna('')

        date_field = next((f for f in ['登记日期', '受理时间', '对话时间', '日期', '工单时间', '登记时间'] if f in df.columns), None)
        if not date_field:
            for col in df.columns:
                if '日期' in str(col) or '时间' in str(col):
                    date_field = col
                    break

        df['统一日期'] = df[date_field] if date_field else ''
        df['数据来源渠道'] = channel_name
        print(f"✅ 成功加载 [{channel_name}] 明细数据: {len(df)} 条")
        return df
    except Exception as e:
        print(f"❌ 加载 [{channel_name}] 失败: {e}")
        return pd.DataFrame()

# ==========================================
# 3. 核心报告数据构建
# ==========================================
def find_unified_date_column(df):
    if df is None or df.empty:
        return None
    for col in ('统一日期', '缁熶竴鏃ユ湡'):
        if col in df.columns:
            return col
    date_tokens = ('日期', '时间', '鏃ユ湡', '鏃堕棿')
    for col in df.columns:
        if any(token in str(col) for token in date_tokens):
            return col
    return None

def get_latest_month_start(df):
    date_col = find_unified_date_column(df)
    if not date_col:
        return None
    dates = pd.to_datetime(df[date_col], errors='coerce').dropna()
    if dates.empty:
        return None
    return get_month_start(dates.max().date())

def filter_to_month(df, month_start):
    if df is None or df.empty or month_start is None:
        return df
    date_col = find_unified_date_column(df)
    if not date_col:
        return df
    dates = pd.to_datetime(df[date_col], errors='coerce')
    next_month = get_next_month_start(month_start)
    mask = (dates.dt.date >= month_start) & (dates.dt.date < next_month)
    return df.loc[mask].copy()

def build_call_volume_data(df):
    channel_stats = defaultdict(int)
    loc_map = defaultdict(int)
    monthly_map = defaultdict(int)
    monthly_bounds = {}
    min_date = max_date = None

    if df is None or df.empty:
        return {
            'meta': {
                'totalRecords': 0,
                'dateMin': None,
                'dateMax': None,
                'currentMonthStart': None,
                'currentMonthEnd': None,
                'currentWeekStart': None,
                'currentWeekEnd': None,
                'generatedAt': datetime.now().isoformat(),
            },
            'channelSummary': [],
            'locationList': [],
            'trendData': [],
        }

    date_col = find_unified_date_column(df)
    if not date_col:
        return build_call_volume_data(pd.DataFrame())

    for _, row in df.iterrows():
        d = pd.to_datetime(row.get(date_col, ''), errors='coerce')
        if pd.isna(d):
            continue

        ch = clean_text(row.get('数据来源渠道', '')) or '未知渠道'
        loc = parse_location(row.get('问题发生地', ''))
        if loc == '排除城市':
            continue

        if min_date is None or d < min_date:
            min_date = d
        if max_date is None or d > max_date:
            max_date = d

        month_key = get_month_start(d.date()).isoformat()
        if month_key not in monthly_bounds:
            monthly_bounds[month_key] = {'start': d.date(), 'end': d.date()}
        else:
            if d.date() < monthly_bounds[month_key]['start']:
                monthly_bounds[month_key]['start'] = d.date()
            if d.date() > monthly_bounds[month_key]['end']:
                monthly_bounds[month_key]['end'] = d.date()

        channel_stats[ch] += 1
        monthly_map[month_key] += 1
        if loc not in ('未知', '外省', '山东省内(未指明市)'):
            loc_map[loc] += 1

    all_months = sorted(monthly_map.keys())
    curr_month = all_months[-1] if all_months else None
    current_month_start = monthly_bounds[curr_month]['start'].isoformat() if curr_month and curr_month in monthly_bounds else None
    current_month_end = monthly_bounds[curr_month]['end'].isoformat() if curr_month and curr_month in monthly_bounds else None

    return {
        'meta': {
            'totalRecords': sum(channel_stats.values()),
            'dateMin': min_date.strftime('%Y-%m-%d') if min_date else None,
            'dateMax': max_date.strftime('%Y-%m-%d') if max_date else None,
            'currentMonthStart': current_month_start,
            'currentMonthEnd': current_month_end,
            'currentWeekStart': current_month_start,
            'currentWeekEnd': current_month_end,
            'generatedAt': datetime.now().isoformat(),
        },
        'channelSummary': [
            {'name': name, 'total': total, 'topicSummary': [], 'top3': []}
            for name, total in sorted(channel_stats.items(), key=lambda x: -x[1])
        ],
        'locationList': sorted(
            [{'name': k, 'value': v} for k, v in loc_map.items()],
            key=lambda x: -x['value']
        ),
        'trendData': [{'month': month, 'count': cnt} for month, cnt in sorted(monthly_map.items())],
    }

def build_report_data(df, progress_cb=None):
    total = len(df)
    cat_map     = defaultdict(int)
    sub_cat_map = defaultdict(int)
    loc_map     = defaultdict(int)
    monthly_map  = defaultdict(int)
    monthly_bounds = {}

    channel_stats = defaultdict(lambda: {
        'total': 0, 'voice': 0, 'human': 0,
        'sub': defaultdict(int),
        'topic_tree': defaultdict(lambda: defaultdict(int)),
    })

    city_stats = defaultdict(lambda: {'total': 0, 'types': defaultdict(int)})
    monthly_type_stats = defaultdict(lambda: {'total': 0, 'types': defaultdict(int)})
    global_topic_tree = defaultdict(lambda: {'total': 0, 'hot': defaultdict(int)})
    l1_topic_tree = defaultdict(lambda: {
        'total': 0,
        'children': defaultdict(lambda: {'total': 0, 'hot': defaultdict(int)}),
    })
    l3_detail_stats = defaultdict(lambda: {
        'value': 0,
        'district': defaultdict(int),
        'industry': defaultdict(int),
        'persona': defaultdict(int),
        'period': defaultdict(int),
    })

    complaint_sub_map = defaultdict(int)
    complaint_total   = 0
    consult_total = 0
    interactive_cube_map = defaultdict(int)

    min_date = max_date = None

    # 计算进度汇报频率（约20次上报，降低UI刷新压力）
    report_step = max(1, total // 20)

    for i, (_, row) in enumerate(df.iterrows()):
        # ----- 进度条实时更新（占整体进度的 30% -> 70% 阶段） -----
        if progress_cb and i % report_step == 0:
            current_pct = 30 + (i / total) * 40
            progress_cb(current_pct, f"正在清洗与分类诉求数据... ({i}/{total} 条)")

        raw_date = row['统一日期']
        try:
            d = pd.to_datetime(raw_date, errors='coerce')
            if pd.isna(d): continue
        except:
            continue

        raw_type = clean_text(row.get('业务类型', ''))
        cat      = clean_text(row.get('业务类别', ''))
        lv3      = clean_text(row.get('举报小类', '')).replace(',', '、').replace('，', '、')
        loc      = parse_location(row.get('问题发生地', ''))
        ch       = clean_text(row.get('数据来源渠道', ''))
        if loc == '排除城市':
            continue

        raw_type, normalized_cat = normalize_type_path(raw_type, cat, lv3)
        if not raw_type:
            continue
        cat = normalized_cat

        cats         = split_items(cat) or ['未知大类']
        micro_cats   = extract_micro_cats(raw_type)
        second_nodes = extract_second_nodes(raw_type)
        month_key    = get_month_start(d.date()).isoformat()

        if min_date is None or d < min_date: min_date = d
        if max_date is None or d > max_date: max_date = d
        if month_key not in monthly_bounds:
            monthly_bounds[month_key] = {'start': d.date(), 'end': d.date()}
        else:
            if d.date() < monthly_bounds[month_key]['start']:
                monthly_bounds[month_key]['start'] = d.date()
            if d.date() > monthly_bounds[month_key]['end']:
                monthly_bounds[month_key]['end'] = d.date()

        for c in cats: cat_map[c] += 1
        for mc in micro_cats: sub_cat_map[mc] += 1
        loc_map[loc] += 1
        monthly_map[month_key] += 1

        for part in split_items(raw_type):
            nodes = [clean_text(n) for n in part.split('->') if clean_text(n)]
            if not nodes: continue
            topic_name = ''
            if nodes[0] == '问题解答' and len(nodes) >= 2:
                topic_name = nodes[1]
            elif nodes:
                topic_name = nodes[0]
            if topic_name and topic_name != '未知细分':
                global_topic_tree[topic_name]['total'] += 1
                leaf = nodes[-1]
                if leaf:
                    global_topic_tree[topic_name]['hot'][leaf] += 1

            # 为征纳互动模板的两个分类模块构建 L1 → L2 → L3 数据。
            business_nodes = nodes[1:] if nodes[0] in ('问题解答', '服务投诉', '涉税举报') else nodes
            if business_nodes:
                l1_name = business_nodes[0]
                l2_name = business_nodes[1] if len(business_nodes) >= 2 else business_nodes[0]
                l3_name = business_nodes[-1]
                l1_topic_tree[l1_name]['total'] += 1
                l1_topic_tree[l1_name]['children'][l2_name]['total'] += 1
                l1_topic_tree[l1_name]['children'][l2_name]['hot'][l3_name] += 1

                def first_row_text(field_names):
                    for field_name in field_names:
                        value = clean_text(row.get(field_name, ''))
                        if value:
                            return value
                    return '-'

                detail = l3_detail_stats[l3_name]
                detail['value'] += 1
                detail['district'][first_row_text(('区县', '所属区县', '问题发生地', '来电人所在地'))] += 1
                detail['industry'][first_row_text(('行业门类', '行业', '所属行业', '行业类别'))] += 1
                detail['persona'][first_row_text(('经办人身份', '办理人身份', '人员身份', '用户身份', '咨询人身份'))] += 1
                detail['period'][d.strftime('%Y-%m')] += 1

        if '问题咨询' in cats or '问题解答' in ''.join([raw_type]):
            consult_total += 1

        mts = monthly_type_stats[month_key]
        mts['total'] += 1
        for node in (second_nodes or micro_cats):
            mts['types'][node] += 1

        if loc not in ('未知', '外省', '山东省内(未指明市)'):
            city_stats[loc]['total'] += 1
            for part in split_items(raw_type):
                nodes = [clean_text(n) for n in part.split('->') if clean_text(n)]
                if nodes:
                    issue = nodes[1] if len(nodes) >= 2 else nodes[0]
                    if issue not in ('未知细分', ''):
                        city_stats[loc]['types'][issue] += 1

        if ch:
            channel_stats[ch]['total'] += 1
            for part in split_items(raw_type):
                nodes = [clean_text(n) for n in part.split('->') if clean_text(n)]
                if not nodes: continue
                topic_name = ''
                if nodes[0] == '问题解答' and len(nodes) >= 2:
                    topic_name = nodes[1]
                elif nodes:
                    topic_name = nodes[0]
                if topic_name and topic_name != '未知细分':
                    leaf = nodes[-1]
                    channel_stats[ch]['topic_tree'][topic_name][leaf] += 1
                for hk in (micro_cats or second_nodes):
                    channel_stats[ch]['sub'][hk] += 1

        if is_complaint(cat, raw_type):
            complaint_total += 1
            for ck in micro_cats:
                if ck: complaint_sub_map[ck] += 1

        date_str = d.strftime('%Y-%m-%d')
        cube_key = (date_str, cat, raw_type, loc, ch)
        interactive_cube_map[cube_key] += 1

    if progress_cb: progress_cb(70, "正在聚合多维指标...")

    global_topic_summary = []
    for topic_name, data in global_topic_tree.items():
        hot_topics = sorted(
            [{'name': k, 'value': v} for k, v in data['hot'].items()],
            key=lambda x: -x['value']
        )
        global_topic_summary.append({
            'name': topic_name,
            'total': data['total'],
            'hotTopics': hot_topics,
            'top3': [t['name'] for t in hot_topics[:3]],
        })
    global_topic_summary.sort(key=lambda x: -x['total'])

    l1_topic_summary = []
    for l1_name, l1_data in l1_topic_tree.items():
        topic_summary = []
        for l2_name, l2_data in l1_data['children'].items():
            hot_topics = sorted(
                [{'name': name, 'value': value} for name, value in l2_data['hot'].items()],
                key=lambda item: -item['value']
            )
            topic_summary.append({
                'name': l2_name,
                'total': l2_data['total'],
                'hotTopics': hot_topics,
            })
        topic_summary.sort(key=lambda item: -item['total'])
        l1_topic_summary.append({
            'name': l1_name,
            'total': l1_data['total'],
            'topicSummary': topic_summary,
        })
    l1_topic_summary.sort(key=lambda item: -item['total'])

    def top_detail_item(values):
        if not values:
            return {'name': '-', 'value': 0}
        name, value = max(values.items(), key=lambda item: item[1])
        return {'name': name, 'value': value}

    l3_detail_summary = []
    for l3_name, detail in l3_detail_stats.items():
        l3_detail_summary.append({
            'name': l3_name,
            'value': detail['value'],
            'topDistrict': top_detail_item(detail['district']),
            'topIndustry': top_detail_item(detail['industry']),
            'topPersona': top_detail_item(detail['persona']),
            'topPeriod': top_detail_item(detail['period']),
        })
    l3_detail_summary.sort(key=lambda item: -item['value'])

    channel_summary = []
    for name, data in sorted(channel_stats.items(), key=lambda x: -x[1]['total']):
        topic_list = []
        for topic_name, hot_map in data['topic_tree'].items():
            hot_sorted = sorted(
                [{'name': k, 'value': v} for k, v in hot_map.items()],
                key=lambda x: -x['value']
            )
            topic_total = sum(h['value'] for h in hot_sorted)
            topic_list.append({
                'name': topic_name,
                'total': topic_total,
                'hotTopics': hot_sorted,
            })
        topic_list.sort(key=lambda x: -x['total'])
        channel_summary.append({
            'name': name,
            'total': data['total'],
            'topicSummary': topic_list,
            'top3': [t['name'] for t in topic_list[:3]],
        })

    all_months = sorted(monthly_map.keys())
    curr_month = all_months[-1] if all_months else None
    prev_month = all_months[-2] if len(all_months) >= 2 else None
    current_month_start = monthly_bounds[curr_month]['start'].isoformat() if curr_month and curr_month in monthly_bounds else None
    current_month_end = monthly_bounds[curr_month]['end'].isoformat() if curr_month and curr_month in monthly_bounds else None
    consult_anomalies = []
    if curr_month and prev_month:
        curr_s, prev_s = monthly_type_stats[curr_month], monthly_type_stats[prev_month]
        if curr_s['total'] > 0 and prev_s['total'] > 0:
            for t_name in set(list(curr_s['types']) + list(prev_s['types'])):
                c_cnt = curr_s['types'].get(t_name, 0)
                p_cnt = prev_s['types'].get(t_name, 0)
                if c_cnt == 0 and p_cnt == 0: continue
                diff  = c_cnt - p_cnt
                ratio = (c_cnt / p_cnt) if p_cnt > 0 else (float('inf') if c_cnt > 0 else 1)
                is_surge   = ratio > 1.1 and diff > 5
                is_decline = ratio < (1 / 1.1) and diff < -5
                if is_surge or is_decline:
                    consult_anomalies.append({
                        'name': t_name,
                        'currVol': c_cnt, 'prevVol': p_cnt,
                        'prevRate': str(p_cnt), 'currRate': str(c_cnt),
                        'changePoints': ('+' if diff > 0 else '') + str(diff),
                        'changePct': f'{abs(ratio - 1) * 100:.0f}%' if p_cnt > 0 else 'N/A',
                        'trend': 'up' if is_surge else 'down',
                    })
            consult_anomalies.sort(key=lambda x: abs(int(x['changePoints'])), reverse=True)

    second_cat_provincial = defaultdict(int)
    for cs in city_stats.values():
        for cat_name, cnt in cs['types'].items():
            second_cat_provincial[cat_name] += cnt
    prov_total = sum(second_cat_provincial.values())

    best_practice = []
    for cat_name, cnt in sorted(second_cat_provincial.items(), key=lambda x: -x[1]):
        rate = cnt / prov_total if prov_total > 0 else 0
        if rate < 0.01: continue
        best_city, lowest_rate = '', 1.0
        city_details_list = []
        for city, cs in city_stats.items():
            if cs['total'] > 20:
                city_rate = cs['types'].get(cat_name, 0) / cs['total']
                city_details_list.append({'city': city, 'rate': city_rate, 'rateStr': f'{city_rate * 100:.1f}%'})
                if city_rate < rate * 0.7 and city_rate < lowest_rate:
                    lowest_rate, best_city = city_rate, city
        city_details_list.sort(key=lambda x: x['rate'])
        if best_city:
            best_practice.append({
                'issueName': cat_name,
                'provincialRate': f'{rate * 100:.1f}%',
                'bestCity': best_city,
                'bestCityRate': f'{lowest_rate * 100:.1f}%',
                'cityDetails': city_details_list,
            })

    def build_type_tree_for_rows(rows):
        tree = {}
        for row in rows:
            raw_type = row.get('type', '')
            if not split_items(raw_type): continue
            for path in split_items(raw_type):
                nodes = [clean_text(n) for n in path.split('->') if clean_text(n)]
                if not nodes: continue
                current = tree
                for node in nodes:
                    if node not in current:
                        current[node] = {'value': 0, 'children': {}}
                    current[node]['value'] += row.get('count', 1)
                    current = current[node]['children']
        return tree

    cube_rows = [
        {'date': k[0], 'cat': k[1], 'type': k[2], 'loc': k[3], 'channel': k[4], 'count': v}
        for k, v in interactive_cube_map.items()
    ]

    global_type_tree = build_type_tree_for_rows(cube_rows)

    def serialize_tree(tree, path=''):
        result = {}
        for name, node in tree.items():
            result[name] = {
                'value': node['value'],
                'hasChildren': bool(node['children']),
                'children': serialize_tree(node['children'], path + '/' + name) if node['children'] else {}
            }
        return result

    # 过滤掉不需要的大类
    EXCLUDED_CATEGORIES = {'投诉、举报工单反馈', '服务'}
    global_type_tree = {k: v for k, v in global_type_tree.items() if k not in EXCLUDED_CATEGORIES}
    serialized_tree = serialize_tree(global_type_tree)

    location_list = sorted(
        [{'name': k, 'value': v} for k, v in loc_map.items()
         if k not in ('未知', '山东省内(未指明市)')],
        key=lambda x: -x['value']
    )

    effective_total = sum(monthly_map.values())
    denominator = effective_total or 1

    return {
        'meta': {
            'totalRecords': effective_total,
            'consultTotal': consult_total,
            'dateMin': min_date.strftime('%Y-%m-%d') if min_date else None,
            'dateMax': max_date.strftime('%Y-%m-%d') if max_date else None,
            'currentMonthStart': current_month_start,
            'currentMonthEnd': current_month_end,
            'currentWeekStart': current_month_start,
            'currentWeekEnd': current_month_end,
            'generatedAt': datetime.now().isoformat(),
        },
        'channelSummary': channel_summary,
        'globalTopicSummary': global_topic_summary,
        'l1TopicSummary': l1_topic_summary,
        'l3Summary': [
            {'name': item['name'], 'value': item['value']}
            for item in l3_detail_summary
        ],
        'l3DetailSummary': l3_detail_summary,
        'consultAnomalies': consult_anomalies,
        'bestPracticeInsights': best_practice,
        'complaintTotal': complaint_total,
        'complaintTopics': sorted(
            [{'name': k, 'value': v} for k, v in complaint_sub_map.items()],
            key=lambda x: -x['value']
        )[:8],
        'macroDemandStatus': sorted(
            [{'name': k, 'value': v, 'percent': round(v / denominator * 100, 2)} for k, v in cat_map.items()],
            key=lambda x: -x['percent']
        )[:5],
        'topMicroCategories': sorted(
            [{'name': k, 'value': v, 'percent': round(v / denominator * 100, 2)} for k, v in sub_cat_map.items()],
            key=lambda x: -x['percent']
        )[:8],
        'trendData': [{'month': month, 'count': cnt} for month, cnt in sorted(monthly_map.items())],
        'locationList': location_list,
        'globalTypeTree': serialized_tree,
        'interactiveRows': cube_rows,
    }

# ==========================================
# 4. 生成报告核心逻辑
# ==========================================
def generate_offline_report(data_12366_path, template_path, output_dir, progress_cb=None):
    print(f"\n[{datetime.now().strftime('%H:%M:%S')}] 开始生成12366工具分类版月报...")

    if progress_cb: progress_cb(5, "正在读取 12366 明细表...")
    df_12366 = load_detail_file(data_12366_path, '12366热线')

    if df_12366.empty:
        print("❌ 错误：12366 明细数据未成功加载，无法生成报告！")
        return False

    if progress_cb: progress_cb(25, "正在筛选最新月份数据...")
    month_start = get_latest_month_start(df_12366)
    df_12366_month = filter_to_month(df_12366, month_start)

    # Main report sections use only 12366 detail rows for the latest report month.
    report_data = build_report_data(df_12366_month, progress_cb=progress_cb)
    report_history_data = build_report_data(df_12366)
    report_data['consultAnomalies'] = report_history_data.get('consultAnomalies', [])
    report_data['bestPracticeInsights'] = report_history_data.get('bestPracticeInsights', [])
    call_volume_data = build_call_volume_data(df_12366_month)

    if progress_cb: progress_cb(75, "正在生成来电量指标...")
    report_data['tableEtax'] = []
    report_data['tableHall'] = []
    report_data['callVolume'] = {
        'meta': call_volume_data.get('meta', {}),
        'channelSummary': call_volume_data.get('channelSummary', []),
        'locationList': call_volume_data.get('locationList', []),
        'trendData': call_volume_data.get('trendData', []),
    }

    if progress_cb: progress_cb(85, "数据处理完毕，正在嵌入 HTML 网页模板...")
    try:
        json_str  = json.dumps(report_data, ensure_ascii=False).replace('</script>', '<\\/script>')
        injection = f"<script>window.__REPORT_DATA__ = {json_str};</script>"

        with open(template_path, 'r', encoding='utf-8') as f:
            html_content = f.read()

        if '<title>' in html_content:
            final_html = html_content.replace('<title>', injection + '<title>', 1)
        elif '<head>' in html_content:
            final_html = html_content.replace('<head>', '<head>' + injection, 1)
        else:
            final_html = injection + html_content

        os.makedirs(output_dir, exist_ok=True)
        out_path = os.path.join(output_dir, f"分析报告_{datetime.now().strftime('%Y%m%d_%H%M')}.html")

        if progress_cb: progress_cb(95, "正在输出最终文件...")
        with open(out_path, 'w', encoding='utf-8') as f:
            f.write(final_html)

        print(f"\n✅ 生成完毕！共统计明细记录 {report_data['meta']['totalRecords']} 条。")
        print(f"报告已保存至：\n{out_path}\n")
        
        if progress_cb: progress_cb(100, "生成成功！")
        return True

    except Exception as e:
        print(f"❌ 写入 HTML 失败: {str(e)}")
        traceback.print_exc()
        return False


# ==========================================
# 6. 图形化用户界面 (GUI)
# ==========================================
def get_app_base_path():
    """获取程序运行时的绝对路径（兼容直接跑py文件、打包后的exe文件以及交互式环境）"""
    if getattr(sys, 'frozen', False):
        return os.path.dirname(sys.executable)
    else:
        try:
            return os.path.dirname(os.path.abspath(__file__))
        except NameError:
            return os.getcwd()

def get_default_template_path():
    """获取默认模板路径：exe 打包后从 sys._MEIPASS 读取内嵌文件，开发模式从脚本同目录读取"""
    if getattr(sys, 'frozen', False):
        return os.path.join(sys._MEIPASS, 'index.html')
    else:
        try:
            return os.path.join(os.path.dirname(os.path.abspath(__file__)), 'index.html')
        except NameError:
            return os.path.join(os.getcwd(), 'index.html')

class RedirectText(object):
    def __init__(self, text_ctrl):
        self.output = text_ctrl

    def write(self, string):
        self.output.insert(tk.END, string)
        self.output.see(tk.END)

    def flush(self):
        pass

class ReportApp:
    def __init__(self, root):
        self.root = root
        self.root.title("山东税务12366热线诉求分析月报（工具分类版）v1.0")
        self.root.geometry("720x650")  # 增加了高度以容纳进度条
        self.root.configure(bg="#F3F3F3", padx=20, pady=20)
        
        self.setup_styles()
        self.base_path = get_app_base_path()
        
        self.path_12366 = tk.StringVar()
        self.path_template = tk.StringVar(value=get_default_template_path())
        self.dir_output = tk.StringVar(value=os.path.join(self.base_path, '生成报告'))

        self.create_widgets()

    def setup_styles(self):
        style = ttk.Style()
        style.theme_use('clam')
        
        default_font = ("Microsoft YaHei", 9)
        title_font = ("Microsoft YaHei", 12, "bold")
        
        style.configure(".", font=default_font, background="#F3F3F3")
        style.configure("Card.TLabelframe", background="#FFFFFF", borderwidth=1, relief="solid")
        style.configure("Card.TLabelframe.Label", font=("Microsoft YaHei", 10, "bold"), background="#F3F3F3", foreground="#005A9E")
        
        style.configure("Inner.TFrame", background="#FFFFFF")
        style.configure("Inner.TLabel", background="#FFFFFF", font=default_font)
        
        style.configure("TButton", font=default_font, padding=4)
        style.configure("Accent.TButton", font=title_font, foreground="#FFFFFF", background="#0078D7", padding=6)
        style.map("Accent.TButton", background=[("active", "#106EBE")])

        # 进度条样式
        style.configure("TProgressbar", thickness=15, background="#0078D7", troughcolor="#E1DFDD")

    def create_widgets(self):
        header_frame = ttk.Frame(self.root)
        header_frame.pack(fill="x", pady=(0, 15))
        
        title_lbl = tk.Label(header_frame, text="山东税务12366热线诉求分析月报", font=("Microsoft YaHei", 16, "bold"), bg="#F3F3F3", fg="#333333")
        title_lbl.pack(anchor="w")
        
        desc_lbl = tk.Label(header_frame, text="读取本月与上月12366工具分类结果，沿用12366定版模板生成月报。", font=("Microsoft YaHei", 9), bg="#F3F3F3", fg="#666666")
        desc_lbl.pack(anchor="w", pady=(5, 0))

        form_frame = ttk.LabelFrame(self.root, text=" 数据源配置 ", style="Card.TLabelframe", padding=(15, 10))
        form_frame.pack(fill="x", pady=5)

        def add_row(parent, label_text, var, is_dir=False, filetypes=None):
            row = ttk.Frame(parent, style="Inner.TFrame")
            row.pack(fill="x", pady=8)
            
            lbl = ttk.Label(row, text=label_text, width=22, anchor="e", style="Inner.TLabel")
            lbl.pack(side="left", padx=(0, 10))
            
            entry = ttk.Entry(row, textvariable=var)
            entry.pack(side="left", fill="x", expand=True)
            
            def browse():
                if is_dir:
                    p = filedialog.askdirectory(initialdir=self.base_path)
                else:
                    p = filedialog.askopenfilename(initialdir=self.base_path, filetypes=filetypes or [("All Files", "*.*")])
                if p:
                    var.set(p)

            btn = ttk.Button(row, text="浏览...", command=browse, width=8)
            btn.pack(side="right", padx=(10, 0))

        csv_types = [("CSV/Excel 文件", "*.csv *.xlsx *.xls")]
        html_types = [("HTML 网页模板", "*.html *.htm")]

        add_row(form_frame, "12366月度工具分析结果表:", self.path_12366, filetypes=csv_types)
        
        sep = ttk.Separator(form_frame, orient="horizontal")
        sep.pack(fill="x", pady=10)
        
        add_row(form_frame, "前端模板文件 (HTML):", self.path_template, filetypes=html_types)
        add_row(form_frame, "报告保存位置 (目录):", self.dir_output, is_dir=True)

        # --- 进度显示与按钮区域 ---
        btn_frame = ttk.Frame(self.root)
        btn_frame.pack(fill="x", pady=15)
        
        self.status_var = tk.StringVar(value="等待开始...")
        self.progress_var = tk.DoubleVar(value=0.0)

        # 状态文字标签
        status_lbl = ttk.Label(btn_frame, textvariable=self.status_var, font=("Microsoft YaHei", 9), foreground="#666666")
        status_lbl.pack(fill="x", pady=(0, 5))

        # 进度条控件
        self.progress_bar = ttk.Progressbar(btn_frame, orient="horizontal", variable=self.progress_var, mode="determinate", maximum=100)
        self.progress_bar.pack(fill="x", pady=(0, 10))
        
        # 核心按钮
        self.generate_btn = ttk.Button(btn_frame, text="生成分析报告", style="Accent.TButton", command=self.start_generation)
        self.generate_btn.pack(fill="x", ipady=4)

        # --- 日志区域 ---
        log_frame = ttk.LabelFrame(self.root, text=" 运行日志 ", style="Card.TLabelframe")
        log_frame.pack(fill="both", expand=True)

        self.log_text = tk.Text(log_frame, wrap="word", font=("Consolas", 9), bg="#1E1E1E", fg="#D4D4D4", height=8, borderwidth=0)
        scrollbar = ttk.Scrollbar(log_frame, command=self.log_text.yview)
        self.log_text.configure(yscrollcommand=scrollbar.set)
        
        self.log_text.pack(side="left", fill="both", expand=True, padx=2, pady=2)
        scrollbar.pack(side="right", fill="y", pady=2)

        self.log_text.insert(tk.END, f"系统已就绪。\n默认根目录: {self.base_path}\n请选择上方数据文件...\n")

        sys.stdout = RedirectText(self.log_text)
        sys.stderr = RedirectText(self.log_text)

    def update_progress(self, value, text=None):
        """线程安全地更新界面进度条和状态文字"""
        def _update():
            self.progress_var.set(value)
            if text:
                self.status_var.set(text)
        self.root.after(0, _update)

    def start_generation(self):
        required_paths = [self.path_12366.get(), self.path_template.get(), self.dir_output.get()]
        if not all(required_paths):
            messagebox.showwarning("⚠️ 配置不完整", "请至少选择12366工具分析结果表、前端模板和报告保存位置！")
            return

        # 锁定按钮，初始化状态
        self.generate_btn.config(state="disabled", text="正在处理数据...")
        self.update_progress(0, "正在启动后台引擎...")
        self.log_text.delete(1.0, tk.END)
        
        # 开启后台线程执行业务逻辑，传入进度回调函数
        threading.Thread(target=self.run_task, daemon=True).start()

    def run_task(self):
        try:
            success = generate_offline_report(
                self.path_12366.get(),
                self.path_template.get(),
                self.dir_output.get(),
                progress_cb=self.update_progress  # <-- 将UI更新函数注入底层逻辑
            )
            if success:
                self.root.after(0, lambda: messagebox.showinfo("生成成功", f"分析报告已成功导出！\n您可以前往输出目录查看。"))
        except Exception as e:
            print(f"\n❌ 致命错误: {str(e)}")
            self.update_progress(0, f"发生异常: {str(e)}")
        finally:
            self.root.after(0, lambda: self.generate_btn.config(state="normal", text="一键生成分析报告"))
            # 如果没有到 100%，重置状态文字
            if self.progress_var.get() < 100:
                self.update_progress(0, "等待开始...")

if __name__ == "__main__":
    if len(sys.argv) > 1:
        base_dir = get_app_base_path()
        data_path = sys.argv[1]
        template_path = sys.argv[2] if len(sys.argv) > 2 else get_default_template_path()
        output_dir = sys.argv[3] if len(sys.argv) > 3 else os.path.join(base_dir, '生成报告')
        ok = generate_offline_report(data_path, template_path, output_dir)
        sys.exit(0 if ok else 1)
    root = tk.Tk()
    app = ReportApp(root)
    root.mainloop()
