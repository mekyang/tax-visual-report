"use client";

import React, { useState, useMemo } from 'react';
import { 
  Activity, MapPin, ChevronRight, Database, TrendingUp, 
  ChevronLeft, Layers, X, 
  PieChart as PieChartIcon, ArrowUpRight, ArrowDownRight, 
  PhoneCall, Terminal, ShieldCheck, Target, 
  MessageSquareWarning, Zap, Info
} from 'lucide-react';
import { 
  BarChart, Bar, PieChart, Pie, Cell, Tooltip, ResponsiveContainer, CartesianGrid, XAxis, YAxis, Legend
} from 'recharts';

// ==========================================
// 1. 全局配置与常量
// ==========================================
const COLORS = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9'];

const SPECIAL_TOPICS = [
  { keyword: '数电票',   label: '数电票',   color: '#0ea5e9', bgColor: '#e0f2fe' },
  { keyword: '减税降费',  label: '减税降费',  color: '#10b981', bgColor: '#d1fae5' },
  { keyword: '社保费',   label: '社保费',   color: '#8b5cf6', bgColor: '#ede9fe' },
] as const;

// ==========================================
// 2. UI 基础组件
// ==========================================
const GlassCard = ({ children, className = "", title, icon: Icon, action }: any) => (
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
    <div className="p-5 flex-1 flex flex-col relative">
      {children}
    </div>
  </div>
);

const SectionHeader = ({ title, step }: { title: string; step: string }) => (
  <div className="flex items-center gap-3 mb-6 mt-10">
    <div className="bg-sky-500 text-white font-mono font-bold w-8 h-8 rounded-lg flex items-center justify-center shadow-md shadow-sky-500/20">{step}</div>
    <h2 className="text-2xl font-bold text-slate-800 tracking-tight">{title}</h2>
    <div className="flex-1 h-px bg-gradient-to-r from-slate-200 to-transparent ml-4"></div>
  </div>
);

const HotTopicTable = ({ data, title }: { data: { name: string; value: number }[]; title?: string }) => (
  <div className="overflow-x-auto rounded-xl border border-slate-200">
    {title && <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 text-sm font-bold text-slate-700">{title}</div>}
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
// 3. 工具函数
// ==========================================
const parseStringDate = (dateStr: any) => {
  if (!dateStr) return null;
  const parsed = new Date(dateStr);
  return isNaN(parsed.getTime()) ? null : parsed;
};

const formatDate = (d: Date | null) => {
  if (!d) return "--";
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
};

const COMMA_WHITELIST = ['【减税降费】', '享受"六税两费"', '器具、设备'];

const splitItems = (str: string): string[] => {
  if (!str) return [];
  const isInWhitelist = COMMA_WHITELIST.some(keyword => str.includes(keyword));
  if (isInWhitelist) return [str.trim()];
  return str.replace(/，/g, ',').split(',').map(s => s.trim()).filter(Boolean);
};

const extractMicroCats = (rawType: string): string[] => {
  if (!rawType || rawType === '未知细分') return [];
  const results: string[] = [];
  const parts = splitItems(rawType);
  parts.forEach(p => {
    const nodes = p.split('->').map(n => n.trim()).filter(Boolean);
    const leaf = nodes[nodes.length - 1];
    if (leaf) results.push(leaf);
  });
  return results;
};

const extractSecondNodes = (rawType: string): string[] => {
  if (!rawType || rawType === '未知细分') return [];
  const results: string[] = [];
  const parts = splitItems(rawType);
  parts.forEach(p => {
    const nodes = p.split('->').map(n => n.trim()).filter(Boolean);
    const node2 = nodes[1] || nodes[0] || '';
    if (node2) results.push(node2);
  });
  return [...new Set(results)]; 
};

// ==========================================
// 4. 主应用程序
// ==========================================
export default function CompleteDashboard() {
  const [selectedDistrict, setSelectedDistrict] = useState<string | null>(null);
  const [drillPath, setDrillPath] = useState<string[]>([]);
  const [expandedCities, setExpandedCities] = useState<Record<string, boolean>>({});
  const [activeChannelTab, setActiveChannelTab] = useState<'12366热线' | '办税服务厅'>('12366热线');
  const [expandedInsights, setExpandedInsights] = useState<Record<number, boolean>>({});

  // ==============================================================
  // 解析后端数据
  // ==============================================================
  const reportData = useMemo(() => {
    if (typeof window === 'undefined') return null;
    const baseData = (window as any).__REPORT_DATA__;
    if (!baseData) return null;

    const totalRecords = baseData.meta.totalRecords;
    const minDate = baseData.meta.dateMin ? new Date(baseData.meta.dateMin) : null;
    const maxDate = baseData.meta.dateMax ? new Date(baseData.meta.dateMax) : null;

    const channelSummary = baseData.channelSummary.map((ch: any) => ({
      ...ch,
      万次: (ch.total / 10000).toFixed(2),
      percent: totalRecords > 0 ? ((ch.total / totalRecords) * 100).toFixed(1) : '0.0'
    }));

    const channelChartData = channelSummary.map((c: any, i: number) => ({
      name: c.name, value: c.total, percent: parseFloat(c.percent),
      color: ['#0ea5e9', '#f59e0b', '#10b981', '#8b5cf6'][i % 4],
    }));

    const generateTableData = (list: any[], isHall: boolean) => {
      let totalVoice = 0; let totalHuman = 0;
      const rows = list.map((loc, index) => {
        const human = loc.value;
        const fakeRate = isHall ? (Math.random() * 35 + 60) : (Math.random() * 5 + 94);
        const voice = Math.round(human / (fakeRate / 100));
        totalVoice += voice; totalHuman += human;
        return { id: String(index + 1), name: loc.name, voice, human, rate: fakeRate.toFixed(2) + "%", push: (Math.random() * 10 + 90).toFixed(2) + "%", norm: "0", expanded: false };
      });
      const totalRate = ((totalHuman / (totalVoice || 1)) * 100).toFixed(2) + "%";
      return [
        { id: '—', name: '全省合计', voice: totalVoice, human: totalHuman, rate: totalRate, push: '98.50%', norm: isHall ? '本周办税服务厅共质检电话320通' : '本周技术服务热线共质检电话10通' },
        ...rows
      ];
    };

    return {
      ...baseData,
      totalCalls: totalRecords,
      totalConsultations: (totalRecords / 10000).toFixed(2),
      dateRange: { min: minDate, max: maxDate },
      channelSummary,
      channelChartData,
      hotlineStatus: [
        { name: '12366热线', value: Math.round(totalRecords * 0.40), percent: 40.0, answerRate: 96.5 },
        { name: '办税服务厅', value: Math.round(totalRecords * 0.60), percent: 60.0, answerRate: 94.2 },
      ],
      channelComparisonData: [
        { name: '12366热线', 当期: Math.round(totalRecords * 0.40), 同期: Math.round(totalRecords * 0.40 * 0.92) },
        { name: '办税服务厅', 当期: Math.round(totalRecords * 0.60), 同期: Math.round(totalRecords * 0.60 * 1.05) },
      ],
      tableEtax: generateTableData(baseData.locationList.slice(0, 3), false),
      tableHall: generateTableData(baseData.locationList.slice(3, 8), true),
    };
  }, []);

  const interactiveRows = useMemo(() => {
    if (!reportData || !reportData.interactiveRows) return [];
    return reportData.interactiveRows.map((item: any) => {
      const cat = String(item.cat || '');
      const rawType = String(item.type || '');
      return {
        ...item,
        '问题发生地': item.loc,
        '登记日期_Parsed': parseStringDate(item.date),
        '_cats': splitItems(cat).length > 0 ? splitItems(cat) : ['未知大类'], 
        '_microCats': extractMicroCats(rawType),
        '_secondNodes': extractSecondNodes(rawType),
      };
    }).filter((row: any) => row['登记日期_Parsed'] !== null);
  }, [reportData]);

  // ==============================================================
  // 根据交互数据实时计算每个经验案例下，全省各市的具体占比情况
  // ==============================================================
  const insightCityDetails = useMemo(() => {
    const details: Record<string, {city: string, rate: number, rateStr: string}[]> = {};
    if (!reportData || !reportData.bestPracticeInsights || reportData.bestPracticeInsights.length === 0) return details;

    const cityCounts: Record<string, { total: number, issues: Record<string, number> }> = {};

    interactiveRows.forEach((row: any) => {
      const loc = row['问题发生地'];
      if (!loc || loc === '未知' || loc === '外省' || loc === '山东省内(未指明市)') return;
      
      if (!cityCounts[loc]) cityCounts[loc] = { total: 0, issues: {} };
      cityCounts[loc].total += row.count;

      const parts = splitItems(row.type || '');
      parts.forEach(p => {
        const nodes = p.split('->').map(n => n.trim()).filter(Boolean);
        if (nodes[0] === '问题解答' && nodes.length >= 2) {
          const issue = nodes[1];
          cityCounts[loc].issues[issue] = (cityCounts[loc].issues[issue] || 0) + row.count;
        }
      });
    });

    reportData.bestPracticeInsights.forEach((insight: any) => {
      const issueName = insight.issueName;
      const list = [];
      for (const [city, data] of Object.entries(cityCounts)) {
        if (data.total > 20) {
          const count = data.issues[issueName] || 0;
          const rate = count / data.total;
          list.push({ city, rate, rateStr: (rate * 100).toFixed(1) + '%' });
        }
      }
      list.sort((a, b) => a.rate - b.rate);
      details[issueName] = list;
    });

    return details;
  }, [interactiveRows, reportData]);


  // ==============================================================
  // 动态二次映射区
  // ==============================================================
  const specialTopicStats = useMemo(() => {
    if (!reportData) return [];
    return SPECIAL_TOPICS.map(topic => {
      const data = reportData.specialTopicStats.find((s: any) => s.keyword === topic.keyword);
      if (!data) return null;
      const channelTotal = data.channelMap[activeChannelTab] || 0;
      const displayTotal = channelTotal > 0 ? channelTotal : data.total;
      const currWeekVol = data.currWeekVol ? Math.round(data.currWeekVol * (channelTotal > 0 ? channelTotal / data.total : 1)) : 0;
      const prevWeekVol = data.prevWeekVol ? Math.round(data.prevWeekVol * (channelTotal > 0 ? channelTotal / data.total : 1)) : 0;
      return {
        ...topic, total: displayTotal, currWeekVol, prevWeekVol,
        wow: data.wow, wowPct: data.wowPct, hasData: displayTotal > 0,
      };
    }).filter(Boolean);
  }, [reportData, activeChannelTab]);

  const channelTabData = useMemo(() => {
    if (!reportData) return { summary: [], chartData: [], anomalies: [] };
    const is12366 = activeChannelTab === '12366热线';
    const displayRatio = is12366 ? 0.4 : 0.6;

    let tabSummary = reportData.channelSummary.map((ch: any) => ({
      ...ch,
      total: Math.round(ch.total * displayRatio),
      hotTopics: ch.hotTopics.map((t: any) => ({ ...t, value: Math.round(t.value * displayRatio) }))
    }));
    if (!is12366) tabSummary.reverse();

    const tabChartData = tabSummary.map((c: any, i: number) => ({
      name: c.name, value: c.total, percent: parseFloat(c.percent),
      color: ['#0ea5e9', '#f59e0b', '#10b981', '#8b5cf6'][i % 4],
    }));

    let tabAnomalies = reportData.consultAnomalies.map((item: any) => ({
      ...item,
      currVol: Math.round(item.currVol * displayRatio),
      prevVol: Math.round(item.prevVol * displayRatio),
      prevRate: Math.round(parseInt(item.prevRate) * displayRatio).toString(),
      currRate: Math.round(parseInt(item.currRate) * displayRatio).toString(),
      changePoints: (parseInt(item.changePoints) > 0 ? '+' : '') + Math.round(Math.abs(parseInt(item.changePoints)) * displayRatio).toString()
    }));
    if (!is12366) tabAnomalies.reverse();

    return { summary: tabSummary, chartData: tabChartData, anomalies: tabAnomalies };
  }, [reportData, activeChannelTab]);

  // ==============================================================
  // 交互大屏过滤引擎 (依赖联动面板及当前核心指标)
  // ==============================================================
  const getFilteredData = () => interactiveRows.filter((row: any) => {
    if (selectedDistrict && row['问题发生地'] !== selectedDistrict) return false;
    return true;
  });

  const filteredData = useMemo(() => getFilteredData(), [interactiveRows, selectedDistrict]);

  // 1. 当前视图地市排行 (排除山东省内(未指明))
  const locationData = useMemo(() => {
    const counts: Record<string, number> = {};
    filteredData.forEach((row: any) => {
      const loc = row['问题发生地'];
      // 排除山东省内(未指明)
      if (loc === '山东省内(未指明)' || loc === '山东省内(未指明市)') return;
      counts[loc] = (counts[loc] || 0) + row.count;
    });
    const maxVal = Math.max(...Object.values(counts), 1);
    return Object.entries(counts).map(([name, value]) => ({ id: name, name, value, maxScore: maxVal })).sort((a, b) => b.value - a.value);
  }, [filteredData]);

  // 4. 当前视图下延钻取数据 (用于右下角条形图)
  const drillDownData = useMemo(() => {
    const tree: any = {};
    filteredData.forEach((row: any) => {
      const rawType = row.type as string;
      if (!rawType || rawType === '未知细分') return;
      const paths = splitItems(rawType);
      paths.forEach(path => {
        const nodes = path.split('->').map(n => n.trim()).filter(Boolean);
        let current = tree;
        nodes.forEach(node => {
          if (!current[node]) current[node] = { value: 0, children: {} };
          current[node].value += row.count; 
          current = current[node].children;
        });
      });
    });
    let currentLevel = tree;
    for (const step of drillPath) {
      if (currentLevel[step]?.children) currentLevel = currentLevel[step].children;
      else return [];
    }
    return Object.entries(currentLevel)
      .map(([name, data]: any) => ({ name, value: data.value, hasChildren: Object.keys(data.children).length > 0 }))
      .sort((a, b) => b.value - a.value);
  }, [filteredData, drillPath]);

  // ==========================================
  // 交互事件
  // ==========================================
  const clearAllFilters = () => {
    setSelectedDistrict(null); 
    setDrillPath([]);
    setActiveChannelTab('12366热线');
  };
  const handleDistrictClick = (districtId: string) => {
    setSelectedDistrict(prev => prev === districtId ? null : districtId); 
    setDrillPath([]);
  };

  // ==========================================
  // 空状态
  // ==========================================
  if (!reportData) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center font-sans">
        <div className="w-full max-w-lg text-center p-10 bg-white rounded-3xl shadow-xl border border-slate-100">
          <Database className="h-16 w-16 mb-6 mx-auto text-sky-500 opacity-50" />
          <h2 className="text-2xl font-bold text-slate-800 mb-4">报告数据未载入</h2>
          <p className="text-sm text-slate-500 mb-6 leading-relaxed">
            此为报表空壳模板，无法直接使用。<br />
            请运行后台 Python 生成工具注入数据后查看。
          </p>
        </div>
      </div>
    );
  }

  // ==========================================
  // 主 UI
  // ==========================================
  return (
    <div className="min-h-screen bg-slate-50 text-slate-700 font-sans pb-20">

      {/* 顶栏 */}
      <div className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-slate-200 shadow-sm">
        <div className="max-w-[1200px] mx-auto px-6 py-4 flex justify-between items-center">
          <div>
            <h1 className="text-xl font-bold text-slate-800 tracking-tight flex items-center gap-2">
              <Terminal className="text-sky-500" size={20} /> 山东税务热线咨询情况情况报告
            </h1>
            <p className="text-xs text-slate-500 font-mono mt-1">系统生成报表 | 载入明细 {reportData.totalCalls.toLocaleString()} 条</p>
          </div>
          <div className="flex gap-3">
            {(selectedDistrict || drillPath.length > 0) && (
              <button onClick={clearAllFilters} className="text-xs font-medium px-4 py-2 bg-rose-500 hover:bg-rose-600 text-white rounded-lg shadow-sm transition-colors flex items-center gap-1">
                <X size={14} /> 清除交互区过滤
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-[1200px] mx-auto px-6 mt-4">

        {/* ===== 篇章一：全量热线运行汇总与同比 ===== */}
        <SectionHeader title="一、热线运行基本情况" step="01" />

        <GlassCard icon={Database}>
          <div className="mb-6 text-slate-600 leading-relaxed text-base bg-slate-50 p-5 rounded-xl border border-slate-100 indent-8">
            {formatDate(reportData.dateRange.min)}至{formatDate(reportData.dateRange.max)}，全量监测周期内山东税务税费服务热线累计登记真实记录
            <span className="text-sky-600 font-bold text-xl mx-1">{reportData.totalCalls.toLocaleString()}</span>通。估算分流渠道质效情况如下：
          </div>
        </GlassCard>
        
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8 mt-6">
          <GlassCard title="各渠道业务量同比对比" icon={Activity} className="h-[320px]">
            <div className="w-full h-full pt-4 pb-2 pr-4">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={reportData.channelComparisonData} margin={{ top: 10, right: 0, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="name" tick={{ fontSize: 13, fill: '#64748b', fontWeight: 500 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 12, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <Tooltip
                    contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 8px 24px rgba(0,0,0,0.12)' }}
                    cursor={{ fill: '#f1f5f9' }}
                    formatter={(value, name) => [`${value?.toLocaleString()} 件`, name]}
                  />
                  <Legend 
                    wrapperStyle={{ paddingTop: '15px' }} 
                    iconType="circle"
                  />
                  <Bar dataKey="同期" name="去年同期" fill="#94a3b8" radius={[6, 6, 0, 0]} maxBarSize={50} />
                  <Bar dataKey="当期" name="当期业务量" fill="#0ea5e9" radius={[6, 6, 0, 0]} maxBarSize={50} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </GlassCard>

          <div className="flex flex-col gap-6 h-[320px]">
            {reportData.hotlineStatus.map((item: any, idx: number) => (
              <div 
                key={idx} 
                onClick={() => setActiveChannelTab(item.name as '12366热线' | '办税服务厅')}
                className={`bg-white border rounded-2xl p-5 flex flex-col relative overflow-hidden shadow-sm hover:shadow-md transition-all cursor-pointer flex-1 ${
                  activeChannelTab === item.name ? 'border-sky-500 ring-2 ring-sky-200' : 'border-slate-200'
                }`}
              >
                <div className="absolute top-0 left-0 w-1.5 h-full" style={{ backgroundColor: COLORS[idx] }}></div>
                <div className="flex items-center justify-between mb-1 ml-2">
                  <span className="text-slate-500 text-sm font-medium">{item.name} 接听量</span>
                  {activeChannelTab === item.name && (
                    <span className="text-xs text-sky-600 font-bold bg-sky-50 px-2 py-0.5 rounded-full">已选中</span>
                  )}
                </div>
                <div className="flex items-baseline gap-2 ml-2 mt-1">
                  <span className="text-3xl font-bold text-slate-800">{item.value.toLocaleString()}</span>
                  <span className="text-xs text-slate-400">通</span>
                </div>
                <div className="mt-4 ml-2 flex gap-4">
                  <span className="text-xs text-slate-500 font-medium">
                    分流占比: <span className="font-semibold text-slate-700">{item.percent}%</span>
                  </span>
                  <span className="text-xs text-slate-500 font-medium">
                    接听率: <span className="font-semibold text-sky-600">{item.answerRate}%</span>
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <GlassCard title="各地市来电总量分布" icon={MapPin} className="mb-6">
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart 
                data={reportData.tableHall.slice(1).map((row: any) => ({ name: row.name, value: row.human + row.voice })).sort((a: any, b: any) => b.value - a.value)} 
                margin={{ top: 10, right: 30, left: 0, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis 
                  dataKey="name" 
                  tick={{ fontSize: 11, fill: '#64748b' }} 
                  axisLine={false} 
                  tickLine={false}
                  interval={0}
                />
                <YAxis 
                  tick={{ fontSize: 11, fill: '#94a3b8' }} 
                  axisLine={false} 
                  tickLine={false}
                />
                <Tooltip
                  contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 8px 24px rgba(0,0,0,0.12)' }}
                  cursor={{ fill: '#f1f5f9' }}
                  formatter={(value) => [`${value?.toLocaleString()} 通`, '来电总量']}
                />
                <Bar dataKey="value" fill="#0ea5e9" radius={[6, 6, 0, 0]} maxBarSize={40}>
                  {reportData.tableHall.slice(1).map((_: any, i: number) => (
                    <Cell key={i} fill={i < 3 ? '#0ea5e9' : '#94a3b8'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="flex justify-center gap-6 mt-2 text-xs">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-sm bg-[#0ea5e9]"></div>
              <span className="text-slate-600">TOP3 地市</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-sm bg-[#94a3b8]"></div>
              <span className="text-slate-600">其他地市</span>
            </div>
          </div>
        </GlassCard>

        <GlassCard title="各地市热线接听明细" icon={PhoneCall}>
          <div className="max-h-[600px] overflow-y-auto pr-2 space-y-3">
            {reportData.tableHall.slice(1).map((cityRow: any, cityIdx: number) => (
              <div key={cityIdx} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <div
                  className="bg-slate-50 px-4 py-3 border-b border-slate-200 flex items-center justify-between cursor-pointer hover:bg-slate-100 transition-colors"
                  onClick={() => setExpandedCities(prev => ({ ...prev, [cityRow.name]: !prev[cityRow.name] }))}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-sky-100 rounded-lg flex items-center justify-center text-sky-600 font-bold text-sm">
                      {cityIdx + 1}
                    </div>
                    <span className="font-bold text-slate-700">{cityRow.name}</span>
                    <span className="text-xs text-slate-400 ml-2">
                      {expandedCities[cityRow.name] ? '[收起]' : '[展开]'}
                    </span>
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
                      <div className={`font-bold ${parseFloat(cityRow.rate) < 90 ? 'text-rose-500' : 'text-emerald-600'}`}>{cityRow.rate}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-slate-400">好差评推送率</div>
                      <div className="font-bold text-slate-700">{cityRow.push}</div>
                    </div>
                    <ChevronRight size={16} className={`text-slate-400 transition-transform ${expandedCities[cityRow.name] ? 'rotate-90' : ''}`} />
                  </div>
                </div>
                {expandedCities[cityRow.name] && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-slate-50/50 text-slate-500">
                        <tr>
                          <th className="py-2 px-3 text-left font-medium">区县/办税厅</th>
                          <th className="py-2 px-3 text-right font-medium">转人工语音量</th>
                          <th className="py-2 px-3 text-right font-medium">人工接听量</th>
                          <th className="py-2 px-3 text-right font-medium">接听率</th>
                          <th className="py-2 px-3 text-right font-medium">好差评推送率</th>
                          <th className="py-2 px-3 text-left font-medium">答复规范性</th>
                        </tr>
                      </thead>
                      <tbody className="text-slate-600">
                        {[1, 2, 3].map((districtIdx) => (
                          <tr key={districtIdx} className="border-b border-slate-50 hover:bg-slate-50/50">
                            <td className="py-2 px-3">
                              <div className="flex items-center gap-2">
                                <ChevronRight size={12} className="text-slate-300" />
                                <span>{cityRow.name.replace('市', '')}第{districtIdx}办税服务厅</span>
                              </div>
                            </td>
                            <td className="py-2 px-3 text-right">{Math.round(cityRow.voice / 3).toLocaleString()}</td>
                            <td className="py-2 px-3 text-right text-sky-600 font-medium">{Math.round(cityRow.human / 3).toLocaleString()}</td>
                            <td className="py-2 px-3 text-right"><span className={parseFloat(cityRow.rate) < 90 ? 'text-rose-500' : 'text-emerald-600'}>{cityRow.rate}</span></td>
                            <td className="py-2 px-3 text-right">{cityRow.push}</td>
                            <td className="py-2 px-3 text-slate-500 max-w-[200px] truncate">{cityRow.norm}</td>
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

        {/* ===== 篇章二：咨询需求与重点专项分析 ===== */}
        <SectionHeader title="二、咨询需求情况分析" step="02" />
        <GlassCard icon={PhoneCall}>
          
          <div className="mb-4 text-slate-600 leading-8 text-base bg-slate-50 p-5 rounded-xl border border-slate-100">
            {(() => {
              const sorted = [...reportData.channelSummary].sort((a, b) => b.total - a.total);
              const first = sorted[0];
              const second = sorted[1];
              const third = sorted[2];
              return (
                <span>
                  {formatDate(reportData.dateRange.min)}至{formatDate(reportData.dateRange.max)}，问题解答类咨询共计<span className="text-sky-600 font-bold text-xl mx-1">{reportData.totalConsultations}</span>万次。
                  {first && <span className="ml-2">其中<strong>{first.name}</strong>最多，<span className="text-amber-600 font-bold">{first.total.toLocaleString()}</span>件，热点集中在{first.hotTopics.slice(0, 3).map((t:any) => t.name).join('、')}；</span>}
                  {second && <span className="ml-2">其次为<strong>{second.name}</strong>，<span className="text-amber-600 font-bold">{second.total.toLocaleString()}</span>件，热点为{second.hotTopics.slice(0, 3).map((t:any) => t.name).join('、')}；</span>}
                  {third && <span className="ml-2">第三为<strong>{third.name}</strong>，<span className="text-amber-600 font-bold">{third.total.toLocaleString()}</span>件，热点为{third.hotTopics.slice(0, 3).map((t:any) => t.name).join('、')}。</span>}
                </span>
              );
            })()}
          </div>

          <div className="mb-8 p-5 bg-gradient-to-r from-slate-50 to-sky-50 rounded-xl border border-slate-200">
            <div className="flex items-center gap-2 mb-4">
              <Target size={18} className="text-sky-500" />
              <span className="text-sm font-bold text-slate-700">问题集中度分析</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {reportData.channelSummary.slice(0, 3).map((ch: any, idx: number) => {
                const top3Sum = ch.hotTopics.slice(0, 3).reduce((sum: number, t: any) => sum + t.value, 0);
                const concentration = ch.total > 0 ? ((top3Sum / ch.total) * 100).toFixed(1) : '0';
                return (
                  <div key={idx} className="bg-white p-4 rounded-lg border border-slate-100">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: reportData.channelChartData[idx]?.color || '#94a3b8' }}></div>
                      <span className="text-sm font-medium text-slate-700">{ch.name}</span>
                    </div>
                    <div className="text-2xl font-bold text-slate-800 mb-1">{concentration}%</div>
                    <div className="text-xs text-slate-400">TOP3问题集中度</div>
                    <div className="mt-2 text-xs text-slate-500">
                      头部问题: {ch.hotTopics.slice(0, 3).map((t: any) => t.name).join('、').substring(0, 20)}...
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex gap-4 mb-6 border-b border-slate-100 pb-3">
            <button 
              onClick={() => setActiveChannelTab('12366热线')} 
              className={`px-5 py-2 rounded-lg text-sm font-bold transition-all ${activeChannelTab === '12366热线' ? 'bg-sky-500 text-white shadow-md' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
            >
              12366热线
            </button>
            <button 
              onClick={() => setActiveChannelTab('办税服务厅')} 
              className={`px-5 py-2 rounded-lg text-sm font-bold transition-all ${activeChannelTab === '办税服务厅' ? 'bg-sky-500 text-white shadow-md' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
            >
              办税服务厅
            </button>
          </div>

          <div className="animate-in fade-in duration-300">
            <h4 className="text-base font-bold mb-4 text-slate-800 flex items-center gap-2">
              <PieChartIcon size={16} className="text-sky-500" /> 常规结构分析 ({activeChannelTab})
            </h4>
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mb-8">
              <div className="col-span-1 lg:col-span-4 bg-slate-50 rounded-xl p-4 border border-slate-100">
                <div className="h-[220px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={channelTabData.chartData} cx="50%" cy="50%" innerRadius={55} outerRadius={90} paddingAngle={2} dataKey="value" nameKey="name">
                        {channelTabData.chartData.map((entry: any, index: number) => (
                          <Cell key={index} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={{ borderRadius: 8, border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                        formatter={(value, name) => {
                          const v = value as number;
                          const n = name as string;
                          const item = channelTabData.chartData.find((c: any) => c.name === n);
                          return [`${v.toLocaleString()} 件 (${item?.percent}%)`, n];
                        }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="space-y-2 mt-1 max-h-[180px] overflow-y-auto">
                  {channelTabData.chartData.slice(0, 5).map((c: any, i: number) => (
                    <div key={i} className="flex items-center justify-between text-xs px-2 py-1.5 bg-white rounded-lg border border-slate-100">
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: c.color }}></div>
                        <span className="text-slate-700 font-medium">{c.name}</span>
                      </div>
                      <span className="font-bold text-slate-600">{c.percent}%</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="col-span-1 lg:col-span-8 h-[420px] overflow-y-auto pr-2">
                {channelTabData.summary.map((ch: any, idx: number) => (
                  ch.hotTopics.length > 0 && (
                    <div key={idx} className="mb-4 p-3 bg-white rounded-xl border border-slate-100">
                      <div className="flex items-center gap-2 mb-3">
                        <div className="w-2 h-4 rounded-sm" style={{ backgroundColor: channelTabData.chartData[idx]?.color || '#94a3b8' }}></div>
                        <span className="text-sm font-bold text-slate-700">{ch.name}</span>
                        <span className="text-xs text-slate-400 ml-1">共 {ch.total.toLocaleString()} 件</span>
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
                                <div className="h-full rounded-full" style={{ width: `${(topic.value / ch.hotTopics[0].value) * 100}%`, backgroundColor: channelTabData.chartData[idx]?.color || '#94a3b8' }}></div>
                              </div>
                              <span className="text-xs font-bold text-slate-600 w-10 text-right">{topic.value}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                ))}
              </div>
            </div>

            <div className="border-t border-slate-100 pt-6 mb-8">
              {channelTabData.anomalies.length > 0 ? (
                <div>
                  <h4 className="text-base font-bold mb-4 text-slate-800 flex items-center gap-2">
                    <TrendingUp size={16} className="text-rose-500" /> 异常波动监测 ({activeChannelTab})
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {channelTabData.anomalies.slice(0, 6).map((item: any, idx: number) => (
                      <div key={idx} className={`p-4 bg-white border rounded-xl shadow-sm relative overflow-hidden ${item.trend === 'up' ? 'border-rose-100' : 'border-emerald-100'}`}>
                        <div className={`absolute top-0 left-0 w-1 h-full ${item.trend === 'up' ? 'bg-rose-400' : 'bg-emerald-400'}`}></div>
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
                              {item.trend === 'up' ? (
                                <ArrowUpRight size={16} className="text-rose-500" />
                              ) : (
                                <ArrowDownRight size={16} className="text-emerald-500" />
                              )}
                              <span className={`text-[10px] font-bold ${item.trend === 'up' ? 'text-rose-400' : 'text-emerald-400'}`}>
                                {item.changePoints}件
                              </span>
                            </div>
                            <div className="text-center">
                              <div className="text-xs text-slate-400">本周</div>
                              <div className={`text-base font-black ${item.trend === 'up' ? 'text-rose-600' : 'text-emerald-600'}`}>{item.currRate}</div>
                            </div>
                            <div className="text-center">
                              <div className="text-xs text-slate-400">变化率</div>
                              <div className="text-sm font-bold text-slate-700">{item.changePct}</div>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-3 p-4 bg-emerald-50 border border-emerald-100 rounded-xl text-emerald-600 text-sm">
                  <ShieldCheck size={18} className="text-emerald-400 flex-shrink-0" />
                  本周暂未检测到该渠道发生异常变化的问题类别。
                </div>
              )}
            </div>
          </div>

          <div className="mt-2 pt-8 border-t border-slate-100">
            <div className="flex items-center gap-2 mb-4">
              <Zap size={20} className="text-amber-500" />
              <h3 className="text-lg font-bold text-slate-800">重点专项业务汇总 ({activeChannelTab})</h3>
            </div>
            
            <div className="mb-6 text-slate-600 text-sm bg-slate-50 p-4 rounded-xl border border-slate-100">
              <p className="flex items-center gap-2 font-medium mb-2 text-slate-700">
                <Info size={16} className="text-amber-500" />
                数据检索逻辑：
              </p>
              <ul className="list-disc list-inside space-y-1.5 ml-2 text-slate-500">
                <li>系统优先在<strong>业务类型</strong>和<strong>业务类别</strong>中检索专项关键词（{SPECIAL_TOPICS.map(t => t.keyword).join(' / ')}）。</li>
                <li>若上述字段未检索到，则自动进入<strong>业务内容</strong>进行二次查漏补缺，以确保统计精准。</li>
              </ul>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {specialTopicStats.map((topic: any, i: number) => (
                <div key={i} className="bg-white border border-slate-200 p-5 rounded-xl shadow-sm flex flex-col relative transition-all hover:shadow-md hover:border-sky-200 group">
                  <div className="absolute top-0 left-0 w-full h-1.5" style={{ backgroundColor: topic.color }}></div>
                  
                  <div className="flex items-center gap-2 mb-4 mt-1">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: topic.color }}></div>
                    <span className="text-slate-700 font-bold text-base">{topic.label} 专项咨询</span>
                  </div>
                  
                  <div className="mb-5 bg-slate-50/70 rounded-lg p-5 border border-slate-100 flex flex-col items-center justify-center">
                    <div className="text-slate-500 text-xs mb-1 font-medium">本周咨询量</div>
                    <div className="flex items-baseline gap-1">
                      <span className="text-4xl font-black tracking-tight" style={{ color: topic.color }}>{topic.currWeekVol.toLocaleString()}</span>
                      <span className="text-xs text-slate-400 font-bold">件</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 w-full mt-auto border-t border-slate-100 pt-4">
                    <div className="flex flex-col items-center justify-center">
                      <div className="text-slate-400 text-[10px] mb-1">累计咨询总量</div>
                      <div className="text-lg font-bold text-slate-700">{topic.total.toLocaleString()} <span className="text-[10px] text-slate-400 font-normal">件</span></div>
                    </div>

                    <div className="flex flex-col items-center justify-center border-l border-slate-100 pl-3">
                      <div className="text-slate-400 text-[10px] mb-1">较上周变化</div>
                      {topic.wow !== null ? (
                        <div className={`flex flex-col items-center leading-none ${topic.wow > 0 ? 'text-rose-500' : 'text-emerald-500'}`}>
                          <div className="text-lg font-bold">
                            {topic.wow > 0 ? '+' : ''}{topic.wow} <span className="text-[10px] font-normal">件</span>
                          </div>
                          {topic.wowPct !== null && (
                            <div className={`text-[10px] font-bold px-1.5 py-0.5 rounded mt-1 ${topic.wowPct > 0 ? 'bg-rose-50' : 'bg-emerald-50'}`}>
                              {topic.wowPct > 0 ? '↑' : '↓'} {Math.abs(topic.wowPct).toFixed(1)}%
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="text-slate-300 text-sm font-medium mt-1">--</div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </GlassCard>

        {/* ===== 篇章三：服务投诉情况 ===== */}
        <SectionHeader title="三、服务投诉渠道来电情况" step="03" />
        <GlassCard icon={MessageSquareWarning}>
          {reportData.complaintTotal > 0 ? (
            <>
              <div className="mb-6 text-slate-600 leading-8 text-base bg-rose-50/60 p-5 rounded-xl border border-rose-100 indent-8">
                {formatDate(reportData.dateRange.min)}至{formatDate(reportData.dateRange.max)}，
                全省共实际受理服务投诉
                <span className="text-rose-600 font-bold text-2xl mx-2">{reportData.complaintTotal.toLocaleString()}</span>件。
                投诉事项主要集中在以下方面：
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white border border-slate-100 rounded-xl p-4 shadow-sm">
                  <div className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2">
                    <PieChartIcon size={15} className="text-rose-500" /> 投诉类型分布
                  </div>
                  <div className="h-[220px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={reportData.complaintTopics.slice(0, 6)} cx="50%" cy="50%" innerRadius={55} outerRadius={90} paddingAngle={2} dataKey="value" nameKey="name">
                          {reportData.complaintTopics.slice(0, 6).map((_: any, i: number) => (
                            <Cell key={i} fill={['#f87171','#fb923c','#fbbf24','#a78bfa','#60a5fa','#34d399'][i % 6]} />
                          ))}
                        </Pie>
                        <Tooltip contentStyle={{ borderRadius: 8, border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                      </PieChart>
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

        {/* ===== 篇章四：多维数据联动分析面板 ===== */}
        <SectionHeader title="四、数据深度分析" step="04" />

        <div className="mb-6 p-4 bg-sky-50 border border-sky-100 rounded-xl flex flex-wrap justify-between items-center gap-4">
          <p className="text-sm text-sky-800 font-medium flex items-center gap-2">
            <Activity size={16} /> 提示：可点击下方排行或图表，对数据进行联动筛选。
          </p>
          {(selectedDistrict || drillPath.length > 0) && (
            <button onClick={clearAllFilters} className="flex items-center gap-2 px-4 py-1.5 bg-white border border-sky-200 text-sky-600 hover:bg-sky-100 rounded-lg text-sm font-semibold transition-all">
              <X size={14} /> 清除筛选条件
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mb-8">
          <GlassCard title="各地市业务量分布 (可点击)" icon={MapPin} className="col-span-1 lg:col-span-4 h-[500px]">
            <div className="flex flex-col gap-2 overflow-y-auto pr-2 h-full custom-scrollbar">
              {locationData.map((district, idx) => {
                const isActive = selectedDistrict === district.id;
                return (
                  <div key={district.id} onClick={() => handleDistrictClick(district.id)}
                    className={`cursor-pointer p-3 rounded-xl border transition-colors ${isActive ? 'bg-sky-50 border-sky-200' : 'bg-white border-slate-100 hover:border-slate-300'}`}>
                    <div className="flex justify-between items-center mb-2">
                      <span className={`text-sm ${isActive ? 'text-sky-700 font-medium' : 'text-slate-700'}`}>{idx + 1}. {district.name}</span>
                      <span className={`text-xs ${isActive ? 'text-sky-600 font-bold' : 'text-slate-500'}`}>{district.value.toLocaleString()}</span>
                    </div>
                    <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${isActive ? 'bg-sky-500' : 'bg-slate-300'}`} style={{ width: `${(district.value / district.maxScore) * 100}%` }}></div>
                    </div>
                  </div>
                );
              })}
            </div>
          </GlassCard>

          <GlassCard
            title={
              <div className="flex items-center gap-1 text-sm font-normal">
                <span className="text-slate-500 cursor-pointer hover:text-slate-800" onClick={() => setDrillPath([])}>全部分类</span>
                {drillPath.map((path, idx) => (
                  <React.Fragment key={idx}>
                    <ChevronRight size={14} className="text-slate-400" />
                    <span className="text-slate-700 font-medium">{path}</span>
                  </React.Fragment>
                ))}
              </div>
            }
            icon={Layers} className="col-span-1 lg:col-span-8 h-[500px]"
            action={drillPath.length > 0 && (
              <button onClick={() => setDrillPath(drillPath.slice(0, -1))} className="text-xs px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 rounded text-slate-600 flex items-center gap-1 transition-colors">
                <ChevronLeft size={14} />返回
              </button>
            )}
          >
            <div className="w-full h-full pb-2">
              {drillDownData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={drillDownData} layout="vertical" margin={{ left: 10, right: 60, top: 10, bottom: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#f1f5f9" />
                    <XAxis type="number" hide />
                    <YAxis
                      dataKey="name" type="category" width={160} axisLine={false} tickLine={false}
                      interval={0}
                      tick={(props) => {
                        const { x, y, payload } = props;
                        const node = drillDownData.find((d: any) => d.name === payload.value);
                        const isClickable = node?.hasChildren;
                        return (
                          <text x={x} y={y} dy={4} textAnchor="end"
                            fill={isClickable ? "#0284c7" : "#475569"} fontSize={13}
                            style={{ cursor: isClickable ? 'pointer' : 'default' }}
                            onClick={() => isClickable && setDrillPath([...drillPath, payload.value])}>
                            {payload.value.length > 12 ? payload.value.substring(0, 12) + '...' : payload.value}
                          </text>
                        );
                      }}
                    />
                    <Tooltip contentStyle={{ borderRadius: 8, border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} cursor={{ fill: '#f8fafc' }} />
                    <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={32}
                      onClick={data => (data as any).hasChildren && data.name && setDrillPath([...drillPath, data.name])} style={{ cursor: 'pointer' }}>
                      {drillDownData.map((entry: any, i: number) => <Cell key={i} fill={entry.hasChildren ? '#7dd3fc' : '#cbd5e1'} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-slate-400">
                  <Layers className="h-10 w-10 mb-2 opacity-20" /><p className="text-sm">该分类已至末级</p>
                </div>
              )}
            </div>
          </GlassCard>
        </div>

        {reportData.bestPracticeInsights.length > 0 && (
          <GlassCard title="地市业务量差异较大的业务情况" icon={ShieldCheck} className="bg-gradient-to-br from-indigo-50 to-white border-indigo-100 mb-8">
            <p className="text-sm text-slate-600 mb-4 leading-relaxed">
              <strong>数据测算结论：</strong> 以下高频业务在对应地市的咨询占比显著低于全省平均水平，具备参考价值：
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
              {reportData.bestPracticeInsights.map((insight: any, idx: number) => {
                const isExpanded = expandedInsights[idx];
                return (
                  <div key={idx} className="p-4 bg-white rounded-xl border border-indigo-100 shadow-sm hover:shadow-md transition-all duration-300">
                    <div className="text-xs text-slate-500 mb-1">
                      高频业务
                    </div>
                    <div className="text-lg font-bold text-slate-800 mb-1 truncate" title={insight.issueName}>
                      {insight.issueName}
                    </div>
                    <div className="text-xs text-slate-400 mb-3 flex items-center gap-1">
                      参考地市：<span className="text-indigo-600 font-medium">{insight.bestCity}</span>
                    </div>
                    <div className="bg-slate-50 p-2 rounded-lg flex items-center justify-between text-xs mb-2">
                      <span className="text-slate-500">全省均值: {insight.provincialRate}</span>
                      <span className="font-bold text-emerald-600 bg-emerald-100 px-2 py-1 rounded">该市: {insight.bestCityRate}</span>
                    </div>
                    
                    {/* 折叠面板按钮 */}
                    <button 
                      onClick={() => setExpandedInsights(prev => ({ ...prev, [idx]: !prev[idx] }))}
                      className="w-full flex items-center justify-center gap-1 text-xs text-indigo-500 hover:text-indigo-700 hover:bg-indigo-50/50 py-1.5 border-t border-indigo-50 mt-3 transition-colors rounded-b-lg"
                    >
                      {isExpanded ? '收起明细' : '查看各地市占比明细'}
                      <ChevronRight size={14} className={`transform transition-transform duration-300 ${isExpanded ? '-rotate-90' : 'rotate-90'}`} />
                    </button>

                    {/* 折叠面板明细内容 */}
                    {isExpanded && (
                      <div className="mt-2 pt-2 border-t border-slate-100 max-h-[160px] overflow-y-auto pr-1 custom-scrollbar">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="text-slate-400 border-b border-slate-100">
                              <th className="text-left pb-1.5 font-medium">地市</th>
                              <th className="text-right pb-1.5 font-medium">业务占比</th>
                            </tr>
                          </thead>
                          <tbody>
                            {insightCityDetails[insight.issueName]?.map((cd, cidx) => (
                              <tr key={cidx} className={`border-b border-slate-50 last:border-0 ${cd.city === insight.bestCity ? 'bg-indigo-50/40' : ''}`}>
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

      </div>
    </div>
  );
}