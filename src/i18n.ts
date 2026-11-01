import * as vscode from 'vscode';
export type UiLang = 'id' | 'zh-cn';

/** Nilai pengaturan `dateSkunder.ui.language`: 'auto' mengikuti bahasa tampilan VS Code. */
export type UiLangSetting = 'auto' | UiLang;

export const LANG_SETTING = 'ui.language';

/** Bahasa yang sedang dipakai. Dibaca ulang setiap kali dipanggil supaya perubahan setting langsung terasa. */
export function uiLang(): UiLang {
    let value = 'auto';
    try {
        value = vscode.workspace.getConfiguration('dateSkunder').get<string>(LANG_SETTING) ?? 'auto';
    } catch {
        // Konteks tanpa workspace (mis. unit test) → ikuti bahasa VS Code.
    }
    if (value === 'id' || value === 'zh-cn') { return value; }
    const env = (() => { try { return vscode.env.language ?? ''; } catch { return ''; } })();
    return /^zh/i.test(env) ? 'zh-cn' : 'id';
}
export function tr(id: string, zh: string): string {
    return uiLang() === 'zh-cn' ? zh : id;
}

/** Pilihan pada QuickPick “Ganti Bahasa”. */
export const LANGUAGE_ITEMS: { value: UiLangSetting; label: string; description: string }[] = [
    {
        value: 'auto',
        label: '$(globe) Otomatis / 自动 / Auto',
        description: 'Ikuti bahasa tampilan VS Code · 跟随 VS Code 界面语言',
    },
    {
        value: 'id',
        label: '$(comment) Bahasa Indonesia',
        description: 'Antarmuka Bahasa Indonesia · 印尼语界面',
    },
    {
        value: 'zh-cn',
        label: '$(comment) 中文（简体）— Chinese',
        description: 'Antarmuka Mandarin · 简体中文界面',
    },
];

export const WEB_DICT: Record<string, string> = {
    // ── toolbar & tombol ekspor ────────────────────────────────────────────────
    'Export to DOCX': '导出 Word 文档',
    'Export Jurnal (PDF)': '导出论文（PDF）',
    'Export Excel': '导出 Excel',
    'Export PPT': '导出 PPT',
    'Export Flow': '导出流程图',
    'Export JSON': '导出 JSON',
    'Export Python': '导出 Python',
    'Online Project': '在线项目',
    'PyPI Online Project': 'PyPI 在线项目',
    'Visit Download': '查看下载量',
    'Reload': '重新加载',
    'Tema': '主题',
    'EasyCast': 'EasyCast',
    'Click to open in browser': '在浏览器中打开',
    'Save this data analysis as a professional Word document': '将本数据分析保存为专业的 Word 文档',
    'Simpan analisis ini sebagai jurnal PDF': '将本分析保存为论文 PDF',
    'Simpan laporan analisis sebagai .xlsx (lengkap dengan grafik)': '将分析结果保存为 .xlsx（含图表）',
    'Simpan analisis sebagai presentasi PowerPoint (.pptx)': '将分析保存为 PowerPoint 演示文稿（.pptx）',
    'Simpan diagram alur analisis sebagai gambar (PNG, JPG, SVG)': '将分析流程图保存为图片（PNG、JPG、SVG）',
    'Simpan seluruh hasil analisis berkas ini sebagai .json (semua lembar)': '将本文件的全部分析结果保存为 .json（所有工作表）',
    'Buat paket Python berisi seluruh data + skrip siap dijalankan (analysis.py, streamlit_app.py) + README':
        '生成包含全部数据与可运行脚本的 Python 包（analysis.py、streamlit_app.py）+ README',
    'Ganti tema tampilan halaman analisis (preset + warna kustom)': '更改分析页面主题（预设 + 自定义颜色）',

    // ── panel tema ─────────────────────────────────────────────────────────────
    'Tema siap pakai': '预设主题',
    'Warna kustom (langsung terlihat)': '自定义颜色（实时预览）',
    'Simpan tema': '保存主题',
    'Ikuti VS Code': '跟随 VS Code',
    'Tutup panel tema': '关闭主题面板',
    'Simpan tema ini — dipakai lagi setiap kali berkas dibuka': '保存此主题，下次打开文件时继续使用',
    'Buang tema kustom dan ikuti warna editor lagi': '清除自定义主题，恢复编辑器配色',
    'Tersimpan': '已保存',
    'Latar': '背景',
    'Teks': '文字',
    'Kartu': '卡片',
    'Garis': '边框',
    'Tombol': '按钮',
    'Aksen': '强调色',
    'Gelap Klasik': '经典深色',
    'Terang Bersih': '清爽浅色',
    'Laut Dalam': '深海',
    'Sakura': '樱花',
    'Rimba Hijau': '翠林',
    'Nebula Ungu': '紫色星云',
    'Kopi Hangat': '暖咖啡',

    // ── navigasi & judul bagian ────────────────────────────────────────────────
    'Summary': '摘要',
    'KPI Bisnis': '业务 KPI',
    'Stok Barang': '库存',
    'Analisis Kebutuhan': '需求分析',
    'Profil & Kualitas CSV': 'CSV 概况与质量',
    'Decision Tree C4.5': 'C4.5 决策树',
    'Notes & Observations': '备注与观察',
    'Insights': '洞察',
    'Data Table': '数据表',
    'Tabel Data': '数据表',
    'Bilangan bulat': '整数',
    'Desimal': '小数',
    'Chart Builder': '图表构建器',

    // ── grafik pratinjau data (pilih fitur) ────────────────────────────────────
    'Grafik Pratinjau Data': '数据图表预览',
    'Grafik Pratinjau': '图表预览',
    'Pilih fitur (kolom) yang ingin digrafikkan. Grafik mengikuti kotak pencarian tabel bila “Ikuti filter tabel” dicentang.':
        '选择要绘制图表的特征（列）。勾选“跟随表格筛选”时，图表会随表格搜索框过滤。',
    'Fitur': '特征',
    'pilih kolom yang ingin digrafikkan (maks. 8)': '选择要绘图的列（最多 8 个）',
    'Semua numerik': '全部数值列',
    'Semua kategori': '全部类别列',
    'Pilihan awal': '初始选择',
    'Kosongkan': '清空',
    'Jenis grafik': '图表类型',
    'Nilai (Y)': '数值（Y）',
    'Agregasi': '汇总方式',
    'Pecah per': '分组依据',
    'Jumlah nilai': '显示数量',
    'Urutan': '排序',
    'Ikuti filter tabel': '跟随表格筛选',
    '(jumlah baris)': '（行数）',
    '(tanpa)': '（无）',
    'Otomatis (per tipe)': '自动（按类型）',
    'Batang': '条形图',
    'Batang horizontal': '横向条形图',
    'Garis (line)': '折线图',
    'Area': '面积图',
    'Garis bertingkat': '阶梯折线图',
    'Batang bertumpuk': '堆叠条形图',
    '100% bertumpuk': '100% 堆叠图',
    'Pareto': '帕累托图',
    'Lollipop': '棒棒糖图',
    'Pie': '饼图',
    'Donut': '圆环图',
    'Polar area': '极区图',
    'Radar': '雷达图',
    'Histogram + kumulatif': '直方图 + 累计线',
    'Boxplot (Q1–Q3 + median)': '箱线图（Q1–Q3 + 中位数）',
    'Scatter + trendline': '散点图 + 趋势线',
    'Histogram': '直方图',
    'Boxplot': '箱线图',
    'Scatter': '散点图',
    'Bertumpuk': '堆叠',
    'Jumlah baris': '行数',
    'Total (sum)': '合计（求和）',
    'Rata-rata': '平均值',
    'Minimum': '最小值',
    'Maksimum': '最大值',
    'Otomatis': '自动',
    'Nilai ↓ (besar → kecil)': '数值 ↓（从大到小）',
    'Nilai ↑ (kecil → besar)': '数值 ↑（从小到大）',
    'Label A–Z': '标签 A–Z',
    'Semua nilai': '全部数值',
    'Top 10': '前 10 项',
    'Top 12': '前 12 项',
    'Top 15': '前 15 项',
    'Top 20': '前 20 项',
    'Top 30': '前 30 项',
    'Tidak ada baris yang cocok dengan filter tabel.': '没有符合表格筛选条件的行。',
    'Pilih minimal satu fitur di atas untuk menampilkan grafik.': '请在上方至少选择一个特征以显示图表。',
    'Scatter butuh dua fitur angka. Pilih dua kolom angka (Desimal/Bulat).':
        '散点图需要两个数值特征。请选择两个数值列（小数/整数）。',
    'Data tidak cukup untuk grafik ini.': '数据不足以绘制此图表。',
    'Titik dibatasi 3.000 baris pertama yang lolos filter · garis putus-putus = tren linear.':
        '数据点上限为筛选后的前 3,000 行 · 虚线 = 线性趋势。',
    'Tidak ada nilai angka pada filter ini.': '当前筛选下没有数值。',
    'Tidak ada nilai pada filter ini.': '当前筛选下没有值。',
    'Kolom pecahan sama dengan fitur ini — ditampilkan sebagai batang.': '分组列与当前特征相同 — 已改为条形图。',
    'Boxplot hanya untuk fitur angka — memakai jenis grafik bawaan.': '箱线图仅适用于数值特征 — 已改用默认图表类型。',
    'Charts': '图表',
    'Advanced': '高级',
    'Column Details': '列详情',
    'Correlation': '相关性',
    'Automated Insights': '自动洞察',
    'Visualizations': '可视化',
    'Correlation Matrix (Pearson)': '相关性矩阵（Pearson）',
    'Analisis & Manajemen Stok Barang': '库存分析与管理',
    'Analisis Semua Kebutuhan & Rekomendasi Bisnis': '全部需求分析与业务建议',
    'Analisis Kualitas & Profil File CSV': 'CSV 文件质量与概况分析',
    'KPI Bisnis & Penjualan': '业务与销售 KPI',
    'Analisis Pohon Keputusan C4.5': 'C4.5 决策树分析',
    'Data Stok Barang Tidak Terdeteksi Secara Otomatis': '未自动检测到库存数据',
    'Data tidak terdeteksi': '未检测到数据',

    // ── KPI ringkasan ──────────────────────────────────────────────────────────
    'Rows': '行数',
    'Columns': '列数',
    'Numeric': '数值列',
    'Categorical': '类别列',
    'Date': '日期列',
    'Missing Cells': '缺失单元格',
    'Duplicates': '重复行',
    'Baris': '行',
    'Kolom': '列',
    'Numerik': '数值列',
    'Kategorikal': '类别列',
    'Tanggal': '日期',
    'Nilai unik': '唯一值',
    'Nilai': '值',
    'Tipe': '类型',

    // ── judul grafik ───────────────────────────────────────────────────────────
    'Column Type Composition': '列类型构成',
    'Missing Values per Column (%)': '各列缺失值（%）',
    'Unique Values per Column': '各列唯一值数',
    'Mean vs Median Radar (Normalized 0–1)': '均值与中位数雷达图（归一化 0–1）',
    'Outliers per Numeric Column': '各数值列离群值数',
    'Outliers': '离群值',
    'Mean': '均值',
    'Median': '中位数',
    'Std': '标准差',
    'Skew': '偏度',
    'Min': '最小值',
    'Max': '最大值',
    'Distribusi Kesehatan Stok': '库存健康度分布',
    'Top 10 Barang dengan Stok Tertinggi': '库存量最高的 10 种商品',
    'Nilai Valuasi Aset Stok per Kategori': '各分类库存资产价值',
    'Analisis Pareto / ABC Inventaris (% Valuasi vs % SKU)': 'ABC / 帕累托库存分析（价值占比 vs SKU 占比）',
    'Kelas A (Prioritas Tinggi)': 'A 类（高优先级）',
    'Kelas B (Menengah)': 'B 类（中等）',
    'Kelas C (Ekonomis)': 'C 类（经济型）',
    'Valuasi': '估值',
    'Komposisi Status KPI': 'KPI 状态构成',
    'Tren Pendapatan & Laba per Periode': '各期间收入与毛利趋势',
    'Pertumbuhan Pendapatan antar Periode (%)': '各期间收入增长率（%）',
    'Pangsa Pendapatan Produk Teratas': '畅销商品收入占比',
    'Pendapatan Produk Teratas': '商品收入排行',
    'Pangsa Pendapatan per Kategori': '各分类收入占比',
    'Pendapatan per Wilayah': '各地区收入',
    'Pendapatan per Pelanggan Teratas': '客户收入排行',
    'Perbandingan Kinerja Model (%)': '模型性能对比（%）',
    'Precision, Recall, dan F1 per Kelas (%)': '各分类的精确率、召回率与 F1（%）',
    'Akurasi per Lipatan Validasi Silang (%)': '各交叉验证折准确率（%）',
    'Jumlah Simpul per Atribut': '各属性的节点数量',
    'Pemilihan Atribut C4.5: Gain Ratio vs Information Gain': 'C4.5 属性选择：增益率 vs 信息增益',
    'Feature Importance (Information Gain, %)': '特征重要性（信息增益，%）',
    'Performance Metrics (%)': '性能指标（%）',
    'Aktual vs Prediksi per Kelas': '各分类实际值与预测值',
    'Distribusi Simpul vs Daun per Kedalaman': '各深度的内部节点与叶节点分布',
    'Diagram pohon keputusan C4.5': 'C4.5 决策树图',

    // ── stok ───────────────────────────────────────────────────────────────────
    'Total SKU': 'SKU 总数',
    'Total Volume Stok': '库存总量',
    'Total Valuasi Aset': '资产总值',
    'Rata-rata Stok/SKU': '平均每 SKU 库存',
    'Kritis / Habis': '严重 / 断货',
    'Stok Menipis': '库存偏低',
    'Stok Aman': '库存充足',
    'Overstock': '积压',
    'Nama Barang / Produk': '商品 / 产品名称',
    'Kategori': '分类',
    'Stok Saat Ini': '当前库存',
    'Harga Satuan': '单价',
    'Total Valuasi': '总估值',
    'Status Stok': '库存状态',
    'Saran Restock': '补货建议',
    'Prioritas': '优先级',
    'Daftar Inventaris Stok Barang': '库存清单',
    'Semua': '全部',
    'Kritis': '严重',
    'Menipis': '偏低',
    'Aman': '充足',
    'Kelas A': 'A 类',
    'Cari nama barang / kategori stok…': '搜索商品名称 / 库存分类…',
    'Load 200 more rows': '再加载 200 行',
    'Search in table…': '在表格中搜索…',
    'Stok': '库存',
    'Harga': '价格',
    'Jumlah': '数量',
    'Status': '状态',
    'Restock': '补货',
    'Barang': '商品',
    'Estimasi biaya': '预计成本',
    'Qty order': '订购量',
    'Daftar kebutuhan pembelian': '采购需求清单',
    'Jumlah Baris': '行数',

    // ── catatan ────────────────────────────────────────────────────────────────
    'Analysis Notes & Report Comments': '分析备注与报告评述',
    'Add custom commentary, business insights, or data caveats. These notes will be saved and included in the PDF export.':
        '添加自定义评述、业务洞察或数据说明。这些备注会被保存并包含在 PDF 导出中。',
    'Add New Note': '添加备注',
    'Note Title…': '备注标题…',
    'Executive Summary & Analysis Notes': '执行摘要与分析备注',
    'Data Warning': '数据警示',
    'Action Item': '行动项',
    'Insight': '洞察',
    'Warning': '警示',
    'Action': '行动',
    'Delete note': '删除备注',
    'New Observation': '新观察',

    // ── tabel & pesan kecil ────────────────────────────────────────────────────
    'No additional charts available for this dataset.': '此数据集没有更多图表。',
    'Requires at least 2 numeric columns for correlation matrix.': '相关性矩阵至少需要 2 个数值列。',
    'Blue = positive correlation · Red = negative correlation': '蓝色 = 正相关 · 红色 = 负相关',
    'Identifier column excluded from numeric calculations.': '标识列不参与数值计算。',
    'Tersalin': '已复制',
    'Gagal menyalin otomatis, silakan salin manual dari kotak teks.': '自动复制失败，请从文本框中手动复制。',

    // ── EasyCast ───────────────────────────────────────────────────────────────
    'Jeda': '暂停',
    'Presentasi': '演示',
    'Simpan .html': '保存 .html',
    'TV': '电视',
    'Jendela': '窗口',
    'Pilih sheet': '选择工作表',
    'Sebelumnya': '上一页',
    'Berikutnya': '下一页',
    'Layar penuh': '全屏',
    'Ganti tema terang/gelap': '切换浅色/深色主题',
    'Cetak / simpan PDF': '打印 / 保存 PDF',
    'Simpan sebagai file .html mandiri untuk di-preview di website': '保存为独立 .html 文件，可在网站中预览',
    'Sambungkan ke TV lewat jaringan lokal': '通过局域网连接电视',
    'Jendela terpisah': '独立窗口',
    'Tutup (Esc)': '关闭（Esc）',
    'Ringkasan': '摘要',
    'Kualitas & Profil CSV': 'CSV 质量与概况',
    'Detail Kolom': '列详情',
    'Korelasi (Pearson)': '相关性（Pearson）',
    'Peran': '角色',
    'Kolom terdeteksi': '检测到的列',
    'Kolom yang terdeteksi otomatis': '自动检测到的列',
    'Pendapatan': '收入',
    'Laba kotor': '毛利',
    'Tren pendapatan per periode': '各期间收入趋势',
    'Tren laba kotor per periode': '各期间毛利趋势',
    'Kolom identitas, tidak dihitung sebagai numerik.': '标识列，不计入数值统计。',
    'Biru = positif, merah = negatif.': '蓝色 = 正，红色 = 负。',
    'Menunggu data…': '正在等待数据…',

    // ── panel AI / pet (label inti) ─────────────────────────────────────────────
    'Kirim': '发送',
    'Bicara': '说话',
    'Hentikan': '停止',
    'Tutup': '关闭',
    'Buka': '打开',
    'Simpan': '保存',
    'Hapus': '删除',
    'Muat ulang': '重新加载',
    'Cari': '搜索',

    // ── EasyCast: label di dalam dasbor (Ringkasan, KPI, stok, kualitas, C4.5) ─────────
    'Komposisi tipe kolom': '列类型构成',
    'Sel kosong per kolom (%)': '各列缺失单元格（%）',
    'Sel kosong': '缺失单元格',
    'Duplikat': '重复行',
    'Skor kualitas': '质量评分',
    'Outlier per kolom numerik': '各数值列离群值',
    'Outlier': '离群值',
    'Tidak ada sel kosong.': '没有缺失单元格。',
    'Tidak ada outlier signifikan.': '没有显著离群值。',
    'Tidak ada data.': '暂无数据。',
    'Tidak ada data yang cocok.': '没有匹配的数据。',
    'Butuh minimal 2 titik data.': '至少需要 2 个数据点。',
    'Bagian gagal dimuat': '部分内容加载失败',
    'Menampilkan': '显示',
    'Distribusi': '分布',
    'Total pendapatan': '总收入',
    'Total biaya (COGS)': '总成本（COGS）',
    'Margin laba kotor': '毛利率',
    'Jumlah order': '订单数',
    'Rata-rata nilai order (AOV)': '平均订单金额（AOV）',
    'Total unit terjual': '总销量',
    'Item per order': '每单商品数',
    'Jumlah pelanggan': '客户数',
    'Pendapatan per pelanggan': '客户收入',
    'Pelanggan berulang': '复购客户',
    'Retensi antarperiode (rata-rata)': '期间留存率（平均）',
    'Pertumbuhan periode terakhir': '最后一期增长',
    'Rata-rata pertumbuhan per periode': '每期平均增长',
    'Kontribusi 10% pelanggan teratas': '前 10% 客户贡献',
    'Checklist audit CSV': 'CSV 检查清单',
    'Rekomendasi pembersihan': '清洗建议',
    'Rencana tindakan': '行动计划',
    'Wawasan operasional': '运营洞察',
    'Risiko rantai pasok': '供应链风险',
    'Valuasi aset': '资产估值',
    'Pangsa pendapatan per kategori': '各分类收入占比',
    'Pangsa pendapatan produk teratas': '畅销商品收入占比',
    'Pendapatan produk teratas': '商品收入排行',
    'Pendapatan per wilayah': '各地区收入',
    'Pertumbuhan pendapatan antar periode (%)': '各期间收入增长率（%）',
    'Pertumbuhan terakhir': '最新增长',
    'Rata-rata pertumbuhan': '平均增长',
    'Rata-rata/SKU': '平均每 SKU',
    'Total volume': '总库存量',
    'Top 10 stok tertinggi': '库存量最高的 10 种商品',
    'Distribusi kesehatan stok': '库存健康度分布',
    'Nilai valuasi per kategori': '各分类估值',
    'Analisis ABC (% valuasi vs % SKU)': 'ABC 分析（价值占比 vs SKU 占比）',
    'Daftar inventaris': '库存清单',
    'Metrik kinerja (%)': '性能指标（%）',
    'Metrik per kelas': '各分类指标',
    'Feature importance (%)': '特征重要性（%）',
    'Akurasi uji': '测试准确率',
    'Akurasi dasar': '基准准确率',
    'Kelengkapan': '完整性',
    'Kemurnian': '纯度',
    'Lolos': '通过',
    'Perhatian': '注意',
    'Perlu perbaikan': '需要改进',
    'Sehat': '健康',
    'Konteks perhitungan': '计算过程',
    'Validasi silang': '交叉验证',
    'Latih / uji': '训练 / 测试',
    'Baris dipakai': '使用行数',
    'Baris dilewati': '跳过行数',
    'Kelas (THEN)': '分类（THEN）',
    'Kondisi (IF)': '条件（IF）',
    'Tahap': '阶段',
    'Parameter': '参数',
    'Hasil': '结果',
    'Sumber pendapatan': '收入来源',
    'Skor': '得分',
    'Sampel': '样本',
    'Keterangan': '说明',
    'Ukuran': '大小',
    'Produk': '产品',
    'Pelanggan': '客户',
    'Wilayah': '地区',
    'Order': '订单',
    'Kuantitas': '数量',
    'Diskon': '折扣',
    'Biaya (COGS)': '成本（COGS）',
    'Laba': '利润',
    'Kelas B': 'B 类',
    'Kelas C': 'C 类',
    'Insight Otomatis': '自动洞察',
    'Visualisasi': '可视化',
    'Info': '信息',
    'Waspada': '警示',
    'Peringatan': '警告',
    'Data penjualan': '销售数据',
    'Klasifikasi C4.5': 'C4.5 分类',
    'Deret waktu': '时间序列',
    'Silang kategori': '分类交叉',
    'Cari barang / kategori': '搜索商品 / 分类',
    'Pareto 80%': '帕累托 80%',
    'Menunggu data': '正在等待数据',
    'Lanjut': '继续',
    'Keluar presentasi': '退出演示',
    'Tampilkan hasil analisis sebagai dasbor/presentasi layar penuh': '将分析结果以全屏仪表板/演示方式显示',
    'cocok, menampilkan': '条匹配，显示',
    'kuantitas x harga': '数量 x 价格',
};

/**
 * Pola untuk teks yang dirakit (angka/nama kolom ikut di dalamnya).
 * Urutan penting: pola paling spesifik lebih dulu.
 */
export const WEB_PATTERNS: [string, string][] = [
    ['^([\\d.,]+) rows · (\\d+) columns · analyzed first 200,000 rows$', '$1 行 · $2 列 · 仅分析前 200,000 行'],
    ['^([\\d.,]+) rows · (\\d+) columns$', '$1 行 · $2 列'],
    ['^Data Table \\(showing ([\\d.,]+) of ([\\d.,]+) rows\\)$', '数据表（显示 $1 / $2 行）'],
    ['^([\\d.,]+) populated · ([\\d.,]+) missing · ([\\d.,]+) unique$', '已填充 $1 · 缺失 $2 · 唯一值 $3'],
    ['^Average (.+) by (.+)$', '$2 的平均 $1'],
    ['^Trend of (.+) by year$', '$1 年度趋势'],
    ['^Trend of (.+) by month$', '$1 月度趋势'],
    ['^Trend of (.+) by day$', '$1 日度趋势'],
    ['^Distribution of (.+)$', '$1 的分布'],
    ['^Polar Area: (.+)$', '极区图：$1'],
    ['^Record Count per Period (.+)$', '$1 各期间记录数'],
    ['^(.+) vs (.+) \\(r = (.+)\\)$', '$1 与 $2（r = $3）'],
    ['^Kritis \\((\\d+)\\)$', '严重（$1）'],
    ['^Menipis \\((\\d+)\\)$', '偏低（$1）'],
    ['^Aman \\((\\d+)\\)$', '充足（$1）'],
    ['^Overstock \\((\\d+)\\)$', '积压（$1）'],
    ['^Semua \\((\\d+)\\)$', '全部（$1）'],
    ['^([\\d.,]+) baris x ([\\d.,]+) kolom$', '$1 行 x $2 列'],
    ['^([\\d.,]+) baris x ([\\d.,]+) kolom · (.+)$', '$1 行 x $2 列 · $3'],
    ['^Indikator utama - sumber pendapatan: (.+)$', '核心指标 - 收入来源：$1'],
    ['^Estimasi Anggaran Dibutuhkan: (.+)$', '所需预算：$1'],
    ['^Distribusi kelas target "?(.+?)"?$', '目标类别分布：$1'],
    // ── grafik pratinjau (angka dinamis) ───────────────────────────────────────
    ['^([\\d.,]+) nilai · min (.+) · rata-rata (.+) · maks (.+)$', '$1 个值 · 最小 $2 · 平均 $3 · 最大 $4'],
    ['^([\\d.,]+) nilai · ([\\d.,]+) unik · terbanyak “(.+)” \\((.+)%\\)$', '$1 个值 · $2 个唯一值 · 最多“$3”（$4%）'],
    ['^Menampilkan (\\d+) fitur pertama dari (\\d+) fitur yang dipilih\\.$', '显示前 $1 个特征（共选中 $2 个）。'],
    ['^Grafik gagal digambar: (.+)$', '图表绘制失败：$1'],
    ['^Pilih “Pecah per” untuk grafik bertumpuk — ditampilkan sebagai batang\\.$', '请选择“分组依据”以显示堆叠图 — 已改为条形图。'],
];

/** Konfigurasi yang ditanam ke halaman webview / file .html mandiri. */
export function i18nConfig(lang: UiLang = uiLang()): string {
    // Kamus selalu ikut (bukan hanya saat zh-cn) supaya pergantian bahasa tanpa reload bisa
    // mengembalikan teks ke bahasa sumber maupun menerjemahkannya kembali.
    const payload = { lang, dict: WEB_DICT, patterns: WEB_PATTERNS };
    return JSON.stringify(payload)
        .replace(/</g, '\\u003c')
        .replace(/\u2028/g, '\\u2028')
        .replace(/\u2029/g, '\\u2029');
}

/**
 * Mesin penerjemah DOM (dijalankan di dalam halaman, bukan di extension host).
 * Hanya label yang ada di kamus yang disalin (dan bisa dikembalikan) — isi data, nama kolom,
 * serta jawaban AI tetap apa adanya. Mendukung pergantian bahasa tanpa reload: extension
 * mengirim pesan `sk-locale` berisi konfigurasi baru, mesin lalu menggambar ulang teks.
 */
export const I18N_CLIENT: string = String.raw`(function () {
    'use strict';
    var state = { lang: 'id', dict: {}, lower: {}, patterns: [] };
    var SKIP_TAGS = { PRE: 1, CODE: 1, SCRIPT: 1, STYLE: 1, TEXTAREA: 1, CANVAS: 1, SVG: 1, KBD: 1, SAMP: 1 };
    var SKIP_SEL = 'table.data:not(.stock-table) td, table.data:not(.stock-table) th, pre, code, .no-i18n, [data-i18n-skip], #dt-code-display';
    var ATTRS = ['title', 'placeholder', 'aria-label', 'alt'];

    function setConfig(cfg) {
        var dict = (cfg && cfg.dict) || {};
        var lower = {};
        Object.keys(dict).forEach(function (k) {
            var lk = k.toLowerCase();
            if (!Object.prototype.hasOwnProperty.call(lower, lk)) { lower[lk] = dict[k]; }
        });
        var patterns = [];
        ((cfg && cfg.patterns) || []).forEach(function (p) {
            try { patterns.push([new RegExp(p[0]), p[1]]); } catch (e) { /* pola rusak diabaikan */ }
        });
        state = { lang: (cfg && cfg.lang) || 'id', dict: dict, lower: lower, patterns: patterns };
        if (document.documentElement) { document.documentElement.setAttribute('lang', state.lang === 'zh-cn' ? 'zh-CN' : 'id'); }
    }

    function skipped(node) {
        var p = node.parentElement;
        if (!p) { return true; }
        while (p) {
            if (SKIP_TAGS[String(p.tagName || '').toUpperCase()]) { return true; }
            p = p.parentElement;
        }
        try { return !!node.parentElement.closest(SKIP_SEL); } catch (e) { return false; }
    }

    function lookup(core) {
        if (Object.prototype.hasOwnProperty.call(state.dict, core)) { return state.dict[core]; }
        var flat = core.replace(/\s+/g, ' ').trim();
        if (flat !== core && Object.prototype.hasOwnProperty.call(state.dict, flat)) { return state.dict[flat]; }
        var low = flat.toLowerCase();
        if (Object.prototype.hasOwnProperty.call(state.lower, low)) { return state.lower[low]; }
        for (var i = 0; i < state.patterns.length; i++) {
            if (state.patterns[i][0].test(flat)) { return flat.replace(state.patterns[i][0], state.patterns[i][1]); }
        }
        // Label yang diakhiri titik dua (mis. chip “Stok:”) tetap ikut diterjemahkan.
        var colon = /^(.+?)\s*[:\uFF1A]$/.exec(flat);
        if (colon) {
            var head = lookup(colon[1]);
            if (head !== null) { return head + '\uFF1A'; }
        }
        return null;
    }

    // Awalan ikon (emoji/simbol) dipisah supaya satu entri kamus berlaku untuk label
    // dengan maupun tanpa ikon.
    function trText(raw) {
        if (!raw || !/\S/.test(raw)) { return raw; }
        var m = /^(\s*)([\s\S]*?)(\s*)$/.exec(raw);
        var core = m[2];
        var out = lookup(core);
        if (out === null) {
            var pre = /^([^0-9A-Za-z\u00C0-\u024F\u4e00-\u9fff]+)/.exec(core);
            if (!pre || pre[1].length >= core.length) { return raw; }
            var body = core.slice(pre[1].length);
            var inner = lookup(body);
            if (inner === null) { return raw; }
            out = pre[1] + inner;
        }
        return m[1] + out + m[3];
    }

    function walkText(node) {
        var v = node.nodeValue;
        if (!v || !/\S/.test(v)) { return; }
        if (skipped(node)) { return; }
        if (state.lang === 'zh-cn') {
            if (node.__skDst === v) { return; }        // sudah diterjemahkan
            var t = trText(v);
            node.__skSrc = v;
            node.__skDst = t;
            if (t !== v) { node.nodeValue = t; }
        } else if (node.__skSrc !== undefined && node.__skDst === v && v !== node.__skSrc) {
            node.nodeValue = node.__skSrc;             // kembali ke bahasa sumber
        }
    }

    function walkAttrs(el) {
        if (!el.getAttribute) { return; }
        for (var i = 0; i < ATTRS.length; i++) {
            var a = ATTRS[i];
            var v = el.getAttribute(a);
            if (!v || !/\S/.test(v)) { continue; }
            var src = el.__skAttrSrc || (el.__skAttrSrc = {});
            var dst = el.__skAttrDst || (el.__skAttrDst = {});
            if (state.lang === 'zh-cn') {
                if (dst[a] === v) { continue; }
                var t = trText(v);
                src[a] = v; dst[a] = t;
                if (t !== v) { el.setAttribute(a, t); }
            } else if (src[a] !== undefined && dst[a] === v && v !== src[a]) {
                el.setAttribute(a, src[a]);
            }
        }
    }

    function walk(root) {
        if (!root) { return; }
        if (root.nodeType === 3) { walkText(root); return; }
        if (root.nodeType !== 1 && root.nodeType !== 9) { return; }
        if (root.nodeType === 1) { walkAttrs(root); }
        if (!document.createTreeWalker) { return; }
        var w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, null, false);
        var n = w.nextNode();
        while (n) {
            if (n.nodeType === 3) { walkText(n); } else { walkAttrs(n); }
            n = w.nextNode();
        }
    }

    var queued = false;
    function schedule() {
        if (queued) { return; }
        queued = true;
        var run = function () { queued = false; walk(document.body); };
        if (window.requestAnimationFrame) { window.requestAnimationFrame(run); } else { setTimeout(run, 16); }
    }

    setConfig(window.__SK_I18N__);
    schedule();

    window.addEventListener('message', function (ev) {
        var m = ev.data;
        if (m && m.type === 'sk-locale' && m.config) { setConfig(m.config); schedule(); }
    });

    if (window.MutationObserver && document.body) {
        new MutationObserver(function (records) {
            for (var i = 0; i < records.length; i++) {
                var r = records[i];
                if (r.type === 'childList') {
                    for (var k = 0; k < r.addedNodes.length; k++) { walk(r.addedNodes[k]); }
                } else if (r.type === 'characterData') {
                    walkText(r.target);
                } else if (r.type === 'attributes' && r.target) {
                    walkAttrs(r.target);
                }
            }
        }).observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
    }
})();`;
