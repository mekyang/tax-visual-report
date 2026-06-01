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
SPECIAL_TOPICS  = ['数电票', '减税降费', '社保费']
COMMA_WHITELIST = ['【减税降费】', '享受"六税两费"', '器具、设备']
INVALID_TEXT_VALUES = {'', 'nan', 'none', 'null', 'na', 'n/a', '未知细分'}

def clean_text(value):
    if value is None or pd.isna(value):
        return ''
    text = str(value).strip()
    return '' if text.lower() in INVALID_TEXT_VALUES else text

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

def get_monday(d):
    return d - timedelta(days=d.weekday())

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

        common_headers = ['登记日期', '受理时间', '日期', '业务类型', '业务类别']
        if not any(header in df.columns for header in common_headers):
            df = read_csv_safe(file_path, header=1) if ext == '.csv' else read_excel_compat(file_path, header=1)

        df = df.fillna('')

        date_field = next((f for f in ['登记日期', '受理时间', '日期', '工单时间', '登记时间'] if f in df.columns), None)
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

def get_latest_week_start(df):
    date_col = find_unified_date_column(df)
    if not date_col:
        return None
    dates = pd.to_datetime(df[date_col], errors='coerce').dropna()
    if dates.empty:
        return None
    return get_monday(dates.max().date())

def filter_to_week(df, week_start):
    if df is None or df.empty or week_start is None:
        return df
    date_col = find_unified_date_column(df)
    if not date_col:
        return df
    dates = pd.to_datetime(df[date_col], errors='coerce')
    week_end = week_start + timedelta(days=6)
    mask = (dates.dt.date >= week_start) & (dates.dt.date <= week_end)
    return df.loc[mask].copy()

def build_report_data(df, progress_cb=None):
    total = len(df)
    cat_map     = defaultdict(int)
    sub_cat_map = defaultdict(int)
    loc_map     = defaultdict(int)
    weekly_map  = defaultdict(int)
    weekly_bounds = {}

    channel_stats = defaultdict(lambda: {
        'total': 0, 'voice': 0, 'human': 0,
        'sub': defaultdict(int),
        'topic_tree': defaultdict(lambda: defaultdict(int)),
    })

    city_stats = defaultdict(lambda: {'total': 0, 'types': defaultdict(int)})
    weekly_type_stats = defaultdict(lambda: {'total': 0, 'types': defaultdict(int)})
    global_topic_tree = defaultdict(lambda: {'total': 0, 'hot': defaultdict(int)})

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
        week_key     = get_monday(d.date()).isoformat()

        if min_date is None or d < min_date: min_date = d
        if max_date is None or d > max_date: max_date = d
        if week_key not in weekly_bounds:
            weekly_bounds[week_key] = {'start': d.date(), 'end': d.date()}
        else:
            if d.date() < weekly_bounds[week_key]['start']:
                weekly_bounds[week_key]['start'] = d.date()
            if d.date() > weekly_bounds[week_key]['end']:
                weekly_bounds[week_key]['end'] = d.date()

        for c in cats: cat_map[c] += 1
        for mc in micro_cats: sub_cat_map[mc] += 1
        loc_map[loc] += 1
        weekly_map[week_key] += 1

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

        if '问题咨询' in cats or '问题解答' in ''.join([raw_type]):
            consult_total += 1

        wts = weekly_type_stats[week_key]
        wts['total'] += 1
        for node in (second_nodes or micro_cats):
            wts['types'][node] += 1

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

    all_weeks = sorted(weekly_map.keys())
    curr_wk = all_weeks[-1] if all_weeks else None
    prev_wk = all_weeks[-2] if len(all_weeks) >= 2 else None
    current_week_start = weekly_bounds[curr_wk]['start'].isoformat() if curr_wk and curr_wk in weekly_bounds else None
    current_week_end = weekly_bounds[curr_wk]['end'].isoformat() if curr_wk and curr_wk in weekly_bounds else None
    consult_anomalies = []
    if curr_wk and prev_wk:
        curr_s, prev_s = weekly_type_stats[curr_wk], weekly_type_stats[prev_wk]
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

    effective_total = sum(weekly_map.values())
    denominator = effective_total or 1

    return {
        'meta': {
            'totalRecords': effective_total,
            'consultTotal': consult_total,
            'dateMin': min_date.strftime('%Y-%m-%d') if min_date else None,
            'dateMax': max_date.strftime('%Y-%m-%d') if max_date else None,
            'currentWeekStart': current_week_start,
            'currentWeekEnd': current_week_end,
            'generatedAt': datetime.now().isoformat(),
        },
        'channelSummary': channel_summary,
        'globalTopicSummary': global_topic_summary,
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
        'trendData': [{'week': wk, 'count': cnt} for wk, cnt in sorted(weekly_map.items())],
        'locationList': location_list,
        'globalTypeTree': serialized_tree,
        'interactiveRows': cube_rows,
    }

# ==========================================
# 4. 解析大厅汇总数据
# ==========================================
def parse_hall_stats(hall_file_path):
    print(f"\n====== 开始解析办税大厅汇总表 ======")
    if not os.path.exists(hall_file_path):
        print(f"⚠️ 警告: 找不到文件 {hall_file_path}")
        return [], []

    try:
        df = read_excel_compat(hall_file_path)
        if df.empty or len(df.columns) < 6:
            print("⚠️ 警告: 大厅汇总表列数不足，无法解析。")
            return [], []

        col_city = df.columns[0]
        col_unit = df.columns[1]

        df[col_city] = df[col_city].apply(clean_text).replace('', pd.NA).ffill().fillna('')
        df[col_unit] = df[col_unit].apply(clean_text)

        table_hall = []
        idx = 1

        for city_name, group in df.groupby(col_city, sort=False):
            city_name = clean_text(city_name)
            if city_name in ('0', '全省', '全省合计') or '合计' in city_name:
                continue
            if not city_name.endswith('市'):
                city_name += '市'
            if city_name in EXCLUDED_CITIES:
                continue

            districts     = []
            v_total = h_total = 0
            push_sum = push_cnt = 0

            for _, row in group.iterrows():
                unit = clean_text(row[col_unit])
                if unit in ('0', '') or '汇总' in unit or '合计' in unit or unit == city_name:
                    continue

                try: v = int(float(clean_text(row.iloc[2]) or 0))
                except: v = 0
                try: h = int(float(clean_text(row.iloc[3]) or 0))
                except: h = 0

                v_total += v
                h_total += h

                r_str, _ = format_percent_cell(row.iloc[4])
                push_str, push_float = format_percent_cell(row.iloc[5])
                push_sum += push_float
                push_cnt += 1

                districts.append({
                    'name': unit,
                    'voice': v, 'human': h,
                    'rate': r_str,
                    'push': push_str,
                })

            if districts:
                city_rate_str = f"{(h_total / v_total * 100):.2f}%" if v_total > 0 else "0.00%"
                city_push_str = f"{(push_sum / push_cnt):.2f}%" if push_cnt > 0 else "0.00%"

                table_hall.append({
                    'id': str(idx),
                    'name': city_name,
                    'voice': v_total,
                    'human': h_total,
                    'rate': city_rate_str,
                    'push': city_push_str,
                    'expanded': False,
                    'districts': districts,
                })
                idx += 1
                print(f"成功提取: {city_name} (包含 {len(districts)} 个区县)")

        print(f"====== 大厅汇总表解析完成！======\n")
        return [], table_hall

    except Exception as e:
        print(f"解析大厅汇总表失败: {e}")
        traceback.print_exc()
        return [], []

def compute_answer_rates(table_hall, channel_summary):
    total_voice = sum(c.get('voice', 0) for c in table_hall)
    total_human = sum(c.get('human', 0) for c in table_hall)
    rate_12366 = round(total_human / total_voice * 100, 1) if total_voice > 0 else None

    for ch in channel_summary:
        if ch['name'] == '12366热线':
            ch['answerRate'] = rate_12366
        else:
            ch['answerRate'] = None
    return channel_summary

def format_percent_cell(value):
    if value is None or pd.isna(value):
        return '0.00%', 0.0
    if isinstance(value, (int, float)):
        pct = float(value) * 100 if float(value) <= 1 else float(value)
        return f"{pct:.2f}%", pct

    text = clean_text(value)
    if not text:
        return '0.00%', 0.0
    raw = text.rstrip('%')
    try:
        num = float(raw)
        if not text.endswith('%') and num <= 1:
            num *= 100
        return f"{num:.2f}%", num
    except:
        return text, 0.0

# ==========================================
# 5. 生成报告核心逻辑
# ==========================================
def generate_offline_report(data_12366_path, data_hall_path, hall_stats_path, template_path, output_dir, progress_cb=None):
    print(f"\n[{datetime.now().strftime('%H:%M:%S')}] 开始生成双渠道报表...")

    if progress_cb: progress_cb(5, "正在读取 12366 明细表...")
    df_12366 = load_detail_file(data_12366_path, '12366热线')
    
    if progress_cb: progress_cb(15, "正在读取 办税服务厅 明细表...")
    df_hall  = load_detail_file(data_hall_path,  '办税服务厅')

    if progress_cb: progress_cb(25, "正在合并基础数据源...")
    df_combined = pd.concat([df_12366, df_hall], ignore_index=True)

    if df_combined.empty:
        print("❌ 错误：12366 和 办税服务厅 的明细数据均未成功加载，无法生成报告！")
        return False

    # 构建主报告数据（传递回调函数，以体现行级处理进度）
    week_start = get_latest_week_start(df_12366)
    df_12366_week = filter_to_week(df_12366, week_start)
    df_combined_week = filter_to_week(df_combined, week_start)

    # Main report sections use only 12366 detail rows for the latest report week.
    report_data = build_report_data(df_12366_week, progress_cb=progress_cb)
    report_history_data = build_report_data(df_12366)
    report_data['consultAnomalies'] = report_history_data.get('consultAnomalies', [])
    report_data['bestPracticeInsights'] = report_history_data.get('bestPracticeInsights', [])
    # Call-volume section may use hall detail rows, but it must stay on the same week.
    call_volume_data = build_report_data(df_combined_week)

    if progress_cb: progress_cb(75, "正在解析大厅接听汇总表...")
    table_etax, table_hall = parse_hall_stats(hall_stats_path)
    report_data['tableEtax'] = table_etax
    report_data['tableHall'] = table_hall

    report_data['channelSummary'] = compute_answer_rates(
        table_hall, report_data['channelSummary']
    )
    report_data['callVolume'] = {
        'meta': call_volume_data.get('meta', {}),
        'channelSummary': compute_answer_rates(
            table_hall, call_volume_data.get('channelSummary', [])
        ),
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
            final_html = html_content.replace('<title>', injection + '<title>')
        elif '<head>' in html_content:
            final_html = html_content.replace('<head>', '<head>' + injection)
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
        self.root.title("税务诉求分析报告生成工具 v1.0")
        self.root.geometry("720x650")  # 增加了高度以容纳进度条
        self.root.configure(bg="#F3F3F3", padx=20, pady=20)
        
        self.setup_styles()
        self.base_path = get_app_base_path()
        
        self.path_12366 = tk.StringVar()
        self.path_hall = tk.StringVar()
        self.path_stats = tk.StringVar()
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
        
        title_lbl = tk.Label(header_frame, text="山东税务12366热线诉求分析周报", font=("Microsoft YaHei", 16, "bold"), bg="#F3F3F3", fg="#333333")
        title_lbl.pack(anchor="w")
        
        desc_lbl = tk.Label(header_frame, text="配置基础明细与汇总表，一键渲染报告。", font=("Microsoft YaHei", 9), bg="#F3F3F3", fg="#666666")
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
        excel_types = [("Excel 文件", "*.xlsx *.xls")]
        html_types = [("HTML 网页模板", "*.html *.htm")]

        add_row(form_frame, "12366咨询明细表 (CSV):", self.path_12366, filetypes=csv_types)
        add_row(form_frame, "办税服务厅明细表 (CSV):", self.path_hall, filetypes=csv_types)
        add_row(form_frame, "大厅接听汇总表 (Excel):", self.path_stats, filetypes=excel_types)
        
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
        paths = [
            self.path_12366.get(), self.path_hall.get(), 
            self.path_stats.get(), self.path_template.get(), 
            self.dir_output.get()
        ]
        if not all(paths):
            messagebox.showwarning("⚠️ 配置不完整", "请确保所有文件和目录路径已填写完整！")
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
                self.path_hall.get(),
                self.path_stats.get(),
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
    root = tk.Tk()
    app = ReportApp(root)
    root.mainloop()
