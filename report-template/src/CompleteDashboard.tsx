"use client";

import React, { useState, useMemo, useCallback } from 'react';
import {
  Activity, MapPin, ChevronRight, Database, TrendingUp,
  ChevronLeft, Layers, X,
  PieChart as PieChartIcon, ArrowUpRight, ArrowDownRight,
  PhoneCall, Terminal, ShieldCheck, Target,
  MessageSquareWarning
} from 'lucide-react';
import {
  BarChart, Bar, PieChart, Pie, Cell, Tooltip,
  ResponsiveContainer, CartesianGrid, XAxis, YAxis, Legend
} from 'recharts';

// ==========================================
// 1. 全局配置
// ==========================================
const COLORS = [
  '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
  '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9'
];

// ==========================================
// 2. 工具函数（仅保留 UI 层必要的格式化，不做数据聚合）
// ==========================================
const formatDate = (dateStr: string | null | undefined): string => {
  if (!dateStr) return '--';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '--';
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
};

const getFallbackWeekStart = (dateStr: string | null | undefined): string | null => {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  d.setDate(d.getDate() - 6);
  return d.toISOString().slice(0, 10);
};

const isInvalidCategoryName = (value: unknown): boolean => {
  const text = String(value ?? '').trim().toLowerCase();
  return !text || ['nan', 'none', 'null', 'na', 'n/a', '未知细分'].includes(text);
};

const formatRate = (rate: string | number | null | undefined): string => {
  if (rate == null) return '--';
  const str = String(rate).trim();
  if (str.endsWith('%')) return str;
  const num = parseFloat(str);
  if (isNaN(num)) return str;
  if (num <= 1) return `${(num * 100).toFixed(2)}%`;
  return `${num.toFixed(2)}%`;
};

const normalizeReportPathNodes = (nodes: string[]): string[] => {
  const cleanNodes = nodes.map(n => String(n ?? '').trim()).filter(n => !isInvalidCategoryName(n));
  if (cleanNodes.length === 0) return [];

  let normalized = [...cleanNodes];
  const first = normalized[0];

  if (first === '服务' || first === '服务投诉') {
    normalized[0] = '服务投诉';
  } else if (first === '投诉、举报工单反馈' || first.includes('举报工单反馈') || first === '涉税举报') {
    normalized[0] = '涉税举报';
  } else if (first === '问题咨询') {
    normalized[0] = '问题解答';
  } else if (first !== '问题解答') {
    normalized = ['问题解答', ...normalized];
  }

  return normalized.map((node, idx) => {
    if (idx > 0 && (node.includes('自然人税收管理系统') || node.includes('ITS'))) {
      return '电子申报系统';
    }
    return node;
  });
};

// ==========================================
// 3. UI 基础组件
// ==========================================
const GlassCard = ({ children, className = '', title, icon: Icon, action }: any) => (
  <div className={`bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col relative ${className}`}>
    {title && (
      <div className="px-5 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
        <h3 className="text-slate-800 font-bold flex items-center gap-2 text-base">
          {Icon && <Icon size={18} className="text-sky-500" />}
          {title}
        </h3>
        {action}
      </div>
    )}
    <div className="p-5 flex-1 flex flex-col relative min-h-0">{children}</div>
  </div>
);

const SectionHeader = ({ title, step }: { title: string; step: string }) => (
  <div className="flex items-center gap-3 mb-6 mt-10">
    <div className="bg-sky-500 text-white font-mono font-bold w-8 h-8 rounded-lg flex items-center justify-center shadow-md shadow-sky-500/20">
      {step}
    </div>
    <h2 className="text-2xl font-bold text-slate-800 tracking-tight">{title}</h2>
    <div className="flex-1 h-px bg-gradient-to-r from-slate-200 to-transparent ml-4" />
  </div>
);

const HotTopicTable = ({ data, title }: { data: { name: string; value: number }[]; title?: string }) => (
  <div className="overflow-x-auto rounded-xl border border-slate-200">
    {title && (
      <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 text-sm font-bold text-slate-700">{title}</div>
    )}
    <table className="w-full text-sm text-left">
      <thead className="bg-slate-50/80 text-slate-500 font-medium">
        <tr>
          <th className="py-2.5 px-4 border-b border-slate-100 w-10 text-center">序号</th>
          <th className="py-2.5 px-4 border-b border-slate-100">热点问题 / 类别</th>
          <th className="py-2.5 px-4 border-b border-slate-100 text-right w-28">咨询数量</th>
        </tr>
      </thead>
      <tbody>
        {data.map((row, i) => (
          <tr key={i} className="border-b border-slate-50 hover:bg-sky-50/40 transition-colors">
            <td className="py-2.5 px-4 text-center text-slate-400 font-mono text-xs">{i + 1}</td>
            <td className="py-2.5 px-4 text-slate-700 font-medium">{row.name}</td>
            <td className="py-2.5 px-4 text-right">
              <span className={`font-bold ${i < 3 ? 'text-sky-600' : 'text-slate-600'}`}>{row.value.toLocaleString()}</span>
              <span className="text-slate-400 text-xs ml-1">件</span>
            </td>
          </tr>
        ))}
        {data.length === 0 && (
          <tr><td colSpan={3} className="py-6 text-center text-slate-400 text-sm">暂无数据</td></tr>
        )}
      </tbody>
    </table>
  </div>
);

// ==========================================
// 4. 主应用程序
// ==========================================
export default function CompleteDashboard() {
  const [selectedDistrict, setSelectedDistrict]   = useState<string | null>(null);
  const [drillPath, setDrillPath]                 = useState<string[]>([]);
  const [expandedCities, setExpandedCities]       = useState<Record<string, boolean>>({});
  const [activeChannelTab, setActiveChannelTab]   = useState<string>('12366热线');
  const [expandedInsights, setExpandedInsights]   = useState<Record<number, boolean>>({});

  // 直接读取后端预计算好的数据，不在前端做任何聚合
  const reportData = useMemo(() => {
    if (typeof window === 'undefined') return null;
    return (window as any).__REPORT_DATA__ ?? null;
  }, []);

  if (!reportData) return (
    <div className="min-h-screen flex items-center justify-center text-slate-400">数据加载中...</div>
  );

  const { meta, channelSummary, globalTopicSummary, locationList, tableHall } = reportData;
  const callVolume = reportData.callVolume ?? {};
  const callVolumeMeta = callVolume.meta ?? meta;
  const callVolumeChannelSummary = callVolume.channelSummary ?? channelSummary;
  const callVolumeLocationList = callVolume.locationList ?? locationList;
  const displayDateStart = meta.currentWeekStart ?? getFallbackWeekStart(meta.dateMax) ?? meta.dateMin;
  const displayDateEnd = meta.currentWeekEnd ?? meta.dateMax;

  // ── 渠道状态卡片数据：直接从后端 channelSummary 读取，不再硬编码 ──
  const hotlineStatus = useMemo(() =>
    callVolumeChannelSummary.map((ch: any) => ({
      name: ch.name,
      value: ch.total,
      percent: callVolumeMeta.totalRecords > 0 ? ((ch.total / callVolumeMeta.totalRecords) * 100).toFixed(1) : '0.0',
      // answerRate 由后端计算（来自汇总表真实数据），null 表示不适用
      answerRate: ch.answerRate != null ? ch.answerRate : null,
    })),
  [callVolumeChannelSummary, callVolumeMeta]);

  // ── 同比对比数据：后端若有真实同期则用，否则不展示伪造数据 ──
  // 后端字段：channelSummary[].prevTotal（若存在则用，否则 null）
  const channelComparisonData = useMemo(() =>
    callVolumeChannelSummary
      .filter((ch: any) => ch.prevTotal != null)  // 没有历史数据时不展示
      .map((ch: any) => ({
        name: ch.name,
        当期: ch.total,
        同期: ch.prevTotal,
      })),
  [callVolumeChannelSummary]);

  // ── 当前 tab 对应的渠道话题数据：O(1) 查找，不遍历明细 ──
  const activeChannelData = useMemo(() => {
    const ch = channelSummary.find((c: any) => c.name === activeChannelTab);
    if (!ch) return { topicSummary: [], chartData: [] };
    const top8 = ch.topicSummary.slice(0, 8);
    const total = top8.reduce((s: number, t: any) => s + t.total, 0) || 1;
    return {
      topicSummary: ch.topicSummary,
      chartData: top8.map((t: any, i: number) => ({
        name: t.name,
        value: t.total,
        percent: ((t.total / total) * 100).toFixed(1),
        color: COLORS[i % COLORS.length],
      })),
    };
  }, [channelSummary, activeChannelTab]);

  // ── 地市分布：无筛选时直接用后端排好序的 locationList ──
  // 有筛选（selectedDistrict）时前端过滤明细（此时 interactiveRows 仍保留）
  const locationData = useMemo(() => {
    if (!selectedDistrict) {
      const maxVal = locationList.length > 0 ? locationList[0].value : 1;
      return locationList.map((d: any) => ({ ...d, id: d.name, maxScore: maxVal }));
    }
    // 有地区筛选时，从 interactiveRows 重新统计（仅此场景走前端计算）
    const counts: Record<string, number> = {};
    (reportData.interactiveRows || []).forEach((row: any) => {
      const loc = row.loc;
      if (!loc || loc === '山东省内(未指明)' || loc === '山东省内(未指明市)') return;
      counts[loc] = (counts[loc] || 0) + row.count;
    });
    const entries = Object.entries(counts).map(([name, value]) => ({ name, value: value as number }));
    entries.sort((a, b) => b.value - a.value);
    const maxVal = entries.length > 0 ? entries[0].value : 1;
    return entries.map(e => ({ id: e.name, name: e.name, value: e.value, maxScore: maxVal }));
  }, [selectedDistrict, locationList, reportData.interactiveRows]);

  // ── 下钻数据：使用后端预计算的 globalTypeTree，仅做路径导航 ──
  // 有地区筛选时退化为从 interactiveRows 现算（数据量小，可接受）
  const drillDownData = useMemo(() => {
    let tree: any;

    if (!selectedDistrict) {
      // 无筛选：直接用预计算树，O(depth) 导航
      tree = reportData.globalTypeTree || {};
    } else {
      // 有地区筛选：动态构建该地区子树
      const filteredRows = (reportData.interactiveRows || []).filter(
        (row: any) => row.loc === selectedDistrict
      );
      tree = {};
      filteredRows.forEach((row: any) => {
        const rawType = row.type;
        if (isInvalidCategoryName(rawType)) return;
        // 复用后端同款 split 逻辑（简化版，COMMA_WHITELIST 场景极少）
        const paths = rawType.replace(/，/g, ',').split(',').map((s: string) => s.trim()).filter(Boolean);
        paths.forEach((path: string) => {
          const nodes = normalizeReportPathNodes(path.split('->'));
          if (nodes.length === 0) return;
          let cur = tree;
          nodes.forEach((node: string) => {
            if (!cur[node]) cur[node] = { value: 0, hasChildren: false, children: {} };
            cur[node].value += row.count;
            cur = cur[node].children;
          });
        });
      });
      // 标注 hasChildren
      const markHasChildren = (t: any) => {
        Object.values(t).forEach((node: any) => {
          node.hasChildren = Object.keys(node.children).length > 0;
          markHasChildren(node.children);
        });
      };
      markHasChildren(tree);
    }

    // 沿 drillPath 导航到当前层
    let current = tree;
    for (const step of drillPath) {
      if (current[step]?.children) current = current[step].children;
      else return [];
    }

    return Object.entries(current)
      .filter(([name]: any) => !isInvalidCategoryName(name))
      .map(([name, node]: any) => ({ name, value: node.value, hasChildren: node.hasChildren }))
      .sort((a: any, b: any) => b.value - a.value);
  }, [selectedDistrict, drillPath, reportData.globalTypeTree, reportData.interactiveRows]);

  // ── 投诉按地市统计（仅统计服务质效、服务言行、侵害权益类别）──
  const complaintByCity = useMemo(() => {
    const counts: Record<string, number> = {};
    const validComplaintCats = ['服务质效', '服务言行', '侵害权益'];

    (reportData.interactiveRows || []).forEach((row: any) => {
      const cat = String(row.cat || '');
      const type = String(row.type || '');

      // 检查是否属于指定的投诉类别（在cat或type字段中匹配）
      const isValidComplaint = validComplaintCats.some(validCat =>
        cat.includes(validCat) || type.includes(validCat)
      );

      if (isValidComplaint && row.loc) {
        counts[row.loc] = (counts[row.loc] || 0) + row.count;
      }
    });

    return Object.entries(counts)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [reportData.interactiveRows]);

  // ── 涉税投诉统计：从 globalTypeTree 的"涉税投诉"大类下获取二级分类 ──
  const taxComplaintData = useMemo(() => {
    const tree = reportData.globalTypeTree || {};
    const taxComplaintNode = tree['涉税举报'];

    if (!taxComplaintNode || !taxComplaintNode.children) {
      return { topics: [], byCity: [], total: 0 };
    }

    // 获取二级分类（话题）
    const topics = Object.entries(taxComplaintNode.children)
      .map(([name, node]: any) => ({ name, value: node.value }))
      .sort((a: any, b: any) => b.value - a.value);

    const total = topics.reduce((sum, item) => sum + item.value, 0);

    // 按地市统计：从 interactiveRows 中筛选属于涉税投诉大类下的数据
    const cityCounts: Record<string, number> = {};
    const taxComplaintSubCats = Object.keys(taxComplaintNode.children);

    (reportData.interactiveRows || []).forEach((row: any) => {
      const cat = String(row.cat || '');
      const type = String(row.type || '');

      // 检查是否属于涉税投诉大类下的二级分类
      const isTaxComplaint = taxComplaintSubCats.some(subCat =>
        cat.includes(subCat) || type.includes(subCat)
      );

      if (isTaxComplaint && row.loc) {
        cityCounts[row.loc] = (cityCounts[row.loc] || 0) + row.count;
      }
    });

    const byCity = Object.entries(cityCounts)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);

    return { topics, byCity, total };
  }, [reportData.globalTypeTree, reportData.interactiveRows]);

  // 解构涉税投诉数据
  const taxComplaintTopics = taxComplaintData.topics;
  const taxComplaintByCity = taxComplaintData.byCity;
  const taxComplaintTotal = taxComplaintData.total;

  // ── 处理函数 ──
  const handleDistrictClick = useCallback((districtId: string) => {
    setSelectedDistrict(prev => prev === districtId ? null : districtId);
    setDrillPath([]);
  }, []);

  const clearAllFilters = useCallback(() => {
    setSelectedDistrict(null);
    setDrillPath([]);
    setActiveChannelTab('12366热线');
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-700 font-sans pb-20">

      {/* 顶栏 */}
      <div className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-slate-200 shadow-sm">
        <div className="max-w-[1200px] mx-auto px-6 py-4 flex justify-between items-center">
          <div>
            <h1 className="text-xl font-bold text-slate-800 tracking-tight flex items-center gap-2">
              <Terminal className="text-sky-500" size={20} /> 山东税务12366热线诉求分析周报
            </h1>
            <p className="text-xs text-slate-500 font-mono mt-1">
              系统生成报表 | 载入明细 {meta.totalRecords.toLocaleString()} 条
            </p>
          </div>
          {(selectedDistrict || drillPath.length > 0) && (
            <button
              onClick={clearAllFilters}
              className="text-xs font-medium px-4 py-2 bg-rose-500 hover:bg-rose-600 text-white rounded-lg shadow-sm transition-colors flex items-center gap-1"
            >
              <X size={14} /> 清除交互区过滤
            </button>
          )}
        </div>
      </div>

      <div className="max-w-[1200px] mx-auto px-6 mt-4">

        {/* 一、咨询需求情况分析 */}
        <SectionHeader title="一、咨询需求情况分析" step="01" />
        <GlassCard icon={Database}>
          <div className="mb-6 text-slate-600 leading-relaxed text-base bg-slate-50 p-5 rounded-xl border border-slate-100 indent-8">
            {formatDate(displayDateStart)}至{formatDate(displayDateEnd)}，本期监测周期内山东税务税费服务热线累计来电
            <span className="text-sky-600 font-bold text-xl mx-1">{meta.totalRecords.toLocaleString()}</span>通。咨询需求情况如下：
          </div>
        </GlassCard>

        <GlassCard icon={PhoneCall}>

          {/* 全局摘要段落：直接用后端 globalTopicSummary */}
          <div
            className="mb-6 text-slate-700 leading-9 text-lg bg-slate-50 p-6 rounded-xl border border-slate-100 text-justify"
            style={{ textIndent: '2em' }}
          >
            {(() => {
              const [first, second, third] = globalTopicSummary;
              const consultTotalWan = meta.consultTotal
                ? (meta.consultTotal / 10000).toFixed(2)
                : (meta.totalRecords / 10000).toFixed(2);
              return (
                <span>
                  {formatDate(displayDateStart)}至{formatDate(displayDateEnd)}，问题解答类咨询共计
                  <span className="text-sky-600 font-bold text-2xl mx-1">{consultTotalWan}</span>万次。
                  {first && <span className="ml-2">其中<strong>{first.name}</strong>最多，<span className="text-amber-600 font-bold">{first.total.toLocaleString()}</span>件，热点集中在{first.top3.join('、')}；</span>}
                  {second && <span className="ml-2">其次为<strong>{second.name}</strong>，<span className="text-amber-600 font-bold">{second.total.toLocaleString()}</span>件，热点为{second.top3.join('、')}；</span>}
                  {third && <span className="ml-2">第三为<strong>{third.name}</strong>，<span className="text-amber-600 font-bold">{third.total.toLocaleString()}</span>件，热点为{third.top3.join('、')}。</span>}
                </span>
              );
            })()}
          </div>

          {/* 问题集中度分析：直接用 globalTopicSummary 前三 */}
          <div className="mb-8 p-5 bg-gradient-to-r from-slate-50 to-sky-50 rounded-xl border border-slate-200">
            <div className="flex items-center gap-2 mb-4">
              <Target size={18} className="text-sky-500" />
              <span className="text-sm font-bold text-slate-700">问题集中度分析</span>
            </div>
            <div className="grid grid-cols-3 gap-4">
              {globalTopicSummary.slice(0, 3).map((ch: any, idx: number) => {
                const topTopic = ch.hotTopics[0];
                const concentration = ch.total > 0 && topTopic ? Math.min((topTopic.value / ch.total) * 100, 100).toFixed(1) : '0.0';
                return (
                  <div key={idx} className="bg-white p-5 rounded-xl border border-slate-100 shadow-sm flex flex-col">
                    <div className="flex items-center gap-2 mb-3 pb-3 border-b border-slate-50">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[idx % COLORS.length] }} />
                      <span className="text-lg font-bold text-slate-800">{ch.name}</span>
                    </div>
                    <div className="flex-1 flex flex-col justify-center">
                      <div className="text-sm text-slate-600 mb-2">该大类下，排名第一的细分问题占比：</div>
                      <div className="text-3xl font-black text-sky-600 mb-3">{concentration}%</div>
                      <div className="mt-auto text-xs text-slate-500 bg-slate-50 p-3 rounded-lg leading-relaxed border border-slate-100">
                        <span className="font-bold text-slate-700">首要细分：</span>
                        {topTopic?.name ?? '暂无数据'}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 渠道 Tab */}
          <div className="flex gap-4 mb-6 border-b border-slate-100 pb-3">
            {channelSummary.map((ch: any) => (
              <button
                key={ch.name}
                onClick={() => setActiveChannelTab(ch.name)}
                className={`px-5 py-2 rounded-lg text-sm font-bold transition-all ${activeChannelTab === ch.name ? 'bg-sky-500 text-white shadow-md' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
              >
                {ch.name}
              </button>
            ))}
          </div>

          {/* 常规结构分析（使用 activeChannelData，O(1) 查找）*/}
          <div className="animate-in fade-in duration-300">
            <h4 className="text-base font-bold mb-4 text-slate-800 flex items-center gap-2">
              <PieChartIcon size={16} className="text-sky-500" /> 常规结构分析 ({activeChannelTab})
            </h4>
            <div className="grid grid-cols-12 gap-6 mb-8">
              <div className="col-span-4 bg-slate-50 rounded-xl p-4 border border-slate-100">
                <div className="h-[220px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={activeChannelData.chartData} cx="50%" cy="50%" innerRadius={55} outerRadius={90} paddingAngle={2} dataKey="value" nameKey="name">
                        {activeChannelData.chartData.map((entry: any, index: number) => (
                          <Cell key={index} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{ borderRadius: 8, border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                        formatter={(value: any, name: any) => {
                          const item = activeChannelData.chartData.find((c: any) => c.name === name);
                          return [`${(value as number).toLocaleString()} 件 (${item?.percent}%)`, name];
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="space-y-2 mt-1 max-h-[180px] overflow-y-auto">
                  {activeChannelData.chartData.slice(0, 5).map((c: any, i: number) => (
                    <div key={i} className="flex items-center justify-between text-xs px-2 py-1.5 bg-white rounded-lg border border-slate-100">
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: c.color }} />
                        <span className="text-slate-700 font-medium truncate w-32" title={c.name}>{c.name}</span>
                      </div>
                      <span className="font-bold text-slate-600">{c.percent}%</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="col-span-8 h-[420px] overflow-y-auto pr-2">
                {activeChannelData.topicSummary.map((ch: any, idx: number) =>
                  ch.hotTopics.length > 0 && (
                    <div key={idx} className="mb-4 p-3 bg-white rounded-xl border border-slate-100">
                      <div className="flex items-center gap-2 mb-3">
                        <div className="w-2 h-4 rounded-sm" style={{ backgroundColor: activeChannelData.chartData[idx]?.color || '#94a3b8' }} />
                        <span className="text-sm font-bold text-slate-700">{ch.name}</span>
                        <span className="text-xs text-slate-400 ml-1">该分类共 {ch.total.toLocaleString()} 件</span>
                      </div>
                      <div className="space-y-2">
                        {ch.hotTopics.slice(0, 3).map((topic: any, tidx: number) => (
                          <div key={tidx} className="flex items-center justify-between text-sm">
                            <div className="flex items-center gap-2 flex-1">
                              <span className="text-xs text-slate-400 w-5">{tidx + 1}</span>
                              <span className="text-slate-700 truncate" title={topic.name}>{topic.name}</span>
                            </div>
                            <div className="flex items-center gap-3">
                              <div className="w-24 h-2 bg-slate-100 rounded-full overflow-hidden">
                                <div
                                  className="h-full rounded-full"
                                  style={{
                                    width: `${ch.hotTopics[0].value > 0 ? (topic.value / ch.hotTopics[0].value) * 100 : 0}%`,
                                    backgroundColor: activeChannelData.chartData[idx]?.color || '#94a3b8',
                                  }}
                                />
                              </div>
                              <span className="text-xs font-bold text-slate-600 w-10 text-right">{topic.value}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                )}
              </div>
            </div>

            {/* 异常波动监测 */}
            {reportData.consultAnomalies?.length > 0 && (
              <div className="border-t border-slate-100 pt-6 mb-8">
                <h4 className="text-base font-bold mb-4 text-slate-800 flex items-center gap-2">
                  <TrendingUp size={16} className="text-rose-500" /> 全局异常波动监测
                </h4>
                <div className="grid grid-cols-3 gap-3">
                  {reportData.consultAnomalies.slice(0, 6).map((item: any, idx: number) => (
                    <div key={idx} className={`p-4 bg-white border rounded-xl shadow-sm relative overflow-hidden ${item.trend === 'up' ? 'border-rose-100' : 'border-emerald-100'}`}>
                      <div className={`absolute top-0 left-0 w-1 h-full ${item.trend === 'up' ? 'bg-rose-400' : 'bg-emerald-400'}`} />
                      <div className="pl-2">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`text-xs px-1.5 py-0.5 rounded ${item.trend === 'up' ? 'bg-rose-50 text-rose-500' : 'bg-emerald-50 text-emerald-500'}`}>
                            {item.trend === 'up' ? '激增' : '激减'}
                          </span>
                        </div>
                        <div className="text-sm font-bold text-slate-800 mb-3 leading-tight" title={item.name}>
                          {item.name.length > 18 ? item.name.slice(0, 18) + '…' : item.name}
                        </div>
                        <div className="flex items-end justify-between">
                          <div className="text-center">
                            <div className="text-xs text-slate-400">上周</div>
                            <div className="text-sm font-semibold text-slate-500">{item.prevRate}</div>
                          </div>
                          <div className="flex flex-col items-center">
                            {item.trend === 'up' ? <ArrowUpRight size={16} className="text-rose-500" /> : <ArrowDownRight size={16} className="text-emerald-500" />}
                            <span className={`text-[10px] font-bold ${item.trend === 'up' ? 'text-rose-400' : 'text-emerald-400'}`}>{item.changePoints}件</span>
                          </div>
                          <div className="text-center">
                            <div className="text-xs text-slate-400">本周</div>
                            <div className={`text-base font-black ${item.trend === 'up' ? 'text-rose-600' : 'text-emerald-600'}`}>{item.currRate}</div>
                          </div>
                          <div className="text-center">
                            <div className="text-xs text-slate-400">变化率</div>
                            <div className={`text-sm font-bold ${item.trend === 'up' ? 'text-rose-600' : 'text-emerald-600'}`}>
                              {item.trend === 'up' ? '+' : '-'}{item.changePct}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </GlassCard>



        {/* 二、数据深度分析 */}
        <SectionHeader title="二、数据深度分析" step="02" />

        <div className="mb-6 p-4 bg-sky-50 border border-sky-100 rounded-xl flex flex-wrap justify-between items-center gap-4">
          <p className="text-sm text-sky-800 font-medium flex items-center gap-2">
            <Activity size={16} /> 提示：可点击下方排行或图表，对数据进行联动筛选。
          </p>
          {(selectedDistrict || drillPath.length > 0) && (
            <button
              onClick={clearAllFilters}
              className="flex items-center gap-2 px-4 py-1.5 bg-white border border-sky-200 text-sky-600 hover:bg-sky-100 rounded-lg text-sm font-semibold transition-all"
            >
              <X size={14} /> 清除筛选条件
            </button>
          )}
        </div>

        <div className="grid grid-cols-12 gap-6 mb-8">
          {/* 地市排行 */}
          <GlassCard title="各地市业务量分布 (点击可查看单一地市)" icon={MapPin} className="col-span-4 h-[500px] min-h-0">
            <div className="flex flex-col gap-2 overflow-y-auto pr-2 h-full min-h-0 overscroll-contain">
              {locationData.map((district: any, idx: number) => {
                const isActive = selectedDistrict === district.id;
                return (
                  <div
                    key={district.id}
                    onClick={() => handleDistrictClick(district.id)}
                    className={`cursor-pointer p-3 rounded-xl border transition-colors ${isActive ? 'bg-sky-50 border-sky-200' : 'bg-white border-slate-100 hover:border-slate-300'}`}
                  >
                    <div className="flex justify-between items-center mb-2">
                      <span className={`text-sm ${isActive ? 'text-sky-700 font-medium' : 'text-slate-700'}`}>{idx + 1}. {district.name}</span>
                      <span className={`text-xs ${isActive ? 'text-sky-600 font-bold' : 'text-slate-500'}`}>{district.value.toLocaleString()}</span>
                    </div>
                    <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${isActive ? 'bg-sky-500' : 'bg-slate-300'}`}
                        style={{ width: `${(district.value / district.maxScore) * 100}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </GlassCard>

          {/* 下钻图表：使用预计算树 */}
          <GlassCard
            title={
              <div className="flex items-center gap-1 text-sm font-normal">
                <span className="text-slate-500 cursor-pointer hover:text-slate-800" onClick={() => setDrillPath([])}>
                  全部分类（点击蓝字可下钻）
                </span>
                {drillPath.map((path, idx) => (
                  <React.Fragment key={idx}>
                    <ChevronRight size={14} className="text-slate-400" />
                    <span className="text-slate-700 font-medium">{path}</span>
                  </React.Fragment>
                ))}
              </div>
            }
            icon={Layers}
            className="col-span-8 h-[500px]"
            action={drillPath.length > 0 && (
              <button
                onClick={() => setDrillPath(drillPath.slice(0, -1))}
                className="text-xs px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 rounded text-slate-600 flex items-center gap-1 transition-colors"
              >
                <ChevronLeft size={14} />返回
              </button>
            )}
          >
            <div className="w-full h-full pb-2">
              {drillDownData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={drillDownData} layout="vertical" margin={{ left: 10, right: 60, top: 10, bottom: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal vertical={false} stroke="#f1f5f9" />
                    <XAxis type="number" hide />
                    <YAxis
                      dataKey="name" type="category" width={160} axisLine={false} tickLine={false} interval={0}
                      tick={(props) => {
                        const { x, y, payload } = props;
                        const node = drillDownData.find((d: any) => d.name === payload.value);
                        const isClickable = node?.hasChildren;
                        return (
                          <text
                            x={x} y={y} dy={4} textAnchor="end"
                            fill={isClickable ? '#0284c7' : '#475569'}
                            fontSize={13}
                            style={{ cursor: isClickable ? 'pointer' : 'default' }}
                            onClick={() => isClickable && setDrillPath([...drillPath, payload.value])}
                          >
                            {payload.value.length > 12 ? payload.value.substring(0, 12) + '...' : payload.value}
                          </text>
                        );
                      }}
                    />
                    <Tooltip
                      contentStyle={{ borderRadius: 8, border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                      cursor={{ fill: '#f8fafc' }}
                      formatter={(value: any) => [`${value?.toLocaleString()} 件`, '数量']}
                    />
                    <Bar
                      dataKey="value" radius={[0, 4, 4, 0]} barSize={32}
                      onClick={(data: any) => data.hasChildren && data.name && setDrillPath([...drillPath, data.name])}
                      style={{ cursor: 'pointer' }}
                    >
                      {drillDownData.map((entry: any, i: number) => (
                        <Cell key={i} fill={entry.hasChildren ? '#7dd3fc' : '#cbd5e1'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-slate-400">
                  <Layers className="h-10 w-10 mb-2 opacity-20" />
                  <p className="text-sm">该分类已至末级</p>
                </div>
              )}
            </div>
          </GlassCard>
        </div>

        {/* 最佳实践洞察：直接用后端预计算的 cityDetails */}
        {reportData.bestPracticeInsights?.length > 0 && (
          <GlassCard title="地市业务量差异较大的业务情况" icon={ShieldCheck} className="bg-gradient-to-br from-indigo-50 to-white border-indigo-100 mb-8">
            <p className="text-sm text-slate-600 mb-4 leading-relaxed">
              <strong>数据测算结论：</strong> 以下高频业务在对应地市的咨询占比显著低于全省平均水平，具备参考价值：
            </p>
            <div className="grid grid-cols-3 gap-4 max-h-[500px] overflow-y-auto pr-2">
              {reportData.bestPracticeInsights.map((insight: any, idx: number) => {
                const isExpanded = expandedInsights[idx];
                return (
                  <div key={idx} className="p-4 bg-white rounded-xl border border-indigo-100 shadow-sm hover:shadow-md transition-all duration-300">
                    <div className="text-xs text-slate-500 mb-1">高频业务</div>
                    <div className="text-lg font-bold text-slate-800 mb-1 truncate" title={insight.issueName}>{insight.issueName}</div>
                    <div className="text-xs text-slate-400 mb-3 flex items-center gap-1">
                      参考地市：<span className="text-indigo-600 font-medium">{insight.bestCity}</span>
                    </div>
                    <div className="bg-slate-50 p-2 rounded-lg flex items-center justify-between text-xs mb-2">
                      <span className="text-slate-500">全省均值: {insight.provincialRate}</span>
                      <span className="font-bold text-emerald-600 bg-emerald-100 px-2 py-1 rounded">该市: {insight.bestCityRate}</span>
                    </div>

                    <button
                      onClick={() => setExpandedInsights(prev => ({ ...prev, [idx]: !prev[idx] }))}
                      className="w-full flex items-center justify-center gap-1 text-xs text-indigo-500 hover:text-indigo-700 hover:bg-indigo-50/50 py-1.5 border-t border-indigo-50 mt-3 transition-colors rounded-b-lg"
                    >
                      {isExpanded ? '收起明细' : '查看各地市占比明细'}
                      <ChevronRight size={14} className={`transform transition-transform duration-300 ${isExpanded ? '-rotate-90' : 'rotate-90'}`} />
                    </button>

                    {/* cityDetails 由后端预计算，前端仅渲染 */}
                    {isExpanded && insight.cityDetails && (
                      <div className="mt-2 pt-2 border-t border-slate-100 max-h-[160px] overflow-y-auto pr-1">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="text-slate-400 border-b border-slate-100">
                              <th className="text-left pb-1.5 font-medium">地市</th>
                              <th className="text-right pb-1.5 font-medium">业务占比</th>
                            </tr>
                          </thead>
                          <tbody>
                            {insight.cityDetails.map((cd: any, cidx: number) => (
                              <tr
                                key={cidx}
                                className={`border-b border-slate-50 last:border-0 ${cd.city === insight.bestCity ? 'bg-indigo-50/40' : ''}`}
                              >
                                <td className={`py-1.5 ${cd.city === insight.bestCity ? 'text-indigo-600 font-bold' : 'text-slate-600'}`}>
                                  {cidx + 1}. {cd.city}
                                </td>
                                <td className={`py-1.5 text-right ${cd.city === insight.bestCity ? 'text-indigo-600 font-bold' : 'text-slate-500'}`}>
                                  {cd.rateStr}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </GlassCard>
        )}

        {/* 三、投诉举报情况 */}
        <SectionHeader title="三、投诉举报情况" step="03" />
        <GlassCard icon={MessageSquareWarning}>
          {reportData.complaintTotal > 0 ? (
            <>
              <div className="mb-6 text-slate-600 leading-8 text-base bg-rose-50/60 p-5 rounded-xl border border-rose-100 indent-8">
                {formatDate(displayDateStart)}至{formatDate(displayDateEnd)}，全省共实际受理服务投诉
                <span className="text-rose-600 font-bold text-2xl mx-2">{reportData.complaintTotal.toLocaleString()}</span>件。
                投诉事项主要集中在以下方面：
              </div>
              <div className="grid grid-cols-3 gap-6">
                <div className="bg-white border border-slate-100 rounded-xl p-4 shadow-sm">
                  <div className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2">
                    <PieChartIcon size={15} className="text-rose-500" /> 投诉类型分布
                  </div>
                  <div className="h-[220px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={reportData.complaintTopics.slice(0, 6)} cx="50%" cy="50%" innerRadius={55} outerRadius={90} paddingAngle={2} dataKey="value" nameKey="name">
                          {reportData.complaintTopics.slice(0, 6).map((_: any, i: number) => (
                            <Cell key={i} fill={['#f87171', '#fb923c', '#fbbf24', '#a78bfa', '#60a5fa', '#34d399'][i % 6]} />
                          ))}
                        </Pie>
                        <Tooltip contentStyle={{ borderRadius: 8, border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>
                <div className="bg-white border border-slate-100 rounded-xl p-4 shadow-sm">
                  <div className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2">
                    <MapPin size={15} className="text-rose-500" /> 投诉地市分布
                  </div>
                  <div className="h-[220px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={complaintByCity.slice(0, 8)} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                        <XAxis
                          dataKey="name"
                          tick={{ fontSize: 10, fill: '#64748b' }}
                          axisLine={false}
                          tickLine={false}
                          interval={0}
                        />
                        <YAxis
                          tick={{ fontSize: 10, fill: '#94a3b8' }}
                          axisLine={false}
                          tickLine={false}
                        />
                        <Tooltip
                          contentStyle={{ borderRadius: 8, border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                          cursor={{ fill: '#f1f5f9' }}
                          formatter={(value) => [`${value} 件`, '投诉量']}
                        />
                        <Bar dataKey="value" fill="#f87171" radius={[4, 4, 0, 0]} maxBarSize={30} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
                <HotTopicTable data={reportData.complaintTopics} title="投诉热点统计表" />
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center py-10 text-slate-400">
              <ShieldCheck className="w-10 h-10 text-emerald-300 mb-3" />
              <p className="text-base font-medium text-emerald-600">本期暂未检测到投诉工单</p>
              <p className="text-sm text-slate-400 mt-1 text-center max-w-md">
                系统通过"业务类别/业务类型含'投诉'或'举报'"以及"举报二级分类/举报小类字段非空"自动识别。
              </p>
            </div>
          )}
        </GlassCard>

        {/* ─────────── 涉税投诉来电情况 ─────────── */}
        <GlassCard icon={MessageSquareWarning}>
          {taxComplaintTotal > 0 ? (
            <>
              <div className="mb-6 text-slate-600 leading-8 text-base bg-amber-50/60 p-5 rounded-xl border border-amber-100 indent-8">
                {formatDate(displayDateStart)}至{formatDate(displayDateEnd)}，全省共受理涉税投诉举报
                <span className="text-amber-600 font-bold text-2xl mx-2">{taxComplaintTotal.toLocaleString()}</span>件。
                涉税投诉举报事项主要集中在以下方面：
              </div>
              <div className="grid grid-cols-3 gap-6">
                <div className="bg-white border border-slate-100 rounded-xl p-4 shadow-sm">
                  <div className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2">
                    <PieChartIcon size={15} className="text-amber-500" /> 涉税投诉举报类型分布
                  </div>
                  <div className="h-[220px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={taxComplaintTopics.slice(0, 6)} cx="50%" cy="50%" innerRadius={55} outerRadius={90} paddingAngle={2} dataKey="value" nameKey="name">
                          {taxComplaintTopics.slice(0, 6).map((_: any, i: number) => (
                            <Cell key={i} fill={['#f59e0b', '#fbbf24', '#fcd34d', '#f87171', '#fb923c', '#fca5a5'][i % 6]} />
                          ))}
                        </Pie>
                        <Tooltip contentStyle={{ borderRadius: 8, border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>
                <div className="bg-white border border-slate-100 rounded-xl p-4 shadow-sm">
                  <div className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2">
                    <MapPin size={15} className="text-amber-500" /> 涉税投诉举报地市分布
                  </div>
                  <div className="h-[220px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={taxComplaintByCity.slice(0, 8)} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                        <XAxis
                          dataKey="name"
                          tick={{ fontSize: 10, fill: '#64748b' }}
                          axisLine={false}
                          tickLine={false}
                          interval={0}
                        />
                        <YAxis
                          tick={{ fontSize: 10, fill: '#94a3b8' }}
                          axisLine={false}
                          tickLine={false}
                        />
                        <Tooltip
                          contentStyle={{ borderRadius: 8, border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                          cursor={{ fill: '#f1f5f9' }}
                          formatter={(value) => [`${value} 件`, '涉税投诉举报量']}
                        />
                        <Bar dataKey="value" fill="#f59e0b" radius={[4, 4, 0, 0]} maxBarSize={30} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
                <HotTopicTable data={taxComplaintTopics} title="涉税投诉举报热点统计表" />
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center py-10 text-slate-400">
              <ShieldCheck className="w-10 h-10 text-emerald-300 mb-3" />
              <p className="text-base font-medium text-emerald-600">本期暂未检测到涉税投诉工单</p>
              <p className="text-sm text-slate-400 mt-1 text-center max-w-md">
                系统从"涉税投诉"业务大类下统计二级分类数据，包括发票、申报、优惠、征收、退税等涉税事项。
              </p>
            </div>
          )}
        </GlassCard>



        {/* 四、来电量情况 */}
        <SectionHeader title="四、来电量情况" step="04" />

        <div className="grid grid-cols-2 gap-6 mb-8 mt-6">
          {/* 同比对比图：仅当后端有真实历史数据时展示 */}
          {channelComparisonData.length > 0 ? (
            <GlassCard title="各渠道业务量同比对比" icon={Activity} className="h-[320px]">
              <div className="w-full h-full pt-4 pb-2 pr-4">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={channelComparisonData} margin={{ top: 10, right: 0, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis dataKey="name" tick={{ fontSize: 13, fill: '#64748b', fontWeight: 500 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 12, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                    <Tooltip
                      contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 8px 24px rgba(0,0,0,0.12)' }}
                      cursor={{ fill: '#f1f5f9' }}
                      formatter={(value: any, name: any) => [`${value?.toLocaleString()} 件`, name]}
                    />
                    <Legend wrapperStyle={{ paddingTop: '15px' }} iconType="circle" />
                    <Bar dataKey="同期" name="去年同期" fill="#6366F1" radius={[6, 6, 0, 0]} maxBarSize={50} />
                    <Bar dataKey="当期" name="当期业务量" fill="#14B8A6" radius={[6, 6, 0, 0]} maxBarSize={50} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </GlassCard>
          ) : (
            /* 无历史数据时，展示当期各渠道量柱状图替代 */
            <GlassCard title="各渠道业务量分布" icon={Activity} className="h-[320px]">
              <div className="w-full h-full pt-4 pb-2 pr-4">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={callVolumeChannelSummary.map((c: any) => ({ name: c.name, 业务量: c.total }))}
                    margin={{ top: 10, right: 0, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis dataKey="name" tick={{ fontSize: 13, fill: '#64748b' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 12, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={{ borderRadius: 12, border: 'none' }} cursor={{ fill: '#f1f5f9' }} />
                    <Bar dataKey="业务量" fill="#14B8A6" radius={[6, 6, 0, 0]} maxBarSize={60} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </GlassCard>
          )}

          {/* 渠道卡片 */}
          <div className="flex flex-col gap-6 h-[320px]">
            {hotlineStatus.map((item: any, idx: number) => (
              <div
                key={idx}
                className="bg-white border border-slate-200 rounded-2xl p-5 flex flex-col relative overflow-hidden shadow-sm hover:shadow-md transition-all flex-1"
              >
                <div className="absolute top-0 left-0 w-1.5 h-full" style={{ backgroundColor: COLORS[idx] }} />
                <div className="flex items-center justify-between mb-2 ml-2">
                  <div className="flex items-baseline gap-2">
                    <span className="text-slate-800 text-2xl font-black tracking-tight">{item.name}</span>
                    <span className="text-slate-500 text-sm font-medium">接听量</span>
                  </div>
                </div>
                <div className="flex items-baseline gap-2 ml-2 mt-1">
                  <span className="text-4xl font-black text-sky-600">{item.value.toLocaleString()}</span>
                  <span className="text-sm text-slate-400 font-bold">通</span>
                </div>
                <div className="mt-4 ml-2 flex gap-4">
                  <span className="text-sm text-slate-500 font-medium">
                    渠道占比: <span className="font-bold text-slate-700">{item.percent}%</span>
                  </span>

                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 地市分布柱状图 */}
        {callVolumeLocationList && callVolumeLocationList.length > 0 && (
          <GlassCard title="各地市来电总量分布 (基于明细数据统计)" icon={MapPin} className="mb-6">
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={callVolumeLocationList} margin={{ top: 10, right: 30, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} interval={0} />
                  <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <Tooltip
                    contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 8px 24px rgba(0,0,0,0.12)' }}
                    cursor={{ fill: '#f1f5f9' }}
                    formatter={(value: any) => [`${value?.toLocaleString()} 件`, '咨询明细总量']}
                  />
                  <Bar dataKey="value" fill="#0ea5e9" radius={[6, 6, 0, 0]} maxBarSize={40}>
                    {callVolumeLocationList.map((_: any, i: number) => (
                      <Cell key={i} fill={i < 3 ? '#FF6B6B' : '#4ECDC4'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="flex justify-center gap-6 mt-2 text-xs">
              <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-sm bg-[#FF6B6B]" /><span className="text-slate-600">TOP3 地市</span></div>
              <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-sm bg-[#4ECDC4]" /><span className="text-slate-600">其他地市</span></div>
            </div>
          </GlassCard>
        )}

        {/* 地市接听明细表 */}
        {tableHall && tableHall.length > 0 && (
          <GlassCard title="各地市办税服务厅接听情况" icon={PhoneCall}>
            <div className="max-h-[600px] overflow-y-auto pr-2 space-y-3">
              {tableHall.map((cityRow: any, cityIdx: number) => (
                <div key={cityIdx} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                  <div
                    className="bg-slate-50 px-4 py-3 border-b border-slate-200 flex items-center justify-between cursor-pointer hover:bg-slate-100 transition-colors"
                    onClick={() => {
                      if (cityRow.districts?.length > 0) {
                        setExpandedCities(prev => ({ ...prev, [cityRow.name]: !prev[cityRow.name] }));
                      }
                    }}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-sky-100 rounded-lg flex items-center justify-center text-sky-600 font-bold text-sm">{cityIdx + 1}</div>
                      <span className="font-bold text-slate-700">{cityRow.name}</span>
                      {cityRow.districts?.length > 0 && (
                        <span className="text-xs text-slate-400 ml-2">
                          {expandedCities[cityRow.name] ? '[收起区县]' : '[展开区县]'}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-6 text-sm">
                      <div className="text-right">
                        <div className="text-xs text-slate-400">转人工语音量</div>
                        <div className="font-bold text-slate-700">{cityRow.voice.toLocaleString()}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-slate-400">人工接听量</div>
                        <div className="font-bold text-sky-600">{cityRow.human.toLocaleString()}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-slate-400">接听率</div>
                        <div className={`font-bold ${parseFloat(cityRow.rate) < 90 ? 'text-rose-500' : 'text-emerald-600'}`}>{formatRate(cityRow.rate)}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-slate-400">好差评推送率</div>
                        <div className="font-bold text-slate-700">{cityRow.push}</div>
                      </div>
                      {cityRow.districts?.length > 0 ? (
                        <ChevronRight size={16} className={`text-slate-400 transition-transform ${expandedCities[cityRow.name] ? 'rotate-90' : ''}`} />
                      ) : <div className="w-4" />}
                    </div>
                  </div>

                  {expandedCities[cityRow.name] && cityRow.districts && (
                    <div className="overflow-x-auto bg-white">
                      <table className="w-full text-xs">
                        <thead className="bg-slate-50/50 text-slate-500">
                          <tr>
                            <th className="py-2.5 px-4 text-left font-medium w-1/4">区县/办税厅</th>
                            <th className="py-2.5 px-3 text-right font-medium">转人工语音量</th>
                            <th className="py-2.5 px-3 text-right font-medium">人工接听量</th>
                            <th className="py-2.5 px-3 text-right font-medium">接听率</th>
                            <th className="py-2.5 px-3 text-right font-medium">好差评推送率</th>
                          </tr>
                        </thead>
                        <tbody className="text-slate-600">
                          {cityRow.districts.map((dist: any, distIdx: number) => (
                            <tr key={distIdx} className="border-b border-slate-50 hover:bg-sky-50/30 transition-colors">
                              <td className="py-2.5 px-4">
                                <div className="flex items-center gap-2">
                                  <div className="w-1 h-1 rounded-full bg-slate-300" />
                                  <span className="font-medium text-slate-700">{dist.name}</span>
                                </div>
                              </td>
                              <td className="py-2.5 px-3 text-right">{dist.voice.toLocaleString()}</td>
                              <td className="py-2.5 px-3 text-right text-sky-600 font-medium">{dist.human.toLocaleString()}</td>
                              <td className="py-2.5 px-3 text-right">
                                <span className={parseFloat(dist.rate) < 90 ? 'text-rose-500 font-bold' : 'text-emerald-600 font-medium'}>{formatRate(dist.rate)}</span>
                              </td>
                              <td className="py-2.5 px-3 text-right">{dist.push}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </GlassCard>
        )}



      </div>
    </div>
  );
}
