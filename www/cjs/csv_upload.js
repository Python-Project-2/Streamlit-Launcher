    /* ====== DEMO UPLOAD CSV / EXCEL — BUSINESS + STATISTICAL ANALYSIS ====== */
    (function () {
      var dropZone = document.getElementById('dropZone');
      var fileInput = document.getElementById('fileInput');
      var loadSampleBtn = document.getElementById('loadSampleBtn');
      var triggerUploadBtn = document.getElementById('triggerUploadBtn');
      var resetBtn = document.getElementById('resetDemoBtn');
      var results = document.getElementById('demoResults');
      var fileNameEl = document.getElementById('fileName');
      var fileMetaEl = document.getElementById('fileMeta');
      var kpiGrid = document.getElementById('kpiGrid');
      var summaryStats = document.getElementById('summaryStats');
      var qualityStats = document.getElementById('qualityStats');
      var colTable = document.getElementById('colTable');
      var previewTable = document.getElementById('previewTable');
      var chartCanvas = document.getElementById('demoChart');
      var chartEmpty = document.getElementById('chartEmpty');
      var chartInstance = null;
      var lastData = null;
      var t = window.SL_T;

      function esc(s) {
        return String(s).replace(/[&<>"']/g, function (c) {
          return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
      }
      function loc() { return window.SL_LANG === 'zh' ? 'zh-CN' : 'id-ID'; }

      var SAMPLE = {
        headers: ['Tanggal', 'Produk', 'Kategori', 'Jumlah', 'Harga', 'Total', 'Pelanggan'],
        rows: [
          ['2024-01-01', 'Laptop Pro', 'Elektronik', 3, 15000000, 45000000, 'PT Maju'],
          ['2024-01-02', 'Mouse Wireless', 'Aksesoris', 12, 250000, 3000000, 'CV Sejahtera'],
          ['2024-01-03', 'Monitor 24"', 'Elektronik', 2, 3200000, 6400000, 'PT Maju'],
          ['2024-01-05', 'Keyboard Mech', 'Aksesoris', 8, 1200000, 9600000, 'Toko Andi'],
          ['2024-01-07', 'Laptop Pro', 'Elektronik', 5, 15000000, 75000000, 'CV Sejahtera'],
          ['2024-01-09', 'Webcam HD', 'Aksesoris', 15, 850000, 12750000, 'PT Maju'],
          ['2024-01-10', 'Printer Laser', 'Elektronik', 2, 4500000, 9000000, 'Toko Andi'],
          ['2024-01-12', 'Mouse Wireless', 'Aksesoris', 25, 250000, 6250000, 'CV Sejahtera'],
          ['2024-01-15', 'Monitor 24"', 'Elektronik', 4, 3200000, 12800000, 'PT Maju'],
          ['2024-01-18', 'Laptop Pro', 'Elektronik', 2, 15000000, 30000000, 'Toko Andi'],
          ['2024-01-20', 'Keyboard Mech', 'Aksesoris', 10, 1200000, 12000000, 'PT Maju'],
          ['2024-01-22', 'Printer Laser', 'Elektronik', 3, 4500000, 13500000, 'CV Sejahtera'],
          ['2024-01-25', 'Webcam HD', 'Aksesoris', 20, 850000, 17000000, 'Toko Andi'],
          ['2024-01-28', 'Mouse Wireless', 'Aksesoris', 18, 250000, 4500000, 'PT Maju']
        ]
      };

      var SAMPLE_ZH = {
        headers: ['日期', '产品', '类别', '数量', '单价', '销售额', '客户'],
        rows: [
          ['2024-01-01', 'Pro 笔记本', '电子产品', 3, 15000000, 45000000, '前进有限公司'],
          ['2024-01-02', '无线鼠标', '电脑配件', 12, 250000, 3000000, '繁荣合作社'],
          ['2024-01-03', '24 英寸显示器', '电子产品', 2, 3200000, 6400000, '前进有限公司'],
          ['2024-01-05', '机械键盘', '电脑配件', 8, 1200000, 9600000, '安迪商店'],
          ['2024-01-07', 'Pro 笔记本', '电子产品', 5, 15000000, 75000000, '繁荣合作社'],
          ['2024-01-09', '高清摄像头', '电脑配件', 15, 850000, 12750000, '前进有限公司'],
          ['2024-01-10', '激光打印机', '电子产品', 2, 4500000, 9000000, '安迪商店'],
          ['2024-01-12', '无线鼠标', '电脑配件', 25, 250000, 6250000, '繁荣合作社'],
          ['2024-01-15', '24 英寸显示器', '电子产品', 4, 3200000, 12800000, '前进有限公司'],
          ['2024-01-18', 'Pro 笔记本', '电子产品', 2, 15000000, 30000000, '安迪商店'],
          ['2024-01-20', '机械键盘', '电脑配件', 10, 1200000, 12000000, '前进有限公司'],
          ['2024-01-22', '激光打印机', '电子产品', 3, 4500000, 13500000, '繁荣合作社'],
          ['2024-01-25', '高清摄像头', '电脑配件', 20, 850000, 17000000, '安迪商店'],
          ['2024-01-28', '无线鼠标', '电脑配件', 18, 250000, 4500000, '前进有限公司']
        ]
      };
      function getSample() { return (window.SL_LANG === 'zh') ? SAMPLE_ZH : SAMPLE; }

      function parseNumber(v) {
        if (v === null || v === undefined) return NaN;
        if (typeof v === 'number') return isFinite(v) ? v : NaN;
        var s = String(v).trim();
        if (!s || !/\d/.test(s)) return NaN;
        s = s.replace(/[^\d.,-]/g, '');
        var hasDot = s.indexOf('.') >= 0, hasComma = s.indexOf(',') >= 0;
        if (hasDot && hasComma) {
          if (s.lastIndexOf(',') > s.lastIndexOf('.')) s = s.replace(/\./g, '').replace(/,/g, '.');
          else s = s.replace(/,/g, '');
        } else if (hasComma) {
          var pc = s.split(',');
          if (pc.length === 2 && pc[1].length !== 3) s = s.replace(',', '.');
          else s = s.replace(/,/g, '');
        } else if (hasDot) {
          var pd = s.split('.');
          if (pd.length > 2) s = s.replace(/\./g, '');
          else if (pd[1].length === 3 && pd[0].length >= 1 && pd[0].length <= 3 && pd[0] !== '0' && /^\d+$/.test(pd[0])) s = s.replace('.', '');
        }
        var n = Number(s);
        return isNaN(n) ? NaN : n;
      }

      function fmt(n) {
        if (!isFinite(n)) return '—';
        var abs = Math.abs(n);
        if (window.SL_LANG === 'zh') {
          if (abs >= 1e12) return (n / 1e12).toFixed(2) + ' 万亿';
          if (abs >= 1e8) return (n / 1e8).toFixed(2) + ' 亿';
          if (abs >= 1e4) return (n / 1e4).toFixed(1) + ' 万';
          return n.toLocaleString('zh-CN', { maximumFractionDigits: 2 });
        }
        if (abs >= 1e12) return (n / 1e12).toFixed(2) + ' T';
        if (abs >= 1e9) return (n / 1e9).toFixed(2) + ' M';
        if (abs >= 1e6) return (n / 1e6).toFixed(2) + ' jt';
        if (abs >= 1e3) return (n / 1e3).toFixed(1) + ' rb';
        return n.toLocaleString('id-ID', { maximumFractionDigits: 2 });
      }

      function median(arr) {
        if (!arr.length) return NaN;
        var s = arr.slice().sort(function (a, b) { return a - b; });
        var m = Math.floor(s.length / 2);
        return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
      }
      function mean(arr) { return arr.length ? arr.reduce(function (a, b) { return a + b; }, 0) / arr.length : NaN; }
      function stdev(arr) {
        if (arr.length < 2) return 0;
        var m = mean(arr);
        return Math.sqrt(arr.reduce(function (s, x) { return s + (x - m) * (x - m); }, 0) / (arr.length - 1));
      }

      function analyze(headers, rows) {
        var cols = headers.map(function (h, i) {
          var values = [];
          var numeric = [];
          var missing = 0;
          for (var r = 0; r < rows.length; r++) {
            var v = rows[r][i];
            if (v === null || v === undefined || v === '') { missing++; continue; }
            values.push(v);
            var n = parseNumber(v);
            if (!isNaN(n)) numeric.push(n);
          }
          var isNumeric = values.length > 0 && numeric.length / values.length >= 0.6;
          var uniq = new Set(values.map(function (v) { return String(v); }));
          return {
            name: String(h),
            values: values,
            numeric: numeric,
            isNumeric: isNumeric,
            missing: missing,
            unique: uniq.size
          };
        });

        var dupKeys = new Set();
        var dupCount = 0;
        for (var r = 0; r < rows.length; r++) {
          var key = rows[r].map(function (v) { return String(v); }).join('|');
          if (dupKeys.has(key)) dupCount++; else dupKeys.add(key);
        }

        return {
          totalRows: rows.length,
          totalCols: headers.length,
          columns: cols,
          numericCols: cols.filter(function (c) { return c.isNumeric; }),
          categoricalCols: cols.filter(function (c) { return !c.isNumeric; }),
          totalMissing: cols.reduce(function (s, c) { return s + c.missing; }, 0),
          duplicateRows: dupCount
        };
      }

      function findBusinessCols(analysis) {
        /* Tiered matching: strong revenue signals win over weak ones (bug fix —
           previously 'harga'/'price' could beat the real 'Total' revenue column). */
        var revenueTiers = [
          ['revenue', 'penjualan', 'sales', 'pendapatan', 'omzet', 'total', '总计', '销售额', '收入', '营收', '营业额'],
          ['amount', 'subtotal', '金额', '总价'],
          ['harga', 'price', 'income', '价格', '单价']
        ];
        var qtyKeys = ['qty', 'quantity', 'jumlah', 'count', 'item', 'unit', 'stok', '数量', '销量', '件数', '库存'];
        var nameKeys = ['produk', 'product', 'nama', 'name', 'barang', '产品', '商品', '名称', '品名'];
        var custKeys = ['customer', 'pelanggan', 'client', 'klien', 'pembeli', 'buyer', '客户', '顾客', '买家'];

        var revenue = null, qty = null, nameCol = null, custCol = null;
        for (var ti = 0; ti < revenueTiers.length && !revenue; ti++) {
          analysis.numericCols.forEach(function (c) {
            if (revenue) return;
            var n = c.name.toLowerCase();
            if (revenueTiers[ti].some(function (k) { return n.indexOf(k) >= 0; })) revenue = c;
          });
        }
        analysis.numericCols.forEach(function (c) {
          var n = c.name.toLowerCase();
          if (!qty && qtyKeys.some(function (k) { return n.indexOf(k) >= 0; })) qty = c;
        });
        analysis.categoricalCols.forEach(function (c) {
          var n = c.name.toLowerCase();
          if (!nameCol && nameKeys.some(function (k) { return n.indexOf(k) >= 0; })) nameCol = c;
          if (!custCol && custKeys.some(function (k) { return n.indexOf(k) >= 0; })) custCol = c;
        });
        if (revenue && qty && revenue === qty) qty = null;
        return { revenue: revenue, qty: qty, name: nameCol, customer: custCol };
      }

      function renderKPIs(analysis, businessCols, rows) {
        var kpis = [];
        var total = 0, avg = 0;
        if (businessCols.revenue && businessCols.revenue.numeric.length) {
          total = businessCols.revenue.numeric.reduce(function (a, b) { return a + b; }, 0);
          avg = total / businessCols.revenue.numeric.length;
          kpis.push({ label: t('j.kpiTotal'), val: fmt(total), sub: esc(businessCols.revenue.name) + ' · ' + t('j.kpiTx', { n: businessCols.revenue.numeric.length }), cls: 'kpi-good' });
          kpis.push({ label: t('j.kpiAvgTx'), val: fmt(avg), sub: esc(businessCols.revenue.name), cls: '' });
        }
        if (businessCols.qty && businessCols.qty.numeric.length) {
          var qtySum = businessCols.qty.numeric.reduce(function (a, b) { return a + b; }, 0);
          kpis.push({ label: t('j.kpiTotalCol', { col: esc(businessCols.qty.name) }), val: fmt(qtySum), sub: t('j.kpiUnits'), cls: '' });
        }
        // Top kategori/produk — dihitung langsung dari rows (tanpa global window)
        if (businessCols.name && businessCols.revenue) {
          var nameIdx = analysis.columns.indexOf(businessCols.name);
          var revIdx = analysis.columns.indexOf(businessCols.revenue);
          var byName = {};
          rows.forEach(function (row) {
            var nm = row[nameIdx];
            var rv = parseNumber(row[revIdx]);
            if (nm === null || nm === undefined || nm === '' || isNaN(rv)) return;
            nm = String(nm);
            byName[nm] = (byName[nm] || 0) + rv;
          });
          var sorted = Object.keys(byName).sort(function (a, b) { return byName[b] - byName[a]; });
          if (sorted.length) {
            kpis.push({ label: t('j.kpiTop', { col: esc(businessCols.name.name) }), val: esc(String(sorted[0]).slice(0, 16)), sub: fmt(byName[sorted[0]]), cls: 'kpi-good' });
          }
        }
        if (kpis.length === 0) {
          kpis.push({ label: t('j.kpiRows'), val: fmt(analysis.totalRows), sub: t('j.kpiRecords'), cls: '' });
          kpis.push({ label: t('j.kpiNumCols'), val: analysis.numericCols.length, sub: t('j.kpiColUnit'), cls: '' });
          kpis.push({ label: t('j.kpiCatCols'), val: analysis.categoricalCols.length, sub: t('j.kpiColUnit'), cls: '' });
          kpis.push({ label: t('j.kpiMissing'), val: fmt(analysis.totalMissing), sub: t('j.kpiCells'), cls: analysis.totalMissing > 0 ? 'kpi-warn' : 'kpi-good' });
        }
        kpiGrid.innerHTML = kpis.slice(0, 4).map(function (k) {
          return '<div class="kpi ' + k.cls + '"><div class="kpi-label">' + k.label + '</div><div class="kpi-val">' + k.val + '</div><div class="kpi-sub">' + (k.sub || '') + '</div></div>';
        }).join('');
      }

      function renderSummary(analysis) {
        var totalCells = analysis.totalRows * analysis.totalCols;
        var missingPct = totalCells ? (analysis.totalMissing / totalCells * 100) : 0;
        var dupPct = analysis.totalRows ? (analysis.duplicateRows / analysis.totalRows * 100) : 0;
        var rows = [
          [t('j.kpiRows'), analysis.totalRows.toLocaleString(loc())],
          [t('j.sumCols'), analysis.totalCols.toLocaleString(loc())],
          [t('j.kpiNumCols'), analysis.numericCols.length.toLocaleString(loc())],
          [t('j.kpiCatCols'), analysis.categoricalCols.length.toLocaleString(loc())],
          [t('j.sumCells'), totalCells.toLocaleString(loc())],
          [t('j.kpiMissing'), analysis.totalMissing.toLocaleString(loc()) + ' (' + missingPct.toFixed(1) + '%)'],
          [t('j.sumDup'), analysis.duplicateRows.toLocaleString(loc()) + ' (' + dupPct.toFixed(1) + '%)']
        ];
        summaryStats.innerHTML = rows.map(function (r) {
          return '<div class="stat-row"><span>' + r[0] + '</span><strong>' + r[1] + '</strong></div>';
        }).join('');
      }

      function renderQuality(analysis) {
        var totalCells = analysis.totalRows * analysis.totalCols;
        var missingPct = totalCells ? (analysis.totalMissing / totalCells * 100) : 0;
        var dupPct = analysis.totalRows ? (analysis.duplicateRows / analysis.totalRows * 100) : 0;
        var score = 100 - (missingPct * 0.6) - (dupPct * 0.4);
        score = Math.max(0, Math.min(100, score));
        var status = score >= 80 ? t('j.qStatusGood') : score >= 60 ? t('j.qStatusOk') : score >= 40 ? t('j.qStatusFix') : t('j.qStatusBad');
        var cls = score >= 80 ? 'kpi-good' : score >= 60 ? 'kpi-warn' : 'kpi-bad';
        var rows = [
          [t('j.qScore'), score.toFixed(1) + ' / 100'],
          [t('j.qStatus'), status],
          [t('j.qMissRate'), missingPct.toFixed(1) + '%'],
          [t('j.qDupRate'), dupPct.toFixed(1) + '%'],
          [t('j.qMissCols'), t('j.qColsUnit', { n: analysis.columns.filter(function (c) { return c.missing > 0; }).length })]
        ];
        qualityStats.innerHTML = rows.map(function (r, i) {
          var strongCls = i === 1 ? cls : '';
          return '<div class="stat-row"><span>' + r[0] + '</span><strong class="' + strongCls + '">' + r[1] + '</strong></div>';
        }).join('');
      }

      function renderColTable(analysis) {
        var head = '<thead><tr><th>' + t('j.thCol') + '</th><th>' + t('j.thType') + '</th><th>' + t('j.thUniq') + '</th><th>' + t('j.thMiss') + '</th><th>' + t('j.thMean') + '</th><th>' + t('j.thMedian') + '</th><th>' + t('j.thMin') + '</th><th>' + t('j.thMax') + '</th><th>' + t('j.thStd') + '</th></tr></thead>';
        var body = '<tbody>';
        analysis.columns.forEach(function (c) {
          var m = c.isNumeric ? mean(c.numeric) : null;
          var md = c.isNumeric ? median(c.numeric) : null;
          /* Bug fix: min/max dihitung dengan loop, bukan Math.min/max.apply —
             kolom besar (ratusan ribu nilai) bisa membuat apply() melebihi batas argumen. */
          var mn = null, mx = null;
          if (c.isNumeric && c.numeric.length) {
            mn = Infinity; mx = -Infinity;
            for (var q = 0; q < c.numeric.length; q++) {
              var x = c.numeric[q];
              if (x < mn) mn = x;
              if (x > mx) mx = x;
            }
          }
          var sd = c.isNumeric ? stdev(c.numeric) : null;
          body += '<tr>' +
            '<td><strong>' + esc(c.name) + '</strong></td>' +
            '<td>' + (c.isNumeric ? t('j.typeNum') : t('j.typeCat')) + '</td>' +
            '<td>' + c.unique + '</td>' +
            '<td>' + c.missing + '</td>' +
            '<td>' + (m !== null && isFinite(m) ? fmt(m) : '—') + '</td>' +
            '<td>' + (md !== null && isFinite(md) ? fmt(md) : '—') + '</td>' +
            '<td>' + (mn !== null && isFinite(mn) ? fmt(mn) : '—') + '</td>' +
            '<td>' + (mx !== null && isFinite(mx) ? fmt(mx) : '—') + '</td>' +
            '<td>' + (sd !== null && isFinite(sd) ? fmt(sd) : '—') + '</td>' +
            '</tr>';
        });
        body += '</tbody>';
        colTable.innerHTML = head + body;
      }

      function renderPreview(headers, rows) {
        var head = '<thead><tr>' + headers.map(function (h) { return '<th>' + esc(h) + '</th>'; }).join('') + '</tr></thead>';
        var body = '<tbody>';
        rows.slice(0, 10).forEach(function (r) {
          body += '<tr>' + r.map(function (v) { return '<td>' + (v === null || v === undefined ? '' : esc(v)) + '</td>'; }).join('') + '</tr>';
        });
        body += '</tbody>';
        previewTable.innerHTML = head + body;
      }

      function renderChart(analysis) {
        if (chartInstance) { chartInstance.destroy(); chartInstance = null; }
        if (typeof Chart === 'undefined') { return; }
        // pick up to 4 numeric cols
        var cols = analysis.numericCols.slice(0, 4);
        if (!cols.length) {
          chartEmpty.textContent = t('demo.noNumeric');
          chartEmpty.style.display = 'grid';
          return;
        }
        chartEmpty.style.display = 'none';
        var labels = cols.map(function (c) { return c.name; });
        var sums = cols.map(function (c) { return c.numeric.reduce(function (a, b) { return a + b; }, 0); });
        var maxVal = Math.max.apply(null, sums.map(Math.abs));
        var datasets = cols.map(function (c, i) {
          var palette = ['#b9f36a', '#83b83d', '#58644a', '#a9e55a'];
          return {
            label: c.name,
            data: [sums[i]],
            backgroundColor: palette[i % palette.length],
            borderColor: '#4a5c33',
            borderWidth: 1,
            borderRadius: 6
          };
        });
        chartInstance = new Chart(chartCanvas, {
          type: 'bar',
          data: { labels: ['Total'], datasets: datasets },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { position: 'bottom', labels: { font: { size: 11 }, boxWidth: 10 } } },
            scales: {
              y: { beginAtZero: true, ticks: { callback: function (v) { return fmt(v); }, font: { size: 10 } } },
              x: { ticks: { font: { size: 10 } } }
            }
          }
        });
      }

      function showResults(headers, rows, filename, opts) {
        opts = opts || {};
        lastData = { headers: headers, rows: rows, filename: filename, isSample: !!opts.isSample };
        var analysis = analyze(headers, rows);
        var business = findBusinessCols(analysis);

        fileNameEl.textContent = filename;
        fileMetaEl.textContent = t('j.meta', { rows: rows.length.toLocaleString(loc()), cols: String(headers.length) });

        renderKPIs(analysis, business, rows);
        renderSummary(analysis);
        renderQuality(analysis);
        renderColTable(analysis);
        renderPreview(headers, rows);
        renderChart(analysis);

        results.classList.add('show');
        if (opts.scroll !== false) results.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }

      function parseFile(file) {
        if (typeof XLSX === 'undefined') {
          alert(t('j.alertParse', { msg: 'SheetJS (XLSX) CDN not loaded / 库未加载' }));
          return;
        }
        var reader = new FileReader();
        reader.onload = function (e) {
          try {
            var workbook;
            if (/\.csv$/i.test(file.name)) {
              /* Bug fix: CSV dibaca sebagai teks UTF-8 agar karakter non-Latin (termasuk 中文) tidak rusak */
              var text = new TextDecoder('utf-8').decode(e.target.result);
              workbook = XLSX.read(text, { type: 'string' });
            } else {
              workbook = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
            }
            var sheet = workbook.Sheets[workbook.SheetNames[0]];
            if (!sheet) { alert(t('j.alertEmpty')); return; }
            var json = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
            if (!json.length) { alert(t('j.alertEmpty')); return; }
            var headers = json[0].map(function (h) { return String(h).trim(); });
            var rows = json.slice(1).filter(function (r) { return r.some(function (c) { return c !== '' && c !== null && c !== undefined; }); });
            if (!rows.length) { alert(t('j.alertEmpty')); return; }
            showResults(headers, rows, file.name);
          } catch (err) {
            alert(t('j.alertParse', { msg: err && err.message ? err.message : String(err) }));
          }
        };
        reader.onerror = function () { alert(t('j.alertRead')); };
        reader.readAsArrayBuffer(file);
      }

      function handleFile(file) {
        if (!file) return;
        if (file.size > 10 * 1024 * 1024) { alert(t('j.alertBig')); return; }
        var name = (file.name || '').toLowerCase();
        if (!/\.(csv|xlsx|xls)$/.test(name)) { alert(t('j.alertFmt')); return; }
        parseFile(file);
      }

      dropZone.addEventListener('click', function (e) {
        if (e.target.tagName !== 'INPUT') fileInput.click();
      });
      dropZone.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); }
      });
      dropZone.addEventListener('dragover', function (e) { e.preventDefault(); dropZone.classList.add('drag'); });
      dropZone.addEventListener('dragleave', function () { dropZone.classList.remove('drag'); });
      dropZone.addEventListener('drop', function (e) {
        e.preventDefault(); dropZone.classList.remove('drag');
        if (e.dataTransfer.files && e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
      });
      fileInput.addEventListener('change', function (e) {
        if (e.target.files && e.target.files[0]) handleFile(e.target.files[0]);
        fileInput.value = ''; /* agar file yang sama bisa dipilih ulang */
      });
      triggerUploadBtn.addEventListener('click', function () { fileInput.click(); });

      loadSampleBtn.addEventListener('click', function () {
        var s = getSample();
        showResults(s.headers, s.rows, t('j.sampleName'), { isSample: true });
      });

      resetBtn.addEventListener('click', function () {
        results.classList.remove('show');
        fileInput.value = '';
        lastData = null;
        if (chartInstance) { chartInstance.destroy(); chartInstance = null; }
        chartEmpty.style.display = 'none';
        dropZone.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });

      /* Re-render hasil demo saat bahasa diganti (label i18n + data contoh lokal) */
      document.addEventListener('sl:languagechange', function () {
        if (chartEmpty) chartEmpty.textContent = t('demo.noNumeric');
        if (!lastData) return;
        if (lastData.isSample) {
          var s = getSample();
          showResults(s.headers, s.rows, t('j.sampleName'), { isSample: true, scroll: false });
        } else {
          showResults(lastData.headers, lastData.rows, lastData.filename, { scroll: false });
        }
      });
    })();