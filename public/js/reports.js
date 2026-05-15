const Reports = {
  render(container) {
    container.innerHTML = `
      <div class="page-header"><h2>Reportes</h2></div>
      <div class="card mb-3">
        <div class="card-body">
          <div class="filter-bar">
            <div><label class="form-label" style="font-size:12px">Fecha Inicio</label><input type="date" class="form-control" id="repStart"></div>
            <div><label class="form-label" style="font-size:12px">Fecha Fin</label><input type="date" class="form-control" id="repEnd"></div>
            <div><label class="form-label" style="font-size:12px">Tipo</label>
              <select class="form-select" id="repType">
                <option value="all">Todos</option>
                <option value="income">Solo Ingresos</option>
                <option value="expenses">Solo Gastos</option>
              </select>
            </div>
            <div style="display:flex;align-items:end;gap:8px">
              <button class="btn btn-primary" onclick="Reports.loadReport()"><i class="bi bi-search"></i> Filtrar</button>
              <button class="btn btn-outline-danger" onclick="Reports.exportPDF()"><i class="bi bi-filetype-pdf"></i> PDF</button>
              <button class="btn btn-outline-success" onclick="Reports.exportExcel()"><i class="bi bi-file-earmark-excel"></i> Excel</button>
            </div>
          </div>
        </div>
      </div>
      <div class="row g-3 mb-3">
        <div class="col-md-4"><div class="card"><div class="card-body text-center"><small class="text-muted">Total Ingresos</small><h3 class="text-success mb-0" id="repTotalIncome">$0</h3></div></div></div>
        <div class="col-md-4"><div class="card"><div class="card-body text-center"><small class="text-muted">Total Gastos</small><h3 class="text-danger mb-0" id="repTotalExpenses">$0</h3></div></div></div>
        <div class="col-md-4"><div class="card"><div class="card-body text-center"><small class="text-muted">Balance</small><h3 class="mb-0" id="repBalance">$0</h3></div></div></div>
      </div>
      <div class="row g-3 mb-3">
        <div class="col-md-6"><div class="card"><div class="card-header">Ingresos</div><div class="card-body p-0"><div class="table-container"><table class="table table-sm mb-0"><thead><tr><th>Fecha</th><th>Estudiante</th><th>Concepto</th><th>Monto</th><th>Método</th></tr></thead><tbody id="repIncomeBody"></tbody></table></div></div></div></div>
        <div class="col-md-6"><div class="card"><div class="card-header">Gastos</div><div class="card-body p-0"><div class="table-container"><table class="table table-sm mb-0"><thead><tr><th>Fecha</th><th>Concepto</th><th>Categoría</th><th>Monto</th></tr></thead><tbody id="repExpensesBody"></tbody></table></div></div></div></div>
      </div>
      <div class="row g-3">
        <div class="col-md-6"><div class="card"><div class="card-header">Ingresos por Concepto</div><div class="card-body"><div class="chart-container"><canvas id="repChartIncome"></canvas></div></div></div></div>
        <div class="col-md-6"><div class="card"><div class="card-header">Gastos por Categoría</div><div class="card-body"><div class="chart-container"><canvas id="repChartExpenses"></canvas></div></div></div></div>
      </div>
    `;
    const today = new Date();
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
    document.getElementById('repStart').value = firstDay.toISOString().split('T')[0];
    document.getElementById('repEnd').value = today.toISOString().split('T')[0];
    this.loadReport();
  },

  loadReport() {
    const start = document.getElementById('repStart').value;
    const end = document.getElementById('repEnd').value;
    const type = document.getElementById('repType').value;
    let params = '';
    if (start && end) params = '?start=' + start + '&end=' + end;
    API.getReportRange(params).then(r => {
      document.getElementById('repTotalIncome').textContent = App.formatCurrency(r.totalIncome);
      document.getElementById('repTotalExpenses').textContent = App.formatCurrency(r.totalExpenses);
      const bal = document.getElementById('repBalance');
      bal.textContent = App.formatCurrency(r.balance);
      bal.style.color = r.balance >= 0 ? '#2e7d32' : '#c62828';

      const incomeBody = document.getElementById('repIncomeBody');
      if (type === 'all' || type === 'income') {
        if (r.income.length === 0) {
          incomeBody.innerHTML = '<tr><td colspan="5" class="text-center text-muted py-3">Sin ingresos en este período</td></tr>';
        } else {
          incomeBody.innerHTML = r.income.map(p => `<tr><td>${App.formatDate(p.payment_date)}</td><td>${p.student_name}</td><td><span class="badge-concept" style="background:#e8f5e9;color:#2e7d32">${p.concept}</span></td><td>${App.formatCurrency(p.amount)}</td><td>${p.payment_method}</td></tr>`).join('');
        }
      } else {
        incomeBody.innerHTML = '<tr><td colspan="5" class="text-center text-muted py-3">Filtrado solo gastos</td></tr>';
      }

      const expensesBody = document.getElementById('repExpensesBody');
      if (type === 'all' || type === 'expenses') {
        if (r.expenses.length === 0) {
          expensesBody.innerHTML = '<tr><td colspan="4" class="text-center text-muted py-3">Sin gastos en este período</td></tr>';
        } else {
          expensesBody.innerHTML = r.expenses.map(e => `<tr><td>${App.formatDate(e.expense_date)}</td><td>${e.concept}</td><td>${e.category}</td><td>${App.formatCurrency(e.amount)}</td></tr>`).join('');
        }
      } else {
        expensesBody.innerHTML = '<tr><td colspan="4" class="text-center text-muted py-3">Filtrado solo ingresos</td></tr>';
      }

      setTimeout(() => {
        const incomeData = (type === 'all' || type === 'income') ? Reports.aggregateBy(r.income, 'concept') : [];
        const expenseData = (type === 'all' || type === 'expenses') ? Reports.aggregateBy(r.expenses, 'category') : [];

        if (incomeData.length) {
          new Chart(document.getElementById('repChartIncome'), {
            type: 'pie',
            data: {
              labels: incomeData.map(i => i.label),
              datasets: [{ data: incomeData.map(i => i.value), backgroundColor: ['#2e7d32','#1565c0','#f57c00','#6a1b9a','#00838f','#d81b60','#546e7a','#c62828'] }]
            },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { font: { size: 11 } } } } }
          });
        }
        if (expenseData.length) {
          new Chart(document.getElementById('repChartExpenses'), {
            type: 'pie',
            data: {
              labels: expenseData.map(e => e.label),
              datasets: [{ data: expenseData.map(e => e.value), backgroundColor: ['#c62828','#1565c0','#f57c00','#2e7d32','#6a1b9a','#00838f','#d81b60','#546e7a'] }]
            },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { font: { size: 11 } } } } }
          });
        }
      }, 200);
    }).catch(e => App.toast(e.message, 'error'));
  },

  aggregateBy(items, key) {
    const map = {};
    items.forEach(item => {
      const k = item[key];
      map[k] = (map[k] || 0) + item.amount;
    });
    return Object.entries(map).map(([label, value]) => ({ label, value }));
  },

  exportPDF() {
    const start = document.getElementById('repStart').value;
    const end = document.getElementById('repEnd').value;
    let params = '';
    if (start && end) params = '?start=' + start + '&end=' + end;
    API.exportPDF(params);
  },

  exportExcel() {
    const start = document.getElementById('repStart').value;
    const end = document.getElementById('repEnd').value;
    let params = '';
    if (start && end) params = '?start=' + start + '&end=' + end;
    API.exportExcel(params);
  }
};
